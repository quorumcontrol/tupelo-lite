import { ApolloServer } from "apollo-server";
import { typeDefs } from './schema'
import { resolvers } from './resolvers'
import { SimpleChain } from "../simpleChain";
import Repo from "../../repo/repo";
import { EcdsaKey } from "../../ecdsa";
import { ChainTree, setDataTransaction } from "../../chaintree";
import {DataSource} from "apollo-datasource";

const MemoryDatastore: any = require('interface-datastore').MemoryDatastore;
const IpfsBlockService: any = require('ipfs-block-service');

const testRepo = async (name: string) => {
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

const chainP = new Promise<SimpleChain>(async (resolve) => {
    const repo = await testRepo("dummy")
    const chain = new SimpleChain(repo)

    // below here is just populating some dummy data useful for testing
    const key = EcdsaKey.generate()
    const tree = await ChainTree.newEmptyTree(new IpfsBlockService(repo.repo), key)
    const abr = await tree.newAddBlockRequest([setDataTransaction("hi", "hi")])
    const resp = await chain.add(abr)
    console.log("dummy chain: ", key.toDid())
    resolve(chain)
})

export class ChainDataSource extends DataSource {
    chain() {
        return chainP
    }
}

const dataSources = () => {
    return {
        simpleChain: new ChainDataSource()
    }
}

// The ApolloServer constructor requires two parameters: your schema
// definition and your set of resolvers.
export const server = new ApolloServer({
    typeDefs,
    resolvers,
    dataSources,
});
