import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, ConfirmDialog, Field, PageHeader } from '../components/UI';
import { memoryService } from '../services/memoryService';
import { getErrorMessage } from '../services/api';

const labels = {
  preference: 'Preference',
  personal: 'Personal information',
  working_context: 'Working context',
  decision: 'Important decision',
};
const date = (value) =>
  value
    ? new Date(value).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : 'Not used yet';
export default function MemorySettings() {
  const [data, setData] = useState(null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    const timer = window.setTimeout(
      () =>
        memoryService
          .list(query, page)
          .then((result) => {
            if (active) {
              setData(result);
              setError('');
            }
          })
          .catch((requestError) => {
            if (active) setError(getErrorMessage(requestError, 'Unable to load memories.'));
          })
          .finally(() => {
            if (active) setLoading(false);
          }),
      200,
    );
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, page, version]);
  const run = async (action) => {
    setBusy(true);
    setError('');
    try {
      await action();
      setVersion((value) => value + 1);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to update memories.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader
        title="Memory"
        description="Choose what LifeAdmin remembers across conversations."
        action={<Link to="/app/settings">Back to Settings</Link>}
      />
      <section className="panel memory-settings">
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <p>
          Only saved memories are used. New suggestions need your approval unless you enable
          automatic saving of simple answer-length preferences.
        </p>
        {data && (
          <div className="memory-settings-controls">
            <label>
              <input
                type="checkbox"
                checked={data.settings.enabled}
                disabled={busy || loading}
                onChange={(event) =>
                  run(() => memoryService.settings({ enabled: event.target.checked }))
                }
              />{' '}
              Enable personal memory
            </label>
            <label>
              <input
                type="checkbox"
                checked={data.settings.autoSavePreferences}
                disabled={busy || loading || !data.settings.enabled}
                onChange={(event) =>
                  run(() => memoryService.settings({ autoSavePreferences: event.target.checked }))
                }
              />{' '}
              Automatically save simple answer-length preferences
            </label>
            {!data.settings.enabled && (
              <p>
                Saved memories are retained, but will not be retrieved or added while memory is
                disabled.
              </p>
            )}
          </div>
        )}
        <Field label="Search memories">
          <input
            type="search"
            value={query}
            maxLength={200}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Search your saved preferences and context"
          />
        </Field>
        {loading ? (
          <p role="status">Loading memories…</p>
        ) : data?.memories.length ? (
          <div className="memory-list">
            {data.memories.map((item) => (
              <article className="memory-card" key={item._id}>
                {editing?._id === item._id ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      run(async () => {
                        await memoryService.edit(item._id, {
                          content: editing.content,
                          type: editing.type,
                        });
                        setEditing(null);
                      });
                    }}
                  >
                    <Field label="Memory type">
                      <select
                        value={editing.type}
                        onChange={(event) => setEditing({ ...editing, type: event.target.value })}
                      >
                        {Object.entries(labels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Memory">
                      <textarea
                        value={editing.content}
                        maxLength={400}
                        onChange={(event) =>
                          setEditing({ ...editing, content: event.target.value })
                        }
                      />
                    </Field>
                    <small>
                      Use a first-person statement, such as “I prefer concise explanations.”
                    </small>
                    <div className="memory-actions">
                      <Button disabled={busy}>Save changes</Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => setEditing(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : (
                  <>
                    <strong>{labels[item.type]}</strong>
                    <p>{item.content}</p>
                    <small>
                      Created: {date(item.createdAt)} · Last used: {date(item.lastUsedAt)} ·
                      Importance: {item.importance}
                    </small>
                    <div className="memory-actions">
                      <Button variant="secondary" disabled={busy} onClick={() => setEditing(item)}>
                        Edit
                      </Button>
                      <Button variant="secondary" disabled={busy} onClick={() => setConfirm(item)}>
                        Forget this
                      </Button>
                    </div>
                  </>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p>
            {query
              ? 'No matching memories.'
              : 'No saved memories yet. Share a preference in chat to receive a suggestion.'}
          </p>
        )}
        {data && (
          <div className="memory-actions">
            <Button
              variant="secondary"
              disabled={page <= 1 || busy || loading}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </Button>
            <span>
              Page {page} · {data.total} results
            </span>
            <Button
              variant="secondary"
              disabled={page * 25 >= data.total || busy || loading}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </Button>
            <Button
              variant="danger"
              disabled={!data.count || busy}
              onClick={() => setConfirm('all')}
            >
              Delete all memories
            </Button>
          </div>
        )}
        <p>
          Deleting memories does not delete the original chat messages. Clear the relevant chat
          separately if needed.
        </p>
      </section>
      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        busy={busy}
        title={confirm === 'all' ? 'Delete all memories?' : 'Forget this memory?'}
        text="This removes saved memory and invalidates outstanding memory suggestions."
        confirmLabel="Delete"
        onConfirm={() =>
          run(async () => {
            if (confirm === 'all') await memoryService.clear();
            else await memoryService.forget(confirm._id);
            setConfirm(null);
            setPage(1);
          })
        }
      />
    </>
  );
}
