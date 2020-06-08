import 'mocha';
import {expect} from 'chai';
import { configurePubSubForLocal } from './mqtt';
import { PubSub } from 'aws-amplify';
import debug from 'debug';

const log = debug("localmqtttest")

describe("local mqtt", ()=> {
    before(()=> {
        configurePubSubForLocal({endpoint: "ws://127.0.0.1:8081/mqtt"})
    })

    it("publishes and subscribes", ()=> {
        return new Promise(async (resolve,reject) => {

            PubSub.subscribe('public/userToUser/test').subscribe({
                next: data => { log('Message received', data); resolve() },
                error: error => log("sub error: ", error),
                complete: () => log('Done'),
            });
            log("subscribed")
            setTimeout(async ()=> {
                try {
                    await PubSub.publish('public/userToUser/test', { msg: 'Hello to all subscribers!' });
                } catch(e) {
                    console.error("error: ", e)
                    reject(e)
                }
                log("published")

            },100)
        })
    })
})
