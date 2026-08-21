import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarDays,
  FilePlus2,
  FileStack,
  ListPlus,
  Search,
  Settings,
  Sparkles,
  Upload,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const commands = [
  ['Search LifeAdmin', 'Find documents, tasks and reminders', Search, '/app/search'],
  ['Add Information', 'Capture a document, image or note', FilePlus2, '/app/add'],
  ['Upload Document', 'Start with a PDF or text file', Upload, '/app/add?method=0'],
  ['New Task', 'Create a personal action', ListPlus, '/app/tasks'],
  ['Ask LifeAdmin', 'Query all your organized information', Sparkles, '/app/ask'],
  ['Open Documents', 'Browse your organized files', FileStack, '/app/documents'],
  ['Open Calendar', 'View deadlines and appointments', CalendarDays, '/app/calendar'],
  ['Open Settings', 'Manage preferences and appearance', Settings, '/app/settings'],
];
export default function CommandPalette({ open, onClose }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const filtered = useMemo(
    () =>
      commands.filter(([name, description]) =>
        `${name} ${description}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [query],
  );
  useEffect(() => {
    if (!open) return undefined;
    setQuery('');
    window.setTimeout(() => inputRef.current?.focus(), 50);
    const close = (event) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open, onClose]);
  const run = (path) => {
    onClose();
    navigate(path);
  };
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="command-backdrop"
          onMouseDown={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.section
            className="command-palette"
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            onMouseDown={(event) => event.stopPropagation()}
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.16 }}
          >
            <label className="command-input">
              <Search />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search or run a command..."
              />
              <kbd>ESC</kbd>
            </label>
            <div className="command-list">
              <span>QUICK ACTIONS</span>
              {filtered.map(([name, description, Icon, path], index) => (
                <button
                  key={name}
                  onClick={() => run(path)}
                  className={index === 0 ? 'selected' : ''}
                >
                  <i>
                    <Icon />
                  </i>
                  <div>
                    <strong>{name}</strong>
                    <small>{description}</small>
                  </div>
                  <kbd>↵</kbd>
                </button>
              ))}
              {!filtered.length && <p>No matching commands</p>}
            </div>
            <footer>
              <span>↑↓ Navigate</span>
              <span>↵ Open</span>
              <span>Esc Close</span>
            </footer>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
