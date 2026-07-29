import { Resend } from 'resend';
import { readJSON, writeJSON } from '../lib/blobstore.js';
import { sendJob, tokenFor } from '../lib/sendJob.js';

const SKEY = 'schedule.json', AKEY = 'audiences.json', DKEY = 'directors.json';
const DIGEST_TO = 'lringle@abtaba.com';
const dayBefore = (iso) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };
const escH = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/**
 * Daily job (Vercel Cron, 13:00 UTC). Two phases per approved job:
 *   1) The day BEFORE its send date, email Liba a PREVIEW with an Approve button
 *      (and, once inbound is set up, reply-to-approve). Nothing goes to recipients.
 *   2) On/after the send date, IF she approved (okToSend), send to the real list.
 * Auth: Authorization: Bearer <CRON_SECRET>  OR  x-send-passcode header. ?dryRun=1 previews.
 */
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET, pass = process.env.SEND_PASSCODE;
  const auth = req.headers['authorization'] || '';
  const authorized = (secret && auth === 'Bearer ' + secret) || (pass && (req.headers['x-send-passcode'] || '') === pass);
  if (!authorized) return res.status(401).json({ error: 'Unauthorized.' });

  const dry = (req.query && ('dryRun' in req.query)) || req.headers['x-dry-run'] === '1';
  const apiKey = process.env.RESEND_API_KEY, from = process.env.RESEND_FROM;
  if (!apiKey || !from) return res.status(501).json({ error: 'Resend not configured.' });
  const resend = new Resend(apiKey);
  const origin = 'https://' + req.headers.host;

  const sched = await readJSON(SKEY, {});
  const auds = await readJSON(AKEY, {});
  const dirs = await readJSON(DKEY, {});
  const today = new Date().toISOString().slice(0, 10);
  const previews = [], sends = [];

  for (const id in sched) {
    const j = sched[id];
    if (!j || j.status !== 'approved' || j.sentAt || !j.sendOn) continue;

    // Phase 1 — day-before preview (once), only if not yet approved
    if (!j.okToSend && !j.previewSentAt && today >= dayBefore(j.sendOn)) {
      const count = j.kind === 'pl' ? 1 : ((auds[j.label] || []).length);
      const who = j.kind === 'pl' ? (j.plEmail || '(no PL email)') : (count + ' attendees (' + j.label + ')');
      const link = origin + '/api/approve-send?id=' + encodeURIComponent(id) + '&t=' + tokenFor(id);
      if (dry) { previews.push({ id, to: who, sendOn: j.sendOn }); continue; }
      try {
        await resend.emails.send({
          from, to: [DIGEST_TO], replyTo: 'events@abtaba.com',
          subject: `Approve to send — ${j.subject}  (sends ${j.sendOn})`,
          text: `This reminder is scheduled to send on ${j.sendOn} to ${who}.\n\n`
            + `TO APPROVE, tap this link:\n${link}\n\n`
            + `If you do nothing, it will NOT send.\n\n`
            + `----- EMAIL PREVIEW -----\nSubject: ${j.subject}\n\n${j.body}`,
          html: `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:580px;color:#1c458c">`
            + `<p style="font-size:15px;color:#333">This reminder is scheduled to send on <b>${escH(j.sendOn)}</b> to <b>${escH(who)}</b>. Review it below, then approve to release it.</p>`
            + `<p style="margin:22px 0"><a href="${link}" style="display:inline-block;background:#2f9e6f;color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:700;font-size:17px">✅ Approve &amp; send</a></p>`
            + `<p style="color:#888;font-size:13px">If you don't approve, this reminder will <b>not</b> be sent.</p>`
            + `<hr style="border:none;border-top:1px solid #e3d6bd;margin:20px 0">`
            + `<p style="font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#5f6b7a;font-weight:700">Preview</p>`
            + `<p style="font-size:14px;color:#333"><b>Subject:</b> ${escH(j.subject)}</p>`
            + `<pre style="white-space:pre-wrap;background:#f5f0e5;padding:14px;border-radius:10px;font-family:inherit;font-size:14px;color:#333">${escH(j.body)}</pre></div>`,
        });
        j.previewSentAt = new Date().toISOString(); sched[id] = j; await writeJSON(SKEY, sched);
        previews.push({ id, to: who, sendOn: j.sendOn });
      } catch (e) { previews.push({ id, error: e.message }); }
      continue;
    }

    // Phase 2 — send for real once approved and due
    if (j.okToSend && today >= j.sendOn) {
      if (dry) { sends.push({ id, wouldSend: j.kind === 'pl' ? 1 : (auds[j.label] || []).length }); continue; }
      try {
        const r = await sendJob(j, { directors: dirs, audiences: auds });
        j.sentAt = new Date().toISOString(); j.sentCount = r.sent; sched[id] = j; await writeJSON(SKEY, sched);
        sends.push({ id, sent: r.sent });
      } catch (e) { sends.push({ id, error: e.message }); }
    }
  }

  if (!dry && sends.filter((s) => s.sent).length) {
    try {
      await resend.emails.send({
        from, to: [DIGEST_TO], subject: `Reminders sent — ${today}`,
        text: 'Sent today:\n' + sends.filter((s) => s.sent).map((s) => `- ${s.id}: ${s.sent}`).join('\n')
          + (sends.some((s) => s.error) ? '\n\nErrors:\n' + sends.filter((s) => s.error).map((s) => `- ${s.id}: ${s.error}`).join('\n') : ''),
      });
    } catch { /* best effort */ }
  }

  return res.status(200).json({ ran: today, dryRun: dry, previews, sends });
}
