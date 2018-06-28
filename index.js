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
  if (cid.toBaseEncodedString) cid = cid.toBaseEncodedString()
  if (typeof cid !== 'string') {
    throw new Error('CID must be string or CID instance')
  }
  return cid
}

const pass = stream => stream.pipe(new PassThrough({objectMode: true}))

class Bulk {
  constructor (store, maxSize = 1e+9 /* 1GB */) {
    this.store = store
    this.safe = store.safe
    this.maxSize = maxSize
    this.cache = new Set()
    this._clear()
  }
  _kick () {
    if (!this._afterWrite) {
      if (!this._pendingPuts.size && !this._pendingDeletes.size) {
        return /* nothing to write */
      }
      this._afterWrite = new Promise(async resolve => {
        let batch = this.store.lev.batch()
        for (let [key, value] of this._pendingPuts) {
          batch.put(key, value)
        }
        for (let key of this._pendingDeletes) {
          batch.del(key)
        }
        this._clear()

        await batch.write()

        delete this._afterWrite
        this._kick()
        resolve()
      })
    }
  }
  _clear () {
    this._pendingPuts = new Map()
    this._pendingDeletes = new Set()
    this._queueSize = 0
  }
  put (cid, buff) {
    if (this.safe) validate(cid, buff)
    cid = cidToString(cid)

    if (this.cache.has(cid)) return

    this._pendingPuts.set(cid, buff)
    this._queueSize += buff.length
    this._kick()
    if (this._queueSize > this.maxSize) {
      return this._afterWrite
    }
  }
  del (cid) {
    cid = cidToString(cid)
    this.cache.delete(cid)
    this._pendingDeletes.add(cid)
    this._kick()
  }
  async flush () {
    this._kick()
    while (this._afterWrite) {
      await this._afterWrite
    }
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
