import { createContext, useContext, useEffect, useState } from 'react';
import { conversations as seedConversations, initialNotifications, initialReminders, initialTasks } from '../data/mockData';
import { documentService } from '../services/documentService';
import { useAuth } from './AuthContext';
const AppContext = createContext(null);
const fromStore = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
export function AppProvider({ children }) {
  const { user, isInitializing } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState('');
  const [tasks, setTasks] = useState(() => fromStore('la_tasks', initialTasks));
  const [reminders, setReminders] = useState(() => fromStore('la_reminders', initialReminders));
  const [notifications, setNotifications] = useState(() => fromStore('la_notifications', initialNotifications));
  const [conversations, setConversations] = useState(() => fromStore('la_conversations', seedConversations));
  const [theme, setTheme] = useState(() => localStorage.getItem('la_theme') || 'light');
  const [toast, setToast] = useState('');
  const notify = (message) => { setToast(message); window.setTimeout(() => setToast(''), 2600); };
  const loadDocuments = async () => {
    if (!user) return;
    setDocumentsLoading(true);
    setDocumentsError('');
    try {
      setDocuments(await documentService.getAll());
    } catch {
      setDocumentsError('Unable to load your documents.');
    } finally {
      setDocumentsLoading(false);
    }
  };
  useEffect(() => {
    if (user) loadDocuments();
    else if (!isInitializing) setDocuments([]);
  }, [user?._id, isInitializing]);
  useEffect(() => localStorage.setItem('la_tasks', JSON.stringify(tasks)), [tasks]);
  useEffect(() => localStorage.setItem('la_reminders', JSON.stringify(reminders)), [reminders]);
  useEffect(() => localStorage.setItem('la_notifications', JSON.stringify(notifications)), [notifications]);
  useEffect(() => localStorage.setItem('la_conversations', JSON.stringify(conversations)), [conversations]);
  useEffect(() => { localStorage.setItem('la_theme', theme); const media = window.matchMedia('(prefers-color-scheme: dark)'); const apply = () => document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && media.matches)); apply(); media.addEventListener('change', apply); return () => media.removeEventListener('change', apply); }, [theme]);
  const addDocument = (doc) => { setDocuments((v) => [doc, ...v]); return doc; };
  const updateDocument = async (id, values) => {
    const updated = await documentService.update(id, values);
    setDocuments((current) => current.map((document) => document.id === id ? updated : document));
    return updated;
  };
  const deleteDocument = async (id) => {
    await documentService.remove(id);
    setDocuments((current) => current.filter((document) => document.id !== id));
  };
  const completeTask = (id) => { setTasks((v) => v.map((t) => t.id === id ? { ...t, status: t.status === 'Completed' ? 'Pending' : 'Completed' } : t)); notify('Task updated'); };
  const deleteTask = (id) => { setTasks((v) => v.filter((t) => t.id !== id)); notify('Task deleted'); };
  const snoozeTask = (id) => { setTasks((v) => v.map((t) => t.id === id ? { ...t, due: 'Snoozed until tomorrow' } : t)); notify('Task snoozed'); };
  return <AppContext.Provider value={{ documents, setDocuments, addDocument, updateDocument, deleteDocument, documentsLoading, documentsError, reloadDocuments: loadDocuments, tasks, setTasks, reminders, setReminders, notifications, setNotifications, conversations, setConversations, theme, setTheme, toast, notify, completeTask, deleteTask, snoozeTask }}>{children}</AppContext.Provider>;
}
export const useApp = () => useContext(AppContext);
