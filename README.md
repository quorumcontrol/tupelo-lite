# Tupelo: Leaf

Tupelo: Leaf is an immutable datastore built for cloud-native, real-world aplication development. Leaf works for both simple, rapid application development *and* high security, high compliance environments.

Leaf is a new kind of database built specfically for cross-organization, cross-application and compliance use-cases. Using Leaf is relatively simple and scales out both in terms of dev complexity *and* transactions per second.

Leaf is built to take advantage of modern cloud environments from AWS to Kubernetes. Leaf requires three pieces of infrastructure: a message queue (MQTT), a key/value store (eg dynamoDB or postgres), and a function runner to expose an API (lambda, azure functions, OpenFAAS).

The underlying datastructure allows the system to scale easily from 0 all the way up to 1000s of transactions per second with little or no work from the dev or ops teams.

## Deploy

Deploy to any major cloud system or kubernetes is as simple as `sls deploy`. More details here: (link)

## What is it?

Leaf is an immutable object store. Objects are trees of data with owners. Owners are allowed to write to the object. Policies are attached to objects and they allow read/write capabilities as necessary for an application. Policies are written in Rego from OpenPolicy Agent, an industry standard langauge used extensively in Kubernetes.

Leaf has a Javascript (TypeScript) and Go api. Usage from the client side is also simple:

```TypeScript
const identity = new Identity(privateKey)
const client = new Client("https://myapi-endpoint.com", {defaultIdentity: identity})

const myCoolObj = client.newTree(id)
myCoolObj.set("/path/to/data", "myValue")

assert.Equal("myValue", myCoolObj.get("/path/to/data"))
```



