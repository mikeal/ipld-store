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
  await db.del(cid(buff))
  t.ok(!(await db.has(cid(buff))))
})

ipldTest('basic not found', async (t, db) => {
  let buff = Buffer.from('test')
  try {
    await db.get(cid(buff))
    throw new Error('Got not value when not in database.')
  } catch (e) {
    t.ok(true)
  }
})

ipldTest('basic batch', async (t, db) => {
  let buff = Buffer.from('test')
  let _cid = cid(buff)
  await db.put(_cid, buff)
  t.ok(await db.has(_cid))

  let buff2 = Buffer.from('test2')
  let b = db.bulk()
  b.del(_cid)
  b.put(cid(buff2), buff2)
  await b.flush()
  t.same(await db.get(cid(buff2)), buff2)
  t.ok(!(await db.has(_cid)))

  b = await db.bulk()
  let buff3 = Buffer.from('test3')
  b.put(cid(buff3), buff3)
  await b.flush()
  t.same(await db.get(cid(buff3)), buff3)
  b = await db.bulk()
  b.del(cid(buff3))
  await b.flush()
  t.ok(!(await db.has(cid(buff3))))
})

ipldTest('cids', async (t, db) => {
  let buff = Buffer.from('test')
  let _cid = cid(buff).toBaseEncodedString()
  await db.put(_cid, buff)

  let i = 0
  for await (let c of db.cids(true)) {
    t.same(c, _cid)
    if (i < 4) {
      buff = Buffer.from('test' + i)
      _cid = cid(buff).toBaseEncodedString()
      if (i === 0) {
        await db.put(_cid, buff)
      } else {
        db.put(_cid, buff)
      }
    } else {
      db.close()
    }
    i++
  }
})
