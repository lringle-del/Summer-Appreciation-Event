import { readJSON } from '../lib/blobstore.js';

const SKEY = 'schedule.json';

/**
 * ONE-TIME debug helper: return the full stored job (subject, body, bcc,
 * dirBcc, replyTo, etc.) for a single id, so an update can be built without
 * guessing at fields the normal GET intentionally hides. Passcode-protected.
 * Delete after use.
 */
export default async function handler(req, res) {
  const pass = process.env.SEND_PASSCODE;
  if (!pass || (req.headers['x-send-passcode'] || '') !== pass) return res.status(401).json({ error: 'Unauthorized.' });
  const id = (req.query && req.query.id) || '';
  if (!id) return res.status(400).json({ error: 'id required' });
  const all = await readJSON(SKEY, {});
  return res.status(200).json({ job: all[id] || null });
}
