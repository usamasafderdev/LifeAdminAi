# Final UX and AI routing verification

Verified September 16, 2026.

## Changes in this pass

- General questions no longer inherit document intent from the ordinary word "the". Genuine contextual references remain supported.
- Ask LifeAdmin saves an optional owned document reference on its existing conversation. Selecting, changing, removing and reloading this context use the existing conversation and document retrieval services. General shopping questions and explicit workspace questions retain their own routes.
- Assignment, section and yesterday-upload references use document retrieval. Document-only retrieval skips task/reminder collection reads; empty historical source sets skip their queries.
- Assistant resource cards use responsive grids and full-width content; user messages align separately. Existing collapsible sources, loading, errors and retry behavior remain.
- Notification dropdown renders above page stacking contexts, anchored to the bell and clamped to the viewport. Refreshes are deduplicated and cannot overwrite a pending read/delete update. Header and notification page share the existing data hook.
- Document deletion detaches global conversation context while preserving its messages. Fixed document conversations retain their original deletion behavior.

## Files changed in this pass

- `server/src/controllers/assistantController.js`
- `server/src/models/Conversation.js`
- `server/src/routes/conversationRoutes.js`
- `server/src/services/assistantService.js`
- `server/src/services/chatPersistenceService.js`
- `server/src/services/conversationContextService.js`
- `server/src/services/documentDeletionService.js`
- `server/src/services/workspaceRetrievalService.js`
- `server/src/scripts/testChatBrowser.js`
- `server/src/scripts/testConversations.js`
- `server/src/scripts/testProductionHardening.js`
- `src/pages/Chat.jsx`
- `src/services/assistantService.js`
- `src/components/NotificationCenter.jsx`
- `src/hooks/useNotificationData.js`
- `src/styles.css`
- `docs/final-ux-verification.md`

Existing unrelated working-tree changes were preserved.

## Executed checks

Passed: `test:assistant`, `test:assistant-routing`, `test:daily-briefing`, `test:memory`, `test:conversations`, `test:notifications`, `test:document-chat`, `test:document-chat-quality`, and `test:document-knowledge`.

`node src/scripts/testProductionHardening.js` passed with real MongoDB and authenticated HTTP requests. It covers selected document persistence, invalid document selection, general questions after document history, zero retrieval reads for basic general knowledge, Calendar/Task completion in both directions, reopening, Dashboard/Ask consistency, Daily Briefing exclusions, and fresh-login persistence. Conversation tests additionally reject cross-user document selection and context changes.

`node src/scripts/testChatBrowser.js` passed against real React, Express, JWT and MongoDB in headless Chrome. It covers rapid submissions, retry deduplication, refresh/logout/history, selected document answers and source cards, selection removal, general questions after document context, task synchronization, desktop/mobile overflow, notification layering and viewport bounds, bell/outside/close controls, read/delete/all-read counts, notification navigation, and a fresh login. Browser answers use controlled provider responses; the routing and persistence services are real. Desktop and mobile screenshots were visually inspected. No JavaScript exceptions occurred.

Live-provider runs exercised CBC, assignment explanation and CBC/CTR comparison. Routing and source delivery passed; output was inspected rather than treating script success as proof of factual accuracy.

`npm.cmd run build` and `git diff --check` passed. Vite retains its non-blocking JavaScript chunk-size warning.

## Remaining limitations

- The configured provider can still produce overconfident or inaccurate technical statements despite accuracy guidance. This is not claimed to be solved by the routing tests. Live runs also encountered rate limits.
- There is no live local-business search; exact current shop locations and availability cannot be verified by this app.
- The Google sign-in library emits an existing repeated-initialization warning in the browser tests; no JavaScript exceptions were observed.
