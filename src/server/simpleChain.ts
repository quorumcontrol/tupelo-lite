import debug from 'debug'
import Repo from '../repo/repo'
import { AddBlockRequest } from 'tupelo-messages/services/services_pb'
import { NotaryGroup } from 'tupelo-messages/config/config_pb'
import { Aggregator, IValidationResponse } from './wasm'
import CID from 'cids'
import { IKey } from '../chaintree/datastore'
import { Dag, IBlock } from '../chaintree'
const Key = require("interface-datastore").Key
const dagCBOR = require('ipld-dag-cbor')
const Block = require('ipld-block');

const log = debug("server")

const ErrNotValid = "NotValid"
const ErrWrongPreviousTip = "IncorrectPreviousTip"

const ErrNotFound = "ERR_NOT_FOUND"

function didToKey(did: string): IKey {
    return new Key(`/trees/${did}`)
}

export function bytesToBlocks(bufs: Uint8Array[]): Promise<IBlock[]> {
    return Promise.all(bufs.map(async (nodeBuf) => {
        const cid = await dagCBOR.util.cid(nodeBuf)
        const block = new Block(nodeBuf, cid)
        return block
    }))
}

export class SimpleChain {
    repo: Repo

    constructor(repo: Repo, ng?: NotaryGroup) {
        if (!ng) {
            ng = new NotaryGroup()
            ng.setId("default")
        }
        Aggregator.setupValidator(ng)
        this.repo = repo
    }

    getTip(did: string) {
        return this.repo.get(didToKey(did))
    }

    async resolve(did: string, path: string) {
        let tip: CID
        try {
            const curr = await this.getTip(did)
            tip = new CID(curr)
            const dag = new Dag(tip, this.repo.repo.blocks)
            return await dag.resolve(path) // TODO: send back the blocks too
        } catch (err) {
            throw err
        }
    }

    async add(abr: AddBlockRequest): Promise<IValidationResponse> {
        const resp = await Aggregator.validate(abr)
        if (!resp.valid) {
            throw new Error(ErrNotValid)
        }
        const did = Buffer.from(abr.getObjectId_asU8()).toString('utf-8')
        try {
            const curr = await this.getTip(did)
            const tip = new CID(curr)
            if (!tip.buffer.equals(abr.getPreviousTip_asU8())) {
                throw new Error(ErrWrongPreviousTip)
            }
        } catch (err) {
            if (err.code !== ErrNotFound) {
                throw err
            }
        }
        await this.repo.put(didToKey(did), resp.newTip.buffer)

        // save the nodes from this to the repo
        // TODO: tie these some how for storage record keeping (allowing GC / charging, etc)
        const newBlocks = await bytesToBlocks(resp.newNodes.concat(abr.getStateList_asU8()))
        await this.repo.repo.blocks.putMany(newBlocks)

        return resp
    }
}
