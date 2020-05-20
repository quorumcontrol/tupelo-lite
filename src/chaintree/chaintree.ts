import { Dag, IBlockService, IBlock } from './dag/dag'
import CID from 'cids'
import { SetDataPayload, Transaction, SetOwnershipPayload } from 'tupelo-messages/transactions/transactions_pb';
import { EcdsaKey } from '../ecdsa'
import { AddBlockRequest } from 'tupelo-messages/services/services_pb';
import { Signature, PublicKey, Ownership } from 'tupelo-messages/signatures/signatures_pb';
import debug from 'debug';

const dagCBOR = require('ipld-dag-cbor');
const Block = require('ipld-block');

const log = debug("chaintree")

// class Uint64 {
//     num:number

//     constructor (num:number) {
//       this.num = num
//     }
  
//     // Gets called when encoding this object
//     // gen - instance of the encoder
//     // obj - the object being encoded
//     //
//     // should return true on success and false otherwise
//     encodeCBOR (gen:any) {
//       return gen.pushAny(new cbor.Tagged(67, this.num))
//     }
//   }

interface TreeBlock {
    height: number
    previousTip?: CID
    transactions: Transaction.AsObject[] // list of Transaction with .toObject called
}

type SignatureMap = {[key:string]:Signature.AsObject}

interface StandardHeaders {
    signatures: SignatureMap, // Object here is protobuf Signature toObject
}

interface BlockWithHeaders extends TreeBlock {
    previousBlock?: CID
    headers: StandardHeaders
}

/**
 * The options to create a new ChainTree.
 * @public
 */
export interface IChainTreeInitializer {
    key?: EcdsaKey
    tip: CID,
    store: IBlockService,
}

async function objToBlock(obj: any): Promise<IBlock> {
    const bits = dagCBOR.util.serialize(obj)
    const cid = await dagCBOR.util.cid(bits)
    return new Block(bits, cid)
}

/**
 * ChainTree is the main class used for interacting with the data of Tupelo. 
 * See {@link https://docs.quorumcontrol.com/docs/chaintree.html} for a detailed description
 * of what a ChainTree is.
 * @public
 */
export class ChainTree extends Dag {
    key?: EcdsaKey
    store: IBlockService

    static createRandom = async (store:IBlockService) => {
        const key = EcdsaKey.generate()
        return ChainTree.newEmptyTree(store, key)
    }

    /**
     * Creates a new empty chaintree using the specified key and blockservice.
     * @param store - The {@link IBlockService} to store the new blocks in (Community exports a block service)
     * @param key - The {@link EcdsaKey} to use to name the ChainTree (this is used to create the DID)
     * @public
     */
    static newEmptyTree = async (store: IBlockService, key: EcdsaKey) => {
        const emptyBlock = await objToBlock({})

        const root = {
            chain: emptyBlock.cid,
            tree: emptyBlock.cid,
            id: key.toDid(),
        }

        const rootBlock = await objToBlock(root)
        await store.putMany([rootBlock, emptyBlock])

        return new ChainTree({
            key: key,
            tip: rootBlock.cid,
            store: store,
        })
    }

    /**
     * Creates a new ChainTree
     * @param opts - {@link IChainTreeInitializer}
     * @public
     */
    constructor(opts: IChainTreeInitializer) {
        super(opts.tip, opts.store)
        this.key = opts.key
        this.store = opts.store
    }

    /**
     * resolveData is the mirror image of setData. It starts at the data section
     * of a ChainTree. This allows you to ignore the "tree/data" part of a path (as is done
     * in setData)
     * @param path - the path (starting after /tree/data) you want to resolve
     */
    async resolveData(path: string) {
        return this.resolve("/tree/data/" + path)
    }

    /** 
     * Returns the DID of the ChainTree
     * @public
     */
    async id() {
        const resolveResp = await this.resolve("id")
        return resolveResp.value as string | null
    }

