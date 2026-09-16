# Feature 12: conversation persistence and AI reliability

Implemented and verified on September 15, 2026.

## Root cause and routing proof

The existing general branch reused the workspace-only system prompt. The classifier also defaulted unrecognized questions to workspace and treated bare words such as ?calendar? as ownership signals. Workspace synthesis could discard retrieved context by replacing it with ?None?. Document retrieval and document chat disagreed on the not-found wording. Login and logout explicitly deleted global history.

`classifyAssistantIntent(message, history)` now combines resource references with ownership or workspace operations, preserves verified contextual follow-ups and existing personal planning/report creation, and defaults ordinary questions to general AI. It does not make a classifier API call. General answers use a separate general-assistant prompt through the existing configured provider abstraction. They skip workspace, scheduling, and memory retrieval. Workspace answers retain verified evidence. Existing deterministic counts, navigation, and scheduling remain deterministic; task-deadline synthesis and upcoming reminders use the AI with evidence. Document chat remains grounded in its selected, owned document.

Before Feature 12 changes, `node src/scripts/testAssistantRouting.js --live` was run against the configured provider and its returned answers were inspected. All seven questions passed:

| Question | Intent | Workspace retrieval | AI called |
| --- | --- | --- | --- |
| Where can I buy a cricket bat? | general | false | true |
| Give me cricket bat shops near me. | general | false | true |
| What is the best laptop under $500? | general | false | true |
| Explain blockchain. | general | false | true |
| Explain calendar scheduling algorithms. | general | false | true |
| What is my task deadline? | workspace | true | true |
| Show my upcoming reminders. | workspace | true | true |

The cricket answer suggested sporting-goods and specialist retailers. The nearby-shops answer requested the city. The task answer returned September 20, 2026, matching the temporary MongoDB task. Read-query instrumentation confirmed zero MongoDB reads inside the general answering service. Conversation ownership/history queries still occur at the HTTP persistence layer, as required for secure persistence; those are not workspace retrieval.

`ASSISTANT_DEBUG=true` enables structured route diagnostics outside production, including question, intent, retrieval/provider flags, and conversation ID. Production does not emit question text through these diagnostics. AI failure logs contain only normalized error code and status.

## Models and persistence

- Added `Conversation`: authenticated user, global/document type, title, nullable document ID, timestamps, a unique default-conversation key, and an expiring processing lease.
- Reused `WorkspaceChatMessage` and `DocumentChatMessage`; no duplicate generic message collection was introduced. Added conversation ID, request ID, and pending/complete/failed status. Existing content, role, timestamps, sources, actions, attachments and model fields remain.
- Legacy messages are adopted into a default conversation in place when their existing chat is opened. IDs and timestamps remain unchanged.
- User messages are saved before AI work. Assistant messages are saved only after nonempty validated answers. Failed user turns remain retryable after refresh.
- Unique indexes and atomic conversation leases prevent concurrent turns and duplicate message rows. Replaying a completed request ID returns its saved answer without another AI call. A request ID cannot be reused with different content.
- Logout and login no longer erase chat history. Explicit clear/delete remains available. Document deletion removes its conversation records alongside existing dependent chat cleanup.

## APIs

New authenticated endpoints:

- `POST /api/conversations`: create an owned global or document conversation.
- `GET /api/conversations`: list recent owned conversations; supports a type filter.
- `GET /api/conversations/:id`: retrieve owned conversation details.
- `DELETE /api/conversations/:id`: delete an idle owned conversation and its messages.
- `GET /api/conversations/:id/messages`: chronological message pages, with `before` cursor and `hasMore`.
- `POST /api/conversations/:id/messages`: delegate to the existing global or document answering controller based on verified conversation type.

Existing `/api/assistant/chat` and `/api/documents/:id/chat` routes remain. They accept an optional `conversationId` and use a default conversation when omitted. Send routes accept `requestId`; updated clients keep the same ID for retries. Frontend-supplied user IDs never determine ownership.

Every conversation/message access is scoped to the authenticated user. Document conversations also recheck document ownership and reject mismatched document routes. Foreign IDs and deleted documents return 404. Active conversations cannot be cleared or deleted while their answer is processing. Existing credential filtering and privacy refusals remain intact.

## Frontend and error handling

Ask LifeAdmin includes New Chat, a recent-conversation selector with dates, URL-preserved conversation selection, and loading of earlier messages. Existing visual components, sources, navigation actions and Markdown rendering are reused. Both chat surfaces have immediate thinking states, submission guards, persisted retry IDs, and retryable errors. Switching document components remounts their state, and late global-chat responses are ignored after conversation selection changes.

Global suggestions cover focus today, upcoming deadlines, overdue tasks, current workload, and recently added documents. Document suggestions cover summary, deadlines, actions, and requirements. They are ordinary questions and do not assert that matching data exists.

Both chat surfaces handle 400, 401, 403, 404, 408, 409, 429, 500, 502, 503, 504 and network/client-timeout failures. Timeout and rate-limit wording matches the requested friendly messages. Raw provider errors and credentials are not sent to the browser. The central AI service bounds each provider attempt; Gemini now receives its configured transport timeout. Both providers reject non-string or empty text. Existing structured-output validators remain in place and their tests pass. Provider fallback behavior remains centralized and bounded.

## Executed verification

All of these backend scripts passed on their final runs:

