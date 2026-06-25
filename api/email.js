// ============================================
// Nilecrest Holdings -- Email notifications (Resend)
// Currently handles: automatic "new invoice" email with a payment link,
// sent the moment staff create an invoice (if a client email is available).
// ============================================

const { Resend } = require('resend');
require('dotenv').config();

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// SITE_URL must be the real public domain (Railway URL for now, custom domain
// later) since email links can't use relative paths the way frontend JS can.
function getSiteUrl() {
  return process.env.SITE_URL || 'http://localhost:3000';
}

function formatMoney(n) {
  return `KES ${Number(n).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d) {
  if (!d) return 'N/A';
  return new Date(d).toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' });
}

// Sends the "you have a new invoice" email with a direct payment link.
// Never throws -- a failed email should never block invoice creation, so
// callers just fire-and-forget this and log on failure.
async function sendInvoiceEmail(invoice) {
  if (!resend) {
    console.warn('Resend is not configured (RESEND_API_KEY missing) -- skipping invoice email.');
    return { sent: false, reason: 'not_configured' };
  }
  if (!invoice.client_email) {
    return { sent: false, reason: 'no_email_on_file' };
  }

  const payUrl = `${getSiteUrl()}/pay.html?id=${invoice.id}`;

  try {
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'Nilecrest Holdings <onboarding@resend.dev>',
      to: invoice.client_email,
      subject: `Invoice ${invoice.invoice_number} from Nilecrest Holdings`,
      html: `
        <div style="font-family: -apple-system, Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1e293b;">
          <div style="background: #1B2A5E; padding: 24px 32px; border-radius: 8px 8px 0 0;">
            <h1 style="color: #fff; font-size: 18px; margin: 0;">Nilecrest Holdings</h1>
          </div>
          <div style="background: #fff; border: 1px solid #e2e6f0; border-top: none; border-radius: 0 0 8px 8px; padding: 32px;">
            <p style="font-size: 15px; margin-top: 0;">Hello ${invoice.client_name},</p>
            <p style="font-size: 15px; line-height: 1.6;">An invoice has been issued for your account. Details below:</p>
            <table style="width: 100%; font-size: 14px; margin: 20px 0; border-collapse: collapse;">
              <tr><td style="padding: 6px 0; color: #64748b;">Invoice Number</td><td style="padding: 6px 0; font-weight: 600; text-align: right;">${invoice.invoice_number}</td></tr>
              <tr><td style="padding: 6px 0; color: #64748b;">Amount Due</td><td style="padding: 6px 0; font-weight: 600; text-align: right;">${formatMoney(invoice.amount)}</td></tr>
              <tr><td style="padding: 6px 0; color: #64748b;">Due Date</td><td style="padding: 6px 0; font-weight: 600; text-align: right;">${formatDate(invoice.due_date)}</td></tr>
            </table>
            <div style="text-align: center; margin: 28px 0;">
              <a href="${payUrl}" style="background: #C1440E; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">View &amp; Pay Invoice</a>
            </div>
            <p style="font-size: 12.5px; color: #94a3b8; line-height: 1.6;">You can pay via M-Pesa directly on that page, or by bank transfer using the details shown there. If the button doesn't work, copy this link into your browser:<br>${payUrl}</p>
          </div>
          <p style="font-size: 11.5px; color: #94a3b8; text-align: center; margin-top: 16px;">Nilecrest Holdings &middot; Logistics &middot; Transport &middot; Construction</p>
        </div>
      `,
    });
    return { sent: true };
  } catch (err) {
    console.error('Failed to send invoice email:', err.message);
    return { sent: false, reason: 'send_failed', error: err.message };
  }
}

module.exports = { sendInvoiceEmail };
