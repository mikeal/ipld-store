const level = require('level')
const CID = require('cids')
const util = require('util')
const multihashing = require('multihashing-async')
const multihash = require('multihashes')
const hash = util.promisify(multihashing)
const {PassThrough} = require('stream')

const validate = async (cid, buffer) => {
  if (!(cid instanceof CID)) {
    cid = new CID(cid)
  }
  let m = multihash.decode(cid.multihash)
  let _hash = await hash(buffer, m.name)
  if (Buffer.compare(cid.multihash, _hash) !== 0) {
    throw new Error('Invalid, data does not match hash in CID.')
  }
}

const cidToString = cid => {
  if (cid instanceof CID) cid = cid.toBaseEncodedString()
  if (typeof cid !== 'string') {
    throw new Error('CID must be string or CID instance')
  }
  return cid
}

const pass = stream => stream.pipe(new PassThrough({objectMode: true}))

class Bulk {
  constructor (store, size) {
    this._bulk = store.lev.batch()
    this.safe = store.safe
    this.size = size
    this.cache = new Set()
  }
  async put (cid, buff) {
    if (this.safe) validate(cid, buff)
    cid = cidToString(cid)
    if (!this.cache.has(cid)) this._bulk.put(cid, buff)
  }
  async del (cid) {
    this._bulk.del(cidToString(cid))
  }
  async flush () {
    this._bulk.write()
  }
}

class IPLDStore {
  constructor (path, safe = true) {
    this.lev = level(path, {
      valueEncoding: 'binary'
    })
    this.safe = safe
    this._additions = new Set()
    let _clear = () => {
      this.onPut = new Promise(resolve => {
        this._onPut = value => {
          _clear()
          resolve(value)
        }
      })
    }
    _clear()
  }
  get (cid) {
    cid = cidToString(cid)
    return this.lev.get(cid)
  }
  async put (cid, buffer) {
    if (this.safe) await validate(cid, buffer)
    cid = cidToString(cid)
    if (!Buffer.isBuffer(buffer)) throw new Error('Value must be buffer.')
    await this.lev.put(cid, buffer)
    for (let [map] of this._additions.entries()) {
      map.set(cid, buffer)
    }
    this._onPut([cid, buffer])
  }
  async del (cid) {
    cid = cidToString(cid)
    await this.lev.del(cid)
    for (let map of this._additions.entries()) {
      map.delete(cid)
    }
  }
  async has (cid) {
    cid = cidToString(cid)
    try {
      await this.get(cid)
      return true
    } catch (e) {
      // TODO: check error message or code.
      return false
    }
  }
  bulk (size) {
    return new Bulk(this, size)
  }
  cids (continuous = false) {
    let tracking = new Map()
    this._additions.add(tracking)
    let self = this
    return (async function * () {
      let reader = pass(self.lev.createKeyStream())
      for await (let key of reader) {
        yield key
      }
      for (let key of tracking.keys()) {
        yield key
      }
      self._additions.delete(tracking)
      if (continuous) {
        while (self.onPut) {
          let [cid] = await self.onPut
          if (cid === 'end') return
          yield cid
        }
      }
    })()
  }
  close () {
    this._onPut(['end'])
    this.onPut = null
    this.lev.close()
  }
  // TODO: async cids (continuous = false) returns async generator
  // TODO: close() finish out any remaining generators.
}

module.exports = (...args) => new IPLDStore(...args)
