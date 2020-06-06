import 'mocha';
import {expect} from 'chai';
import './mqtt'; // for the side effect of configuring Amplify
import { PubSub, Auth } from 'aws-amplify';
import { rejects } from 'assert';

describe("MQTT", ()=> {

    it('does not error', async ()=> {
        return new Promise(async (resolve,reject)=> {
            Auth.federatedSignIn(
                "developer",
                {
                    identity_id: "us-east-1:c5de5e79-6d56-4bc6-9f1d-b634f892b6a0",
                    token: "eyJraWQiOiJ1cy1lYXN0LTExIiwidHlwIjoiSldTIiwiYWxnIjoiUlM1MTIifQ.eyJzdWIiOiJ1cy1lYXN0LTE6YzVkZTVlNzktNmQ1Ni00YmM2LTlmMWQtYjYzNGY4OTJiNmEwIiwiYXVkIjoidXMtZWFzdC0xOjdmMzg5NjA3LWU2OTItNDZiYi1iMzU4LTI0ODgxODdjZDRjYSIsImFtciI6WyJhdXRoZW50aWNhdGVkIiwiZGVtb0lkZW50aXR5UHJvdmlkZXIiLCJkZW1vSWRlbnRpdHlQcm92aWRlcjp1cy1lYXN0LTE6N2YzODk2MDctZTY5Mi00NmJiLWIzNTgtMjQ4ODE4N2NkNGNhOmRpZDp0ZXN0Il0sImlzcyI6Imh0dHBzOi8vY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tIiwiZXhwIjoxNTkxNDY3NTk5LCJpYXQiOjE1OTE0NjY2OTl9.FgRaeDmI4VMYkJja-Fp6ZJUrQwf2qixCPM-7F9AL0ruCBaUGO-C7StRPArtcc9xFZ8yCjh1grytSV91tQcVnxbwOZTZKdEdAX3zVQEO_yYhv2_aGJN9wZp1dZTn8jH_3wufEm_Xij7we1NmemAy3mE5grOAP6uGF5m0Cgi7_BFK-lLXS3ogxryMId0rohR07qqYHCTPv07gVaAM6XCtojpdpO-lHtYo9iFVi_oXjsyWH9PmNviMtJebA9YsTyZd4Gldl3uT9FklnQANJu_m_cVz6pagTRm1BxzgjbYsCsV7ZY1D7AeZutH57hcPcxEmF7_gC8C08FLQQT6I4m2LzmQ",
                    expires_at: 20 * 1000 + new Date().getTime() // the expiration timestamp
                },
                {name: "did:test"}
            ).then(async (cred) => {
                // If success, you will get the AWS credentials
                console.log("signin: ", cred);
                return Auth.currentAuthenticatedUser();
            }).then(async (user) => {
                const cred = await Auth.currentCredentials()

                // If success, the user object you passed in Auth.federatedSignIn
                console.log(user);
    
    
                PubSub.subscribe('myTopic').subscribe({
                    next: data => { console.log('Message received', data); resolve() },
                    error: error => console.error("sub error: ", error),
                    complete: () => console.log('Done'),
                });
                console.log("subscribed")
                setTimeout(()=> {
                    PubSub.publish('myTopic', { msg: 'Hello to all subscribers!' });
                    console.log("published")

                },1000)
            }).catch(e => {
                console.log("error in sequence: ", e)
                reject(e)
            });
        })
        

        
    })
})