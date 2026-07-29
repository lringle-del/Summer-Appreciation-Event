import { readJSON, writeJSON } from '../lib/blobstore.js';
import { sendJob } from '../lib/sendJob.js';

const KEY = 'schedule.json';

/**
 * Approval store for reminders. Each job is keyed "<eventId>:<reminderKey>".
 * GET  -> { jobs: { id: {status, sentAt, sendOn, sentCount} } }  (no email bodies exposed)
 * POST (passcode) -> { id, action: 'approve'|'skip'|'remove', job? }
 *   approve job: { eventId, key, kind, label, sendOn:'YYYY-MM-DD', subject, body, plEmail?, replyTo? }
 */
export default async function handler(req, res) {
  if (req.method === 'GET') {
    const all = await readJSON(KEY, {});
    const jobs = {};
    for (const k in all) jobs[k] = { status: all[k].status, sentAt: all[k].sentAt || null, sendOn: all[k].sendOn || null, sentCount: all[k].sentCount || null, okToSend: !!all[k].okToSend, previewSentAt: all[k].previewSentAt || null };
    return res.status(200).json({ jobs });
  }

  if (req.method === 'POST') {
    const pass = process.env.SEND_PASSCODE;
    if (!pass) return res.status(501).json({ error: 'SEND_PASSCODE not configured.' });
    if ((req.headers['x-send-passcode'] || '') !== pass) return res.status(401).json({ error: 'Incorrect passcode.' });

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON.' }); } }
    const id = body && body.id, action = body && body.action;
    if (!id || !action) return res.status(400).json({ error: 'id and action are required.' });

    const all = await readJSON(KEY, {});
    if (action === 'remove') {
      delete all[id];
    } else if (action === 'skip') {
      all[id] = { ...(all[id] || {}), id, status: 'skipped', sentAt: null };
    } else if (action === 'approve') {
      const job = body.job;
      if (!job || !job.sendOn || !job.subject || !job.body || !job.kind) return res.status(400).json({ error: 'job requires kind, sendOn, subject, body.' });
      all[id] = { ...job, id, status: 'approved', sentAt: (all[id] && all[id].sentAt) || null };
    } else if (action === 'confirm') {
      // final approval (same as the preview's Approve button): release it; send now if already due
      const job = all[id];
      if (!job) return res.status(404).json({ error: 'No such reminder.' });
      if (job.status !== 'approved') return res.status(400).json({ error: 'Not scheduled.' });
      job.okToSend = true;
      const today = new Date().toISOString().slice(0, 10);
      let sent = false;
      if (job.sendOn <= today && !job.sentAt) {
        try {
          const auds = await readJSON('audiences.json', {}), dirs = await readJSON('directors.json', {});
          const r = await sendJob(job, { directors: dirs, audiences: auds });
          job.sentAt = new Date().toISOString(); job.sentCount = r.sent; sent = true;
        } catch (e) { /* keep okToSend; the daily job will retry */ }
      }
      all[id] = job;
      await writeJSON(KEY, all);
      return res.status(200).json({ ok: true, id, status: job.sentAt ? 'sent' : 'confirmed', sentNow: sent });
    } else {
      return res.status(400).json({ error: 'Unknown action.' });
    }
    await writeJSON(KEY, all);
    const status = action === 'remove' ? 'draft' : action === 'skip' ? 'skipped' : 'approved';
    return res.status(200).json({ ok: true, id, status });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed.' });
}
