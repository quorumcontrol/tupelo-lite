import Amplify, { PubSub, Auth } from 'aws-amplify';
import { AWSIoTProvider } from '@aws-amplify/pubsub/lib/Providers';
import WebSocket from 'ws';
import { IClientIdentityToken } from '../../client';

declare const global:any;
global.WebSocket = WebSocket;

// TODO: fetch this from configuration

// Apply plugin with configuration
Amplify.addPluggable(new AWSIoTProvider({
   aws_pubsub_region: 'us-east-1',
   aws_pubsub_endpoint: 'wss://a1jse42egazw1y.iot.us-east-1.amazonaws.com/mqtt',
}));

Amplify.configure({
    Auth: {
        // REQUIRED only for Federated Authentication - Amazon Cognito Identity Pool ID
        identityPoolId: 'us-east-1:7f389607-e692-46bb-b358-2488187cd4ca',

        // REQUIRED - Amazon Cognito Region
        region: 'us-east-1',
    }
});

export async function authenticatePubsub(did:string, token:IClientIdentityToken) {
    await Auth.federatedSignIn(
        "developer",
        {
            identity_id: token.id,
            token: token.token,
            expires_at: 20 * 1000 + new Date().getTime() // the expiration timestamp
        },
        {name: did}
    )
    return Auth.currentAuthenticatedUser()
}