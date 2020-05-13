import debug from 'debug'
import Repo from '../repo/repo'
import { AddBlockRequest } from 'tupelo-messages/services/services_pb'
import { NotaryGroup } from 'tupelo-messages/config/config_pb'
import { Aggregator, IValidationResponse } from './wasm'
import CID from 'cids'
import { IKey } from '../chaintree/datastore'

const Key = require("interface-datastore").Key

const log = debug("server")

const ErrNotValid = "NotValid"
const ErrWrongPreviousTip = "IncorrectPreviousTip"

const ErrNotFound = "ERR_NOT_FOUND"

function didToKey(did:string):IKey {
    return new Key(`/trees/${did}`)
}

export class SimpleChain {
    repo: Repo

    constructor(repo:Repo, ng?:NotaryGroup) {
        if (!ng) {
            ng = new NotaryGroup()
            ng.setId("default")
        }
        Aggregator.setupValidator(ng)
        this.repo = repo
    }

    getTip(did:string) {
        return this.repo.get(didToKey(did))
    }

    async add(abr:AddBlockRequest):Promise<IValidationResponse> {
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
        } catch(err) {
            if (err.code !== ErrNotFound) { 
                throw err
            }
        }
        await this.repo.put(didToKey(did), resp.newTip.buffer)
        // TODO save all the blocks

        return resp
    }
}
