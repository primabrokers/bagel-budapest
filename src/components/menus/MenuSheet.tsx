import { useEffect, useState } from 'react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { Field, Input } from '../ui/Field';
import { showToast } from '../../hooks/useToast';
import { createMenu, updateMenu } from '../../data/menus/mutations';
import type { MenuRow } from '../../data/menus/types';

interface MenuSheetProps {
  open: boolean;
  onClose: () => void;
  eventId: string;
  /** The function this menu belongs to — null for an event-wide menu. Only used when creating. */
  functionId: string | null;
  /** Null means "add a new version"; otherwise the menu being renamed. */
  menu: MenuRow | null;
  onSaved: () => void;
}

/** The small create/rename form for a menu "version" — just its name and version label. Approval
 *  (`setMenuFinal`) and section/item content are handled elsewhere (`MenuPage`/`MenuEditor`). */
export function MenuSheet({ open, onClose, eventId, functionId, menu, onSaved }: MenuSheetProps) {
  const [name, setName] = useState('');
  const [versionLabel, setVersionLabel] = useState('');
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(menu?.name ?? 'Menu');
    setVersionLabel(menu?.version_label ?? '');
    setNameError(undefined);
  }, [open, menu]);

  async function handleSubmit() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError('Give this menu a name.');
      return;
    }
    setSaving(true);
    try {
      if (menu) {
        await updateMenu(menu.id, { name: trimmedName, version_label: versionLabel.trim() || null });
      } else {
        await createMenu(eventId, {
          function_id: functionId,
          name: trimmedName,
          version_label: versionLabel.trim() || null,
        });
      }
      showToast('Saved', 'success');
      onSaved();
      onClose();
    } catch {
      showToast('Could not save — please try again.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={menu ? 'Rename menu' : 'Add menu version'}
      anchor="drawer"
      size="sm"
      layer="raised"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Name" htmlFor="menu-name" required error={nameError}>
          <Input
            id="menu-name"
            value={name}
            invalid={!!nameError}
            onChange={(e) => {
              setName(e.target.value);
              if (nameError) setNameError(undefined);
            }}
          />
        </Field>
        <Field label="Version label" htmlFor="menu-version-label" hint="e.g. Caterer's first draft, Final">
          <Input id="menu-version-label" value={versionLabel} onChange={(e) => setVersionLabel(e.target.value)} />
        </Field>
      </div>
    </Sheet>
  );
}
