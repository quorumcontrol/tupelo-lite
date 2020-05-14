import { QueryResolveArgs, ResolvePayload,MutationAddBlockArgs,AddBlockPayload, Block } from "./generated/types";
import GraphQLJSON from 'graphql-type-json';
import { ChainDataSource } from "./server";
import { AddBlockRequest } from "tupelo-messages/services/services_pb";
import { IBlock } from "../../chaintree";

interface ITupeloContext {
    dataSources: {
        simpleChain: ChainDataSource,
    } 
}


export function blocksToGraphql(ipldBlocks: Uint8Array[]): Block[] {
    return ipldBlocks.map((blk)=> {
        return {
            data: Buffer.from(blk).toString('base64'),
        }
    })
}

export const resolvers = {
    JSON: GraphQLJSON,
    Query: {
      resolve: async (_:any, {input}:QueryResolveArgs, {dataSources:{simpleChain}}:ITupeloContext):Promise<ResolvePayload> => {
        const chain = await simpleChain.chain()
        const resp = await chain.resolve(input.did, input.path)
        if (resp) {
            return resp
        }
        return {
            remainingPath: input.path.split("/")
        }
      }
    },
    Mutation: {
        addBlock: async (_:any, {input}:MutationAddBlockArgs, {dataSources:{simpleChain}}:ITupeloContext):Promise<AddBlockPayload> => {
            const abrBytes = Buffer.from(input.addBlockRequest, 'base64')
            const abr = AddBlockRequest.deserializeBinary(abrBytes)
            const chain = await simpleChain.chain()
            const resp = await chain.add(abr)
            return {
                valid: resp.valid,
                newTip: resp.newTip.toBaseEncodedString(),
                newBlocks: blocksToGraphql(resp.newNodes)
                //TODO: the blocks as base64
            }
        }
    }
  };