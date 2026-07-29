import { readJSON, writeJSON } from '../lib/blobstore.js';
import { sendJob, tokenFor } from '../lib/sendJob.js';

const SKEY = 'schedule.json', AKEY = 'audiences.json', DKEY = 'directors.json';
const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const page = (title, body) => `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;margin:48px auto;padding:0 20px;color:#1c458c"><h2 style="font-family:Georgia,serif">${title}</h2><div style="font-size:15px;line-height:1.6;color:#333">${body}</div></body>`;

/**
 * Approval page for a scheduled reminder. Linked from the day-before preview email.
 * GET  -> confirmation page with the exact email + an "Approve & send" button (POST).
 *         (GET never changes state, so email link-scanners can't auto-approve.)
 * POST -> marks the job okToSend; if it's already due, sends immediately.
 */
export default async function handler(req, res) {
  const id = (req.query && req.query.id) || '';
  const t = (req.query && req.query.t) || '';
  res.setHeader('content-type', 'text/html');
  if (!id || t !== tokenFor(id)) return res.status(403).send(page('Invalid link', 'This approval link is not valid or has expired.'));

  const all = await readJSON(SKEY, {});
  const job = all[id];
  if (!job) return res.status(404).send(page('Not found', 'That reminder no longer exists.'));
  if (job.sentAt) return res.status(200).send(page('Already sent', 'This reminder has already gone out — nothing to do.'));

  const auds = await readJSON(AKEY, {});
  const count = job.kind === 'pl' ? 1 : ((auds[job.label] || []).length);
  const who = job.kind === 'pl' ? (job.plEmail || '(no PL email)') : (count + ' attendees (' + job.label + ')');

  if (req.method === 'POST') {
    job.okToSend = true;
    const today = new Date().toISOString().slice(0, 10);
    let note = 'This reminder is now <b>scheduled</b> and will send on <b>' + esc(job.sendOn) + '</b> to ' + esc(who) + '. Nothing goes out before then.';
    if (job.sendOn <= today) {
      try {
        const dirs = await readJSON(DKEY, {});
        const r = await sendJob(job, { directors: dirs, audiences: auds });
        job.sentAt = new Date().toISOString(); job.sentCount = r.sent;
        note = 'Sent now to <b>' + r.sent + '</b> recipient(s) — it was due today. ✅';
      } catch (e) { note = 'Approved, but sending failed: ' + esc(e.message) + '. It will retry on the next run.'; }
    }
    all[id] = job; await writeJSON(SKEY, all);
    return res.status(200).send(page('Approved ✓', note + '<br><br>You can close this page.'));
  }

  // GET -> confirmation page
  return res.status(200).send(page('Approve this reminder?',
    `<p><b>${esc(job.subject)}</b></p>` +
    `<p style="color:#5f6b7a">To: ${esc(who)}<br>Scheduled to send: <b>${esc(job.sendOn)}</b></p>` +
    `<pre style="white-space:pre-wrap;background:#f5f0e5;padding:14px;border-radius:10px;font-family:inherit;font-size:14px">${esc(job.body)}</pre>` +
    `<form method="POST" action="/api/approve-send?id=${encodeURIComponent(id)}&t=${t}">` +
    `<button type="submit" style="background:#2f9e6f;color:#fff;border:none;padding:13px 24px;border-radius:10px;font-size:16px;font-weight:700;cursor:pointer">✅ Approve &amp; send</button></form>` +
    `<p style="color:#888;font-size:13px;margin-top:16px">If you don't approve, this reminder will not be sent.</p>`));
}
