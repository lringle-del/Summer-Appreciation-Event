import { Resend } from 'resend';

/**
 * POST /api/send  — send one reminder email via Resend.
 *
 * Protected by a shared passcode so the public page can't be used to spam.
 * Required Vercel environment variables:
 *   RESEND_API_KEY  — from resend.com (API Keys)
 *   RESEND_FROM     — a verified sender on abtaba.com, e.g. "Above & Beyond ABA <events@abtaba.com>"
 *   SEND_PASSCODE   — any secret string; the dashboard prompts for it once
 *
 * Body: { subject, text, to?: string[], bcc?: string[], replyTo?: string }
 *  - PL email:        pass `to` (single address)
 *  - Attendee blast:  pass `bcc` (the list); we send in chunks with `to` = the from address
 */
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
const cleanList = (v) => Array.isArray(v)
  ? [...new Set(v.map((x) => String(x || '').trim()).filter((x) => x.includes('@')))]
  : [];

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed.' }); }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  const passcode = process.env.SEND_PASSCODE;
  if (!apiKey || !from) return res.status(501).json({ error: 'Not configured: set RESEND_API_KEY and RESEND_FROM in Vercel.' });
  if (!passcode) return res.status(501).json({ error: 'Not configured: set SEND_PASSCODE in Vercel.' });

  const provided = req.headers['x-send-passcode'] || '';
  if (provided !== passcode) return res.status(401).json({ error: 'Incorrect passcode.' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON body.' }); } }
  const subject = body && body.subject, text = body && body.text;
  const to = cleanList(body && body.to), bcc = cleanList(body && body.bcc);
  const replyTo = (body && body.replyTo) || undefined;
  if (!subject || !text) return res.status(400).json({ error: 'Missing subject or body.' });
  if (!to.length && !bcc.length) return res.status(400).json({ error: 'No recipients.' });

  const resend = new Resend(apiKey);
  try {
    let sent = 0;
    if (bcc.length) {
      // Bulk: one message per chunk, recipients hidden in BCC, `to` = the from address.
      for (const group of chunk(bcc, 45)) {
        const r = await resend.emails.send({ from, to: [from], bcc: group, subject, text, replyTo });
        if (r.error) throw new Error(r.error.message || 'Resend error');
        sent += group.length;
      }
    } else {
      const r = await resend.emails.send({ from, to, subject, text, replyTo });
      if (r.error) throw new Error(r.error.message || 'Resend error');
      sent += to.length;
    }
    return res.status(200).json({ ok: true, sent });
  } catch (err) {
    return res.status(502).json({ error: (err && err.message) || 'Send failed.' });
  }
}
