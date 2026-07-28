import { readJSON, writeJSON } from '../lib/blobstore.js';

const KEY = 'pls.json';

/**
 * Party Lead per event (keyed by eventId).
 * GET  -> { pls: { eventId: { name, email } } }
 * POST (passcode) -> { eventId, name, email }  (email:null removes)
 */
export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ pls: await readJSON(KEY, {}) });
  }
  if (req.method === 'POST') {
    const pass = process.env.SEND_PASSCODE;
    if (!pass) return res.status(501).json({ error: 'SEND_PASSCODE not configured.' });
    if ((req.headers['x-send-passcode'] || '') !== pass) return res.status(401).json({ error: 'Incorrect passcode.' });
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON.' }); } }
    const eventId = body && body.eventId;
    if (!eventId) return res.status(400).json({ error: 'eventId required.' });
    const all = await readJSON(KEY, {});
    if (body.email === null) delete all[eventId];
    else all[eventId] = { name: body.name || '', email: (body.email || '').trim() };
    await writeJSON(KEY, all);
    return res.status(200).json({ ok: true, eventId });
  }
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed.' });
}
