import { expect } from 'chai';
import 'mocha';

import { EcdsaKey } from '../ecdsa'
import ChainTree from './chaintree'
import Repo from '../repo/repo';

const IpfsBlockService: any = require('ipfs-block-service');
const MemoryDatastore: any = require('interface-datastore').MemoryDatastore;


const testRepo = async () => {
  const repo = new Repo('chaintree-test', {
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

describe('ChainTree', () => {

  let repo: Repo

  before(async () => {
    repo = await testRepo()
  })

  it('should generate a new empty ChainTree with nodes set', async () => {
    const key = await EcdsaKey.generate()

    const tree = await ChainTree.newEmptyTree(new IpfsBlockService(repo.repo), key)
    expect(tree).to.exist
    const id = await tree.id()
    expect(id).to.not.be.null
    expect(id).to.include("did:tupelo:")
  })

  it('resolves data', async () => {
    const key = await EcdsaKey.generate()
    const tree = await ChainTree.newEmptyTree(new IpfsBlockService(repo.repo), key)
    expect(tree).to.exist

    const resp = await tree.resolve("/")
    expect(resp.value.id).to.equal(key.toDid())
  })
})