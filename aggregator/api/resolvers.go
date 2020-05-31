package api

import (
	"context"
	"encoding/base64"
	"fmt"
	"log"
	"strings"

	"github.com/davecgh/go-spew/spew"
	logging "github.com/ipfs/go-log"

	"github.com/graph-gophers/graphql-go"
	"github.com/ipfs/go-datastore"
	format "github.com/ipfs/go-ipld-format"

	"github.com/ipfs/go-cid"
	"github.com/quorumcontrol/messages/v2/build/go/services"
	"github.com/quorumcontrol/tupelo-lite/aggregator"
	"github.com/quorumcontrol/tupelo-lite/aggregator/identity"
	"github.com/quorumcontrol/tupelo-lite/aggregator/policy"
	"github.com/quorumcontrol/tupelo/sdk/gossip/types"
	"github.com/quorumcontrol/tupelo/sdk/reftracking"
)

const IdentityContextKey = "tupelo-lite:identity"

var logger = logging.Logger("resolver")

type Resolver struct {
	Aggregator *aggregator.Aggregator
}

func NewResolver(ctx context.Context, ds datastore.Batching) (*Resolver, error) {
	ng := types.NewNotaryGroup("aggregator")
	agg, err := aggregator.NewAggregator(ctx, ds, ng)
	if err != nil {
		return nil, fmt.Errorf("error creating aggregator: %w", err)
	}
	ng.DagGetter = agg
	return &Resolver{
		Aggregator: agg,
	}, nil
}

type ResolveInput struct {
	Input struct {
		Did  string
		Path string
	}
}

type ResolvePayload struct {
	Value         *JSON
	RemainingPath []string
	TouchedBlocks *[]Block
}

type AddBlockInput struct {
	Input struct {
		AddBlockRequest string //base64
	}
}

type Block struct {
	Data string      `json:"data"`
	Cid  *graphql.ID `json:"cid"`
}

type AddBlockPayload struct {
	Valid     bool
	NewTip    string
	NewBlocks *[]Block
}

func requesterFromCtx(ctx context.Context) *identity.Identity {
	var requester *identity.Identity
	switch identityInter := ctx.Value(IdentityContextKey).(type) {
	case identity.Identity:
		requester = &identityInter
	default:
		logger.Debugf(spew.Sdump(identityInter))
		requester = nil
	}
	return requester
}

func (r *Resolver) Resolve(ctx context.Context, input ResolveInput) (*ResolvePayload, error) {
	requester := requesterFromCtx(ctx)
	logger.Infof("resolving %s %s with requester %v", input.Input.Did, input.Input.Path, requester)
	path := strings.Split(strings.TrimPrefix(input.Input.Path, "/"), "/")

	latest, err := r.Aggregator.GetLatest(ctx, input.Input.Did)
	if err == aggregator.ErrNotFound {
		logger.Debugf("resolve %s not found", input.Input.Did)
		return &ResolvePayload{
			RemainingPath: path,
		}, nil
	}
	if err != nil {
		logger.Errorf("error getting latest %s %v", input.Input.Did, err)
		return nil, fmt.Errorf("error getting latest: %w", err)
	}

	valid, err := policy.ReadValidator(ctx, latest.Dag, strings.Join(path, "/"), requester)
	if err != nil {
		return nil, fmt.Errorf("error validating: %w", err)
	}
	logger.Debugf("readValidator: %v", valid)
	if !valid {
		// if not valid then just return as if it was not found

		return &ResolvePayload{
			RemainingPath: path,
		}, nil
	}

	trackedTree, tracker, err := reftracking.WrapTree(ctx, latest)
	if err != nil {
		return nil, fmt.Errorf("error creating reference tracker: %v", err)
	}

	val, remain, err := trackedTree.Dag.Resolve(ctx, path)
	if err != nil {
		logger.Errorf("error resolving %s %v", input.Input.Did, err)
		return nil, fmt.Errorf("error resolving: %v", err)
	}

	// Grab the nodes that were actually used:
	touchedNodes, err := tracker.TouchedNodes(ctx)
	if err != nil {
		return nil, fmt.Errorf("error getting touched nodes: %w", err)
	}

	blocks := blocksToGraphQLBlocks(touchedNodes)

	return &ResolvePayload{
		RemainingPath: remain,
		Value: &JSON{
			Object: val,
		},
		TouchedBlocks: &blocks,
	}, nil
}

func blocksToGraphQLBlocks(nodes []format.Node) []Block {
	retBlocks := make([]Block, len(nodes))
	for i, node := range nodes {
		id := graphql.ID(node.Cid().String())
		retBlocks[i] = Block{
			Data: base64.StdEncoding.EncodeToString(node.RawData()),
			Cid:  &id,
		}
	}
	return retBlocks
}

func (r *Resolver) AddBlock(ctx context.Context, input AddBlockInput) (*AddBlockPayload, error) {
	abrBits, err := base64.StdEncoding.DecodeString(input.Input.AddBlockRequest)
	if err != nil {
		return nil, fmt.Errorf("error decoding string: %w", err)
	}
	abr := &services.AddBlockRequest{}
	err = abr.Unmarshal(abrBits)
	if err != nil {
		return nil, fmt.Errorf("error unmarshaling %w", err)
	}

	log.Printf("addBlock %s", abr.ObjectId)

	resp, err := r.Aggregator.Add(ctx, abr)
	if err == aggregator.ErrInvalidBlock {
		return &AddBlockPayload{
			Valid:  false,
			NewTip: cid.Undef.String(),
		}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("error validating block: %w", err)
	}

	newBlocks := blocksToGraphQLBlocks(resp.NewNodes)

	return &AddBlockPayload{
		Valid:     true,
		NewTip:    resp.NewTip.String(),
		NewBlocks: &newBlocks,
	}, nil
}
