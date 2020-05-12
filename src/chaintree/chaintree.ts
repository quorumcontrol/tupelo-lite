import { Dag, IBlockService, IBlock, IBitSwap } from './dag/dag'
import CID from 'cids'
import { SetDataPayload, Transaction, SetOwnershipPayload } from 'tupelo-messages/transactions/transactions_pb';
import {EcdsaKey} from '../ecdsa'

const dagCBOR = require('ipld-dag-cbor');
const Block = require('ipld-block');

/**
 * The options to create a new ChainTree.
 * @public
 */
export interface IChainTreeInitializer {
    key?:EcdsaKey
    tip:CID,
    store:IBlockService,
}

async function objToBlock(obj:any):Promise<IBlock> {
    const bits = dagCBOR.util.serialize(obj)
    const cid = await dagCBOR.util.cid(bits)
    return new Block(bits,cid)
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
        console.log(rootBlock)
        await store.put(rootBlock)

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
    constructor(opts:IChainTreeInitializer) {
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
    async resolveData(path:string) {
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
