import 'dotenv/config';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import sharp from 'sharp';
import app from '../app.js';
import { connectDB } from '../config/db.js';
import { MAX_UPLOAD_SIZE, uploadRoot } from '../config/upload.js';
import Document from '../models/Document.js';
import User from '../models/User.js';
import { resolveStoredFile } from '../utils/fileUtils.js';
import { createTextPdf } from './pdfTestFixture.js';

const EMAILS = ['upload-a-user@lifeadmin.local', 'upload-b-user@lifeadmin.local'];
const PASSWORD = 'UploadTest123';

function check(condition, label) {
  if (!condition) throw new Error(`${label} failed`);
  console.log(`${label.padEnd(43, '.')} PASS`);
}

async function countFiles(directory = uploadRoot) {
  let total = 0;
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const itemPath = path.join(directory, entry.name);
    if (entry.isDirectory()) total += await countFiles(itemPath);
    else if (entry.name !== '.gitkeep') total += 1;
  }
  return total;
}

async function run() {
  let server;
  let fixtureDirectory;
  let testUserIds = [];
  try {
    await connectDB();
    await Promise.all([User.init(), Document.init()]);
    const oldUsers = await User.find({ email: { $in: EMAILS } }).select('_id');
    const oldIds = oldUsers.map((user) => user._id);
    const oldDocuments = await Document.find({ userId: { $in: oldIds } });
    await Promise.all(oldDocuments.map(async (document) => {
      const storedPath = resolveStoredFile(document.filePath);
      if (storedPath) await fs.rm(storedPath, { force: true });
    }));
    if (oldIds.length) await Document.deleteMany({ userId: { $in: oldIds } });
    await User.deleteMany({ email: { $in: EMAILS } });

    fixtureDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'lifeadmin-upload-test-'));
    const pdfPath = path.join(fixtureDirectory, 'My University Fee Notice.pdf');
    const pngPath = path.join(fixtureDirectory, 'bill image.png');
    const textPath = path.join(fixtureDirectory, 'notes.txt');
    const largePath = path.join(fixtureDirectory, 'too-large.pdf');
    await fs.writeFile(pdfPath, createTextPdf('LifeAdmin secure upload regression PDF'));
    await sharp({ create: { width: 320, height: 180, channels: 3, background: 'white' } }).png().toFile(pngPath);
    await fs.writeFile(textPath, 'not an allowed upload');
    await fs.writeFile(largePath, Buffer.alloc(MAX_UPLOAD_SIZE + 1, 0x20));

    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const jsonRequest = async (route, { token, body, ...options } = {}) => {
      const response = await fetch(`${baseUrl}${route}`, {
        ...options,
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    };
    const upload = async ({ token, filePath, filename, type, fields = {} }) => {
      const form = new FormData();
      if (filePath) form.append('file', new Blob([await fs.readFile(filePath)], { type }), filename || path.basename(filePath));
      Object.entries(fields).forEach(([key, value]) => form.append(key, value));
      const response = await fetch(`${baseUrl}/api/documents/upload`, {
        method: 'POST',
        headers: token ? { authorization: `Bearer ${token}` } : {},
        body: form,
      });
      return { status: response.status, body: await response.json() };
    };
    const register = (fullName, email) => jsonRequest('/api/auth/register', {
      method: 'POST', body: { fullName, email, password: PASSWORD },
    });
    const [registeredA, registeredB] = await Promise.all([
      register('Upload User A', EMAILS[0]), register('Upload User B', EMAILS[1]),
    ]);
    check(registeredA.status === 201 && registeredB.status === 201, 'Create dedicated upload users');
    const userA = registeredA.body;
    const userB = registeredB.body;
    testUserIds = [userA.user._id, userB.user._id];

    const initialFileCount = await countFiles();
    check((await upload({ filePath: pdfPath, type: 'application/pdf' })).status === 401, 'Upload requires authentication');
    check((await countFiles()) === initialFileCount, 'Unauthenticated upload leaves no file');

    const pdf = await upload({
      token: userA.token,
      filePath: pdfPath,
      type: 'application/pdf',
      fields: { title: 'Semester Fee Notice', category: 'university_notice', userId: userB.user._id, sourceType: 'text' },
    });
    check(pdf.status === 201 && pdf.body.document.sourceType === 'pdf', 'Valid PDF upload');
    const storedPdf = await Document.findById(pdf.body.document._id);
    const pdfDiskPath = resolveStoredFile(storedPdf.filePath);
    check(storedPdf.mimeType === 'application/pdf' && String(storedPdf.userId) === String(userA.user._id), 'PDF metadata and JWT ownership');
    check(Boolean(pdfDiskPath) && Boolean(await fs.stat(pdfDiskPath)), 'PDF physical file exists');
    check(storedPdf.originalFilename === 'My University Fee Notice.pdf', 'Original spaced filename preserved');
    check(path.basename(pdfDiskPath) !== storedPdf.originalFilename && pdfDiskPath.startsWith(path.resolve(uploadRoot)), 'Generated filename prevents traversal');
    check(storedPdf.extractedText.includes('LifeAdmin secure upload regression PDF'), 'PDF extraction runs for PDF upload');
    check((await jsonRequest(`/api/documents/${storedPdf._id}`, { token: userB.token })).status === 404, 'Other user cannot read upload');
    check((await jsonRequest(`/api/documents/${storedPdf._id}`, { method: 'DELETE', token: userB.token })).status === 404, 'Other user cannot delete upload');
    check(Boolean(await fs.stat(pdfDiskPath)), 'Cross-user delete preserves physical file');

    const image = await upload({ token: userA.token, filePath: pngPath, type: 'image/png', fields: { title: 'Electricity Bill', category: 'bill' } });
    const storedImage = await Document.findById(image.body.document?._id);
    check(image.status === 201 && storedImage?.sourceType === 'image' && storedImage.mimeType === 'image/png', 'Valid image upload');
    check(storedImage.extractedText === '', 'Blank image OCR stored honestly');

    const beforeInvalid = await countFiles();
    check((await upload({ token: userA.token, filePath: textPath, type: 'text/plain' })).status === 400, 'Unsupported type rejected');
    check((await upload({ token: userA.token, fields: { title: 'Missing' } })).status === 400, 'Missing file rejected');
    check((await upload({ token: userA.token, filePath: largePath, type: 'application/pdf' })).status === 413, 'Oversized file rejected');
    check((await upload({ token: userA.token, filePath: pdfPath, type: 'application/pdf', fields: { category: 'invalid_category' } })).status === 400, 'Invalid category rejected');
    check((await countFiles()) === beforeInvalid, 'Rejected uploads leave no files');

    const textDocument = await jsonRequest('/api/documents', { method: 'POST', token: userA.token, body: { title: 'Text record', sourceType: 'text', extractedText: 'No file attached' } });
    check((await jsonRequest(`/api/documents/${textDocument.body.document._id}`, { method: 'DELETE', token: userA.token })).status === 200, 'Text document deletion unchanged');

    check((await jsonRequest(`/api/documents/${storedPdf._id}`, { method: 'DELETE', token: userA.token })).status === 200, 'Owned upload document deleted');
    check(!(await Document.exists({ _id: storedPdf._id })), 'Uploaded MongoDB record deleted');
    await fs.access(pdfDiskPath).then(() => check(false, 'Physical upload deleted')).catch(() => check(true, 'Physical upload deleted'));
    console.log('Secure upload API verification completed successfully.');
  } catch (error) {
    console.error(`Secure upload API verification failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState) {
      const documents = testUserIds.length ? await Document.find({ userId: { $in: testUserIds } }) : [];
      await Promise.all(documents.map(async (document) => {
        const storedPath = resolveStoredFile(document.filePath);
        if (storedPath) await fs.rm(storedPath, { force: true });
      }));
      if (testUserIds.length) await Document.deleteMany({ userId: { $in: testUserIds } });
      await User.deleteMany({ email: { $in: EMAILS } });
      await mongoose.connection.close();
    }
    if (fixtureDirectory) await fs.rm(fixtureDirectory, { recursive: true, force: true });
  }
}

run();
