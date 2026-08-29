const https = require('https');

// Credit packages — keyed by id, used by POST /api/credits/purchase
const PACKAGES = {
  standard: { price_ksh: 100, credits: 7,  name: 'Just for now'    },
  plus:     { price_ksh: 250, credits: 20, name: "I'm committed"    },
  premium:  { price_ksh: 500, credits: 50, name: 'All of me'        },
};

// Daraja credentials from env — populated when credentials are approved
const {
  DARAJA_CONSUMER_KEY,
  DARAJA_CONSUMER_SECRET,
  DARAJA_BUSINESS_SHORT_CODE,
  DARAJA_PASSKEY,
  DARAJA_CALLBACK_URL,
} = process.env;

const DARAJA_BASE = process.env.DARAJA_ENV === 'production'
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke';

// Fetch OAuth token — valid for 3599 seconds (not cached here, keep stateless)
async function getAccessToken() {
  const credentials = Buffer.from(`${DARAJA_CONSUMER_KEY}:${DARAJA_CONSUMER_SECRET}`).toString('base64');
  const res = await fetch(`${DARAJA_BASE}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
  });
  if (!res.ok) throw new Error(`Daraja OAuth failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

// Generate Base64 password for STK Push: ShortCode + Passkey + Timestamp
function getPassword(timestamp) {
  return Buffer.from(`${DARAJA_BUSINESS_SHORT_CODE}${DARAJA_PASSKEY}${timestamp}`).toString('base64');
}

function getTimestamp() {
  return new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 14);
}

// STK Push — sends a payment prompt to the user's phone
// phone: Safaricom number in 254XXXXXXXXX format (no +)
// amountKsh: integer, minimum 1
// accountRef: order reference shown to user
// description: transaction description shown to user
async function stkPush(phone, amountKsh, accountRef, description) {
  const token = await getAccessToken();
  const timestamp = getTimestamp();
  const password = getPassword(timestamp);

  const body = {
    BusinessShortCode: DARAJA_BUSINESS_SHORT_CODE,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: Math.round(amountKsh),
    PartyA: phone,
    PartyB: DARAJA_BUSINESS_SHORT_CODE,
    PhoneNumber: phone,
    CallBackURL: DARAJA_CALLBACK_URL,
    AccountReference: accountRef,
    TransactionDesc: description,
  };

  const res = await fetch(`${DARAJA_BASE}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`STK Push failed ${res.status}: ${err}`);
  }

  const data = await res.json();
  // data.ResponseCode === '0' means request accepted (not yet paid)
  // data.CheckoutRequestID used to correlate the callback
  if (data.ResponseCode !== '0') {
    throw new Error(`STK Push rejected: ${data.ResponseDescription}`);
  }

  return { checkoutRequestId: data.CheckoutRequestID, merchantRequestId: data.MerchantRequestID };
}

// Parse and validate the Safaricom callback body
// Returns { success, checkoutRequestId, phone, amount, mpesaReceiptNumber }
function parseCallback(body) {
  const stkCallback = body?.Body?.stkCallback;
  if (!stkCallback) throw new Error('Invalid callback shape');

  const { ResultCode, CheckoutRequestID, CallbackMetadata } = stkCallback;
  const success = ResultCode === 0;

  if (!success) {
    return { success: false, checkoutRequestId: CheckoutRequestID };
  }

  const items = CallbackMetadata?.Item ?? [];
  const get = (name) => items.find((i) => i.Name === name)?.Value ?? null;

  return {
    success: true,
    checkoutRequestId: CheckoutRequestID,
    phone: String(get('PhoneNumber')),
    amount: Number(get('Amount')),
    mpesaReceiptNumber: get('MpesaReceiptNumber'),
  };
}

// Normalise a phone string to 254XXXXXXXXX format
// Accepts: +254..., 254..., 07X..., 01X... (Safaricom Kenya — 07X and 01X prefixes)
function normalisePhone(raw) {
  const digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('254') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 10) return `254${digits.slice(1)}`;
  if (digits.length === 9) return `254${digits}`;
  throw new Error('Unrecognised phone format — expected Kenyan number (07X or 01X)');
}

module.exports = { PACKAGES, stkPush, parseCallback, normalisePhone, getAccessToken };
