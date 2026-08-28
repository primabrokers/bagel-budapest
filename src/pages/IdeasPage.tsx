import { useMemo, useState, type DragEvent } from 'react';
import { Lightbulb, MoreVertical, Plus } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';
import { Menu } from '../components/ui/Menu';
import { Tabs, type TabItem } from '../components/ui/Tabs';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { showToast } from '../hooks/useToast';
import { confirmDialog, promptDialog } from '../hooks/useConfirm';
import { useEventContext } from '../data/event/context';
import { useIdeaBoards } from '../data/ideas/hooks';
import { createBoard, deleteBoard, setIdeaStatus, updateBoard } from '../data/ideas/mutations';
import { IdeaCard } from '../components/ideas/IdeaCard';
import { IdeaSheet } from '../components/ideas/IdeaSheet';
import { IDEA_STATUSES, IDEA_STATUS_LABELS } from '../components/ideas/statusMeta';
import type { IdeaBoardRow, IdeaRow, IdeaStatus } from '../data/ideas/types';

type StatusFilter = 'all' | IdeaStatus;

const STATUS_TABS: TabItem<StatusFilter>[] = [
  { key: 'all', label: 'All' },
  ...IDEA_STATUSES.map((s) => ({ key: s, label: IDEA_STATUS_LABELS[s] })),
];

