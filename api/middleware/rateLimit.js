const rateLimit = require('express-rate-limit');

// ---------- LOGIN: protects against password brute-forcing ----------
// 10 attempts per 15 minutes per IP, across both staff and client login.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in a few minutes.' },
});

// ---------- M-PESA STK PUSH: protects against phone-spam and Daraja quota abuse ----------
// This endpoint is public (no auth) by design -- clients pay from an invoice link.
// 5 requests per 10 minutes per IP keeps it usable for a real client retrying a
// failed PIN entry, while blocking someone scripting repeated pushes to a number.
const mpesaPayLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many payment requests for this invoice. Please wait a few minutes and try again.' },
});

// ---------- GENERAL API: broad safety net against scripted abuse/scraping ----------
// Generous enough that normal admin dashboard usage never feels it.
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

// ---------- PUBLIC FORM SUBMISSIONS: quote requests, job applications ----------
// Looser than login/mpesa since this just guards against scripted spam of
// public forms, not account or payment abuse. 8 submissions per 10 min per IP.
const publicSubmissionLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many submissions from this device. Please wait a few minutes and try again.' },
});

module.exports = { loginLimiter, mpesaPayLimiter, generalLimiter, publicSubmissionLimiter };
