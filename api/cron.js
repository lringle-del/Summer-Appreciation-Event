import { Resend } from 'resend';
import { readJSON, writeJSON } from '../lib/blobstore.js';

const SKEY = 'schedule.json';
const AKEY = 'audiences.json';
const DIGEST_TO = 'lringle@abtaba.com';
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

/**
 * Daily job (Vercel Cron -> vercel.json). Sends every APPROVED reminder whose
 * sendOn date is today or earlier and hasn't been sent yet. Marks each sent
 * immediately (idempotent). Add ?dryRun=1 to preview without sending.
 * Auth: Authorization: Bearer <CRON_SECRET>  OR  x-send-passcode header.
 */
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET, pass = process.env.SEND_PASSCODE;
  const auth = req.headers['authorization'] || '';
  const authorized = (secret && auth === 'Bearer ' + secret) || (pass && (req.headers['x-send-passcode'] || '') === pass);
  if (!authorized) return res.status(401).json({ error: 'Unauthorized.' });

  const dry = (req.query && ('dryRun' in req.query)) || req.headers['x-dry-run'] === '1';
  const apiKey = process.env.RESEND_API_KEY, from = process.env.RESEND_FROM;
  if (!apiKey || !from) return res.status(501).json({ error: 'Resend not configured (RESEND_API_KEY / RESEND_FROM).' });
  const resend = new Resend(apiKey);

  const sched = await readJSON(SKEY, {});
  const auds = await readJSON(AKEY, {});
  const today = new Date().toISOString().slice(0, 10);
  const results = [];

  for (const id in sched) {
    const j = sched[id];
    if (!j || j.status !== 'approved' || j.sentAt) continue;
    if (!j.sendOn || j.sendOn > today) continue;

    const recipients = j.kind === 'pl' ? (j.plEmail ? [j.plEmail] : []) : (auds[j.label] || []);
    if (!recipients.length) { results.push({ id, skipped: 'no recipients' }); continue; }
    if (dry) { results.push({ id, wouldSend: recipients.length, to: j.kind === 'pl' ? j.plEmail : j.label, on: j.sendOn }); continue; }

    try {
      let sent = 0;
      if (j.kind === 'pl') {
        const r = await resend.emails.send({ from, to: recipients, cc: (j.cc && j.cc.length) ? j.cc : undefined, subject: j.subject, text: j.body, replyTo: j.replyTo });
        if (r.error) throw new Error(r.error.message || 'Resend error');
        sent = recipients.length;
      } else {
        for (const g of chunk(recipients, 45)) {
          const r = await resend.emails.send({ from, to: [from], bcc: g, subject: j.subject, text: j.body, replyTo: j.replyTo });
          if (r.error) throw new Error(r.error.message || 'Resend error');
          sent += g.length;
        }
      }
      j.sentAt = new Date().toISOString(); j.sentCount = sent; sched[id] = j;
      await writeJSON(SKEY, sched); // persist after each send so a crash never double-sends
      results.push({ id, sent });
    } catch (e) {
      results.push({ id, error: e.message });
    }
  }

  const sentItems = results.filter((r) => r.sent);
  if (!dry && sentItems.length) {
    try {
      await resend.emails.send({
        from, to: [DIGEST_TO],
        subject: `Summer BBQ reminders sent — ${today}`,
        text: 'The daily job sent these reminders today:\n\n' + sentItems.map((r) => `- ${r.id}: ${r.sent} recipient(s)`).join('\n') +
          (results.some((r) => r.error) ? '\n\nErrors:\n' + results.filter((r) => r.error).map((r) => `- ${r.id}: ${r.error}`).join('\n') : ''),
      });
    } catch { /* digest is best-effort */ }
  }

  return res.status(200).json({ ran: today, dryRun: dry, results });
}
