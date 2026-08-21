import { Check, FileImage, FileText, Keyboard, Plus, UploadCloud } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Badge, Button, Field, PageHeader, PriorityBadge } from '../components/UI';
import { useApp } from '../context/AppContext';

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
  const { notify } = useApp();
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
        onSave={() => {
          notify('Information saved to LifeAdmin');
          nav('/app/documents');
        }}
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
          <Manual
            onSave={() => {
              notify('Manual entry saved');
              nav('/app/tasks');
            }}
          />
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
        onSave();
      }}
    >
      <div className="form-grid">
        <Field label="Title">
          <input required placeholder="Dentist Appointment" />
        </Field>
        <Field label="Category">
          <select>
            <option>Appointment</option>
            <option>University</option>
            <option>Bills</option>
            <option>Personal</option>
          </select>
        </Field>
        <Field label="Date">
          <input type="date" required />
        </Field>
        <Field label="Time">
          <input type="time" />
        </Field>
        <Field label="Amount">
          <input placeholder="PKR 0" />
        </Field>
        <Field label="Priority">
          <select>
            <option>MEDIUM</option>
            <option>URGENT</option>
            <option>HIGH</option>
            <option>LOW</option>
          </select>
        </Field>
      </div>
      <Field label="Notes">
        <textarea placeholder="Add any useful context" />
      </Field>
      <label className="checkbox">
        <input type="checkbox" defaultChecked /> Create a reminder
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
              <select defaultValue="University Notice">
                <option>University Notice</option>
                <option>Bill</option>
                <option>Contract</option>
              </select>
            </Field>
            <Field label="Suggested priority">
              <select defaultValue="HIGH">
                <option>URGENT</option>
                <option>HIGH</option>
                <option>MEDIUM</option>
              </select>
            </Field>
            <Field label="Title">
              <input defaultValue="Fall Semester Registration" />
            </Field>
            <Field label="Deadline">
              <input type="date" defaultValue="2026-09-05" />
            </Field>
            <Field label="Amount">
              <input defaultValue="PKR 5,000" />
            </Field>
            <Field label="Action required">
              <select>
                <option>Yes</option>
                <option>No</option>
              </select>
            </Field>
          </div>
          <Field label="Summary">
            <textarea defaultValue="Students must complete registration before September 5." />
          </Field>
          <Field label="Consequence">
            <input defaultValue="Registration may be blocked" />
          </Field>
          <Field label="Required actions">
            <textarea
              defaultValue={
                'Pay registration fee\nComplete registration form\nPrepare CNIC copy\nSubmit documents'
              }
            />
          </Field>
          <div className="panel-footer">
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button variant="secondary">Save Draft</Button>
            <Button onClick={onSave}>Confirm & Save</Button>
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
