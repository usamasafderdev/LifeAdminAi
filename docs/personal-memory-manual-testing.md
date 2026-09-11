Smart Personal Memory ? manual testing guide

Use two disposable accounts in separate browser profiles. Start the existing backend and frontend. Use a configured AI provider for live answer-quality checks. Open Ask LifeAdmin as account A, then Settings ? Memory. By default memory is enabled and automatic saving is off.

| Exact message / action                                                                      | Expected UI or AI behavior                                                                                                                     | Expected memory database change                                                                    |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `I prefer PDF reports.`                                                                     | A card asks whether to save it, with Save memory and Ignore. The answer must not claim it is already saved.                                    | No Memory row until Save. The existing chat transcript may contain the statement.                  |
| Click **Ignore**                                                                            | Card disappears.                                                                                                                               | No Memory row or ignored-content record.                                                           |
| Repeat `I prefer PDF reports.` and click **Save memory**                                    | Memory saved feedback and Forget this appear; count increases.                                                                                 | One preference with source conversation_confirmed, high importance, null lastUsedAt initially.     |
| Clear Ask LifeAdmin chat, then send `Create a report.`                                      | The AI receives the saved PDF preference in a fresh conversation. It can ask for the topic or help draft; it must not claim a PDF file exists. | Same memory remains; successful AI usage updates lastUsedAt/useCount.                              |
| `My final year project is called LifeAdmin AI.`                                             | Working-context suggestion requires Save.                                                                                                      | No row until accepted; then working_context, medium importance.                                    |
| `I always use React and Node.`                                                              | Suggest frequently used tools, with Save/Ignore.                                                                                               | working_context only after approval.                                                               |
| `I decided to use MongoDB instead of PostgreSQL.`                                           | Decision suggestion requires Save.                                                                                                             | decision only after approval.                                                                      |
| `I am a Software Engineering student.`                                                      | Personal-information suggestion requires Save.                                                                                                 | personal only after approval.                                                                      |
| After saving the student fact, clear chat and send `Explain this algorithm: binary search.` | The saved education context is available for appropriate examples. Exact response quality requires a live provider.                            | The used memory's lastUsedAt/useCount updates on successful generation.                            |
| `What is the weather?`                                                                      | No memory suggestion or automatic save.                                                                                                        | No memory change.                                                                                  |
| `I prefer PDF reports just today.`                                                          | No long-term suggestion.                                                                                                                       | No memory change.                                                                                  |
| `I prefer short answers, but do not save this.`                                             | No suggestion and no automatic save.                                                                                                           | No memory change.                                                                                  |
| `My password is xyz`                                                                        | Controlled error requesting removal of credentials.                                                                                            | No memory or new chat message for this disclosure; no provider request. Use this dummy value only. |

Settings checks:

- Open **Settings ? Memory**, or `/app/settings/memory`. Verify type, content, creation date, and last-used date. Search `PDF`, then a nonexistent term. Verify paging if more than 25 memories exist.
- Edit the PDF preference to `I prefer DOCX reports.` Keep the type Preference. After clearing chat, `Create a report.` should use the edited preference. Attempts to edit it into credential content must fail.
- Click **Forget this** and confirm. Verify it disappears from Settings and the count decreases. After clearing chat, the deleted preference must not enter future memory context.
- Enable **Automatically save simple answer-length preferences**. Send `I prefer short answers.` Expect automatic-save feedback, not a confirmation card. Send `I prefer detailed answers.` The newest answer-length preference should be used in subsequent AI responses. Older entries remain visible for user-managed deletion.
- With automatic saving enabled, send a new PDF preference or personal/project fact. It must still require Save; automatic saving is narrowly limited to simple answer-length statements.
- Disable personal memory. Saved entries remain visible/editable/deletable, but new conversations must not extract suggestions or retrieve memory. Re-enable it and verify saved information becomes available again. Changing settings invalidates older unaccepted proposal tokens.
- Click **Delete all memories** and confirm. The list/count should become empty. Neither an old Save card nor an in-flight extractor may restore the old generation. Deletion does not erase the original transcript; clear chats separately if desired.
- Wait longer than 15 minutes before accepting a fresh suggestion. Expect a controlled expired-suggestion message and no save. Reloading the page also discards unaccepted transient cards.

Privacy and integration checks:

As account B, ask `Create a report.` and inspect Settings ? Memory. It must not know A's saved preference from memory. Attempt A's memory edit/delete API URL using B's authenticated session: expect 404. Supplying userId in a save payload must not change ownership. Without authentication, expect 401. These API cases are automated by the new test suite.

In a document chat, send `I prefer concise explanations.` Review/save the suggestion, then ask a question whose answer exists in the document. The provider should receive both the saved style preference and the retrieved document evidence. Memory must not override a document's actual deadline or be presented as a document source. Existing DOCX generation should continue to work; a remembered PDF preference is context only and does not implement a new export format.

For outage checks, use a disposable test configuration with the AI provider disabled: explicit eligible declarations can still produce validated exact-text suggestions through the fallback. AI-dependent answers continue to use the existing safe availability errors. If memory storage itself is unavailable, the answer path falls back to no saved-memory context; suggestion feedback reports unavailability rather than exposing database or provider details.

Run automated checks from `server/`:

```powershell
npm.cmd run test:memory
npm.cmd run test:auth
npm.cmd run test:assistant
npm.cmd run test:document-chat
npm.cmd run test:document-chat-quality
npm.cmd run test:document-generation
npm.cmd run test:document-knowledge
```

The memory test uses the configured local MongoDB, creates UUID-named users, mocks AI, and removes its own fixtures. It does not need paid provider calls. The successful local run covered 47 memory checks. The separate production build command is `npm.cmd run build` from the repository root.

Manual browser and live-provider results: **not executed**. Use this guide to record those results on the intended deployment. Avoid logging real credentials or personal memory content while measuring request latency. Provider extraction uses a 5-second per-provider timeout and may add latency for eligible declarations; memory context itself is capped at six entries and 2,000 characters.
