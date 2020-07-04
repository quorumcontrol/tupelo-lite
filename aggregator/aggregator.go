package aggregator

import (
	"bytes"
	"context"
	"fmt"
	"strings"

	"github.com/ipfs/go-cid"
	"github.com/ipfs/go-datastore"
	cbornode "github.com/ipfs/go-ipld-cbor"
	format "github.com/ipfs/go-ipld-format"
	logging "github.com/ipfs/go-log"
	"github.com/open-policy-agent/opa/rego"

	"github.com/quorumcontrol/chaintree/chaintree"
	"github.com/quorumcontrol/chaintree/dag"
	"github.com/quorumcontrol/chaintree/graftabledag"
	"github.com/quorumcontrol/chaintree/nodestore"
	"github.com/quorumcontrol/chaintree/safewrap"
	"github.com/quorumcontrol/messages/v2/build/go/services"
	"github.com/quorumcontrol/tupelo-lite/aggregator/identity"
	"github.com/quorumcontrol/tupelo-lite/aggregator/policy"
	"github.com/quorumcontrol/tupelo/sdk/gossip/types"
	"github.com/quorumcontrol/tupelo/sdk/reftracking"
	"github.com/quorumcontrol/tupelo/signer/gossip"
)

var logger = logging.Logger("aggregator")
var ErrNotFound = datastore.ErrNotFound
var ErrInvalidBlock = fmt.Errorf("InvalidBlock")
var CacheSize = 100

// type DagGetter interface {
// 	GetTip(ctx context.Context, did string) (*cid.Cid, error)
// 	GetLatest(ctx context.Context, did string) (*chaintree.ChainTree, error)
// }
// assert fulfills the interface at compile time
var _ graftabledag.DagGetter = (*Aggregator)(nil)

// // UpdateChan is a stream of updates from the aggregator,
// // passed in from the config (optinally) it's used to
// // send updates to other parts of the system (for instance, publishing on a message queue)
// type UpdateChan chan *gossip.AddBlockWrapper

// implemented as a callback to make lambda operation sync and easy
// implement your own channel sender if you'd prefer async
type UpdateFunc func(*gossip.AddBlockWrapper)

type AddResponse struct {
	IsValid  bool
	NewTip   cid.Cid
	NewNodes []format.Node
	Wrapper  *gossip.AddBlockWrapper
}

type ResolveResponse struct {
	RemainingPath []string
	Value         interface{}
	TouchedBlocks []format.Node
}

type Aggregator struct {
	nodestore.DagStore

	validator     *gossip.TransactionValidator
	keyValueStore datastore.Batching
	group         *types.NotaryGroup
	updateFunc    UpdateFunc

	configDid  string
	configTree *chaintree.ChainTree

	globalWritePolicy *rego.PreparedEvalQuery
	hasWriteWants     bool
	globalReadPolicy  *rego.PreparedEvalQuery
	hasReadWants      bool
}

// AggregatorConfig is used to configure a new Aggregator
type AggregatorConfig struct {
	KeyValueStore datastore.Batching
	Group         *types.NotaryGroup
	UpdateFunc    UpdateFunc

	ConfigTree string // DID
}

func NewAggregator(ctx context.Context, config *AggregatorConfig) (*Aggregator, error) {
	validator, err := gossip.NewTransactionValidator(ctx, logger, config.Group, nil) // nil is the actor pid
	if err != nil {
		return nil, err
	}
	dagStore, err := nodestore.FromDatastoreOfflineCached(ctx, config.KeyValueStore, CacheSize)
	if err != nil {
		return nil, err
	}
	a := &Aggregator{
		keyValueStore: config.KeyValueStore,
		DagStore:      dagStore,
		validator:     validator,
		group:         config.Group,
		updateFunc:    config.UpdateFunc,
		configDid:     config.ConfigTree,
	}
	if a.configDid != "" {
		err = a.setupConfigTree(ctx)
		return a, err
	}
	return a, nil
}

