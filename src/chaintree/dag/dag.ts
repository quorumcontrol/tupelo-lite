import CID from 'cids';
import debug from 'debug';

const log = debug("chaintree.dag")

const Ipld: any = require('ipld');

/** 
 * An IPFS Block
 * @public
 */
export interface IBlock {
  data: Buffer
  cid: CID
}

/**
 * An IPFS Bitswap instance.
 * @public
 */
export interface IBitSwap {
  get(cid: CID, callback: Function): void
  put(block: IBlock, callback: Function): void
  start(callback: Function): void
  stop(callback: Function): void
}

/**
 * The interface to a js-ipfs block-service. See: {@link https://ipfs.github.io/js-ipfs-block-service}
 * @public
 */
export interface IBlockService {
  put(block: IBlock): Promise<any>
  putMany(block: IBlock[]): Promise<any>
  get(cid: CID): Promise<IBlock>
  getMany(cids: CID[]): AsyncIterator<IBlock>
  delete(cid: CID): Promise<any>
  setExchange(bitswap: IBitSwap): void
  unsetExchange(): void
  hasExchange(): boolean
}

interface IDagStoreResolveResponse {
  remainderPath: string
  value: any
}

interface IExtendedDagStoreIterator extends AsyncIterator<IDagStoreResolveResponse> {
  first(): Promise<IDagStoreResolveResponse>
  last(): Promise<IDagStoreResolveResponse>
  all(): Promise<IDagStoreResolveResponse[]>
}

/**
 * An IPFS DagStore instance
 * @public
 */
export interface IDagStore {
  get(cid: CID): Promise<Object>
  resolve(cid: CID, path: string): IExtendedDagStoreIterator
}

/**
 * This defines the resolve response when doing queries against the DAG from IPFS
 * @public
 */
export interface IResolveResponse {
  remainderPath: string[]
  value: any
  touchedBlocks?: CID[]
}

export interface IResolveOptions {
  touchedBlocks?:boolean
}

/**
 * Underlies a ChainTree, it represents a DAG of IPLD nodes and supports resolving accross
 * multiple nodes.
 * @public
 */
export class Dag {
  tip: CID
  dagStore: IDagStore

  constructor(tip: CID, store: IBlockService) {
    this.tip = tip;
    this.dagStore = new Ipld({ blockService: store });
  }

  /**
   * Gets a node from the dag
   * @param cid - The CID of the node to get from the DAG
   * @public
   */
  async get(cid: CID) {
    return this.dagStore.get(cid)
  }

  /**
   * 
   * @param path - a path to the desired node/key in the DAG (eg /path/to/data). Array form (eg ['path', 'to', 'data']) is deprecated
   * @public
   */
  async resolve(path: Array<string> | string, opts?:IResolveOptions): Promise<IResolveResponse> {
    return this.resolveAt(this.tip, path, opts)
  }

  /**
   * Similar to resolve, but allows you to start at a specific tip of a dag rather than the current tip.
   * @param tip - The tip of the dag to start at
   * @param path - the path to find the value. Array form is deprecated, use string form (eg /path/to/data) instead
   * @public
   */
  async resolveAt(tip: CID, path: Array<string> | string, opts?:IResolveOptions): Promise<IResolveResponse> {
    let strPath: string
    if (isArray(path)) {
      console.warn('passing in arrays to resolve is deprecated, use the string form (eg /path/to/data) instead')
      strPath = path.join("/")
    } else {
      strPath = path
    }
    log("calling dagstore resolve for ", tip.toBaseEncodedString())
    const resolved = this.dagStore.resolve(tip, strPath)
    let lastVal
    let touched:CID[] = [tip]
    try {

      if (opts?.touchedBlocks) {
        let allVals:IDagStoreResolveResponse[] = []
        let done = false
        while (!done) {
          let resp = await resolved.next()
          if (resp.done) {
            done = true
            break
          }
          allVals.push(resp.value)

          if (CID.isCID(resp.value.value)) {
            touched.push(resp.value.value)
          }
        }
        lastVal = allVals[allVals.length - 1]
      } else {
        lastVal = await resolved.last()
      }
    } catch (err) {
      const e: Error = err;
      if (!e.message.startsWith("Object has no property")) {
        log("err resolving: ", e.message, e.stack)
        throw err
      }
    }
    // nothing was resolvable, return full path as the remainder
    if (typeof lastVal === 'undefined') {
      return { remainderPath: strPath.split('/'), value: null, touchedBlocks: touched }
    }

    // if remainderPath is not empty, then the value was not found and an
    // error was thrown on the second iteration above - use the remainderPath
    // from the first iteration, but return nil for the error
    if (lastVal.remainderPath != '') {
      return { remainderPath: lastVal.remainderPath.split('/'), value: null, touchedBlocks: touched }
    }

    return { remainderPath: [], value: lastVal.value, touchedBlocks: touched }
  }
}


function isArray(path: Array<string> | string): path is Array<string> {
  return (path as Array<string>).join !== undefined;
}
