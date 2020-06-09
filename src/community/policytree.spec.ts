import 'mocha'
import {expect} from 'chai'
import Repo from '../repo/repo'
import { Dag } from '../chaintree/dag/dag';
import { localURL, Community } from './community';
import {PolicyTree} from './policytree'
import { Client } from '../client';
import { EcdsaKey } from '../ecdsa';
import { setDataTransaction } from '../chaintree';
import {defaultAwsConfig} from '../pubsub/mqtt'
import debug from 'debug';

const log = debug("policytree.spec")
const remoteUrl = "https://a7s7o22i6d.execute-api.us-east-1.amazonaws.com/demo/graphql"

describe("PolicyTree", ()=> {

    it('subscribes', async ()=> {
        const r = await Repo.memoryRepo("policytree-subscribes")
        const r2 = await Repo.memoryRepo("policytree-subscribes2")
        const community = new Community(localURL, r)
        const community2 = new Community(localURL, r2, {pubSub: {type: "LOCAL", config: {endpoint: "ws://127.0.0.1:8081/mqtt"}}})

        const key = EcdsaKey.generate()
        const tree = await community.newEmptyTree(key)
        const id = await tree.id()
        if (id == null) {
            throw new Error("error getting id")
        }
        await community.playTransactions(tree, [setDataTransaction("/hi", "hihi")])
        await community2.identify(id, tree.key!)

        const respTip = await community.getTip(id)
        expect(respTip.toString()).to.equal(tree.tip.toString())

        const tree2 = await community2.getLatest(id)
        log("subscribe on tree2 called")

        return new Promise(async (resolve,reject)=> {
            const sub = await tree2.subscribe()
            log("subscribing to update")
            tree2.events.on('update', async ()=> {
                // test that tree2 got the updated trasaction through the subscription
                try {
                   expect((await tree2.resolveData("hi")).value).to.equal("updated")
                 } catch(e) {
                     reject(e)
                 }
                 sub.unsubscribe()
                 resolve()
           })
            setTimeout(async ()=> {
               log("play transactions")
               await community.playTransactions(tree, [setDataTransaction("/hi", "updated")])
            }, 1000)
           
        })
      
    })

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
            did: await tree.id(),
        })

        const resolveResp = await tree2.resolveData("hi")
        expect(resolveResp.value).to.equal("hihi")

        
        r.close()
    })

})