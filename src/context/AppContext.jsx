import { createContext, useContext, useEffect, useState } from 'react';
import { initialNotifications, initialReminders, initialTasks } from '../data/mockData';

const AppContext = createContext(null);
const fromStore = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};

export function AppProvider({ children }) {
  const [tasks, setTasks] = useState(() => fromStore('la_tasks', initialTasks));
  const [notifications, setNotifications] = useState(() =>
    fromStore('la_notifications', initialNotifications),
  );
  const [reminders, setReminders] = useState(initialReminders);
  const [theme, setTheme] = useState(() => localStorage.getItem('la_theme') || 'light');
  const [toast, setToast] = useState('');
  const notify = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2600);
  };
  useEffect(() => localStorage.setItem('la_tasks', JSON.stringify(tasks)), [tasks]);
  useEffect(
    () => localStorage.setItem('la_notifications', JSON.stringify(notifications)),
    [notifications],
  );
  useEffect(() => {
    localStorage.setItem('la_theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);
  const completeTask = (id) => {
    setTasks((v) =>
      v.map((t) =>
        t.id === id ? { ...t, status: t.status === 'Completed' ? 'Pending' : 'Completed' } : t,
      ),
    );
    notify('Task updated');
  };
  const deleteTask = (id) => {
    setTasks((v) => v.filter((t) => t.id !== id));
    notify('Task deleted');
  };
  const snoozeTask = (id) => {
    setTasks((v) => v.map((t) => (t.id === id ? { ...t, due: 'Snoozed until tomorrow' } : t)));
    notify('Task snoozed');
  };
  return (
    <AppContext.Provider
      value={{
        tasks,
        setTasks,
        notifications,
        setNotifications,
        reminders,
        setReminders,
        theme,
        setTheme,
        toast,
        notify,
        completeTask,
        deleteTask,
        snoozeTask,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
export const useApp = () => useContext(AppContext);
