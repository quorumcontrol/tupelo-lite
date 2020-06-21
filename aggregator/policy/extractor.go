package policy

import (
	"context"
	"fmt"

	"github.com/open-policy-agent/opa/rego"
	"github.com/quorumcontrol/chaintree/dag"
	"github.com/quorumcontrol/chaintree/graftabledag"
)

func PolicyFromTree(ctx context.Context, mainPolicyName string, wantsPolicyName string, getter graftabledag.DagGetter, tree *dag.Dag) (query *rego.PreparedEvalQuery, hasWants bool, err error) {
	policies, remain, err := tree.Resolve(ctx, policyPath)
	if err != nil {
		return nil, false, fmt.Errorf("error getting policy: %v", err)
	}
	// If the tree has no policies then default to allow
	if len(remain) > 0 {
		return nil, false, nil
	}

	// otherwise we have a policy map and we should evaluate

	policyMap, ok := policies.(map[string]interface{})
	if !ok {
		return nil, false, fmt.Errorf("error converting poicies: %T %v", policies, policies)
	}

	var modules []func(*rego.Rego)

	for k := range policyMap {
		policy, _, err := tree.Resolve(ctx, append(policyPath, k))
		if err != nil {
			return nil, false, fmt.Errorf("error resolving: %v", policies)
		}
		modules = append(modules, rego.Module(k, policy.(string)))
	}

	_, hasWants = policyMap["wants"]
	queryString := "allow = data." + mainPolicyName + ".allow"
	if hasWants {
		queryString += "; wants = data." + wantsPolicyName + ".paths"
	}

	q, err := rego.New(
		append(modules, rego.Query(queryString))...,
	).PrepareForEval(ctx)

	if err != nil {
		return nil, false, fmt.Errorf("error evaluating: %w", err)
	}

	return &q, hasWants, nil
}
