package identity

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ipfs/go-cid"
	"github.com/quorumcontrol/chaintree/chaintree"
	"github.com/quorumcontrol/chaintree/dag"
	"github.com/quorumcontrol/chaintree/graftabledag"
	"github.com/quorumcontrol/chaintree/nodestore"
	"github.com/quorumcontrol/chaintree/safewrap"
	"github.com/quorumcontrol/messages/v2/build/go/transactions"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type TestDagGetter struct {
	chaintrees map[string]*chaintree.ChainTree
}

var _ graftabledag.DagGetter = (*TestDagGetter)(nil)

func (tdg *TestDagGetter) GetTip(_ context.Context, did string) (*cid.Cid, error) {
	if ct, ok := tdg.chaintrees[did]; ok {
		return &ct.Dag.Tip, nil
	}

	return nil, chaintree.ErrTipNotFound
}

func (tdg *TestDagGetter) GetLatest(_ context.Context, did string) (*chaintree.ChainTree, error) {
	if ct, ok := tdg.chaintrees[did]; ok {
		return ct, nil
	}

	return nil, fmt.Errorf("no chaintree found for %s, trees: %v", did, tdg.chaintrees)
}

func newChaintreeWithNodes(t *testing.T, ctx context.Context, name string, treeNodes map[string]interface{}) *chaintree.ChainTree {
	sw := &safewrap.SafeWrap{}

	treeMap := map[string]interface{}{
		"hithere": "hothere",
	}

	for k, v := range treeNodes {
		treeMap[k] = v
	}

	tree := sw.WrapObject(treeMap)

	chain := sw.WrapObject(make(map[string]string))

	root := sw.WrapObject(map[string]interface{}{
		"chain": chain.Cid(),
		"tree":  tree.Cid(),
		"id":    "did:tupelo:" + name,
	})

	store := nodestore.MustMemoryStore(ctx)
	ctDag, err := dag.NewDagWithNodes(ctx, store, root, tree, chain)
	require.Nil(t, err)
	chainTree, err := chaintree.NewChainTree(
		ctx,
		ctDag,
		[]chaintree.BlockValidatorFunc{},
		map[transactions.Transaction_Type]chaintree.TransactorFunc{},
	)
	require.Nil(t, err)

	return chainTree
}

func newChaintree(t *testing.T, ctx context.Context, name string) *chaintree.ChainTree {
	return newChaintreeWithNodes(t, ctx, name, map[string]interface{}{})
}

func newChaintreeOwnedBy(t *testing.T, ctx context.Context, name string, owners []string) *chaintree.ChainTree {
	return newChaintreeWithNodes(t, ctx, name, map[string]interface{}{
		"_tupelo": map[string]interface{}{
			"authentications": owners,
		},
	})
}

func newDagGetter(t *testing.T, ctx context.Context, chaintrees ...*chaintree.ChainTree) *TestDagGetter {
	dagGetter := &TestDagGetter{
		chaintrees: make(map[string]*chaintree.ChainTree),
	}

	for _, ct := range chaintrees {
		did, err := ct.Id(ctx)
		require.Nil(t, err)
		dagGetter.chaintrees[did] = ct
	}

	return dagGetter
}

func TestToString(t *testing.T) {
	key, err := crypto.GenerateKey()
	require.Nil(t, err)

	ident, err := (&Identity{
		Iss: "did:justatest",
		Exp: time.Now().UTC().Unix() + 5000,
	}).Sign(key)
	require.Nil(t, err)

	str := ident.String()
	require.Nil(t, err)
	require.Len(t, str, 160)
}

func TestVerify(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	key, err := crypto.GenerateKey()
	require.Nil(t, err)
	addr := crypto.PubkeyToAddress(key.PublicKey).String()
	did := "did:tupelo:" + addr
	ident, err := (&Identity{
		Iss: did,
		Sub: did,
		Exp: time.Now().UTC().Unix() + 5000,
	}).Sign(key)
	require.Nil(t, err)

	tree := newChaintreeOwnedBy(t, ctx, addr, []string{addr})
	getter := newDagGetter(t, ctx, tree)

	verified, err := ident.Verify(ctx, getter)
	require.Nil(t, err)
	require.True(t, verified)

	// it fails when the tree isn't owned by the signer
	tree2 := newChaintreeOwnedBy(t, ctx, addr, []string{})
	getter2 := newDagGetter(t, ctx, tree2)

	verified2, err := ident.Verify(ctx, getter2)
	require.Nil(t, err)
	require.False(t, verified2)
}

func TestAddress(t *testing.T) {
	key, err := crypto.GenerateKey()
	require.Nil(t, err)

	ident, err := (&Identity{
		Iss: "did:justatest",
		Exp: time.Now().UTC().Unix() + 5000,
	}).Sign(key)
	require.Nil(t, err)

	expected := crypto.PubkeyToAddress(key.PublicKey).String()
	addr, err := ident.Address()
	require.Nil(t, err)
	assert.Equal(t, expected, addr)
}

func TestFromString(t *testing.T) {
	key, err := crypto.GenerateKey()
	require.Nil(t, err)

	ident, err := (&Identity{
		Iss: "did:justatest",
		Exp: time.Now().UTC().Unix() + 5000,
	}).Sign(key)
	require.Nil(t, err)

	str := ident.String()
	require.Nil(t, err)

	newIdent, err := FromString(str)
	require.Nil(t, err)
	require.Equal(t, ident.Identity.Iss, newIdent.Identity.Iss)
}
