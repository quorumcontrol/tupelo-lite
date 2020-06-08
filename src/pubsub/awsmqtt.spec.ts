import 'mocha';
import {expect} from 'chai';
import './mqtt'; // for the side effect of configuring Amplify
import { PubSub, Auth } from 'aws-amplify';
import {Repo} from '../repo';
import {Community} from '../community/community';
import { authenticatePubsub } from './mqtt';
import { setDataTransaction, ChainTree } from '../chaintree';
import { EcdsaKey } from '../ecdsa';

const api = 'https://a7s7o22i6d.execute-api.us-east-1.amazonaws.com/demo/graphql';

//Skipping because this is real network calls
describe.skip("AWS MQTT", ()=> {

    it('does not error', async ()=> {
        const repo = await Repo.memoryRepo("mqttSanity")
        const community = new Community(api, repo)
        const key = await EcdsaKey.passPhraseKey(Buffer.from("test1"), Buffer.from("mqtt-test"))

        const root = await community.getLatest(key.toDid())
        root.key = key
        const did = await root.id()
        // await community.playTransactions(root, [setDataTransaction("/onServer", true)])
        community.identify(did!, root.key!)

        const token = await community.client.identityToken()
        expect(token.result).to.be.true
        await authenticatePubsub(did!, token)
        
        return new Promise(async (resolve,reject) => {

            PubSub.subscribe('public/userToUser/test').subscribe({
                next: data => { console.log('Message received', data); resolve() },
                error: error => console.error("sub error: ", error),
                complete: () => console.log('Done'),
            });
            console.log("subscribed")
            setTimeout(async ()=> {
                try {
                    await PubSub.publish('public/userToUser/test', { msg: 'Hello to all subscribers!' });
                } catch(e) {
                    console.error("error: ", e)
                    reject(e)
                }
                console.log("published")

            },1000)
        })
    })
})