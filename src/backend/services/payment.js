'use strict';

/**
 * Payment adapter — swap between IntaSend (STK push) and Paystack (hosted checkout)
 * by changing PAYMENT_PROVIDER env var.
 *
 * Both adapters export:
 *   initiatePayment({ amount, phone, email, bookingId }) → { reference, type, checkoutUrl? }
 *   verifyWebhook(rawBody: Buffer, headers: object)      → { success, reference, apiRef, amount }
 *
 * PAYMENT_PROVIDER=intasend (default) → M-Pesa STK push, polling UX
 * PAYMENT_PROVIDER=paystack           → hosted checkout redirect UX
 *
 * Note: switching to Paystack also requires a frontend change in TherapistBookingScreen
 * to handle checkoutUrl redirects instead of the STK polling screen.
 */
const provider = (process.env.PAYMENT_PROVIDER || 'intasend').toLowerCase();

module.exports = provider === 'paystack'
  ? require('./adapters/paystack')
  : require('./adapters/intasend');
