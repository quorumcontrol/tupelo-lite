# Tupelo-Lite (Simple Chain)

Immutable graph database that keeps track of all updates, requires no servers and all updates are cryptographically signed by the committers, providing a clear audit trail.

Based on https://tupelo.org and has a very similar API signature to https://github.com/QuorumControl/tupelo-wasm-sdk

```
npm install tupelo-lite
```

See: https://runkit.com/tobowers/tupelo-lite/0.0.4 for a walk-through. The tests are pretty extensive in this repo as well. They do require running a local signer like so:

```
cd aggregator/api/server && go run main.go
```