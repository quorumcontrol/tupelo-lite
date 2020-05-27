package policy

import (
	"context"
	"fmt"

	"github.com/open-policy-agent/opa/rego"
	"github.com/quorumcontrol/chaintree/chaintree"
	"github.com/quorumcontrol/chaintree/dag"
	"github.com/quorumcontrol/chaintree/typecaster"
	"github.com/quorumcontrol/tupelo/sdk/consensus"
)

func errToCoded(err error) chaintree.CodedError {
	return &consensus.ErrorCode{Memo: err.Error(), Code: consensus.ErrUnknown}
}

var policyPath = []string{"tree", "data", ".wellKnown", "policies"}

func PolicyValidator(tree *dag.Dag, blockWithHeaders *chaintree.BlockWithHeaders) (bool, chaintree.CodedError) {
	ctx := context.TODO()
	policies, remain, err := tree.Resolve(ctx, policyPath)
	if err != nil {
		return false, errToCoded(fmt.Errorf("error getting policy: %v", err))
	}
	if len(remain) > 0 {
		return true, nil
	}
	// otherwise we have a policy map

	policyMap, ok := policies.(map[string]interface{})
	if !ok {
		return false, errToCoded(fmt.Errorf("error converting: %v", policies))
	}

	var modules []func(*rego.Rego)

	for k := range policyMap {
		policy, _, err := tree.Resolve(ctx, append(policyPath, k))
		if err != nil {
			return false, errToCoded(fmt.Errorf("error resolving: %v", policies))
		}
		modules = append(modules, rego.Module(k, policy.(string)))
	}

	query, err := rego.New(
		append(modules, rego.Query("x = data.main.allow"))...,
	).PrepareForEval(ctx)

	if err != nil {
		return false, errToCoded(fmt.Errorf("error evaluating: %w", err))
	}

	blockWithHeadersInput := make(map[string]interface{})

	err = typecaster.ToType(blockWithHeaders, &blockWithHeadersInput)
	if err != nil {
		return false, errToCoded(fmt.Errorf("error getting input"))
	}

	results, err := query.Eval(ctx, rego.EvalInput(blockWithHeadersInput))
	if err != nil {
		return false, errToCoded(fmt.Errorf("error evaluating: %w", err))
	} else if len(results) == 0 {
		return false, errToCoded(fmt.Errorf("undefined results"))
	} else if result, ok := results[0].Bindings["x"].(bool); !ok {
		return false, errToCoded(fmt.Errorf("unknown result type: %v", result))
	} else {
		return results[0].Bindings["x"].(bool), nil
	}
}
