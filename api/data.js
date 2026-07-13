import { put, list } from '@vercel/blob';

// Single JSON blob that holds the currently-published RSVP records.
const KEY = 'rsvps.json';

/**
 * GET  /api/data  -> { records, updatedAt, count } (records: null if nothing published yet)
 * POST /api/data  -> publish new records for everyone. Requires header:
 *                    x-upload-passcode: <UPLOAD_PASSCODE env var>
 *                    body: { "records": [ ... ] }
 *
 * Requires a Vercel Blob store connected to the project (provides
 * BLOB_READ_WRITE_TOKEN automatically) and an UPLOAD_PASSCODE env var.
 * If those aren't configured, GET returns { records: null } so the site
 * simply falls back to the data baked into index.html.
 */
export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { blobs } = await list({ prefix: KEY });
      const blob = blobs.find((b) => b.pathname === KEY) || blobs[0];
      if (!blob) return res.status(200).json({ records: null });
      const upstream = await fetch(blob.url + '?t=' + Date.now(), { cache: 'no-store' });
      if (!upstream.ok) return res.status(200).json({ records: null });
      const data = await upstream.json();
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const expected = process.env.UPLOAD_PASSCODE;
      if (!expected) {
        return res.status(500).json({ error: 'Server not configured yet: set the UPLOAD_PASSCODE environment variable in Vercel.' });
      }
      const provided = req.headers['x-upload-passcode'] || '';
      if (provided !== expected) {
        return res.status(401).json({ error: 'Incorrect passcode.' });
      }

      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON body.' }); }
      }
      const records = body && body.records;
      if (!Array.isArray(records) || records.length === 0) {
        return res.status(400).json({ error: 'No records to publish.' });
      }

      const payload = JSON.stringify({
        records,
        count: records.length,
        updatedAt: new Date().toISOString(),
      });

      await put(KEY, payload, {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: 'application/json',
        cacheControlMaxAge: 60,
      });

      return res.status(200).json({ ok: true, count: records.length });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    return res.status(500).json({ error: (err && err.message) || 'Server error.' });
  }
}
