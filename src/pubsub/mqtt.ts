import Amplify, { Auth } from 'aws-amplify';
import { AWSIoTProvider, MqttOverWSProvider } from '@aws-amplify/pubsub/lib/Providers';
import WebSocket from 'ws';
import { IClientIdentityToken } from '../client';
import debug from 'debug';

const log = debug("pubsub")

declare const global: any;
global.WebSocket = WebSocket;

export const defaultAwsConfig = {
    region: 'us-east-1',
    endpoint: 'wss://a1jse42egazw1y.iot.us-east-1.amazonaws.com/mqtt',
    identityPoolID: 'us-east-1:7f389607-e692-46bb-b358-2488187cd4ca',
}

// TODO: fetch this from configuration

export interface AWSOptions {
    region: string
    endpoint: string
    identityPoolID: string
}

export interface LocalOpts {
    endpoint: string
}

export async function configurePubSubForLocal(opts: LocalOpts) {
    Amplify.addPluggable(new MqttOverWSProvider({
        aws_pubsub_endpoint: opts.endpoint,
        aws_appsync_dangerously_connect_to_http_endpoint_for_testing: true,
    }));
}

// TODO: hook this up
export async function configurePubSubForAWS(opts: AWSOptions) {
    // Apply plugin with configuration
    Amplify.addPluggable(new AWSIoTProvider({
        aws_pubsub_region: opts.region,
        aws_pubsub_endpoint: opts.endpoint,
    }));

    Amplify.configure({
        Auth: {
            identityPoolId: opts.identityPoolID,
            region: opts.region,
        }
    });
}


export async function authenticatePubsub(did: string, token: IClientIdentityToken) {
    log("authenticating pubsub")
    await Auth.federatedSignIn(
        "developer",
        {
            identity_id: token.id,
            token: token.token,
            expires_at: 20 * 1000 + new Date().getTime() // the expiration timestamp
        },
        { name: did }
    )
    return Auth.currentAuthenticatedUser()
}