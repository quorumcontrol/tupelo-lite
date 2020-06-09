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
	"github.com/aws/aws-sdk-go/service/iotdataplane"
	"github.com/graph-gophers/graphql-go"
	"github.com/ipfs/go-datastore"
	dynamods "github.com/quorumcontrol/go-ds-dynamodb"
	"github.com/quorumcontrol/tupelo-lite/aggregator"
	"github.com/quorumcontrol/tupelo-lite/aggregator/api"
	"github.com/quorumcontrol/tupelo-lite/aggregator/api/publisher"
	"github.com/quorumcontrol/tupelo-lite/aggregator/identity"
)

var (
	// ErrQueryNameNotProvided is thrown when no query name is provided in a request
	ErrQueryNameNotProvided = errors.New("no query was provided in the HTTP body")
	identityPoolID          = os.Getenv("IDENTITY_POOL")
	identityProviderName    = os.Getenv("IDENTITY_PROVIDER_NAME")
	deploymentStage         = os.Getenv("STAGE")
	iotPolicyName           = os.Getenv("IOT_POLICY_NAME")
	dynamoTableName         = os.Getenv("TABLE_NAME")

	logger = logging.Logger("handler.Main")

	mainSchema  *graphql.Schema
	appResolver *api.Resolver

	awsSession  *session.Session
	identityCli *cognitoidentity.CognitoIdentity
	iotCli      *iot.IoT
	iotDataCli  *iotdataplane.IoTDataPlane
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
			isVerified, err := ident.Verify(ctx, appResolver.Aggregator)
			if err != nil {
				logger.Errorf("error verifying: %v", err)
				return events.APIGatewayProxyResponse{
					Body:       fmt.Sprintf("error verifying: %v", err),
					StatusCode: 500,
				}, nil
			}
			if isVerified {
				ctx = context.WithValue(ctx, api.IdentityContextKey, ident.Identity)
			}
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

	out, err := identityCli.GetOpenIdTokenForDeveloperIdentity(&cognitoidentity.GetOpenIdTokenForDeveloperIdentityInput{
		IdentityPoolId: aws.String(identityPoolID),
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

	awsSession = session.Must(session.NewSession())
	identityCli = cognitoidentity.New(awsSession)
	iotCli = iot.New(awsSession)

	updateFunc, err := publisher.Wrap(ctx, func(ctx context.Context, topic string, msg string) error {
		logger.Infof("publishing to %s", topic)
		_, err := iotDataCli.Publish(&iotdataplane.PublishInput{
			Topic:   aws.String(topic),
			Payload: []byte(msg),
			Qos:     aws.Int64(1),
		})
		logger.Infof("published to %s", topic)
		if err != nil {
			logger.Errorf("error publishing", err)
			return err
		}
		return nil
	})

	resolver, err := api.NewResolver(ctx, &api.Config{KeyValueStore: getDatastore(), UpdateFunc: updateFunc})
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
	appResolver = resolver
}

func main() {
	ctx := context.Background()

	if iotDataCli == nil {
		endpointResp, err := iotCli.DescribeEndpointWithContext(ctx, &iot.DescribeEndpointInput{})
		if err != nil {
			panic(fmt.Errorf("error getting endpoint: %v", err))
		}

		iotDataCli = iotdataplane.New(awsSession, &aws.Config{
			Endpoint: endpointResp.EndpointAddress,
		})
	}

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
