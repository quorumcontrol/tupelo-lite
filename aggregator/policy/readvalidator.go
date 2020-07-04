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
	Object   string
	Method   string
	Path     string
	Identity *identity.Identity
}

func (ri *ReadInput) ToInputMap() (PolicyInputMap, error) {
	inputMap := make(map[string]interface{})

	err := typecaster.ToType(ri, &inputMap)
	return inputMap, err
}

func ReadValidator(ctx context.Context, tree *dag.Dag, getter graftabledag.DagGetter, input *ReadInput) (bool, chaintree.CodedError) {
	query, hasWants, err := PolicyFromTree(ctx, "read", "readWants", getter, tree)
	if err != nil {
		return false, errToCoded(err)
	}
	// if there is no query and no error then assume no policies
	if query == nil {
		return true, nil
	}

	inputMap, err := input.ToInputMap()

	if err != nil {
		return false, errToCoded(fmt.Errorf("error getting input: %w", err))
	}

	isValid, err := PolicyValidator(ctx, *query, tree, getter, hasWants, inputMap)
	return isValid, errToCoded(err)
}
