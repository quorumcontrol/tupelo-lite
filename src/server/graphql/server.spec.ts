import 'mocha'
import {gql} from 'apollo-server'
import {expect} from 'chai'
import {server} from './server'
import { createTestClient } from 'apollo-server-testing'
import { EcdsaKey } from '../../ecdsa'
import { ChainTree, setDataTransaction } from '../../chaintree'
import Repo from '../../repo/repo'
const IpfsBlockService: any = require('ipfs-block-service');
const MemoryDatastore: any = require('interface-datastore').MemoryDatastore;


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
        const key = EcdsaKey.generate()
        const tree = await ChainTree.newEmptyTree(new IpfsBlockService(repo.repo), key)
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
        
        expect(resp.data?.addBlock.valid).to.be.true

    })
})