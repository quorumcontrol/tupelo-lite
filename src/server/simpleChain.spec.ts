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

    it('supports ownership changes', async ()=> {
        let repo = await testRepo("ownershipChanges")
        let chain = new SimpleChain(repo)
        const key = EcdsaKey.generate()
        const newKey = EcdsaKey.generate()
        console.log(`key did: ${key.toDid()} newKey: ${newKey.toDid()}`)

        const tree = await ChainTree.newEmptyTree(new IpfsBlockService(repo.repo), key)
        const abr = await tree.newAddBlockRequest([setOwnershipTransaction([newKey.address()])])

        console.log("----- first abr", Buffer.from(abr.getObjectId_asU8()).toString('utf-8'))
        const resp = await chain.add(abr)
        expect(resp.valid).to.be.true
        await updateChainTreeWithResponse(tree,resp)
        console.log("resolve: ", (await tree.resolve("tree/_tupelo/authentications")))
        expect((await tree.resolve("tree/_tupelo/authentications")).value).to.have.members([newKey.address()])
        
        tree.key = newKey
        const abr2 = await tree.newAddBlockRequest([setDataTransaction("afterOwnershipChange", "works")])
        console.log("----- 2nd abr", Buffer.from(abr.getObjectId_asU8()).toString('utf-8'))

        const resp2 = await chain.add(abr2)
        expect(resp2.valid).to.be.true

    })


    it('grafts ownership through a DID', async ()=> {  
        let repo = await testRepo("graftsThroughDID")
        let chain = new SimpleChain(repo)
        
        const parentKey = EcdsaKey.generate()
        console.log("parent did is: ", parentKey.toDid())
        const parentTree = await ChainTree.newEmptyTree(new IpfsBlockService(repo.repo), parentKey)
        // need to make sure the parentTree exists with the signers
        let resp = await chain.add(await parentTree.newAddBlockRequest([setDataTransaction("hi", "hi")]))
        expect(resp.valid).to.be.true

        const childKey = EcdsaKey.generate()
        const childTree = await ChainTree.newEmptyTree(new IpfsBlockService(repo.repo), childKey)
        console.log("child key is: ", childKey.toDid())

        resp = await chain.add(await childTree.newAddBlockRequest([setOwnershipTransaction([(await parentTree.id())!])]))
        expect(resp.valid).to.be.true
        await updateChainTreeWithResponse(childTree, resp)
        console.log(await childTree.resolve("/tree/_tupelo/authentications"))
        expect(childTree.tip.toBaseEncodedString()).to.equal(resp.newTip.toBaseEncodedString())
        childTree.key = parentKey
  
        resp = await chain.add(await childTree.newAddBlockRequest([setDataTransaction("parentOwnsMe", true)]))
        expect(resp.valid).to.be.true
      })
  
    //   it('grafts DID-based ownership through an intermediary tree', async ()=> {
    //     const c = await Community.getDefault()
    //     // create an organization tree, a user key and an asset, 
    //     // the user will be in a list on the organization tree
    //     // and the asset will be owned by that list and the organization did
    //     // the user should then be able to play a transaction on the asset
  
    //     const organizationKey = await EcdsaKey.generate()
    //     const organizationTree = await ChainTree.newEmptyTree(c.blockservice, organizationKey)
    //     const organizationDid = await organizationTree.id()
  
    //     const userKey = await EcdsaKey.generate()
    //     const userTree = await ChainTree.newEmptyTree(c.blockservice, userKey)
    //     const userDid = await userTree.id()
    //     await c.playTransactions(userTree, [
    //       setDataTransaction('exists', true) // just making sure it exists
    //     ])
  
    //     const assetKey = await EcdsaKey.generate()
    //     const assetTree = await ChainTree.newEmptyTree(c.blockservice, assetKey)
  
    //     await c.playTransactions(organizationTree, [
    //       setDataTransaction('users', [userDid])
    //     ])
  
    //     await c.playTransactions(assetTree, [
    //       setOwnershipTransaction([organizationDid!, `${organizationDid}/tree/data/users`])
    //     ])
  
    //     assetTree.key = userKey
  
    //     await c.playTransactions(assetTree, [setDataTransaction("worked", true)])
    //     const resp = assetTree.resolveData("/worked")
    //     expect((await resp).value).to.eql(true)
    //   })
  
    //   it('grafts path-based ownership', async ()=> {
    //     const c = await Community.getDefault()
  
    //     const parentKey = await EcdsaKey.generate()
    //     const parentTree = await ChainTree.newEmptyTree(c.blockservice, parentKey)
    //     const parentTreeDid = await parentTree.id()
  
    //     const newParentKey = await EcdsaKey.generate()
  
    //     // need to make sure the parentTree exists with the signers
    //     // also change the parent owner to make sure the child transactions are 
    //     // actually looking at the path and not the original ownership.
    //     await c.playTransactions(parentTree, [
    //       setOwnershipTransaction([await newParentKey.address()]),
    //       setDataTransaction("ownershipPath", (await parentKey.address()))
    //     ])
  
    //     const childKey = await EcdsaKey.generate()
    //     const childTree = await ChainTree.newEmptyTree(c.blockservice, childKey)
  
    //     await c.playTransactions(childTree, [setOwnershipTransaction([`${parentTreeDid}/tree/data/ownershipPath`])])
  
    //     childTree.key = parentKey
  
    //     await c.playTransactions(childTree, [setDataTransaction("parentOwnsMe", true)])
    //     const resp = childTree.resolveData("/parentOwnsMe")
    //     expect((await resp).value).to.eql(true)
    //   })

})