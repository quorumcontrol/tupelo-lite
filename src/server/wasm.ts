import debug from 'debug'
import path from 'path'
import { NotaryGroup, AddBlockRequest } from 'tupelo-messages'
import CID from 'cids'
const Go = require('../js/go')
const dagCBOR = require('ipld-dag-cbor')

const log = debug("aggregator.wasm")


interface IValidatorOptions {
    notaryGroup: Uint8Array // protobuf encoded config.NotaryGroup
}

interface IValidationResponse {
    newTip: CID
    newNodes: Buffer[]
    valid: boolean
}

class UnderlyingWasm {
    async setupValidator(opts: IValidatorOptions): Promise<void> {
         return
    }
    async validate(abr:Uint8Array): Promise<Uint8Array> {
        // replaced by wasm
        return new Uint8Array()
    }

    async pubFromSig(hsh:Buffer, sig:Buffer, privateKey:Buffer):Promise<Buffer> {
        return Buffer.from('') // replaced by wasm
    }
}

const wasmPath = path.join(__dirname, "..", "js", "go", "tupelo.wasm")

namespace ValidatorWasm {
    let _validatorWasm: Promise<UnderlyingWasm> | undefined;

    export const get = (): Promise<UnderlyingWasm> => {
        if (_validatorWasm !== undefined) {
            return _validatorWasm;
        }

        _validatorWasm = new Promise(async (resolve, reject) => {
            const wasm = new UnderlyingWasm;
            log("go.run for first time");
            const go = await Go.run(wasmPath);
            await go.ready();
            go.populateLibrary(wasm, {});
            resolve(wasm)
        });

        return _validatorWasm;
    }
}

export namespace Aggregator {
    export async function setupValidator(group:NotaryGroup) {
        const vw = await ValidatorWasm.get()
        return vw.setupValidator({notaryGroup: group.serializeBinary()})
    }

    export async function validate(abr:AddBlockRequest):Promise<IValidationResponse> {
        const vw = await ValidatorWasm.get()
        const respBytes = await vw.validate(abr.serializeBinary())
        return dagCBOR.util.deserialize(respBytes)
    }

    export async function pubFromSig(hsh:Buffer, sig:Buffer, privateKey:Buffer) {
        const vw = await ValidatorWasm.get()
        return vw.pubFromSig(hsh,sig,privateKey)
    }
}