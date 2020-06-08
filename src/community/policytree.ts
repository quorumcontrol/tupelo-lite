import { ChainTree, IChainTreeInitializer, IBlockService, IResolveOptions, IResolveResponse } from "../chaintree";
import { Client, Subscription } from "../client";
import { EventEmitter } from "events";
import debug from 'debug';
import CID from "cids";

const log = debug("policytree")

export interface IPolicyTreeInitializer extends IChainTreeInitializer {
    client: Client
}

/**
 * PolicyTree is a ChainTree but uses a special technique to fetch remote blocks (which is disallowed on Tupelo-Lite)
 */
export class PolicyTree extends ChainTree {

    client: Client
    events: EventEmitter

    constructor(opts: IPolicyTreeInitializer) {
        super(opts)
        this.client = opts.client
        this.events = new EventEmitter()
    }

    async subscribe(): Promise<Subscription> {
        return this.client.subscribe({
            topic: `public/trees/${(await this.id())}`,
            next: async (msg) => {
                log("msg: ", msg)
                const currHeight = (await this.resolve("/chain/end/height")).value || 0
                if (msg.value.height >= currHeight) {
                    this.tip = new CID(msg.value.newTip['/'])
                }
            },
            error: (err) => {
                log("subscription err: ", err)
            }
        })
    }

    async resolve(path: string, opts?: IResolveOptions): Promise<IResolveResponse> {
        try {
            let resp = await super.resolve(path, opts)
            return resp
        } catch (e) {
            if (e.message.includes("Not Found")) {
                try {
                    const clientResp = await this.client.resolve((await this.id())!, path, { ...opts, touchedBlocks: true })
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