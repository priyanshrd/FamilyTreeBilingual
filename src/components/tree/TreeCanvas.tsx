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
import { displayName, lifespan, type FamilyModel } from '@/domain/family/familyModel';
import { PERSON_H, PERSON_W, personNodeId, type LaidOutEdge, type TreeLayout } from '@/graph/layout';
import { useI18n } from '@/i18n/I18nProvider';

type PersonData = { name: string; years: string; gender: string; placeholder: boolean; selected: boolean; fallback: boolean; more: boolean };

const GENDER_ACCENT: Record<string, string> = {
  male: 'border-l-sky-600',
  female: 'border-l-rose-500',
  other: 'border-l-violet-500',
  unknown: 'border-l-stone-400',
};

const PersonNode = memo(function PersonNode({ data }: NodeProps<Node<PersonData>>) {
  return (
    <div
      style={{ width: PERSON_W, height: PERSON_H }}
      className={`relative flex flex-col justify-center rounded-lg border border-l-4 bg-white px-3 shadow-sm ${GENDER_ACCENT[data.gender]} ${
        data.selected ? 'ring-2 ring-amber-700' : ''
      } ${data.placeholder ? 'border-dashed opacity-70' : 'border-stone-300'}`}
    >
      <Handle type="target" position={Position.Top} className="!invisible" />
      <span className={`truncate text-sm font-medium ${data.fallback ? 'text-stone-500 italic' : 'text-stone-900'}`}>{data.name}</span>
      {data.years && <span className="truncate text-xs text-stone-500">{data.years}</span>}
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

type Props = {
  model: FamilyModel;
  layout: TreeLayout & { more?: Set<string> };
  selectedId: string | null;
  centerOn: string | null;
  onSelect: (id: string) => void;
};

function Canvas({ model, layout, selectedId, centerOn, onSelect }: Props) {
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
          name: p?.isPlaceholder ? t('person.unknownParent') : name.text,
          years: p ? lifespan(p, lang) : '',
          gender: p?.gender ?? 'unknown',
          placeholder: Boolean(p?.isPlaceholder),
          selected: n.id === selectedId,
          fallback: name.isFallback,
          more: Boolean(layout.more?.has(n.id)),
        } satisfies PersonData,
        ariaLabel: name.text,
      };
    },
    [model, lang, t, selectedId, layout.more],
  );

  // Nodes are local state so single boxes can be dragged. A new layout resets positions;
  // a change of selection or language only updates labels and keeps dragged positions.
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const lastLayout = useRef<TreeLayout | null>(null);
  useEffect(() => {
    const fresh = lastLayout.current !== layout;
    lastLayout.current = layout;
    setNodes((prev) => {
      const kept = fresh ? new Map() : new Map(prev.map((n) => [n.id, n.position]));
      return layout.nodes.map((n) => toNode(n, kept.get(n.kind === 'union' ? `u:${n.id}` : personNodeId(n.id))));
    });
    if (fresh) requestAnimationFrame(() => void flow.fitView({ padding: 0.15, maxZoom: 1, duration: 300 }));
  }, [layout, toNode, setNodes, flow]);

  const edges: Edge[] = useMemo(
    () =>
      layout.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: e.kind === 'partner' ? 'straight' : 'smoothstep',
        style: edgeStyle(e),
        selectable: false,
      })),
    [layout],
  );

  useEffect(() => {
    if (!centerOn) return;
    const n = layout.nodes.find((x) => x.kind === 'person' && x.id === centerOn);
    if (n) void flow.setCenter(n.x + n.width / 2, n.y + n.height / 2, { zoom: Math.max(flow.getZoom(), 0.9), duration: 400 });
  }, [centerOn, layout, flow]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      nodeTypes={nodeTypes}
      onNodeClick={(_, node) => node.type === 'person' && onSelect(node.id.slice(2))}
      fitView
      fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
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
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

export function TreeCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
