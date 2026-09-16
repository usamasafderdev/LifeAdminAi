import { NotificationSettings } from '../components/NotificationCenter';
import { DailyBriefingSettings } from '../components/DailyBriefingCard';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bell,
  Bot,
  CheckCircle2,
  Download,
  Monitor,
  Moon,
  Palette,
  Shield,
  Sun,
  UserRound,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { Avatar, Button, Field, Modal, PageHeader, Toggle } from '../components/UI';
import { settingsService } from '../services/settingsService';
import { privacyService } from '../services/privacyService';

const sections = [
  ['Profile', UserRound],
  ['Reminder preferences', Bell],
  ['AI settings', Bot],
  ['Daily briefing', Bot],
  ['Notifications', Bell],
  ['Appearance', Palette],
  ['Privacy & data', Shield],
];
export default function Settings() {
  const [active, setActive] = useState('Profile');
  const [ai, setAi] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const { theme, setTheme, notify } = useApp();
  const { user } = useAuth();
  useEffect(() => {
    if (active !== 'AI settings' || ai || aiLoading) return;
    setAiLoading(true);
    settingsService
      .ai()
      .then(setAi)
      .catch((error) => setAiError(error.response?.data?.message || 'Unable to load AI settings.'))
      .finally(() => setAiLoading(false));
  }, [active, ai, aiLoading]);
  return (
    <>
      <PageHeader title="Settings" description="Manage your account, preferences and data." />
      <div className="settings-layout">
        <nav className="settings-nav">
          <Link className="memory-settings-link" to="/app/settings/memory">
            <Bot />
            Memory
          </Link>
          {sections.map(([x, I]) => (
            <button className={active === x ? 'active' : ''} key={x} onClick={() => setActive(x)}>
              <I />
              {x}
            </button>
          ))}
        </nav>
        <section className="panel settings-panel">
          {active === 'Daily briefing' && <DailyBriefingSettings />}
          {active === 'Profile' && (
            <>
              <SettingHead title="Profile" text="Update your personal details and timezone." />
              <div className="profile-edit">
                <Avatar user={user} size="large" />
                <div>
                  <strong>{user?.fullName}</strong>
                  <small>{user?.email}</small>
                </div>
              </div>
              <div className="form-grid">
                <Field label="Full name">
                  <input defaultValue={user?.fullName} />
                </Field>
                <Field label="Email">
                  <input defaultValue={user?.email} />
                </Field>
                <Field label="Timezone">
                  <select defaultValue="Asia/Karachi">
                    <option>Asia/Karachi</option>
                    <option>UTC</option>
                    <option>Europe/London</option>
                  </select>
                </Field>
              </div>
              <Save notify={notify} />
            </>
          )}
          {active === 'Reminder preferences' && (
            <>
              <SettingHead
                title="Reminder preferences"
                text="Choose when LifeAdmin should remind you by default."
              />
              <ToggleList
                labels={['7 days before', '3 days before', '1 day before', 'On the due date']}
              />
              <Save notify={notify} />
            </>
          )}
          {active === 'AI settings' && (
            <>
              <SettingHead
                title="AI settings"
                text="Ask LifeAdmin and document assistance use this server-managed provider configuration."
              />
              {aiLoading && (
                <div className="ai-settings-state">Checking the configured AI provider...</div>
              )}
              {aiError && (
                <div className="ai-settings-state error">
                  <AlertTriangle />
                  {aiError}
                </div>
              )}
              {ai && <AiSettingsPanel ai={ai} />}
            </>
          )}
          {active === 'Notifications' && <NotificationSettings />}
          {active === 'Appearance' && (
            <>
              <SettingHead title="Appearance" text="Choose how LifeAdmin looks on this device." />
              <div className="theme-options">
                {[
                  ['light', Sun, 'Light'],
                  ['dark', Moon, 'Dark'],
                  ['system', Monitor, 'System'],
                ].map(([v, I, l]) => (
                  <button
                    className={theme === v ? 'active' : ''}
                    key={v}
                    onClick={() => setTheme(v)}
                  >
                    <I />
                    <strong>{l}</strong>
                    <small>{v === 'system' ? 'Match your device' : `${l} interface`}</small>
                  </button>
                ))}
              </div>
            </>
          )}
          {active === 'Privacy & data' && <PrivacySettings notify={notify} />}
        </section>
      </div>
    </>
  );
}
function AiSettingsPanel({ ai }) {
  const providerName = ai.provider
    ? ai.provider[0].toUpperCase() + ai.provider.slice(1)
    : 'Not configured';
  const status = ai.status || (ai.configured ? 'connected' : 'not_configured');
  const statusDetails = {
    connected: {
      label: 'Connected',
      icon: CheckCircle2,
      text: ai.message || `${providerName} is ready to answer questions.`,
    },
    not_configured: {
      label: 'Not configured',
      icon: XCircle,
      text: ai.message || 'Configure an AI provider to enable AI features.',
    },
    error: {
      label: 'Connection error',
      icon: AlertTriangle,
      text: ai.message || 'The configured AI provider could not be reached.',
    },
  }[status] || {
    label: status,
    icon: AlertTriangle,
    text: ai.message || 'AI provider status unavailable.',
  };
  const StatusIcon = statusDetails.icon;
  return (
    <div className="ai-settings-panel">
      <div className="ai-settings-grid">
        <div className="ai-setting-field">
          <span>AI provider</span>
          <strong>{providerName}</strong>
          <small>
            {ai.provider === 'gemini'
              ? 'Google Gemini AI provider'
              : ai.provider === 'groq'
                ? 'Groq AI provider'
                : 'No provider is configured on the server.'}
          </small>
        </div>
        <div className="ai-setting-field">
          <span>Model</span>
          <strong>{ai.model || 'Not configured'}</strong>
          <small>
            {ai.model ? 'Active model from server configuration' : 'A provider model is required.'}
          </small>
        </div>
      </div>
      <div className={`ai-status-card ${status}`}>
        <StatusIcon />
        <div>
          <strong>{statusDetails.label}</strong>
          <span>{statusDetails.text}</span>
        </div>
      </div>
      <div className="ai-capabilities">
        <span>Capabilities</span>
        {[
          'Ask LifeAdmin',
          'General AI knowledge',
          'Document assistance',
          'Document explanations',
        ].map((capability) => (
          <div key={capability}>
            <CheckCircle2 />
            {capability}
          </div>
        ))}
      </div>
      <p className="ai-settings-note">
        <Shield />
        Provider configuration is managed securely on the server. API keys are never returned to the
        browser.
      </p>
    </div>
  );
}
function SettingHead({ title, text }) {
  return (
    <div className="settings-head">
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}
function ToggleList({ labels }) {
  const [values, setValues] = useState(labels.map(() => true));
  return (
    <div className="toggle-list">
      {labels.map((x, i) => (
        <Toggle
          key={x}
          label={x}
          checked={values[i]}
          onChange={(v) => setValues((a) => a.map((x, j) => (j === i ? v : x)))}
        />
      ))}
    </div>
  );
}
function Save({ notify }) {
  const [saving, setSaving] = useState(false);
  const save = () => {
    setSaving(true);
    window.setTimeout(() => {
      setSaving(false);
      notify('Settings saved');
    }, 650);
  };
  return (
    <div className="settings-save">
      <Button disabled={saving} onClick={save}>
        {saving ? (
          <>
            <span className="button-spinner" />
            Saving...
          </>
        ) : (
          'Save changes'
        )}
      </Button>
    </div>
  );
}
function TrashIcon() {
  return <Shield />;
}

function PrivacySettings({ notify }) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [action, setAction] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState('');

  const close = (force = false) => {
    if (busy && !force) return;
    setAction(null);
    setError('');
    setConfirmation('');
  };
  const runExport = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await privacyService.exportData();
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      const disposition = response.headers['content-disposition'] || '';
      const filename =
        disposition.match(/filename="?([^";]+)"?/i)?.[1] ||
        `lifeadmin-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      notify('Your data has been exported.');
      close(true);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to export your data.');
    } finally {
      setBusy(false);
    }
  };
  const runClear = async () => {
    setBusy(true);
    setError('');
    try {
      await privacyService.clearChatHistory();
      window.dispatchEvent(new Event('lifeadmin-chat-cleared'));
      notify('Your chat history has been cleared.');
      close(true);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to clear chat history.');
    } finally {
      setBusy(false);
    }
  };
  const runDelete = async () => {
    setBusy(true);
    setError('');
    try {
      await privacyService.deleteAccount();
      await logout();
      window.sessionStorage.setItem(
        'la_account_deleted_message',
        'Your LifeAdmin account and associated data have been deleted.',
      );
      navigate('/login', { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to delete your account.');
      setBusy(false);
    }
  };
  return (
    <>
      <SettingHead
        title="Privacy & data"
        text="Manage your information and control what is stored in LifeAdmin."
      />
      <div className="privacy-actions">
        <PrivacyAction
          icon={Download}
          title="Export your data"
          text="Download a copy of your LifeAdmin information as a JSON file."
          action="Export your data"
          onClick={() => setAction('export')}
        />
        <PrivacyAction
          icon={TrashIcon}
          title="Clear chat history"
          text="Delete your Ask LifeAdmin conversations and messages. Tasks, documents, reminders, and account data are not affected."
          action="Clear chat history"
          onClick={() => setAction('clear')}
        />
        <PrivacyAction
          icon={Shield}
          title="Delete account"
          text="Permanently delete your account and all associated personal data. This action cannot be undone."
          action="Delete account"
          onClick={() => setAction('delete')}
          danger
        />
      </div>
      <Modal
        open={Boolean(action)}
        onClose={close}
        title={
          action === 'export'
            ? 'Export your data?'
            : action === 'clear'
              ? 'Clear chat history?'
              : 'Delete your LifeAdmin account?'
        }
      >
        <div className={`privacy-confirm ${action === 'delete' ? 'danger-confirm' : ''}`}>
          {action === 'export' && (
            <p>
              Your export will include your profile, preferences, tasks, reminders, calendar
              entries, document metadata, memories, notifications, briefings, and conversation
              history. Passwords, tokens, API keys, and server secrets are excluded.
            </p>
          )}
          {action === 'clear' && (
            <p>
              All Ask LifeAdmin conversations and messages will be permanently removed. Your tasks,
              documents, reminders, calendar data, memories, notifications, and account will not be
              affected.
            </p>
          )}
          {action === 'delete' && (
            <>
              <p>
                This permanently deletes your account and all associated personal data. This action
                cannot be undone.
              </p>
              <Field label="Type DELETE to confirm">
                <input
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  autoComplete="off"
                  autoFocus
                />
              </Field>
            </>
          )}
          {error && (
            <p className="privacy-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <Button variant="secondary" disabled={busy} onClick={close}>
              Cancel
            </Button>
            {action === 'export' && (
              <Button disabled={busy} onClick={runExport}>
                {busy ? 'Exporting...' : 'Export your data'}
              </Button>
            )}
            {action === 'clear' && (
              <Button variant="danger" disabled={busy} onClick={runClear}>
                {busy ? 'Clearing...' : 'Clear chat history'}
              </Button>
            )}
            {action === 'delete' && (
              <Button
                variant="danger"
                disabled={busy || confirmation !== 'DELETE'}
                onClick={runDelete}
              >
                {busy ? 'Deleting...' : 'Permanently delete account'}
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}

function PrivacyAction({ icon: Icon, title, text, action, onClick, danger = false }) {
  return (
    <article className={`privacy-action ${danger ? 'danger-zone' : ''}`}>
      <div className="privacy-action-copy">
        <span className="privacy-action-icon">
          <Icon />
        </span>
        <div>
          <strong>{title}</strong>
          <p>{text}</p>
        </div>
      </div>
      <Button variant={danger ? 'danger' : 'secondary'} onClick={onClick}>
        {action}
      </Button>
    </article>
  );
}
