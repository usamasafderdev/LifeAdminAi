# Smart scheduling manual testing

## Prerequisites

Use MongoDB Atlas or a local replica set. Point the existing backend `MONGODB_URI` to that database and restart the backend. Calendar acceptance uses transactions; a standalone database intentionally returns HTTP 503 with an explanation. Do not convert a database containing important data without a backup and an administrator-reviewed migration.

Run `npm.cmd run dev` in `server` and in the project root. Sign in and open Calendar. Save timezone `Asia/Karachi`, Monday–Friday, 18:00–22:00. Use a future weekday for examples so the chosen time has not passed. The scheduler's daily/weekly view appears above the existing monthly deadline/reminder calendar.

## Test A — Task with a deadline

1. On Tasks, create **Prepare project report**, deadline seven days from today, estimated duration 180 minutes.
2. On Calendar, expand task selection and select that task.
3. Choose Next 7 days and Suggest schedule.
4. Expect a preview with 180 total minutes, normally split into 120- and 60-minute blocks. Task links open the original task. No blocks appear in the accepted agenda yet.

## Test B — Respect availability

1. Save available hours 18:00–22:00 on the desired weekdays.
2. Generate a preview and check its displayed timezone.
3. Expect every block wholly within those local available hours and days.
4. Add a future meeting occupying an available hour, regenerate, and verify that hour is avoided.
5. Remove all available days and generate again. Expect no blocks and a no-availability explanation.

## Test C — Approval and editing

1. Generate a preview. Change a block's start/end while preserving its duration and available hours.
2. Accept schedule. Expect the edited blocks in the daily/weekly agenda and a success message.
3. Refresh the page. Expect saved blocks to remain. Repeated acceptance must not duplicate them.
4. Generate a separate preview, select Cancel suggestion, and verify no events were created for it.
5. Try editing a block into occupied time or outside availability. Acceptance must reject it with a useful message.
6. Save a different duration on the task, regenerate, and verify the new total. Existing accepted/completed blocks count toward that total.

## Test D — Ask LifeAdmin and briefing

1. Ensure tomorrow has an accepted block.
2. Ask **What should I do tomorrow?** Expect its title and local time with an Open Calendar action.
3. Ask **When should I complete my assignment?** for a single existing assignment task. Expect a preview and a review action; no automatic event creation.
4. Ask **Find time for my FYP.** with one matching task. Ambiguous or absent matches should direct you to select/create the right task.
5. Ask **Can you plan my week?** Expect a reviewable preview of open tasks.
6. Create an accepted block today, open Dashboard, and refresh the daily briefing. Expect today's title and start/end times in the scheduling timezone.

## Test E — Impossible deadline

1. Give a task 2,400 minutes with a deadline today or the next available day, while availability is only four hours.
2. Generate a preview. Expect only the time that fits plus an explicit remaining-minutes warning suggesting more availability, less work or an extended deadline.
3. No block may exceed a future deadline. A task already overdue may receive a clearly labelled recovery schedule after its missed deadline.

## Additional checks

- Log in as another user: no first-user events, previews or task references may be accessed, even with copied IDs.
- Open the same pending preview in two tabs and accept both: only one set of events is created.
- Generate two conflicting previews and accept concurrently: one succeeds; the other must require a new preview or modified times.
- Change availability after creating a preview: acceptance must use the new availability.
- Complete/cancel a task: its planned blocks are released. Delete a task or source document: linked calendar records are removed.
- Change timezone to America/New_York and inspect DST transitions; nonexistent local times must not silently shift to another hour. Asia/Kathmandu verifies non-hour offsets.
- Disable AI estimates/explanation and generate a preview: saved durations or clearly labelled fallback estimates remain usable.
- Recheck task creation/editing, reminders, existing monthly deadline calendar, Ask LifeAdmin planning, memory controls and daily briefing refresh.

These are manual instructions, not a claim that browser testing was executed. Automated results and limitations are recorded in the feature report.
