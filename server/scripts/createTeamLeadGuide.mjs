import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  SectionType,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  WidthType,
} from 'docx';
import fs from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('../docs/LifeAdmin-AI-Team-Lead-Presentation-Guide.docx');

const colors = { navy: '10243E', blue: '2E75B6', gold: 'C98B18', light: 'EAF2F8', muted: '5B6573' };
const p = (text, options = {}) =>
  new Paragraph({ text, spacing: { after: 120, line: 276 }, ...options });
const bullet = (text, level = 0) =>
  new Paragraph({ text, bullet: { level }, spacing: { after: 70, line: 260 } });
const heading = (text, level = HeadingLevel.HEADING_1) =>
  new Paragraph({
    text,
    heading: level,
    spacing: { before: level === HeadingLevel.HEADING_1 ? 260 : 160, after: 100 },
  });
const label = (name, text) => [
  new Paragraph({
    children: [{ text: `${name}: `, bold: true }, { text }],
    spacing: { after: 60, line: 260 },
  }),
];
const say = (text) =>
  new Paragraph({
    children: [{ text: 'WHAT I SAY: ', bold: true, color: colors.gold }, { text }],
    shading: { type: ShadingType.CLEAR, fill: 'FFF8E7' },
    spacing: { before: 60, after: 120, line: 260 },
  });
const code = (text) => new Paragraph({ text, style: 'Code', spacing: { after: 80, line: 240 } });

function table(headers, rows, widths) {
  const header = new TableRow({
    children: headers.map(
      (text, i) =>
        new TableCell({
          width: { size: widths?.[i] || 2400, type: WidthType.DXA },
          shading: { type: ShadingType.CLEAR, fill: colors.navy },
          children: [new Paragraph({ text, bold: true, color: 'FFFFFF' })],
        }),
    ),
  });
  const body = rows.map(
    (row) =>
      new TableRow({
        children: row.map(
          (text, i) =>
            new TableCell({
              width: { size: widths?.[i] || 2400, type: WidthType.DXA },
              children: [p(String(text))],
            }),
        ),
      }),
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [header, ...body],
    borders: {
      top: { style: 'single', size: 4, color: 'D9E2F3' },
      bottom: { style: 'single', size: 4, color: 'D9E2F3' },
      insideHorizontal: { style: 'single', size: 2, color: 'E7EDF5' },
      insideVertical: { style: 'single', size: 2, color: 'E7EDF5' },
    },
  });
}

const children = [];
function add(...items) {
  children.push(...items.flat());
}
function section(title, ...items) {
  add(heading(title), ...items);
}

add(
  new Paragraph({
    text: 'LifeAdmin AI',
    heading: HeadingLevel.TITLE,
    alignment: AlignmentType.CENTER,
    spacing: { after: 100 },
  }),
  new Paragraph({
    text: 'Team Lead Presentation Guide',
    alignment: AlignmentType.CENTER,
    bold: true,
    color: colors.blue,
    spacing: { after: 80 },
  }),
  new Paragraph({
    text: 'A code-grounded explanation of the actual project',
    alignment: AlignmentType.CENTER,
    color: colors.muted,
    spacing: { after: 260 },
  }),
  p(
    'Prepared from the repository implementation. This guide separates what is implemented from what depends on environment configuration or still needs verification.',
  ),
  heading('How to use this guide', HeadingLevel.HEADING_2),
  bullet('Read the short speaking sections first. They are written so you can say them directly.'),
  bullet('Use the technical sections when your Team Lead asks how a feature works.'),
  bullet(
    'Treat “needs verification” notes seriously. They identify behavior that depends on API keys, MongoDB, Google OAuth configuration, or a live integration.',
  ),
);

section(
  '1. WHAT IS LIFEADMIN AI?',
  heading('30-second explanation', HeadingLevel.HEADING_2),
  say(
    'LifeAdmin AI is a personal administration workspace. A user can upload documents or add information, and the system stores it, reads its text, finds useful dates and actions, creates tasks, and helps the user plan work. It also includes reminders, calendar scheduling, notifications, search, document chat, and an AI workspace assistant. The main goal is to turn scattered personal information into clear next actions.',
  ),
  heading('1-minute explanation', HeadingLevel.HEADING_2),
  p(
    'The target user is someone who has many personal or work documents, deadlines, reminders, appointments, and small responsibilities. Instead of keeping everything in separate files and notes, the user puts information into one workspace. LifeAdmin AI uses normal application logic for storage, validation, tasks, reminders, and scheduling, and uses AI where language understanding is useful: reading document text, identifying real obligations, estimating task duration, explaining schedules, and answering workspace questions.',
  ),
  p(
    'The important design idea is that AI does not directly control everything. The backend validates file types, validates AI JSON, keeps records scoped to the authenticated user, uses deterministic scheduling rules, and asks the user to review and accept a suggested schedule before calendar blocks are created.',
  ),
);

section(
  '2. COMPLETE PROJECT FLOW',
  heading('Main request flow', HeadingLevel.HEADING_2),
  code(
    'User -> React page/component -> frontend service -> HTTP API -> Express route -> controller/service -> MongoDB and/or AI -> JSON response -> React state/UI',
  ),
  p(
    'The frontend is in src/. Pages call small service modules such as documentService.js, taskService.js, reminderService.js, and schedulingService.js. The backend mounts REST routes under /api, protects user data with middleware, then passes work from controllers to services and Mongoose models.',
  ),
  heading('Actual document flow', HeadingLevel.HEADING_2),
  bullet('The user chooses PDF, image, paste text, or manual entry in Add Information.'),
  bullet(
    'PDF/image uploads are checked in the browser and again by Multer on the server. The limit is 10 MB and only PDF, JPEG, PNG, and WebP are accepted.',
  ),
  bullet(
    'The server stores the file privately under server/uploads, extracts PDF text with pdf-parse or image text with Sharp plus Tesseract.js OCR.',
  ),
  bullet(
    'A Document record stores the owner, title, source type, category, file metadata, file path, and extracted text.',
  ),
  bullet(
    'Document knowledge chunks are prepared for search/chat. Automatic processing sends readable text to document AI analysis.',
  ),
  bullet(
    'The AI result is parsed and validated. Important dates, actions, priorities, key information, and risks are stored in aiAnalysis.',
  ),
  bullet(
    'Confirmed or automatic actions can become Task records. The UI then shows the saved document, analysis, and generated tasks.',
  ),
  heading('Actual scheduling flow', HeadingLevel.HEADING_2),
  bullet(
    'The user saves a timezone, working days, and available ranges as an AvailabilityProfile.',
  ),
  bullet(
    'The user selects open tasks and a planning horizon. Missing durations may come from task history, AI, or a 60-minute default.',
  ),
  bullet(
    'The deterministic scheduler removes busy time, orders tasks by overdue state, priority, deadline, and score, then creates a ScheduleProposal.',
  ),
  bullet('Optional AI explains the already-created plan; it does not choose or change the times.'),
  bullet(
    'The user reviews and accepts the proposal. Only then are CalendarEvent task blocks written.',
  ),
);

