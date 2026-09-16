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
  await cdp('Page.navigate', { url: 'http://127.0.0.1:5199/login' });
  await waitFor(() => evaluate("location.origin === 'http://127.0.0.1:5199'"), 'origin');
  await evaluate(`localStorage.setItem('la_token', ${JSON.stringify(account.token)})`);
  await cdp('Page.navigate', { url: 'http://127.0.0.1:5199/app/ask' });
  await ready();
  await click('New Chat');
  await ready();
  const chatUrl = await evaluate('location.href');
  const send = async (text) => {
    await evaluate(
      `(() => { const el = document.querySelector('textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, ${JSON.stringify(text)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`,
    );
    await pause(30);
    await evaluate(
      "(() => { const form = document.querySelector('textarea').closest('form'); for(let i=0;i<3;i++) form.dispatchEvent(new Event('submit', { bubbles:true, cancelable:true })); })()",
    );
  };
  await send('Where can I buy a cricket bat?');
  await waitFor(
    () =>
      evaluate(
        "document.body.textContent.includes('LifeAdmin is thinking') && document.querySelector('textarea').disabled",
      ),
    'immediate loading',
  );
  await ready();
  assert.equal(await count(), 2);
  await send('Explain blockchain.');
  await ready();
  await send('Recommend a laptop for programming.');
  await ready();
  assert.equal(await count(), 6);
  console.log('PASS Browser sends three turns with visible loading and disabled input');
  await cdp('Page.reload');
  await pause(200);
  await ready();
  assert.equal(await count(), 6);
  console.log('PASS Refresh restores all six messages');
  await click('New Chat');
  await ready();
  assert.equal(await count(), 0);
  await click('What should I focus on today?');
  await ready();
  assert.equal(await count(), 2);
  console.log('PASS New Chat and clickable suggestion');
  await cdp('Page.navigate', { url: chatUrl });
  await pause(200);
  await ready();
  assert.equal(await count(), 6);
  await send('Simulate timeout');
  await ready();
  assert.ok(await evaluate("document.body.textContent.includes('AI service took too long')"));
  await click('Retry');
  await ready();
  assert.equal(await count(), 8);
  console.log('PASS Timeout and retry without duplicate user message');
  const screenshot = await cdp('Page.captureScreenshot', { format: 'png' });
  const screenshotPath = path.join(profile, 'chat-verification.png');
  await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));
  console.log(`Screenshot: ${screenshotPath}`);
  await evaluate('document.querySelector(\'[aria-label="Open profile menu"]\')?.click()');
  await pause(50);
  const logout = await evaluate(
    "(() => { const b = [...document.querySelectorAll('button')].find(b => /log\\s*out|sign\\s*out/i.test(b.textContent)); if (!b) return false; b.click(); return true; })()",
  );
  assert.ok(logout, 'Logout control exists');
  await waitFor(() => evaluate("location.pathname === '/login'"), 'logout');
  assert.equal(
    await WorkspaceChatMessage.countDocuments({
      userId,
      conversationId: new URL(chatUrl).searchParams.get('conversation'),
    }),
    8,
  );
  await evaluate(`localStorage.setItem('la_token', ${JSON.stringify(account.token)})`);
  await cdp('Page.navigate', { url: chatUrl });
  await pause(200);
  await ready();
  assert.equal(await count(), 8);
  console.log('PASS Logout preserves history and restored session reopens it');
  await cdp('Page.navigate', { url: `http://127.0.0.1:5199/app/documents/${document._id}/chat` });
  await pause(200);
  await ready();
  await click('What is this document about?');
  await ready();
  assert.equal(await count(), 2);
  await cdp('Page.reload');
  await pause(200);
  await ready();
  assert.equal(await count(), 2);
  console.log('PASS Persistent document chat and suggestion');
  const navigateApp = async (route) => {
    await evaluate(`document.querySelector('a[href="${route}"]')?.click()`);
    await waitFor(() => evaluate(`location.pathname === '${route}'`), route);
  };
  await navigateApp('/app/calendar');
  await waitFor(
    () =>
      evaluate(
        "[...document.querySelectorAll('.schedule-agenda article')].some(a => a.textContent.includes('Calendar completion fixture'))",
      ),
    'Calendar fixture',
  );
  await evaluate(
    "[...document.querySelectorAll('.schedule-agenda article')].find(a => a.textContent.includes('Calendar completion fixture')).querySelector('button').click()",
  );
  await waitFor(
    async () => (await Task.findOne({ _id: syncTasks[0]._id, userId })).status === 'completed',
    'Calendar updates task',
  );
  await waitFor(
    () =>
      evaluate(
        "[...document.querySelectorAll('.schedule-agenda article')].find(a => a.textContent.includes('Calendar completion fixture'))?.textContent.includes('completed')",
      ),
    'Calendar completion visible',
  );
  await navigateApp('/app/tasks');
  await waitFor(
    () =>
      evaluate('!!document.querySelector(\'[aria-label="Reopen Calendar completion fixture"]\')'),
    'Shared Tasks state after Calendar completion',
  );
  await evaluate(
    'document.querySelector(\'[aria-label="Complete Tasks completion fixture"]\').click()',
  );
  await waitFor(
    () => evaluate('!!document.querySelector(\'[aria-label="Reopen Tasks completion fixture"]\')'),
    'Tasks completion visible',
  );
  await navigateApp('/app/calendar');
  await waitFor(
    () =>
      evaluate(
        "[...document.querySelectorAll('.schedule-agenda article')].filter(a => a.textContent.includes('completed')).length === 2",
      ),
    'Tasks completion visible in Calendar',
  );
  await navigateApp('/app/dashboard');
  await waitFor(
    () =>
      evaluate(
        "[...document.querySelectorAll('.dashboard-progress-stats p')].some(p => p.textContent.includes('Completed') && p.querySelector('strong').textContent === '2')",
      ),
    'Dashboard completed count',
  );
  assert.ok(
    await evaluate(
      "![...document.querySelectorAll('.focus-task')].some(t => t.textContent.includes('completion fixture'))",
    ),
  );
  setWorkspaceAnswererForTests(answerWorkspaceQuestion);
  await navigateApp('/app/ask');
  await ready();
  await click('New Chat');
  await ready();
  await send('What should I focus on today?');
  await ready();
  assert.ok(
    await evaluate("document.querySelector('.messages').textContent.includes('no pending tasks')"),
  );
  await navigateApp('/app/tasks');
  await waitFor(
    () => evaluate('!!document.querySelector(\'[aria-label="Reopen Tasks completion fixture"]\')'),
    'Reopen ready',
  );
  await evaluate(
    'document.querySelector(\'[aria-label="Reopen Tasks completion fixture"]\').click()',
  );
  await waitFor(
    () =>
      evaluate('!!document.querySelector(\'[aria-label="Complete Tasks completion fixture"]\')'),
    'Reopened task',
  );
  await navigateApp('/app/calendar');
  await waitFor(
    () =>
      evaluate(
        "[...document.querySelectorAll('.schedule-agenda article')].find(a => a.textContent.includes('Tasks completion fixture'))?.textContent.includes('planned')",
      ),
    'Reopened Calendar block',
  );
  await cdp('Page.reload');
  await pause(200);
  await waitFor(
    () =>
      evaluate(
        "[...document.querySelectorAll('.schedule-agenda article')].find(a => a.textContent.includes('Calendar completion fixture'))?.textContent.includes('completed')",
      ),
    'Completion persists on refresh',
  );
  console.log(
    'PASS Browser Calendar/Tasks completion, shared Dashboard and Ask focus, reopening and refresh',
  );
  await navigateApp('/app/ask');
  await ready();
  setWorkspaceAnswererForTests(async () => ({
    answer:
      '## CBC mode\n\nCipher Block Chaining encrypts each block after XOR with the previous ciphertext.\n\n### Properties\n\n- Unpredictable IV\n- Confidentiality, not authentication\n\n| Mode | Padding |\n| --- | --- |\n| CBC | Required for partial blocks |\n| CTR | Not required |\n\n```text\nC_i = E_K(P_i XOR C_(i-1))\n```',
    sources: [],
    actions: [],
  }));
  await pause(250);
  await ready();
  await send('What is CBC mode?');
  await waitFor(
    () =>
      evaluate(
        "!!document.querySelector('.messages h2') && document.querySelector('.messages').textContent.includes('CBC mode')",
      ),
    'Structured CBC answer rendered',
  );
  await ready();
  for (const width of [1440, 390]) {
    await cdp('Emulation.setDeviceMetricsOverride', {
      width,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: width < 600,
    });
    await pause(100);
    assert.ok(
      await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'),
      'No page overflow',
    );
    assert.ok(
      await evaluate(
        "document.querySelector('.global-assistant-messages').getBoundingClientRect().bottom <= document.querySelector('.global-assistant-composer').getBoundingClientRect().top + 1",
      ),
      'Messages do not overlap composer',
    );
    const shot = await cdp('Page.captureScreenshot', { format: 'png' });
    await writeFile(path.join(profile, `hardening-${width}.png`), Buffer.from(shot.data, 'base64'));
  }
  console.log(`PASS Desktop/mobile chat layout; screenshots in ${profile}`);
  await cdp('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: false,
  });
  setWorkspaceAnswererForTests((args) =>
    answerWorkspaceQuestion({
      ...args,
      generate: async (prompt) => {
        if (args.selectedDocumentId && /CBC/.test(args.message))
          assert.match(prompt.userPrompt, /Cryptography assignment/);
        return {
          text: args.selectedDocumentId
            ? '## Assignment explanation\nCBC encrypts chained blocks. Your assignment asks you to compare CBC and CTR.'
            : `## AI knowledge\nUseful explanation for: ${args.message}`,
        };
      },
    }),
  );
  await click('New Chat');
  await pause(200);
  await ready();
  await click('Discuss a document');
  await waitFor(
    () => evaluate(`!!document.querySelector('[data-document-id="${document._id}"]')`),
    'Document picker opened',
  );
  await evaluate(`document.querySelector('[data-document-id="${document._id}"]').click()`);
  await waitFor(
    () =>
      evaluate(
        "document.querySelector('.chat-context-bar').textContent.includes('Browser Document')",
      ),
    'Document selection displayed',
  );
  await send('Explain CBC mode.');
  await waitFor(
    () =>
      evaluate(
        "document.querySelector('.messages').textContent.includes('Assignment explanation')",
      ),
    'Selected document answer',
  );
  await ready();
  assert.ok(
    await evaluate(
      "document.querySelector('.assistant-action-group.open_document').textContent.includes('Browser Document')",
    ),
  );
  await cdp('Page.reload');
  await pause(200);
  await ready();
  assert.ok(
    await evaluate(
      "document.querySelector('.chat-context-bar').textContent.includes('Browser Document')",
    ),
  );
  await click('Remove');
  await waitFor(
    () =>
      evaluate(
        "document.querySelector('.chat-context-bar').textContent.includes('General conversation')",
      ),
    'Remove selected context',
  );
  for (const question of ['What is CBC mode?', 'Where can I buy a cricket bat?']) {
    await send(question);
    await waitFor(
      () =>
        evaluate(
          `document.querySelector('.messages').textContent.includes(${JSON.stringify('Useful explanation for: ' + question)})`,
        ),
      'General answer after document context',
    );
    await ready();
  }
  console.log('PASS Browser selected document, RAG sources, refresh, removal and general routing');
  await Notification.create(
    [0, 1, 2].map((i) => ({
      userId,
      type: 'document_action',
      title: `Browser alert ${i}`,
      message: 'Review the cryptography assignment.',
      priority: 'high',
      fingerprint: randomUUID(),
      relatedDocumentId: document._id,
    })),
  );
  await evaluate("window.dispatchEvent(new Event('lifeadmin-notifications-changed'))");
  await waitFor(
    () => evaluate('document.querySelector(\'[aria-label="Notifications, 3 unread"]\') !== null'),
    'Notification badge 3',
  );
  const bell = () => evaluate('document.querySelector(\'[aria-label^="Notifications,"]\').click()');
  await bell();
  await waitFor(() => evaluate("!!document.querySelector('.notification-center')"), 'Bell opens');
  for (const width of [1440, 390]) {
    await cdp('Emulation.setDeviceMetricsOverride', {
      width,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: width < 600,
    });
    await pause(150);
    assert.ok(
      await evaluate(
        "(() => { const p=document.querySelector('.notification-center'),r=p.getBoundingClientRect(); return r.left>=0 && r.right<=innerWidth && r.bottom<=innerHeight && p.contains(document.elementFromPoint(r.left+30,r.top+30)); })()",
      ),
      'Notification stays in viewport above content',
    );
    const shot = await cdp('Page.captureScreenshot', { format: 'png' });
    await writeFile(
      path.join(profile, `notifications-${width}.png`),
      Buffer.from(shot.data, 'base64'),
    );
  }
  await click('Mark read');
  await waitFor(
    () => evaluate('!!document.querySelector(\'[aria-label="Notifications, 2 unread"]\')'),
    'Read immediately updates badge',
  );
  await waitFor(
    async () => (await Notification.countDocuments({ userId, read: true })) === 1,
    'Read persisted',
  );
  await evaluate(
    "document.querySelector('.notification-center .notification-card.unread .notification-controls button:last-child').click()",
  );
  await waitFor(
    () => evaluate('!!document.querySelector(\'[aria-label="Notifications, 1 unread"]\')'),
    'Delete updates badge',
  );
  await click('Mark all read');
  await waitFor(
    () => evaluate('!!document.querySelector(\'[aria-label="Notifications, 0 unread"]\')'),
    'Mark all read updates badge',
  );
  await evaluate("document.querySelector('[aria-label=\"Close notifications\"]').click()");
  await waitFor(
    () => evaluate("!document.querySelector('.notification-center')"),
    'Close notification popup',
  );
  await bell();
  await waitFor(() => evaluate("!!document.querySelector('.notification-center')"), 'Toggle open');
  await bell();
  await waitFor(() => evaluate("!document.querySelector('.notification-center')"), 'Toggle closed');
  await bell();
  await evaluate("document.body.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))");
  await waitFor(
    () => evaluate("!document.querySelector('.notification-center')"),
    'Outside closes notifications',
  );
  await bell();
  await evaluate("document.querySelector('.notification-view-all').click()");
  await waitFor(
    () => evaluate("location.pathname === '/app/notifications'"),
    'View all notifications',
  );
  await cdp('Page.reload');
  await pause(200);
  await waitFor(
    () =>
      evaluate("document.querySelectorAll('.notifications-page .notification-card').length === 2"),
    'Notification deletion persists on refresh',
  );
  assert.ok(await evaluate('!!document.querySelector(\'[aria-label="Notifications, 0 unread"]\')'));
  console.log(
    'PASS Browser notification layering, viewport, toggle/outside/close, read/delete counts, page and persisted state',
  );
  // A fresh authenticated session must read the same persisted server state.
  await evaluate('document.querySelector(\'[aria-label="Open profile menu"]\')?.click()');
  await pause(100);
  await evaluate("[...document.querySelectorAll('button')].find(b => /log\\s*out|sign\\s*out/i.test(b.textContent))?.click()");
  await waitFor(() => evaluate("location.pathname === '/login'"), 'Final logout');
  const freshLogin = await fetch('http://127.0.0.1:5011/api/auth/login', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({email:account.user.email,password:'BrowserTest123'}) }).then(response=>response.json());
  assert.ok(freshLogin.token);
  await evaluate(`localStorage.setItem('la_token', ${JSON.stringify(freshLogin.token)})`);
  await cdp('Page.navigate',{url:'http://127.0.0.1:5199/app/notifications'});
  await waitFor(() => evaluate("document.querySelectorAll('.notifications-page .notification-card').length === 2 && !!document.querySelector('[aria-label=\"Notifications, 0 unread\"]')"),'Fresh login preserves notification state');
  assert.equal((await Task.findById(syncTasks[0]._id)).status,'completed');
  console.log('PASS Fresh login preserves notifications and task completion');
  assert.deepEqual(browserErrors, []);
  console.log('PASS No browser JavaScript exceptions');
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
      Notification,
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
