import debug from 'debug'
import { Client,updateChainTreeWithResponse } from '../client'
import { Repo } from '../repo'
import { BlockService } from './blockservice'
import { ChainTree, IBlockService } from '../chaintree'
import { Transaction } from 'tupelo-messages/transactions/transactions_pb'
import CID from 'cids'
import { AddBlockRequest } from 'tupelo-messages/services/services_pb'

const log = debug('community')

export const localURL = "http://localhost:9011/graphql"

let _defaultPromise:Promise<Community>

export class Community {
    private client:Client
    repo:Repo
    blockservice:IBlockService

    constructor(url:string, repo:Repo) {
        this.client = new Client(url)
        this.repo = repo
        this.blockservice = new BlockService(this.client,repo)
    }

    async playTransactions(tree:ChainTree, trans:Transaction[]) {
        try {
            log("playTransactions: ", tree)
            let did:string
            try {
                did = (await tree.id())!
            } catch(err) {
                console.error("error getting did: ", err)
                throw err
            }
            
            log("playTransactions: ", did)
            let abr:AddBlockRequest
            try {
                abr = await tree.newAddBlockRequest(trans)

            } catch(err) {
                console.error("error creating new ABR")
                throw err
            }
            log("abr created")
            const resp = await this.client.addBlock(abr)
            if (resp.errors) {
                console.error("errors: ", resp.errors)
                throw new Error("errors: " + resp.errors.toString())
            }
            log("tree: ", did, " updated to: ", new CID(resp.newTip).toBaseEncodedString())
            await updateChainTreeWithResponse(tree, resp)
        } catch(err) {
            console.error("playTransactions error: ", err)
            throw err
        }
        
    }

    async getTip(did: string):Promise<CID> {
        const resp = await this.client.resolve(did, "/", {touchedBlocks: true})
        if (!resp.touchedBlocks || resp.touchedBlocks.length === 0) {
            log(`getTip ${did}: Not Found`)
            throw new Error("not found")
        }
        if (resp.touchedBlocks) {
            this.blockservice.putMany(resp.touchedBlocks)
            const tip = resp.touchedBlocks[0].cid
            log(`getTip ${did}: ${tip.toBaseEncodedString()}`)
            return tip
        }
        console.error(resp.errors)
        throw new Error("errors: " + resp.errors.toString())
    }

    async getLatest(did:string):Promise<ChainTree> {
        try {
            const tip = await this.getTip(did)
            log(`getLatest ${did}: ${tip.toBaseEncodedString()}`)
            return new ChainTree({
                tip: tip,
                store: this.blockservice,
            })
        } catch(err) {
            throw err
        }
    }

    static getDefault(repo?:Repo) {
        if (_defaultPromise) {
            return _defaultPromise
        }
        _defaultPromise = new Promise<Community>(async (resolve) => {
            if (!repo) {
                repo = new Repo("default")
                await repo.init({})
                await repo.open()
            }
            // return new Community("https://8awynb7la6.execute-api.us-east-1.amazonaws.com/dev/graphql")
            resolve(new Community(localURL, repo))
        })
        return _defaultPromise
    }
}