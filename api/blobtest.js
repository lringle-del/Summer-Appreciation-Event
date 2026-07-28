import { put, get } from '@vercel/blob';

// TEMPORARY diagnostic — verifies private-store write+read on @vercel/blob v2.
export default async function handler(req, res) {
  const out = { marker: 'v4' };
  try {
    const p = await put('blobtest.json', JSON.stringify({ t: Date.now(), msg: 'hi' }), {
      access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json',
    });
    out.put = { pathname: p.pathname, url: p.url };
  } catch (e) { out.putErr = e.message; }
  try {
    const r = await get('blobtest.json', { access: 'private' });
    if (r === null) { out.get = 'null (not found)'; }
    else {
      let text = '';
      try { if (r.stream) text = await new Response(r.stream).text(); else if (r.body) text = await new Response(r.body).text(); } catch (e) { text = 'read-stream-err: ' + e.message; }
      out.get = { statusCode: r.statusCode ?? null, keys: Object.keys(r), body: text.slice(0, 80) };
    }
  } catch (e) { out.getErr = e.message; }
  return res.status(200).json(out);
}
