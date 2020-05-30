package api

var Schema = `
scalar JSON

type Block {
	data: String! # base64
	cid: ID
}

type AddBlockPayload {
	valid: Boolean!
	newTip: String! # base64 todo: CID scalar
	newBlocks: [Block!]
}

type ResolvePayload {
	remainingPath: [String!]!
	value: JSON
	touchedBlocks: [Block!]
}

type ChallengePayload {
	challenge: String!
}

input ResolveInput {
	did: String!
	path: String!
}

input AddBlockInput {
  addBlockRequest: String! # The serialized protobuf as base64
}

type Query {
  resolve(input:ResolveInput!):ResolvePayload
  challenge: ChallengePayload!
}

type Mutation {
  # This mutation takes id and email parameters and responds with a User
  addBlock(input:AddBlockInput!):AddBlockPayload
}
`