func (a *Aggregator) setupConfigTree(ctx context.Context) error {
	if a.configDid == "" {
		return nil
	}
	tree, err := a.GetLatest(ctx, a.configDid)
	if err != nil {
		if err == datastore.ErrNotFound {
			return nil // allow a not-found key
		}
		return fmt.Errorf("error getting tree: %w", err)
	}
	a.configTree = tree

	writePolicy, hasWriteWants, err := policy.PolicyFromTree(ctx, "main", "wants", a, tree.Dag)
	if err != nil {
		return fmt.Errorf("error getting write policy: %w", err)
	}
	a.globalWritePolicy = writePolicy
	a.hasWriteWants = hasWriteWants

	readPolicy, hasReadWants, err := policy.PolicyFromTree(ctx, "read", "readWants", a, tree.Dag)
	if err != nil {
		return fmt.Errorf("error getting read policy: %w", err)
	}
	a.globalReadPolicy = readPolicy
	a.hasReadWants = hasReadWants

	return nil
}

func (a *Aggregator) GetTip(ctx context.Context, objectID string) (*cid.Cid, error) {
	curr, err := a.keyValueStore.Get(datastore.NewKey(objectID))
	if err != nil {
		if err == ErrNotFound {
			return nil, err
		}
		return nil, fmt.Errorf("error getting latest: %v", err)
	}
	tip, err := cid.Cast(curr)
	if err != nil {
		return nil, fmt.Errorf("error casting tip %w", err)
	}
	logger.Debugf("GetTip %s: %s", objectID, tip.String())
	return &tip, nil
}

func (a *Aggregator) ResolveWithReadControls(ctx context.Context, id *identity.Identity, objectID string, path []string) (*ResolveResponse, error) {
	latest, err := a.GetLatest(ctx, objectID)

	if err == ErrNotFound {
		logger.Debugf("resolve %s not found", objectID)
		return &ResolveResponse{
			RemainingPath: path,
		}, nil
	}
	if err != nil {
		logger.Errorf("error getting latest %s %v", objectID, err)
		return nil, fmt.Errorf("error getting latest: %w", err)
	}
	globalValid, err := a.evaluateGlobalReadPolicy(ctx, id, objectID, path)
	if err != nil {
		return nil, fmt.Errorf("error validating: %w", err)
	}

	logger.Debugf("globalReadValidator: %v", globalValid)
	if !globalValid {
		// if not valid then just return as if it was not found
		return &ResolveResponse{
			RemainingPath: path,
		}, nil
	}

	valid, err := policy.ReadValidator(ctx, latest.Dag, a, &policy.ReadInput{
		Method:   "GET",
		Object:   objectID,
		Path:     strings.Join(path, "/"),
		Identity: id,
	})
	if err != nil {
		return nil, fmt.Errorf("error validating: %w", err)
	}
	logger.Debugf("readValidator: %v", valid)
	if !valid {
		// if not valid then just return as if it was not found
		return &ResolveResponse{
			RemainingPath: path,
		}, nil
	}

	trackedTree, tracker, err := reftracking.WrapTree(ctx, latest)
	if err != nil {
		return nil, fmt.Errorf("error creating reference tracker: %v", err)
	}

	val, remain, err := trackedTree.Dag.Resolve(ctx, path)
	if err != nil {
		logger.Errorf("error resolving %s %v", objectID, err)
		return nil, fmt.Errorf("error resolving: %v", err)
	}

	// Grab the nodes that were actually used:
	touchedNodes, err := tracker.TouchedNodes(ctx)
	if err != nil {
		return nil, fmt.Errorf("error getting touched nodes: %w", err)
	}

	return &ResolveResponse{
		Value:         val,
		RemainingPath: remain,
		TouchedBlocks: touchedNodes,
	}, nil
}

func (a *Aggregator) GetLatest(ctx context.Context, objectID string) (*chaintree.ChainTree, error) {
	tip, err := a.GetTip(ctx, objectID)
	if err != nil {
		if err == ErrNotFound {
			return nil, err
		}
		return nil, fmt.Errorf("error getting tip: %w", err)
	}
	logger.Debugf("GetLatest %s: %s", objectID, tip.String())

	validators, err := a.group.BlockValidators(ctx)
	if err != nil {
		return nil, fmt.Errorf("error getting validators: %w", err)
	}

	dag := dag.NewDag(ctx, *tip, a.DagStore)
	tree, err := chaintree.NewChainTree(ctx, dag, validators, a.group.Config().Transactions)
	if err != nil {
		return nil, fmt.Errorf("error creating tree: %w", err)
	}

	return tree, nil
}

func abrToBlockInput(abr *services.AddBlockRequest) (policy.PolicyInputMap, error) {
	block := &chaintree.BlockWithHeaders{}
	err := cbornode.DecodeInto(abr.Payload, block)
	if err != nil {
		return nil, fmt.Errorf("invalid transaction: payload is not a block: %w", err)
	}
	return policy.BlockToInputMap(block)
}

