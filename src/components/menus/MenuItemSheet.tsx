import { useEffect, useState } from 'react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { Field, Input, Select, Textarea } from '../ui/Field';
import { Toggle } from '../ui/Toggle';
import { showToast } from '../../hooks/useToast';
import { useVendors } from '../../data/vendors/hooks';
import { createMenuItem, updateMenuItem } from '../../data/menus/mutations';
import { normaliseMoneyInput, parseMoneyInput } from '../../lib/format';
import type { MenuItemRow } from '../../data/menus/types';

interface MenuItemSheetProps {
  open: boolean;
  onClose: () => void;
  eventId: string;
  sectionId: string;
  /** Null means "add an item"; otherwise the item being edited. */
  item: MenuItemRow | null;
  onSaved: () => void;
}

interface ItemFormState {
  name: string;
  description: string;
  vendor_id: string;
  cost: string;
  quantity: string;
  serving_style: string;
  /** Comma-separated in the UI, split into `text[]` on save — a simpler control than a tag
   *  picker for a list that is usually two or three words long ("Nuts, Dairy, Gluten"). */
  allergens: string;
  approved: boolean;
}

const EMPTY_FORM: ItemFormState = {
  name: '',
  description: '',
  vendor_id: '',
  cost: '',
  quantity: '',
  serving_style: '',
  allergens: '',
  approved: false,
};

function rowToForm(item: MenuItemRow): ItemFormState {
  return {
    name: item.name,
    description: item.description ?? '',
    vendor_id: item.vendor_id ?? '',
    cost: item.cost != null ? String(item.cost) : '',
    quantity: item.quantity != null ? String(item.quantity) : '',
    serving_style: item.serving_style ?? '',
    allergens: item.allergens.join(', '),
    approved: item.approved,
  };
}

function parseAllergens(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Create/edit form for one dish within a menu section — name, description, an optional vendor
 *  link, cost/quantity/serving style, a free-text allergen list, and the approved toggle. */
export function MenuItemSheet({ open, onClose, eventId, sectionId, item, onSaved }: MenuItemSheetProps) {
  const { data: vendors } = useVendors();
  const [form, setForm] = useState<ItemFormState>(EMPTY_FORM);
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [costError, setCostError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(item ? rowToForm(item) : EMPTY_FORM);
    setNameError(undefined);
    setCostError(undefined);
  }, [open, item]);

  function set<K extends keyof ItemFormState>(key: K, value: ItemFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit() {
    const name = form.name.trim();
    if (!name) {
      setNameError('Give the dish a name.');
      return;
    }

    const { value: cost, reason: costReason } = parseMoneyInput(form.cost, { allowShorthand: true });
    if (costReason === 'unparseable') {
      setCostError(`Could not read "${form.cost}" as an amount.`);
      return;
    }

    const quantity = form.quantity.trim() ? Number(form.quantity) : null;
    if (quantity != null && !Number.isFinite(quantity)) {
      showToast(`Could not read "${form.quantity}" as a quantity.`, 'error');
      return;
    }

    setSaving(true);
    try {
      const patch = {
        name,
        description: form.description.trim() || null,
        vendor_id: form.vendor_id || null,
        cost,
        quantity,
        serving_style: form.serving_style.trim() || null,
        allergens: parseAllergens(form.allergens),
        approved: form.approved,
      };
      if (item) {
        await updateMenuItem(item.id, patch);
      } else {
        await createMenuItem(eventId, sectionId, patch);
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
      title={item ? 'Edit dish' : 'Add dish'}
      anchor="drawer"
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
        <Field label="Name" htmlFor="menu-item-name" required error={nameError}>
          <Input
            id="menu-item-name"
            value={form.name}
            invalid={!!nameError}
            onChange={(e) => {
              set('name', e.target.value);
              if (nameError) setNameError(undefined);
            }}
          />
        </Field>

        <Field label="Description" htmlFor="menu-item-description">
          <Textarea id="menu-item-description" value={form.description} onChange={(e) => set('description', e.target.value)} rows={2} />
        </Field>

        <Field label="Vendor" htmlFor="menu-item-vendor">
          <Select id="menu-item-vendor" value={form.vendor_id} onChange={(e) => set('vendor_id', e.target.value)}>
            <option value="">None</option>
            {(vendors ?? []).map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Cost" htmlFor="menu-item-cost" error={costError}>
            <Input
              id="menu-item-cost"
              inputMode="decimal"
              placeholder="£"
              value={form.cost}
              invalid={!!costError}
              onChange={(e) => {
                set('cost', e.target.value);
                if (costError) setCostError(undefined);
              }}
              onBlur={(e) => set('cost', normaliseMoneyInput(e.target.value))}
            />
          </Field>
          <Field label="Quantity" htmlFor="menu-item-quantity">
            <Input id="menu-item-quantity" inputMode="numeric" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} />
          </Field>
        </div>

        <Field label="Serving style" htmlFor="menu-item-serving-style" hint="e.g. Plated, Buffet, Family style">
          <Input id="menu-item-serving-style" value={form.serving_style} onChange={(e) => set('serving_style', e.target.value)} />
        </Field>

        <Field label="Allergens" htmlFor="menu-item-allergens" hint="Comma-separated, e.g. Nuts, Dairy, Gluten">
          <Input id="menu-item-allergens" value={form.allergens} onChange={(e) => set('allergens', e.target.value)} />
        </Field>

        <div className="flex items-center justify-between gap-3 rounded-md border border-separator-soft bg-canvas px-3 py-2">
          <span className="text-sm text-text-secondary">Approved</span>
          <Toggle checked={form.approved} onChange={(v) => set('approved', v)} label="Approved" />
        </div>
      </div>
    </Sheet>
  );
}
