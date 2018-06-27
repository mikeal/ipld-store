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

### store.bulk([transactions])

When no transactions are sent this method returns a `bulk` object.

`transactions` must be an array of transactions in the form of:

```javascipt
{ type: 'put',
  cid: 'zb2rhd7kzCsbM7VpTvwxcWRnwZE468yj2supGt8gwY75FsFrH',
  buffer: Buffer.from('test')}
```

Or

```javascipt
{ type: 'del',
  cid: 'zb2rhd7kzCsbM7VpTvwxcWRnwZE468yj2supGt8gwY75FsFrH'
}
```

Accepts a CID instance or base58 encoded string.

#### bulk.put(cid, buffer)

Accepts a CID instance or base58 encoded string.

Put operation is queue to be performed on `flush()`.

#### bulk.del(cid)

Accepts a CID instance or base58 encoded string.

Delete operation is queue to be performed on `flush()`.

#### bulk.flush()

Returns a promise that resolves when all the pending transactions are
flushed to disc.