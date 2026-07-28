import { put, list, head } from '@vercel/blob';

// TEMPORARY diagnostic — verifies read/write pattern on the private Blob store.
export default async function handler(req, res) {
  const out = {};
  try {
    const p = await put('blobtest.json', JSON.stringify({ t: Date.now(), msg: 'hi' }), {
      access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json',
    });
    out.put = { url: p.url, downloadUrl: p.downloadUrl || null };
    try { const r = await fetch(p.url, { cache: 'no-store' }); out.readUrl = { status: r.status, body: (await r.text()).slice(0, 60) }; }
    catch (e) { out.readUrl = { err: e.message }; }
    if (p.downloadUrl && p.downloadUrl !== p.url) {
      try { const r2 = await fetch(p.downloadUrl, { cache: 'no-store' }); out.readDownloadUrl = { status: r2.status, body: (await r2.text()).slice(0, 60) }; }
      catch (e) { out.readDownloadUrl = { err: e.message }; }
    }
    const l = await list({ prefix: 'blobtest' });
    out.list = l.blobs.map(b => ({ pathname: b.pathname, hasDownloadUrl: !!b.downloadUrl }));
  } catch (e) { out.error = e.message; }
  return res.status(200).json(out);
}
