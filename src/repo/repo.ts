import { IKey } from '../chaintree/datastore';
const IpfsRepo: any = require('ipfs-repo');
const MemoryDatastore: any = require('interface-datastore').MemoryDatastore;
const IpfsBlockService: any = require('ipfs-block-service');

interface IStorageBackendOpts {
    root: any
    blocks: any
    keys: any
    datastore: any
}

/**
 * Options used to create a new IPFS repo. {@link https://github.com/ipfs/js-ipfs-repo}
 * @public
 */
export interface RepoOpts {
    lock: string
    storageBackends: IStorageBackendOpts
    storageBackendOptions?: IStorageBackendOpts
}

/**
 * The interface to an IPFS Query {@link https://github.com/ipfs/interface-datastore}
 * @remarks
 * todo: finish up the whole interface https://github.com/ipfs/interface-datastore/tree/v0.6.0
 * @public
 */
export interface IQuery {
    prefix: string
}

/**
 * Repo is a typescript wrapper around the IPFS Repo {@link https://github.com/ipfs/js-ipfs-repo}
 * @public
 */
export class Repo {

    repo: any
    /**
     * @param name - The name of the repo
     * @param opts - (optional) {@link RepoOpts} - if opts are unspecified, it will use the IPFS repo defaults
     * @public
     */
    constructor(name: string, opts?: RepoOpts) {
        this.repo = new IpfsRepo(name, opts)
    }

    init(opts: any) {
        return this.repo.init(opts)
    }

    open() {
        return this.repo.open()
    }

    close() {
        return this.repo.close()
    }

    delete(key: IKey) {
        return this.repo.datastore.delete(key)
    }

    put(key: IKey, val: Uint8Array) {
        return this.repo.datastore.put(key, val)
    }

    get(key: IKey) {
        return this.repo.datastore.get(key)
    }

    query(query: IQuery) {
        return this.repo.datastore.query(query)
    }

    toBlockservice() {
        return new IpfsBlockService(this.repo)
    }

    static memoryRepo = async (name: string) => {
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
}

export default Repo