import Reminder from '../models/Reminder.js';
import Task from '../models/Task.js';
import Notification from '../models/Notification.js';
import DocumentChunk from '../models/DocumentChunk.js';
import CalendarEvent from '../models/CalendarEvent.js';
import AvailabilityProfile from '../models/AvailabilityProfile.js';
import { answerWorkspaceQuestion } from '../services/assistantService.js';
import 'dotenv/config';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { createServer } from '../../../node_modules/vite/dist/node/index.js';
process.env.CLIENT_URL = 'http://127.0.0.1:5199';
const { default: app } = await import('../app.js');
import { connectDB } from '../config/db.js';
import User from '../models/User.js';
import Conversation from '../models/Conversation.js';
import WorkspaceChatMessage from '../models/WorkspaceChatMessage.js';
import DocumentChatMessage from '../models/DocumentChatMessage.js';
import Document from '../models/Document.js';
import { setWorkspaceAnswererForTests } from '../controllers/assistantController.js';
import { setDocumentChatAnswererForTests } from '../controllers/documentChatController.js';
import { AiError, AI_ERROR_CODES } from '../services/ai/aiService.js';
let apiServer, vite, browser, socket, userId;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (fn, label) => {
  for (let i = 0; i < 120; i++) {
    if (await fn()) return;
    await pause(150);
  }
  throw Error(`Timed out: ${label}`);
};
try {
  await connectDB();
  apiServer = app.listen(5011);
  await new Promise((resolve) => apiServer.once('listening', resolve));
  process.env.VITE_API_BASE_URL = 'http://127.0.0.1:5011/api';
  process.chdir(path.resolve('..'));
  vite = await createServer({
    root: process.cwd(),
    server: { host: '127.0.0.1', port: 5199, strictPort: true },
  });
  await vite.listen();
  console.log('Browser test services started');
  const account = await fetch('http://127.0.0.1:5011/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      fullName: 'Browser Verification',
      email: `${randomUUID()}@browser-test.local`,
      password: 'BrowserTest123',
    }),
  }).then((r) => r.json());
  userId = account.user._id;
  console.log('Browser test fixture created');
  const document = await Document.create({
    userId,
    title: 'Browser Document',
    sourceType: 'text',
    extractedText:
      'Submit the report on October 1. Cryptography assignment: compare CBC and CTR modes. Explain the CBC encryption mechanism.',
  });
  const syncTasks = await Task.create(
    ['Calendar completion fixture', 'Tasks completion fixture'].map((title) => ({
      userId,
      title,
      status: 'pending',
      source: 'manual',
      priorityOverride: 'high',
      dueDate: new Date(),
    })),
  );
  await AvailabilityProfile.create({
    userId,
    timezone: 'UTC',
    workingDays: [0, 1, 2, 3, 4, 5, 6],
    availableTimeRanges: [{ start: '00:00', end: '23:59' }],
  });
  const syncEvents = await CalendarEvent.create(
    syncTasks.map((task, i) => ({
      userId,
      title: task.title,
      relatedTaskId: task._id,
      type: 'task_block',
      startTime: new Date(Date.now() + i * 3600000),
      endTime: new Date(Date.now() + (i + 1) * 3600000),
    })),
  );
  let failOnce = true;
  setWorkspaceAnswererForTests(async ({ message }) => {
    await pause(600);
    if (message === 'Simulate timeout' && failOnce) {
      failOnce = false;
      throw new AiError(AI_ERROR_CODES.TIMEOUT, { statusCode: 504 });
    }
    return { answer: `Browser verified answer: ${message}`, sources: [], actions: [] };
  });
  setDocumentChatAnswererForTests(async ({ document }) => ({
    answer: `Grounded in ${document.title}: October 1.`,
    sources: [],
  }));
  const profile = await mkdtemp(path.join(tmpdir(), 'lifeadmin-browser-'));
  browser = spawn(
    process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-debugging-port=9225',
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { windowsHide: true, stdio: 'ignore' },
  );
  let page;
  await waitFor(async () => {
    try {
      page = (await fetch('http://127.0.0.1:9225/json').then((r) => r.json())).find(
        (item) => item.type === 'page',
      );
      return page;
    } catch {
      return false;
    }
  }, 'Chrome launch');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
  let serial = 0;
  const pending = new Map(),
    browserErrors = [];
  socket.addEventListener('message', ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.id) {
      const h = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? h?.reject(Error(msg.error.message)) : h?.resolve(msg.result);
    }
    if (msg.method === 'Runtime.exceptionThrown')
      browserErrors.push(msg.params.exceptionDetails.text);
  });
  const cdp = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++serial;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(Error('CDP timeout: ' + method));
      }, 10000);
      pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await cdp('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.text);
    return r.result.value;
  };
  const click = (text) =>
    evaluate(
      `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)})?.click()`,
    );
  const count = () => evaluate("document.querySelectorAll('.message').length");
  const ready = () =>
    waitFor(
      () =>
        evaluate(
          "!!document.querySelector('textarea') && !document.querySelector('textarea').disabled",
        ),
      'chat ready',
    );
  console.log('Chrome connected');
  await cdp('Runtime.enable');
  await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await Document.updateOne({_id:document._id},{$set:{title:'Cryptography assignment',category:'university_notice'}});
  const second=await Document.create({userId,title:'Electricity bill',sourceType:'manual',category:'bill',extractedText:'Electricity bill for September. Review the meter reading before payment.'});
  await cdp('Page.navigate',{url:'http://127.0.0.1:5199/login'});
  await waitFor(()=>evaluate("location.origin === 'http://127.0.0.1:5199'"),'origin');
  await evaluate(`localStorage.setItem('la_token',${JSON.stringify(account.token)})`);
  const library=async()=>{await cdp('Page.navigate',{url:'http://127.0.0.1:5199/app/documents'});await waitFor(()=>evaluate("!!document.querySelector('.document-card')"),'Library ready');};
  await library();
  const input=async(selector,value)=>{await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});const proto=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);await pause(90);};
  const shot=async(name)=>{const r=await cdp('Page.captureScreenshot',{format:'png'});await writeFile(path.join(profile,name+'.png'),Buffer.from(r.data,'base64'));};

  const choose=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  for(const width of [1600,1024,390]){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await pause(200);
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'),'No overflow '+width);await shot('documents-'+width);
    await choose('[aria-label="List view"]');await pause(80);assert.equal(await evaluate("document.querySelectorAll('.document-card.list').length"),2);assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth'));await shot('documents-list-'+width);await choose('[aria-label="Grid view"]');
  }
  await cdp('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
  await input('.library-command-bar input','Cryptography');assert.equal(await evaluate("document.querySelectorAll('.document-card').length"),1);
  await input('.library-command-bar input','no matching document');assert.equal(await evaluate("document.querySelectorAll('.document-card').length"),0);await click('Clear search and filters');await pause(100);
  await input('.library-command-bar select','manual');assert.equal(await evaluate("document.querySelectorAll('.document-card').length"),1);await input('.library-command-bar select','all');
  await click('Bill');await pause(80);assert.equal(await evaluate("document.querySelectorAll('.document-card').length"),1);await click('All');await pause(80);
  await input('.library-command-bar label:nth-child(2) select','az');assert.ok(await evaluate("document.querySelector('.document-open-action').textContent.includes('Cryptography')"));
  await input('.library-command-bar label:nth-child(2) select','za');assert.ok(await evaluate("document.querySelector('.document-open-action').textContent.includes('Electricity')"));
  await choose('.document-select-toggle button');await pause(80);assert.ok(await evaluate("[...document.querySelectorAll('button')].find(e=>e.textContent==='Analyze Together').disabled"));await click('Select all');await pause(80);assert.equal(await evaluate("document.querySelectorAll('.document-select-toggle button[aria-pressed=true]').length"),2);await click('Clear');await pause(80);assert.equal(await evaluate("document.querySelectorAll('.selected-for-analysis').length"),0);
  await evaluate("document.querySelector('.document-actions summary').focus()");await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',windowsVirtualKeyCode:13});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await pause(100);assert.ok(await evaluate("!!document.querySelector('.document-actions[open]')"));await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});assert.ok(await evaluate("!document.querySelector('.document-actions[open]')"));
  await choose('.document-actions summary');await evaluate("document.querySelector('.document-actions[open] button').click()");await waitFor(()=>evaluate("location.pathname.includes('/app/documents/')"),'Open menu route');await library();
  await choose('.document-cover');await waitFor(()=>evaluate("location.pathname.includes('/app/documents/')"),'Cover route');await library();
  await choose('.library-ai-hint');await waitFor(()=>evaluate("location.pathname==='/app/ask'"),'AI hint route');await library();
  await evaluate("document.querySelector('.library-heading button').click()");await waitFor(()=>evaluate("!!document.querySelector('input[type=file]')"),'Add upload page');
  const {createTextPdf}=await import('./pdfTestFixture.js');const pdf=path.join(profile,'ui-library.pdf');await writeFile(pdf,createTextPdf('Document library UI verification. Read this example and summarize the information.'));
  const dom=await cdp('DOM.getDocument');const node=await cdp('DOM.querySelector',{nodeId:dom.root.nodeId,selector:'input[type=file]'});await cdp('DOM.setFileInputFiles',{nodeId:node.nodeId,files:[pdf]});await waitFor(()=>evaluate("!!document.querySelector('.selected-file')"),'PDF selected');await click('Upload PDF');await waitFor(async()=>!!await Document.exists({userId,originalFilename:'ui-library.pdf'}),'Upload persisted');await waitFor(()=>evaluate("location.pathname.includes('/app/documents/')"),'Upload opens detail');await library();
  const uploaded=await Document.findOne({userId,originalFilename:'ui-library.pdf'});
  await evaluate(`[...document.querySelectorAll('.document-card')].find(e=>e.textContent.includes('ui-library')).querySelector('summary').click()`);await evaluate("document.querySelector('.document-actions[open] .danger-text').click()");await waitFor(()=>evaluate("!!document.querySelector('.modal-actions')"),'Delete confirmation');await click('Cancel');await pause(100);assert.ok(await Document.exists({_id:uploaded._id}));
  await evaluate("[...document.querySelectorAll('.document-card')].find(e=>e.textContent.includes('ui-library')).querySelector('summary').click()");await evaluate("document.querySelector('.document-actions[open] .danger-text').click()");await pause(100);await evaluate("[...document.querySelectorAll('.modal-actions button')].find(e=>e.textContent.trim()==='Delete document').click()");await waitFor(async()=>!await Document.exists({_id:uploaded._id}),'Delete persisted');
  console.log('PASS search, source/category, sorting, grid/list, selection, keyboard menu, document/AI navigation, real PDF upload and deletion');
  await Document.deleteMany({userId});await cdp('Page.reload');await waitFor(()=>evaluate("document.body.textContent.includes('No documents yet')"),'Empty state');await shot('documents-empty');
  assert.deepEqual(browserErrors,[]);console.log('PASS empty state and desktop/tablet/mobile layouts; no JavaScript errors');console.log('Screenshots: '+profile);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  socket?.close();
  browser?.kill();
  await vite?.close();
  if (apiServer) await new Promise((resolve) => apiServer.close(resolve));
  if (userId)
    for (const Model of [
      Reminder, Notification,
      DocumentChunk,
      CalendarEvent,
      AvailabilityProfile,
      Task,
      WorkspaceChatMessage,
      DocumentChatMessage,
      Conversation,
      Document,
      User,
    ])
      await Model.deleteMany(Model === User ? { _id: userId } : { userId });
  await mongoose.disconnect();
}
