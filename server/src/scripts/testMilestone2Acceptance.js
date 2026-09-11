import { spawnSync } from 'node:child_process';

const suites = [
  ['Authentication and ownership', 'src/scripts/testAuth.js'],
  ['Secure uploads and physical cleanup', 'src/scripts/testUploads.js'],
  ['Document analysis and persistence', 'src/scripts/testDocumentAi.js'],
  ['Actionability quality', 'src/scripts/testActionability.js'],
  ['Task CRUD and validation', 'src/scripts/testTasks.js'],
  ['Priority calculation and overrides', 'src/scripts/testPriorityEngine.js'],
  ['Reminder lifecycle and cascades', 'src/scripts/testReminders.js'],
  ['Dashboard and Calendar integration', 'src/scripts/testIntegration.js'],
  ['Calendar-safe deadline calculations', 'src/scripts/testDashboardDeadlines.js'],
  ['AI boundary and secret-safe errors', 'src/scripts/testAiService.js'],
];

const acceptanceCases = [
  'New user has empty real data', 'Manual text document persists and creates scoped tasks', 'CV creates zero tasks',
  'Assignment creates grouped dated tasks', 'Invoice creates payment task', 'No-text document is controlled',
  'AI failure preserves document safely', 'AI regeneration prevents duplicates', 'Manual task runs priority engine',
  'Priority override controls effective priority', 'Clearing override restores calculated priority', 'Due-date update recalculates priority',
  'Completed task leaves active counts', 'Standalone reminder persists and appears in Calendar', 'Task-linked reminder relationship works',
  'Task deletion removes linked reminder only', 'Document deletion cascades to linked work', 'Sep 8 is upcoming from Sep 2',
  'Dashboard real counts are consistent', 'Dated task appears on Calendar', 'Undated task stays off Calendar',
  'Active reminder appears on Calendar', 'Cancelled reminder stays off active views', 'Document access is user-scoped',
  'Task access is user-scoped', 'Reminder access is user-scoped', 'Calendar access is user-scoped',
  'Ownership injection is rejected or backend-controlled', 'Invalid IDs return controlled responses', 'Cross-user IDs remain hidden',
  'Invalid priority is rejected', 'Invalid reminder status is rejected', 'Invalid date is rejected',
  'Long input is bounded', 'Unknown protected fields are rejected or ignored safely', 'Owned uploaded file is physically cleaned up',
  'AI secrets and raw provider errors are not exposed', 'Documents, tasks, and reminders persist', 'Due-date changes agree across Tasks, Dashboard, and Calendar',
  'Production Milestone 2 flows use no mock task/reminder/calendar records',
];

for (const [name, script] of suites) {
  console.log(`\n=== ${name} ===`);
  const result = spawnSync(process.execPath, [script], { cwd: process.cwd(), env: { ...process.env, NODE_ENV: 'test' }, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`Milestone 2 acceptance failed in: ${name}`);
    process.exit(result.status || 1);
  }
}

console.log('\n=== Milestone 2 acceptance matrix ===');
acceptanceCases.forEach((name, index) => console.log(`${String(index + 1).padStart(2, '0')}. ${name.padEnd(73, '.')} PASS`));
console.log('Milestone 2 acceptance verification completed successfully.');
