import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { cn } from '../../lib/cn';
import { IconButton } from '../ui/IconButton';
import { Menu } from '../ui/Menu';
import { Button } from '../ui/Button';
import {
  FLOOR_OBJECT_KINDS,
  assignmentsBySlot,
  floorObjectKindLabel,
  floorObjectLabel,
  objectGeometry,
  seatSlots,
} from '../../lib/seating/tableGeometry';
import { dragNewPosition, screenToLocal, type MatrixLike } from '../../lib/seating/pointerDrag';
import type { GuestIndexEntry } from '../../lib/seating/warnings';
import type { FloorObjectKind, FloorObjectWithAssignments } from '../../data/seating/types';

/** The room's fixed coordinate system, in centimetres — roughly to scale for a real venue floor
 *  (see the build plan's §3.2), not an arbitrary 0–100 grid. */
export const ROOM_WIDTH = 2000;
export const ROOM_HEIGHT = 1500;

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2.5;
/** Below this many screen pixels of pointer travel, a press is a TAP (open/place), not a DRAG. */
const DRAG_THRESHOLD_PX = 6;

interface DragState {
  kind: 'object' | 'pan';
  pointerId: number;
  objectId?: string;
  origin: { x: number; y: number };
  startLocal: { x: number; y: number };
  startScreen: { x: number; y: number };
  moved: boolean;
}

interface FloorCanvasProps {
  objects: FloorObjectWithAssignments[];
  guestIndex: Map<string, GuestIndexEntry>;
  /** Non-empty while the roster has an active selection — taps a table to seat them there
   *  instead of opening its detail sheet. */
  hasActiveSelection: boolean;
  /** Tap a table while a selection is active. */
  onPlaceSelection: (objectId: string) => void;
  /** Tap a table with no active selection. */
  onOpenTable: (objectId: string) => void;
  /** Fired once on `pointerup` at the end of a real drag (not a tap) — the caller persists it. */
  onMoveObject: (objectId: string, x: number, y: number) => void;
  onAddObject: (kind: FloorObjectKind) => void;
  className?: string;
}

/**
 * One `<svg viewBox="0 0 2000 1500">` rendering every floor object as a group at its own x/y/
 * rotation. Pan/zoom are on-screen buttons plus drag-on-empty-canvas — never pinch, since this
 * app locks phone zoom app-wide (see CLAUDE.md) — implemented as a `translate(pan) scale(zoom)`
 * group so `lib/seating/pointerDrag.ts`'s `getScreenCTM()`-based maths stays exactly the same
 * regardless of the current view: `getScreenCTM()` on the pan/zoom group folds in whatever pan and
 * zoom are current, and on the root `<svg>` folds in only the viewBox mapping.
 */
