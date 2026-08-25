import { FileImage, FileText, Keyboard, Plus, UploadCloud, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Badge, Button, Field, PageHeader } from '../components/UI';
import { useApp } from '../context/AppContext';
import { getErrorMessage } from '../services/api';
import { documentCategories, documentService } from '../services/documentService';

const methods = [['Document', FileText, 'Upload a digital PDF'], ['Image', FileImage, 'Upload and read an image'], ['Paste text', Keyboard, 'Save copied information'], ['Manual entry', Plus, 'Create a structured record']];

export default function AddInformation() {
  const [params] = useSearchParams();
  const [method, setMethod] = useState(Number(params.get('method')) || 0);
  const nav = useNavigate();
  const { setDocuments, notify } = useApp();
  const addToWorkspace = (document, message) => { setDocuments((current) => [document, ...current.filter((item) => item.id !== document.id)]); notify(message); nav(`/app/documents/${document.id}`); };
  const saveEntry = async (payload) => addToWorkspace(await documentService.create(payload), 'Information saved successfully');
  const saveUpload = async (formData) => { const result = await documentService.uploadDocument(formData); addToWorkspace(result.document, result.message); };
  return <><PageHeader title="Add Information" description="Save a PDF, image, text, or manual record to your workspace." /><div className="method-tabs">{methods.map(([name, Icon, description], index) => <button key={name} className={method === index ? 'active' : ''} onClick={() => setMethod(index)}><Icon size={18} /><span><strong>{name}</strong><small>{description}</small></span></button>)}</div><section className="panel add-panel">{method < 2 ? <Upload key={method} method={method} onSave={saveUpload} /> : method === 2 ? <Paste onSave={saveEntry} /> : <Manual onSave={saveEntry} />}</section></>;
}

