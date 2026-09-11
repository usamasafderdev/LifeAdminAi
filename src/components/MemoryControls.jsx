import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { memoryService } from '../services/memoryService';
import { getErrorMessage } from '../services/api';

export function MemoryIndicator() {
  const [state, setState] = useState(null);
  useEffect(() => {
    let active = true;
    const refresh = () =>
      memoryService
        .list()
        .then((result) => {
          if (active) setState(result);
        })
        .catch(() => {
          if (active) setState(null);
        });
    refresh();
    window.addEventListener('lifeadmin-memory-changed', refresh);
    return () => {
      active = false;
      window.removeEventListener('lifeadmin-memory-changed', refresh);
    };
  }, []);
  return (
    <div className="memory-indicator">
      <span>
        {state
          ? state.settings.enabled
            ? `LifeAdmin remembers ${state.preferences} preference${state.preferences === 1 ? '' : 's'} · ${state.count} total memories`
            : 'Memory is disabled'
          : 'Personal memory'}
      </span>
      <Link to="/app/settings/memory">Manage memories</Link>
    </div>
  );
}

export function MemorySuggestions({ memory }) {
  const [suggestions, setSuggestions] = useState(memory?.suggestions || []);
  const [saved, setSaved] = useState(memory?.saved || []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    // External deletion/settings changes must remove stale cards and consent tokens.
    const reset = (event) => {
      if (event.detail?.kind !== 'save') {
        setSuggestions([]);
        setSaved([]);
      }
    };
    window.addEventListener('lifeadmin-memory-changed', reset);
    return () => window.removeEventListener('lifeadmin-memory-changed', reset);
  }, []);
  if (!suggestions.length && !saved.length && !error && !memory?.unavailable) return null;
  const save = async (suggestion) => {
    setBusy(true);
    setError('');
    try {
      const row = await memoryService.save(suggestion.token);
      setSuggestions((items) => items.filter((item) => item.token !== suggestion.token));
      setSaved((items) => [...items, row]);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to save this memory.'));
    } finally {
      setBusy(false);
    }
  };
  const forget = async (id) => {
    setBusy(true);
    setError('');
    try {
      await memoryService.forget(id);
      setSaved((items) => items.filter((item) => item._id !== id));
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to forget this memory.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="memory-suggestions" aria-live="polite">
      {error && <p role="alert">{error}</p>}
      {memory?.unavailable && <p>Memory suggestions are temporarily unavailable.</p>}
      {suggestions.map((item) => (
        <div className="memory-card" key={item.token}>
          <strong>I noticed this may be useful in future:</strong>
          <p>{item.content}</p>
          <span>Save this memory?</span>
          <div className="memory-actions">
            <button type="button" disabled={busy} onClick={() => save(item)}>
              Save memory
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                setSuggestions((items) =>
                  items.filter((candidate) => candidate.token !== item.token),
                )
              }
            >
              Ignore
            </button>
          </div>
        </div>
      ))}
      {saved.map((item) => (
        <div className="memory-card" key={item._id}>
          <strong>
            {item.source === 'preference_automatic'
              ? 'Preference saved automatically'
              : 'Memory saved'}
          </strong>
          <p>{item.content}</p>
          <button type="button" disabled={busy} onClick={() => forget(item._id)}>
            Forget this
          </button>
        </div>
      ))}
    </div>
  );
}
