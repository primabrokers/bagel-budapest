import { useMemo, useRef, useState } from 'react';
import { Download, FileText, Trash2, Upload } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { SkeletonText } from '../components/ui/Skeleton';
import { showToast } from '../hooks/useToast';
import { confirmDialog } from '../hooks/useConfirm';
import { useEventContext } from '../data/event/context';
import { useDocuments } from '../data/documents/hooks';
import { deleteDocument, getSignedDocumentUrl, uploadDocument } from '../data/documents/mutations';
import { formatDate } from '../lib/format';
import type { DocumentRow } from '../data/documents/types';

const UNFILED_LABEL = 'Unfiled';

function formatBytes(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function groupByFolder(documents: DocumentRow[]): { folder: string; documents: DocumentRow[] }[] {
  const groups = new Map<string, DocumentRow[]>();
  for (const doc of documents) {
    const key = doc.folder?.trim() || UNFILED_LABEL;
    const list = groups.get(key);
    if (list) list.push(doc);
    else groups.set(key, [doc]);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => {
      if (a === UNFILED_LABEL) return 1;
      if (b === UNFILED_LABEL) return -1;
      return a.localeCompare(b);
    })
    .map(([folder, docs]) => ({ folder, documents: docs }));
}

export function DocumentsPage() {
  const { eventId } = useEventContext();
  const { data: documents, loading, reload } = useDocuments();
  const [uploading, setUploading] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const groups = useMemo(() => groupByFolder(documents ?? []), [documents]);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      await uploadDocument(eventId, file);
      showToast('Uploaded', 'success');
      reload();
    } catch {
      showToast('Could not upload that file — please try again.', 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handlePreview(doc: DocumentRow) {
    setOpeningId(doc.id);
    try {
      const url = await getSignedDocumentUrl(doc.storage_path);
      window.open(url, '_blank', 'noopener');
    } catch {
      showToast('Could not open that document — please try again.', 'error');
    } finally {
      setOpeningId(null);
    }
  }

  async function handleDelete(doc: DocumentRow) {
    const ok = await confirmDialog(`Remove "${doc.name}"?`, {
      body: 'This deletes the file itself, not just the entry. This cannot be undone.',
      tone: 'danger',
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    setDeletingId(doc.id);
    try {
      await deleteDocument(doc.id);
      showToast('Removed', 'success');
      reload();
    } catch {
      showToast('Could not remove — please try again.', 'error');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-4 lg:p-6">
      <PageHeader
        title="Documents"
        subtitle="Contracts, quotes, invoices — everything on file for the day."
        actions={
          <>
            <input
              ref={fileInputRef}
              type="file"
              className="sr-only"
              aria-label="Choose a file to upload"
              tabIndex={-1}
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleUpload(file);
              }}
            />
            <Button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              <Upload size={15} aria-hidden="true" />
              {uploading ? 'Uploading…' : 'Upload'}
            </Button>
          </>
        }
      />

      {loading && !documents ? (
        <Card>
          <SkeletonText lines={4} />
        </Card>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No documents yet"
          hint="Upload a contract, a quote, an invoice — anything worth keeping on file."
          action={
            <Button type="button" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload size={14} aria-hidden="true" />
              Upload
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((group) => (
            <div key={group.folder}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-[.04em] text-text-muted">{group.folder}</h2>
              <Card padding="none">
                <ul className="flex flex-col divide-y divide-separator-soft">
                  {group.documents.map((doc) => (
                    <li key={doc.id} className="flex items-center gap-3 px-4 py-3">
                      <FileText size={16} aria-hidden="true" className="shrink-0 text-text-muted" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-text-primary">{doc.name}</p>
                        <p className="truncate text-xs text-text-muted">
                          {formatDate(doc.created_at)}
                          {doc.size_bytes != null ? ` · ${formatBytes(doc.size_bytes)}` : ''}
                        </p>
                      </div>
                      <IconButton
                        label={`Open ${doc.name}`}
                        size="sm"
                        disabled={openingId === doc.id}
                        onClick={() => void handlePreview(doc)}
                      >
                        <Download size={15} aria-hidden="true" />
                      </IconButton>
                      <IconButton
                        label={`Remove ${doc.name}`}
                        size="sm"
                        disabled={deletingId === doc.id}
                        onClick={() => void handleDelete(doc)}
                      >
                        <Trash2 size={15} aria-hidden="true" />
                      </IconButton>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
