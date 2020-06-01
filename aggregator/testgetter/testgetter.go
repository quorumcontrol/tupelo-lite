package testgetter

import (
	"context"
	"fmt"
	"testing"

	"github.com/ipfs/go-cid"
	"github.com/quorumcontrol/chaintree/chaintree"
	"github.com/quorumcontrol/chaintree/dag"
	"github.com/quorumcontrol/chaintree/graftabledag"
	"github.com/quorumcontrol/chaintree/nodestore"
	"github.com/quorumcontrol/chaintree/safewrap"
	"github.com/quorumcontrol/messages/v2/build/go/transactions"
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

func NewChaintreeWithNodes(t testing.TB, ctx context.Context, name string, treeNodes map[string]interface{}) *chaintree.ChainTree {
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

func NewChaintree(t testing.TB, ctx context.Context, name string) *chaintree.ChainTree {
	return NewChaintreeWithNodes(t, ctx, name, map[string]interface{}{})
}

func NewChaintreeOwnedBy(t testing.TB, ctx context.Context, name string, owners []string) *chaintree.ChainTree {
	return NewChaintreeWithNodes(t, ctx, name, map[string]interface{}{
		"_tupelo": map[string]interface{}{
			"authentications": owners,
		},
	})
}

func NewDagGetter(t testing.TB, ctx context.Context, chaintrees ...*chaintree.ChainTree) *TestDagGetter {
	dagGetter := &TestDagGetter{
		chaintrees: make(map[string]*chaintree.ChainTree),
	}

	for _, ct := range chaintrees {
		fmt.Println("ct: ", ct)
		did, err := ct.Id(ctx)
		require.Nil(t, err)
		dagGetter.chaintrees[did] = ct
	}

	return dagGetter
}
