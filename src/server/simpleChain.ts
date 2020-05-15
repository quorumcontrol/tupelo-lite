import debug from 'debug'
import Repo from '../repo/repo'
import { AddBlockRequest } from 'tupelo-messages/services/services_pb'
import { NotaryGroup } from 'tupelo-messages/config/config_pb'
import { Aggregator, IValidationResponse } from './wasm'
import CID from 'cids'
import { IKey } from '../chaintree/datastore'
import { Dag, IBlock, ChainTree } from '../chaintree'
const Key = require("interface-datastore").Key
const dagCBOR = require('ipld-dag-cbor')
const Block = require('ipld-block');
const IpfsBlockService: any = require('ipfs-block-service');

const log = debug("server")

const ErrNotValid = "NotValid"
const ErrWrongPreviousTip = "IncorrectPreviousTip"

const ErrNotFound = "ERR_NOT_FOUND"

function didToKey(did: string): IKey {
    return new Key(`/trees/${did}`)
}

export async function updateChainTreeWithResponse(tree: ChainTree, resp: IValidationResponse) {
    const blocks = await bytesToBlocks(resp.newNodes)
    await tree.store.putMany(blocks)
    tree.tip = resp.newTip
    return
}

export function bytesToBlocks(bufs: Uint8Array[]): Promise<IBlock[]> {
    return Promise.all(bufs.map(async (nodeBuf) => {
        const cid = await dagCBOR.util.cid(nodeBuf)
        const block = new Block(Buffer.from(nodeBuf), cid)
        return block
    }))
}

export class SimpleChain {
    repo: Repo
    private service: any // ipfs block service

    constructor(repo: Repo, ng?: NotaryGroup) {
        if (!ng) {
            ng = new NotaryGroup()
            ng.setId("default")
        }
        this.service = new IpfsBlockService(repo.repo)
        Aggregator.setupValidator({
            notaryGroup: ng,
            tipGetter: this.getTip.bind(this),
            store: this.service,
        })
        this.repo = repo
    }

    async getTip(did: string): Promise<CID | undefined> {
        try {
            const cidBits = await this.repo.get(didToKey(did))
            let cid = new CID(cidBits)
            return cid
        } catch (err) {
            if (err.code !== ErrNotFound) {
                throw err
            }
            return undefined
        }
    }

    async resolve(did: string, path: string) {
        const tip = await this.getTip(did)
        if (!tip) {
            return undefined
        }
        const dag = new Dag(tip, this.service)
        return await dag.resolve(path) // TODO: send back the blocks too
    }

    async add(abr: AddBlockRequest): Promise<IValidationResponse> {
        const resp = await Aggregator.validate(abr)
        if (!resp.valid) {
            throw new Error(ErrNotValid)
        }
        const did = Buffer.from(abr.getObjectId_asU8()).toString('utf-8')

        const tip = await this.getTip(did)
        if (tip && !tip.buffer.equals(abr.getPreviousTip_asU8())) {
            throw new Error(ErrWrongPreviousTip)
        }

        await this.repo.put(didToKey(did), resp.newTip.buffer)

        // save the nodes from this to the repo
        // TODO: tie these some how for storage record keeping (allowing GC / charging, etc)
        const newNodes = resp.newNodes.concat(abr.getStateList_asU8())
        const newBlocks = await bytesToBlocks(newNodes)
        await this.service.putMany(newBlocks)
        return resp
    }
}