    /**
     * 
     * @param trans - an array of Transactions to put into the ABR
     */
    async newAddBlockRequest(trans: Transaction[]):Promise<AddBlockRequest> {
        log("newAddBlockRequest")
        if (!this.key) {
            throw new Error("needa key to create an AddBlockRequest")
        }
        let did:string
        try {
            did = (await this.id())!
        } catch(err) {
            console.error("error getting did: ", err)
            throw err
        }
        log(`new add block request ${did}`)

        const previousBlock:TreeBlock = (await this.resolve("/chain/end")).value || {}
        log(`previousBlock ${did}`, previousBlock)
        const nextHeight = ((previousBlock.height === undefined) ? -1 : previousBlock.height) + 1 // get zero if null otherwise next height
        let abr = new AddBlockRequest()
        abr.setPreviousTip(this.tip.buffer)

        const stateBlocks:{
            [key:string]:CID
        } = {};

        // collect state we need for all transactions
        await Promise.all([
            "tree/_tupelo/authentications", 
            "tree/data",
            "chain/end",
        ].map(async (path)=> {
            try {
                const resp = await this.resolve(path, {touchedBlocks: true})
                resp.touchedBlocks?.forEach((id)=> {
                    stateBlocks[id.toBaseEncodedString()] = id
                })
            } catch(err) {
                console.error(`error resolving ${path}`, err)
                throw err
            }
        }))

        let transObjects = await Promise.all(trans.map(async (tx) => {
            let txObj:any = tx.toObject()
            switch (tx.getType()) {
                case Transaction.Type["SETDATA"]:
                    txObj.setDataPayload!.value = Buffer.from(txObj.setDataPayload!.value as string, 'base64')
                    const path = tx.getSetDataPayload()?.getPath()
                    try {
                        let resp = await this.resolve(`/tree/data/${path}`, {touchedBlocks: true})
                        resp.touchedBlocks?.forEach((id)=> {
                            stateBlocks[id.toBaseEncodedString()] = id
                        })
                    } catch(err) {
                        console.error(`error fetching ${path}`, err)
                        throw err
                    }
                   
                    break;
                case Transaction.Type["SETOWNERSHIP"]:
                    let auths = tx.getSetOwnershipPayload()?.getAuthenticationList()
                    delete txObj.setOwnershipPayload!.authenticationList // important to not use a ? here as that generates javascript that won't actually delete
                    txObj.setOwnershipPayload.authentication = auths
                    break;
                default:
                    throw new Error("only supporting setData and setOwnership for now")
            }
            Object.keys(txObj).forEach((key)=> {
                if (Reflect.get(txObj, key) === undefined) {
                    Reflect.set(txObj, key, null)
                }
            })
            return txObj
        }))
        // log(`transactions (${did})`, transObjects)

        let block:TreeBlock = {
            height: nextHeight,
            transactions: transObjects,
        }
        if (nextHeight > 0) {
            block.previousTip = this.tip
        }

        let sigResp = await this.key?.signObject(block)!

        const pubKey = new PublicKey()
        pubKey.setType(PublicKey.Type['KEYTYPESECP256K1'])
        const ownership = new Ownership()
        ownership.setPublicKey(pubKey)

        const sigProto = new Signature()
        sigProto.setOwnership(ownership)

        let sigMap:SignatureMap = {}
        let sigProtoObj = sigProto.toObject()
        delete sigProtoObj.signersList

        sigProtoObj.signature = sigResp.signature
        sigProtoObj.ownership?.publicKey!.publicKey! = Buffer.from('')
        sigMap[this.key.address()] = sigProtoObj
        let blockWithHeaders:BlockWithHeaders = Object.assign(block, {
            headers: {
                signatures: sigMap,
            }
        })
        if (nextHeight > 0) {
            blockWithHeaders.previousBlock = (await this.resolve("chain")).value.end
        }

        abr.setPayload(Buffer.from(dagCBOR.util.serialize(blockWithHeaders)))
        abr.setObjectId(Buffer.from((await this.id())!, 'utf-8'))
        abr.setHeight(nextHeight)

        const cids = Object.keys(stateBlocks).map((key)=> {
            return stateBlocks[key]
        })
        try {
            const blks = this.store.getMany(cids)
            let blkBits:Uint8Array[] = []
            for await (const blk of (blks as any)) { //TODO: get rid of any here
                blkBits.push(blk.data)
            }
            abr.setStateList(blkBits)
        } catch(err) {
            console.error("error getMany: ", err, " cids: ", cids)
            throw err   
        }
      

        return abr
    }

}

const setOwnershipPayload = (newOwnerKeys: string[]) => {
    var payload = new SetOwnershipPayload()
    payload.setAuthenticationList(newOwnerKeys);

    return payload;
};

/**
 * returns a setOwnershipTransaction
 * @param newOwnerKeys - An array of the addresses of the new owners
 * @public
 */
export const setOwnershipTransaction = (newOwnerKeys: string[]) => {
    var payload = setOwnershipPayload(newOwnerKeys);
    var txn = new Transaction();
    txn.setType(Transaction.Type.SETOWNERSHIP);
    txn.setSetOwnershipPayload(payload);

    return txn;
};

const setDataPayloadMaker = (path: string, value: any) => {
    var cborData = dagCBOR.util.serialize(value)
    var payload = new SetDataPayload();
    payload.setPath(path);
    payload.setValue(cborData);

    return payload;
};

/**
 * Returns a setDataTransaction
 * @param path - The path of the Tree to set
 * @param value - An object to set at the path (this will be CBOR encoded for you).
 * @public
 */
export const setDataTransaction = (path: string, value: any) => {
    var payload = setDataPayloadMaker(path, value);
    var txn = new Transaction();
    txn.setType(Transaction.Type.SETDATA);
    txn.setSetDataPayload(payload);

    return txn;
};

export default ChainTree
