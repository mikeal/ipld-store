const createStore = require('../')
const {test} = require('tap')
const CID = require('cids')
const multihashes = require('multihashes')
const crypto = require('crypto')
const rimraf = require('rimraf')
const path = require('path')
const sha2 = b => crypto.createHash('sha256').update(b).digest()

const cid = buff => {
  let hash = multihashes.encode(sha2(buff), 'sha2-256')
  return new CID(1, 'raw', hash)
}

const ipldTest = async (str, cb) => {
  let dir = path.join(__dirname, 'testdb-' + Math.random())
  let db = createStore(dir)
  await test(str, t => cb(t, db))
  rimraf.sync(dir)
}

ipldTest('basic put/get/del', async (t, db) => {
  let buff = Buffer.from('test')
  await db.put(cid(buff), buff)
  t.same(await db.get(cid(buff)), buff)
  t.same(await db.get(cid(buff).toBaseEncodedString()), buff)
  t.ok(await db.has(cid(buff)))
  let c =
  await db.del(cid(buff))
  t.ok(!(await db.has(cid(buff))))
})

ipldTest('basic batch', async (t, db) => {
  let buff = Buffer.from('test')
  let _cid = cid(buff)
  await db.put(_cid, buff)
  t.ok(await db.has(_cid))

  let buff2 = Buffer.from('test2')
  await db.bulk([
    {type: 'del', cid: _cid},
    {type: 'put', cid: cid(buff2), buffer: buff2}
  ])
  t.same(await db.get(cid(buff2)), buff2)
  t.ok(!(await db.has(_cid)))

  let b = await db.bulk()
  let buff3 = Buffer.from('test3')
  b.put(cid(buff3), buff3)
  await b.flush()
  t.same(await db.get(cid(buff3)), buff3)
  b = await db.bulk()
  b.del(cid(buff3))
  await b.flush()
  t.ok(!(await db.has(cid(buff3))))
})