section(
  '3. TECHNOLOGIES USED',
  table(
    ['Technology', 'Where used', 'Why used', 'Simple explanation'],
    [
      [
        'React',
        'src/pages, components, contexts',
        'Build interactive screens from reusable pieces.',
        'The frontend is made from components that manage display and user actions.',
      ],
      [
        'Vite',
        'vite.config.js, package.json',
        'Fast frontend development and production bundling.',
        'It runs the React app locally and creates the final browser files.',
      ],
      [
        'React Router',
        'src/App.jsx',
        'Client-side page navigation.',
        'The app changes pages without a full browser reload.',
      ],
      [
        'Express 5',
        'server/src/app.js and routes',
        'HTTP API server.',
        'It receives requests and sends JSON responses.',
      ],
      [
        'MongoDB + Mongoose',
        'server models/config/db.js',
        'Store user-scoped application data.',
        'MongoDB stores flexible records; Mongoose defines and validates their shape.',
      ],
      [
        'JWT',
        'authController, authMiddleware',
        'Keep authenticated API requests stateless.',
        'The server gives the frontend a signed token that identifies the user.',
      ],
      [
        'bcrypt',
        'models/User.js',
        'Protect local passwords.',
        'Passwords are saved as one-way hashes, not plain text.',
      ],
      [
        'Multer',
        'config/upload.js',
        'Receive multipart file uploads.',
        'It accepts one validated file and writes it to private disk storage.',
      ],
      [
        'pdf-parse',
        'pdfExtractionService.js',
        'Extract text and tables from PDFs.',
        'It turns a PDF file into text the rest of the system can understand.',
      ],
      [
        'Sharp',
        'ocrService.js',
        'Validate image data before OCR.',
        'It reads image metadata and rejects invalid image files.',
      ],
      [
        'Tesseract.js',
        'ocrService.js',
        'Read text from images.',
        'It performs English OCR on JPEG, PNG, and WebP images.',
      ],
      [
        'Groq SDK / Gemini SDK',
        'ai/ providers and config/ai.js',
        'Generate AI text.',
        'The provider layer can call configured Groq or Gemini models.',
      ],
      [
        'Google Auth Library + React OAuth',
        'googleAuth.js and Auth.jsx',
        'Google sign-in.',
        'The server verifies the Google credential before creating or linking a user.',
      ],
      [
        'Framer Motion',
        'shared UI components',
        'Small UI transitions.',
        'It animates modals and drawers.',
      ],
      [
        'Lucide React',
        'frontend components',
        'Consistent icons.',
        'It supplies the interface icons.',
      ],
      [
        'docx',
        'server package and this guide generator',
        'Generate Word documents.',
        'It creates .docx files programmatically.',
      ],
    ],
    [1700, 2100, 2200, 2800],
  ),
);

section(
  '4. FRONTEND EXPLANATION',
  p(
    'The frontend is a React single-page application built with Vite. App.jsx defines public authentication routes and protected /app routes inside AppShell. AppContext loads and updates workspace data; AuthContext stores the current user and token state. API calls are centralized through src/services/api.js and feature-specific service files.',
  ),
  heading('Frontend structure', HeadingLevel.HEADING_2),
  bullet(
    'src/pages contains full screens: Dashboard, Documents, DocumentDetail, DocumentIntelligence, AddInformation, Tasks, Reminders, Calendar, Notifications, SearchPage, Chat, Settings, MemorySettings, and Auth.',
  ),
  bullet(
    'src/components contains reusable UI and feature pieces such as AppShell, UI controls, SchedulePanel, DocumentChat, DailyBriefingCard, NotificationCenter, ItemRows, and CommandPalette.',
  ),
  bullet('src/context contains shared authentication and workspace state.'),
  bullet(
    'src/services contains API wrappers. Components call these wrappers instead of putting HTTP details everywhere.',
  ),
  bullet(
    'src/styles.css contains the application styling, including dark theme and responsive rules. Tailwind is configured but most current UI styling is in the CSS file.',
  ),
  heading('Major pages', HeadingLevel.HEADING_2),
  table(
    ['Page', 'Purpose and actual functionality', 'Backend connection / speaking line'],
    [
      [
        'Dashboard',
        'Shows workspace summary, attention items, deadlines, reminders, recent documents, daily briefing, and quick actions.',
        'Uses task, reminder, document, briefing, notification, and integration services. Say: “The dashboard gives a daily overview instead of making the user open every module.”',
      ],
      [
        'Documents',
        'Lists owned documents, filters/searches them, and opens document details.',
        'Uses /api/documents. Say: “This is the document library and entry point to analysis and chat.”',
      ],
      [
        'Document Detail',
        'Shows original file or extracted content, analysis, tasks, actions, and document chat controls.',
        'Uses document detail, analysis, source, chat, task, and generated-document APIs.',
      ],
      [
        'Document Intelligence',
        'Shows relationships, important information, conflicts, and suggested actions across documents.',
        'Uses multi-document intelligence endpoints. Verify the exact AI result in a live environment before presenting it as always available.',
      ],
      [
        'Add Information',
        'Accepts PDF, image, pasted text, or manual records with title/category and validation.',
        'Uses document upload/create endpoints. Say: “This is the main intake point for structured and unstructured information.”',
      ],
      [
        'Tasks',
        'Lists tasks, filters them, edits status/priority/due dates/duration, and supports creation/deletion.',
        'Uses /api/tasks and task priority logic. AI-created tasks link back to a document.',
      ],
      [
        'Reminders',
        'Creates and manages time-based reminders and their statuses.',
        'Uses /api/reminders. Notification generation is a separate backend process.',
      ],
      [
        'Calendar',
        'Shows month timeline data and the Smart Scheduling workspace.',
        'Uses integration calendar endpoints and /api/schedule for availability, proposals, events, and busy time.',
      ],
      [
        'Notifications',
        'Shows user-scoped notifications, unread state, filters, read actions, and deletion/restore behavior where implemented.',
        'Uses /api/notifications.',
      ],
      [
        'Search',
        'Searches workspace information and displays matching documents/tasks/reminders or assistant-style results depending on the route.',
        'Uses search/integration and document knowledge retrieval. Confirm exact result types in the live data set.',
      ],
      [
        'Ask LifeAdmin / Chat',
        'Accepts natural-language questions, keeps conversation history, uses selected document context, and can return navigation/action suggestions.',
        'Uses /api/assistant and /api/conversations plus workspace/document retrieval. It does not have live web search.',
      ],
      [
        'Settings',
        'Manages account/profile, notification preferences, briefing settings, AI settings display, privacy and memory controls.',
        'Uses settings, privacy, and memory endpoints.',
      ],
    ],
    [1700, 3500, 3600],
  ),
  say(
    'The frontend is organized by user-facing features. Pages describe the screen, components hold reusable UI, contexts hold shared state, and service files keep API communication consistent.',
  ),
);

