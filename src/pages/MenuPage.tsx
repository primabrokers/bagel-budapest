import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Star, Trash2, UtensilsCrossed } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';
import { Badge } from '../components/ui/Badge';
import { Tabs, type TabItem } from '../components/ui/Tabs';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { cn } from '../lib/cn';
import { showToast } from '../hooks/useToast';
import { confirmDialog } from '../hooks/useConfirm';
import { useEventContext } from '../data/event/context';
import { useFunctions } from '../data/event/hooks';
import { useMenus } from '../data/menus/hooks';
import { deleteMenu, setMenuFinal } from '../data/menus/mutations';
import { MenuEditor } from '../components/menus/MenuEditor';
import { MenuSheet } from '../components/menus/MenuSheet';
import { CateringSummaryCard } from '../components/menus/CateringSummaryCard';
import type { MenuWithSections } from '../data/menus/types';

const GENERAL_KEY = '__general__';

export function MenuPage() {
  const { eventId } = useEventContext();
  const { data: functions, loading: functionsLoading } = useFunctions();
  const { data: menus, loading: menusLoading, reload } = useMenus();

  const [functionKey, setFunctionKey] = useState<string>(GENERAL_KEY);
  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null);
  const [menuSheetMode, setMenuSheetMode] = useState<'closed' | 'add' | 'rename'>('closed');
  const [busy, setBusy] = useState(false);

  // Default to the first function once functions have loaded, rather than sitting on "General"
  // when the family almost always plans menus per function.
  useEffect(() => {
    if (functionKey !== GENERAL_KEY) return;
    if (functions && functions.length > 0) setFunctionKey(functions[0].id);
  }, [functions, functionKey]);

  const functionTabs = useMemo<TabItem<string>[]>(() => {
    const tabs = (functions ?? []).map((f) => ({ key: f.id, label: f.name }));
    return [...tabs, { key: GENERAL_KEY, label: 'General' }];
  }, [functions]);

  const selectedFunctionId = functionKey === GENERAL_KEY ? null : functionKey;
  const selectedFunctionName = functions?.find((f) => f.id === selectedFunctionId)?.name ?? 'General';

  const menusForFunction = useMemo(
    () => (menus ?? []).filter((m) => m.function_id === selectedFunctionId),
    [menus, selectedFunctionId],
  );

  const selectedMenu: MenuWithSections | null =
    menusForFunction.find((m) => m.id === selectedMenuId) ??
    menusForFunction.find((m) => m.is_final) ??
    menusForFunction[0] ??
    null;

  function handleFunctionChange(key: string) {
    setFunctionKey(key);
    setSelectedMenuId(null);
  }

  async function handleToggleFinal() {
    if (!selectedMenu) return;
    setBusy(true);
    try {
      await setMenuFinal(selectedMenu.id, !selectedMenu.is_final);
      showToast(selectedMenu.is_final ? 'Unmarked as final' : 'Marked as final', 'success');
      reload();
    } catch {
      showToast('Could not update that menu — please try again.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteMenu() {
    if (!selectedMenu) return;
    const ok = await confirmDialog(`Remove "${selectedMenu.name}"?`, {
      body: 'This removes every section and dish in this version. This cannot be undone.',
      tone: 'danger',
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteMenu(selectedMenu.id);
      showToast('Menu removed', 'success');
      setSelectedMenuId(null);
      reload();
    } catch {
      showToast('Could not remove that menu — please try again.', 'error');
    } finally {
      setBusy(false);
    }
  }

  const loading = (functionsLoading && !functions) || (menusLoading && !menus);

  return (
    <div className="mx-auto max-w-4xl p-4 lg:p-6">
      <PageHeader title="Menu" subtitle="Sections, dishes, allergens and catering numbers, per function." />

      {loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-9 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      ) : (
        <>
          <Tabs items={functionTabs} value={functionKey} onChange={handleFunctionChange} ariaLabel="Function" className="mb-4" />

          <div className="mb-4 flex flex-wrap items-center gap-2">
            {menusForFunction.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedMenuId(m.id)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors max-sm:min-h-[44px]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400',
                  m.id === selectedMenu?.id
                    ? 'border-plum-700 bg-plum-50 text-plum-800'
                    : 'border-separator-control bg-surface text-text-secondary hover:bg-hover',
                )}
              >
                {m.is_final && <Star size={12} aria-hidden="true" className="fill-gold-500 text-gold-500" />}
                {m.name}
                {m.version_label ? ` — ${m.version_label}` : ''}
              </button>
            ))}
            <Button type="button" variant="secondary" size="sm" onClick={() => setMenuSheetMode('add')}>
              <Plus size={14} aria-hidden="true" />
              Add version
            </Button>
          </div>

          {selectedFunctionId && <CateringSummaryCard functionId={selectedFunctionId} functionName={selectedFunctionName} />}

          <div className="mt-4">
            {!selectedMenu ? (
              <EmptyState
                icon={UtensilsCrossed}
                title="No menu yet"
                hint={`Add a first version for ${selectedFunctionId ? selectedFunctionName : 'the event'}.`}
                action={
                  <Button type="button" size="sm" onClick={() => setMenuSheetMode('add')}>
                    <Plus size={14} aria-hidden="true" />
                    Add version
                  </Button>
                }
              />
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Badge variant={selectedMenu.is_final ? 'success' : 'muted'}>{selectedMenu.is_final ? 'Final' : 'Draft'}</Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => void handleToggleFinal()}>
                      <Star size={14} aria-hidden="true" />
                      {selectedMenu.is_final ? 'Unmark final' : 'Mark final'}
                    </Button>
                    <IconButton label="Rename menu" size="sm" disabled={busy} onClick={() => setMenuSheetMode('rename')}>
                      <Pencil size={14} aria-hidden="true" />
                    </IconButton>
                    <IconButton label="Delete menu" size="sm" disabled={busy} onClick={() => void handleDeleteMenu()}>
                      <Trash2 size={14} aria-hidden="true" />
                    </IconButton>
                  </div>
                </div>

                <MenuEditor eventId={eventId} menu={selectedMenu} onReload={reload} />
              </>
            )}
          </div>
        </>
      )}

      <MenuSheet
        open={menuSheetMode !== 'closed'}
        onClose={() => setMenuSheetMode('closed')}
        eventId={eventId}
        functionId={selectedFunctionId}
        menu={menuSheetMode === 'rename' ? selectedMenu : null}
        onSaved={reload}
      />
    </div>
  );
}
