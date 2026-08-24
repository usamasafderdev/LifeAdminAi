import { Grid2X2, List, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DocumentCard } from '../components/ItemRows';
import { Button, EmptyState, PageHeader, SearchBox, Skeleton } from '../components/UI';
import { useApp } from '../context/AppContext';

const cats = [
  'All',
  'University Notice',
  'Bill',
  'Contract',
  'Warranty',
  'Subscription',
  'Appointment',
  'Information',
  'Other',
];
export default function Documents() {
  const nav = useNavigate();
  const { documents, documentsLoading, documentsError, reloadDocuments } = useApp();
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
    [documents, query, category, priority],
  );
  return (
    <>
      <PageHeader
        title="Documents"
        description={`${documents.length} saved record${documents.length === 1 ? '' : 's'}`}
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
      {documentsLoading ? (
        <div className="documents grid"><div className="panel"><Skeleton lines={4} /></div><div className="panel"><Skeleton lines={4} /></div></div>
      ) : documentsError ? (
        <EmptyState title="Unable to load your documents." text="Check your connection and try again." action={<Button onClick={reloadDocuments}>Try again</Button>} />
      ) : list.length ? (
        <div className={`documents ${view}`}>
          {list.map((d) => (
            <DocumentCard key={d.id} doc={d} view={view} />
          ))}
        </div>
      ) : (
        <EmptyState title={documents.length ? 'No documents found' : 'No documents yet'} text={documents.length ? 'Try another search or remove a filter.' : 'Save pasted text or a manual entry to see it here.'} action={!documents.length ? <Button onClick={() => nav('/app/add')}>Add Information</Button> : undefined} />
      )}
    </>
  );
}
