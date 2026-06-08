const { Resend } = require('resend');

let _resend = null;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

function verificationTemplate(alias, link) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F5F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:520px;margin:40px auto">
    <tr><td style="background:#ffffff;border-radius:12px;padding:40px 36px;color:#1A1A2E">
      <p style="font-size:22px;font-weight:600;margin:0 0 8px">PeerPal</p>
      <p style="font-size:16px;color:#555;margin:0 0 28px">Hi ${alias},</p>
      <p style="font-size:16px;line-height:1.6;margin:0 0 28px">
        Welcome to PeerPal. We're glad you're here.<br>
        Please confirm your email address to get started.
      </p>
      <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 28px">
        <tr><td style="background:#5BAD9A;border-radius:8px;padding:14px 28px">
          <a href="${link}" style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:600">Confirm my email</a>
        </td></tr>
      </table>
      <p style="font-size:13px;color:#888;line-height:1.5;margin:0 0 8px">This link expires in 24 hours.</p>
      <p style="font-size:13px;color:#888;line-height:1.5;margin:0">
        If you didn't create an account, you can safely ignore this email.
      </p>
      <hr style="border:none;border-top:1px solid #eee;margin:28px 0">
      <p style="font-size:12px;color:#aaa;margin:0">— The PeerPal Team</p>
    </td></tr>
  </table>
</body>
</html>`;
}

function resetTemplate(alias, link) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F5F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:520px;margin:40px auto">
    <tr><td style="background:#ffffff;border-radius:12px;padding:40px 36px;color:#1A1A2E">
      <p style="font-size:22px;font-weight:600;margin:0 0 8px">PeerPal</p>
      <p style="font-size:16px;color:#555;margin:0 0 28px">Hi ${alias},</p>
      <p style="font-size:16px;line-height:1.6;margin:0 0 28px">
        We received a request to reset your password.
      </p>
      <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 28px">
        <tr><td style="background:#5BAD9A;border-radius:8px;padding:14px 28px">
          <a href="${link}" style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:600">Reset my password</a>
        </td></tr>
      </table>
      <p style="font-size:13px;color:#888;line-height:1.5;margin:0 0 8px">This link expires in 15 minutes.</p>
      <p style="font-size:13px;color:#888;line-height:1.5;margin:0">
        If you didn't request this, your account is safe — ignore this email.
      </p>
      <hr style="border:none;border-top:1px solid #eee;margin:28px 0">
      <p style="font-size:12px;color:#aaa;margin:0">— The PeerPal Team</p>
    </td></tr>
  </table>
</body>
</html>`;
}

// Direct delivery — called by emailWorker and as fallback when queue is unavailable.
async function deliverEmail(to, subject, html) {
  if (!process.env.RESEND_API_KEY) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DEV] Would send email to ${to.slice(0, 3)}***: ${subject}`);
    }
    return;
  }
  await getResend().emails.send({
    from: process.env.EMAIL_FROM,
    to,
    subject,
    html,
  });
}

// Enqueue for async delivery — fire-and-forget. Returns immediately; email sends in background.
function enqueueEmail(to, subject, html) {
  const { emailQueue } = require('../queues');

  (async () => {
    if (emailQueue) {
      try {
        await Promise.race([
          emailQueue.add('send', { to, subject, html }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('queue timeout after 2s')), 2000)
          ),
        ]);
        return;
      } catch (err) {
        console.warn('[email] Queue unavailable, falling back to direct send:', err.message);
      }
    }
    await deliverEmail(to, subject, html);
  })().catch(err => console.error('[email] Delivery failed:', err.message));
  // Caller returns immediately — no await needed
}

async function sendVerificationEmail(email, alias, token) {
  const link = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;
  await enqueueEmail(email, 'Confirm your PeerPal account', verificationTemplate(alias, link));
}

async function sendPasswordResetEmail(email, alias, token) {
  const link = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
  await enqueueEmail(email, 'Reset your PeerPal password', resetTemplate(alias, link));
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail, deliverEmail };
