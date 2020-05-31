package policy

import (
	"context"
	"fmt"
	"strings"

	logging "github.com/ipfs/go-log"

	"github.com/open-policy-agent/opa/rego"
	"github.com/quorumcontrol/chaintree/chaintree"
	"github.com/quorumcontrol/chaintree/dag"
	"github.com/quorumcontrol/chaintree/typecaster"
	"github.com/quorumcontrol/tupelo/sdk/consensus"
	"github.com/quorumcontrol/tupelo/sdk/gossip/types"
)

var logger = logging.Logger("policy")

func errToCoded(err error) chaintree.CodedError {
	return &consensus.ErrorCode{Memo: err.Error(), Code: consensus.ErrUnknown}
}

var policyPath = []string{"tree", "data", ".well-known", "policies"}

/*
Validator looks at a ChainTree and if it contains policies at policyPath (tree/data/.well-known/policies)
then it will evaluate that policy.

See https://www.openpolicyagent.org/ for a complete language description

If the policy has a "wants" package that package is expected to return a "path" array of strings that
will then be passed back into the query evaluated from the tree.

The simplest policy is just a "main" that uses the blockWithHeaders and root maps only (wants is optional)

The Input to this takes the shape of the block with headers.

If there is a wants array that will be added to the blockWithHeaders as the key "paths" which is a map
with string keys (the paths) mapped to their resolved value.

For example:

```
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
```

That will produce the input of the blockWithHeaders and blockWithHeaders.paths will == {
	"tree/data/somePath": <resolvedValue>
}

It's possible to include other packages and use them from main as well.

For example:

policies := map[string]string{
		"tupelo.nopolicychange": `
			package tupelo.nopolicychange

			default allow = false

			modifies_policy {
			    contains(input.transactions[_].setDataPayload.path, ".well-known/policies")
			}

			allow {
			    not modifies_policy
			}
		`,
		"main": `
			package main
			default allow = false

			allow {
				data.tupelo.nopolicychange.allow
			}
		`,
	}


*/
func Validator(ctx context.Context, tree *dag.Dag, blockWithHeaders *chaintree.BlockWithHeaders) (bool, chaintree.CodedError) {
	policies, remain, err := tree.Resolve(ctx, policyPath)
	if err != nil {
		return false, errToCoded(fmt.Errorf("error getting policy: %v", err))
	}
	if len(remain) > 0 {
		return true, nil
	}

	// otherwise we have a policy map and we should evaluate

	policyMap, ok := policies.(map[string]interface{})
	if !ok {
		return false, errToCoded(fmt.Errorf("error converting poicies: %T %v", policies, policies))
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

	inputMap := make(map[string]interface{})

	err = typecaster.ToType(blockWithHeaders, &inputMap)
	if err != nil {
		return false, errToCoded(fmt.Errorf("error getting input"))
	}

	results, err := query.Eval(ctx, rego.EvalInput(inputMap))
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
		inputMap["paths"] = wantResults
		results, err := query.Eval(ctx, rego.EvalInput(inputMap))
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

// ValidatorGenerator passes in the GlobalResolve from the ng so that that paths can be resolved where needed
func ValidatorGenerator(ctx context.Context, ng *types.NotaryGroup) (chaintree.BlockValidatorFunc, error) {
	var isOwnerValidator chaintree.BlockValidatorFunc = func(tree *dag.Dag, blockWithHeaders *chaintree.BlockWithHeaders) (bool, chaintree.CodedError) {
		return Validator(ctx, tree, blockWithHeaders)
	}
	return isOwnerValidator, nil
}
