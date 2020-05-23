package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"os"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/graph-gophers/graphql-go"
	"github.com/ipfs/go-datastore"
	s3ds "github.com/ipfs/go-ds-s3"
	"github.com/quorumcontrol/tupelo-lite/aggregator"
	"github.com/quorumcontrol/tupelo-lite/aggregator/api"
)

var (
	// QueryNameNotProvided is thrown when a name is not provided
	QueryNameNotProvided = errors.New("no query was provided in the HTTP body")
	mainSchema           *graphql.Schema
)

func Handler(context context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	log.Printf("Processing Lambda request %s\n", request.RequestContext.RequestID)
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
		log.Print("Could not decode body", err)
	}

	response := mainSchema.Exec(context, params.Query, params.OperationName, params.Variables)
	responseJSON, err := json.Marshal(response)
	if err != nil {
		log.Print("Could not decode body")
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
	bucketName, ok := os.LookupEnv("BUCKET_NAME")
	if ok {
		log.Println("using s3 datastore: ", bucketName)
		s3conf := s3ds.Config{
			Bucket: bucketName,
			Region: os.Getenv("REGION"),
		}

		ds, err := s3ds.NewS3Datastore(s3conf)
		if err != nil {
			panic(err)
		}
		return ds
	}

	return aggregator.NewMemoryStore()
}

func init() {
	log.Println("init")
	ctx := context.Background()
	resolver, err := api.NewResolver(ctx, getDatastore())
	if err != nil {
		panic(err)
	}
	opts := []graphql.SchemaOpt{graphql.UseFieldResolvers(), graphql.MaxParallelism(20)}
	schema, err := graphql.ParseSchema(api.Schema, resolver, opts...)
	if err != nil {
		panic(err)
	}
	mainSchema = schema
}

func main() {
	log.Println("starting handler")
	lambda.Start(Handler)
}

var page = `
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
	<body style="width: 100%; height: 100%; margin: 0; overflow: hidden;">
		<div id="graphiql" style="height: 100vh;">Loading...</div>
		<script>
			function graphQLFetcher(graphQLParams) {
				return fetch("/dev/graphql", {
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
`