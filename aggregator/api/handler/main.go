package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"

	logging "github.com/ipfs/go-log"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/cognitoidentity"
	"github.com/aws/aws-sdk-go/service/iot"
	"github.com/graph-gophers/graphql-go"
	"github.com/ipfs/go-datastore"
	dynamods "github.com/quorumcontrol/go-ds-dynamodb"
	"github.com/quorumcontrol/tupelo-lite/aggregator"
	"github.com/quorumcontrol/tupelo-lite/aggregator/api"
	"github.com/quorumcontrol/tupelo-lite/aggregator/identity"
)

var (
	// QueryNameNotProvided is thrown when a name is not provided
	QueryNameNotProvided = errors.New("no query was provided in the HTTP body")
	mainSchema           *graphql.Schema
	identityPoolId       = os.Getenv("IDENTITY_POOL")
	identityProviderName = os.Getenv("IDENTITY_PROVIDER_NAME")
	deploymentStage      = os.Getenv("STAGE")
	iotPolicyName        = os.Getenv("IOT_POLICY_NAME")
	dynamoTableName      = os.Getenv("TABLE_NAME")

	logger = logging.Logger("handler.Main")
)

func Handler(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	logger.Infof("Processing Lambda request %s", request.RequestContext.RequestID)
	if request.HTTPMethod == "OPTIONS" { // not sure why we need this and the "cors:true" on the serverless isn't handling it
		return events.APIGatewayProxyResponse{
			Body:       page,
			StatusCode: 200,
			Headers: map[string]string{
				"Access-Control-Allow-Origin":  "*",
				"Access-Control-Allow-Headers": "*",
			},
		}, nil
	}

	// If no query is provided in the HTTP request body then show the explorer
	if len(request.Body) < 1 {
		return events.APIGatewayProxyResponse{
			Body:       page,
			StatusCode: 200,
			Headers: map[string]string{
				"Content-Type":                 "text/html",
				"Access-Control-Allow-Origin":  "*",
				"Access-Control-Allow-Headers": "*",
			},
		}, nil
	}

	var params struct {
		Query         string                 `json:"query"`
		OperationName string                 `json:"operationName"`
		Variables     map[string]interface{} `json:"variables"`
	}

	if err := json.Unmarshal([]byte(request.Body), &params); err != nil {
		logger.Warningf("Could not decode body: %v", err)
		return events.APIGatewayProxyResponse{
			Body:       "could not decode body",
			StatusCode: 500,
		}, nil
	}

	header, ok := request.Headers[identity.IdentityHeaderField]
	if ok {
		ident, err := identity.FromHeader(map[string][]string{identity.IdentityHeaderField: {header}})
		if err != nil {
			logger.Warningf("Could not get identity, %v", err)
			return events.APIGatewayProxyResponse{
				Body:       fmt.Sprintf("could not decode: %v", err),
				StatusCode: 500,
			}, nil
		}
		if ident != nil {
			//TODO: this can probably be debug
			logger.Infof("identity: %s", ident.Sub)
			ctx = context.WithValue(ctx, api.IdentityContextKey, ident.Identity)
		}
	}

	//TODO: remove
	logger.Infof("identity from ctx: %v", api.RequesterFromCtx(ctx))

	response := mainSchema.Exec(ctx, params.Query, params.OperationName, params.Variables)
	responseJSON, err := json.Marshal(response)
	if err != nil {
		log.Println("Could not decode body")
	}

	return events.APIGatewayProxyResponse{
		Body:       string(responseJSON),
		StatusCode: 200,
		Headers: map[string]string{
			"Access-Control-Allow-Origin":  "*",
			"Access-Control-Allow-Headers": "*",
		},
	}, nil

}

func getDatastore() datastore.Batching {
	if dynamoTableName != "" {
		logger.Infof("using dynamo datastore: %s", dynamoTableName)
		dynds, err := dynamods.NewDynamoDatastore(dynamods.Config{
			TableName: dynamoTableName,
		})
		if err != nil {
			panic(err)
		}
		return dynds
	}
	return aggregator.NewMemoryStore()
}

func tokenHandler(ctx context.Context) (*api.IdentityTokenPayload, error) {
	logger.Infof("tokenHandler")
	requester := api.RequesterFromCtx(ctx)
	if requester == nil {
		logger.Warningf("no requester")
		return &api.IdentityTokenPayload{
			Result: false,
		}, nil
	}

	mySession := session.Must(session.NewSession())
	serv := cognitoidentity.New(mySession)
	iotCli := iot.New(mySession)

	out, err := serv.GetOpenIdTokenForDeveloperIdentity(&cognitoidentity.GetOpenIdTokenForDeveloperIdentityInput{
		IdentityPoolId: aws.String(identityPoolId),
		Logins:         map[string]*string{identityProviderName: aws.String(requester.Sub)},
	})
	if err != nil {
		logger.Errorf("error getting openId token: %v", err)
		return nil, fmt.Errorf("error getting token: %w", err)
	}

	_, err = iotCli.AttachPolicy(&iot.AttachPolicyInput{
		PolicyName: aws.String(iotPolicyName),
		Target:     out.IdentityId,
	})
	if err != nil {
		logger.Errorf("error attaching policy: %v", err)
		return nil, fmt.Errorf("error attching policy: %w", err)
	}

	return &api.IdentityTokenPayload{
		Result: true,
		Token:  *out.Token,
		Id:     *out.IdentityId,
	}, nil
}

func init() {
	log.Println("init")
	ctx := context.Background()
	resolver, err := api.NewResolver(ctx, getDatastore())
	if err != nil {
		panic(err)
	}
	resolver.TokenHandler = tokenHandler

	opts := []graphql.SchemaOpt{graphql.UseFieldResolvers(), graphql.MaxParallelism(20)}
	schema, err := graphql.ParseSchema(api.Schema, resolver, opts...)
	if err != nil {
		panic(err)
	}
	mainSchema = schema
}

func main() {
	log.Println("starting handler")
	logging.SetLogLevel("*", "info")
	lambda.Start(Handler)
}

var page = fmt.Sprintf(`
<!DOCTYPE html>
<html>
	<head>
		<link href="https://cdnjs.cloudflare.com/ajax/libs/graphiql/0.17.5/graphiql.min.css" rel="stylesheet" />
		<script src="https://cdnjs.cloudflare.com/ajax/libs/es6-promise/4.1.1/es6-promise.auto.min.js"></script>
		<script src="https://cdnjs.cloudflare.com/ajax/libs/fetch/2.0.3/fetch.min.js"></script>
		<script src="https://cdnjs.cloudflare.com/ajax/libs/react/16.2.0/umd/react.production.min.js"></script>
		<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/16.2.0/umd/react-dom.production.min.js"></script>
		<script src="https://cdnjs.cloudflare.com/ajax/libs/graphiql/0.17.5/graphiql.min.js"></script>
	</head>
	<body style="width: 100%%; height: 100%%; margin: 0; overflow: hidden;">
		<div id="graphiql" style="height: 100vh;">Loading...</div>
		<script>
			function graphQLFetcher(graphQLParams) {
				return fetch("/%s/graphql", {
					method: "post",
					body: JSON.stringify(graphQLParams),
					credentials: "include",
				}).then(function (response) {
					return response.text();
				}).then(function (responseBody) {
					try {
						return JSON.parse(responseBody);
					} catch (error) {
						return responseBody;
					}
				});
			}
			ReactDOM.render(
				React.createElement(GraphiQL, {fetcher: graphQLFetcher}),
				document.getElementById("graphiql")
			);
		</script>
	</body>
</html>
`, deploymentStage)
