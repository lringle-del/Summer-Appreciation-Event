import { readJSON, writeJSON } from '../lib/blobstore.js';

const SKEY = 'schedule.json';
const RSVP_URL = 'https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=Mroc1uTzJEKDyxHCW7gZ0jjOWHonDFNFp2Wp8sxbuP5UOFpCRFVCSTlITVE3TlJRUTBXUEI1SzE0US4u';
const OLD = `\n\nPlanning to come but haven't RSVP'd yet? Please let us know here so we have an accurate headcount:\n${RSVP_URL}`;
const NEW = `\n\nPlanning to come but haven't RSVP'd yet? RSVP here: ${RSVP_URL} to let us know so we have an accurate headcount.`;

/**
 * ONE-TIME: rewrite the RSVP block in every stored body from the old "let us know
 * here:\n<url>" form to the new "RSVP here: <url> ..." form (so sendJob can render
 * the URL as a clickable "RSVP here"). Idempotent, passcode-protected. Delete after use.
 */
export default async function handler(req, res) {
  const pass = process.env.SEND_PASSCODE;
  if (!pass || (req.headers['x-send-passcode'] || '') !== pass) return res.status(401).json({ error: 'Unauthorized.' });

  const dry = (req.query && ('dryRun' in req.query));
  const all = await readJSON(SKEY, {});
  const changed = [], skipped = [];

  for (const id in all) {
    const j = all[id];
    if (!j || !j.body || !j.body.includes(OLD)) { skipped.push(id); continue; }
    if (!dry) { j.body = j.body.split(OLD).join(NEW); all[id] = j; }
    changed.push(id);
  }

  if (!dry && changed.length) await writeJSON(SKEY, all);
  return res.status(200).json({ dryRun: !!dry, changedCount: changed.length, changed, skippedCount: skipped.length });
}
