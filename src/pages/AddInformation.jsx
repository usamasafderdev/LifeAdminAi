import { Check, FileImage, FileText, Keyboard, Plus, UploadCloud } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Badge, Button, Field, PageHeader, PriorityBadge } from '../components/UI';
import { useApp } from '../context/AppContext';
import { dueLabel, formatDate } from '../utils/dates';

const methods = [
  ['Document', FileText, 'PDF or TXT'],
  ['Image', FileImage, 'PNG, JPG or screenshot'],
  ['Paste text', Keyboard, 'Analyze copied information'],
  ['Manual entry', Plus, 'Create a structured record'],
];
export default function AddInformation() {
  const [params] = useSearchParams();
  const [method, setMethod] = useState(Number(params.get('method')) || 0),
    [stage, setStage] = useState('input'),
    [progress, setProgress] = useState(0);
  const timer = useRef();
  const nav = useNavigate();
  const { addDocument, setTasks, setReminders, notify } = useApp();
  const saveAnalysis = (data) => {
    const id = `doc-${Date.now()}`;
    const doc = { id, title: data.title, category: data.type.includes('University') ? 'University' : data.type === 'Bill' ? 'Bills' : 'Personal', type: data.type, date: formatDate(new Date().toISOString()), deadline: formatDate(data.deadline), deadlineDate: data.deadline, priority: data.priority, status: data.actionRequired ? 'Action needed' : 'Reviewed', summary: data.summary, amount: data.amount, consequence: data.consequence, actions: data.actions, items: data.actions };
    addDocument(doc);
    if (data.actionRequired) setTasks(v => [...data.actions.map((title, i) => ({ id: `task-${Date.now()}-${i}`, title, category: doc.category, description: `Generated from ${doc.title}`, date: data.deadline, due: dueLabel(data.deadline), priority: data.priority, systemPriority: data.priority, status: 'Pending', source: id, sourceDocumentId: id, aiGenerated: true })), ...v]);
    if (data.deadline) setReminders(v => [{ id: `rem-${Date.now()}`, title: doc.title, when: `${data.deadline}T09:00`, date: data.deadline, detail: `Due ${formatDate(data.deadline)}`, status: 'Upcoming', source: id, sourceDocumentId: id }, ...v]);
    notify('Information saved to LifeAdmin'); nav(`/app/documents/${id}`);
  };
  useEffect(() => () => clearInterval(timer.current), []);
  const process = () => {
    setStage('processing');
    setProgress(0);
    timer.current = setInterval(
      () =>
        setProgress((p) => {
          if (p >= 100) {
            clearInterval(timer.current);
            setTimeout(() => setStage('review'), 300);
            return 100;
          }
          return p + 20;
        }),
      350,
    );
  };
  if (stage === 'review')
    return (
      <Review
        onCancel={() => setStage('input')}
        onSave={saveAnalysis}
      />
    );
  return (
    <>
      <PageHeader
        title="Add Information"
        description="Turn documents, screenshots, text or manual entries into organized LifeAdmin data."
      />
      <div className="method-tabs">
        {methods.map(([name, Icon, desc], i) => (
          <button
            key={name}
            className={method === i ? 'active' : ''}
            onClick={() => {
              setMethod(i);
              setStage('input');
            }}
          >
            <Icon size={18} />
            <span>
              <strong>{name}</strong>
              <small>{desc}</small>
            </span>
          </button>
        ))}
      </div>
      <section className="panel add-panel">
        {stage === 'processing' ? (
          <Processing progress={progress} />
        ) : method < 2 ? (
          <Upload method={method} process={process} />
        ) : method === 2 ? (
          <Paste process={process} />
        ) : (
          <Manual onSave={(data) => { const id = `task-${Date.now()}`; setTasks(v => [{ id, ...data, due: dueLabel(data.date), status: 'Pending', source: null, systemPriority: data.priority }, ...v]); if (data.reminder) setReminders(v => [{ id: `rem-${Date.now()}`, title: data.title, date: data.date, when: `${data.date}T${data.time || '09:00'}`, detail: data.notes || 'Manual reminder', status: 'Upcoming', taskId: id }, ...v]); notify('Manual entry saved'); nav('/app/tasks'); }} />
        )}
      </section>
    </>
  );
}

