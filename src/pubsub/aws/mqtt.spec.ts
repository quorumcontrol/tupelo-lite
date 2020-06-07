import 'mocha';
import {expect} from 'chai';
import './mqtt'; // for the side effect of configuring Amplify
import { PubSub, Auth } from 'aws-amplify';
import {Repo} from '../../repo';
import {Community} from '../../community/community';
import { authenticatePubsub } from './mqtt';
import { setDataTransaction } from '../../chaintree';

const api = 'https://a7s7o22i6d.execute-api.us-east-1.amazonaws.com/demo/graphql';

describe("MQTT", ()=> {

    it('does not error', async ()=> {
        const repo = await Repo.memoryRepo("mqttSanity")
        const community = new Community(api, repo)
        const root = await community.createRandom()
        const did = await root.id()
        await community.playTransactions(root, [setDataTransaction("/onServer", true)])
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
            setTimeout(()=> {
                PubSub.publish('public/userToUser/test', { msg: 'Hello to all subscribers!' });
                console.log("published")

            },1000)
        })
    })
})