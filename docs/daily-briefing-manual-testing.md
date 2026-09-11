Daily briefing - manual testing guide

Start the existing backend and frontend, sign in with a disposable account A, and keep a separate browser profile for account B. The browser time zone determines "today"; the backend derives the date from its clock. No new API key or paid service is required for fallback briefings.

1. **Overdue, due today, and a reminder.** In Tasks create "Overdue report" due yesterday and "Submit assignment today" due today. Leave both active. In Reminders create "Client meeting today" later today. Open Dashboard. Expect Your day with LifeAdmin near the top, both tasks in Focus Today, high attention on the overdue task, and the reminder in Today's reminders. Priorities must match the existing task priority engine, including any explicit user override. In developer tools, the briefing response should contain typed focusTasks and todayReminders arrays.

2. **A future event.** Create "Project documentation" due tomorrow and "Upcoming appointment" as an active reminder in three days. Click Refresh briefing. Expect future items in Upcoming. Completed/cancelled tasks and dismissed/completed/cancelled reminders should not be included in a newly generated snapshot.

3. **Recent document.** Upload the existing `docs/fixtures/document-knowledge/Assignment.pdf`, or create a text document titled "Briefing document". Return to Dashboard and click Refresh briefing. Expect the title under Recent documents with a working source link. Documents with completed, actionable AI analysis can also appear under Documents needing review. The card must not show the full document text or analysis prose.

4. **Priority ordering.** In a clean account with no overdue tasks, create an undated low-priority task and an undated task with a High priority override. Refresh briefing. Expect the high-priority task first. In a populated account, tasks with higher effective priority/engine score can outrank a newly created high-priority task. Make an overdue task's explicit override Low: it must remain Low while its reason/attention highlights that it is overdue.

5. **Daily caching.** Record generatedAt from the first successful briefing response. Reload Dashboard twice. Expect cached=true and unchanged generatedAt, with no new AI generation. Click Refresh briefing; expect cached=false and a new generatedAt (or generating=true if another request holds the lease). Subsequent GET requests should reuse the new snapshot. Edits/uploads made after generation require this manual refresh to appear in the card.

6. **Hide and show.** Click Hide. The full card should collapse to Show daily briefing. Navigate away/back and verify the hidden preference remains. Click Show daily briefing to restore it. Hiding is separate from disabling.

7. **Disable and re-enable.** Click Disable daily briefing. The card should disappear. Open Settings, select Daily briefing, and verify the checkbox is off. Reload Dashboard: no briefing should be generated. Re-enable the setting in Settings; return to Dashboard and verify the card returns. Settings changes clear old derived snapshots. Disabling during a request must not let that request recreate a visible cache entry.

8. **Account isolation.** Log out and sign in as B. Expect only B's briefing, or "No important tasks today. Enjoy your day." if B has no records. A's task/document titles must not appear. Reusing A's userId in query parameters while authenticated as B must not override ownership. Unauthenticated API requests return 401.

9. **Memory control.** In Ask LifeAdmin say `I prefer concise answers.` and save it. Refresh the briefing. The preference may guide which grounded summary is selected, but it must not appear as a document fact. Disable personal memory or delete the memory in Settings -> Memory, then reload the dashboard. The previous personalization stamp should be invalidated. Personal facts, such as a university or name saved in memory, must not be surfaced proactively by this feature.

10. **AI unavailable.** In a disposable backend session, temporarily disable the configured AI provider and fallback, restart that test server, then click Refresh briefing. Expect a fresh deterministic briefing with correct owned records and a brief availability note. There must be no API key, raw provider response, or stack trace. Restore the original configuration afterward. Repeated page loads should reuse the fallback snapshot instead of repeatedly calling AI.

11. **Time boundaries and concurrent requests.** Around local midnight, the visible dashboard checks the server cache within approximately one minute; expect a new local-date entry. With a slow mock AI, open the dashboard simultaneously in two tabs. Expect one generation and a cached/generating response in the other tab. The automated suite reproducibly covers 23-hour and 25-hour DST days, lease expiry after a crashed worker, and disable-during-generation without waiting for actual calendar changes.

12. **Existing features.** Open Tasks, Reminders, Documents, Ask LifeAdmin, and Settings -> Memory. Complete/edit a task, dismiss a reminder, view a document source, and ask a document planning question. These existing flows must still work. The briefing must not mutate tasks, create reminders, send notifications, or claim that goal/milestone records exist when the app has no such model.

Database expectations: one DailyBriefing row per user/local date/canonical time zone; generatedAt is unchanged on cache hits; refresh updates the row/revision; empty and AI-fallback content are cached; an eight-day TTL handles retention. Briefing settings live on the existing User model. Do not manually edit real users' records for these checks.

From `server/`, run the isolated new suite:

```powershell
npm.cmd run test:daily-briefing
```

It uses the configured local MongoDB, creates UUID-named test accounts, mocks AI, and removes its own fixtures. It passed 33 checks. Regression commands used for this change:

```powershell
npm.cmd run test:priority
npm.cmd run test:dashboard-focus
npm.cmd run test:dashboard-deadlines
npm.cmd run test:memory
npm.cmd run test:document-chat-quality
npm.cmd run test:reminders
npm.cmd run test:integration
```

Run `npm.cmd run build` from the repository root for the frontend production build. Browser interaction and live-provider test results remain **not executed**. Record those results on the intended deployment, including first-load time, cache-hit time, and manual-refresh time. Avoid logging real private records or credentials during performance checks.
