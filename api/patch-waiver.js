import { readJSON, writeJSON } from '../lib/blobstore.js';

const SKEY = 'schedule.json';
const ID = 'indiana:att0';
const MARKER = 'See you there!\n\n';
const WAIVER_LINE = 'Please complete this waiver before arriving tonight: https://waiver.smartwaiver.com/w/cq7tp9cgq9mhuzgwlwaudx/web/\n\n';

/**
 * ONE-TIME: insert the waiver link into the already-approved Indiana day-of
 * reminder body, right after "See you there!" and before the RSVP nudge.
 * Merges only the `body` field — every other field (okToSend, previewSentAt,
 * dirBcc, etc.) is left exactly as-is, unlike the "approve" action which
 * replaces the whole job. Idempotent, passcode-protected. Delete after use.
 */
export default async function handler(req, res) {
  const pass = process.env.SEND_PASSCODE;
  if (!pass || (req.headers['x-send-passcode'] || '') !== pass) return res.status(401).json({ error: 'Unauthorized.' });

  const dry = (req.query && ('dryRun' in req.query));
  const all = await readJSON(SKEY, {});
  const job = all[ID];
  if (!job) return res.status(404).json({ error: 'job not found' });
  if (job.body.includes('smartwaiver.com')) return res.status(200).json({ dryRun: !!dry, alreadyPatched: true, body: job.body });
  if (!job.body.includes(MARKER)) return res.status(500).json({ error: 'marker not found, refusing to guess', body: job.body });

  const newBody = job.body.replace(MARKER, MARKER + WAIVER_LINE);
  if (!dry) { job.body = newBody; all[ID] = job; await writeJSON(SKEY, all); }
  return res.status(200).json({ dryRun: !!dry, newBody });
}
