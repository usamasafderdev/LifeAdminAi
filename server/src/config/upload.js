import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';

export const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;
export const uploadRoot = fileURLToPath(new URL('../../uploads/', import.meta.url));

const fileTypes = new Map([
  ['application/pdf', { extensions: ['.pdf'], directory: 'documents' }],
  ['image/jpeg', { extensions: ['.jpg', '.jpeg'], directory: 'images' }],
  ['image/png', { extensions: ['.png'], directory: 'images' }],
  ['image/webp', { extensions: ['.webp'], directory: 'images' }],
]);

for (const directory of ['documents', 'images']) {
  fs.mkdirSync(path.join(uploadRoot, directory), { recursive: true });
}

const storage = multer.diskStorage({
  destination(req, file, callback) {
    callback(null, path.join(uploadRoot, fileTypes.get(file.mimetype).directory));
  },
  filename(req, file, callback) {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${Date.now()}-${crypto.randomUUID()}${extension}`);
  },
});

function fileFilter(req, file, callback) {
  const rule = fileTypes.get(file.mimetype);
  const extension = path.extname(file.originalname).toLowerCase();
  if (!rule || !rule.extensions.includes(extension)) {
    const error = new Error('Unsupported file type');
    error.statusCode = 400;
    return callback(error);
  }
  return callback(null, true);
}

export const uploadSingleFile = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_UPLOAD_SIZE, files: 1 },
}).single('file');

export function uploadErrorHandler(error, req, res, next) {
  if (!error) return next();
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ success: false, message: 'File must be 10 MB or smaller' });
  }
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ success: false, message: 'Invalid file upload' });
  }
  if (error.statusCode === 400) {
    return res.status(400).json({ success: false, message: error.message });
  }
  return next(error);
}

export function storedFilePath(file) {
  const directory = fileTypes.get(file.mimetype).directory;
  return path.posix.join('uploads', directory, file.filename);
}