function Upload({ method, onSave }) {
  const [file, setFile] = useState(null), [title, setTitle] = useState(''), [category, setCategory] = useState('other'), [error, setError] = useState(''), [uploading, setUploading] = useState(false), [previewUrl, setPreviewUrl] = useState('');
  const imageMode = method === 1;
  useEffect(() => { if (!imageMode || !file) { setPreviewUrl(''); return undefined; } const url = URL.createObjectURL(file); setPreviewUrl(url); return () => URL.revokeObjectURL(url); }, [file, imageMode]);
  const chooseFile = (nextFile) => {
    setError('');
    if (!nextFile) return setFile(null);
    const validImage = ['image/jpeg', 'image/png', 'image/webp'].includes(nextFile.type) && /\.(jpe?g|png|webp)$/i.test(nextFile.name);
    const validPdf = nextFile.type === 'application/pdf' && /\.pdf$/i.test(nextFile.name);
    if (imageMode ? !validImage : !validPdf) { setFile(null); return setError(imageMode ? 'Please select a JPEG, PNG, or WebP image.' : 'Please select a PDF file.'); }
    if (nextFile.size > 10 * 1024 * 1024) { setFile(null); return setError(`${imageMode ? 'Image' : 'PDF'} must be 10 MB or smaller.`); }
    return setFile(nextFile);
  };
  const submit = async (event) => { event.preventDefault(); if (!file || uploading) return; const formData = new FormData(); formData.append('file', file); if (title.trim()) formData.append('title', title.trim()); formData.append('category', category); setUploading(true); setError(''); try { await onSave(formData); } catch (requestError) { setError(getErrorMessage(requestError, 'Unable to upload document. Please try again.')); setUploading(false); } };
  return <form className="upload-content" onSubmit={submit}>{error && <div className="form-error" role="alert">{error}</div>}<div className={`dropzone ${imageMode && previewUrl ? 'with-image-preview' : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); chooseFile(event.dataTransfer.files[0]); }}>{previewUrl ? <img className="local-image-preview" src={previewUrl} alt="Selected upload preview" /> : <UploadCloud size={28} />}<h2>{imageMode ? 'Drop your image here' : 'Drop your PDF here'}</h2><p>{imageMode ? 'We will securely read printed English text from the image.' : 'Choose a digital PDF containing selectable text.'}</p><label className="btn btn-secondary">{file ? 'Replace file' : 'Browse files'}<input type="file" accept={imageMode ? '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp' : '.pdf,application/pdf'} hidden disabled={uploading} onChange={(event) => chooseFile(event.target.files[0])} /></label><small>{imageMode ? 'JPEG, PNG or WebP' : 'PDF only'} · Maximum 10 MB</small></div>{file && <div className="selected-file">{imageMode ? <FileImage /> : <FileText />}<div><strong>{file.name}</strong><span>{formatFileSize(file.size)} · Ready to upload</span></div><Badge tone="neutral">Selected</Badge><button type="button" className="remove-file" onClick={() => setFile(null)} aria-label={`Remove selected ${imageMode ? 'image' : 'PDF'}`}><X /></button></div>}<div className="form-grid upload-fields"><Field label="Title" hint="Optional — the filename is used if blank"><input value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} placeholder={imageMode ? 'Electricity bill' : 'Internship submission notice'} /></Field><Field label="Category"><select value={category} onChange={(event) => setCategory(event.target.value)}>{documentCategories.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></Field></div>{uploading && imageMode && <div className="ocr-working" role="status"><span className="button-spinner" /><div><strong>Reading text from image…</strong><small>OCR may take a moment. Please keep this page open.</small></div></div>}<div className="panel-footer"><Button disabled={!file || uploading}>{uploading && <span className="button-spinner" />}{uploading ? imageMode ? 'Reading text from image…' : 'Uploading and reading PDF…' : imageMode ? 'Upload and read image' : 'Upload PDF'}</Button></div></form>;
}

function Paste({ onSave }) {
  const [title, setTitle] = useState(''), [category, setCategory] = useState('other'), [text, setText] = useState(''), [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const submit = async () => { if (!title.trim()) return setError('Please enter a title.'); if (!text.trim()) return setError('Please enter information to save.'); setSaving(true); setError(''); try { await onSave({ title: title.trim(), sourceType: 'text', category, extractedText: text.trim() }); } catch (requestError) { setError(getErrorMessage(requestError, 'Unable to save information. Please try again.')); setSaving(false); } };
  return <div className="paste-form">{error && <div className="form-error" role="alert">{error}</div>}<Field label="Title"><input value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} placeholder="Internship Submission Notice" /></Field><Field label="Category"><select value={category} onChange={(event) => setCategory(event.target.value)}>{documentCategories.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></Field><Field label="Information to save"><textarea rows="10" maxLength={200000} value={text} onChange={(event) => setText(event.target.value)} placeholder="Please submit your internship report before September 10." /><small className="char-count">{text.length} characters</small></Field><div className="panel-footer"><Button disabled={saving} onClick={submit}>{saving && <span className="button-spinner" />}{saving ? 'Saving information' : 'Save information'}</Button></div></div>;
}

function Manual({ onSave }) {
  const [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const submit = (event) => { event.preventDefault(); if (saving) return; const data = Object.fromEntries(new FormData(event.currentTarget)); const details = [data.date && `Date: ${data.date}`, data.time && `Time: ${data.time}`, data.notes?.trim() && `Notes: ${data.notes.trim()}`].filter(Boolean).join('\n'); if (!data.title?.trim()) return setError('Please enter a title.'); if (!details) return setError('Please enter a date, time, or notes to save.'); setSaving(true); setError(''); onSave({ title: data.title.trim(), sourceType: 'manual', category: data.category, extractedText: details }).catch((requestError) => { setError(getErrorMessage(requestError, 'Unable to save information. Please try again.')); setSaving(false); }); };
  return <form className="modal-form wide" onSubmit={submit}>{error && <div className="form-error" role="alert">{error}</div>}<div className="form-grid"><Field label="Title"><input name="title" required placeholder="Dentist Appointment" /></Field><Field label="Category"><select name="category" defaultValue="appointment">{documentCategories.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></Field><Field label="Date"><input name="date" type="date" /></Field><Field label="Time"><input name="time" type="time" /></Field></div><Field label="Notes"><textarea name="notes" placeholder="Add any useful context" /></Field><p className="muted feature-note">Priority and reminders are not connected yet.</p><div className="panel-footer"><Button disabled={saving}>{saving && <span className="button-spinner" />}{saving ? 'Saving information' : 'Save information'}</Button></div></form>;
}

function formatFileSize(bytes) { return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`; }
