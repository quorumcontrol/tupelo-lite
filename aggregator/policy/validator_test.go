package policy

import (
	"context"
	"testing"

	"github.com/ethereum/go-ethereum/crypto"
	cbornode "github.com/ipfs/go-ipld-cbor"
	"github.com/quorumcontrol/chaintree/chaintree"
	"github.com/quorumcontrol/chaintree/nodestore"
	"github.com/quorumcontrol/messages/v2/build/go/services"
	"github.com/quorumcontrol/tupelo/sdk/consensus"
	"github.com/quorumcontrol/tupelo/sdk/gossip/testhelpers"
	"github.com/stretchr/testify/require"
)

func blockWithHeadersFromAbr(abr *services.AddBlockRequest) (*chaintree.BlockWithHeaders, error) {
	block := &chaintree.BlockWithHeaders{}
	err := cbornode.DecodeInto(abr.Payload, block)
	return block, err
}

func TestPolicy(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	store := nodestore.MustMemoryStore(ctx)

	policies := map[string]string{
		"tupelo.nopolicychange": NoPolicyChange,
		"main": `
			package main
			default allow = false

			allow {
				data.tupelo.nopolicychange.allow
			}
		`,
	}

	treeKey, err := crypto.GenerateKey()
	require.Nil(t, err)
	did := consensus.EcdsaPubkeyToDid(treeKey.PublicKey)

	tree, err := consensus.NewEmptyTree(ctx, did, store).SetAsLink(ctx, []string{"tree", "data", ".wellKnown", "policies"}, policies)
	require.Nil(t, err)
	t.Run("works with a non-policy path", func(t *testing.T) {
		abr := testhelpers.NewValidTransactionWithPathAndValue(t, treeKey, "a/different/path", "value")
		block, err := blockWithHeadersFromAbr(&abr)
		require.Nil(t, err)
		valid, err := PolicyValidator(tree, block)
		require.Nil(t, err)
		require.True(t, valid)
	})

	t.Run("returns false when there's a policy in the path", func(t *testing.T) {
		abr := testhelpers.NewValidTransactionWithPathAndValue(t, treeKey, ".wellKnown/policies", "value")
		block, err := blockWithHeadersFromAbr(&abr)
		require.Nil(t, err)
		valid, err := PolicyValidator(tree, block)
		require.Nil(t, err)
		require.False(t, valid)
	})

}
