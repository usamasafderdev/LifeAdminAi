import 'dotenv/config';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import sharp from 'sharp';
import app from '../app.js';
import { connectDB } from '../config/db.js';
import { uploadRoot } from '../config/upload.js';
import Document from '../models/Document.js';
import User from '../models/User.js';
import { resolveStoredFile } from '../utils/fileUtils.js';
import { OcrError, validateOcrTextLength } from '../services/ocrService.js';

const EMAILS = ['ocr-a-user@lifeadmin.local', 'ocr-b-user@lifeadmin.local'];
const PASSWORD = 'OcrTestPassword123';
function check(condition, label) { if (!condition) throw new Error(`${label} failed`); console.log(`${label.padEnd(43, '.')} PASS`); }
async function countFiles(directory = uploadRoot) { let total = 0; for (const entry of await fs.readdir(directory, { withFileTypes: true })) { if (entry.isDirectory()) total += await countFiles(path.join(directory, entry.name)); else if (entry.name !== '.gitkeep') total += 1; } return total; }

async function createFixtures(directory) {
  const svg = Buffer.from('<svg width="1200" height="420" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><text x="70" y="145" font-family="Arial" font-size="72" font-weight="bold" fill="black">LifeAdmin OCR Test</text><text x="70" y="270" font-family="Arial" font-size="62" fill="black">Deadline September 10</text></svg>');
  const blank = Buffer.from('<svg width="600" height="300" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/></svg>');
  const files = { png: path.join(directory, 'ocr-test.png'), jpeg: path.join(directory, 'ocr-test.jpg'), webp: path.join(directory, 'ocr-test.webp'), blank: path.join(directory, 'blank.png'), corrupt: path.join(directory, 'corrupt.png') };
  await Promise.all([sharp(svg).png().toFile(files.png), sharp(svg).jpeg({ quality: 95 }).toFile(files.jpeg), sharp(svg).webp({ quality: 95 }).toFile(files.webp), sharp(blank).png().toFile(files.blank), fs.writeFile(files.corrupt, Buffer.from('not an image'))]);
  return files;
}

