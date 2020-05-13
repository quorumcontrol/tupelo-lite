import 'mocha'
import {expect} from 'chai'
import {SimpleChain} from './simpleChain'
import {Repo} from '../repo/repo'
import { EcdsaKey } from '../ecdsa';
import ChainTree, { setDataTransaction } from '../chaintree/chaintree';


const MemoryDatastore: any = require('interface-datastore').MemoryDatastore;
const IpfsBlockService: any = require('ipfs-block-service');


const testRepo = async (name:string) => {
    const repo = new Repo(name, {
      lock: 'memory',
      storageBackends: {
        root: MemoryDatastore,
        blocks: MemoryDatastore,
        keys: MemoryDatastore,
        datastore: MemoryDatastore
      }
    })
    await repo.init({})
    await repo.open()
    return repo
  }

describe("SimpleChain", ()=> {
    it('adds', async ()=> {
        let repo = await testRepo("adds")
        let chain = new SimpleChain(repo)

        const key = EcdsaKey.generate()
        const tree = await ChainTree.newEmptyTree(new IpfsBlockService(repo.repo), key)
        const abr = await tree.newAddBlockRequest([setDataTransaction("hi", "hi")])

        try {
            await chain.getTip(key.toDid())
            // should never get here
            expect(true).to.be.false
        } catch(e) {
            expect(e.code).to.equal("ERR_NOT_FOUND")
        }

        const resp = await chain.add(abr)
        expect(resp.valid).to.be.true

        expect(await chain.getTip(key.toDid())).to.equal(resp.newTip.buffer)
        repo.close()
    })

    it('resolves', async ()=> {
        let repo = await testRepo("resolves")
        let chain = new SimpleChain(repo)

        const key = EcdsaKey.generate()
        const tree = await ChainTree.newEmptyTree(new IpfsBlockService(repo.repo), key)
        const abr = await tree.newAddBlockRequest([setDataTransaction("hi", "hi")])
        const resp = await chain.add(abr)
        expect(resp.valid).to.be.true

        const resolveResp = await chain.resolve(key.toDid(), "/tree/data/hi")
        expect(resolveResp.value).to.equal("hi")
        repo.close()
    })

})