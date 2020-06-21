package policy

import (
	"context"
	"fmt"
	"strings"

	logging "github.com/ipfs/go-log"

	"github.com/open-policy-agent/opa/rego"
	"github.com/quorumcontrol/chaintree/chaintree"
	"github.com/quorumcontrol/chaintree/dag"
	"github.com/quorumcontrol/chaintree/graftabledag"
	"github.com/quorumcontrol/chaintree/typecaster"
	"github.com/quorumcontrol/tupelo/sdk/consensus"
	"github.com/quorumcontrol/tupelo/sdk/gossip/types"
)

var logger = logging.Logger("policy")

type PolicyInputMap map[string]interface{}

func errToCoded(err error) chaintree.CodedError {
	if err == nil {
		return nil
	}
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
func Validator(ctx context.Context, getter graftabledag.DagGetter, tree *dag.Dag, blockWithHeaders *chaintree.BlockWithHeaders) (bool, chaintree.CodedError) {
	query, hasWants, err := PolicyFromTree(ctx, "main", "wants", getter, tree)
	if err != nil {
		return false, errToCoded(err)
	}
	// if there is no query and no error then assume no policies
	if query == nil {
		return true, nil
	}

	inputMap, err := BlockToInputMap(blockWithHeaders)

	valid, err := PolicyValidator(ctx, *query, tree, getter, hasWants, inputMap)
	return valid, errToCoded(err)
}

func PolicyValidator(ctx context.Context, query rego.PreparedEvalQuery, tree *dag.Dag, getter graftabledag.DagGetter, hasWants bool, inputMap PolicyInputMap) (bool, error) {
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
		wantResults, err := pathsToVals(ctx, interfaceStringsToStrings(result), tree, getter)
		if err != nil {
			return false, errToCoded(fmt.Errorf("error getting paths: %w", err))
		}

		inputMap["paths"] = wantResults
		results, err := query.Eval(ctx, rego.EvalInput(inputMap))
		if err != nil {
			return false, errToCoded(fmt.Errorf("error evaluating: %w", err))
		}
		if len(results) == 0 {
			return false, errToCoded(fmt.Errorf("undefined results after wants: %w", err))
		}
		return allowResult(results)
	}

	return allowResult(results)
}

func allowResult(results rego.ResultSet) (bool, error) {
	if result, ok := results[0].Bindings["allow"].(bool); !ok {
		return false, fmt.Errorf("unknown result type: %v", result)
	}

	return results[0].Bindings["allow"].(bool), nil
}

// ValidatorGenerator passes in the GlobalResolve from the ng so that that paths can be resolved where needed
func ValidatorGenerator(ctx context.Context, ng *types.NotaryGroup) (chaintree.BlockValidatorFunc, error) {
	var isOwnerValidator chaintree.BlockValidatorFunc = func(tree *dag.Dag, blockWithHeaders *chaintree.BlockWithHeaders) (bool, chaintree.CodedError) {
		return Validator(ctx, ng.DagGetter, tree, blockWithHeaders)
	}
	return isOwnerValidator, nil
}

func interfaceStringsToStrings(inters []interface{}) []string {
	strings := make([]string, len(inters))
	for i, inter := range inters {
		strings[i] = inter.(string)
	}
	return strings
}

func pathsToVals(ctx context.Context, paths []string, tree *dag.Dag, getter graftabledag.DagGetter) (map[string]interface{}, error) {
	pathToValueMap := make(map[string]interface{})
	for _, pathStr := range paths {

		var actingDag *dag.Dag
		var path = []string{}

		if strings.HasPrefix(pathStr, "did:tupelo") {
			pathParts := strings.Split(pathStr, "/")
			latest, err := getter.GetLatest(ctx, pathParts[0])
			if err != nil {
				return nil, fmt.Errorf("error getting dag: %w", err)
			}
			path = pathParts[1:]
			actingDag = latest.Dag
		} else {
			path = strings.Split(pathStr, "/")
			actingDag = tree
		}
		graftingDag, err := graftabledag.New(actingDag, getter)
		if err != nil {
			return nil, fmt.Errorf("error creating graftable dag: %w", err)
		}

		val, _, err := graftingDag.GlobalResolve(ctx, path)
		if err != nil {
			return nil, fmt.Errorf("error resolving: %w", err)
		}
		pathToValueMap[pathStr] = val
	}
	return pathToValueMap, nil
}

func BlockToInputMap(blockWithHeaders *chaintree.BlockWithHeaders) (PolicyInputMap, error) {
	inputMap := make(PolicyInputMap)

	err := typecaster.ToType(blockWithHeaders, &inputMap)
	if err != nil {
		return nil, fmt.Errorf("error getting input")
	}
	return inputMap, nil
}