section(
  '5. BACKEND EXPLANATION',
  code(
    'Frontend -> /api request -> Express route -> auth middleware -> controller -> service -> Mongoose model / AI provider -> JSON response',
  ),
  p(
    'server/src/app.js creates the Express application, configures CORS and JSON limits, exposes /api/health, mounts route modules, then uses notFound and errorHandler middleware.',
  ),
  heading('Routes and responsibilities', HeadingLevel.HEADING_2),
  table(
    ['Route group', 'Main responsibility'],
    [
      ['/api/auth', 'Register, password login, current user, and Google credential login.'],
      [
        '/api/documents',
        'Create/list/read/update/delete documents, upload files, analyze/review analysis, create tasks, document chat, source chunks, generated documents.',
      ],
      [
        '/api/tasks',
        'Task CRUD, status changes, priority/duration updates, and task-related actions.',
      ],
      ['/api/reminders', 'Reminder CRUD and status operations.'],
      [
        '/api/schedule',
        'Availability, suggestions, proposals, schedule events, busy time, and event status changes.',
      ],
      [
        '/api/assistant and /api/conversations',
        'AI assistant requests and persistent conversation history.',
      ],
      ['/api/briefings', 'Daily briefing data and briefing settings.'],
      ['/api/notifications', 'Notification list, read/unread, dismissal/deletion behavior.'],
      [
        '/api/settings, /api/memories, /api/privacy',
        'User settings, memory controls, export/delete privacy operations.',
      ],
      ['/api integration routes', 'Calendar and workspace integration reads used by the frontend.'],
    ],
  ),
  heading('Important backend layers', HeadingLevel.HEADING_2),
  bullet('Controllers validate request-level input and choose the response status and JSON shape.'),
  bullet(
    'Services hold business rules: document AI, OCR, task generation, priority calculation, scheduling, assistant retrieval, notifications, briefings, memory, and document knowledge.',
  ),
  bullet('Models define MongoDB records and indexes.'),
  bullet(
    'authMiddleware reads the Bearer JWT, verifies it, loads the User, and places it on req.user.',
  ),
  bullet(
    'config/upload.js validates and stores files; config/ai.js reads provider settings; config/db.js connects to MongoDB.',
  ),
  bullet(
    'notFound and errorHandler turn unknown routes and thrown errors into controlled responses.',
  ),
);

section(
  '6. DATABASE',
  p(
    'MongoDB is the database. Mongoose is the library that defines schemas, validation rules, indexes, and convenient queries. Most records have userId, so one user cannot normally read another user’s data because queries include the authenticated user ID.',
  ),
  table(
    ['Model', 'What it stores and key fields', 'Relationships'],
    [
      [
        'User',
        'Name, email, hashed password or Google ID, avatar, notification settings, briefing settings, memory settings, notification job state.',
        'Owns nearly all workspace records.',
      ],
      [
        'Document',
        'Title, sourceType text/manual/pdf/image, category, original filename, MIME type, private path, extractedText, AI analysis, knowledge state, task-generation state.',
        'Belongs to User; can own Tasks, chunks, chat, analysis history, relationships, and generated files.',
      ],
      [
        'DocumentChunk',
        'Chunked document knowledge used for retrieval.',
        'Belongs to a Document and User.',
      ],
      [
        'Task',
        'Title, description, status, priority, priority score/reasons, dueDate, estimatedDuration, source, documentId.',
        'Belongs to User; optionally links to Document and calendar blocks.',
      ],
      [
        'Reminder',
        'Title, description, remindAt, status, source, taskId/documentId.',
        'Belongs to User; can come from a Task or Document.',
      ],
      [
        'CalendarEvent',
        'Title, description, type task_block/reminder/meeting/personal, start/end, status, relatedTaskId, proposalId.',
        'Belongs to User and may link to Task or ScheduleProposal.',
      ],
      [
        'AvailabilityProfile',
        'One profile per user: timezone, workingDays, availableTimeRanges, revision.',
        'Used by the scheduler.',
      ],
      [
        'ScheduleProposal',
        'Suggested blocks, timezone, explanation, warnings, estimates, status, expiry.',
        'Belongs to User; accepted proposals create CalendarEvents.',
      ],
      [
        'Notification',
        'Type, title/message, priority, read, related IDs, fingerprint, deletedAt.',
        'Belongs to User and may reference Task, Reminder, Document, or goal IDs.',
      ],
      [
        'Memory',
        'User-approved or automatic memory content, type, terms, importance, source, confidence, generation, usage data.',
        'Belongs to User and is used as optional assistant context.',
      ],
      [
        'Conversation / WorkspaceChatMessage / DocumentChatMessage',
        'Conversation metadata and persisted user/assistant messages.',
        'Belong to User; document chat also links to Document.',
      ],
      [
        'DailyBriefing',
        'Generated daily summary state and content.',
        'Belongs to User and reflects workspace data.',
      ],
      [
        'DocumentAnalysisHistory / DocumentRelationship / GeneratedDocument',
        'Analysis review history, relationships between documents, and generated output files.',
        'Linked to User and relevant Document records.',
      ],
    ],
  ),
  heading('Record lifecycle example: a document', HeadingLevel.HEADING_2),
  code(
    'Create: uploadDocument or createDocument -> Document.create\nRetrieve: list/get document with { userId }\nUpdate: PATCH editable fields; extracted text marks knowledge pending\nProcess: knowledge indexing + AI analysis + optional task generation\nDelete: deleteDocumentAndLinkedTasks removes the document, linked tasks, and stored file safely',
  ),
);

