// ============================================
// Nilecrest Holdings -- M-Pesa (Daraja) helper
// Handles OAuth token fetching and STK Push (Lipa Na M-Pesa Online).
// Sandbox vs Production is controlled entirely by MPESA_ENV in .env --
// no code changes needed when you move from testing to live.
// ============================================

require('dotenv').config();

const ENV = process.env.MPESA_ENV === 'production' ? 'production' : 'sandbox';
const BASE_URL = ENV === 'production'
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke';

// Daraja access tokens last ~1 hour. We cache it in memory and only
// re-fetch once it's close to expiring, rather than on every request.
let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const key = process.env.MPESA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET;
  if (!key || !secret) throw new Error('MPESA_CONSUMER_KEY / MPESA_CONSUMER_SECRET not set');

  const credentials = Buffer.from(`${key}:${secret}`).toString('base64');
  const res = await fetch(`${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
  });
  if (!res.ok) throw new Error(`Daraja auth failed: ${res.status}`);
  const data = await res.json();

  cachedToken = data.access_token;
  // Refresh a little early (after 55 minutes) to avoid edge-of-expiry failures.
  tokenExpiresAt = Date.now() + 55 * 60 * 1000;
  return cachedToken;
}

// Daraja requires a timestamp in this exact format: YYYYMMDDHHmmss
function timestampNow() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// Kenyan numbers must be sent to Daraja as 2547XXXXXXXX (no leading 0 or +).
function normalizePhone(phone) {
  let p = String(phone).replace(/\s+/g, '').replace(/^\+/, '');
  if (p.startsWith('0')) p = '254' + p.slice(1);
  if (p.startsWith('7') || p.startsWith('1')) p = '254' + p; // e.g. "7XXXXXXXX" typed without prefix
  return p;
}

// Triggers the STK Push prompt on the client's phone.
// accountRef should be the invoice number, so the client sees what they're paying for.
async function stkPush({ phone, amount, accountRef, description, callbackUrl }) {
  const shortcode = process.env.MPESA_SHORTCODE;
  const passkey = process.env.MPESA_PASSKEY;
  if (!shortcode || !passkey) throw new Error('MPESA_SHORTCODE / MPESA_PASSKEY not set');

  const token = await getAccessToken();
  const timestamp = timestampNow();
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');

  const body = {
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: Math.round(Number(amount)),
    PartyA: normalizePhone(phone),
    PartyB: shortcode,
    PhoneNumber: normalizePhone(phone),
    CallBackURL: callbackUrl,
    AccountReference: accountRef.slice(0, 12), // Daraja limits this field to 12 chars
    TransactionDesc: (description || 'Nilecrest Holdings payment').slice(0, 13),
  };

  const res = await fetch(`${BASE_URL}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok || data.ResponseCode !== '0') {
    throw new Error(data.errorMessage || data.ResponseDescription || 'STK push request failed');
  }
  return data; // contains CheckoutRequestID, MerchantRequestID -- used to match the callback
}

module.exports = { getAccessToken, stkPush, normalizePhone };
