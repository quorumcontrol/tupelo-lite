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

type LoginPayload {
	result: Boolean!
	token: String!
	id: String!
}

input ResolveInput {
	did: String!
	path: String!
}

input AddBlockInput {
  addBlockRequest: String! # The serialized protobuf as base64
}

input LoginInput {
	did: String!
}

type Query {
  resolve(input:ResolveInput!):ResolvePayload
}

type Mutation {
  addBlock(input:AddBlockInput!):AddBlockPayload
  login(input:LoginInput!):LoginPayload
}
`
