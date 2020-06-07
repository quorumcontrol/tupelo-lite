import { randomBytes, SigningKey, computeAddress, joinSignature } from 'ethers/utils'
import scrypt from 'scrypt-async-modern'
import pbkdf2 from 'pbkdf2'
import debug from 'debug';

const log = debug("ecdsa")

const dagCBOR = require('ipld-dag-cbor')

export interface ISignResponse {
    digest: Buffer
    signature: Buffer
}

function generatePbkdf2Key(phrase: Buffer, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        pbkdf2.pbkdf2(phrase, salt, 216, 32, 'sha256', (err, key) => {
            if (err) {
                reject(err)
                return
            }
            resolve(key)
        })
    })
}

function xor(a: Buffer, b: Buffer) {
    var res = []
    if (a.length > b.length) {
        for (var i = 0; i < b.length; i++) {
            res.push(a[i] ^ b[i])
        }
    } else {
        for (var i = 0; i < a.length; i++) {
            res.push(a[i] ^ b[i])
        }
    }
    return Buffer.from(res);
}

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
    static generate = () => {
        const privateKey = randomBytes(32)
        const signingKey = new SigningKey(privateKey)
        const key = new EcdsaKey(Buffer.from(signingKey.publicKey.slice(2), 'hex'), privateKey)
        return key
    }

    /**
     * Generate a new key based on a passphrase and salt (this goes through the Warp wallet treatment {@link https://keybase.io/warp/warp_1.0.9_SHA256_a2067491ab582bde779f4505055807c2479354633a2216b22cf1e92d1a6e4a87.html})
     */
    static passPhraseKey = async (phrase: Uint8Array, salt: Uint8Array) => {
        const saltDigest = (await dagCBOR.util.cid(salt)).multihash.slice(2)
        const scryptKey = await scrypt(phrase, saltDigest, {
            N: 256,
            r: 8,
            p: 1,
            dkLen: 32,
            encoding: "binary"
        });
        const pbkdf2Key = await generatePbkdf2Key(Buffer.from(phrase), saltDigest)
        const derived = xor(Buffer.from(scryptKey), pbkdf2Key)

        return EcdsaKey.fromBytes(derived)
    }

    static fromBytes = async (bytes: Uint8Array) => {
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

    async signObject(obj: any): Promise<ISignResponse> {
        const signingKey = new SigningKey(this.privateKey!)
        const bits = dagCBOR.util.serialize(obj)

        const digest = (await dagCBOR.util.cid(bits)).multihash.slice(2)
        log("signing digest: ", Buffer.from(digest).toString('hex'))
        let signature = signingKey.signDigest(digest);

        // this is weird, but for some reason Go and JS differ in how they handle the last byte of the signature
        // if the V of the js signature is 27 we need to slice off the last byte and append 00 but if it's 28
        // we need a 01
        // also strip off the 0x at the begin of hex
        let joined = joinSignature(signature).slice(2)
        if (signature.v === 27) {
            joined = joined.slice(0, -2) + "00"
        } else {
            joined = joined.slice(0, -2) + "01"
        }
        return {
            digest: digest,
            signature: Buffer.from(joined, 'hex'),
        }
    }
}