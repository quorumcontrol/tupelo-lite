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

func TestBasicPolicy(t *testing.T) {
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

func TestPolicyWithWants(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	store := nodestore.MustMemoryStore(ctx)

	policies := map[string]string{
		"wants": `
			package wants
			paths = ["tree/data/somePath"]
		`,
		"main": `
			package main
			default allow = false

			allow {
				input.paths["tree/data/somePath"] == "helloWorld"
			}
		`,
	}

	treeKey, err := crypto.GenerateKey()
	require.Nil(t, err)
	did := consensus.EcdsaPubkeyToDid(treeKey.PublicKey)

	tree, err := consensus.NewEmptyTree(ctx, did, store).SetAsLink(ctx, []string{"tree", "data", ".wellKnown", "policies"}, policies)
	require.Nil(t, err)

	// test that the policy is false (but no error) when the path isn't set
	abr := testhelpers.NewValidTransactionWithPathAndValue(t, treeKey, "no-matter", "here")
	block, err := blockWithHeadersFromAbr(&abr)
	require.Nil(t, err)
	valid, err := PolicyValidator(tree, block)
	require.Nil(t, err)
	require.False(t, valid)

	// but as soon as we set the link it works (meaning that the value of the path was passed in)
	treeWithValue, err := tree.SetAsLink(ctx, []string{"tree", "data", "somePath"}, "helloWorld")
	require.Nil(t, err)
	valid, err = PolicyValidator(treeWithValue, block)
	require.Nil(t, err)
	require.True(t, valid)
}

// BenchmarkPolicyExecution-12    	    2108	    544903 ns/op	  258595 B/op	    5108 allocs/op
func BenchmarkPolicyExecution(b *testing.B) {
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
	require.Nil(b, err)
	did := consensus.EcdsaPubkeyToDid(treeKey.PublicKey)

	tree, err := consensus.NewEmptyTree(ctx, did, store).SetAsLink(ctx, []string{"tree", "data", ".wellKnown", "policies"}, policies)
	require.Nil(b, err)

	abr := testhelpers.NewValidTransactionWithPathAndValue(b, treeKey, "a/different/path", "value")
	block, err := blockWithHeadersFromAbr(&abr)
	require.Nil(b, err)

	var valid bool
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		valid, err = PolicyValidator(tree, block)
	}
	b.StopTimer()
	require.Nil(b, err)
	require.True(b, valid)
}