section(
  '7. AUTHENTICATION & SECURITY',
  p(
    'Local registration validates name, email format, and an eight-character minimum password. User.save hashes a modified password with bcrypt using 10 rounds. Login finds the user, compares the candidate password with the hash, and returns a JWT.',
  ),
  p(
    'Google login is also implemented. The frontend uses @react-oauth/google; the backend verifies the credential with google-auth-library, requires a verified email, then finds or creates the matching user and returns the same type of JWT.',
  ),
  bullet(
    'The frontend stores authentication state through AuthContext/authStorage and sends the token as a Bearer header through the API client.',
  ),
  bullet(
    'Protected routes use protect middleware. It verifies JWT_SECRET, loads the user, and rejects missing, invalid, expired, or unknown-user tokens with 401.',
  ),
  bullet(
    'CORS uses CLIENT_URL. The app disables x-powered-by. Uploads have MIME/extension checks, one-file limits, a 10 MB limit, private file paths, and path resolution checks.',
  ),
  bullet(
    'Document and workspace queries include req.user._id. Editable document fields are allow-listed and ownership/file metadata cannot be changed by PATCH.',
  ),
  say(
    'JWT identifies the user on each protected request, while bcrypt protects local passwords. The important rule is that the backend does not trust the browser; it verifies the token and applies the user filter again.',
  ),
);

section(
  '8. DOCUMENT PROCESSING',
  table(
    ['Input', 'Actual processing', 'Why it exists'],
    [
      [
        'PDF',
        'Multer stores it in uploads/documents. pdf-parse checks the PDF signature, extracts page text and tables, normalizes whitespace, adds page markers for multi-page files, and enforces a 2,000,000-character extraction limit.',
        'The AI needs clean text rather than a binary PDF.',
      ],
      [
        'Image',
        'Multer stores it in uploads/images. Sharp validates image metadata and format. Tesseract.js OCR runs English recognition using a cached worker, then text is normalized and length-checked.',
        'OCR makes printed text searchable and analyzable.',
      ],
      [
        'Paste text',
        'The frontend sends a JSON document with sourceType text and extractedText. The backend validates title, category, source type, and text length.',
        'Useful when the user already has copyable text.',
      ],
      [
        'Manual entry',
        'The frontend collects title, date, time, notes, then sends sourceType manual and a formatted extractedText value.',
        'Allows structured information without a file.',
      ],
    ],
  ),
  p(
    'After text is available, the system creates a Document, prepares document knowledge chunks, runs automatic document processing, stores AI analysis state, and may generate tasks. If AI is unavailable, the document can still be saved and the response explains that automatic analysis is unavailable.',
  ),
  p(
    'The code implements OCR for English images. It does not prove that every language or handwriting case is supported. Do not claim handwriting or multilingual OCR in the presentation.',
  ),
);

section(
  '9. AI PART',
  p(
    'The provider layer is in server/src/services/ai/aiService.js. The configured provider defaults to Groq when AI_PROVIDER is absent, and Gemini is also supported. The actual model comes from AI_MODEL or GEMINI_MODEL, so the exact model is environment-dependent and must not be guessed from the repository alone.',
  ),
  bullet(
    'generateText validates prompts, temperature, max tokens, and optional JSON schema before calling a provider.',
  ),
  bullet(
    'It selects a configured primary provider, applies AI_TIMEOUT_MS, rejects empty responses, and can use an optional fallback provider for rate limits, provider outages, timeouts, or invalid responses.',
  ),
  bullet(
    'Document analysis sends a strict system prompt and JSON schema. If parsing fails, it retries once with a stronger JSON-only instruction.',
  ),
  bullet(
    'The assistant uses different prompts for workspace facts, selected documents, general knowledge, safety, and response length.',
  ),
  bullet(
    'Missing AI credentials do not stop the non-AI API from starting, but AI analysis and AI explanations are unavailable.',
  ),
  heading('Why a provider/service layer?', HeadingLevel.HEADING_2),
  say(
    'We created one AI service so the rest of the backend does not need to know whether the request goes to Groq or Gemini. It gives us one place for validation, timeout handling, fallback behavior, logging, and future provider changes.',
  ),
);

section(
  '10. DOCUMENT AI ANALYSIS',
  code(
    'Raw PDF/image/text -> extractedText -> chunking if long -> document AI prompt -> JSON response -> parse + schema validation -> quality refinement -> aiAnalysis -> review/confirmation -> task generation',
  ),
  p(
    'The document prompt asks AI to identify whether the document requires action, create a short summary, classify it, extract explicit dates, produce goal-level actions with descriptions/priority/due dates, list key information, and list risks or consequences only when supported by the source. It explicitly tells the model not to invent facts or deadlines.',
  ),
  p(
    'Long documents are split into chunks, analyzed with a chunk prompt, and merged. The validator requires the response contract. Analysis also has pending_review, confirmed, and rejected review states. Confirmed analysis is what the explicit create-tasks path expects.',
  ),
  p(
    'Important limitation: AI output is validated for shape and supported values, but an AI result can still be semantically wrong. The product therefore exposes review/confirmation flows and keeps source text available for checking.',
  ),
);

section(
  '11. TASK SYSTEM',
  p(
    'Tasks can be created manually, generated from confirmed document actions, or generated automatically after document processing. A task stores title, description, status, priority, due date, estimated minutes, source, and an optional document link.',
  ),
  bullet('Statuses are pending, in_progress, completed, and cancelled.'),
  bullet(
    'Priorities are low, medium, and high. The model stores confirmed priority, calculated priority, score, reasons, and an optional user override.',
  ),
  bullet(
    'The task priority service calculates effective priority using due-date urgency and task information. The scheduler prioritizes overdue tasks first, then high priority, nearest due date, score, and stable ID order.',
  ),
  bullet(
    'AI task generation removes null/invalid titles, validates fields, normalizes due dates, applies priority, and skips duplicate titles for the same document.',
  ),
  bullet(
    'Tasks can be edited, completed/cancelled, deleted, and linked back to their source document.',
  ),
  p(
    'Do not describe a simple fixed “3 days / 7 days / 14 days” rule unless you show the exact current UI logic. In this repository the important logic is stored priority, due date, calculated score/reasons, and scheduler ordering.',
  ),
);

section(
  '12. REMINDERS',
  p(
    'A reminder is a time-based notification record. It has a title, description, remindAt timestamp, status, source, and optional links to a task or document. Sources are manual and task.',
  ),
  bullet('Reminder statuses are active, dismissed, completed, and cancelled.'),
  bullet(
    'The Reminders page reads and updates reminders. Backend notification scheduling checks user settings and generates notification records for due/approaching items.',
  ),
  bullet(
    'A task is work the user needs to complete. A reminder is a time signal that tells the user when to pay attention. A task can have a due date without being a reminder; a reminder can also be linked to a task.',
  ),
  p(
    'Missed/past display behavior depends on the reminder page and notification scheduler. The model supports the statuses, but demonstrate exact missed-reminder behavior with real data rather than claiming a specific visual rule.',
  ),
);

