# Calendar integration and smart scheduling — implementation report

## 1. Feature summary

The existing Calendar route now includes availability settings, task selection and duration editing, daily/weekly agendas, busy meetings/personal events, and editable schedule previews. Accept creates blocks; Cancel creates none. Existing monthly task deadlines and reminders remain available beneath the scheduler.

Ask LifeAdmin supports scheduling questions and links to persisted previews. Daily briefing includes today's scheduled blocks in the saved scheduling timezone. Completing or cancelling a task releases its planned blocks; deleting a task or its source document removes related calendar records.

## 2. Architecture review and changes

The implementation was based on the current working tree, including existing uncommitted features:

| Area | Existing architecture and reuse |
| --- | --- |
| Authentication | Express `protect` middleware verifies the token and loads `req.user`. Every new route uses it. |
| User | Existing Mongoose User and settings remain authoritative; availability is a separate unique user-owned profile. |
| Tasks | Existing Task model, controller, validator, frontend task service and editor extended with duration. |
| Reminders | Existing Reminder service remains intact. Reminder notifications are time points, not assumed periods of busy time. Existing monthly calendar still shows them. |
| Priority | Existing `applyTaskPriority` computes effective priority, preserving user overrides. AI cannot set ranking. |
| Goals | No Goal model, ownership service, or goals route exists in this checkout. Existing briefing already declares goals unavailable. Non-null goal references are rejected, rather than inventing a second system or accepting unverifiable ownership. |
| Planning | Existing workspace assistant handles conversational planning. No separate persisted planning assistant exists. New previews integrate into that assistant. |
| Briefing | Existing collection, narration, user controls and cache reused. Calendar mutations invalidate the user's cached briefing. |
| Memory | Existing consent-aware retrieval and usage tracking supply context to the optional explanation. Memories never override explicit available hours. |
| AI | Existing multi-provider `generateText` service reused for duration suggestions and explanation, with deterministic fallback. |
| Ask LifeAdmin | Existing service and stored action schema extended with `open_schedule`; frontend renders a Calendar action. |
| Routing | Existing `/app/calendar` route extended; no duplicate calendar route or external OAuth flow. |

Controllers delegate to services. `calendarService` is the local calendar provider boundary for listing occupied intervals and applying changes. Google, Outlook and Apple adapters can later normalize their events into that boundary; authentication and synchronization are not implemented here.

## 3. Database changes

- `CalendarEvent`: user, title, description, type, start/end instants, task/goal references, status, proposal reference and timestamps. Indexed by user/start/end.
- `AvailabilityProfile`: unique user, working weekday numbers (Sunday = 0), same-day time ranges, IANA timezone, revision, timestamps.
- `ScheduleProposal`: user-owned blocks, explanation, warnings, duration sources, timezone, pending/accepted/cancelled status and expiration. Previews expire for acceptance after 24 hours; TTL removes them seven days after expiration.
- `Task.estimatedDuration`: optional 1–2400 whole minutes. No backfill required; existing tasks receive preview-only estimates.
- `Task.schedulingRevision`: internal concurrency field, excluded from normal queries.
- Workspace chat action enum adds `open_schedule`.
- Briefing Mixed content includes `scheduledBlocks`; no destructive migration.

Calendar writes require **MongoDB Atlas or a replica set** for transactions. The current local database was verified to be standalone. Reading availability, generating previews and existing features still work there, but calendar mutation returns a clear HTTP 503 until a transaction-capable database is configured. The existing local database/service was not converted or changed.

## 4. Backend files created

- `server/src/models/CalendarEvent.js`
- `server/src/models/AvailabilityProfile.js`
- `server/src/models/ScheduleProposal.js`
- `server/src/services/calendarService.js`
- `server/src/services/schedulingTimeService.js`
- `server/src/services/schedulingService.js`
- `server/src/services/schedulingAssistantService.js`
- `server/src/services/calendarTaskLifecycleService.js`
- `server/src/controllers/calendarController.js`
- `server/src/routes/calendarRoutes.js`
- `server/src/scripts/testScheduling.js`

API base: `/api/schedule`. Routes: GET/PUT `/availability`; GET/POST `/events`; PATCH `/events/:id`; POST `/suggestions`; GET `/suggestions/:id`; POST `/suggestions/:id/accept`; POST `/suggestions/:id/cancel`.

## 5. Frontend changes

Created `SchedulePanel.jsx`, scheduling API client and timezone date helpers. Extended Calendar, Tasks, Chat, DailyBriefingCard, task API mapping and styles. Users can select available days, add multiple daily time ranges, choose a timezone, edit duration estimates, select tasks, generate a 1/7/14/31-day preview, edit/remove blocks and accept or cancel. Busy meetings/personal events prevent future scheduling conflicts. Daily/weekly views link to related tasks and allow completing/cancelling blocks.

## 6. Scheduling algorithm

