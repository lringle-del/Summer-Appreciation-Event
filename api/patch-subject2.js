import { readJSON, writeJSON } from '../lib/blobstore.js';

const SKEY = 'schedule.json';
const ID = 'indiana:att0';
const NEW_SUBJECT = 'Please Fill Out Your Waiver Tonight';

/**
 * ONE-TIME: shorten the subject on the Indiana day-of reminder. Merges only
 * `subject`, leaving body/okToSend/dirBcc/etc. untouched. Passcode-protected.
 * Delete after use.
 */
export default async function handler(req, res) {
  const pass = process.env.SEND_PASSCODE;
  if (!pass || (req.headers['x-send-passcode'] || '') !== pass) return res.status(401).json({ error: 'Unauthorized.' });

  const dry = (req.query && ('dryRun' in req.query));
  const all = await readJSON(SKEY, {});
  const job = all[ID];
  if (!job) return res.status(404).json({ error: 'job not found' });
  const oldSubject = job.subject;
  if (!dry) { job.subject = NEW_SUBJECT; all[ID] = job; await writeJSON(SKEY, all); }
  return res.status(200).json({ dryRun: !!dry, oldSubject, newSubject: NEW_SUBJECT });
}