section(
  '13. CALENDAR & SMART SCHEDULING',
  p(
    'Calendar has two parts: a month-style timeline for task deadlines and reminders, and Smart Scheduling. The scheduling area saves availability and timezone, shows open tasks, estimates durations, suggests blocks, displays scheduled events, and allows busy meeting/personal time.',
  ),
  bullet('AvailabilityProfile stores workingDays, availableTimeRanges, timezone, and revision.'),
  bullet('The scheduler removes busy and existing allocated blocks from availability.'),
  bullet(
    'Tasks are ranked with overdue tasks first, then high priority, nearest due date, and priority score.',
  ),
  bullet(
    'Each scheduled block is limited to at most 120 minutes, and the proposal contains warnings when work cannot fit.',
  ),
  bullet(
    'AI may estimate missing task durations between 15 and 2400 minutes. If that fails, history is used first, then a 60-minute default.',
  ),
  bullet(
    'AI may add an explanation to the deterministic plan. It is instructed not to change times or claim that events were created.',
  ),
  bullet(
    'The user must accept a pending proposal before task-block CalendarEvents are created. Proposals expire after 24 hours in the service logic.',
  ),
  heading('Simple example', HeadingLevel.HEADING_2),
  p(
    'If I have three open tasks and I am available from 6 PM to 10 PM, LifeAdmin checks the tasks’ status, due dates, priorities, and durations. It subtracts meetings or personal blocks, places higher-urgency work into the remaining slots, splits long work into reviewable blocks, shows warnings, and asks me to review and accept the plan.',
  ),
  p(
    'This approach is useful because the system gives the user a practical plan without silently changing the calendar. The user remains in control of acceptance.',
  ),
);

section(
  '14. SEARCH',
  p(
    'The repository has document knowledge indexing and workspace retrieval services. Documents are chunked and stored as DocumentChunk records so questions can retrieve relevant document content. The assistant and document chat use this retrieval layer to answer from user-owned data.',
  ),
  bullet(
    'Workspace queries can retrieve documents, tasks, reminders, calendar information, and other supported workspace facts.',
  ),
  bullet(
    'The frontend has SearchPage and service calls for search-style results. Exact ranking and result presentation should be demonstrated from the live database because empty workspaces naturally return no results.',
  ),
  say(
    'Search is valuable because the user does not need to remember which file contained a deadline or instruction. The system can search the stored knowledge and then explain the result in context.',
  ),
);

section(
  '15. ASK LIFEADMIN / AI ASSISTANT',
  p(
    'The assistant accepts a user question, classifies it as general knowledge or workspace-related, retrieves relevant user-scoped context when needed, adds recent conversation context, and calls the AI service with strong instructions not to invent workspace facts.',
  ),
  bullet('Selected document conversations can use that document as primary context.'),
  bullet(
    'Workspace retrieval can use documents, tasks, reminders, calendars, memories, and conversation context depending on the question.',
  ),
  bullet(
    'The assistant has action/navigation support in the code, but it must not claim that an action occurred unless a verified backend result is supplied.',
  ),
  bullet(
    'General questions can use general AI knowledge. The prompt explicitly says no live web or local-business search is available, so do not claim live internet access.',
  ),
  bullet('Sensitive requests and credentials are rejected rather than guessed or exposed.'),
  bullet(
    'When workspace information is unavailable, the assistant uses a clear “I couldn’t find this information in your workspace” fallback.',
  ),
);

section(
  '16. API FLOW',
  table(
    ['Frontend action', 'HTTP request', 'Backend work and response'],
    [
      [
        'Register',
        'POST /api/auth/register',
        'Validate fields, create User with bcrypt hash, return safe user and JWT.',
      ],
      [
        'Login',
        'POST /api/auth/login',
        'Find by normalized email, compare bcrypt password, return safe user and JWT.',
      ],
      [
        'Upload PDF/image',
        'POST /api/documents/upload',
        'Multer validates/stores file, extraction/OCR runs, Document is saved, knowledge and automation run, JSON returns document and task-generation result.',
      ],
      [
        'Paste/manual entry',
        'POST /api/documents',
        'Validate source type/title/category/text, save Document, index knowledge, run automation.',
      ],
      [
        'List documents',
        'GET /api/documents',
        'Find documents by req.user._id and return newest first.',
      ],
      ['Create task', 'POST /api/tasks', 'Validate task input, apply priority logic, save Task.'],
      [
        'Save availability',
        'PUT /api/schedule/availability',
        'Validate timezone/days/ranges and upsert the user profile.',
      ],
      [
        'Suggest schedule',
        'POST /api/schedule/suggest',
        'Load tasks/profile/events, estimate missing durations, build deterministic plan, optionally explain with AI, save ScheduleProposal.',
      ],
      [
        'Accept schedule',
        'POST /api/schedule/proposals/:id/accept',
        'Require explicit approval, recheck availability/conflicts, create CalendarEvents transactionally where supported.',
      ],
      [
        'Ask assistant',
        'POST /api/assistant',
        'Classify request, retrieve user-scoped context, call AI, return answer, sources, metadata, and supported actions.',
      ],
    ],
    [2200, 2400, 4400],
  ),
);

section(
  '17. ERROR HANDLING',
  bullet(
    'Frontend services normalize API errors through getErrorMessage and feature pages show error states or alerts.',
  ),
  bullet(
    'Invalid uploads are rejected in the browser and again by Multer. Oversized files return 413; invalid type returns 400; failed processing removes the stored file when possible.',
  ),
  bullet(
    'Controllers return 400 for invalid fields/IDs, 401 for authentication failures, 404 for missing owned records, 409 for conflicts or in-progress operations, and pass unexpected errors to errorHandler.',
  ),
  bullet(
    'AI errors have explicit codes for not configured, timeout, rate limited, provider unavailable, invalid response, and validation problems. Optional fallback providers are used only for eligible provider failures.',
  ),
  bullet('Document AI retries once if the response is not valid for the required JSON contract.'),
  bullet(
    'Scheduling uses deterministic fallback durations and explanations when AI estimation/explanation fails, so basic scheduling can remain usable.',
  ),
  bullet(
    'Missing MongoDB/AI configuration is reflected by health/config behavior; exact deployment behavior depends on environment variables.',
  ),
);

