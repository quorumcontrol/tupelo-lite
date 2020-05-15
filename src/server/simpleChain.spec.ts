import 'mocha'
import {expect} from 'chai'
import {SimpleChain, bytesToBlocks, updateChainTreeWithResponse} from './simpleChain'
import {Repo} from '../repo/repo'
import { EcdsaKey } from '../ecdsa';
import ChainTree, { setDataTransaction, setOwnershipTransaction } from '../chaintree/chaintree';
import { CID } from '../chaintree';


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

        await updateChainTreeWithResponse(tree,resp)

        const resolveResp = await tree.resolveData("hi")
        expect(resolveResp.value).to.equal("hi")

        // now lets build *another* ABR
        const abr2 = await tree.newAddBlockRequest([setDataTransaction("hi", "bye")])
        const resp2 = await chain.add(abr2)
        expect(resp2.valid).to.be.true
        const resolveResp2 = await chain.resolve(key.toDid(), "/tree/data/hi")
        expect(resolveResp2!.value).to.equal("bye")


        repo.close()
    })

    it('supports ownership changes', async ()=> {
        let repo = await testRepo("ownershipChanges")
        let chain = new SimpleChain(repo)
        const key = EcdsaKey.generate()
        const newKey = EcdsaKey.generate()
        const tree = await ChainTree.newEmptyTree(new IpfsBlockService(repo.repo), key)
        const abr = await tree.newAddBlockRequest([setOwnershipTransaction([newKey.address()])])

        const resp = await chain.add(abr)
        expect(resp.valid).to.be.true
        await updateChainTreeWithResponse(tree,resp)
        expect((await tree.resolve("tree/_tupelo/authentications")).value).to.have.members([newKey.address()])
        
        tree.key = newKey
        const abr2 = await tree.newAddBlockRequest([setDataTransaction("afterOwnershipChange", "works")])

        const resp2 = await chain.add(abr2)
        expect(resp2.valid).to.be.true

    })


    it('grafts ownership through a DID', async ()=> {  
        let repo = await testRepo("graftsThroughDID")
        let chain = new SimpleChain(repo)
        
        const parentKey = EcdsaKey.generate()
        const parentTree = await ChainTree.newEmptyTree(new IpfsBlockService(repo.repo), parentKey)
        // need to make sure the parentTree exists with the signers
        let resp = await chain.add(await parentTree.newAddBlockRequest([setDataTransaction("hi", "hi")]))
        expect(resp.valid).to.be.true

        const childKey = EcdsaKey.generate()
        const childTree = await ChainTree.newEmptyTree(new IpfsBlockService(repo.repo), childKey)

        resp = await chain.add(await childTree.newAddBlockRequest([setOwnershipTransaction([(await parentTree.id())!])]))
        expect(resp.valid).to.be.true
        await updateChainTreeWithResponse(childTree, resp)
        expect(childTree.tip.toBaseEncodedString()).to.equal(resp.newTip.toBaseEncodedString())
        childTree.key = parentKey
  
        resp = await chain.add(await childTree.newAddBlockRequest([setDataTransaction("parentOwnsMe", true)]))
        expect(resp.valid).to.be.true
      })
  
      it('grafts DID-based ownership through an intermediary tree', async ()=> {
        let repo = await testRepo("graftsThroughIntermediary")
        let chain = new SimpleChain(repo)
        const service = new IpfsBlockService(repo.repo)

        // create an organization tree, a user key and an asset, 
        // the user will be in a list on the organization tree
        // and the asset will be owned by that list and the organization did
        // the user should then be able to play a transaction on the asset
  
        const organizationKey = EcdsaKey.generate()
        const organizationTree = await ChainTree.newEmptyTree(service, organizationKey)
        const organizationDid = await organizationTree.id()
  
        const userKey = await EcdsaKey.generate()
        const userTree = await ChainTree.newEmptyTree(service, userKey)
        const userDid = await userTree.id()
        const abr1 = await userTree.newAddBlockRequest([ setDataTransaction('exists', true)])  // just making sure it exists
        let resp = await chain.add(abr1)
        await updateChainTreeWithResponse(userTree, resp)
  
        const assetKey = await EcdsaKey.generate()
        const assetTree = await ChainTree.newEmptyTree(service, assetKey)
        const abr2 = await organizationTree.newAddBlockRequest([setDataTransaction('users', [userDid])])
        resp = await chain.add(abr2)
        await updateChainTreeWithResponse(organizationTree, resp)
  
        const abr3 = await assetTree.newAddBlockRequest([setOwnershipTransaction([organizationDid!, `${organizationDid}/tree/data/users`])])
        resp = await chain.add(abr3)
        await updateChainTreeWithResponse(assetTree, resp)

        assetTree.key = userKey
  
        const abr4 = await assetTree.newAddBlockRequest([setDataTransaction("worked", true)])
        resp = await chain.add(abr4)
        await updateChainTreeWithResponse(assetTree, resp)

        const resolveResp = await assetTree.resolveData("/worked")
        expect(resolveResp.value).to.eql(true)
      })
  
      it('grafts path-based ownership', async ()=> {
        let repo = await testRepo('grafts path-based ownership')
        let chain = new SimpleChain(repo)
        const service = new IpfsBlockService(repo.repo)
  
        const parentKey = EcdsaKey.generate()
        const parentTree = await ChainTree.newEmptyTree(service, parentKey)
        const parentTreeDid = await parentTree.id()
  
        const newParentKey = EcdsaKey.generate()
  
        // need to make sure the parentTree exists with the signers
        // also change the parent owner to make sure the child transactions are 
        // actually looking at the path and not the original ownership.
        const abr = await parentTree.newAddBlockRequest([
          setOwnershipTransaction([newParentKey.address()]),
          setDataTransaction("ownershipPath", (parentKey.address()))
        ])
        let resp = await chain.add(abr)
        await updateChainTreeWithResponse(parentTree, resp)
  
        const childKey = EcdsaKey.generate()
        const childTree = await ChainTree.newEmptyTree(service, childKey)
  
        const abr2 = await childTree.newAddBlockRequest([setOwnershipTransaction([`${parentTreeDid}/tree/data/ownershipPath`])])
        resp = await chain.add(abr2)
        await updateChainTreeWithResponse(childTree, resp)

        childTree.key = parentKey
  
        const abr3 = await childTree.newAddBlockRequest([setDataTransaction("parentOwnsMe", true)])
        resp = await chain.add(abr3)
        await updateChainTreeWithResponse(childTree, resp)

        expect((await childTree.resolveData("/parentOwnsMe")).value).to.eql(true)
      })

})