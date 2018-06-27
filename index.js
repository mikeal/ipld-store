const level = require('level')
const CID = require('cids')
const util = require('util')
const multihashing = require('multihashing-async')
const multihash = require('multihashes')
const hash = util.promisify(multihashing)

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

class IPLDStore {
  constructor (path, safe = true) {
    this.lev = level(path, {valueEncoding: 'binary'})
    this.safe = safe
    // TODO: implement safety, check that values match hashes
  }
  get (cid) {
    cid = cidToString(cid)
    return this.lev.get(cid)
  }
  async put (cid, buffer) {
    if (this.safe) await validate(cid, buffer)
    cid = cidToString(cid)
    if (!Buffer.isBuffer(buffer)) throw new Error('Value must be buffer.')
    return this.lev.put(cid, buffer)
  }
  del (cid) {
    cid = cidToString(cid)
    return this.lev.del(cid)
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
      return {
        put: (cid, buff) => batch.put(cidToString(cid), buff),
        del: (cid) => batch.del(cidToString(cid)),
        flush: () => batch.write()
      }
    }
    for (let trans of transactions) {
      let {cid, buffer, type} = trans
      if (this.safe && type === 'put') await validate(cid, buffer)
      cid = cidToString(cid)
      if (cid instanceof CID) cid = cid.toBaseEncodedString()
      batch[type](cid, buffer)
    }

    return batch.write()
  }
  // TODO: async cids (continuous = false) returns async generator
  // TODO: close() finish out any remaining generators.
}

module.exports = (...args) => new IPLDStore(...args)
