import { readJSON, writeJSON } from '../lib/blobstore.js';

const SKEY = 'schedule.json';
const ID = 'indiana:att0';
const RSVP_PARA = "\n\nPlanning to come but haven't RSVP'd yet? RSVP here: https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=Mroc1uTzJEKDyxHCW7gZ0jjOWHonDFNFp2Wp8sxbuP5UOFpCRFVCSTlITVE3TlJRUTBXUEI1SzE0US4u to let us know so we have an accurate headcount.";

/**
 * ONE-TIME: strip the "haven't RSVP'd yet" paragraph out of the Indiana
 * day-of reminder body (it's the day-of email, so a not-yet-RSVP'd nudge
 * doesn't apply). Merges only `body`, leaving subject/okToSend/dirBcc/etc.
 * untouched. Passcode-protected. Delete after use.
 */
export default async function handler(req, res) {
  const pass = process.env.SEND_PASSCODE;
  if (!pass || (req.headers['x-send-passcode'] || '') !== pass) return res.status(401).json({ error: 'Unauthorized.' });

  const dry = (req.query && ('dryRun' in req.query));
  const all = await readJSON(SKEY, {});
  const job = all[ID];
  if (!job) return res.status(404).json({ error: 'job not found' });
  if (!job.body.includes(RSVP_PARA)) return res.status(200).json({ dryRun: !!dry, alreadyPatched: true, body: job.body });

  const newBody = job.body.replace(RSVP_PARA, '');
  if (!dry) { job.body = newBody; all[ID] = job; await writeJSON(SKEY, all); }
  return res.status(200).json({ dryRun: !!dry, newBody });
}
