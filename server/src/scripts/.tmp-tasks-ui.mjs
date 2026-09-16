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
  await Task.deleteMany({userId});
  await Document.updateOne({_id:document._id},{$set:{title:'Cryptography assignment'}});
  const seeded=await Task.create([
    {userId,documentId:document._id,title:'Complete CTR Mode Decryption Diagram',description:'Draw the complete decryption diagram and verify each step using the supplied counter values.',status:'completed',source:'ai_confirmed',dueDate:new Date('2026-09-24T12:00:00Z')},
    {userId,documentId:document._id,title:'Complete CBC Mode Decryption Diagram',description:'Explain the chaining process and include the initialization vector.',status:'completed',source:'ai_confirmed'},
    {userId,documentId:document._id,title:'Review the assignment references',description:'Check that every reference supports the submitted work.',status:'completed',source:'ai_confirmed'},
    {userId,title:'Buy a cricket bat',description:'Visit a sports shop and compare sizes before choosing.',status:'completed',source:'manual',dueDate:new Date('2026-09-17T12:00:00Z')}
  ]);
  await cdp('Page.navigate',{url:'http://127.0.0.1:5199/login'});
  await waitFor(()=>evaluate("location.origin === 'http://127.0.0.1:5199'"),'origin');
  await evaluate(`localStorage.setItem('la_token',${JSON.stringify(account.token)})`);
  const url='http://127.0.0.1:5199/app/tasks';await cdp('Page.navigate',{url});
  await waitFor(()=>evaluate("document.querySelectorAll('.task-lane').length === 4 && !!document.querySelector('.task-group-card')"),'Tasks ready');
  const input=async(selector,value)=>{await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});const proto=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);await pause(90);};
  const shot=async(name)=>{const r=await cdp('Page.captureScreenshot',{format:'png'});await writeFile(path.join(profile,name+'.png'),Buffer.from(r.data,'base64'));};
  const action=async(title,label)=>{await evaluate(`document.querySelector('summary[aria-label='+CSS.escape(${JSON.stringify('Actions for '+title)})+']').click()`);await pause(70);await evaluate(`document.querySelector('button[aria-label='+CSS.escape(${JSON.stringify(label+' '+title)})+']').click()`);};
  for(const width of [1600,1024,390]){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height:1100,deviceScaleFactor:1,mobile:width<600});await pause(150);await evaluate('scrollTo(0,0)');
    assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'),'Page fits '+width);
    assert.ok(await evaluate("[...document.querySelectorAll('.task-lane')].every(e=>e.getBoundingClientRect().width>=275)"),'Readable lanes '+width);
    await shot('tasks-'+width);
    if(width===390){await evaluate("document.querySelector('.lane-green').scrollIntoView({block:'start'})");await shot('tasks-completed-mobile');}
  }
  await cdp('Emulation.setDeviceMetricsOverride',{width:1600,height:1100,deviceScaleFactor:1,mobile:false});
  assert.equal(await evaluate("document.querySelectorAll('.task-lane-empty').length"),3);
  await evaluate("document.querySelector('.task-actions-disclosure summary').focus()");
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',windowsVirtualKeyCode:13});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await pause(80);
  assert.ok(await evaluate("!!document.querySelector('.task-actions-disclosure[open]')"),'Keyboard opens task actions');
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await pause(80);
  assert.ok(await evaluate("!document.querySelector('.task-actions-disclosure[open]') && document.activeElement.tagName === 'SUMMARY'"),'Escape closes actions and retains focus');

  await click('View all tasks');await pause(80);assert.equal(await evaluate("document.querySelectorAll('.task-group-item').length"),3);
  await click('Collapse');await pause(80);assert.equal(await evaluate("document.querySelectorAll('.task-group-item').length"),2);
  await click('View all tasks');await pause(80);
  await evaluate("document.querySelector('[aria-label=\"Reopen Complete CTR Mode Decryption Diagram\"]').click()");
  await waitFor(async()=> (await Task.findById(seeded[0]._id)).status==='pending','Reopen persisted');
  await pause(300);await click('View all tasks');
  await waitFor(()=>evaluate("!!document.querySelector('[aria-label=\"Complete Complete CTR Mode Decryption Diagram\"]')"),'Reopen visible');
  await evaluate("document.querySelector('[aria-label=\"Complete Complete CTR Mode Decryption Diagram\"]').click()");
  await waitFor(async()=> (await Task.findById(seeded[0]._id)).status==='completed','Complete persisted');
  await input('.task-toolbar input','Cryptography');assert.ok(await evaluate("!document.querySelector('.kanban-task') && !!document.querySelector('.task-group-card')"));
  await input('.task-toolbar input','no matching title');assert.ok(await evaluate("!document.querySelector('.task-group-card')"));await input('.task-toolbar input','');
  await input('select[aria-label="Source"]','Personal');assert.equal(await evaluate("document.querySelectorAll('.kanban-task').length"),1);await input('select[aria-label="Source"]','All');
  await input('select[aria-label="Sort tasks"]','Due date'); assert.ok(await evaluate("document.querySelector('.task-group-item-copy strong').textContent.includes('CTR')"),'Due-date order');await input('select[aria-label="Sort tasks"]','Priority');await input('select[aria-label="Sort tasks"]','Newest');
  await click('New Task');await waitFor(()=>evaluate("!!document.querySelector('input[name=title]')"),'New task form');
  await input('input[name=title]','UX verification task');await input('textarea[name=description]','Confirm the task workflow still works.');await input('select[name=priorityOverride]','HIGH');await click('Save task');
  await waitFor(async()=>!!await Task.findOne({userId,title:'UX verification task'}),'Create persisted');
  await waitFor(()=>evaluate("[...document.querySelectorAll('.kanban-task-title')].some(e=>e.textContent.includes('UX verification task'))"),'Create visible');
  await input('select[aria-label="Priority"]','HIGH');assert.equal(await evaluate("document.querySelectorAll('.kanban-task').length"),1);await input('select[aria-label="Priority"]','All');
  await action('UX verification task','Edit');await waitFor(()=>evaluate("!!document.querySelector('select[name=status]')"),'Edit opens');await input('select[name=status]','In Progress');await click('Save task');
  await waitFor(()=>evaluate("document.querySelector('.lane-amber').textContent.includes('UX verification task')"),'Edited status moves lane');
  await click('In Progress');await pause(80);assert.equal(await evaluate("document.querySelectorAll('.kanban-task').length"),1);await click('All');await pause(80);
  await action('UX verification task','Set reminder for');await waitFor(()=>evaluate("!!document.querySelector('input[name=time]')"),'Reminder form');await click('Create reminder');await waitFor(async()=>!!await Reminder.findOne({userId,title:'UX verification task'}),'Reminder persisted');
  await action('UX verification task','Delete');await click('Delete task');await waitFor(async()=>!await Task.exists({userId,title:'UX verification task'}),'Delete persisted');
  await cdp('Page.reload');await waitFor(()=>evaluate("document.querySelectorAll('.task-lane-empty').length===3"),'Refresh preserves tasks');
  console.log('PASS task create/edit/delete/reminder, complete/reopen, search/source/priority/sort/status, group expand/collapse and refresh');
  const realRows=await Task.find({userId:{$ne:userId}}).sort({updatedAt:-1}).limit(16).lean();
  if(realRows.length){
    await Task.deleteMany({userId}); const docMap=new Map();
    for(const row of realRows){let linked=null;if(row.documentId){const key=String(row.documentId);if(!docMap.has(key)){const original=await Document.findById(row.documentId).select('title category').lean();const copy=await Document.create({userId,title:original?.title||'Document assignment',category:original?.category||'other',sourceType:'text'});docMap.set(key,copy._id);}linked=docMap.get(key);}
      await Task.create({userId,documentId:linked,title:row.title,description:row.description,status:row.status,source:row.source,dueDate:row.dueDate,priorityOverride:row.priorityOverride});}
    await cdp('Page.reload');await waitFor(()=>evaluate("!!document.querySelector('.task-kanban')"),'Existing data copies');await pause(200);await shot('tasks-existing-records');console.log('PASS rendered '+realRows.length+' isolated copies of existing task records');
  }
  await Task.deleteMany({userId}); await cdp('Page.reload'); await waitFor(()=>evaluate("document.querySelectorAll('.task-lane-empty').length===4"),'Entirely empty board'); await shot('tasks-all-empty');
  console.log('PASS keyboard action disclosure, due-date order, and all-empty board');
  assert.deepEqual(browserErrors,[]);console.log('PASS desktop/tablet/mobile overflow and browser runtime checks');console.log('Screenshots: '+profile);
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
