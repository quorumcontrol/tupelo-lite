import { IBlockService, IBlock, IBitSwap } from "../chaintree/dag/dag"
import { Client } from "../client"
import { Repo } from "../repo"
import CID from "cids";
import debug from 'debug';

const log = debug("community.blockservice")
const IpfsBlockService: any = require('ipfs-block-service');

export class BlockService implements IBlockService {
    client:Client
    repo:Repo
    private service:any // IpfsBlockService

    constructor(client:Client, repo:Repo) {
        this.client = client
        this.repo = repo
        this.service = new IpfsBlockService(repo.repo)
    }

    async put(block: IBlock) {
        return this.service.put(block)
    }

    putMany(blocks: IBlock[]) {
        return this.service.putMany(blocks)
    }

    setExchange(bitswap: IBitSwap): void {
        throw new Error("unsupported")
    }

    unsetExchange(): void {
        throw new Error("unsupported")
    }

    delete(cid: CID): Promise<any> {
        return  new IpfsBlockService(this.repo.repo).delete(cid)
    }

    async get(cid:CID):Promise<IBlock> {
        try {
            return await this.service.get(cid)
        } catch(err) {
            if (err.code === "ERR_NOT_FOUND") {
                log(`${cid.toBaseEncodedString()} not found locally, returning client.get`)
                try {
                    const blk = await this.client.get(cid)
                    this.service.put(blk)
                    return blk
                } catch(err) {
                    log("error calling client get", err)
                    throw err
                }
            }
            log("service err: ", err, "code: ", err.code)
            throw err
        }
    }
   
    getMany(cids: CID[]): AsyncIterator<IBlock> {
        return  new IpfsBlockService(this.repo.repo).getMany(cids)
    }

    hasExchange(): boolean {
        return false
    }


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