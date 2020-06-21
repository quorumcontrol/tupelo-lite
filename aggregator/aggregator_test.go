package aggregator

import (
	"context"
	"crypto/ecdsa"
	"testing"

	"github.com/ethereum/go-ethereum/crypto"
	"github.com/quorumcontrol/chaintree/chaintree"
	"github.com/quorumcontrol/chaintree/nodestore"
	"github.com/quorumcontrol/chaintree/safewrap"
	"github.com/quorumcontrol/messages/v2/build/go/services"
	"github.com/quorumcontrol/messages/v2/build/go/transactions"
	"github.com/quorumcontrol/tupelo/sdk/consensus"
	"github.com/quorumcontrol/tupelo/sdk/gossip/testhelpers"
	"github.com/quorumcontrol/tupelo/sdk/gossip/types"
	"github.com/quorumcontrol/tupelo/signer/gossip"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewAggregator(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ng := types.NewNotaryGroup("testnotary")

	_, err := NewAggregator(ctx, &AggregatorConfig{KeyValueStore: NewMemoryStore(), Group: ng})
	require.Nil(t, err)
}

func TestPublishingNewAbrs(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	ng := types.NewNotaryGroup("testnotary")

	updateChan := make(chan *gossip.AddBlockWrapper, 1)

	agg, err := NewAggregator(ctx, &AggregatorConfig{
		KeyValueStore: NewMemoryStore(),
		Group:         ng,
		UpdateFunc: func(wrap *gossip.AddBlockWrapper) {
			updateChan <- wrap
		},
	})
	require.Nil(t, err)

	abr := testhelpers.NewValidTransaction(t)

	_, err = agg.Add(ctx, &abr)
	require.Nil(t, err)

	resp := <-updateChan
	require.Equal(t, resp.GetNewTip(), abr.NewTip)
}

func TestAddingAbrs(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	ng := types.NewNotaryGroup("testnotary")

	agg, err := NewAggregator(ctx, &AggregatorConfig{KeyValueStore: NewMemoryStore(), Group: ng})
	require.Nil(t, err)

	t.Run("new ABR, no existing works", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		abr := testhelpers.NewValidTransaction(t)

		_, err := agg.Add(ctx, &abr)
		require.Nil(t, err)
	})

	t.Run("conflicting ABR errors", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		treeKey, err := crypto.GenerateKey()
		require.Nil(t, err)

		abr1 := testhelpers.NewValidTransactionWithPathAndValue(t, treeKey, "/path", "value")
		abr2 := testhelpers.NewValidTransactionWithPathAndValue(t, treeKey, "/path", "differentvalue")

		_, err = agg.Add(ctx, &abr1)
		require.Nil(t, err)
		_, err = agg.Add(ctx, &abr2)
		require.NotNil(t, err)
	})
}

func TestGetLatest(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	ng := types.NewNotaryGroup("testnotary")

	agg, err := NewAggregator(ctx, &AggregatorConfig{KeyValueStore: NewMemoryStore(), Group: ng})
	require.Nil(t, err)

	t.Run("saves state", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		treeKey, err := crypto.GenerateKey()
		require.Nil(t, err)

		abr1 := testhelpers.NewValidTransactionWithPathAndValue(t, treeKey, "/path", "value")
		_, err = agg.Add(ctx, &abr1)
		require.Nil(t, err)

		tree, err := agg.GetLatest(ctx, string(abr1.ObjectId))
		require.Nil(t, err)

		resp, remain, err := tree.Dag.Resolve(ctx, []string{"tree", "data", "path"})
		require.Nil(t, err)
		assert.Len(t, remain, 0)
		assert.Equal(t, "value", resp)
	})
}

