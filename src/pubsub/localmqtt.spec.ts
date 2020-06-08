import 'mocha';
import {expect} from 'chai';
import { configurePubSubForLocal } from './mqtt';
import { PubSub } from 'aws-amplify';

describe("local mqtt", ()=> {
    before(()=> {
        configurePubSubForLocal({endpoint: "ws://127.0.0.1:8081/mqtt"})
    })

    it("publishes and subscribes", async ()=> {
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
