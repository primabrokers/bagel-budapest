import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Field, Input } from '../ui/Field';
import { showToast } from '../../hooks/useToast';
import { useEventContext } from '../../data/event/context';
import { updateEvent, uploadEventBrandingImage } from '../../data/event/mutations';
import { supabase } from '../../lib/supabase';
import type { EventPalette, EventRow } from '../../data/event/types';

// Sensible plum/gold defaults for a family that hasn't picked their own yet — the same plum-700 /
// gold-500 rungs the rest of the design system is built on (see tailwind.config.ts).
const DEFAULT_PRIMARY_HEX = '#4A2545';
const DEFAULT_ACCENT_HEX = '#C29A3C';

interface StyleSectionProps {
  event: EventRow;
  onSaved: () => void;
}

function brandingUrl(path: string | null): string | null {
  if (!path) return null;
  return supabase.storage.from('bm-branding').getPublicUrl(path).data.publicUrl;
}

export function StyleSection({ event, onSaved }: StyleSectionProps) {
  const { eventId } = useEventContext();
  const [dressCode, setDressCode] = useState(event.dress_code ?? '');
  const [theme, setTheme] = useState(event.theme ?? '');
  const [primaryHex, setPrimaryHex] = useState(event.palette.primaryHex ?? DEFAULT_PRIMARY_HEX);
  const [accentHex, setAccentHex] = useState(event.palette.accentHex ?? DEFAULT_ACCENT_HEX);
  const [saving, setSaving] = useState(false);
  const [monogramPath, setMonogramPath] = useState(event.monogram_path);
  const [logoPath, setLogoPath] = useState(event.logo_path);
  const [uploadingMonogram, setUploadingMonogram] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const palette: EventPalette = { primaryHex, accentHex };
      await updateEvent(eventId, {
        dress_code: dressCode.trim() || null,
        theme: theme.trim() || null,
        palette,
      });
      showToast('Saved', 'success');
      onSaved();
    } catch {
      showToast('Could not save — please try again.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(kind: 'monogram' | 'logo', e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const setUploading = kind === 'monogram' ? setUploadingMonogram : setUploadingLogo;
    setUploading(true);
    try {
      const path = await uploadEventBrandingImage(eventId, kind, file);
      if (kind === 'monogram') setMonogramPath(path);
      else setLogoPath(path);
      showToast(kind === 'monogram' ? 'Monogram uploaded' : 'Logo uploaded', 'success');
      onSaved();
    } catch {
      showToast('Could not upload — please try again.', 'error');
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-text-primary">Style</h2>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Dress code" htmlFor="settings-dress-code">
            <Input
              id="settings-dress-code"
              value={dressCode}
              onChange={(e) => setDressCode(e.target.value)}
              placeholder="e.g. Smart casual"
            />
          </Field>
          <Field label="Theme" htmlFor="settings-theme">
            <Input
              id="settings-theme"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="e.g. Navy & gold"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Primary colour" htmlFor="settings-primary-hex">
            <div className="flex items-center gap-2">
              <input
                id="settings-primary-hex"
                type="color"
                value={primaryHex}
                onChange={(e) => setPrimaryHex(e.target.value)}
                className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-separator-control bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400"
              />
              <span className="text-sm text-text-muted">{primaryHex}</span>
            </div>
          </Field>
          <Field label="Accent colour" htmlFor="settings-accent-hex">
            <div className="flex items-center gap-2">
              <input
                id="settings-accent-hex"
                type="color"
                value={accentHex}
                onChange={(e) => setAccentHex(e.target.value)}
                className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-separator-control bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400"
              />
              <span className="text-sm text-text-muted">{accentHex}</span>
            </div>
          </Field>
        </div>

        <Button type="submit" disabled={saving} className="self-start">
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </form>

      <div className="mt-5 grid grid-cols-1 gap-4 border-t border-separator pt-4 sm:grid-cols-2">
        <BrandingUpload
          label="Monogram"
          path={monogramPath}
          uploading={uploadingMonogram}
          onChange={(e) => void handleUpload('monogram', e)}
        />
        <BrandingUpload
          label="Logo"
          path={logoPath}
          uploading={uploadingLogo}
          onChange={(e) => void handleUpload('logo', e)}
        />
      </div>
    </Card>
  );
}

function BrandingUpload({
  label,
  path,
  uploading,
  onChange,
}: {
  label: string;
  path: string | null;
  uploading: boolean;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  const url = brandingUrl(path);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-text-secondary">{label}</p>
      {url && (
        <img
          src={url}
          alt={`${label} preview`}
          className="h-16 w-16 rounded-md border border-separator bg-canvas object-contain"
        />
      )}
      <label className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-md border border-separator-control bg-surface px-3 py-1.5 text-sm text-text-primary hover:bg-hover focus-within:outline-none focus-within:ring-2 focus-within:ring-plum-400">
        {uploading ? 'Uploading…' : `Upload ${label.toLowerCase()}`}
        <input type="file" accept="image/*" className="sr-only" onChange={onChange} disabled={uploading} />
      </label>
    </div>
  );
}
