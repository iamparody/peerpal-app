const { query } = require('../db');
const { deliverEmail } = require('../services/emailService');

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Emails a daily digest of new waitlist signups to WAITLIST_NOTIFY_EMAIL.
// No-op when that env isn't set, or when there were no new signups yesterday.
// Covers the previous full UTC day, so runs never overlap or drop signups.
async function runWaitlistDigestJob() {
  const to = process.env.WAITLIST_NOTIFY_EMAIL || 'support@peer-pal.com';

  const until = new Date();
  until.setUTCHours(0, 0, 0, 0);
  const since = new Date(until);
  since.setUTCDate(since.getUTCDate() - 1);

  const { rows: newRows } = await query(
    `SELECT email, source, created_at FROM waitlist_signups
      WHERE created_at >= $1 AND created_at < $2
      ORDER BY created_at ASC`,
    [since, until]
  );

  if (newRows.length === 0) return; // nothing new → stay quiet

  const { rows: totalRows } = await query('SELECT COUNT(*)::int AS total FROM waitlist_signups');
  const total = totalRows[0].total;

  const tableRows = newRows
    .map((r) => `<tr>
        <td style="padding:5px 12px;border-bottom:1px solid #eee">${escapeHtml(r.email)}</td>
        <td style="padding:5px 12px;border-bottom:1px solid #eee;color:#8a7d73">${escapeHtml(r.source)}</td>
      </tr>`)
    .join('');

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:620px;margin:0 auto;color:#2f2622">
      <h1 style="font-family:Georgia,serif;font-weight:500;font-size:22px;margin:0 0 6px">
        PeerPal waitlist — ${newRows.length} new signup${newRows.length === 1 ? '' : 's'}
      </h1>
      <p style="font-size:14px;color:#5c5048;margin:0 0 18px">${total} people on the waitlist in total.</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px">
        <thead>
          <tr>
            <th style="text-align:left;padding:5px 12px;border-bottom:2px solid #ddd">Email</th>
            <th style="text-align:left;padding:5px 12px;border-bottom:2px solid #ddd">Source</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
      <p style="font-size:12px;color:#8a7d73;margin:22px 0 0">
        Full list / CSV export: GET /api/waitlist?format=csv (admin auth required).
      </p>
    </div>`;

  await deliverEmail(to, `PeerPal waitlist: ${newRows.length} new (${total} total)`, html);
}

module.exports = { runWaitlistDigestJob };
