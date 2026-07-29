import { readJSON, writeJSON } from '../lib/blobstore.js';
import { sendJob, tokenFor } from '../lib/sendJob.js';

const SKEY = 'schedule.json', AKEY = 'audiences.json', DKEY = 'directors.json';
const APPROVER = 'lringle@abtaba.com';

/**
 * Resend inbound webhook (email.received). The preview email's Reply-To is a
 * per-reminder address: approve.<eventId>.<key>.<token>@updates.abtaba.com.
 * When Liba replies, Resend posts here; we parse the address, verify the token
 * (HMAC of the job id, so it can't be forged) and that it came from Liba, then
 * approve + send that reminder.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed.' }); }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return res.status(200).json({ ignored: 'bad json' }); } }
  const data = (body && body.data) || body || {};

  const toList = []
    .concat(data.to || [], data.recipient || [], data.to_addresses || [])
    .map((x) => (typeof x === 'string' ? x : (x && x.email) || ''))
    .filter(Boolean);
  const fromRaw = typeof data.from === 'string' ? data.from : ((data.from && data.from.email) || data.sender || '');

  const addr = toList.map((a) => a.toLowerCase()).find((a) => a.startsWith('approve.') && a.includes('@'));
  if (!addr) return res.status(200).json({ ignored: 'no approve address' });

  const parts = addr.split('@')[0].split('.'); // approve.<eventId>.<key>.<token>
  if (parts.length < 4 || parts[0] !== 'approve') return res.status(200).json({ ignored: 'bad address' });
  const token = parts[parts.length - 1];
  const key = parts[parts.length - 2];
  const eventId = parts.slice(1, parts.length - 2).join('.');
  const id = eventId + ':' + key;

  if (token !== tokenFor(id)) return res.status(200).json({ ignored: 'bad token' });
  if (fromRaw && !fromRaw.toLowerCase().includes(APPROVER)) return res.status(200).json({ ignored: 'not from approver' });

  const all = await readJSON(SKEY, {});
  const job = all[id];
  if (!job) return res.status(200).json({ ignored: 'no such job' });
  if (job.sentAt) return res.status(200).json({ ok: true, note: 'already sent' });

  job.okToSend = true; // schedule it; the daily job sends on its date
  const today = new Date().toISOString().slice(0, 10);
  let note = 'scheduled for ' + job.sendOn;
  if (job.sendOn <= today) {
    try {
      const auds = await readJSON(AKEY, {}), dirs = await readJSON(DKEY, {});
      const r = await sendJob(job, { directors: dirs, audiences: auds });
      job.sentAt = new Date().toISOString(); job.sentCount = r.sent; note = 'sent now to ' + r.sent + ' recipient(s)';
    } catch (e) { note = 'send failed: ' + e.message; }
  }
  all[id] = job; await writeJSON(SKEY, all);
  return res.status(200).json({ ok: true, id, note });
}
