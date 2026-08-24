import { Bell, Bot, Download, Monitor, Moon, Palette, Shield, Sun, UserRound } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { Button, Field, PageHeader, Toggle } from '../components/UI';

const sections = [
  ['Profile', UserRound],
  ['Reminder preferences', Bell],
  ['AI settings', Bot],
  ['Notifications', Bell],
  ['Appearance', Palette],
  ['Privacy & data', Shield],
];
export default function Settings() {
  const [active, setActive] = useState('Profile');
  const { theme, setTheme, notify } = useApp();
  const { user } = useAuth();
  const initials = (user?.fullName || 'LifeAdmin User').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  return (
    <>
      <PageHeader title="Settings" description="Manage your account, preferences and data." />
      <div className="settings-layout">
        <nav className="settings-nav">
          {sections.map(([x, I]) => (
            <button className={active === x ? 'active' : ''} key={x} onClick={() => setActive(x)}>
              <I />
              {x}
            </button>
          ))}
        </nav>
        <section className="panel settings-panel">
          {active === 'Profile' && (
            <>
              <SettingHead title="Profile" text="Update your personal details and timezone." />
              <div className="profile-edit">
                <span className="avatar large">{user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : initials}</span>
                <div><strong>{user?.fullName}</strong><small>{user?.email}</small></div>
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
                text="AI analysis is not connected in this milestone."
              />
              <div className="form-grid">
                <Field label="Provider">
                  <input value="Not configured" disabled />
                </Field>
                <Field label="Model">
                  <select disabled>
                    <option>Available in a future update</option>
                  </select>
                </Field>
              </div>
              <div className="info-note">
                <Bot />
                These controls will become available when document analysis is implemented.
              </div>
            </>
          )}
          {active === 'Notifications' && (
            <>
              <SettingHead
                title="Notifications"
                text="Control which events appear in your notification center."
              />
              <ToggleList
                labels={[
                  'In-app notifications',
                  'Deadline alerts',
                  'Priority changes',
                  'Reminder notifications',
                ]}
              />
              <Save notify={notify} />
            </>
          )}
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
          {active === 'Privacy & data' && (
            <>
              <SettingHead
                title="Privacy & data"
                text="Export your information or remove data from LifeAdmin."
              />
              <div className="data-actions">
                <div>
                  <span>
                    <Download />
                    <strong>Export your data</strong>
                  </span>
                  <Button variant="secondary" disabled title="Data export is not implemented yet">
                    Coming later
                  </Button>
                </div>
                <div>
                  <span>
                    <TrashIcon />
                    <strong>Clear chat history</strong>
                  </span>
                  <Button variant="secondary" disabled title="Chat history management is not implemented yet">
                    Coming later
                  </Button>
                </div>
                <div className="danger-zone">
                  <span>
                    <Shield />
                    <strong>Delete account</strong>
                  </span>
                  <Button variant="danger" disabled title="Account deletion is not implemented yet">
                    Unavailable
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </>
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