func (a *Aggregator) Add(ctx context.Context, abr *services.AddBlockRequest) (*AddResponse, error) {
	logger.Debugf("add %s %d", string(abr.ObjectId), abr.Height)
	wrapper := &gossip.AddBlockWrapper{
		AddBlockRequest: abr,
	}

	valid, err := a.evaluateGlobalWritePolicy(ctx, abr)
	if !valid {
		return &AddResponse{
			NewTip:   cid.Undef,
			IsValid:  false,
			NewNodes: nil,
			Wrapper:  wrapper,
		}, nil
	}

	newTip, isValid, newNodes, err := a.validator.ValidateAbr(wrapper)
	if !isValid {
		return nil, ErrInvalidBlock
	}
	if err != nil {
		return nil, fmt.Errorf("invalid ABR: %w", err)
	}
	wrapper.AddBlockRequest.NewTip = newTip.Bytes()
	wrapper.NewNodes = newNodes

	did := string(abr.ObjectId)

	curr, err := a.GetTip(ctx, did)
	if err != nil && err != ErrNotFound {
		logger.Errorf("error getting tip: %w", err)
		return nil, fmt.Errorf("error getting tip: %w", err)
	}

	if curr != nil && !bytes.Equal(curr.Bytes(), abr.PreviousTip) {
		logger.Debugf("non matching tips: %w", err)
		return nil, fmt.Errorf("previous tip did not match existing tip: %s", curr.String())
	}

	logger.Infof("storing %s (height: %d) new tip: %s", did, abr.Height, newTip.String())
	a.storeState(ctx, wrapper)
	err = a.keyValueStore.Put(datastore.NewKey(did), newTip.Bytes())
	if err != nil {
		return nil, fmt.Errorf("error putting key: %w", err)
	}

	if string(abr.ObjectId) == a.configDid {
		err = a.setupConfigTree(ctx)
		if err != nil {
			return nil, fmt.Errorf("error setting up policies: %w", err)
		}
	}

	if a.updateFunc != nil {
		a.updateFunc(wrapper)
	}

	return &AddResponse{
		NewTip:   newTip,
		IsValid:  isValid,
		NewNodes: newNodes,
		Wrapper:  wrapper,
	}, nil
}

func (a *Aggregator) storeState(ctx context.Context, wrapper *gossip.AddBlockWrapper) error {
	sw := safewrap.SafeWrap{}
	var stateNodes []format.Node
	abr := wrapper.AddBlockRequest

	for _, nodeBytes := range abr.State {
		stateNode := sw.Decode(nodeBytes)

		stateNodes = append(stateNodes, stateNode)
	}

	if sw.Err != nil {
		logger.Errorf("error decoding abr state: %v", sw.Err)
		return fmt.Errorf("error decoding: %w", sw.Err)
	}

	err := a.DagStore.AddMany(ctx, append(stateNodes, wrapper.NewNodes...))
	if err != nil {
		logger.Errorf("error storing abr state: %v", err)
		return fmt.Errorf("error adding: %w", err)
	}

	return nil
}

func (a *Aggregator) evaluateGlobalWritePolicy(ctx context.Context, abr *services.AddBlockRequest) (bool, error) {
	if a.globalWritePolicy != nil {
		inputMap, err := abrToBlockInput(abr)
		if err != nil {
			return false, fmt.Errorf("error converting abr to input: %w", err)
		}
		valid, err := policy.PolicyValidator(ctx, *a.globalWritePolicy, a.configTree.Dag, a, a.hasWriteWants, inputMap)
		if err != nil {
			return false, fmt.Errorf("error validating: %w", err)
		}
		return valid, err
	}
	return true, nil
}

func (a *Aggregator) evaluateGlobalReadPolicy(ctx context.Context, id *identity.Identity, objectID string, path []string) (bool, error) {
	if a.globalReadPolicy != nil {
		inputMap, err := (&policy.ReadInput{
			Method:   "GET",
			Identity: id,
			Object:   objectID,
			Path:     strings.Join(path, "/"),
		}).ToInputMap()
		if err != nil {
			return false, fmt.Errorf("error getting input: %w", err)
		}

		isValid, err := policy.PolicyValidator(ctx, *a.globalReadPolicy, a.configTree.Dag, a, a.hasReadWants, inputMap)
		return isValid, err
	}
	return true, nil
}
