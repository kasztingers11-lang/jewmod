import { get, put, del, BlobPreconditionFailedError } from '@vercel/blob';

export class Conflict extends Error {}
export class BlobStore {
  constructor(api={get,put,del}) { this.api=api; }
  async read(key) {
    const blob = await this.api.get(key, { access: 'private', useCache: false, headers:{'Accept-Encoding':'identity'} });
    if (!blob) return null;
    return { data: await new Response(blob.stream).json(), etag: blob.blob.etag };
  }
  async write(key, data, etag) {
    try {
      const options = {access:'private', addRandomSuffix:false, contentType:'application/json', cacheControlMaxAge:60};
      if (etag) options.ifMatch = etag;
      else options.allowOverwrite = false;
      return await this.api.put(key, JSON.stringify(data), options);
    } catch (e) {
      if (e instanceof BlobPreconditionFailedError || e.name === 'BlobAlreadyExistsError') throw new Conflict();
      throw e;
    }
  }
  async remove(key, etag) { await this.api.del(key, {ifMatch:etag}); }
}
export class MemoryStore {
  entries = new Map(); counter = 0;
  async read(key) { return structuredClone(this.entries.get(key) ?? null); }
  async write(key, data, etag) {
    const existing = this.entries.get(key);
    if ((etag && existing?.etag !== etag) || (!etag && existing)) throw new Conflict();
    this.entries.set(key, {data:structuredClone(data),etag:String(++this.counter)});
  }
  async remove(key, etag) {
    if (this.entries.get(key)?.etag !== etag) throw new Conflict();
    this.entries.delete(key);
  }
}