func TestGlobalPolicies(t *testing.T) {

	ng := types.NewNotaryGroup("testnotary")

	t.Run("works when did does not yet exist", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		config := &AggregatorConfig{
			KeyValueStore: NewMemoryStore(),
			Group:         ng,
			ConfigTree:    "did:tupelo:doesnotyetexist",
		}

		_, err := NewAggregator(ctx, config)
		require.Nil(t, err)
	})

	t.Run("installs new global policy on tree updates", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		treeKey, err := crypto.GenerateKey()
		require.Nil(t, err)
		did := consensus.EcdsaPubkeyToDid(treeKey.PublicKey)

		config := &AggregatorConfig{
			KeyValueStore: NewMemoryStore(),
			Group:         ng,
			ConfigTree:    did,
		}

		agg, err := NewAggregator(ctx, config)

		policies := map[string]string{
			"main": `
				package main
				default allow = true
	
				allow = false {
					contains(input.transactions[_].setDataPayload.path, "in-this-house-we-do-not-use-this")
				}
			`,
		}

		abr1 := NewValidTransactionWithPathAndValue(t, treeKey, ".well-known/policies", policies)
		_, err = agg.Add(ctx, &abr1)
		require.Nil(t, err)

		require.NotNil(t, agg.globalWritePolicy)

		// now test that policy is enforced
		treeKey2, err := crypto.GenerateKey()
		require.Nil(t, err)

		abr2 := NewValidTransactionWithPathAndValue(t, treeKey2, "in-this-house-we-do-not-use-this", "this should never set")
		resp, err := agg.Add(ctx, &abr2)
		require.Nil(t, err)
		require.False(t, resp.IsValid)
	})

}

func NewValidTransactionWithPathAndValue(t testing.TB, treeKey *ecdsa.PrivateKey, path string, value interface{}) services.AddBlockRequest {
	ctx := context.TODO()
	sw := safewrap.SafeWrap{}

	txn, err := chaintree.NewSetDataTransaction(path, value)
	require.Nil(t, err)

	unsignedBlock := chaintree.BlockWithHeaders{
		Block: chaintree.Block{
			PreviousTip:  nil,
			Height:       0,
			Transactions: []*transactions.Transaction{txn},
		},
	}

	treeDID := consensus.AddrToDid(crypto.PubkeyToAddress(treeKey.PublicKey).String())

	nodeStore := nodestore.MustMemoryStore(ctx)
	emptyTree := consensus.NewEmptyTree(ctx, treeDID, nodeStore)
	emptyTip := emptyTree.Tip
	testTree, err := chaintree.NewChainTree(ctx, emptyTree, nil, consensus.DefaultTransactors)
	require.Nil(t, err)

	blockWithHeaders, err := consensus.SignBlock(ctx, &unsignedBlock, treeKey)
	require.Nil(t, err)

	_, err = testTree.ProcessBlock(ctx, blockWithHeaders)
	require.Nil(t, err)
	nodes := testhelpers.DagToByteNodes(t, testTree.Dag)

	bits := sw.WrapObject(blockWithHeaders).RawData()
	require.Nil(t, sw.Err)

	return services.AddBlockRequest{
		PreviousTip: emptyTip.Bytes(),
		Height:      blockWithHeaders.Height,
		NewTip:      testTree.Dag.Tip.Bytes(),
		Payload:     bits,
		State:       nodes,
		ObjectId:    []byte(treeDID),
	}
}

// BenchmarkSimplePolicy-12    	  112168	     10746 ns/op	    3860 B/op	      95 allocs/op
func BenchmarkSimplePolicy(b *testing.B) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	ng := types.NewNotaryGroup("testnotary")

	agg, err := NewAggregator(ctx, &AggregatorConfig{KeyValueStore: NewMemoryStore(), Group: ng})
	require.Nil(b, err)

	treeKey, err := crypto.GenerateKey()
	require.Nil(b, err)

	abr1 := testhelpers.NewValidTransactionWithPathAndValue(b, treeKey, "/.well-known/policies/main",
		`package main
		allow = true
	`)
	_, err = agg.Add(ctx, &abr1)
	require.Nil(b, err)

	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		_, err = agg.GetLatest(ctx, string(abr1.ObjectId))
	}
	b.StopTimer()
	require.Nil(b, err)
}

// BenchmarkAdd-12    	    1485	    781765 ns/op	  228452 B/op	    3537 allocs/op
func BenchmarkAdd(b *testing.B) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	ng := types.NewNotaryGroup("testnotary")

	agg, err := NewAggregator(ctx, &AggregatorConfig{KeyValueStore: NewMemoryStore(), Group: ng})
	require.Nil(b, err)

	txs := make([]*services.AddBlockRequest, b.N)
	for i := 0; i < b.N; i++ {
		abr := testhelpers.NewValidTransaction(b)
		txs[i] = &abr
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err = agg.Add(ctx, txs[i])
	}
	b.StopTimer()
	require.Nil(b, err)
}
