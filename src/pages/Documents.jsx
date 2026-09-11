import { FileStack, Grid2X2, List, Plus, X, CheckSquare, Square } from 'lucide-react';
import { useMemo, useState } from 'react';
import { documentService } from '../services/documentService';
import { useNavigate } from 'react-router-dom';
import { DocumentCard } from '../components/ItemRows';
import { Button, ConfirmDialog, EmptyState, SearchBox, Skeleton } from '../components/UI';
import { useApp } from '../context/AppContext';
import { documentCategories } from '../services/documentService';
import { getErrorMessage } from '../services/api';

const HISTORY_KEY = 'la_multi_document_history_v1';

function readAnalysisHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeAnalysisHistory(items) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
}

const sourceOptions = [
  ['all', 'All sources'],
  ['pdf', 'PDF'],
  ['image', 'Image'],
  ['text', 'Text'],
  ['manual', 'Manual Entry'],
];
const sortOptions = [
  ['newest', 'Newest'],
  ['oldest', 'Oldest'],
  ['updated', 'Recently updated'],
  ['az', 'Title A–Z'],
  ['za', 'Title Z–A'],
];

export default function Documents() {
  const nav = useNavigate();
  const {
    documents,
    tasks,
    documentsLoading,
    documentsError,
    reloadDocuments,
    deleteDocument,
    notify,
  } = useApp();
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [crossBusy, setCrossBusy] = useState(false);
  const [category, setCategory] = useState('all');
  const [source, setSource] = useState('all');
  const [sort, setSort] = useState('newest');
  const [view, setView] = useState('grid');
  const [deleting, setDeleting] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [allSelected, setAllSelected] = useState(false);
  const clearFilters = () => {
    setQuery('');
    setCategory('all');
    setSource('all');
  };
  const list = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const filtered = documents.filter((document) => {
      const searchable = [
        document.title,
        document.originalFilename,
        document.extractedText,
        document.category,
        document.type,
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase();
      return (
        (!needle || searchable.includes(needle)) &&
        (category === 'all' || document.categoryValue === category) &&
        (source === 'all' || document.sourceType === source)
      );
    });
    return [...filtered].sort((a, b) => {
      if (sort === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
      if (sort === 'updated') return new Date(b.updatedAt) - new Date(a.updatedAt);
      if (sort === 'az') return a.title.localeCompare(b.title);
      if (sort === 'za') return b.title.localeCompare(a.title);
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }, [documents, query, category, source, sort]);
  const confirmDelete = async () => {
    if (!deleting || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError('');
    try {
      const result = await deleteDocument(deleting.id);
      setDeleting(null);
      notify(
        result.deletedTasks
          ? `Document and ${result.deletedTasks} linked task${result.deletedTasks === 1 ? '' : 's'} deleted`
          : 'Document deleted',
      );
    } catch (error) {
      setDeleteError(getErrorMessage(error, 'Unable to delete document.'));
      throw error;
    } finally {
      setDeleteBusy(false);
    }
  };
  const toggleSelection = (id) => {
    setAnalysisError('');
    setSelectedIds((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      setAllSelected(next.length > 0 && next.length === list.length);
      return next;
    });
  };
  const clearSelection = () => {
    setSelectedIds([]);
    setAnalysisError('');
    setAllSelected(false);
  };
  const selectAllVisible = () => {
    setAnalysisError('');
    const visibleIds = list.map((document) => String(document.id));
    if (selectedIds.length === visibleIds.length) {
      clearSelection();
      return;
    }
    const unique = [...new Set([...selectedIds, ...visibleIds])];
    setSelectedIds(unique);
    setAllSelected(unique.length === list.length);
  };
  const analyzeSelected = async () => {
    if (selectedIds.length < 2 || crossBusy) return;
    setCrossBusy(true);
    setAnalysisError('');
    try {
      const result = await documentService.analyzeTogether(selectedIds);
      const report = result?.report || result;
      const history = readAnalysisHistory();
      const persistedId = String(result?.history?.id || result?._id || '');
      const selectedDocIds = [...new Set(selectedIds.map(String))].sort();
      const id = persistedId || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const entry = {
        id,
        userId: user?._id || user?.id || 'current-user',
        createdAt: new Date().toISOString(),
        selectedDocuments: selectedDocIds,
        summaryReference: report?.summary || '',
        report,
      };
      writeAnalysisHistory([{ ...entry }, ...history].slice(0, 30));
      notify(result?.reused ? 'Reused saved cross-document analysis' : report?.summary || 'Cross-document analysis generated');
      nav(`/app/documents/intelligence/${id}`);
    } catch (error) {
      const message = getErrorMessage(error, 'Unable to analyze documents together.');
      setAnalysisError(message);
      notify(message);
    } finally {
      setCrossBusy(false);
    }
  };
  const hasFilters = Boolean(query.trim()) || category !== 'all' || source !== 'all';
  const linkedTaskCount = deleting
    ? tasks.filter((task) => String(task.documentId) === String(deleting.id)).length
    : 0;
  return (
    <div className="documents-library-shell">
      <div className="library-atmosphere">
        <i />
        <i />
        <i />
      </div>
      <header className="library-heading">
        <div>
          <span className="library-kicker">
            <FileStack />
            Personal archive
          </span>
          <h1>Documents</h1>
          <p>
            {documents.length} saved record{documents.length === 1 ? '' : 's'} ·{' '}
            {documents.filter((item) => item.sourceType === 'pdf').length} PDFs ·{' '}
            {documents.filter((item) => item.sourceType === 'image').length} images
          </p>
        </div>
        <Button onClick={() => nav('/app/add')}>
          <Plus size={16} />
          Add Information
        </Button>
      </header>
      <div className="library-command-bar">
        <SearchBox value={query} onChange={setQuery} placeholder="Search your document library…" />
        <div className="tool-filters">
          <label>
            <span className="sr-only">Source type</span>
            <select value={source} onChange={(event) => setSource(event.target.value)}>
              {sourceOptions.map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Sort documents</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              {sortOptions.map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="segmented">
            <button
              aria-label="Grid view"
              aria-pressed={view === 'grid'}
              className={view === 'grid' ? 'active' : ''}
              onClick={() => setView('grid')}
            >
              <Grid2X2 size={15} />
            </button>
            <button
              aria-label="List view"
              aria-pressed={view === 'list'}
              className={view === 'list' ? 'active' : ''}
              onClick={() => setView('list')}
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>
      <div className="library-category-tabs">
        <button className={category === 'all' ? 'active' : ''} onClick={() => setCategory('all')}>
          All
        </button>
        {documentCategories.map(([value, label]) => (
          <button
            className={category === value ? 'active' : ''}
            key={value}
            onClick={() => setCategory(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {selectedIds.length >= 1 && (
        <div className="library-selection-strip">
          <span>
            {selectedIds.length} document{selectedIds.length === 1 ? '' : 's'} selected
          </span>
          <div className="selection-actions">
            <Button
              variant="secondary"
              disabled={crossBusy || selectedIds.length === 0}
              onClick={clearSelection}
            >
              <X size={14} />
              Clear
            </Button>
            <Button
              variant="secondary"
              disabled={crossBusy || list.length === 0}
              onClick={selectAllVisible}
            >
              {allSelected ? 'Reset all' : 'Select all'}
            </Button>
            <Button
              variant="primary"
              disabled={crossBusy || selectedIds.length < 2}
              onClick={analyzeSelected}
            >
              {crossBusy ? 'Analyzing…' : 'Analyze Together'}
            </Button>
          </div>
        </div>
      )}
      {analysisError && (
        <div className="analysis-error">
          <X size={14} />
          {analysisError}
        </div>
      )}
      <div className="library-results">
        <div className="library-results-label">
          <span>Library</span>
          <small>
            {list.length} item{list.length === 1 ? '' : 's'} shown
          </small>
        </div>
        {documentsLoading ? (
          <div className="documents grid" aria-label="Loading documents">
            {[1, 2, 3].map((item) => (
              <div className="panel" key={item}>
                <Skeleton lines={4} />
              </div>
            ))}
          </div>
        ) : documentsError ? (
          <EmptyState
            title="Unable to load documents."
            text="Check your connection and try again."
            action={<Button onClick={reloadDocuments}>Try again</Button>}
          />
        ) : list.length ? (
          <div className={`documents ${view}`}>
            {list.map((document) => (
              <DocumentCard
                key={document.id}
                doc={document}
                view={view}
                onDelete={setDeleting}
                selected={selectedIds.includes(document.id)}
                onToggleSelect={() => toggleSelection(document.id)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title={
              documents.length
                ? query.trim()
                  ? `No documents match “${query.trim()}”`
                  : 'No matching documents'
                : 'No documents yet'
            }
            text={
              documents.length
                ? 'Change your search or clear the active filters.'
                : 'Add your first piece of information to get started.'
            }
            action={
              documents.length && hasFilters ? (
                <Button variant="secondary" onClick={clearFilters}>
                  Clear search and filters
                </Button>
              ) : !documents.length ? (
                <Button onClick={() => nav('/app/add')}>Add Information</Button>
              ) : undefined
            }
          />
        )}
      </div>
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => {
          if (!deleteBusy) {
            setDeleting(null);
            setDeleteError('');
          }
        }}
        onConfirm={confirmDelete}
        title="Delete document?"
        text={
          deleteError ||
          (linkedTaskCount
            ? `Deleting “${deleting?.title || 'this document'}” will also permanently delete ${linkedTaskCount} linked task${linkedTaskCount === 1 ? '' : 's'}${deleting?.sourceType === 'pdf' || deleting?.sourceType === 'image' ? ' and its uploaded file' : ''}.`
            : `Delete “${deleting?.title || 'this document'}” permanently${deleting?.sourceType === 'pdf' || deleting?.sourceType === 'image' ? ' along with its uploaded file' : ''}?`)
        }
        confirmLabel={linkedTaskCount ? 'Delete document & tasks' : 'Delete document'}
        busy={deleteBusy}
      />
    </div>
  );
}
