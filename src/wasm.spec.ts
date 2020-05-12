import 'mocha'
import {expect} from 'chai'
import { AddBlockRequest } from 'tupelo-messages/services/services_pb'
import { NotaryGroup } from 'tupelo-messages/config/config_pb'
import {Aggregator} from './wasm'
import CID from 'cids'
import { Signature, PublicKey, Ownership } from 'tupelo-messages/signatures/signatures_pb'
import {SigningKey,joinSignature,computePublicKey, computeAddress, randomBytes} from 'ethers/utils'

const dagCBOR = require('ipld-dag-cbor')
const ethers = require('ethers');

interface Block {
    height: number
    previousTip?: CID
    transactions: Object[] // list of Transaction with .toObject called
}

type SignatureMap = {[key:string]:Object}

interface StandardHeaders {
    signatures: SignatureMap, // Object here is protobuf Signature toObject
}

interface BlockWithHeaders extends Block{
    previousBlock?: CID
    headers: StandardHeaders
}

async function signObject(obj:any, signingKey:SigningKey):Promise<Buffer> {
    const bits = dagCBOR.util.serialize(obj)
    const digest = (await dagCBOR.util.cid(bits)).multihash.slice(2)
    let signature = signingKey.signDigest(digest);
    console.log("signature: ", signature)

    // this is weird, but for some reason Go and JS differ in how they handle the last byte of the signature
    // if the V of the js signature is 27 we need to slice off the last byte and append 00 but if it's 28
    // we need a 01
    // also strip off the 0x at the begin of hex
    let joined = joinSignature(signature).slice(2)
    if (signature.v === 27) {
        joined = joined.slice(0,-2) + "00"
    } else {
        joined = joined.slice(0,-2) + "01"
    }
    console.log("joined: ", joined)
    // let joined = joinSignature(signature).slice(2)
    return Buffer.from(joined, 'hex')
}

describe('Aggregator Wasm', ()=> {
    before(async ()=> {
        let ng = new NotaryGroup()
        ng.setId("tester")
        await Aggregator.setupValidator(ng)
    })

    it('getsPubFromSig', async ()=> {
        const privateKey = randomBytes(32)
        const signingKey = new SigningKey(privateKey)

        const bits = dagCBOR.util.serialize("hi")
        const digest = (await dagCBOR.util.cid(bits)).multihash.slice(2)

        let sigBuf = await signObject("hi", signingKey)
        const resp = await Aggregator.pubFromSig(digest, sigBuf, Buffer.from(privateKey))
        let publicKey = computePublicKey(resp)
        console.log("returned key: ", computeAddress(publicKey))
        console.log("js key: ", computeAddress(signingKey.publicKey))
    })

// // 07c22148b052d95e99fdf019e2fba202a63bf56186ec1eb8f6c9c32d2eda31495bef5f7fd586256b69d311eb68b2a5bc409b4ce1602c5e5e5288b939d2158d9c1b  length:  65
// // 07c22148b052d95e99fdf019e2fba202a63bf56186ec1eb8f6c9c32d2eda31495bef5f7fd586256b69d311eb68b2a5bc409b4ce1602c5e5e5288b939d2158d9c00

// // 5ef3f76c089df60fa73534f526965ac8c15ff200997dd37d36be12bd386210087fc0759ad42c51b1e6fd793bde53c6392d8f7f1f1c0e44bcbfdb3294e85be11d1b  length:  65
// // 5ef3f76c089df60fa73534f526965ac8c15ff200997dd37d36be12bd386210087fc0759ad42c51b1e6fd793bde53c6392d8f7f1f1c0e44bcbfdb3294e85be11d00

//     it('validates', async ()=> {
//         const c = await Community.getDefault()

//         let abr = new AddBlockRequest()
//         const key = await EcdsaKey.generate()
//         const addr = await key.address()
//         let tree = await ChainTree.newEmptyTree(c.blockservice, key)

//         abr.setPreviousTip(tree.tip.buffer)

//         let tx = setDataTransaction("hi", "hi").toObject()
//         tx.setDataPayload!.value = Buffer.from(tx.setDataPayload!.value as string, 'base64')
//         Object.keys(tx).forEach((key)=> {
//             if (Reflect.get(tx, key) === undefined) {
//                 Reflect.set(tx, key, null)
//             }
//         })


//         let block:Block = {
//             height: 0,
//             transactions: [tx],
//         }
//         console.log("transactions: ", tx)
    
//         const bits = dagCBOR.util.serialize(block)
//         console.log("serialized: ", bits.toString('hex'))
//         const digest = (await dagCBOR.util.cid(bits)).multihash.slice(2)

//         const signingKey = new SigningKey(key.privateKey!)
//         let publicKey = signingKey.publicKey;
//         let address = ethers.utils.computeAddress(publicKey);

//         let sigBuf = await signObject(block, key)

//         console.log('Address: ' + address, ' tree id: ', await tree.id());
//         console.log(" digest: ", digest.toString('hex'), " buf: ", sigBuf.toString('hex'), " len: ", sigBuf.byteLength)
//         // sig := signatures.Signature{
//         //     Ownership: &signatures.Ownership{
//         //         PublicKey: &signatures.PublicKey{
//         //             Type: signatures.PublicKey_KeyTypeSecp256k1,
//         //         },
//         //     },
//         //     Signature: sigBytes,
//         // }

//         const pubKey = new PublicKey()
//         pubKey.setType(PublicKey.Type['KEYTYPESECP256K1'])
//         const ownership = new Ownership()
//         ownership.setPublicKey(pubKey)
//         const sigProto = new Signature()
//         sigProto.setOwnership(ownership)

//         let sigMap:SignatureMap = {}

//         let sigProtoObj = sigProto.toObject()
//         delete sigProtoObj.signersList

//         sigProtoObj.signature = sigBuf

//         sigProtoObj.ownership?.publicKey!.publicKey! = Buffer.from('')

//         sigMap[addr] = sigProtoObj

//         let blockWithHeaders:BlockWithHeaders = Object.assign(block, {
//             headers: {
//                 signatures: sigMap,
//             }
//         })

//         console.log("deserialize: ", dagCBOR.util.deserialize(dagCBOR.util.serialize(blockWithHeaders)))

//         abr.setPayload(Buffer.from(dagCBOR.util.serialize(blockWithHeaders)))
//         abr.setObjectId(Buffer.from((await tree.id())!, 'utf-8'))
//         abr.setHeight(0)

//         await c.playTransactions(tree, [setDataTransaction("hi", "hi")])
//         let resp = await tree.resolve("chain/end")
//         console.log("resp: ", resp, " transactions: ", resp.value.transactions, " sigs", resp.value.headers.signatures)
//         console.log("sigs: ", Object.keys(resp.value.headers.signatures).map((key)=> {
//             return resp.value.headers.signatures[key].ownership.publicKey
//         }))
    
//         console.log("resp: ", await Aggregator.validate(abr))


//     })
})