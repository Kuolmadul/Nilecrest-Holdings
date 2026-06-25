// ============================================
// Nilecrest Holdings -- File upload helper (Cloudinary)
// Used for quote attachments (drawings, BOQs, plans) and job application
// CVs/cover letters. Railway's local disk is wiped on every redeploy, so
// uploaded files must live somewhere persistent -- Cloudinary's free tier
// covers this comfortably for a site this size.
// ============================================

const multer = require('multer');
const cloudinary = require('cloudinary').v2;
require('dotenv').config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Files are held in memory only long enough to stream to Cloudinary --
// never written to Railway's local disk.
const storage = multer.memoryStorage();

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword', // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
]);

const upload = multer({
  storage,
  // Vercel serverless functions (this app's likely deploy target, per
  // vercel.json) cap request bodies at 4.5MB regardless of plan. Multer's
  // limit must stay safely under that, accounting for the rest of the
  // multipart payload (form fields, boundaries) -- 4MB leaves headroom.
  // If you move the API to a platform without that cap (e.g. running
  // server.js directly on Railway instead of through Vercel), this can
  // be raised back up.
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) return cb(null, true);
    cb(new Error('Unsupported file type. Please upload a PDF, Word document, or image.'));
  },
});

// Uploads a single in-memory file buffer to Cloudinary and returns the
// secure URL. `folder` keeps quote attachments and CVs organised separately
// in the Cloudinary dashboard.
function uploadBuffer(file, folder) {
  return new Promise((resolve, reject) => {
    if (!process.env.CLOUDINARY_CLOUD_NAME) {
      return reject(new Error('Cloudinary is not configured (CLOUDINARY_* env vars missing)'));
    }
    const stream = cloudinary.uploader.upload_stream(
      { folder: `nilecrest/${folder}`, resource_type: 'auto' },
      (err, result) => {
        if (err) return reject(err);
        resolve(result.secure_url);
      }
    );
    stream.end(file.buffer);
  });
}

module.exports = { upload, uploadBuffer };
