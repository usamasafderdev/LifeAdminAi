Advanced Document Understanding ? manual test guide

Run the backend and frontend using the existing project setup. Sign in with two separate test accounts (A and B) in different browser profiles. Use a configured AI provider for the answer-quality checks. Nothing in this guide requires an embedding service.

The exact upload files are already generated in `docs/fixtures/document-knowledge/`. To regenerate them, run this from `server/`:

```powershell
node src/scripts/createKnowledgeFixtures.js
```

| Upload as account A     | Exact question                                       | Expected result                                                                                               |
| ----------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Assignment.pdf`        | When is the assignment due and where do I upload it? | September 18, 2026; CampusBox; PDF format. Sources used shows Assignment.pdf and a chunk reference.           |
| `Assignment.pdf`        | Who is the instructor?                               | ?I could not find this information in the document.? No fabricated instructor.                                |
| `Archive-130-pages.pdf` | What is the submarine access code?                   | COBALT-731, with a page 113 source. The answer must not include an invented code.                             |
| `Archive-130-pages.pdf` | What is the zebra birthday?                          | Exact not-found response; no sources for an unrelated query.                                                  |
| `Empty.pdf`             | Attempt any question                                 | Upload succeeds with no readable text; document chat is disabled or returns a controlled readable-text error. |
| `Broken.pdf`            | Upload only                                          | Controlled PDF extraction error; no document or orphan uploaded file remains.                                 |

Open **View source** below an answer. Verify that the panel contains the fact, the document title, and the displayed page/chunk number. Close it using **Close source**. Reload chat and verify that the source metadata persists. For single-page PDFs, a chunk reference is expected when exact page tracking is absent.

In Ask LifeAdmin, ask **Which documents discuss submarine access code?** Expected: Archive-130-pages.pdf is identified, the answer is grounded in the excerpt, and its source card includes the chunk/page detail. Repeat the question to exercise the indexed path after initial backfill. Account B must never see this fact or document unless it separately owns an uploaded copy.

Open A's document-chat URL while signed in as B. Expect a controlled not-found result. For an API-level source test, copy the authenticated source request in browser developer tools and replay it with B's token; expect 404. Without a token, expect 401. Do not place authentication tokens into shared screenshots or reports.

Edit the archive's extracted text using the existing authenticated PATCH document API to `The submarine access code is AMBER-992.` Ask the code question again: expect AMBER-992. Opening the earlier COBALT source must report that the document changed. Delete the archive: its chunks and chat history must disappear; other documents and unrelated tasks remain intact. A stale source request must return 404. The automated knowledge suite exercises both these operations without requiring manual database edits.

For AI outage testing, use a disposable test-server session with an unavailable/disabled provider and ask a relevant question. Expect a safe availability error, no secrets, and a retryable UI. An unrelated question still returns not-found without an AI call. Restore normal provider configuration afterward. Embedding generation and vector-search failures are reproducibly injected by the automated suite; both must preserve lexical retrieval. If indexing is interrupted, uploads remain saved and report pending search indexing; the next document query retries. Invalid/empty documents must not crash the server.

Performance checks:

- Record upload/extraction/indexing time for Assignment.pdf and Archive-130-pages.pdf using the browser Network tab. Distinguish these timings from the existing automatic analysis/provider latency.
- Compare first and repeated code questions. The repeated question must reuse the same chunk revision, without duplicate chunks. The large fixture has 130 page-aligned chunks with the default configuration.
- Default document context is at most 18,000 characters and four whole chunks. Increasing document length must not increase the prompt beyond this budget. The automated test captures the mock-provider prompt to verify this without logging private documents.
- Monitor backend memory while uploading multiple large documents; record peak memory and response latency on the intended deployment hardware. No production SLA has been established by the local test run.
- Automatic analysis may report its existing size limit for the large fixture; document chat must still retrieve the page 113 fact.

From `server/`, run the reproducible end-to-end suite:

```powershell
npm.cmd run test:document-knowledge
```

The suite creates UUID-named test users, mocks AI, exercises a real 130-page PDF upload, and removes its own fixtures. It requires the existing local MongoDB configuration; it does not require a paid AI call.

For existing documents, indexing is lazy. To prepare one user's complete knowledge collection and explicitly create indexes before deployment, use:

```powershell
node src/scripts/backfillDocumentKnowledge.js --user <user-id>
```

An administrator can deliberately select `--all` instead. This command reads existing documents and upserts their chunks; it does not run analysis or generate tasks. Run it after changing chunk-size/overlap configuration. Do not drop existing indexes or collections. Failed records are counted without printing document text, credentials, or internal errors; rerun to retry.

Configuration uses the existing `AI_CHAT_CHUNK_SIZE`, `AI_CHAT_CHUNK_OVERLAP`, `AI_CHAT_MAX_CHUNKS`, and `AI_CHAT_MAX_CONTEXT_CHARS`. Defaults are 4,200, 250, four, and 18,000 respectively. Chunk size is constrained to fit the context budget. Context is capped at 64,000 characters and selection at 20 chunks. No embedding provider is enabled by default.

Manual browser and live-provider results: **not yet executed**. Automated backend results and the measured local splitter timing are recorded in `document-knowledge-report.md`.
