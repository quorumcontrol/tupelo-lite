package policy

import (
	"context"
	"testing"

	"github.com/ethereum/go-ethereum/crypto"
	"github.com/quorumcontrol/chaintree/nodestore"
	"github.com/quorumcontrol/tupelo-lite/aggregator/identity"
	"github.com/quorumcontrol/tupelo/sdk/consensus"
	"github.com/stretchr/testify/require"
)

func TestBasicReadPolicy(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	store := nodestore.MustMemoryStore(ctx)

	policies := map[string]string{
		"read": `
			package read
			default allow = false

			allow {
				not input.path == "/tree/data/locked"
			}
		`,
	}

	treeKey, err := crypto.GenerateKey()
	require.Nil(t, err)
	did := consensus.EcdsaPubkeyToDid(treeKey.PublicKey)

	tree, err := consensus.NewEmptyTree(ctx, did, store).SetAsLink(ctx, []string{"tree", "data", ".wellKnown", "policies"}, policies)
	require.Nil(t, err)

	id := &identity.Identity{
		Sub: "doesnotmatterforthistest",
	}

	valid, err := ReadValidator(ctx, tree, "/tree/data", id)
	require.Nil(t, err)
	require.True(t, valid)

	valid, err = ReadValidator(ctx, tree, "/tree/data/locked", id)
	require.Nil(t, err)
	require.False(t, valid)

	// test it works with a nil identity

	valid, err = ReadValidator(ctx, tree, "/tree/data", nil)
	require.Nil(t, err)
	require.True(t, valid)
}
