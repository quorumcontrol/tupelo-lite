import {ApolloClient, HttpLink, gql} from '@apollo/client'
import { InMemoryCache } from '@apollo/client/cache';
import { AddBlockRequest } from 'tupelo-messages';
import fetch from 'cross-fetch'
import { ChainTree, IBlock, IBlockService, IBitSwap,IResolveOptions, IResolveResponse } from './chaintree';
import CID from 'cids';

const dagCBOR = require('ipld-dag-cbor');
const Block = require('ipld-block');

export interface IGraphqlBlock {
    data: string
}

export interface IAddBlockResponse {
    newTip: CID
    newBlocks: IGraphqlBlock[]
    valid: boolean
    errors: any
}

export async function updateChainTreeWithResponse(tree: ChainTree, resp: IAddBlockResponse) {
    const blocks = await graphQLtoBlocks(resp.newBlocks)
    await tree.store.putMany(blocks)
    tree.tip = new CID(resp.newTip)
    return
}

export function graphQLtoBlocks(graphQLBlocks: IGraphqlBlock[]):Promise<IBlock[]> {
    if (!graphQLBlocks) {
        return Promise.resolve([])
    }
    return Promise.all(graphQLBlocks.map(async (blk)=> {
        const bits = Buffer.from(blk.data, 'base64')
        let cid = await dagCBOR.util.cid(bits)
        return new Block(bits, cid)
    }))
}


export function bytesToBlocks(bufs: Uint8Array[]): Promise<IBlock[]> {
    return Promise.all(bufs.map(async (nodeBuf) => {
        const cid = await dagCBOR.util.cid(nodeBuf)
        const block = new Block(Buffer.from(nodeBuf), cid)
        return block
    }))
}

// export interface IBlockService {
//     put(block: IBlock): Promise<any>
//     putMany(block: IBlock[]): Promise<any>
//     get(cid: CID): Promise<IBlock>
//     getMany(cids: CID[]): AsyncIterator<IBlock>
//     delete(cid: CID): Promise<any>
//     setExchange(bitswap: IBitSwap): void
//     unsetExchange(): void
//     hasExchange(): boolean
//   }

export class Client implements IBlockService {
    apollo:ApolloClient<any> // TODO: do we need to support the cache shape?

    constructor(url:string) {
        // Instantiate required constructor fields
        const cache = new InMemoryCache();
        const link = new HttpLink({
          uri: url,
          fetch: fetch,
        });

        const client = new ApolloClient({
          // Provide required constructor fields
          cache: cache,
          link: link,
        });
        this.apollo = client
    }

    async put(block: IBlock) {
        throw new Error("unsupported")
    }

    async putMany(block: IBlock[]) {
        throw new Error("unsupported")
    }

    setExchange(bitswap: IBitSwap): void {
        throw new Error("unsupported")
    }

    unsetExchange(): void {
        throw new Error("unsupported")
    }

    delete(cid: CID): Promise<any> {
        throw new Error("unsupported")
    }

    async get(cid: CID): Promise<IBlock> {
        const resp = await this.apollo.query({
            query: gql`
                query blocks($ids: [String!]!) {
                    blocks(input: {ids: $ids}) {
                        blocks {
                            cid
                            data
                        }
                    }
                }
            `,
            variables: {
                ids: [cid.toBaseEncodedString()]
            },
        })

        const blocks = await graphQLtoBlocks(resp.data.blocks.blocks)
        return blocks[0]
    }

    getMany(cids: CID[]): AsyncIterator<IBlock> {
        throw new Error("unsupported")
    }

    hasExchange(): boolean {
        return false
    }

    async addBlock(abr:AddBlockRequest):Promise<IAddBlockResponse> {
        const resp = await this.apollo.mutate({
            mutation: gql`
                mutation addBlock($addBlockRequest: String!) {
                    addBlock(input: {addBlockRequest: $addBlockRequest}) {
                        valid
                        newTip
                        newBlocks {
                            data
                        }
                    }
                }
            `,
            variables: {
                addBlockRequest: Buffer.from(abr.serializeBinary()).toString('base64')
            }
        })
        return {
            ...resp.data.addBlock,
            errors: resp.errors
        }
    }

    async resolve(did:string, path:string, opts?:IResolveOptions):Promise<IResolveResponse> {
        const resp = await this.apollo.query({
            query: (opts && opts.touchedBlocks) ? resolveQueryBlocks : resolveQueryNoBlocks,
            variables: {
                did: did,
                path: path,
            }
        })
        return {
            ...resp.data.resolve,
            errors: resp.errors
        }
    }
}

const resolveQueryNoBlocks = gql`
query resolve($did: String!, $path: String!) {
    resolve(input: {did: $did, path: $path}) {
        value
        remainingPath
    }
}
`

const resolveQueryBlocks = gql`
query resolve($did: String!, $path: String!) {
    resolve(input: {did: $did, path: $path}) {
        value
        remainingPath
        touchedBlocks {
            cid
            data
        }
    }
}
`