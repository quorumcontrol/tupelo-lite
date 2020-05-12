import 'mocha'
import {expect} from 'chai'
import { NotaryGroup } from 'tupelo-messages/config/config_pb'
import {Aggregator} from './wasm'
import {computePublicKey, computeAddress} from 'ethers/utils'
import { EcdsaKey } from '../ecdsa'
import ChainTree, { setDataTransaction } from '../chaintree/chaintree'
import Repo from '../repo/repo'

const dagCBOR = require('ipld-dag-cbor')
const MemoryDatastore: any = require('interface-datastore').MemoryDatastore;
const IpfsBlockService: any = require('ipfs-block-service');


const testRepo = async () => {
    const repo = new Repo('server-wasm-spec-repo', {
      lock: 'memory',
      storageBackends: {
        root: MemoryDatastore,
        blocks: MemoryDatastore,
        keys: MemoryDatastore,
        datastore: MemoryDatastore
      }
    })
    await repo.init({})
    await repo.open()
    return repo
  }

describe('Aggregator Wasm', ()=> {

    let repo: Repo

    before(async () => {
      repo = await testRepo()
    })

    before(async ()=> {
        let ng = new NotaryGroup()
        ng.setId("tester")
        await Aggregator.setupValidator(ng)
    })

    it('getsPubFromSig', async ()=> {
        const key = EcdsaKey.generate()

        let signResp = await key.signObject("hi")
        const resp = await Aggregator.pubFromSig(signResp.digest, signResp.signature, Buffer.from(key.privateKey!))
        let publicKey = computePublicKey(resp)
        expect(computeAddress(publicKey)).to.equal(computeAddress(key.publicKey))
    })

    it('validates', async ()=> {
        const key = EcdsaKey.generate()
        const tree = await ChainTree.newEmptyTree(new IpfsBlockService(repo.repo), key)
        const abr = await tree.newAddBlockRequest([setDataTransaction("hi", "hi")])
        const resp = await Aggregator.validate(abr)
        expect(resp.valid).to.be.true
    })
})