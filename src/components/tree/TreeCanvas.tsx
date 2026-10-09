import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { displayName, isUnknown, lifespan, type FamilyModel } from '@/domain/family/familyModel';
import { PERSON_H, PERSON_W, personNodeId, type LaidOutEdge, type TreeLayout } from '@/graph/layout';
import { useI18n } from '@/i18n/I18nProvider';
import { PHONE_SHEET_FRACTION } from '@/components/person/PersonDrawer';

const isPhone = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches;
/** Names must stay readable: fitting the tree never shrinks it below this; a bigger tree is centred on the chosen person instead. */
const MIN_FIT_ZOOM = 0.85;
const PHONE_FOCUS_ZOOM = 0.85;
const FOCUS_ZOOM = 0.9;

type PersonData = {
  name: string;
  years: string;
  gender: string;
  placeholder: boolean;
  selected: boolean;
  fallback: boolean;
  more: boolean;
  highlight: boolean;
  photo?: string;
  /** relationship to this device's "me" */
  relation?: string;
};

const GENDER_ACCENT: Record<string, string> = {
  male: 'border-l-sky-600',
  female: 'border-l-rose-500',
  other: 'border-l-violet-500',
  unknown: 'border-l-stone-300',
};

const PersonNode = memo(function PersonNode({ data }: NodeProps<Node<PersonData>>) {
  return (
    <div
      style={{ width: PERSON_W, height: PERSON_H }}
      title={data.name}
      className={`relative flex items-center gap-2.5 rounded-lg border border-l-[6px] bg-white px-2.5 shadow-sm ${GENDER_ACCENT[data.gender]} ${
        data.selected ? 'ring-2 ring-amber-700' : data.highlight ? 'bg-sky-50 ring-2 ring-sky-600' : ''
      } ${data.placeholder ? 'border-2 border-dashed border-stone-400 bg-stone-50' : 'border-stone-300'}`}
    >
      <Handle type="target" position={Position.Top} className="!invisible" />
      {data.photo && <img src={data.photo} alt="" draggable={false} crossOrigin="anonymous" className="size-12 shrink-0 rounded-full object-cover" />}
      <span className="flex min-w-0 flex-col">
        <span className={`line-clamp-2 text-base leading-tight font-medium ${data.fallback ? 'text-stone-600 italic' : 'text-stone-900'}`}>{data.name}</span>
        {data.years && <span className="truncate text-sm text-stone-600">{data.years}</span>}
        {data.relation && <span className="truncate text-sm font-medium text-sky-800">{data.relation}</span>}
      </span>
      {data.more && (
        <span aria-hidden className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full bg-amber-700 text-xs text-white">
          +
        </span>
      )}
      <Handle type="source" position={Position.Bottom} className="!invisible" />
    </div>
  );
});

const UnionNode = memo(function UnionNode() {
  return (
    <div className="size-2.5 rounded-full bg-stone-500">
      <Handle type="target" position={Position.Top} className="!invisible" />
      <Handle type="source" position={Position.Bottom} className="!invisible" />
    </div>
  );
});

const nodeTypes = { person: PersonNode, union: UnionNode };

// Edge appearance is UI metadata derived from relationship type; nothing here is stored.
function edgeStyle(e: LaidOutEdge): React.CSSProperties {
  if (e.kind === 'partner') return { stroke: '#78716c', strokeWidth: 1.5, strokeDasharray: e.ended ? '6 4' : undefined };
  const dash = { biological: undefined, unknown: undefined, adoptive: '7 4', step: '2 4', foster: '8 3 2 3', guardian: '8 3 2 3', mixed: '7 4' }[e.lineage];
  return { stroke: '#57534e', strokeWidth: 1.5, strokeDasharray: dash };
}

function fitOptions() {
  return { padding: 0.15, maxZoom: 1, minZoom: MIN_FIT_ZOOM, duration: 300 };
}

