package policy

import (
	"context"
	"testing"

	"github.com/ethereum/go-ethereum/crypto"
	"github.com/quorumcontrol/chaintree/nodestore"
	"github.com/quorumcontrol/tupelo-lite/aggregator/identity"
	"github.com/quorumcontrol/tupelo-lite/aggregator/testgetter"
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

	tree, err := consensus.NewEmptyTree(ctx, did, store).SetAsLink(ctx, []string{"tree", "data", ".well-known", "policies"}, policies)
	require.Nil(t, err)

	id := &identity.Identity{
		Sub: "doesnotmatterforthistest",
	}

	valid, err := ReadValidator(ctx, tree, testgetter.NewDagGetter(t, ctx), "/tree/data", id)
	require.Nil(t, err)
	require.True(t, valid)

	valid, err = ReadValidator(ctx, tree, testgetter.NewDagGetter(t, ctx), "/tree/data/locked", id)
	require.Nil(t, err)
	require.False(t, valid)

	// test it works with a nil identity

	valid, err = ReadValidator(ctx, tree, testgetter.NewDagGetter(t, ctx), "/tree/data", nil)
	require.Nil(t, err)
	require.True(t, valid)
}

func TestReadPolicyWithWants(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	store := nodestore.MustMemoryStore(ctx)

	policies := map[string]string{
		"readWants": `
			package readWants
			paths = ["tree/data/somePath"]
		`,
		"read": `
			package read
			default allow = false

			allow {
				input.paths["tree/data/somePath"] == "helloWorld"
			}
		`,
	}

	treeKey, err := crypto.GenerateKey()
	require.Nil(t, err)
	did := consensus.EcdsaPubkeyToDid(treeKey.PublicKey)

	tree, err := consensus.NewEmptyTree(ctx, did, store).SetAsLink(ctx, []string{"tree", "data", ".well-known", "policies"}, policies)
	require.Nil(t, err)

	id := &identity.Identity{
		Sub: "doesnotmatterforthistest",
	}

	// it will not allow a read because the wants aren't fulfilled
	valid, err := ReadValidator(ctx, tree, testgetter.NewDagGetter(t, ctx), "/tree/data", id)
	require.False(t, valid)
	require.Nil(t, err)

	// but if we setup the wants for a pass it works
	treeWithValue, err := tree.SetAsLink(ctx, []string{"tree", "data", "somePath"}, "helloWorld")
	require.Nil(t, err)

	valid, err = ReadValidator(ctx, treeWithValue, testgetter.NewDagGetter(t, ctx), "/tree/data/locked", id)
	require.Nil(t, err)
	require.False(t, valid)
}
