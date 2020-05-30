import { ChainTree, IChainTreeInitializer, IBlockService, IResolveOptions, IResolveResponse } from "../chaintree";
import { EcdsaKey } from "../ecdsa";
import CID from "cids";
import { Client, graphQLtoBlocks } from "../client";


export interface IPolicyTreeInitializer extends IChainTreeInitializer {
    key?: EcdsaKey
    tip: CID,
    store: IBlockService,
    client: Client
}

/**
 * PolicyTree is a ChainTree but uses a special technique to fetch remote blocks (which is disallowed on Tupelo-Lite)
 */
export class PolicyTree extends ChainTree {

    client: Client

    constructor(opts: IPolicyTreeInitializer) {
        super(opts)
        this.client = opts.client
    }

    async resolve(path: string, opts?: IResolveOptions): Promise<IResolveResponse> {
        try {
            let resp = await super.resolve(path, opts)
            return resp
        } catch (e) {
            if (e.message.includes("Not Found")) {
                try {
                    const clientResp = await this.client.resolve((await this.id())!, path, {...opts, touchedBlocks: true})
                    this.store.putMany(clientResp.touchedBlocks!)
                    return {
                        value: clientResp.value,
                        remainderPath: clientResp.remainderPath,
                        touchedBlocks: clientResp.touchedBlocks?.map((blk) => { return blk.cid }),
                    }
                } catch (e) {
                    throw e
                }
                
            }
            throw e
        }
    }


}