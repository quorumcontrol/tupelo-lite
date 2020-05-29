import 'mocha'
import { expect } from 'chai'
import { Repo } from '../repo'
import { Community, localURL } from './community'
import { EcdsaKey } from '../ecdsa'
import { ChainTree, setDataTransaction } from '../chaintree'
import { reporters } from 'mocha'
import { PolicyTree } from './policytree'


describe('Community', () => {
    it('gets a chaintree tip', async () => {
        const r = await Repo.memoryRepo("communityGetsTip")
        const c = new Community(localURL, r)

        const key = EcdsaKey.generate()
        const tree = await c.newEmptyTree(key)
        const id = await tree.id()
        if (id == null) {
            throw new Error("error getting id")
        }
        await c.playTransactions(tree, [setDataTransaction("/hi", "hihi")])
        const respTip = await c.getTip(id)
        expect(respTip.toString()).to.equal(tree.tip.toString())
        r.close()
    })

    it('plays transactions', async () => {
        const r = await Repo.memoryRepo("communityPlaysTransaction")
        const c = new Community(localURL, r)

        const trans = [setDataTransaction("/test", "oh really")]

        const key = EcdsaKey.generate()
        const tree = await c.newEmptyTree(key)
        await c.playTransactions(tree, trans)

        expect((await tree.resolveData('test')).value).to.equal('oh really')
        r.close()
    })

    it('getLatest', async ()=> {
        const r = await Repo.memoryRepo("communityGetLatest")
        const c = new Community(localURL, r)

        const trans = [setDataTransaction("/test", "oh really")]

        const key = EcdsaKey.generate()
        const tree = await c.newEmptyTree(key)
        await c.playTransactions(tree, trans)

        const newTree = await c.getLatest(key.toDid())
        expect((await newTree.resolveData('test')).value).to.equal('oh really')
        r.close()
    })

    it('does not rely on in-memory blocks', async ()=> {
        const r = await Repo.memoryRepo("inmemory1")
        const c = new Community(localURL, r)

        const r2 = await Repo.memoryRepo("inmemory2")
        const c2 = new Community(localURL, r2)

        const trans = [setDataTransaction("/test", "oh really")]

        const key = EcdsaKey.generate()
        const tree = await c.newEmptyTree(key)
        await c.playTransactions(tree, trans)

        const newTree = await c2.getLatest(key.toDid())
        expect((await newTree.resolveData('test')).value).to.equal('oh really')
        r.close()
    })

    it('errors with not found on a getTip', async ()=> {
        const r = await Repo.memoryRepo("notFoundGetTip")
        const c = new Community(localURL, r)

        const key = EcdsaKey.generate() // non existant
        try {
            const tip = await c.getTip(key.toDid())
            expect(true).to.be.false // should never happen
        } catch(err) {
            expect(err.message).to.include("not found")
        }
    })
})