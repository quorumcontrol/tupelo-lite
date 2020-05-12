import { Signature } from 'tupelo-messages/signatures/signatures_pb'
import {randomBytes, SigningKey, computeAddress } from 'ethers/utils'
/**
 * EcdsaKey defines the public/private key-pairs used to interact with Tupelo.
 * It also supportes generating new keys either randomly or through a passphrase.
 * @public
 */
export class EcdsaKey {
    privateKey?: Uint8Array
    publicKey: Uint8Array
    /**
     * Generate a new keypair with random bits.
     * @public
     */
    static generate = async ()=> {
        const privateKey = randomBytes(32)
        const signingKey = new SigningKey(privateKey)
        const key = new EcdsaKey(Buffer.from(signingKey.publicKey.slice(2), 'hex'), privateKey)
        return key
    }

    /**
     * Generate a new key based on a passphrase and salt (this goes through the Warp wallet treatment {@link https://keybase.io/warp/warp_1.0.9_SHA256_a2067491ab582bde779f4505055807c2479354633a2216b22cf1e92d1a6e4a87.html})
     */
    // static passPhraseKey = async (phrase:Uint8Array, salt:Uint8Array) => {
    //     const pair = await Tupelo.passPhraseKey(phrase, salt)
    //     return new EcdsaKey(pair[1], pair[0]) 
    // }

    static fromBytes = async (bytes:Uint8Array) => {
        const signingKey = new SigningKey(bytes)
        return new EcdsaKey(Buffer.from(signingKey.publicKey.slice(2), 'hex'), bytes)
    }

    constructor(publicKeyBits: Uint8Array, privateKeyBits?: Uint8Array) {
        this.publicKey = publicKeyBits
        this.privateKey = privateKeyBits
    }

    /**
     * Returns the address of the public key (ethereum address format)
     * @public
     */
    address() {
        return computeAddress(this.publicKey)
    }

    /**
     * Returns the DID generated from the public key address
     * @public
     */
    toDid() {
        return `did:tupelo:${this.address()}`
    }
    
}