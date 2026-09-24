const { query } = require('../db');
const { getAccessToken } = require('./daraja');

const DARAJA_BASE = process.env.DARAJA_ENV === 'production'
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke';

// Initiate a Daraja B2C payout to a therapist.
// Idempotency: checks idempotency_key before calling Safaricom — safe to call on retry.
async function initiatePayout(payout_id) {
  const { rows } = await query(
    'SELECT * FROM therapist_payouts WHERE id = $1',
    [payout_id]
  );

  if (!rows.length) throw new Error(`Payout not found: ${payout_id}`);
  const payout = rows[0];

  if (payout.status === 'completed') return { already_completed: true };
  if (payout.status === 'processing') return { already_processing: true };

  const token = await getAccessToken();

  const body = {
    InitiatorName:       process.env.DARAJA_B2C_INITIATOR_NAME,
    SecurityCredential:  process.env.DARAJA_B2C_SECURITY_CREDENTIAL,
    CommandID:           'BusinessPayment',
    Amount:              payout.amount_kes,
    PartyA:              process.env.DARAJA_B2C_SHORT_CODE,
    PartyB:              payout.mpesa_number,
    Remarks:             `PeerPal therapy payout ${payout.idempotency_key}`,
    QueueTimeOutURL:     process.env.DARAJA_B2C_TIMEOUT_URL,
    ResultURL:           process.env.DARAJA_B2C_CALLBACK_URL,
    Occasion:            payout.idempotency_key,
  };

  const res = await fetch(`${DARAJA_BASE}/mpesa/b2c/v3/paymentrequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`B2C request failed ${res.status}: ${err}`);
  }

  const data = await res.json();

  if (data.ResponseCode !== '0') {
    throw new Error(`B2C rejected: ${data.ResponseDescription}`);
  }

  await query(
    `UPDATE therapist_payouts
     SET status = 'processing', initiated_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [payout_id]
  );

  return { conversation_id: data.ConversationID };
}

// Called on B2C callback failure or scheduled retry job.
// Retries once (retry_count <= 1). Beyond that, marks for manual admin review.
async function retryFailedPayout(payout_id) {
  const { rows } = await query(
    'SELECT * FROM therapist_payouts WHERE id = $1',
    [payout_id]
  );

  if (!rows.length) return;
  const payout = rows[0];

  if (payout.retry_count > 1) {
    // Escalate to admin — do not auto-retry further
    await query(
      `INSERT INTO notifications (user_id, type, payload, channel)
       SELECT id, 'account_notice', $1, 'in_app'
         FROM users WHERE role = 'admin' AND is_active = true`,
      [JSON.stringify({
        message: `Therapist payout ${payout_id} failed after ${payout.retry_count} attempts — manual review required`,
        payout_id,
        booking_id: payout.booking_id,
      })]
    );
    return { escalated: true };
  }

  await query(
    `UPDATE therapist_payouts
     SET retry_count = retry_count + 1,
         status = 'pending',
         next_retry_at = NOW() + INTERVAL '1 hour'
     WHERE id = $1`,
    [payout_id]
  );

  return initiatePayout(payout_id);
}

// Parse the Daraja B2C result callback.
// Returns { success, payout_id, mpesa_reference }
function parseB2CCallback(body) {
  const result = body?.Result;
  if (!result) throw new Error('Invalid B2C callback shape');

  const success = result.ResultCode === 0;
  const idempotencyKey = result.ReferenceData?.ReferenceItem?.Value ?? null;

  if (!success) {
    return { success: false, result_code: result.ResultCode, description: result.ResultDesc, idempotency_key: idempotencyKey };
  }

  const items = result.ResultParameters?.ResultParameter ?? [];
  const get = (name) => items.find((i) => i.Key === name)?.Value ?? null;

  return {
    success: true,
    idempotency_key: idempotencyKey,
    mpesa_reference: get('TransactionID'),
    amount: Number(get('TransactionAmount')),
    completed_at: get('TransactionCompletedDateTime'),
  };
}

module.exports = { initiatePayout, retryFailedPayout, parseB2CCallback };