async function run() {
  let server; let fixtureDirectory; let userIds = [];
  try {
    await connectDB(); await Promise.all([User.init(), Document.init()]);
    let textLimitError;
    try { validateOcrTextLength('x'.repeat(200001)); } catch (error) { textLimitError = error; }
    check(textLimitError instanceof OcrError && textLimitError.statusCode === 422, 'OCR text limit rejected');
    const oldUsers = await User.find({ email: { $in: EMAILS } }).select('_id');
    const oldIds = oldUsers.map((user) => user._id);
    const oldDocuments = await Document.find({ userId: { $in: oldIds } });
    await Promise.all(oldDocuments.map((document) => { const file = resolveStoredFile(document.filePath); return file ? fs.rm(file, { force: true }) : null; }));
    if (oldIds.length) await Document.deleteMany({ userId: { $in: oldIds } });
    await User.deleteMany({ email: { $in: EMAILS } });
    fixtureDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'lifeadmin-ocr-test-'));
    const files = await createFixtures(fixtureDirectory);
    server = app.listen(0); await new Promise((resolve) => server.once('listening', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const json = async (route, { token, body, ...options } = {}) => { const response = await fetch(`${baseUrl}${route}`, { ...options, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: response.status, body: await response.json() }; };
    const upload = async (filePath, mime, token, fields = {}) => { const form = new FormData(); form.append('file', new Blob([await fs.readFile(filePath)], { type: mime }), path.basename(filePath)); Object.entries(fields).forEach(([key, value]) => form.append(key, value)); const response = await fetch(`${baseUrl}/api/documents/upload`, { method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}, body: form }); return { status: response.status, body: await response.json() }; };
    const register = (name, email) => json('/api/auth/register', { method: 'POST', body: { fullName: name, email, password: PASSWORD } });
    const [registeredA, registeredB] = await Promise.all([register('OCR User A', EMAILS[0]), register('OCR User B', EMAILS[1])]);
    check(registeredA.status === 201 && registeredB.status === 201, 'Create OCR test users');
    const userA = registeredA.body; const userB = registeredB.body; userIds = [userA.user._id, userB.user._id];
    const beforeUnauthenticated = await countFiles();
    check((await upload(files.png, 'image/png')).status === 401, 'Image OCR requires authentication');
    check((await countFiles()) === beforeUnauthenticated, 'Unauthenticated image leaves no file');
    const png = await upload(files.png, 'image/png', userA.token, { title: 'OCR PNG', category: 'information', userId: userB.user._id, sourceType: 'pdf' });
    check(png.status === 201 && png.body.document.sourceType === 'image', 'PNG recognized as backend image');
    check(/LifeAdmin OCR Test/i.test(png.body.document.extractedText) && /September 10/i.test(png.body.document.extractedText), 'PNG real text recognized');
    check(String(png.body.document.userId) === String(userA.user._id), 'Multipart ownership ignored safely');
    const jpeg = await upload(files.jpeg, 'image/jpeg', userA.token, { title: 'OCR JPEG' });
    check(jpeg.status === 201 && /LifeAdmin OCR Test/i.test(jpeg.body.document.extractedText), 'JPEG real text recognized');
    const webp = await upload(files.webp, 'image/webp', userA.token, { title: 'OCR WebP' });
    check(webp.status === 201 && /September 10/i.test(webp.body.document.extractedText), 'WebP real text recognized');
    const blank = await upload(files.blank, 'image/png', userA.token, { title: 'Blank Image' });
    check(blank.status === 201 && blank.body.document.extractedText === '' && /no readable text/i.test(blank.body.message), 'Valid no-text image saved honestly');
    const beforeCorrupt = await countFiles(); const docsBeforeCorrupt = await Document.countDocuments({ userId: userA.user._id });
    const corrupt = await upload(files.corrupt, 'image/png', userA.token);
    check(corrupt.status === 400 && corrupt.body.message === 'Unable to read this image', 'Corrupt image rejected safely');
    check((await countFiles()) === beforeCorrupt && (await Document.countDocuments({ userId: userA.user._id })) === docsBeforeCorrupt, 'Corrupt image fully cleaned up');
    const invalidCategory = await upload(files.png, 'image/png', userA.token, { category: 'invalid' });
    check(invalidCategory.status === 400 && (await countFiles()) === beforeCorrupt, 'Invalid category image cleaned up');
    const document = await Document.findById(png.body.document._id); const storedPath = resolveStoredFile(document.filePath);
    check((await json(`/api/documents/${document._id}`, { token: userB.token })).status === 404, 'Other user cannot read OCR image');
    check((await json(`/api/documents/${document._id}`, { method: 'DELETE', token: userB.token })).status === 404, 'Other user cannot delete OCR image');
    check(Boolean(await fs.stat(storedPath)), 'Cross-user delete preserves OCR image');
    check((await json(`/api/documents/${document._id}`, { method: 'DELETE', token: userA.token })).status === 200, 'Owner deletes OCR image document');
    await fs.access(storedPath).then(() => check(false, 'Owner deletion removes OCR image')).catch(() => check(true, 'Owner deletion removes OCR image'));
    check((await fetch(`${baseUrl}/api/health`)).status === 200, 'API health remains available');
    console.log('OCR verification completed successfully.');
  } catch (error) { console.error(`OCR verification failed: ${error.message}`); process.exitCode = 1; }
  finally { if (server) await new Promise((resolve) => server.close(resolve)); if (mongoose.connection.readyState) { const remaining = userIds.length ? await Document.find({ userId: { $in: userIds } }) : []; await Promise.all(remaining.map((document) => { const file = resolveStoredFile(document.filePath); return file ? fs.rm(file, { force: true }) : null; })); if (userIds.length) await Document.deleteMany({ userId: { $in: userIds } }); await User.deleteMany({ email: { $in: EMAILS } }); await mongoose.connection.close(); } if (fixtureDirectory) await fs.rm(fixtureDirectory, { recursive: true, force: true }); }
}
run();
