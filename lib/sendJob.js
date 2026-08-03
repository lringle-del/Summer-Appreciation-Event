import { Resend } from 'resend';
import crypto from 'crypto';

const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

const RSVP_URL = 'https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=Mroc1uTzJEKDyxHCW7gZ0jjOWHonDFNFp2Wp8sxbuP5UOFpCRFVCSTlITVE3TlJRUTBXUEI1SzE0US4u';
const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// Render a plain-text body as HTML: make URLs clickable, show the RSVP link as
// the words "RSVP here", and turn newlines into line breaks.
function toHtml(body) {
  let h = esc(body);
  h = h.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#1c6fd6">$1</a>');
  h = h.replace('RSVP here: <a href="' + RSVP_URL + '" style="color:#1c6fd6">' + RSVP_URL + '</a>',
    '<a href="' + RSVP_URL + '" style="color:#1c6fd6;font-weight:700">RSVP here</a>');
  h = h.replace(/\n/g, '<br>');
  return '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.6;color:#222">' + h + '</div>';
}

// Unguessable approval token for a job id (HMAC with CRON_SECRET).
export function tokenFor(id) {
  return crypto.createHmac('sha256', process.env.CRON_SECRET || 'x').update(String(id)).digest('hex').slice(0, 32);
}

// Send one approved job to its real recipients. Attendee -> BCC chunks (director
// BCC'd once on att3/att0). PL -> to the PL, BCC the state director.
export async function sendJob(job, { directors, audiences }) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = process.env.RESEND_FROM;
  const recipients = job.kind === 'pl' ? (job.plEmail ? [job.plEmail] : []) : (audiences[job.label] || []);
  if (!recipients.length) return { sent: 0, skipped: 'no recipients' };
  let sent = 0;
  if (job.kind === 'pl') {
    const r = await resend.emails.send({ from, to: recipients, bcc: (job.bcc && job.bcc.length) ? job.bcc : undefined, subject: job.subject, text: job.body, html: toHtml(job.body), replyTo: job.replyTo });
    if (r.error) throw new Error(r.error.message || 'Resend error');
    sent = recipients.length;
  } else {
    const extra = (Array.isArray(job.dirBcc) && job.dirBcc.length)
      ? job.dirBcc
      : (((job.key === 'att3' || job.key === 'att0') && directors[job.eventId]) ? [directors[job.eventId]] : []);
    const groups = chunk(recipients, 45);
    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi];
      const bcc = (gi === 0 && extra.length) ? g.concat(extra) : g;
      const r = await resend.emails.send({ from, to: [from], bcc, subject: job.subject, text: job.body, html: toHtml(job.body), replyTo: job.replyTo });
      if (r.error) throw new Error(r.error.message || 'Resend error');
      sent += g.length;
    }
  }
  return { sent };
}
