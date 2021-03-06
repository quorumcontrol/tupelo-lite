import { expect } from 'chai';
import 'mocha';

import { EcdsaKey } from '../ecdsa'
import ChainTree, { setDataTransaction } from './chaintree'
import Repo from '../repo/repo';
import { AddBlockRequest } from 'tupelo-messages/services/services_pb';

const IpfsBlockService: any = require('ipfs-block-service');

describe('ChainTree', () => {

  let repo: Repo

  before(async () => {
    repo = await Repo.memoryRepo('chaintree-test')
  })

  it('should generate a new empty ChainTree with nodes set', async () => {
    const key = EcdsaKey.generate()

    const tree = await ChainTree.newEmptyTree(new IpfsBlockService(repo.repo), key)
    expect(tree).to.exist
    const id = await tree.id()
    expect(id).to.not.be.null
    expect(id).to.include("did:tupelo:")
  })

  it('resolves data', async () => {
    const key = EcdsaKey.generate()
    const tree = await ChainTree.newEmptyTree(new IpfsBlockService(repo.repo), key)
    expect(tree).to.exist

    const resp = await tree.resolve("/")
    expect(resp.value.id).to.equal(key.toDid())
  })

  it('creates an AddBlockRequest', async() => {
    const key = EcdsaKey.generate()
    const tree = await ChainTree.newEmptyTree(new IpfsBlockService(repo.repo), key)
    const abr = await tree.newAddBlockRequest([setDataTransaction("hi", "hi")])
    expect(abr).to.be.instanceOf(AddBlockRequest)
  })

})