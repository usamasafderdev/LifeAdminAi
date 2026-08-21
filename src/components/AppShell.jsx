import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  CalendarDays,
  ChevronDown,
  FileStack,
  LayoutDashboard,
  ListTodo,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  Sparkles,
  Timer,
  X,
} from 'lucide-react';
import { user } from '../data/mockData';
import { useApp } from '../context/AppContext';
import CommandPalette from './CommandPalette';
import { Button, IconButton } from './UI';

const groups = [
  {
    label: 'Workspace',
    items: [
      ['Dashboard', '/app/dashboard', LayoutDashboard],
      ['Documents', '/app/documents', FileStack],
      ['Tasks', '/app/tasks', ListTodo],
      ['Reminders', '/app/reminders', Timer],
      ['Calendar', '/app/calendar', CalendarDays],
    ],
  },
  {
    label: 'Intelligence',
    items: [
      ['Ask LifeAdmin', '/app/ask', Sparkles],
      ['Search', '/app/search', Search],
    ],
  },
  { label: 'System', items: [['Settings', '/app/settings', Settings]] },
];
const nav = groups.flatMap((group) => group.items);

export default function AppShell() {
  const [drawer, setDrawer] = useState(false);
  const [notifs, setNotifs] = useState(false);
  const [profile, setProfile] = useState(false);
  const [commands, setCommands] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('la_sidebar') === 'collapsed',
  );
  const { notifications, setNotifications, toast } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const unread = notifications.filter((notification) => !notification.read).length;
  const title = nav.find((item) => location.pathname.startsWith(item[1]))?.[0] || 'LifeAdmin';
  useEffect(
    () => localStorage.setItem('la_sidebar', collapsed ? 'collapsed' : 'expanded'),
    [collapsed],
  );
  useEffect(() => {
    const open = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommands(true);
      }
    };
    window.addEventListener('keydown', open);
    return () => window.removeEventListener('keydown', open);
  }, []);
  const closeDrawer = () => setDrawer(false);
  return (
    <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <AnimatePresence>
        {drawer && (
          <motion.button
            className="drawer-shade"
            aria-label="Close navigation"
            onClick={closeDrawer}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
        )}
      </AnimatePresence>
      <aside className={`sidebar ${drawer ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">
            <Sparkles size={17} />
          </div>
          <strong>
            LifeAdmin <span>AI</span>
          </strong>
          <IconButton label="Close navigation" className="mobile-close" onClick={closeDrawer}>
            <X size={17} />
          </IconButton>
        </div>
        <nav aria-label="Primary navigation">
          {groups.map((group) => (
            <div className="nav-group" key={group.label}>
              <span className="nav-label">{group.label}</span>
              {group.items.map(([label, path, Icon]) => (
                <NavLink
                  key={path}
                  to={path}
                  onClick={closeDrawer}
                  title={collapsed ? label : undefined}
                >
                  <Icon size={17} />
                  <span>{label}</span>
                  <i className="active-rail" />
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <button
          className="collapse-sidebar"
          onClick={() => setCollapsed((value) => !value)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          <span>{collapsed ? 'Expand' : 'Collapse sidebar'}</span>
        </button>
        <div className="sidebar-foot">
          <div className="avatar">{user.initials}</div>
          <div>
            <strong>{user.name}</strong>
            <small>{user.email}</small>
          </div>
          <ChevronDown size={14} />
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="top-left">
            <IconButton label="Open navigation" onClick={() => setDrawer(true)}>
              <Menu size={19} />
            </IconButton>
            <div>
              <span>Personal workspace</span>
              <strong>{title}</strong>
            </div>
          </div>
          <div className="top-actions">
            <button className="top-search" onClick={() => setCommands(true)}>
              <Search size={15} />
              <span>Search LifeAdmin...</span>
              <kbd>Ctrl K</kbd>
            </button>
            <div className="popover-wrap">
              <IconButton
                label="Notifications"
                onClick={() => {
                  setNotifs(!notifs);
                  setProfile(false);
                }}
              >
                <Bell size={18} />
                {unread > 0 && <b className="notif-count">{unread}</b>}
              </IconButton>
              <AnimatePresence>
                {notifs && (
                  <motion.div
                    className="popover notification-pop"
                    initial={{ opacity: 0, y: -8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  >
                    <div className="pop-head">
                      <div>
                        <strong>Notifications</strong>
                        <small>{unread} unread updates</small>
                      </div>
                      <button
                        onClick={() =>
                          setNotifications((items) =>
                            items.map((notification) => ({ ...notification, read: true })),
                          )
                        }
                      >
                        Mark all read
                      </button>
                    </div>
                    {notifications.slice(0, 5).map((notification) => (
                      <button
                        key={notification.id}
                        className={`notification ${!notification.read ? 'unread' : ''}`}
                        onClick={() =>
                          setNotifications((items) =>
                            items.map((item) =>
                              item.id === notification.id ? { ...item, read: true } : item,
                            ),
                          )
                        }
                      >
                        <i />
                        <div>
                          <strong>{notification.title}</strong>
                          <p>{notification.text}</p>
                          <small>{notification.time}</small>
                        </div>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <Button onClick={() => navigate('/app/add')}>
              <Plus size={16} />
              <span>Add Information</span>
            </Button>
            <div className="popover-wrap">
              <button
                className="profile-trigger"
                aria-label="Open profile menu"
                onClick={() => {
                  setProfile(!profile);
                  setNotifs(false);
                }}
              >
                <span className="avatar">{user.initials}</span>
                <ChevronDown size={13} />
              </button>
              <AnimatePresence>
                {profile && (
                  <motion.div
                    className="popover profile-pop"
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  >
                    <div className="profile-summary">
                      <strong>{user.name}</strong>
                      <small>{user.email}</small>
                    </div>
                    <button onClick={() => navigate('/app/settings')}>Profile settings</button>
                    <hr />
                    <button onClick={() => navigate('/login')}>Sign out</button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>
        <main className="content">
          <AnimatePresence mode="wait">
            <motion.div
              className="page-transition"
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <AnimatePresence>
        {toast && (
          <motion.div
            className="toast"
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
          >
            <span className="toast-check">✓</span>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
      <CommandPalette open={commands} onClose={() => setCommands(false)} />
    </div>
  );
}
