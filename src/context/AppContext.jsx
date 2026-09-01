import { createContext, useContext, useEffect, useState } from 'react';
import { conversations as seedConversations, initialNotifications, initialReminders } from '../data/mockData';
import { documentService } from '../services/documentService';
import { taskService } from '../services/taskService';
import { useAuth } from './AuthContext';
const AppContext = createContext(null);
const fromStore = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
export function AppProvider({ children }) {
  const { user, isInitializing } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState('');
  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState('');
  const [reminders, setReminders] = useState(() => fromStore('la_reminders', initialReminders));
  const [notifications, setNotifications] = useState(() => fromStore('la_notifications', initialNotifications));
  const [conversations, setConversations] = useState(() => fromStore('la_conversations', seedConversations));
  const [theme, setTheme] = useState(() => localStorage.getItem('la_theme_v2') || 'dark');
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
  const loadTasks = async () => {
    if (!user) return;
    setTasksLoading(true); setTasksError('');
    try { setTasks(await taskService.getAll()); }
    catch { setTasksError('Unable to load your tasks.'); }
    finally { setTasksLoading(false); }
  };
  useEffect(() => {
    if (user) { loadDocuments(); loadTasks(); }
    else if (!isInitializing) { setDocuments([]); setTasks([]); }
  }, [user?._id, isInitializing]);
  useEffect(() => localStorage.setItem('la_reminders', JSON.stringify(reminders)), [reminders]);
  useEffect(() => localStorage.setItem('la_notifications', JSON.stringify(notifications)), [notifications]);
  useEffect(() => localStorage.setItem('la_conversations', JSON.stringify(conversations)), [conversations]);
  useEffect(() => { localStorage.setItem('la_theme_v2', theme); const media = window.matchMedia('(prefers-color-scheme: dark)'); const apply = () => document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && media.matches)); apply(); media.addEventListener('change', apply); return () => media.removeEventListener('change', apply); }, [theme]);
  const addDocument = (doc) => { setDocuments((v) => [doc, ...v]); return doc; };
  const updateDocument = async (id, values) => {
    const updated = await documentService.update(id, values);
    setDocuments((current) => current.map((document) => document.id === id ? updated : document));
    return updated;
  };
  const deleteDocument = async (id) => {
    const result = await documentService.remove(id);
    setDocuments((current) => current.filter((document) => document.id !== id));
    setTasks((current) => current.filter((task) => String(task.documentId) !== String(id)));
    return result;
  };
  const createTask = async (values) => { const task = await taskService.create(values); setTasks((current) => [task, ...current]); return task; };
  const updateTask = async (id, values) => { const task = await taskService.update(id, values); setTasks((current) => current.map((item) => item.id === id ? task : item)); return task; };
  const completeTask = async (id) => { const current = tasks.find((task) => task.id === id); if (!current) return; await updateTask(id, { status: current.status === 'Completed' ? 'Pending' : 'Completed' }); notify('Task updated'); };
  const deleteTask = async (id) => { await taskService.remove(id); setTasks((current) => current.filter((task) => task.id !== id)); notify('Task deleted'); };
  const snoozeTask = async (id) => { const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); await updateTask(id, { date: tomorrow.toISOString().slice(0, 10) }); notify('Task snoozed'); };
  const addGeneratedTasks = (generated) => setTasks((current) => [...generated, ...current.filter((task) => !generated.some((item) => item.id === task.id))]);
  return <AppContext.Provider value={{ documents, setDocuments, addDocument, updateDocument, deleteDocument, documentsLoading, documentsError, reloadDocuments: loadDocuments, tasks, setTasks, tasksLoading, tasksError, reloadTasks: loadTasks, createTask, updateTask, addGeneratedTasks, reminders, setReminders, notifications, setNotifications, conversations, setConversations, theme, setTheme, toast, notify, completeTask, deleteTask, snoozeTask }}>{children}</AppContext.Provider>;
}
export const useApp = () => useContext(AppContext);
