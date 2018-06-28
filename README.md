# ipld-store

Minimal on-disc store for IPLD.

## IPLDStore(path[, safe = true])

```
let store = require('ipld-store')(__dirname + '/test.db')
```

`safe` means that buffers will be validated against the multihash in
the cid before storage. You can turn this off for performance purposes
if you're performing the hash elsewhere.

### store.put(cid, buffer)

Accepts a CID instance or base58 encoded string.

Returns a promise that resolves when the data is stored.

### store.get(cid)

Accepts a CID instance or base58 encoded string.

Returns a promise that resolves a Buffer instance.

Note: The buffer is not validated against the multihash in the CID on `get`.
If you are concerned that the underlying disc store has been compromised
you should perform this check manually.

### store.has(cid)

Accepts a CID instance or base58 encoded string.

Returns a promise that resolves to a boolean.

### store.del(cid)

Accepts a CID instance or base58 encoded string.

Returns a promise that resolves when the data is deleted.

### store.bulk([size = 1GB])

Returns a `Bulk` object.

`size` is the max size of the values being queued for write.

Writes are committed in chunks. When one set of writes finishes
the current set of queued writes will then be written.

**This means writes are flushed long before `flush()` is called.**

If the queue of writes exceeds the size limit `put()` promises will
wait to return until the queue is flushed. This allows you to implement
some back-pressure when the write queue gets very large.

#### bulk.put(cid, buffer)

Accepts a CID instance or base58 encoded string.

Put operation is queue to be performed on `flush()`.

Returns a promise that resolves immediately if the queue has not exceeded
the max size. If the queue has exceeded the max size it will not resolve
until it has flushed.

#### bulk.del(cid)

Accepts a CID instance or base58 encoded string.

Delete operation is queue to be performed on `flush()`.

#### bulk.flush()

Returns a promise that resolves when all the pending transactions are
flushed to disc. **Note: transactions are being flushed continuously as
they are added. This method just ensures all pending transactions have
finished.**