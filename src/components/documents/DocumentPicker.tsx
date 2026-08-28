import { useRef, useState } from 'react';
import { FileText, Search, Upload } from 'lucide-react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { Field, Input } from '../ui/Field';
import { EmptyState } from '../ui/EmptyState';
import { SkeletonText } from '../ui/Skeleton';
import { showToast } from '../../hooks/useToast';
import { useEventContext } from '../../data/event/context';
import { useDocuments } from '../../data/documents/hooks';
import { linkDocument, uploadDocument } from '../../data/documents/mutations';
import { formatDate } from '../../lib/format';
import type { DocumentLinkEntityType } from '../../data/documents/types';

interface DocumentPickerProps {
  open: boolean;
  onClose: () => void;
  entityType: DocumentLinkEntityType;
  entityId: string;
  /** Called once a document has been attached (either an existing one, or a freshly uploaded
   *  one) — the caller reloads its own link list. */
  onLinked: () => void;
}

/**
 * "Attach a document" — a searchable pick-from-existing list, plus an upload-a-new-one form,
 * either of which ends in a call to `linkDocument`. Built generic enough that `VendorSheet` is
 * its first consumer; Stage 8/9's expense/task/idea/function document-linking can reuse it
 * unchanged, given only the `entityType`/`entityId` pair a new caller needs.
 */
export function DocumentPicker({ open, onClose, entityType, entityId, onLinked }: DocumentPickerProps) {
  const { eventId } = useEventContext();
  const { data: documents, loading, reload } = useDocuments();
  const [query, setQuery] = useState('');
  const [attachingId, setAttachingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = (documents ?? []).filter((doc) => doc.name.toLowerCase().includes(query.trim().toLowerCase()));

  async function attach(documentId: string) {
    setAttachingId(documentId);
    try {
      await linkDocument(documentId, entityType, entityId);
      showToast('Document attached', 'success');
      onLinked();
      onClose();
    } catch {
      showToast('Could not attach that document — please try again.', 'error');
    } finally {
      setAttachingId(null);
    }
  }

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const doc = await uploadDocument(eventId, file);
      await linkDocument(doc.id, entityType, entityId);
      showToast('Uploaded and attached', 'success');
      reload();
      onLinked();
      onClose();
    } catch {
      showToast('Could not upload that file — please try again.', 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Attach a document" anchor="drawer" layer="raised">
      <div className="flex flex-col gap-4">
        <div>
          <Field label="Upload a new file" htmlFor="document-picker-upload">
            <input
              ref={fileInputRef}
              id="document-picker-upload"
              type="file"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleUpload(file);
              }}
              className="block w-full text-sm text-text-secondary file:mr-3 file:rounded-md file:border file:border-separator-control file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-text-primary hover:file:bg-hover"
            />
          </Field>
          {uploading && <p className="mt-1.5 text-xs text-text-muted">Uploading…</p>}
        </div>

        <div className="border-t border-separator pt-4">
          <Field label="Or choose an existing document" htmlFor="document-picker-search">
            <div className="relative">
              <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <Input
                id="document-picker-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search documents…"
                className="pl-8"
              />
            </div>
          </Field>

          <div className="mt-3 flex flex-col gap-1.5">
            {loading ? (
              <SkeletonText lines={3} />
            ) : filtered.length === 0 ? (
              <EmptyState compact icon={FileText} title="No documents found" hint="Upload one above instead." />
            ) : (
              filtered.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between gap-3 rounded-md border border-separator-soft px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-text-primary">{doc.name}</p>
                    <p className="text-xs text-text-muted">{formatDate(doc.created_at)}</p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={attachingId !== null}
                    onClick={() => void attach(doc.id)}
                  >
                    <Upload size={13} aria-hidden="true" />
                    {attachingId === doc.id ? 'Attaching…' : 'Attach'}
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