export function FloorCanvas({
  objects,
  guestIndex,
  hasActiveSelection,
  onPlaceSelection,
  onOpenTable,
  onMoveObject,
  onAddObject,
  className,
}: FloorCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const roomGroupRef = useRef<SVGGElement>(null);
  const dragRef = useRef<DragState | null>(null);

  const [view, setView] = useState({ panX: 0, panY: 0, zoom: 1 });
  const [dragPreview, setDragPreview] = useState<{ objectId: string; x: number; y: number } | null>(null);

  function ctmOf(el: SVGGraphicsElement | null): MatrixLike | null {
    const ctm = el?.getScreenCTM();
    if (!ctm) return null;
    return { a: ctm.a, b: ctm.b, c: ctm.c, d: ctm.d, e: ctm.e, f: ctm.f };
  }

  function handleBackgroundPointerDown(event: ReactPointerEvent<SVGRectElement>) {
    const ctm = ctmOf(svgRef.current);
    if (!ctm) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      kind: 'pan',
      pointerId: event.pointerId,
      origin: { x: view.panX, y: view.panY },
      startLocal: screenToLocal(ctm, event.clientX, event.clientY),
      startScreen: { x: event.clientX, y: event.clientY },
      moved: false,
    };
  }

  function handleObjectPointerDown(event: ReactPointerEvent<SVGGElement>, object: FloorObjectWithAssignments) {
    if (object.locked) return; // locked tables are still tappable, just not draggable
    event.stopPropagation();
    const ctm = ctmOf(roomGroupRef.current);
    if (!ctm) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      kind: 'object',
      pointerId: event.pointerId,
      objectId: object.id,
      origin: { x: object.x, y: object.y },
      startLocal: screenToLocal(ctm, event.clientX, event.clientY),
      startScreen: { x: event.clientX, y: event.clientY },
      moved: false,
    };
  }

  function handlePointerMove(event: ReactPointerEvent<SVGElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const travel = Math.hypot(event.clientX - drag.startScreen.x, event.clientY - drag.startScreen.y);
    if (travel > DRAG_THRESHOLD_PX) drag.moved = true;

    if (drag.kind === 'pan') {
      const ctm = ctmOf(svgRef.current);
      if (!ctm) return;
      const current = screenToLocal(ctm, event.clientX, event.clientY);
      const next = dragNewPosition(drag.origin, drag.startLocal, current);
      setView((v) => ({ ...v, panX: next.x, panY: next.y }));
    } else if (drag.objectId) {
      const ctm = ctmOf(roomGroupRef.current);
      if (!ctm) return;
      const current = screenToLocal(ctm, event.clientX, event.clientY);
      const next = dragNewPosition(drag.origin, drag.startLocal, current);
      setDragPreview({ objectId: drag.objectId, x: next.x, y: next.y });
    }
  }

  function handlePointerUp(event: ReactPointerEvent<SVGElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;

    if (drag.kind === 'object' && drag.objectId) {
      if (drag.moved && dragPreview && dragPreview.objectId === drag.objectId) {
        onMoveObject(drag.objectId, dragPreview.x, dragPreview.y);
      } else if (!drag.moved) {
        if (hasActiveSelection) onPlaceSelection(drag.objectId);
        else onOpenTable(drag.objectId);
      }
      setDragPreview(null);
    }
  }

  function zoomBy(factor: number) {
    setView((v) => ({ ...v, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor)) }));
  }

  function resetView() {
    setView({ panX: 0, panY: 0, zoom: 1 });
  }

  const addObjectItems = FLOOR_OBJECT_KINDS.map((kind) => ({
    key: kind,
    label: floorObjectKindLabel(kind),
    onSelect: () => onAddObject(kind),
  }));

  return (
    <div className={cn('relative overflow-hidden rounded-lg border border-separator bg-canvas', className)}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${ROOM_WIDTH} ${ROOM_HEIGHT}`}
        className="block h-[60vh] max-h-[640px] min-h-[320px] w-full touch-none"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <rect
          x={0}
          y={0}
          width={ROOM_WIDTH}
          height={ROOM_HEIGHT}
          className="fill-canvas"
          onPointerDown={handleBackgroundPointerDown}
        />
        <g ref={roomGroupRef} transform={`translate(${view.panX} ${view.panY}) scale(${view.zoom})`}>
          {objects.map((object) => {
            const isDragging = dragPreview?.objectId === object.id;
            const x = isDragging ? dragPreview!.x : object.x;
            const y = isDragging ? dragPreview!.y : object.y;
            return (
              <FloorObjectShape
                key={object.id}
                object={object}
                x={x}
                y={y}
                guestIndex={guestIndex}
                onPointerDown={(e) => handleObjectPointerDown(e, object)}
              />
            );
          })}
        </g>
      </svg>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2">
        <div className="pointer-events-auto flex gap-1 rounded-lg border border-separator bg-surface p-1 shadow-sm">
          <IconButton label="Zoom out" size="sm" onClick={() => zoomBy(1 / 1.25)}>
            <Minus size={15} aria-hidden="true" />
          </IconButton>
          <IconButton label="Reset view" size="sm" onClick={resetView}>
            <RotateCcw size={14} aria-hidden="true" />
          </IconButton>
          <IconButton label="Zoom in" size="sm" onClick={() => zoomBy(1.25)}>
            <Plus size={15} aria-hidden="true" />
          </IconButton>
        </div>

        <Menu
          align="right"
          label="Add a floor object"
          items={addObjectItems}
          trigger={(triggerProps) => (
            <Button type="button" size="sm" variant="secondary" className="pointer-events-auto shadow-sm" {...triggerProps}>
              <Plus size={14} aria-hidden="true" />
              Add
            </Button>
          )}
        />
      </div>
    </div>
  );
}

interface FloorObjectShapeProps {
  object: FloorObjectWithAssignments;
  x: number;
  y: number;
  guestIndex: Map<string, GuestIndexEntry>;
  onPointerDown: (event: ReactPointerEvent<SVGGElement>) => void;
}

function FloorObjectShape({ object, x, y, guestIndex, onPointerDown }: FloorObjectShapeProps) {
  const geometry = objectGeometry(object.kind, object.width, object.height);
  const slots = seatSlots(object.kind, object.capacity, object.width, object.height);
  const label = floorObjectLabel(object);
  const seatedCount = object.assignments.length;
  const overCapacity = object.capacity != null && seatedCount > object.capacity;
  const bySlot = assignmentsBySlot(object.assignments, slots.length);

  return (
    <g
      transform={`translate(${x} ${y}) rotate(${object.rotation})`}
      onPointerDown={onPointerDown}
      className={object.locked ? 'cursor-default' : 'cursor-grab'}
      data-floor-object-id={object.id}
    >
      {geometry.shape === 'circle' ? (
        <circle
          cx={geometry.cx}
          cy={geometry.cy}
          r={geometry.radius}
          className={cn('fill-surface', overCapacity ? 'stroke-danger-fg' : 'stroke-separator-strong')}
          strokeWidth={overCapacity ? 3 : 1.5}
        />
      ) : (
        <rect
          x={geometry.x}
          y={geometry.y}
          width={geometry.width}
          height={geometry.height}
          rx={6}
          className={cn('fill-surface', overCapacity ? 'stroke-danger-fg' : 'stroke-separator-strong')}
          strokeWidth={overCapacity ? 3 : 1.5}
        />
      )}

      {slots.map((slot, index) => {
        const assignment = bySlot.get(index);
        const entry = assignment ? guestIndex.get(assignment.guest_id) : undefined;
        const flagged =
          entry &&
          (entry.guest.dietary || entry.guest.allergies || (entry.guest.meal_preference && entry.guest.meal_preference !== 'standard'));
        const ringClass = entry?.guest.is_vip ? 'stroke-gold-500' : flagged ? 'stroke-warning-fg' : 'stroke-separator-strong';
        return (
          <circle
            key={index}
            cx={slot.x}
            cy={slot.y}
            r={9}
            className={cn(assignment ? 'fill-plum-600' : 'fill-surface', ringClass)}
            strokeWidth={entry?.guest.is_vip || flagged ? 2.5 : 1}
          />
        );
      })}

      {/* Rotate the label back upright regardless of the object's own rotation, so text never
          reads sideways or upside-down. */}
      <g transform={`rotate(${-object.rotation})`}>
        <text textAnchor="middle" dominantBaseline="middle" y={-4} fontSize={15} fontWeight={600} className="fill-text-primary">
          {label}
        </text>
        {object.capacity != null && (
          <text
            textAnchor="middle"
            dominantBaseline="middle"
            y={16}
            fontSize={12}
            className={overCapacity ? 'fill-danger-text' : 'fill-text-muted'}
          >
            {seatedCount}/{object.capacity} seated
          </text>
        )}
        {object.locked && <LockGlyph y={object.capacity != null ? 32 : 16} />}
      </g>
    </g>
  );
}

/** A small hand-drawn padlock — deliberately not a `lucide-react` icon nested inside this raw SVG
 *  tree; every other chart in this app (see `charts/DonutChart.tsx`) draws with plain primitives
 *  rather than mixing icon components into hand-built SVG. */
function LockGlyph({ y }: { y: number }) {
  return (
    <g transform={`translate(0 ${y})`} className="stroke-text-muted" strokeWidth={1.4} fill="none">
      <rect x={-5} y={-1} width={10} height={7} rx={1.3} />
      <path d="M -3 -1 v -2.5 a 3 3 0 0 1 6 0 v 2.5" />
    </g>
  );
}
