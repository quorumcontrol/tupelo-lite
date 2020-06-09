import { expect } from 'chai';
import 'mocha';

import Repo from '../../repo/repo';
import { Dag } from './dag';
import CID from 'cids';

const IpfsBlockService:any = require('ipfs-block-service');
const Ipld: any = require('ipld');
const dagCBOR = require('ipld-dag-cbor');
const multicodec = require('multicodec')

interface ICascadedNode {
  someData:string
  previous?: CID
}

interface ICascadedResponse {
  nodes: ICascadedNode[]
  cids: CID[]
}

export function generateCascadinNodes(count:number):Promise<ICascadedResponse> {
  return new Promise<ICascadedResponse>(async (resolve)=> {
    let objs:ICascadedNode[] = [{
      someData: `I am 0`
    }]
    let ids:CID[] = []
    for(let i = 1; i < count; i++) {
      const serialized = dagCBOR.util.serialize(objs[i-1])
      const cid = await dagCBOR.util.cid(serialized)
      ids[i-1] = cid
      objs[i] = {
        someData: `I am ${i}`,
        previous: cid,
      }
    }
    const serialized = dagCBOR.util.serialize(objs[count-1])
    const cid = await dagCBOR.util.cid(serialized)
    ids[count-1] = cid
    resolve({
      nodes: objs,
      cids: ids,
    })
  }) 
}

describe('Dag', ()=> {
    let repo:Repo
    let dagStore:any // IpfsBlockService
    let ipldResolver:any // Ipld instance

    before(async ()=> {
      repo = await Repo.memoryRepo('dag-test')
      dagStore = new IpfsBlockService(repo.repo)
      ipldResolver = new Ipld({blockService: dagStore})
    })

    it('optionally returns touched blocks', async ()=> {
      const cascadedResponse = await generateCascadinNodes(3)

      const result = ipldResolver.putMany(cascadedResponse.nodes, multicodec.DAG_CBOR)
      let [respCid1, respCid2, respCid3] = await result.all()
      expect(cascadedResponse.cids).to.eql([respCid1, respCid2, respCid3])

      const d = new Dag(cascadedResponse.cids[2], dagStore)
      const resp = await d.resolve("previous/previous/someData", {touchedBlocks: true})
      expect(resp.touchedBlocks).to.have.lengthOf(3)

      // and still returns them when not found

      const resp2 = await d.resolve("previous/previous/someData/otherData", {touchedBlocks: true})
      expect(resp2.touchedBlocks).to.have.lengthOf(3)
    })

    it('resolves through different nodes', async ()=> {
        const cascadedResponse = await generateCascadinNodes(3)

        const result = ipldResolver.putMany(cascadedResponse.nodes, multicodec.DAG_CBOR)
        let [respCid1, respCid2, respCid3] = await result.all()
        expect(cascadedResponse.cids).to.eql([respCid1, respCid2, respCid3])

        const d = new Dag(cascadedResponse.cids[2], dagStore)
        const resp = await d.resolve("previous/previous/someData")
        expect(resp.value).to.equal("I am 0")
    })
})