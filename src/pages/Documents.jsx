import { Grid2X2, List, Plus, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { documents } from '../data/mockData';
import { DocumentCard } from '../components/ItemRows';
import { Button, EmptyState, PageHeader, SearchBox } from '../components/UI';

const cats = [
  'All',
  'University',
  'Bills',
  'Contracts',
  'Warranty',
  'Subscription',
  'Appointment',
  'Personal',
];
export default function Documents() {
  const nav = useNavigate();
  const [query, setQuery] = useState(''),
    [category, setCategory] = useState('All'),
    [priority, setPriority] = useState('All'),
    [view, setView] = useState('grid');
  const list = useMemo(
    () =>
      documents.filter(
        (d) =>
          (category === 'All' || d.category === category) &&
          (priority === 'All' || d.priority === priority) &&
          `${d.title} ${d.summary}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [query, category, priority],
  );
  return (
    <>
      <PageHeader
        title="Documents"
        description="Everything LifeAdmin has organized for you."
        action={
          <Button onClick={() => nav('/app/add')}>
            <Plus size={16} />
            Add Information
          </Button>
        }
      />
      <div className="toolbar">
        <SearchBox value={query} onChange={setQuery} placeholder="Search documents…" />
        <div className="tool-filters">
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option>All</option>
            <option>URGENT</option>
            <option>HIGH</option>
            <option>MEDIUM</option>
            <option>LOW</option>
          </select>
          <button>
            <SlidersHorizontal size={15} />
            Filters
          </button>
          <div className="segmented">
            <button
              className={view === 'grid' ? 'active' : ''}
              onClick={() => setView('grid')}
              title="Grid view"
            >
              <Grid2X2 size={15} />
            </button>
            <button
              className={view === 'list' ? 'active' : ''}
              onClick={() => setView('list')}
              title="List view"
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>
      <div className="tabs">
        {cats.map((c) => (
          <button className={category === c ? 'active' : ''} key={c} onClick={() => setCategory(c)}>
            {c}
          </button>
        ))}
      </div>
      {list.length ? (
        <div className={`documents ${view}`}>
          {list.map((d) => (
            <DocumentCard key={d.id} doc={d} view={view} />
          ))}
        </div>
      ) : (
        <EmptyState title="No documents found" text="Try another search or remove a filter." />
      )}
    </>
  );
}
