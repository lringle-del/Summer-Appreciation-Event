import { put, list, head } from '@vercel/blob';

// TEMPORARY diagnostic — verifies the private-store read/write pattern.
export default async function handler(req, res) {
  const out = {};
  try {
    const p = await put('blobtest.json', JSON.stringify({ t: Date.now(), msg: 'hi' }), {
      access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json',
    });
    out.put = { url: p.url, downloadUrl: p.downloadUrl || null };
  } catch (e) { out.putErr = e.message; }
  try {
    const h = await head('blobtest.json');
    out.head = { url: h.url, downloadUrl: h.downloadUrl || null };
    const du = h.downloadUrl || h.url;
    try { const r = await fetch(du, { cache: 'no-store' }); out.readHead = { status: r.status, body: (await r.text()).slice(0, 80) }; }
    catch (e) { out.readHead = { err: e.message }; }
  } catch (e) { out.headErr = e.message; }
  try {
    const l = await list({ prefix: 'blobtest' });
    out.list = l.blobs.map(b => ({ pathname: b.pathname, url: b.url, downloadUrl: b.downloadUrl || null }));
  } catch (e) { out.listErr = e.message; }
  return res.status(200).json(out);
}