section(
  '18. IMPORTANT LIBRARIES',
  table(
    ['Package', 'What it does', 'Why this project uses it'],
    [
      ['react, react-dom', 'UI rendering.', 'Builds the browser application.'],
      [
        'react-router-dom',
        'Frontend routes.',
        'Maps URLs such as /app/documents and /app/calendar to pages.',
      ],
      ['axios', 'HTTP client.', 'Sends authenticated frontend requests to the API.'],
      ['framer-motion', 'Animations.', 'Used for modal/drawer transitions.'],
      ['lucide-react', 'Icons.', 'Keeps controls visually consistent.'],
      ['express', 'Backend web framework.', 'Defines API middleware and routes.'],
      ['mongoose', 'MongoDB ODM.', 'Schemas, validation, indexes, and queries.'],
      ['jsonwebtoken', 'JWT signing/verification.', 'Authenticates protected API requests.'],
      ['bcrypt', 'Password hashing.', 'Protects local account passwords.'],
      ['multer', 'Multipart upload handling.', 'Receives PDF/image files safely.'],
      ['pdf-parse', 'PDF extraction.', 'Reads text and tables.'],
      ['sharp', 'Image processing/metadata.', 'Validates uploaded images before OCR.'],
      ['tesseract.js', 'OCR.', 'Reads English text in images.'],
      [
        'groq-sdk, @google/generative-ai',
        'AI provider clients.',
        'Support configured Groq and Gemini generation.',
      ],
      [
        'google-auth-library, @react-oauth/google',
        'Google authentication.',
        'Verifies and starts Google sign-in.',
      ],
      ['docx', 'Word document generation.', 'Used for generated documents and this guide.'],
    ],
  ),
);

section(
  '19. WHY DID WE CHOOSE THIS ARCHITECTURE?',
  table(
    ['Decision', 'Simple reason'],
    [
      [
        'React + components',
        'The product has many screens and repeated controls. Components make UI easier to reuse and change.',
      ],
      ['Vite', 'Fast local development and a simple production build.'],
      [
        'Node + Express',
        'JavaScript across frontend and backend, with straightforward REST routes.',
      ],
      [
        'MongoDB + Mongoose',
        'Documents, analysis objects, tasks, reminders, and settings have flexible nested data.',
      ],
      [
        'JWT + bcrypt',
        'JWT keeps API authentication simple; bcrypt prevents storing raw passwords.',
      ],
      [
        'Separate AI service',
        'Provider switching, validation, timeout, fallback, and error mapping stay in one place.',
      ],
      ['OCR', 'Images often contain useful printed text but do not provide selectable text.'],
      ['REST APIs', 'Frontend and backend have a clear contract and can be deployed separately.'],
      [
        'User-scoped queries',
        'A personal administration tool must keep one user’s records separate from another user’s.',
      ],
      [
        'Review before schedule acceptance',
        'AI can suggest, but the user should approve calendar changes.',
      ],
    ],
  ),
);

section(
  '20. QUESTIONS MY TEAM LEAD MAY ASK',
  ...[
    [
      'Why React?',
      'The application has many interactive screens and reusable controls, so React lets us split the interface into manageable components.',
    ],
    [
      'Why Vite?',
      'It gives fast development feedback and a simple production build for the React frontend.',
    ],
    [
      'Why MongoDB?',
      'The project stores flexible records such as documents with nested AI analysis, tasks, reminders, and settings, which fit MongoDB well.',
    ],
    [
      'Why Mongoose?',
      'It gives those MongoDB records schemas, validation, indexes, and a consistent query API.',
    ],
    [
      'Why Express?',
      'It provides a small, clear way to define REST routes, middleware, and JSON responses.',
    ],
    [
      'Why JWT?',
      'The server can verify a signed user token on each protected request without keeping a server-side session table.',
    ],
    [
      'Why bcrypt?',
      'We never want the real local password stored in the database; bcrypt stores a one-way hash.',
    ],
    [
      'How is user data separated?',
      'Protected routes load the user from the token, and database queries include that user’s ID.',
    ],
    [
      'Which AI provider do we use?',
      'The code supports Groq and Gemini. The active provider and exact model come from environment variables, so I would show the configured deployment value rather than guess.',
    ],
    [
      'Why not call AI everywhere directly?',
      'The provider service centralizes prompts, timeouts, validation, fallback, and provider switching.',
    ],
    [
      'What happens if AI is not configured?',
      'The API can start, but AI analysis and AI explanations are unavailable; the application reports that state.',
    ],
    [
      'How is a PDF processed?',
      'The server validates it, extracts text and tables with pdf-parse, stores the text, then sends it to document analysis.',
    ],
    [
      'How is an image processed?',
      'Sharp validates the image and Tesseract.js performs English OCR.',
    ],
    [
      'Does OCR support handwriting?',
      'The code verifies English OCR for supported image formats; handwriting support is not something I would promise without testing.',
    ],
    [
      'How do you validate AI output?',
      'The response is parsed as JSON and checked against a schema and allowed values; document analysis retries once if the format is invalid.',
    ],
    [
      'Can AI invent a deadline?',
      'Prompts explicitly forbid invention and validators enforce the shape, but semantic mistakes remain possible, so the product includes review/confirmation.',
    ],
    [
      'How are tasks created from documents?',
      'AI returns extracted actions, the user can confirm analysis, and task generation validates actions, avoids duplicate titles, and saves Task records.',
    ],
    [
      'Can users create tasks manually?',
      'Yes. The Tasks page and task routes support manual creation and editing.',
    ],
    [
      'How does priority work?',
      'Tasks store priority plus calculated score and reasons; scheduling uses overdue state, priority, deadline, and score.',
    ],
    [
      'What is the difference between a task and a reminder?',
      'A task is work to complete; a reminder is a time-based signal connected to a date and time.',
    ],
    [
      'How does scheduling work?',
      'It starts with saved availability, removes busy time, ranks open tasks, estimates durations, and creates a reviewable proposal.',
    ],
    [
      'Does AI choose calendar times?',
      'The main time placement is deterministic. AI may estimate duration and explain the result, but it is instructed not to change times.',
    ],
    [
      'Why require acceptance?',
      'The user should approve a proposal before real calendar blocks are created.',
    ],
    [
      'What if a task does not fit?',
      'The proposal contains a warning explaining that the user should extend the period, increase availability, or reduce duration.',
    ],
    [
      'Does the assistant have live internet access?',
      'No. The code explicitly says live web/local-business search is unavailable.',
    ],
    [
      'How does the assistant use documents?',
      'It retrieves user-owned document knowledge and can use a selected document plus recent conversation context.',
    ],
    [
      'What happens when the assistant cannot find workspace data?',
      'It uses a clear fallback saying it could not find the information and avoids inventing it.',
    ],
    [
      'How are reminders connected to notifications?',
      'Reminder records are stored separately; notification scheduler logic creates notification records according to user settings and timing.',
    ],
    [
      'What happens if MongoDB is down?',
      'Database operations fail through the API error path and the health endpoint reports the database state; a live deployment test is needed for the exact user-facing screen.',
    ],
    [
      'How would you scale this system?',
      'Move private uploads to shared object storage, run background jobs for OCR/AI/notifications, add indexes and observability, and keep user-scoped queries.',
    ],
    [
      'What would you improve next?',
      'I would add stronger async job status, more automated end-to-end coverage, richer search ranking, and clearer AI confidence/review UX.',
    ],
    [
      'What is the biggest limitation?',
      'AI quality depends on provider configuration and source text quality. Valid JSON does not guarantee a perfectly correct interpretation.',
    ],
  ].map(([q, a]) => [heading(`Team Lead: “${q}”`, HeadingLevel.HEADING_3), p(`Me: “${a}”`)]),
);

