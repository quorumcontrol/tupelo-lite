import 'mocha'
import {expect} from 'chai'
import Repo from '../repo/repo'
import {generateCascadinNodes} from '../chaintree/dag/dag.spec'
import { Dag } from '../chaintree/dag/dag';
import { localURL, Community } from './community';
import {PolicyTree} from './policytree'
import { Client } from '../client';
import { EcdsaKey } from '../ecdsa';
import { setDataTransaction } from '../chaintree';

describe("PolicyTree", ()=> {

    it('resolves using remote resolve', async ()=> {

        const r = await Repo.memoryRepo("policytree-resolves")
        const community = new Community(localURL, r)
        const c = community.client

        const key = EcdsaKey.generate()
        const tree = await community.newEmptyTree(key)
        const id = await tree.id()
        if (id == null) {
            throw new Error("error getting id")
        }
        await community.playTransactions(tree, [setDataTransaction("/hi", "hihi")])
        const respTip = await community.getTip(id)
        expect(respTip.toString()).to.equal(tree.tip.toString())

        // now that we have a chaintree remotely if we add a new local tree
        // first get the root block
        const resp = await tree.resolve("/", {touchedBlocks: true})
        expect(resp.remainderPath).to.have.lengthOf(0)
        expect(resp.touchedBlocks).to.have.lengthOf(1)

        const r2 = await Repo.memoryRepo("policytree-resolves2")
        const service = r2.toBlockservice()
        service.put(await community.blockservice.get(resp.touchedBlocks![0]))
        // const community2 = new Community(localURL, r2)

        const tree2 = new PolicyTree({
            client: c,
            store: service,
            tip: resp.touchedBlocks![0],
        })

        const resolveResp = await tree2.resolveData("hi")
        expect(resolveResp.value).to.equal("hihi")

        
        r.close()
    })

})