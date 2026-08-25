import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { AlertCircle, Check, FileText, Inbox, Search, X } from 'lucide-react';

export function Button({ children, variant = 'primary', className = '', ...props }) {
  return (
    <button className={`btn btn-${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}
export function IconButton({ label, children, className = '', ...props }) {
  return (
    <button className={`icon-btn ${className}`} title={label} aria-label={label} {...props}>
      {children}
    </button>
  );
}
export function Badge({ children, tone }) {
  return (
    <span
      className={`badge ${tone?.toLowerCase() || String(children).toLowerCase().replace(' ', '-')}`}
    >
      {children}
    </span>
  );
}
export function PriorityBadge({ priority }) {
  if (!priority) return null;
  return <Badge tone={priority}>{priority}</Badge>;
}
export function PageHeader({ title, description, action }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </header>
  );
}
export function SearchBox({ value, onChange, placeholder = 'Search…' }) {
  return (
    <label className="search-box">
      <Search size={16} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {value && (
        <button onClick={() => onChange('')} aria-label="Clear">
          <X size={14} />
        </button>
      )}
    </label>
  );
}
export function EmptyState({
  title = 'Nothing here',
  text = 'Try changing your filters.',
  action,
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Inbox size={21} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function Modal({ open, onClose, title, children, size = '' }) {
  useEffect(() => {
    if (!open) return undefined;
    const escape = (event) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-backdrop"
          onMouseDown={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            className={`modal ${size}`}
            onMouseDown={(event) => event.stopPropagation()}
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.18 }}
          >
            <header>
              <h2>{title}</h2>
              <IconButton label="Close" onClick={onClose}>
                <X size={18} />
              </IconButton>
            </header>
            {children}
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  text = 'This action cannot be undone.',
  confirmLabel = 'Confirm',
  busy = false,
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="confirm">
        <div className="danger-icon">
          <AlertCircle size={20} />
        </div>
        <p>{text}</p>
        <div className="modal-actions">
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={async () => {
              try { await onConfirm(); onClose(); } catch { /* Keep the dialog open so its caller can show the failure. */ }
            }}
          >
            {busy ? 'Deleting…' : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function SourceLink({ document, onClick }) {
  return (
    <button className="source-link" onClick={onClick}>
      <FileText size={15} />
      <span>{document?.title || 'Manual entry'}</span>
    </button>
  );
}
export function Toggle({ checked, onChange, label }) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        className={`toggle ${checked ? 'on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <i />
      </button>
    </label>
  );
}
export function CheckCircle({ checked, onClick, label = 'Mark complete' }) {
  return (
    <button className={`check ${checked ? 'done' : ''}`} onClick={onClick} aria-label={label}>
      {checked && <Check size={13} />}
    </button>
  );
}

export function Skeleton({ lines = 3 }) {
  return (
    <div className="skeleton" aria-label="Loading">
      {Array.from({ length: lines }, (_, index) => (
        <i key={index} />
      ))}
    </div>
  );
}

export function Drawer({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const escape = (event) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="drawer-backdrop"
          onMouseDown={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.aside
            className="context-drawer"
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => event.stopPropagation()}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            <header>
              <div>
                <span>DETAILS</span>
                <h2>{title}</h2>
              </div>
              <IconButton label="Close" onClick={onClose}>
                <X />
              </IconButton>
            </header>
            {children}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
