import 'mocha'
import {gql} from 'apollo-server'
import {expect} from 'chai'
import {server} from './server'
import { createTestClient } from 'apollo-server-testing'
import { EcdsaKey } from '../../ecdsa'
import { ChainTree, setDataTransaction, IBlock, CID } from '../../chaintree'
import Repo from '../../repo/repo'
import { Block as GraphQLBLock } from './generated/types'
const IpfsBlockService: any = require('ipfs-block-service');
const MemoryDatastore: any = require('interface-datastore').MemoryDatastore;
const dagCBOR = require('ipld-dag-cbor')
const Block = require('ipld-block');

function graphQLtoBlocks(graphQLBlocks: GraphQLBLock[]):Promise<IBlock[]> {
    if (!graphQLBlocks) {
        return Promise.resolve([])
    }
    return Promise.all(graphQLBlocks.map(async (blk)=> {
        const bits = Buffer.from(blk.data, 'base64')
        let cid = await dagCBOR.util.cid(bits)
        return new Block(bits, cid)
    }))
}

const testRepo = async (name:string) => {
    const repo = new Repo(name, {
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

describe("graphql interface", ()=> {
    it('adds blocks', async ()=> {
        const repo = await testRepo("addsBlocks")
        // use the test server to create a query and mutate function
        const { query, mutate } = createTestClient(server);


         // below here is just populating some dummy data useful for testing
        const tree = await ChainTree.createRandom(new IpfsBlockService(repo.repo))
        const abr = await tree.newAddBlockRequest([setDataTransaction("hi", "hi")])

        const resp = await mutate({
            mutation: gql`
                mutation addBlock($addBlockRequest: String!) {
                    addBlock(input: {addBlockRequest: $addBlockRequest}) {
                        valid
                        newTip
                        newBlocks {
                            data
                        }
                    }
                }
            `,
            variables: {
                addBlockRequest: Buffer.from(abr.serializeBinary()).toString('base64')
            }
        })
        expect(resp.errors).to.be.undefined
        expect(resp.data?.addBlock.valid).to.be.true

        const blks = await graphQLtoBlocks(resp.data?.addBlock.newBlocks)
        await repo.repo.blocks.putMany(blks)

        tree.tip = new CID(resp.data?.addBlock.newTip)
        expect((await tree.resolveData("hi")).value).to.equal("hi")

        // and now querying the resolve works
        const queryResp = await query({
            query: gql`
                query resolve($did: String!, $path: String!) {
                    resolve(input: {did: $did, path: $path}) {
                        value
                    }
                }
            `,
            variables: {
                did: await tree.id(),
                path: "/tree/data/hi"
            }
        })

        expect(queryResp.data?.resolve.value).to.equal("hi")

    })
})