1. Fetch only the authenticated user's open tasks, availability, busy intervals and existing task allocations.
2. Resolve duration from the task, matching saved task history, bounded AI suggestion, or a disclosed 60-minute fallback.
3. Recompute priority with the existing engine. Order overdue work first, then high effective priority, then nearest deadline, with priority score and ID providing stable ties. Goal importance awaits an actual goal source.
4. Convert local available hours to UTC instants using IANA timezone rules. Nonexistent DST boundary times are skipped; ambiguous wall times choose the earlier occurrence.
5. Subtract occupied intervals and total already allocated task minutes, including completed blocks.
6. Allocate chronological blocks of up to two hours within remaining availability and deadline. Existing task deadlines are calendar dates, interpreted through the end of that date in the scheduling timezone. Overdue tasks produce explicitly labelled recovery plans after the missed deadline.
7. Report unscheduled minutes when the work cannot fit. Never silently extend a deadline or invent subtasks.
8. Persist a preview only. On explicit acceptance, revalidate ownership, current task state/duration/deadline, availability, future times, block count and conflicts. An atomic per-user profile write serializes calendar transactions; task writes detect concurrent task edits/deletion. Transaction retries re-read current conflicts. Accepted preview retries return the original events.

Limits: 50 selected tasks, 100 proposed blocks, 31 scheduling days, 1,000 occupied events per query, eight daily availability ranges. Dense ranges fail explicitly rather than silently ignoring busy events. The bounded interval allocator scans tasks and free intervals; it is intentionally deterministic, not an optimization solver.

## 7. AI usage

AI can suggest 15–2400 minute estimates for missing durations and explain a completed deterministic plan. Schema/length/range checks reject invalid estimates. Saved user duration and history take precedence. AI errors fall back to usable scheduling; the UI labels estimate sources and supports editing. Optional explanation uses consent-aware memory context as untrusted data. The algorithm and acceptance service enforce the schedule independently of generated prose. Ask scheduling currently uses deterministic explanations to keep chat responsive.

## 8. Security review

All calendar reads, previews, writes, task queries, history, memory and cleanup are scoped by the authenticated user. Request ownership fields never control persisted ownership. Preview edits may reference only originally proposed owned open tasks. Non-null goals are rejected until ownership can be verified. Raw event creation cannot bypass the task preview flow. Dates require explicit offsets and valid calendar days. Calendar transactions atomically publish events and acceptance state; cancellation/expiration and retry behavior are checked server-side. Task or document deletion clears related proposals and events. No external OAuth credentials or provider actions were added.

## 9. Automated verification

`npm.cmd run test:scheduling`: 13 deterministic scheduling/timezone checks.

`npm.cmd run test:scheduling-integration`: **36 checks passed**, using an isolated local MongoDB replica set. Includes all requested scheduling cases: deadline task, no availability, nonoverlap, high priority, accept, reject, two-user isolation, timezone conversion, briefing integration. Additional coverage includes DST gaps/folds, quarter-hour offsets, existing busy time, already allocated duration, overdue work, mandatory approval, cancellation/expiration, concurrent acceptance, idempotency, invalid edits, AI estimation/fallback, task completion and deletion.

Existing regression suites passed: priority, tasks, reminders, daily briefing, Ask LifeAdmin, calendar/dashboard integration, document/task cleanup, and personal memory. Existing goals cannot be regression-tested because that system is absent. Conversational planning remains part of the assistant suite.

Frontend production build passed. Vite reports a bundle-size warning above 500 kB. No browser automation capability was available; visual/manual acceptance is provided separately and is not claimed as executed.

To run integration tests, set `SCHEDULING_TEST_URI` to a dedicated test replica-set database and run the integration command from `server`. Test users use random email suffixes and cleanup removes only their records.

## 10. Manual testing

See [smart-scheduling-manual-testing.md](smart-scheduling-manual-testing.md) for the requested A–E scenarios, approval/security checks and database prerequisite.

## 11. Known limitations

- Local standalone MongoDB cannot accept/create/update blocks; use Atlas or a replica set. No unsafe partial-write fallback is used.
- Goals and goal importance are not implemented because no existing goal source exists. The reference field reserves the relationship; supplied goals are explicitly rejected.
- No external calendar sync/OAuth, recurrence, drag/drop, holidays, travel time, break optimization or automatic subtask generation.
- All selected working days share the same available ranges. Overnight availability must be represented as same-day ranges; DST gaps at range boundaries skip that range.
- A completed block counts as allocated work but does not complete its task automatically. A user completes the task through the existing task controls.
- Suggested duration/history estimates are kept on the preview until the user explicitly saves a task duration. AI prose is advisory; deterministic blocks and warnings are authoritative.
- Accepted preview records eventually expire under TTL, while CalendarEvent records remain; later block changes use event controls.
- Browser visual checks remain manual.
