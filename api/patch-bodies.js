import { readJSON, writeJSON } from '../lib/blobstore.js';

const SKEY = 'schedule.json';
const RSVP_URL = 'https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=Mroc1uTzJEKDyxHCW7gZ0jjOWHonDFNFp2Wp8sxbuP5UOFpCRFVCSTlITVE3TlJRUTBXUEI1SzE0US4u';
const BLOCK = `\n\nPlanning to come but haven't RSVP'd yet? Please let us know here so we have an accurate headcount:\n${RSVP_URL}`;

/**
 * ONE-TIME maintenance: append the RSVP link to every attendee (non-PL) reminder
 * body that doesn't already have it, inserting it before the "Warm regards," sign-off.
 * Idempotent. Passcode-protected. Delete this file after running once.
 */
export default async function handler(req, res) {
  const pass = process.env.SEND_PASSCODE;
  if (!pass || (req.headers['x-send-passcode'] || '') !== pass) return res.status(401).json({ error: 'Unauthorized.' });

  const dry = (req.query && ('dryRun' in req.query));
  const all = await readJSON(SKEY, {});
  const changed = [], skipped = [];

  for (const id in all) {
    const j = all[id];
    if (!j || j.kind === 'pl' || !j.body) { skipped.push({ id, why: 'pl or no body' }); continue; }
    if (j.body.includes(RSVP_URL)) { skipped.push({ id, why: 'already has link' }); continue; }
    const marker = '\n\nWarm regards,';
    const at = j.body.lastIndexOf(marker);
    const newBody = at >= 0 ? (j.body.slice(0, at) + BLOCK + j.body.slice(at)) : (j.body + BLOCK);
    if (!dry) { j.body = newBody; all[id] = j; }
    changed.push({ id, insertedBeforeSignoff: at >= 0 });
  }

  if (!dry && changed.length) await writeJSON(SKEY, all);
  return res.status(200).json({ dryRun: !!dry, changedCount: changed.length, changed, skipped });
}
