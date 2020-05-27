package policy

import (
	"context"
	"fmt"
	"strings"

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

	_, hasWants := policyMap["wants"]
	queryString := "allow = data.main.allow"
	if hasWants {
		queryString += "; wants = data.wants.paths"
	}

	query, err := rego.New(
		append(modules, rego.Query(queryString))...,
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
	}
	if len(results) == 0 {
		return false, errToCoded(fmt.Errorf("undefined results: %w", err))
	}

	// this can be way more elegant, but doing it the simple way first
	// if the policy has wants then first see what those wants are
	// then reevaluate the query with those wants and get the allowed
	if hasWants {
		// if the policy needs some paths resolved, then do that here
		result, ok := results[0].Bindings["wants"].([]interface{})
		if !ok {
			return false, errToCoded(fmt.Errorf("unknown result type: %T", result))
		}
		wantResults := make(map[string]interface{})
		for _, pathInterface := range result {
			path, ok := pathInterface.(string)
			if !ok {
				return false, errToCoded(fmt.Errorf("error resolving unknown path type: %T", pathInterface))
			}
			val, _, err := tree.Resolve(ctx, strings.Split(path, "/"))
			if err != nil {
				return false, errToCoded(fmt.Errorf("error resolving: %w", err))
			}
			wantResults[path] = val
		}
		blockWithHeadersInput["paths"] = wantResults
		results, err := query.Eval(ctx, rego.EvalInput(blockWithHeadersInput))
		if err != nil {
			return false, errToCoded(fmt.Errorf("error evaluating: %w", err))
		}
		if len(results) == 0 {
			return false, errToCoded(fmt.Errorf("undefined results: %w", err))
		}
		return allowResult(results)
	}

	return allowResult(results)
}

func allowResult(results rego.ResultSet) (bool, chaintree.CodedError) {
	if result, ok := results[0].Bindings["allow"].(bool); !ok {
		return false, errToCoded(fmt.Errorf("unknown result type: %v", result))
	}

	return results[0].Bindings["allow"].(bool), nil
}
