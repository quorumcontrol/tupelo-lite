package main

import (
	"context"
	"fmt"
	"log"
	"net/http"

	logging "github.com/ipfs/go-log"

	"github.com/graph-gophers/graphql-go"
	"github.com/graph-gophers/graphql-go/relay"
	"github.com/quorumcontrol/chaintree/graftabledag"
	"github.com/quorumcontrol/tupelo-lite/aggregator"
	"github.com/quorumcontrol/tupelo-lite/aggregator/api"
	"github.com/quorumcontrol/tupelo-lite/aggregator/api/publisher"
	"github.com/quorumcontrol/tupelo-lite/aggregator/identity"
)

var logger = logging.Logger("server")

func CorsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// allow cross domain AJAX requests
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "*")
		if r.Method == "OPTIONS" {
			w.WriteHeader(200)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func IdentityMiddleware(next http.Handler, getter graftabledag.DagGetter) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := identity.FromHeader(r.Header)
		if err != nil {
			w.WriteHeader(500)
			return
		}
		if id != nil {
			isVerified, err := id.Verify(context.TODO(), getter)
			if err != nil {
				logger.Errorf("error verifying: %v", err)
				w.WriteHeader(500)
				return
			}
			if isVerified {
				logger.Debugf("id: %v", id)
				newR := r.WithContext(context.WithValue(r.Context(), api.IdentityContextKey, id.Identity))
				next.ServeHTTP(w, newR)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

// TODO: return errors
func Setup() *api.Resolver {
	logging.SetLogLevel("*", "info")
	logging.SetLogLevel("server", "debug")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	cli, err := StartMQTT()
	if err != nil {
		panic(err)
	}

	// TODO: publish this to an mqtt broker
	updateChan, err := publisher.StartPublishing(ctx, func(ctx context.Context, topic string, payload []byte) error {
		logger.Debugf("updated: %s", topic)
		cli.Publish(topic, byte(0), false, payload)
		return nil
	})
	if err != nil {
		panic(err)
	}

	r, err := api.NewResolver(ctx, &api.Config{KeyValueStore: aggregator.NewMemoryStore(), UpdateChannel: updateChan})
	if err != nil {
		panic(err)
	}

	opts := []graphql.SchemaOpt{graphql.UseFieldResolvers(), graphql.MaxParallelism(20)}
	schema := graphql.MustParseSchema(api.Schema, r, opts...)

	http.Handle("/", CorsMiddleware(IdentityMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		log.Printf("rendering igraphql")
		w.Write(page)
	}), r.Aggregator)))

	http.Handle("/graphql", CorsMiddleware(IdentityMiddleware(&relay.Handler{Schema: schema}, r.Aggregator)))

	return r
}

func main() {
	Setup()
	fmt.Println("running on port 9011 path: /graphql")
	log.Fatal(http.ListenAndServe(":9011", nil))
}

var page = []byte(`
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
				return fetch("/graphql", {
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
`)
