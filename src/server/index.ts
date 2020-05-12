import debug from 'debug'
import Repo from '../repo/repo'
import { AddBlockRequest } from 'tupelo-messages/services/services_pb'
import { NotaryGroup } from 'tupelo-messages'
import { Aggregator } from './wasm'

const log = debug("server")

class SimpleChain {
    repo: Repo

    constructor(repo:Repo, ng?:NotaryGroup) {
        if (!ng) {
            ng = new NotaryGroup()
            ng.setId("default")
        }
        Aggregator.setupValidator(ng)
        this.repo = repo
    }

    async add(abr:AddBlockRequest) {
        const resp = await Aggregator.validate(abr)
    }

}