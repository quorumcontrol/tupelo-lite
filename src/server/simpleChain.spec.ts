import 'mocha'
import {expect} from 'chai'
import {SimpleChain, bytesToBlocks} from './simpleChain'
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

        let expectedUndefinedTip = await chain.getTip(key.toDid())
        expect(expectedUndefinedTip).to.be.undefined

        const resp = await chain.add(abr)
        expect(resp.valid).to.be.true

        expect((await chain.getTip(key.toDid()))!.equals(resp.newTip)).to.be.true
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
        expect(resolveResp!.value).to.equal("hi")
        repo.close()
    })

    it('builds off of existing chaintrees', async ()=> {
        let repo = await testRepo("buildsOnExisting")
        let chain = new SimpleChain(repo)

        const key = EcdsaKey.generate()
        const tree = await ChainTree.newEmptyTree(new IpfsBlockService(repo.repo), key)
        const abr = await tree.newAddBlockRequest([setDataTransaction("hi", "hi")])
        const resp = await chain.add(abr)
        expect(resp.valid).to.be.true

        const newBlocks = await bytesToBlocks(resp.newNodes)
        await tree.store.putMany(newBlocks)
        tree.tip = resp.newTip

        const resolveResp = await tree.resolveData("hi")
        expect(resolveResp!.value).to.equal("hi")

        // now lets build *another* ABR
        const abr2 = await tree.newAddBlockRequest([setDataTransaction("hi", "bye")])
        const resp2 = await chain.add(abr2)
        expect(resp2.valid).to.be.true
        const resolveResp2 = await chain.resolve(key.toDid(), "/tree/data/hi")
        expect(resolveResp2!.value).to.equal("bye")


        repo.close()
    })

})