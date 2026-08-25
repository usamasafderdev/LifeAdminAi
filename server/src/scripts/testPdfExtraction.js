import 'dotenv/config';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import app from '../app.js';
import { connectDB } from '../config/db.js';
import { uploadRoot } from '../config/upload.js';
import Document from '../models/Document.js';
import User from '../models/User.js';
import { resolveStoredFile } from '../utils/fileUtils.js';
import { MAX_EXTRACTED_TEXT_LENGTH, PdfExtractionError, formatExtractedPdfContent, validateExtractedTextLength } from '../services/pdfExtractionService.js';
import { createTextPdf } from './pdfTestFixture.js';

const EMAILS = ['pdf-a-user@lifeadmin.local', 'pdf-b-user@lifeadmin.local'];
const PASSWORD = 'PdfTestPassword123';

function check(condition, label) {
  if (!condition) throw new Error(`${label} failed`);
  console.log(`${label.padEnd(43, '.')} PASS`);
}

async function countFiles(directory = uploadRoot) {
  let total = 0;
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) total += await countFiles(path.join(directory, entry.name));
    else if (entry.name !== '.gitkeep') total += 1;
  }
  return total;
}

async function run() {
  let server;
  let fixtureDirectory;
  let userIds = [];
  try {
    await connectDB();
    await Promise.all([User.init(), Document.init()]);
    const formattedTable = formatExtractedPdfContent(
      'Account Activity\nBranch: Main\nAccount Number Balance\n123 10.00',
      { pages: [{ tables: [[['Account Number', 'Balance'], ['123', '10.00']]] }] },
    );
    check(formattedTable.includes('# Account Activity') && formattedTable.includes('**Branch:** Main'), 'PDF summary fields formatted');
    check(formattedTable.includes('## Account details') && formattedTable.includes('| Account Number | Balance |') && formattedTable.includes('| 123 | 10.00 |'), 'PDF table structure preserved');
    const previousUsers = await User.find({ email: { $in: EMAILS } }).select('_id');
    const previousIds = previousUsers.map((user) => user._id);
    const previousDocuments = await Document.find({ userId: { $in: previousIds } });
    await Promise.all(previousDocuments.map((document) => {
      const file = resolveStoredFile(document.filePath);
      return file ? fs.rm(file, { force: true }) : null;
    }));
    if (previousIds.length) await Document.deleteMany({ userId: { $in: previousIds } });
    await User.deleteMany({ email: { $in: EMAILS } });

    fixtureDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'lifeadmin-pdf-test-'));
    const digitalPdf = path.join(fixtureDirectory, 'Internship Notice.pdf');
    const emptyPdf = path.join(fixtureDirectory, 'Scanned Wrapper.pdf');
    const corruptPdf = path.join(fixtureDirectory, 'Corrupt.pdf');
    await fs.writeFile(digitalPdf, createTextPdf('LifeAdmin PDF extraction test\nInternship report deadline September 10'));
    await fs.writeFile(emptyPdf, createTextPdf(''));
    await fs.writeFile(corruptPdf, Buffer.from('%PDF-this is not a structurally valid PDF'));

    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const json = async (route, { token, body, ...options } = {}) => {
      const response = await fetch(`${baseUrl}${route}`, { ...options, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: response.status, body: await response.json() };
    };
    const upload = async (filePath, token, fields = {}) => {
      const form = new FormData();
      form.append('file', new Blob([await fs.readFile(filePath)], { type: 'application/pdf' }), path.basename(filePath));
      Object.entries(fields).forEach(([key, value]) => form.append(key, value));
      const response = await fetch(`${baseUrl}/api/documents/upload`, { method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}, body: form });
      return { status: response.status, body: await response.json() };
    };
    const register = (name, email) => json('/api/auth/register', { method: 'POST', body: { fullName: name, email, password: PASSWORD } });
    const [registeredA, registeredB] = await Promise.all([register('PDF User A', EMAILS[0]), register('PDF User B', EMAILS[1])]);
    check(registeredA.status === 201 && registeredB.status === 201, 'Create PDF test users');
    const userA = registeredA.body;
    const userB = registeredB.body;
    userIds = [userA.user._id, userB.user._id];

    const beforeUnauthenticated = await countFiles();
    check((await upload(digitalPdf)).status === 401, 'PDF upload requires authentication');
    check((await countFiles()) === beforeUnauthenticated, 'Unauthenticated PDF leaves no file');

    const uploaded = await upload(digitalPdf, userA.token, { title: 'Internship Notice', category: 'university_notice', userId: userB.user._id, sourceType: 'image' });
    check(uploaded.status === 201 && uploaded.body.document.sourceType === 'pdf', 'Valid digital PDF uploaded');
    const document = await Document.findById(uploaded.body.document._id);
    check(document.extractedText.includes('LifeAdmin PDF extraction test'), 'Known PDF heading extracted');
    check(document.extractedText.includes('Internship report deadline September 10'), 'Known PDF body extracted');
    check(document.originalFilename === 'Internship Notice.pdf' && document.mimeType === 'application/pdf' && String(document.userId) === String(userA.user._id), 'PDF MongoDB metadata correct');
    const storedPath = resolveStoredFile(document.filePath);
    check(Boolean(await fs.stat(storedPath)), 'Extracted PDF physical file exists');
    const ownerFile = await fetch(`${baseUrl}/api/documents/${document._id}/file`, { headers: { authorization: `Bearer ${userA.token}` } });
    check(ownerFile.status === 200 && ownerFile.headers.get('content-type')?.includes('application/pdf'), 'Owner previews original PDF');
    const otherUserFile = await fetch(`${baseUrl}/api/documents/${document._id}/file`, { headers: { authorization: `Bearer ${userB.token}` } });
    check(otherUserFile.status === 404, 'Other user cannot preview PDF');

    const filesBeforeCorrupt = await countFiles();
    const documentsBeforeCorrupt = await Document.countDocuments({ userId: userA.user._id });
    const corrupted = await upload(corruptPdf, userA.token);
    check(corrupted.status === 400 && corrupted.body.message === 'Unable to read this PDF', 'Corrupted PDF rejected safely');
    check((await countFiles()) === filesBeforeCorrupt && (await Document.countDocuments({ userId: userA.user._id })) === documentsBeforeCorrupt, 'Corrupted PDF fully cleaned up');

    const noText = await upload(emptyPdf, userA.token, { title: 'Scanned PDF wrapper' });
    const noTextDocument = await Document.findById(noText.body.document?._id);
    check(noText.status === 201 && noTextDocument?.extractedText === '', 'Valid no-text PDF saved empty');
    check(/no extractable text/i.test(noText.body.message), 'No-text PDF response is explicit');

    let textLimitError;
    try { validateExtractedTextLength('x'.repeat(MAX_EXTRACTED_TEXT_LENGTH + 1)); } catch (error) { textLimitError = error; }
    check(textLimitError instanceof PdfExtractionError && textLimitError.statusCode === 422, 'Extraction text limit rejected');

    check((await json(`/api/documents/${document._id}`, { token: userB.token })).status === 404, 'Other user cannot read PDF');
    check((await json(`/api/documents/${document._id}`, { method: 'DELETE', token: userB.token })).status === 404, 'Other user cannot delete PDF');
    check(Boolean(await fs.stat(storedPath)), 'Cross-user delete preserves PDF');
    check((await json(`/api/documents/${document._id}`, { method: 'DELETE', token: userA.token })).status === 200, 'Owner deletes PDF document');
    await fs.access(storedPath).then(() => check(false, 'Owner deletion removes PDF file')).catch(() => check(true, 'Owner deletion removes PDF file'));
    console.log('PDF extraction verification completed successfully.');
  } catch (error) {
    console.error(`PDF extraction verification failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState) {
      const remaining = userIds.length ? await Document.find({ userId: { $in: userIds } }) : [];
      await Promise.all(remaining.map((document) => {
        const file = resolveStoredFile(document.filePath);
        return file ? fs.rm(file, { force: true }) : null;
      }));
      if (userIds.length) await Document.deleteMany({ userId: { $in: userIds } });
      await User.deleteMany({ email: { $in: EMAILS } });
      await mongoose.connection.close();
    }
    if (fixtureDirectory) await fs.rm(fixtureDirectory, { recursive: true, force: true });
  }
}

run();