section(
  '21. 2-MINUTE PROJECT PRESENTATION SCRIPT',
  p(
    'LifeAdmin AI is a personal administration workspace that helps a user turn documents, notes, tasks, reminders, and calendar information into clear next actions. The problem is that important information is usually spread across PDFs, images, messages, and separate reminder systems. Our application gives the user one place to store and organize it.',
  ),
  p(
    'The frontend is React with Vite. The backend is Node.js with Express, and MongoDB stores the user’s data through Mongoose. The frontend talks to the backend through REST APIs, and protected requests use JWT authentication. Local passwords are hashed with bcrypt, and Google sign-in is also implemented.',
  ),
  p(
    'The main intake feature accepts PDFs, images, pasted text, and manual entries. PDFs are processed with pdf-parse. Images are checked with Sharp and read with Tesseract OCR. The extracted text is saved in a Document record and sent through an AI service. The active AI provider is configured through environment variables and the code supports Groq and Gemini, including timeouts and an optional fallback.',
  ),
  p(
    'Document AI returns structured information such as a summary, category, important dates, actions, key information, and risks. The response is validated before it is saved, and actions can become tasks. Tasks have status, priority, due date, duration, and a document relationship. Reminders are separate time-based records, and notifications inform the user about important events.',
  ),
  p(
    'Calendar includes Smart Scheduling. The user saves working hours and timezone, then the scheduler ranks tasks, removes busy time, estimates missing durations, and creates a proposal. AI can explain the proposal, but the user must review and accept it before calendar blocks are created. Ask LifeAdmin answers general questions and workspace questions using user-scoped context, but it does not have live web search.',
  ),
  p(
    'The main future improvements would be more background processing for long OCR and AI jobs, more production monitoring, stronger search ranking, and more visible confidence and review controls. The important point is that AI assists the workflow, while validation and user approval keep important changes controlled.',
  ),
);

section(
  '22. 5-MINUTE DETAILED PRESENTATION SCRIPT',
  p(
    'I would start by saying that LifeAdmin AI is not only a chatbot. It is a personal administration system. It stores information, understands useful parts of that information, turns obligations into tasks, tracks time-based reminders, and helps plan work.',
  ),
  p(
    'The application has a React frontend and an Express backend. The frontend is organized into pages and reusable components. AppShell provides the protected application layout, AuthContext manages the current login, AppContext shares workspace data, and feature service files call the REST API. The backend is organized into routes, controllers, services, models, middleware, and configuration. This keeps UI code separate from business rules and database code.',
  ),
  p(
    'The first major workflow is adding information. A user can upload a PDF or image, paste text, or create a manual entry. The browser gives immediate validation, but the server validates again because browser validation cannot be trusted. Multer accepts only one supported file and limits it to 10 MB. The file is stored privately with a generated filename.',
  ),
  p(
    'For PDFs, pdf-parse extracts text and tables and the service cleans whitespace and adds page markers for long documents. For images, Sharp checks the image and Tesseract.js performs English OCR. The result becomes extractedText on the Document model. The document also stores its source type, category, private file path, and processing state.',
  ),
  p(
    'The AI service is intentionally separate. It accepts a prompt, validates its options, selects the configured provider, enforces a timeout, rejects empty output, and can use a fallback provider for certain failures. The document AI prompt is strict: it tells the model to use only source evidence and return valid JSON. A validator then checks the response. Long documents are analyzed in chunks and merged.',
  ),
  p(
    'The structured analysis can contain a summary, actionRequired, dates, actions, priority, key information, and risks. A review flow supports confirmation or rejection. Task generation validates the actions and avoids duplicate task titles for the same document. Tasks also support manual creation and editing. They store status, priority, due date, estimated duration, and source.',
  ),
  p(
    'Reminders are separate from tasks. A task means work; a reminder means a time signal. Notifications are generated as user-scoped Notification records according to notification settings. The dashboard and daily briefing combine these records into a quick overview.',
  ),
  p(
    'The Calendar page includes a month timeline and Smart Scheduling. Availability is saved per user with timezone, working days, and time ranges. The scheduler starts with open tasks, uses stored or AI-estimated durations, subtracts existing calendar blocks and busy time, and ranks work using overdue state, priority, due dates, and scores. It produces a ScheduleProposal with blocks and warnings. The user reviews it, can edit pending times, and accepts it. Acceptance creates CalendarEvent records; generation alone does not change the calendar.',
  ),
  p(
    'Ask LifeAdmin routes questions. It distinguishes general knowledge from workspace questions, retrieves documents/tasks/reminders/calendar/memory context when appropriate, and uses conversation history. It has safety rules against inventing workspace data or exposing secrets. It does not provide live internet or local business search.',
  ),
  p(
    'For security, local passwords use bcrypt, protected APIs use JWT, Google credentials are verified by the backend, and most records are filtered by the authenticated user ID. The deployment configuration requires MongoDB, JWT, CORS, Google OAuth, and AI settings. Missing AI configuration does not stop the basic API, but AI behavior is unavailable.',
  ),
  p(
    'The strongest future improvements would be background job processing, observability, more complete end-to-end tests, richer search, clearer AI confidence, and moving private uploads to shared object storage before horizontal scaling.',
  ),
);

