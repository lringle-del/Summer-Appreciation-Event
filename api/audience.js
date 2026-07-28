import { readJSON, writeJSON } from '../lib/blobstore.js';

const KEY = 'audiences.json';

/**
 * GET  /api/audience            -> { counts: { "<label>": <n>, ... } }   (no emails exposed)
 * POST /api/audience            -> save a state's list. Passcode-protected.
 *   headers: x-send-passcode: <SEND_PASSCODE>
 *   body: { "label": "Oklahoma City, OK", "emails": ["a@x.com", ...] }
 */
export default async function handler(req, res) {
  if (req.method === 'GET') {
    const all = await readJSON(KEY, {});
    const counts = {};
    for (const k in all) counts[k] = Array.isArray(all[k]) ? all[k].length : 0;
    return res.status(200).json({ counts });
  }

  if (req.method === 'POST') {
    const pass = process.env.SEND_PASSCODE;
    if (!pass) return res.status(501).json({ error: 'SEND_PASSCODE not configured.' });
    if ((req.headers['x-send-passcode'] || '') !== pass) return res.status(401).json({ error: 'Incorrect passcode.' });

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON.' }); } }
    const label = body && body.label;
    const emails = body && body.emails;
    if (!label || !Array.isArray(emails)) return res.status(400).json({ error: 'label and emails[] are required.' });

    const clean = [...new Set(emails.map((e) => String(e || '').trim()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))];
    const all = await readJSON(KEY, {});
    if (clean.length === 0 && body.allowEmpty !== true) return res.status(400).json({ error: 'No valid emails found in the list.' });
    all[label] = clean;
    await writeJSON(KEY, all);
    return res.status(200).json({ ok: true, label, count: clean.length });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed.' });
}
