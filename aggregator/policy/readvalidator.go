package policy

import (
	"context"
	"fmt"

	"github.com/open-policy-agent/opa/rego"
	"github.com/quorumcontrol/chaintree/chaintree"
	"github.com/quorumcontrol/chaintree/dag"
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

func ReadValidator(ctx context.Context, tree *dag.Dag, path string, identity *identity.Identity) (bool, chaintree.CodedError) {
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

	_, hasReadPolicy := policyMap["read"]
	if !hasReadPolicy {
		// if there is no read policy then just allow
		return true, nil
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
		append(modules, rego.Query("allow = data.read.allow"))...,
	).PrepareForEval(ctx)

	if err != nil {
		return false, errToCoded(fmt.Errorf("error evaluating: %w", err))
	}

	inputMap := make(map[string]interface{})

	err = typecaster.ToType(ReadInput{
		Method:   "GET",
		Path:     path,
		Identity: identity,
	}, &inputMap)

	if err != nil {
		return false, errToCoded(fmt.Errorf("error getting input: %w", err))
	}

	results, err := query.Eval(ctx, rego.EvalInput(inputMap))
	if err != nil {
		return false, errToCoded(fmt.Errorf("error evaluating: %w", err))
	}
	if len(results) == 0 {
		return false, errToCoded(fmt.Errorf("undefined results: %w", err))
	}

	return allowResult(results)
}