`test:assistant`, `test:assistant-routing`, `test:conversations`, `test:daily-briefing`, `test:memory`, `test:ai`, `test:ai-fallback`, `test:ai-validation`, `test:documents`, `test:document-chat`, `test:document-chat-quality`, `test:document-knowledge`, `test:document-generation`, `test:document-ai`, `test:scheduling`, `test:notifications`, `test:tasks`, and `test:priority`.

The first regression pass found the report-generation memory regression, the conflicting document not-found expectation, and a Gemini test double using a different SDK shape. These were corrected, and the affected suites were rerun successfully. The document error tests now assert the requested friendly timeout wording and 429 rate-limit status.

`node src/scripts/testChatBrowser.js` passed in headless Chrome against real React, Express, JWT and MongoDB with delayed/mock answerers. It verified three turns, immediate loading/disabled input, refresh, reopening a conversation, New Chat, clickable suggestions, friendly timeout/retry without duplication, actual UI logout preserving history, restored authenticated access, persistent document chat, and absence of browser JavaScript exceptions. The separate HTTP suite also performed a fresh login and cross-user read/write/delete attempts. Browser testing used mocked answers; the earlier live-provider test exercised real AI routing.

Root `npm.cmd run build` passed. Vite reported a non-failing JavaScript chunk-size warning (approximately 762 kB before gzip). `git diff --check` passed. PowerShell blocks the npm.ps1 shim here, so npm.cmd was used.

## Manual acceptance checklist

1. Start MongoDB and the backend with the existing provider configuration. Start Vite. Sign in and open Ask LifeAdmin.
2. Ask ?Where can I buy a cricket bat??, ?Explain blockchain.? and ?Recommend a laptop for programming.? Expect useful general answers, never the document-not-found fallback. With local debug enabled, confirm general/false/true routing flags.
3. Create a task with a known deadline. Ask ?What is my task deadline?? and ?What should I focus on today?? Check against actual tasks/reminders and inspect supplied source links.
4. Open document A. Ask ?What is this document about?? and a fact absent from it. Expect grounded information or the document-specific safe fallback. Open document B and verify that its chat is separate.
5. Send three messages. Refresh, switch to New Chat, reopen the first conversation, and continue it. Sign out and sign back in. Verify all original messages remain ordered.
6. Click a suggested question. Immediately check the visible thinking state and disabled composer; rapidly double-click Send and confirm only one turn is saved.
7. Run `npm.cmd run test:conversations` for reproducible timeout, 429, invalid-output, concurrent-send, and retry cases. Run `npm.cmd run test:chat-browser` for the browser timeout/retry check. For manual network failure, switch browser DevTools to Offline, send, restore network, and retry.
8. Create two users. With B's token, GET/POST A's conversation messages and DELETE A's conversation. Expect 404 and no A message content. Repeat with a foreign document ID.
9. Open Daily Briefing, Tasks, Reminders, Notifications, Calendar, Memory, and document analysis to confirm their usual workflows.

## Limitations and operation

- General AI has no live search, geolocation, price or inventory lookup. Local recommendations may need the user to provide a city; model knowledge can be outdated.
- Intent routing is deterministic and explainable, not a semantic classifier; unusually ambiguous requests may need explicit resource wording.
- Recent-conversation listing is capped at 100. The existing document chat surface displays its latest 200 messages. All stored messages remain persisted; conversation message APIs support cursor paging, and the global chat UI exposes it.
- Clients must reuse `requestId` to obtain retry deduplication. Legacy callers omitting it get a fresh ID for each request. A crashed worker's lease expires before another worker can retry the turn.
- Ensure MongoDB can create the new indexes. No destructive migration is required. Existing histories erased by the old logout behavior cannot be recovered by this change.
- The browser test requires Chrome (or `CHROME_PATH`) and free local ports 5011, 5199 and 9225. Its synthetic fixtures are cleaned up. Browser screenshots/profile artifacts are written to the system temporary directory.
- Scheduling algorithm tests passed; the optional scheduling replica-set integration suite was not run. The entire repository's unrelated upload/OCR test matrix was not rerun.

## Exact changed and added files

- `docs/feature-12-verification.md`
- `server/.env.example`
- `server/package.json`
- `server/src/app.js`
- `server/src/controllers/assistantController.js`
- `server/src/controllers/documentChatController.js`
- `server/src/middleware/errorHandler.js`
- `server/src/models/Conversation.js`
- `server/src/models/DocumentChatMessage.js`
- `server/src/models/WorkspaceChatMessage.js`
- `server/src/routes/conversationRoutes.js`
- `server/src/scripts/testAiFallback.js`
- `server/src/scripts/testAssistantRouting.js`
- `server/src/scripts/testChatBrowser.js`
- `server/src/scripts/testConversations.js`
- `server/src/scripts/testDocumentChat.js`
- `server/src/scripts/testDocumentKnowledge.js`
- `server/src/services/ai/aiError.js`
- `server/src/services/ai/aiService.js`
- `server/src/services/ai/geminiProvider.js`
- `server/src/services/ai/groqProvider.js`
- `server/src/services/assistantService.js`
- `server/src/services/chatPersistenceService.js`
- `server/src/services/documentChatService.js`
- `server/src/services/documentDeletionService.js`
- `src/components/DocumentChat.jsx`
- `src/context/AuthContext.jsx`
- `src/pages/Chat.jsx`
- `src/pages/DocumentDetail.jsx`
- `src/services/assistantService.js`
- `src/services/chatError.js`
- `src/services/documentService.js`
- `src/styles.css`
