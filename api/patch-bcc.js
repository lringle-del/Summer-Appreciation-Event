import { readJSON, writeJSON } from '../lib/blobstore.js';

const SKEY = 'schedule.json';
const EVENTS = ['raleigh', 'ncharlotte'];
const BCC = ['JCertoma@abtaba.com', 'rmoller@abtaba.com'];

/**
 * ONE-TIME: set dirBcc = [Jennifer Certoma, rmoller] on every attendee (non-PL)
 * reminder for Raleigh and North Charlotte, so both are BCC'd on those sends.
 * Idempotent, passcode-protected. Delete after use.
 */
export default async function handler(req, res) {
  const pass = process.env.SEND_PASSCODE;
  if (!pass || (req.headers['x-send-passcode'] || '') !== pass) return res.status(401).json({ error: 'Unauthorized.' });

  const dry = (req.query && ('dryRun' in req.query));
  const all = await readJSON(SKEY, {});
  const changed = [], skipped = [];

  for (const id in all) {
    const j = all[id];
    const evId = (j && j.eventId) || id.split(':')[0];
    if (!j || j.kind === 'pl' || !EVENTS.includes(evId)) { skipped.push(id); continue; }
    const already = Array.isArray(j.dirBcc) && BCC.every((b) => j.dirBcc.includes(b)) && j.dirBcc.length === BCC.length;
    if (already) { skipped.push(id); continue; }
    if (!dry) { j.dirBcc = BCC.slice(); all[id] = j; }
    changed.push(id);
  }

  if (!dry && changed.length) await writeJSON(SKEY, all);
  return res.status(200).json({ dryRun: !!dry, changedCount: changed.length, changed, skippedCount: skipped.length });
}
