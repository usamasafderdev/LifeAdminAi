import { FileText, ListChecks, Search as SearchIcon, Timer } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Badge, EmptyState, PageHeader, SearchBox } from '../components/UI';

export default function SearchPage() {
  const [q, setQ] = useState('');
  const { documents, tasks, reminders } = useApp();
  const nav = useNavigate();
  const groups = [
    [
      'Documents',
      FileText,
      documents.filter((x) => x.title.toLowerCase().includes(q.toLowerCase())),
      (x) => nav(`/app/documents/${x.id}`),
    ],
    [
      'Tasks',
      ListChecks,
      tasks.filter((x) => x.title.toLowerCase().includes(q.toLowerCase())),
      () => nav('/app/tasks'),
    ],
    [
      'Reminders',
      Timer,
      reminders.filter((x) => x.title.toLowerCase().includes(q.toLowerCase())),
      () => nav('/app/reminders'),
    ],
  ];
  return (
    <>
      <PageHeader
        title="Search LifeAdmin"
        description="Find anything across your documents, tasks and reminders."
      />
      <div className="search-hero">
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder="Search documents, tasks, reminders and deadlines…"
        />
        <div className="search-chips">
          Try:{' '}
          {['passport', 'semester', 'bill', 'warranty'].map((x) => (
            <button key={x} onClick={() => setQ(x)}>
              {x}
            </button>
          ))}
        </div>
      </div>
      {!q ? (
        <EmptyState
          title="Search your LifeAdmin"
          text="Find documents, tasks, reminders and deadlines from one place."
        />
      ) : (
        <div className="search-results">
          {groups.map(
            ([name, Icon, items, go]) =>
              items.length > 0 && (
                <section key={name}>
                  <h2>
                    {name}
                    <span>{items.length}</span>
                  </h2>
                  {items.map((item) => (
                    <button key={item.id} onClick={() => go(item)}>
                      <span className="result-icon">
                        <Icon />
                      </span>
                      <div>
                        <strong>{item.title}</strong>
                        <p>{item.summary || item.detail || `${item.category} · Due ${item.due}`}</p>
                      </div>
                      <Badge tone="neutral">{item.category || item.status}</Badge>
                    </button>
                  ))}
                </section>
              ),
          )}
          {groups.every((g) => g[2].length === 0) && (
            <EmptyState title="No results found" text={`Nothing in LifeAdmin matches “${q}”.`} />
          )}
        </div>
      )}
    </>
  );
}
