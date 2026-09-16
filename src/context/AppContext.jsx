import { useNotificationData } from '../hooks/useNotificationData';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { conversations as seedConversations } from '../data/mockData';
import { documentService } from '../services/documentService';
import { taskService } from '../services/taskService';
import { reminderService } from '../services/reminderService';
import { useAuth } from './AuthContext';
const AppContext = createContext(null);
const fromStore = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
export function AppProvider({ children }) {
  const { user, isInitializing } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState('');
  const taskRequest = useRef(0);
  const activeUser = useRef(user?._id);
  activeUser.current = user?._id;
  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState('');
  const [reminders, setReminders] = useState([]);
  const [remindersLoading, setRemindersLoading] = useState(false);
  const [remindersError, setRemindersError] = useState('');
  const notificationData = useNotificationData(user?._id || user?.id);
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
    const request = ++taskRequest.current; const owner = user._id;
    setTasksLoading(true); setTasksError('');
    try { const rows = await taskService.getAll(); if (request === taskRequest.current && owner === activeUser.current) setTasks(rows); }
    catch { setTasksError('Unable to load your tasks.'); }
    finally { if (request === taskRequest.current) setTasksLoading(false); }
  };
  const loadReminders = async () => {
    if (!user) return;
    setRemindersLoading(true); setRemindersError('');
    try { setReminders(await reminderService.getAll()); }
    catch { setRemindersError('Unable to load your reminders.'); }
    finally { setRemindersLoading(false); }
  };
  useEffect(() => {
    if (user) { loadDocuments(); loadTasks(); loadReminders(); }
    else if (!isInitializing) { setDocuments([]); setTasks([]); setReminders([]); }
  }, [user?._id, isInitializing]);
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
    setReminders((current) => current.filter((reminder) => String(reminder.documentId) !== String(id)));
    return result;
  };
  const createTask = async (values) => { const task = await taskService.create(values); setTasks((current) => [task, ...current]); return task; };
  const updateTask = async (id, values) => { const owner = user?._id; const task = await taskService.update(id, values); if (owner !== activeUser.current) return task; taskRequest.current++; setTasksLoading(false); window.dispatchEvent(new Event('lifeadmin-briefing-changed')); setTasks((current) => current.map((item) => item.id === id ? task : item)); return task; };
  const completeTask = async (id) => { const current = tasks.find((task) => task.id === id); if (!current) return; await updateTask(id, { status: current.status === 'Completed' ? 'Pending' : 'Completed' }); await loadReminders(); notify('Task updated'); };
  const deleteTask = async (id) => { await taskService.remove(id); setTasks((current) => current.filter((task) => task.id !== id)); setReminders((current) => current.filter((reminder) => String(reminder.taskId) !== String(id))); notify('Task deleted'); };
  const snoozeTask = async (id) => { const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); await updateTask(id, { date: tomorrow.toISOString().slice(0, 10) }); notify('Task snoozed'); };
  const createReminder = async (values) => { const reminder = await reminderService.create(values); setReminders((current) => [...current, reminder].sort((a, b) => new Date(a.remindAt) - new Date(b.remindAt))); return reminder; };
  const updateReminder = async (id, values) => { const reminder = await reminderService.update(id, values); setReminders((current) => current.map((item) => item.id === id ? reminder : item)); return reminder; };
  const deleteReminder = async (id) => { await reminderService.remove(id); setReminders((current) => current.filter((item) => item.id !== id)); };
  const addGeneratedTasks = (generated) => setTasks((current) => [...generated, ...current.filter((task) => !generated.some((item) => item.id === task.id))]);
  return <AppContext.Provider value={{ documents, setDocuments, addDocument, updateDocument, deleteDocument, documentsLoading, documentsError, reloadDocuments: loadDocuments, tasks, setTasks, tasksLoading, tasksError, reloadTasks: loadTasks, createTask, updateTask, addGeneratedTasks, reminders, remindersLoading, remindersError, reloadReminders: loadReminders, createReminder, updateReminder, deleteReminder, ...notificationData, conversations, setConversations, theme, setTheme, toast, notify, completeTask, deleteTask, snoozeTask }}>{children}</AppContext.Provider>;
}
export const useApp = () => useContext(AppContext);
