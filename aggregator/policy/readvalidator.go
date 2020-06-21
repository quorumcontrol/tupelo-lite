package policy

import (
	"context"
	"fmt"

	"github.com/quorumcontrol/chaintree/chaintree"
	"github.com/quorumcontrol/chaintree/dag"
	"github.com/quorumcontrol/chaintree/graftabledag"
	"github.com/quorumcontrol/chaintree/typecaster"
	"github.com/quorumcontrol/tupelo-lite/aggregator/identity"
)

func init() {
	typecaster.AddType(ReadInput{})
}

type ReadInput struct {
	Method   string
	Path     string
	Identity *identity.Identity
}

func (ri *ReadInput) toInputMap() (policyInputMap, error) {
	inputMap := make(map[string]interface{})

	err := typecaster.ToType(ri, &inputMap)
	return inputMap, err
}

func ReadValidator(ctx context.Context, tree *dag.Dag, getter graftabledag.DagGetter, path string, identity *identity.Identity) (bool, chaintree.CodedError) {
	query, hasWants, err := PolicyFromTree(ctx, "read", "readWants", getter, tree)
	if err != nil {
		return false, errToCoded(err)
	}
	// if there is no query and no error then assume no policies
	if query == nil {
		return true, nil
	}

	inputMap, err := (&ReadInput{
		Method:   "GET",
		Path:     path,
		Identity: identity,
	}).toInputMap()

	if err != nil {
		return false, errToCoded(fmt.Errorf("error getting input: %w", err))
	}

	isValid, err := policyValidator(ctx, *query, tree, getter, hasWants, inputMap)
	return isValid, errToCoded(err)
}
