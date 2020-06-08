import { ApolloClient, HttpLink, gql } from '@apollo/client'
import { InMemoryCache } from '@apollo/client/cache';
import { AddBlockRequest } from 'tupelo-messages';
import fetch from 'cross-fetch'
import { ChainTree, IBlock, IResolveOptions } from './chaintree';
import CID from 'cids';
import debug from 'debug';
import { setContext } from '@apollo/link-context';
import { EcdsaKey } from './ecdsa';
import { LocalOpts, AWSOptions, configurePubSubForAWS, configurePubSubForLocal, authenticatePubsub } from './pubsub/mqtt'
import { PubSub } from 'aws-amplify';

const dagCBOR = require('ipld-dag-cbor');
const Block = require('ipld-block');
const log = debug("client")

const identityHeaderField = "X-Tupelo-Id"

export interface IGraphqlBlock {
    data: string
}

export interface IAddBlockResponse {
    newTip: CID
    newBlocks: IGraphqlBlock[]
    valid: boolean
    errors: any
}

export interface IClientResolveResponse {
    remainderPath: string[]
    value: any
    touchedBlocks?: IBlock[]
    errors?: any
}

export interface IClientIdentityToken {
    result: boolean
    token: string
    id: string
}

export async function updateChainTreeWithResponse(tree: ChainTree, resp: IAddBlockResponse) {
    const blocks = await graphQLtoBlocks(resp.newBlocks)
    await tree.store.putMany(blocks)
    tree.tip = new CID(resp.newTip)
    return
}

export function graphQLtoBlocks(graphQLBlocks: IGraphqlBlock[]): Promise<IBlock[]> {
    if (!graphQLBlocks) {
        return Promise.resolve([])
    }
    return Promise.all(graphQLBlocks.map(async (blk) => {
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

export type Subscription = ZenObservable.Subscription

// see note in golang aggregator
interface Identity {
    iss: string
    sub: string
    aud?: string
    exp?: number
    iat?: number
}
// see note in golang aggregator
interface IdentityWithSignature extends Identity {
    signature: Uint8Array
}

export interface PubSubConfig {
    config: LocalOpts | AWSOptions
    type: "AWS" | "LOCAL"
}

export interface ClientOpts {
    pubSub?: PubSubConfig
}

interface ISubscribeOpts {
    topic: string
    next: (data: any) => any
    error: (err: any) => any
    complete?: () => any
}

function configPubSub(config: PubSubConfig) {
    switch (config.type) {
        case "AWS":
            configurePubSubForAWS(config.config as AWSOptions)
            break;
        case "LOCAL":
            configurePubSubForLocal(config.config as LocalOpts)
    }
}

export class Client {
    apollo: ApolloClient<any> // TODO: do we need to support the cache shape?
    private identity?: Identity
    private key?: EcdsaKey
    config: ClientOpts
    supportsPubsub: boolean

    constructor(url: string, opts: ClientOpts = {}) {
        // Instantiate required constructor fields
        const cache = new InMemoryCache();
        const link = new HttpLink({
            uri: url,
            fetch: fetch,
        });

        const authLink = this.getAuthLink()

        this.config = opts

        const apollo = new ApolloClient({
            // Provide required constructor fields
            cache: cache,
            link: authLink.concat(link),
        });
        this.apollo = apollo
        this.supportsPubsub = false
        // we can configure pubsub if it exists
        if (opts.pubSub) {
            this.supportsPubsub = true
            configPubSub(opts.pubSub)
        }
    }

    identify(did: string, key: EcdsaKey) {
        const now = new Date()
        this.identity = {
            iss: did,
            sub: did,
            iat: now.getTime() + (now.getTimezoneOffset() * 60000),
            aud: "", // TODO: should add an aud here
        }
        this.key = key
        // TODO: all this should be abstracted away from client so it doesn't have to worry about
        // pubsub at all
        // if we have an AWS config for pubsub then go ahead and start the auth process
        if (this.config.pubSub?.type === "AWS") {
            this.loginToAWS()
        }
    }

    private async loginToAWS(): Promise<void> {
        const token = await this.identityToken()
        authenticatePubsub(this.identity?.sub!, token)
        return
    }

    private async signedIdentity(): Promise<undefined | IdentityWithSignature> {
        if (!this.identity || !this.key) {
            return undefined
        }
        const now = new Date()

        const identity = { ...this.identity, exp: now.getTime() + (now.getTimezoneOffset() * 60000) + 10000 }
        log("identity: ", identity)
        const sigResp = await this.key.signObject(identity)
        return { ...identity, signature: sigResp.signature }
    }

    private async identityHeaderString(): Promise<undefined | string> {
        const ident = await this.signedIdentity()
        if (!ident) {
            return undefined
        }
        return Buffer.from(dagCBOR.util.serialize(ident)).toString('base64')
    }

    private getAuthLink() {
        const getIdentityString = this.identityHeaderString.bind(this)

        return setContext(async (_, { headers }) => {
            // return the headers to the context so httpLink can read them
            const token = await getIdentityString()
            return {
                headers: {
                    ...headers,
                    [identityHeaderField]: token ? token : "",
                }
            }
        });
    }

    subscribe(opts: ISubscribeOpts): Subscription {
        if (!this.supportsPubsub) {
            throw new Error("client must support pubsub")
        }

        log("subscribing : ", opts.topic)
        return PubSub.subscribe(opts.topic).subscribe({
            next: opts.next,
            error: opts.error,
            complete: opts.complete || (() => { }),
        });
    }

    async addBlock(abr: AddBlockRequest): Promise<IAddBlockResponse> {
        try {
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
        } catch (err) {
            console.error("addBlock error: ", err)
            throw err
        }
    }

    async identityToken(): Promise<IClientIdentityToken> {
        const resp = await this.apollo.query({
            query: identityTokenQuery,
            fetchPolicy: 'network-only',
        })
        return resp.data.identityToken
    }

    async resolve(did: string, path: string, opts?: IResolveOptions): Promise<IClientResolveResponse> {
        log(`resolve did: ${did} ${path}`)
        try {
            const resp = await this.apollo.query({
                query: (opts && opts.touchedBlocks) ? resolveQueryBlocks : resolveQueryNoBlocks,
                variables: {
                    did: did,
                    path: path,
                },
                fetchPolicy: 'network-only',
            })

            let blocks: IBlock[] = []
            if (resp.data.resolve.touchedBlocks) {
                blocks = await graphQLtoBlocks(resp.data.resolve.touchedBlocks)
            }

            return {
                ...resp.data.resolve,
                touchedBlocks: blocks,
                errors: resp.errors
            }
        } catch (err) {
            log(`resolve did: ${did} ${path}, err: `, err)
            throw err
        }

    }
}

const identityTokenQuery = gql`
    query {
        identityToken {
            result
	        token
	        id
        }
    }
`

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