import 'mocha'
import { expect } from 'chai'
import { Client, updateChainTreeWithResponse, graphQLtoBlocks } from './client'
import { ChainTree, setDataTransaction, CID, setOwnershipTransaction } from './chaintree'
import Repo from './repo/repo'
import { EcdsaKey } from './ecdsa'

const IpfsBlockService: any = require('ipfs-block-service');
const MemoryDatastore: any = require('interface-datastore').MemoryDatastore;

const testRepo = async (name: string) => {
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

const cli = new Client("http://localhost:9011/graphql")

describe("Client", () => {
    it('adds blocks', async () => {
        const repo = await testRepo("addsBlocks")
        // use the test server to create a query and mutate function

        const tree = await ChainTree.createRandom(new IpfsBlockService(repo.repo))
        const abr = await tree.newAddBlockRequest([setDataTransaction("hi", "hi")])

        const resp = await cli.addBlock(abr)
        expect(resp.errors).to.be.undefined
        expect(resp.valid).to.be.true
        expect(resp.newBlocks).to.have.lengthOf(6)

        const blks = await graphQLtoBlocks(resp.newBlocks)
        await repo.repo.blocks.putMany(blks)

        tree.tip = new CID(resp.newTip)
        expect((await tree.resolveData("hi")).value).to.equal("hi")

        // and now querying the resolve works
        const queryResp = await cli.resolve((await tree.id())!, "tree/data/hi")
        expect(queryResp.value).to.equal("hi")

        repo.close()
    })

    it('gets ipldblocks', async () => {
        const repo = await testRepo("getBlock")
        // use the test server to create a query and mutate function

        const tree = await ChainTree.createRandom(new IpfsBlockService(repo.repo))
        const abr = await tree.newAddBlockRequest([setDataTransaction("hi", "hi")])

        const resp = await cli.addBlock(abr)
        expect(resp.errors).to.be.undefined
        expect(resp.valid).to.be.true
        expect(resp.newBlocks).to.have.lengthOf(6)

        const blks = await graphQLtoBlocks(resp.newBlocks)
        const blk = await cli.get(blks[0].cid)
        expect(blk.cid.toBaseEncodedString()).to.equal(blks[0].cid.toBaseEncodedString())

        // now test that it can work to resolve through the chaintree
        const localOnlyTree = new ChainTree({
            tip: new CID(resp.newTip),
            store: cli,
        })

        expect((await localOnlyTree.resolveData("hi")).value).to.equal("hi")
        repo.close()
    })

    it('returns touched blocks', async ()=> {
        const repo = await testRepo("clientGetTouchedBlocks")
        // use the test server to create a query and mutate function

        const tree = await ChainTree.createRandom(new IpfsBlockService(repo.repo))
        const abr = await tree.newAddBlockRequest([setDataTransaction("hi", "hi")])

        const resp = await cli.addBlock(abr)
        expect(resp.errors).to.be.undefined

        const resolveResp = await cli.resolve((await tree.id())!, "/", {touchedBlocks: true})
        expect(resolveResp.touchedBlocks).to.have.lengthOf(1)
        repo.close()
    })

    it('builds off of existing chaintrees', async () => {
        let repo = await testRepo("buildsOnExisting")

        const key = EcdsaKey.generate()
        const tree = await ChainTree.newEmptyTree(new IpfsBlockService(repo.repo), key)
        const abr = await tree.newAddBlockRequest([setDataTransaction("hi", "hi")])
        const resp = await cli.addBlock(abr)
        expect(resp.valid).to.be.true

        await updateChainTreeWithResponse(tree, resp)

        const resolveResp = await tree.resolveData("hi")
        expect(resolveResp.value).to.equal("hi")

        // now lets build *another* ABR
        const abr2 = await tree.newAddBlockRequest([setDataTransaction("hi", "bye")])
        const resp2 = await cli.addBlock(abr2)
        expect(resp2.valid).to.be.true
        const resolveResp2 = await cli.resolve(key.toDid(), "/tree/data/hi")
        expect(resolveResp2!.value).to.equal("bye")

        repo.close()
    })

    it('supports ownership changes', async () => {
        let repo = await testRepo("ownershipChanges")
        const key = EcdsaKey.generate()
        const newKey = EcdsaKey.generate()
        const tree = await ChainTree.newEmptyTree(new IpfsBlockService(repo.repo), key)
        const abr = await tree.newAddBlockRequest([setOwnershipTransaction([newKey.address()])])

        const resp = await cli.addBlock(abr)
        expect(resp.valid).to.be.true
        await updateChainTreeWithResponse(tree, resp)
        expect((await tree.resolve("tree/_tupelo/authentications")).value).to.have.members([newKey.address()])

        tree.key = newKey
        const abr2 = await tree.newAddBlockRequest([setDataTransaction("afterOwnershipChange", "works")])

        const resp2 = await cli.addBlock(abr2)
        expect(resp2.valid).to.be.true

        repo.close()
    })

    it('grafts ownership through a DID', async () => {
        let repo = await testRepo("graftsThroughDID")

        const parentKey = EcdsaKey.generate()
        const parentTree = await ChainTree.newEmptyTree(new IpfsBlockService(repo.repo), parentKey)
        // need to make sure the parentTree exists with the signers
        let resp = await cli.addBlock(await parentTree.newAddBlockRequest([setDataTransaction("hi", "hi")]))
        expect(resp.valid).to.be.true

        const childKey = EcdsaKey.generate()
        const childTree = await ChainTree.newEmptyTree(new IpfsBlockService(repo.repo), childKey)

        resp = await cli.addBlock(await childTree.newAddBlockRequest([setOwnershipTransaction([(await parentTree.id())!])]))
        expect(resp.valid).to.be.true
        await updateChainTreeWithResponse(childTree, resp)
        expect(childTree.tip.toBaseEncodedString()).to.equal(resp.newTip)
        childTree.key = parentKey

        resp = await cli.addBlock(await childTree.newAddBlockRequest([setDataTransaction("parentOwnsMe", true)]))
        expect(resp.valid).to.be.true

        repo.close()
    })

    it('grafts DID-based ownership through an intermediary tree', async () => {
        let repo = await testRepo("graftsThroughIntermediary")
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
        const abr1 = await userTree.newAddBlockRequest([setDataTransaction('exists', true)])  // just making sure it exists
        let resp = await cli.addBlock(abr1)
        await updateChainTreeWithResponse(userTree, resp)

        const assetKey = await EcdsaKey.generate()
        const assetTree = await ChainTree.newEmptyTree(service, assetKey)
        const abr2 = await organizationTree.newAddBlockRequest([setDataTransaction('users', [userDid])])
        resp = await cli.addBlock(abr2)
        await updateChainTreeWithResponse(organizationTree, resp)

        const abr3 = await assetTree.newAddBlockRequest([setOwnershipTransaction([organizationDid!, `${organizationDid}/tree/data/users`])])
        resp = await cli.addBlock(abr3)
        await updateChainTreeWithResponse(assetTree, resp)

        assetTree.key = userKey

        const abr4 = await assetTree.newAddBlockRequest([setDataTransaction("worked", true)])
        resp = await cli.addBlock(abr4)
        await updateChainTreeWithResponse(assetTree, resp)

        const resolveResp = await assetTree.resolveData("/worked")
        expect(resolveResp.value).to.eql(true)

        repo.close()
    })

    it('grafts path-based ownership', async () => {
        let repo = await testRepo('grafts path-based ownership')
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
        let resp = await cli.addBlock(abr)
        await updateChainTreeWithResponse(parentTree, resp)

        const childKey = EcdsaKey.generate()
        const childTree = await ChainTree.newEmptyTree(service, childKey)

        const abr2 = await childTree.newAddBlockRequest([setOwnershipTransaction([`${parentTreeDid}/tree/data/ownershipPath`])])
        resp = await cli.addBlock(abr2)
        await updateChainTreeWithResponse(childTree, resp)

        childTree.key = parentKey

        const abr3 = await childTree.newAddBlockRequest([setDataTransaction("parentOwnsMe", true)])
        resp = await cli.addBlock(abr3)
        await updateChainTreeWithResponse(childTree, resp)

        expect((await childTree.resolveData("/parentOwnsMe")).value).to.eql(true)

        repo.close()
    })
})