type Props = {
  model: FamilyModel;
  layout: TreeLayout & { more?: Set<string> };
  selectedId: string | null;
  /** people on a relationship path, highlighted together with the lines between them */
  highlight?: Set<string>;
  centerOn: string | null;
  /** the person the view is built around (centred when the tree is too big to fit) */
  focusId?: string | null;
  onSelect: (id: string) => void;
  /** profile thumbnail per person */
  photoUrl?: (personId: string) => string | undefined;
  /** relationship of each person to this device's "me" */
  relations?: Map<string, string>;
};

function Canvas({ model, layout, selectedId, highlight, centerOn, focusId, onSelect, photoUrl, relations }: Props) {
  const { lang, t } = useI18n();
  const flow = useReactFlow();

  const toNode = useCallback(
    (n: TreeLayout['nodes'][number], position?: { x: number; y: number }): Node => {
      if (n.kind === 'union') {
        return { id: `u:${n.id}`, type: 'union', position: position ?? { x: n.x, y: n.y }, data: {}, draggable: false, selectable: false };
      }
      const p = model.persons.get(n.id);
      const name = displayName(p, lang);
      return {
        id: personNodeId(n.id),
        type: 'person',
        position: position ?? { x: n.x, y: n.y },
        data: {
          name: isUnknown(p) ? t('person.unknownParent') : name.text,
          years: p ? lifespan(p, lang) : '',
          gender: p?.gender ?? 'unknown',
          placeholder: isUnknown(p),
          selected: n.id === selectedId,
          fallback: name.isFallback,
          more: Boolean(layout.more?.has(n.id)),
          highlight: Boolean(highlight?.has(n.id)),
          photo: photoUrl?.(n.id),
          relation: relations?.get(n.id),
        } satisfies PersonData,
        ariaLabel: name.text,
      };
    },
    [model, lang, t, selectedId, layout.more, highlight, photoUrl, relations],
  );

  // Nodes are local state so single boxes can be dragged. A new layout resets positions;
  // a change of selection or language only updates labels and keeps dragged positions.
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);

  // Centre a person. On phones the person panel covers the lower part of the screen,
  // so the person is placed in the visible space above it.
  const focus = useCallback(
    (id: string, zoom: number): boolean => {
      const n = layout.nodes.find((x) => x.kind === 'person' && x.id === id);
      if (!n) return false;
      const shift = isPhone() && selectedId ? (window.innerHeight * PHONE_SHEET_FRACTION) / 2 / zoom : 0;
      void flow.setCenter(n.x + n.width / 2, n.y + n.height / 2 + shift, { zoom, duration: 400 });
      return true;
    },
    [layout, flow, selectedId],
  );
  const lastLayout = useRef<TreeLayout | null>(null);
  useEffect(() => {
    const fresh = lastLayout.current !== layout;
    lastLayout.current = layout;
    setNodes((prev) => {
      const kept = fresh ? new Map() : new Map(prev.map((n) => [n.id, n.position]));
      return layout.nodes.map((n) => toNode(n, kept.get(n.kind === 'union' ? `u:${n.id}` : personNodeId(n.id))));
    });
    if (fresh)
      requestAnimationFrame(async () => {
        if (isPhone() && selectedId && focus(selectedId, PHONE_FOCUS_ZOOM)) return;
        await flow.fitView(fitOptions());
        // too big to fit readably: show the chosen person rather than the middle of the tree
        const anchor = selectedId ?? focusId;
        if (anchor && flow.getZoom() <= MIN_FIT_ZOOM + 0.01) focus(anchor, Math.max(flow.getZoom(), FOCUS_ZOOM));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new layout re-fits; selection changes are handled by centerOn
  }, [layout, toNode, setNodes, flow]);

  const edges: Edge[] = useMemo(() => {
    // a line is on the path if both people it joins are; a family-unit dot counts as the people it joins
    const viaDot = new Map<string, string[]>();
    for (const e of layout.edges) {
      for (const [dot, other] of [
        [e.target, e.source],
        [e.source, e.target],
      ] as const) {
        if (dot.startsWith('u:') && other.startsWith('p:')) viaDot.set(dot, [...(viaDot.get(dot) ?? []), other.slice(2)]);
      }
    }
    const onPath = (nodeId: string) =>
      nodeId.startsWith('p:') ? Boolean(highlight?.has(nodeId.slice(2))) : (viaDot.get(nodeId) ?? []).filter((p) => highlight?.has(p)).length >= 2;
    return layout.edges.map((e) => {
      const hot = Boolean(highlight?.size) && onPath(e.source) && onPath(e.target);
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: e.kind === 'partner' ? 'straight' : 'smoothstep',
        style: hot ? { ...edgeStyle(e), stroke: '#0284c7', strokeWidth: 3 } : edgeStyle(e),
        zIndex: hot ? 1 : 0,
        selectable: false,
      };
    });
  }, [layout, highlight]);

  // Dragging a box carries everything drawn below it: its family-unit dots, children,
  // grandchildren and so on. (A spouse joined through a dot stays where it is.)
  const below = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const e of layout.edges) map.set(e.source, [...(map.get(e.source) ?? []), e.target]);
    return map;
  }, [layout]);
  const dragStart = useRef<Map<string, { x: number; y: number }> | null>(null);

  const onNodeDragStart = useCallback(
    (_: unknown, node: Node) => {
      const start = new Map([[node.id, { ...node.position }]]);
      const queue = [...(below.get(node.id) ?? [])];
      while (queue.length) {
        const id = queue.shift()!;
        if (start.has(id)) continue;
        const pos = flow.getNode(id)?.position;
        if (pos) start.set(id, { ...pos });
        queue.push(...(below.get(id) ?? []));
      }
      dragStart.current = start;
    },
    [below, flow],
  );

  const onNodeDrag = useCallback(
    (_: unknown, node: Node) => {
      const start = dragStart.current;
      const origin = start?.get(node.id);
      if (!start || !origin) return;
      const dx = node.position.x - origin.x;
      const dy = node.position.y - origin.y;
      setNodes((ns) =>
        ns.map((n) => {
          const p = n.id !== node.id ? start.get(n.id) : undefined;
          return p ? { ...n, position: { x: p.x + dx, y: p.y + dy } } : n;
        }),
      );
    },
    [setNodes],
  );

  useEffect(() => {
    if (!centerOn) return;
    focus(centerOn, Math.max(flow.getZoom(), isPhone() ? PHONE_FOCUS_ZOOM : 0.9));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-centre only when asked to
  }, [centerOn, layout, flow]);

  // When a person is picked on a larger screen, the side panel narrows the tree; if their box
  // ends up hidden or cut off, slide the tree so it is fully visible (zoom unchanged).
  const wrapper = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selectedId || isPhone()) return;
    const t = setTimeout(() => {
      const n = flow.getNode(personNodeId(selectedId));
      const box = wrapper.current?.getBoundingClientRect();
      if (!n || !box) return;
      const { x, y, zoom } = flow.getViewport();
      const left = n.position.x * zoom + x;
      const top = n.position.y * zoom + y;
      const margin = 24;
      if (left < margin || top < margin || left + PERSON_W * zoom > box.width - margin || top + PERSON_H * zoom > box.height - margin) {
        void flow.setCenter(n.position.x + PERSON_W / 2, n.position.y + PERSON_H / 2, { zoom, duration: 300 });
      }
    }, 350); // after the panel's slide-in
    return () => clearTimeout(t);
  }, [selectedId, flow]);

  return (
    <div ref={wrapper} className="absolute inset-0">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={(e, node) => {
          onNodeDrag(e, node);
          dragStart.current = null;
        }}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => node.type === 'person' && onSelect(node.id.slice(2))}
        fitView
        fitViewOptions={fitOptions()}
        minZoom={0.1}
        maxZoom={2}
        nodesConnectable={false}
        // scroll / two-finger swipe moves the tree; pinch or Ctrl+scroll zooms; drag the background to pan
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        panOnDrag
      >
        <Background gap={24} color="#e7e5e4" />
        <Controls showInteractive={false} fitViewOptions={fitOptions()} className="tree-controls" />
      </ReactFlow>
    </div>
  );
}

export function TreeCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
