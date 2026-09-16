import { ArrowUpRight, FileText, ListChecks, Timer } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { EmptyState, PageHeader, SearchBox } from '../components/UI';

const cleanSearchText = (value) =>
  String(value || '')
    .replace(/\[\[[^\]]+\]\]/g, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\|+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const getSnippet = (item, name, query) => {
  const source =
    item.extractedText ||
    item.summary ||
    item.detail ||
    item.description ||
    `${item.category || name}${item.due ? ` · Due ${item.due}` : ''}`;
  const text = cleanSearchText(source);
  if (!text) return 'No preview available for this result.';
  const matchIndex = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (matchIndex < 0 || text.length <= 190) return text;
  const start = Math.max(0, matchIndex - 48);
  const end = Math.min(text.length, matchIndex + query.length + 142);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
};

function HighlightedText({ text, query }) {
  if (!query) return text;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'));
  return parts.map((part, index) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={`${part}-${index}`}>{part}</mark>
    ) : (
      part
    ),
  );
}

const formatType = (item, name) => {
  if (name !== 'Documents') return name.slice(0, -1);
  if (item.mimeType?.includes('pdf')) return 'PDF';
  if (item.sourceType === 'image' || item.mimeType?.startsWith('image/')) return 'Image';
  if (item.sourceType === 'manual' || item.sourceType === 'text') return 'Manual note';
  return item.category || 'Document';
};

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : `Updated ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
};

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
                  <header className="search-results-head">
                    <h2>{name}</h2>
                    <span>
                      {items.length} {items.length === 1 ? 'result' : 'results'}
                    </span>
                  </header>
                  {items.map((item) => (
                    <button className="search-result-card" key={item.id} onClick={() => go(item)}>
                      <span className="result-icon" aria-hidden="true">
                        <Icon />
                      </span>
                      <div className="search-result-body">
                        <div className="search-result-title-row">
                          <strong>
                            <HighlightedText text={item.title} query={q} />
                          </strong>
                          <span className="search-result-category">
                            {item.category || name.slice(0, -1)}
                          </span>
                        </div>
                        <p className="search-result-snippet">
                          <HighlightedText text={getSnippet(item, name, q)} query={q} />
                        </p>
                        <div className="search-result-meta">
                          <span>
                            <Icon size={12} />
                            {formatType(item, name)}
                          </span>
                          {item.status && <span>{item.status}</span>}
                          {item.due && <span>Due {item.due}</span>}
                          {formatDate(item.updatedAt || item.createdAt) && (
                            <span>{formatDate(item.updatedAt || item.createdAt)}</span>
                          )}
                        </div>
                      </div>
                      <span className="search-result-action">
                        Open <ArrowUpRight size={14} />
                      </span>
                    </button>
                  ))}
                </section>
              ),
          )}
          {groups.every((g) => g[2].length === 0) && (
            <EmptyState
              title="No results found"
              text={`We couldn't find anything matching “${q}”. Try a different keyword, a broader phrase, or a document title.`}
            />
          )}
        </div>
      )}
    </>
  );
}