export function IdeasPage() {
  const { eventId } = useEventContext();
  const { data: boardsData, loading, reload } = useIdeaBoards();
  const boards = useMemo(() => boardsData ?? [], [boardsData]);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sheetState, setSheetState] = useState<{ idea: IdeaRow | null; defaultBoardId?: string } | null>(null);
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);

  const openIdea = useMemo(() => {
    if (!sheetState || !sheetState.idea) return null;
    // Re-derive from the live boards data (rather than the stale object captured when the sheet
    // opened) so an image upload or a status change made while the sheet is open is reflected.
    for (const board of boards) {
      const found = board.ideas.find((i) => i.id === sheetState.idea!.id);
      if (found) return found;
    }
    return sheetState.idea;
  }, [sheetState, boards]);

  function openAddIdea(defaultBoardId?: string) {
    setSheetState({ idea: null, defaultBoardId: defaultBoardId ?? boards[0]?.id });
  }

  function openEditIdea(idea: IdeaRow) {
    setSheetState({ idea });
  }

  async function handleChangeStatus(ideaId: string, status: IdeaStatus) {
    setStatusBusyId(ideaId);
    try {
      await setIdeaStatus(ideaId, status);
      reload();
    } catch {
      showToast('Could not move that idea — please try again.', 'error');
    } finally {
      setStatusBusyId(null);
    }
  }

  function handleDragStart(e: DragEvent<HTMLDivElement>, idea: IdeaRow) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', idea.id);
  }

  function handleDropOnStatus(e: DragEvent<HTMLDivElement>, status: IdeaStatus) {
    e.preventDefault();
    const ideaId = e.dataTransfer.getData('text/plain');
    if (ideaId) void handleChangeStatus(ideaId, status);
  }

  async function handleAddBoard() {
    const name = await promptDialog('Add an idea board', {
      input: { label: 'Board name', placeholder: 'e.g. Décor, Outfits, Favours', required: true },
    });
    if (!name) return;
    try {
      await createBoard(eventId, { name, sort_order: boards.length });
      showToast('Board added', 'success');
      reload();
    } catch {
      showToast('Could not add that board — please try again.', 'error');
    }
  }

  async function handleRenameBoard(board: IdeaBoardRow) {
    const name = await promptDialog('Rename board', { input: { label: 'Board name', defaultValue: board.name, required: true } });
    if (!name || name === board.name) return;
    try {
      await updateBoard(board.id, { name });
      showToast('Board renamed', 'success');
      reload();
    } catch {
      showToast('Could not rename that board — please try again.', 'error');
    }
  }

  async function handleDeleteBoard(board: IdeaBoardRow) {
    const ok = await confirmDialog(`Delete "${board.name}"?`, {
      body: 'This removes every idea on this board too. This cannot be undone.',
      tone: 'danger',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await deleteBoard(board.id);
      showToast('Board deleted', 'success');
      reload();
    } catch {
      showToast('Could not delete that board — please try again.', 'error');
    }
  }

  const phoneIdeas = useMemo(() => {
    const all = boards.flatMap((board) => board.ideas.map((idea) => ({ idea, boardName: board.name })));
    return statusFilter === 'all' ? all : all.filter((entry) => entry.idea.status === statusFilter);
  }, [boards, statusFilter]);

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-6">
      <PageHeader
        title="Ideas"
        subtitle="A moodboard for the day — inspiration through to what's actually happening."
        actions={
          <>
            <Button type="button" variant="secondary" onClick={() => void handleAddBoard()}>
              <Plus size={15} aria-hidden="true" />
              Add board
            </Button>
            <Button type="button" onClick={() => openAddIdea()} disabled={boards.length === 0}>
              <Plus size={15} aria-hidden="true" />
              Add idea
            </Button>
          </>
        }
      />

      {loading && !boardsData ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      ) : boards.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title="No idea boards yet"
          hint="Start one for décor, outfits, favours — whatever you're collecting inspiration for."
          action={
            <Button type="button" size="sm" onClick={() => void handleAddBoard()}>
              <Plus size={14} aria-hidden="true" />
              Add board
            </Button>
          }
        />
      ) : (
        <>
          {/* Desktop drag enhancement: drop a card here to move its status. The per-card
              status Menu is the primary path and works identically on every breakpoint. */}
          <div className="mb-4 hidden flex-wrap gap-2 lg:flex">
            {IDEA_STATUSES.map((status) => (
              // A native HTML5 drag DROP TARGET (`onDragOver`/`onDrop`), which has no keyboard
              // equivalent to add — dragging is pointer-only by definition. Every card's own
              // status `Menu` is the keyboard- and screen-reader-reachable way to do the same
              // move.
              // eslint-disable-next-line jsx-a11y/no-static-element-interactions
              <div
                key={status}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDropOnStatus(e, status)}
                className="rounded-full border border-dashed border-separator-strong px-3 py-1 text-xs font-medium text-text-muted"
              >
                Drop to mark <span className="font-semibold text-text-secondary">{IDEA_STATUS_LABELS[status]}</span>
              </div>
            ))}
          </div>

          {/* Board columns — one per bm_idea_boards row, real side-by-side kanban from `lg` up
              with its own contained horizontal scroll. Below `lg` this collapses to a single
              status-filtered grid across every board, per the phone rule this app uses
              elsewhere (see VendorsPage's board-vs-list split) — side-scrolling columns read
              poorly at 390px. */}
          <div className="hidden gap-4 overflow-x-auto pb-2 lg:flex">
            {boards.map((board) => (
              <div key={board.id} className="flex w-72 shrink-0 flex-col gap-2">
                <div className="flex items-center justify-between gap-2 px-0.5">
                  <h2 className="truncate text-xs font-semibold uppercase tracking-[.04em] text-text-muted">
                    {board.name} <span className="text-text-faint">· {board.ideas.length}</span>
                  </h2>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <IconButton label={`Add idea to ${board.name}`} size="sm" onClick={() => openAddIdea(board.id)}>
                      <Plus size={14} aria-hidden="true" />
                    </IconButton>
                    <Menu
                      label={`${board.name} board actions`}
                      trigger={(props) => (
                        <IconButton
                          ref={props.ref}
                          label={`${board.name} board actions`}
                          size="sm"
                          aria-haspopup={props['aria-haspopup']}
                          aria-expanded={props['aria-expanded']}
                          onClick={props.onClick}
                        >
                          <MoreVertical size={14} aria-hidden="true" />
                        </IconButton>
                      )}
                      items={[
                        { key: 'rename', label: 'Rename board', onSelect: () => void handleRenameBoard(board) },
                        { key: 'delete', label: 'Delete board', tone: 'danger', separatorBefore: true, onSelect: () => void handleDeleteBoard(board) },
                      ]}
                    />
                  </div>
                </div>
                {board.ideas.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-separator px-3 py-4 text-center text-2xs text-text-faint">No ideas yet</p>
                ) : (
                  board.ideas.map((idea) => (
                    <IdeaCard
                      key={idea.id}
                      idea={idea}
                      onOpen={() => openEditIdea(idea)}
                      onChangeStatus={(status) => void handleChangeStatus(idea.id, status)}
                      statusBusy={statusBusyId === idea.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, idea)}
                    />
                  ))
                )}
              </div>
            ))}
          </div>

          <div className="lg:hidden">
            <Tabs
              items={STATUS_TABS}
              value={statusFilter}
              onChange={setStatusFilter}
              ariaLabel="Filter ideas by status"
              variant="pill"
              className="mb-4"
            />
            {phoneIdeas.length === 0 ? (
              <EmptyState
                icon={Lightbulb}
                title={statusFilter === 'all' ? 'No ideas yet' : 'No ideas with that status'}
                hint={statusFilter === 'all' ? 'Add your first idea to a board.' : 'Try a different status, or "All".'}
                action={
                  statusFilter === 'all' && (
                    <Button type="button" size="sm" onClick={() => openAddIdea()}>
                      <Plus size={14} aria-hidden="true" />
                      Add idea
                    </Button>
                  )
                }
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {phoneIdeas.map(({ idea, boardName }) => (
                  <IdeaCard
                    key={idea.id}
                    idea={idea}
                    boardName={boardName}
                    onOpen={() => openEditIdea(idea)}
                    onChangeStatus={(status) => void handleChangeStatus(idea.id, status)}
                    statusBusy={statusBusyId === idea.id}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <IdeaSheet
        open={sheetState !== null}
        onClose={() => setSheetState(null)}
        idea={openIdea}
        boards={boards}
        defaultBoardId={sheetState?.defaultBoardId}
        onSaved={reload}
      />
    </div>
  );
}
