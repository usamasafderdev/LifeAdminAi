import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import Task from '../models/Task.js';
import User from '../models/User.js';
import { getDashboardData } from '../services/integrationService.js';
import { summarizeTaskDeadlines, taskDateKey } from '../services/taskDeadlineService.js';

const TODAY = '2026-09-02';
const EMAILS = ['deadline-a@lifeadmin.local', 'deadline-b@lifeadmin.local'];
const check = (condition, label) => { if (!condition) throw new Error(`${label} failed`); console.log(`${label.padEnd(65, '.')} PASS`); };
const task = (dueDate, status = 'pending') => ({ dueDate, status });

async function run() {
  let userIds = [];
  try {
    check(summarizeTaskDeadlines([task('2026-09-08')], { today: TODAY }).upcoming.length === 1, '1. Sep 8 is within 14 days of Sep 2');
    const dueToday = summarizeTaskDeadlines([task('2026-09-02')], { today: TODAY });
    check(dueToday.dueToday.length === 1 && dueToday.upcoming.length === 1, '2. Today is included in the upcoming window');
    check(summarizeTaskDeadlines([task('2026-09-16')], { today: TODAY }).upcoming.length === 1, '3. Day 14 boundary is included');
    check(summarizeTaskDeadlines([task('2026-09-17')], { today: TODAY }).upcoming.length === 0, '4. Day 15 is excluded');
    const overdue = summarizeTaskDeadlines([task('2026-09-01')], { today: TODAY });
    check(overdue.overdue.length === 1 && overdue.upcoming.length === 0, '5. Overdue task is not upcoming');
    check(summarizeTaskDeadlines([task('2026-09-08', 'completed')], { today: TODAY }).upcoming.length === 0, '6. Completed deadline is excluded');
    check(summarizeTaskDeadlines([task('2026-09-08', 'cancelled')], { today: TODAY }).upcoming.length === 0, '7. Cancelled deadline is excluded');
    const undated = summarizeTaskDeadlines([task(null)], { today: TODAY });
    check(undated.upcoming.length === 0 && undated.overdue.length === 0, '8. Null due date is excluded');
    const four = summarizeTaskDeadlines(Array.from({ length: 4 }, () => task('2026-09-08')), { today: TODAY });
    check(four.upcoming.length === 4 && !four.insight.startsWith('No deadlines'), '9. Four Sep 8 tasks produce count and useful insight');
    check(summarizeTaskDeadlines([task('2026-10-01')], { today: TODAY }).insight === 'No deadlines fall within the next 14 days.', '10. Empty window produces the correct message');

    await connectDB();
    const old = await User.find({ email: { $in: EMAILS } }).select('_id');
    if (old.length) await Task.deleteMany({ userId: { $in: old.map((item) => item._id) } });
    await User.deleteMany({ email: { $in: EMAILS } });
    const [a, b] = await User.create([{ fullName: 'Deadline A', email: EMAILS[0], password: 'DeadlineTest123' }, { fullName: 'Deadline B', email: EMAILS[1], password: 'DeadlineTest123' }]);
    userIds = [a._id, b._id];
    await Task.create(Array.from({ length: 4 }, (_, index) => ({ userId: a._id, title: `Upcoming ${index + 1}`, description: '', dueDate: new Date('2026-09-08T00:00:00.000Z'), status: 'pending', source: 'manual' })));
    const [dashboardA, dashboardB] = await Promise.all([getDashboardData(a._id, { now: new Date('2026-09-02T23:30:00.000Z'), today: TODAY }), getDashboardData(b._id, { now: new Date('2026-09-02T23:30:00.000Z'), today: TODAY })]);
    check(dashboardA.counts.upcomingDeadlines === 4 && dashboardB.counts.upcomingDeadlines === 0, '11. Dashboard deadline counts remain user-scoped');
    check(taskDateKey(new Date('2026-09-08T00:00:00.000Z')) === '2026-09-08' && dashboardA.counts.upcomingDeadlines === 4, '12. UTC-midnight date-only deadline does not shift days');
    console.log('Dashboard deadline verification completed successfully.');
  } catch (error) { console.error(`Dashboard deadline verification failed: ${error.message}`); process.exitCode = 1; }
  finally { if (userIds.length) await Promise.all([Task.deleteMany({ userId: { $in: userIds } }), User.deleteMany({ _id: { $in: userIds } })]); if (mongoose.connection.readyState) await mongoose.connection.close(); }
}
run();
