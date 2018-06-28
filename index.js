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
  async bulk (transactions) {
    let batch = this.lev.batch()

    if (!transactions) {
      let cache = new Set()
      // TODO: safety
      return {
        put: (cid, buff) => {
          cid = cidToString(cid)
          if (!cache.has(cid)) batch.put(cid, buff)
        },
        del: (cid) => batch.del(cidToString(cid)),
        flush: () => batch.write()
      }
    }
    for (let trans of transactions) {
      let {cid, buffer, type} = trans
      if (this.safe && type === 'put') await validate(cid, buffer)
      cid = cidToString(cid)
      batch[type](cid, buffer)
    }

    return batch.write()
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