section(
  '23. IF HE ASKS ME TO SHOW THE CODE',
  ...[
    [
      'Open src/App.jsx',
      'Show the route map and point out protected /app routes such as documents, tasks, calendar, ask, settings, and add.',
    ],
    [
      'Open src/components/AppShell.jsx',
      'Explain the shared navigation shell, protected layout, and where page content is rendered.',
    ],
    [
      'Open src/context/AuthContext.jsx and src/services/api.js',
      'Show how login state and authenticated API requests are handled.',
    ],
    [
      'Open src/pages/AddInformation.jsx',
      'Show the four input modes and that the page calls documentService rather than inventing upload behavior.',
    ],
    [
      'Open server/src/routes/documentRoutes.js',
      'Show route protection, upload middleware, analysis, chat, generated documents, and CRUD endpoints.',
    ],
    [
      'Open server/src/controllers/documentController.js',
      'Walk through validation, upload extraction, Document.create, knowledge indexing, automation, and the response.',
    ],
    [
      'Open server/src/services/pdfExtractionService.js and ocrService.js',
      'Explain PDF text/table extraction and image OCR.',
    ],
    [
      'Open server/src/services/documentAiService.js and aiAnalysisValidator.js',
      'Show the prompt, JSON schema, chunking, retry, and validation.',
    ],
    [
      'Open server/src/models/Document.js and Task.js',
      'Show the stored fields and document-to-task relationship.',
    ],
    [
      'Open server/src/services/schedulingService.js and src/components/SchedulePanel.jsx',
      'Explain availability, deterministic scheduling, proposal review, and acceptance.',
    ],
    [
      'Open server/src/services/assistantService.js',
      'Show workspace/general routing, retrieval rules, safety instructions, and no-live-web limitation.',
    ],
    [
      'Open DEPLOYMENT.md',
      'Show the real environment variables and private-upload deployment requirements.',
    ],
  ].map(([a, b], i) => [p(`${i + 1}. ${a}`, { bold: true }), p(b)]),
);

section(
  '24. LIVE DEMO FLOW',
  ...[
    [
      'Login',
      'Say: “I will start with authentication. The app supports local login and Google login, and protected API calls use the returned token.”',
    ],
    [
      'Dashboard',
      'Say: “This is the quick overview of documents, tasks, reminders, deadlines, notifications, and briefing information.”',
    ],
    [
      'Add Information',
      'Upload a small text-based PDF or use paste text. Say: “The server validates the file, extracts text, stores the document, and starts automation.”',
    ],
    [
      'Document detail/intelligence',
      'Show extracted content and analysis when AI credentials are configured. Say: “The result is structured rather than just raw text.”',
    ],
    [
      'Review and task creation',
      'Show extracted actions and task creation. Say: “The system keeps AI actions reviewable and links generated tasks back to the document.”',
    ],
    ['Tasks', 'Show status, priority, due date, and duration. Complete or edit a safe test task.'],
    [
      'Reminders and notifications',
      'Show a real reminder and notification if the environment has them. Explain the task/reminder difference.',
    ],
    [
      'Calendar',
      'Show month deadlines, then Smart Scheduling. Save availability, select planning period, generate a proposal, review it, and accept only if using safe test data.',
    ],
    [
      'Search',
      'Search for a document/task phrase that exists in the demo data. Say: “Search uses stored workspace knowledge and user-scoped retrieval.”',
    ],
    [
      'Ask LifeAdmin',
      'Ask “What tasks are due soon?” or refer to a selected document. Say: “The assistant uses workspace context when the question needs it and does not claim live web access.”',
    ],
    ['Settings/privacy', 'Show profile, notifications, memory controls, and privacy actions.'],
  ].map(([a, b], i) => [p(`${i + 1}. ${a}`, { bold: true }), p(b)]),
  p(
    'Demo warning: AI pages, OCR, Google login, notifications, and generated documents depend on configured environment variables and available data. Prepare a known-good test account and sample file before the meeting.',
  ),
);

section(
  '25. WHAT I MUST MEMORIZE',
  table(
    ['Item', 'Remember'],
    [
      ['Frontend', 'React + Vite'],
      ['Backend', 'Node.js + Express REST API'],
      ['Database', 'MongoDB through Mongoose'],
      ['Authentication', 'JWT, bcrypt, and verified Google OAuth'],
      [
        'AI',
        'Groq or Gemini selected by environment configuration; exact model is deployment-specific',
      ],
      [
        'File processing',
        'Multer validation/storage, pdf-parse for PDFs, Sharp + Tesseract.js for images',
      ],
      ['Document intelligence', 'Extracted text -> strict AI JSON -> validation -> analysis/tasks'],
      [
        'Scheduling',
        'Availability + task ranking + conflict removal -> reviewable proposal -> user acceptance',
      ],
      ['Assistant', 'Workspace/general routing with user-scoped retrieval; no live web search'],
    ],
  ),
  heading('Main flow to remember', HeadingLevel.HEADING_2),
  code(
    'User -> React -> service/API -> Express route -> controller/service -> MongoDB/AI -> JSON -> React UI',
  ),
  heading('Ten important WHY answers', HeadingLevel.HEADING_2),
  bullet('Why React? Reusable interactive screens.'),
  bullet('Why Express? Simple REST API and middleware.'),
  bullet('Why MongoDB? Flexible nested workspace records.'),
  bullet('Why Mongoose? Validation and indexes around MongoDB.'),
  bullet('Why JWT? Stateless protected requests.'),
  bullet('Why bcrypt? Never store plain local passwords.'),
  bullet('Why OCR? Make image text usable.'),
  bullet('Why an AI service layer? One place for provider choice and reliability rules.'),
  bullet('Why validate AI JSON? Keep model output safe for application logic.'),
  bullet('Why require schedule acceptance? AI suggests; the user controls real calendar changes.'),
  heading('Team Lead Quick Revision', HeadingLevel.HEADING_2),
  p(
    'LifeAdmin AI is a personal administration workspace, not just a chatbot. It accepts documents and other information, extracts text, uses AI to identify supported actions and dates, stores structured records, and connects them to tasks, reminders, notifications, search, and scheduling. React/Vite is the frontend; Express/Mongoose/MongoDB is the backend; JWT/bcrypt protect accounts; pdf-parse and Tesseract process files; Groq/Gemini are configurable AI providers. The scheduler is mainly deterministic and requires user acceptance. The assistant uses workspace context but has no live web search. AI quality depends on configuration and still needs user review.',
  ),
);

const document = new Document({
  creator: 'LifeAdmin AI',
  description: 'Code-grounded Team Lead Presentation Guide',
  styles: {
    default: {
      document: {
        run: { font: 'Aptos', size: 21, color: '20242B' },
        paragraph: { spacing: { line: 276 } },
      },
    },
    paragraphStyles: [
      {
        id: 'Code',
        name: 'Code',
        basedOn: 'Normal',
        run: { font: 'Consolas', size: 18, color: '1F4E79' },
        paragraph: {
          shading: { type: ShadingType.CLEAR, fill: 'F3F6FA' },
          indent: { left: 180, right: 180 },
        },
      },
    ],
  },
  sections: [
    {
      properties: {
        type: SectionType.CONTINUOUS,
        page: { margin: { top: 720, right: 900, bottom: 720, left: 900 } },
      },
      children,
    },
  ],
});

await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, await Packer.toBuffer(document));
console.log(output);