function Upload({ method, process }) {
  const [file, setFile] = useState(null);
  return (
    <div className="upload-content">
      <div
        className="dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          setFile(e.dataTransfer.files[0]);
        }}
      >
        <UploadCloud size={28} />
        <h2>Drop your {method ? 'image' : 'document'} here</h2>
        <p>or click to browse from your computer</p>
        <label className="btn btn-secondary">
          Browse files
          <input
            type="file"
            accept={method ? 'image/png,image/jpeg' : '.pdf,.txt'}
            hidden
            onChange={(e) => setFile(e.target.files[0])}
          />
        </label>
        <small>{method ? 'PNG, JPG or JPEG' : 'PDF or TXT'} · Maximum 10 MB</small>
      </div>
      {file && (
        <div className="selected-file">
          <FileText />
          <div>
            <strong>{file.name}</strong>
            <span>{(file.size / 1024).toFixed(0)} KB · Ready to analyze</span>
          </div>
          <Badge tone="success">Ready</Badge>
        </div>
      )}
      <div className="panel-footer">
        <Button disabled={!file} onClick={process}>
          Analyze {method ? 'image' : 'document'}
        </Button>
      </div>
    </div>
  );
}
function Paste({ process }) {
  const [text, setText] = useState('');
  return (
    <div className="paste-form">
      <Field label="Information to analyze">
        <textarea
          rows="10"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Please submit your internship report before September 10."
        />
        <small className="char-count">{text.length} characters</small>
      </Field>
      <div className="panel-footer">
        <Button disabled={text.length < 10} onClick={process}>
          Analyze Information
        </Button>
      </div>
    </div>
  );
}
function Manual({ onSave }) {
  return (
    <form
      className="modal-form wide"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget); onSave(Object.fromEntries(fd.entries()));
      }}
    >
      <div className="form-grid">
        <Field label="Title">
          <input name="title" required placeholder="Dentist Appointment" />
        </Field>
        <Field label="Category">
          <select name="category">
            <option>Appointment</option>
            <option>University</option>
            <option>Bills</option>
            <option>Personal</option>
          </select>
        </Field>
        <Field label="Date">
          <input name="date" type="date" required />
        </Field>
        <Field label="Time">
          <input name="time" type="time" />
        </Field>
        <Field label="Amount">
          <input name="amount" placeholder="PKR 0" />
        </Field>
        <Field label="Priority">
          <select name="priority">
            <option>MEDIUM</option>
            <option>URGENT</option>
            <option>HIGH</option>
            <option>LOW</option>
          </select>
        </Field>
      </div>
      <Field label="Notes">
        <textarea name="notes" placeholder="Add any useful context" />
      </Field>
      <label className="checkbox">
        <input name="reminder" value="true" type="checkbox" defaultChecked /> Create a reminder
      </label>
      <div className="panel-footer">
        <Button>Save information</Button>
      </div>
    </form>
  );
}
function Processing({ progress }) {
  const steps = [
    'Uploading',
    'Extracting text',
    'Identifying important information',
    'Preparing review',
    'Complete',
  ];
  return (
    <div className="processing">
      <div className="processing-mark">
        <FileText />
      </div>
      <h2>Organizing your information</h2>
      <p>Keep this window open for a moment.</p>
      <div className="process-bar">
        <i style={{ width: `${progress}%` }} />
      </div>
      <div className="process-steps">
        {steps.map((s, i) => (
          <div className={progress >= i * 25 ? 'active' : ''} key={s}>
            <span>{progress > i * 25 ? <Check size={13} /> : i + 1}</span>
            <p>{s}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
function Review({ onCancel, onSave }) {
  const [data, setData] = useState({ type: 'University Notice', priority: 'HIGH', title: 'Fall Semester Registration', deadline: '2026-09-05', amount: 'PKR 5,000', actionRequired: true, summary: 'Students must complete registration before September 5.', consequence: 'Registration may be blocked', actions: ['Pay registration fee','Complete registration form','Prepare CNIC copy','Submit documents'] });
  const change = (key, value) => setData(v => ({ ...v, [key]: value }));
  return (
    <>
      <PageHeader
        title="Review AI Analysis"
        description="LifeAdmin extracted the following information. Review it before saving."
      />
      <div className="review-layout">
        <section className="panel review-form">
          <div className="review-notice">
            AI-generated information should be reviewed before confirmation.
          </div>
          <div className="form-grid">
            <Field label="Document type">
              <select value={data.type} onChange={e => change('type', e.target.value)}>
                <option>University Notice</option>
                <option>Bill</option>
                <option>Contract</option>
              </select>
            </Field>
            <Field label="Suggested priority">
              <select value={data.priority} onChange={e => change('priority', e.target.value)}>
                <option>URGENT</option>
                <option>HIGH</option>
                <option>MEDIUM</option>
              </select>
            </Field>
            <Field label="Title">
              <input value={data.title} onChange={e => change('title', e.target.value)} />
            </Field>
            <Field label="Deadline">
              <input type="date" value={data.deadline} onChange={e => change('deadline', e.target.value)} />
            </Field>
            <Field label="Amount">
              <input value={data.amount} onChange={e => change('amount', e.target.value)} />
            </Field>
            <Field label="Action required">
              <select value={data.actionRequired ? 'Yes' : 'No'} onChange={e => change('actionRequired', e.target.value === 'Yes')}>
                <option>Yes</option><option>No</option>
              </select>
            </Field>
          </div>
          <Field label="Summary">
            <textarea value={data.summary} onChange={e => change('summary', e.target.value)} />
          </Field>
          <Field label="Consequence">
            <input value={data.consequence} onChange={e => change('consequence', e.target.value)} />
          </Field>
          <Field label="Required actions">
            <textarea value={data.actions.join('\n')} onChange={e => change('actions', e.target.value.split('\n').filter(Boolean))} />
          </Field>
          <div className="panel-footer">
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button variant="secondary" onClick={() => onSave({ ...data, actionRequired: false })}>Save Draft</Button>
            <Button onClick={() => onSave(data)}>Confirm & Save</Button>
          </div>
        </section>
        <aside className="panel review-summary">
          <span>ANALYSIS SUMMARY</span>
          <h3>4 actions identified</h3>
          <p>A deadline, fee, consequence and four required actions will be added to LifeAdmin.</p>
          <dl>
            <dt>Confidence</dt>
            <dd>High</dd>
            <dt>Source quality</dt>
            <dd>Clear</dd>
            <dt>Suggested priority</dt>
            <dd>
              <PriorityBadge priority="HIGH" />
            </dd>
          </dl>
        </aside>
      </div>
    </>
  );
}
