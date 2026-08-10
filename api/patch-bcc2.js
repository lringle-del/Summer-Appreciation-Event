import { readJSON, writeJSON } from '../lib/blobstore.js';

const SKEY = 'schedule.json';

// Target BCC list per event (director/PL preserved + newly-requested people).
const BCC = {
  slc: ['sschwab@abtaba.com', 'Jsalazar@abtaba.com', 'Koverholt@abtaba.com'],
  ncharlotte: ['JCertoma@abtaba.com', 'rmoller@abtaba.com', 'jwichern@abtaba.com', 'OBaig@abtaba.com', 'rolaye@abtaba.com'],
  va: ['Opatterson@abtaba.com', 'ajacobovits@abtaba.com', 'vcalautti@abtaba.com'],
  indiana: ['bbrudny@abtaba.com', 'Emoore@abtaba.com', 'KWilber@abtaba.com', 'afox@abtaba.com'],
};

/**
 * ONE-TIME: set dirBcc on every attendee (non-PL) reminder for slc / ncharlotte /
 * va / indiana to the target list above. Idempotent, passcode-protected. Delete after use.
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
    if (!j || j.kind === 'pl' || !BCC[evId]) { skipped.push(id); continue; }
    const want = BCC[evId];
    const same = Array.isArray(j.dirBcc) && j.dirBcc.length === want.length && want.every((b) => j.dirBcc.includes(b));
    if (same) { skipped.push(id); continue; }
    if (!dry) { j.dirBcc = want.slice(); all[id] = j; }
    changed.push({ id, dirBcc: want });
  }

  if (!dry && changed.length) await writeJSON(SKEY, all);
  return res.status(200).json({ dryRun: !!dry, changedCount: changed.length, changed, skippedCount: skipped.length });
}
