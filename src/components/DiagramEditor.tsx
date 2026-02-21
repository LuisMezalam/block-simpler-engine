import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  DiagramState, DiagramNode, DiagramEdge, NodeType,
  genId, analyzeDiagram,
  createSeriesTemplate, createFeedbackTemplate, createParallelTemplate,
} from "@/lib/diagramEngine";
import { SolverResult } from "@/lib/solver";
import { cn } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

const BLOCK_W = 120;
const BLOCK_H = 50;
const JUNCTION_R = 16;
const PORT_R = 5;
const GRID_SNAP = 10;

function snap(v: number): number {
  return Math.round(v / GRID_SNAP) * GRID_SNAP;
}

// ─── Undo/Redo Hook ──────────────────────────────────────────────────────────

function useHistory(initial: DiagramState) {
  const [history, setHistory] = useState<DiagramState[]>([initial]);
  const [index, setIndex] = useState(0);

  const current = history[index];

  const push = useCallback((state: DiagramState) => {
    setHistory(prev => {
      const next = prev.slice(0, index + 1);
      next.push(state);
      if (next.length > 50) next.shift(); // cap
      return next;
    });
    setIndex(prev => Math.min(prev + 1, 50));
  }, [index]);

  const undo = useCallback(() => {
    setIndex(prev => Math.max(0, prev - 1));
  }, []);

  const redo = useCallback(() => {
    setIndex(prev => Math.min(prev + 1, history.length - 1));
  }, [history.length]);

  const reset = useCallback((state: DiagramState) => {
    setHistory([state]);
    setIndex(0);
  }, []);

  const canUndo = index > 0;
  const canRedo = index < history.length - 1;

  return { current, push, undo, redo, reset, canUndo, canRedo };
}

// ─── Port positions ──────────────────────────────────────────────────────────

function getInputPort(node: DiagramNode): { x: number; y: number } {
  switch (node.type) {
    case "block": return { x: node.x, y: node.y + BLOCK_H / 2 };
    case "summing":
    case "pickoff": return { x: node.x - JUNCTION_R, y: node.y };
    case "output": return { x: node.x, y: node.y };
    case "input": return { x: node.x, y: node.y };
  }
}

function getOutputPort(node: DiagramNode): { x: number; y: number } {
  switch (node.type) {
    case "block": return { x: node.x + BLOCK_W, y: node.y + BLOCK_H / 2 };
    case "summing":
    case "pickoff": return { x: node.x + JUNCTION_R, y: node.y };
    case "input": return { x: node.x + 20, y: node.y };
    case "output": return { x: node.x, y: node.y };
  }
}

// ─── SVG sub-components ──────────────────────────────────────────────────────

function BlockNode({
  node, selected, onMouseDown, onEditTF,
}: {
  node: DiagramNode;
  selected: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onEditTF: (id: string) => void;
}) {
  const isFeedback = /^H/i.test(node.label);
  const strokeColor = selected
    ? "hsl(196,85%,50%)"
    : isFeedback ? "hsl(45,80%,55%)" : "hsl(174,60%,35%)";
  const accentColor = isFeedback ? "hsl(45,80%,55%)" : "hsl(174,80%,45%)";
  const labelColor = isFeedback ? "hsl(45,60%,50%)" : "hsl(215,15%,55%)";

  return (
    <g onMouseDown={onMouseDown} onDoubleClick={(e) => { e.stopPropagation(); onEditTF(node.id); }} style={{ cursor: "grab" }}>
      <rect
        x={node.x} y={node.y}
        width={BLOCK_W} height={BLOCK_H}
        rx={6}
        fill="hsl(220,18%,13%)"
        stroke={strokeColor}
        strokeWidth={selected ? 2.5 : 1.5}
        className="transition-all"
      />
      {/* Role badge */}
      <rect x={node.x + 3} y={node.y + 3} width={18} height={11} rx={3}
        fill={accentColor} opacity={0.25} />
      <text x={node.x + 12} y={node.y + 11}
        textAnchor="middle" fill={accentColor}
        fontSize={7} fontFamily="monospace" fontWeight="700"
      >
        {isFeedback ? "H" : "G"}
      </text>

      <text
        x={node.x + BLOCK_W / 2} y={node.y + 17}
        textAnchor="middle" fill={labelColor}
        fontSize={10} fontFamily="monospace"
      >
        {node.label}(s)
      </text>
      {node.tf && (
        <>
          <text
            x={node.x + BLOCK_W / 2} y={node.y + 30}
            textAnchor="middle" fill={accentColor}
            fontSize={9} fontFamily="monospace" fontWeight="500"
          >
            {node.tf.num}
          </text>
          <line x1={node.x + 15} y1={node.y + 33} x2={node.x + BLOCK_W - 15} y2={node.y + 33}
            stroke={accentColor} strokeWidth={0.8} opacity={0.6} />
          <text
            x={node.x + BLOCK_W / 2} y={node.y + 43}
            textAnchor="middle" fill={accentColor}
            fontSize={9} fontFamily="monospace" fontWeight="500"
          >
            {node.tf.den}
          </text>
        </>
      )}
      {/* Edit icon */}
      <g
        onClick={(e) => { e.stopPropagation(); onEditTF(node.id); }}
        style={{ cursor: "pointer" }}
      >
        <rect
          x={node.x + BLOCK_W - 18} y={node.y + 2}
          width={14} height={14} rx={3}
          fill={accentColor} opacity={0.2}
        />
        <text
          x={node.x + BLOCK_W - 11} y={node.y + 12}
          textAnchor="middle" fill={accentColor}
          fontSize={8}
        >
          ✎
        </text>
      </g>
      {/* Input port */}
      <circle cx={node.x} cy={node.y + BLOCK_H / 2} r={PORT_R}
        fill="hsl(220,18%,16%)" stroke={accentColor} strokeWidth={1.5} />
      {/* Output port */}
      <circle cx={node.x + BLOCK_W} cy={node.y + BLOCK_H / 2} r={PORT_R}
        fill="hsl(220,18%,16%)" stroke={accentColor} strokeWidth={1.5} />
    </g>
  );
}

function SummingNode({
  node, selected, onMouseDown,
}: {
  node: DiagramNode;
  selected: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  return (
    <g onMouseDown={onMouseDown} style={{ cursor: "grab" }}>
      <circle
        cx={node.x} cy={node.y} r={JUNCTION_R}
        fill="hsl(220,18%,16%)"
        stroke={selected ? "hsl(196,85%,50%)" : "hsl(174,80%,55%)"}
        strokeWidth={selected ? 2.5 : 1.5}
      />
      <text
        x={node.x} y={node.y + 4}
        textAnchor="middle" fill="hsl(174,80%,55%)"
        fontSize={13} fontFamily="monospace"
      >
        ⊕
      </text>
      {node.signs && Object.entries(node.signs).map(([, sign], i) => (
        <text
          key={i}
          x={node.x - JUNCTION_R - 4}
          y={node.y + JUNCTION_R + 12 + i * 10}
          fill={sign === "-" ? "hsl(0,75%,65%)" : "hsl(174,80%,55%)"}
          fontSize={9} fontFamily="monospace"
        >
          {sign}
        </text>
      ))}
    </g>
  );
}

function PickoffNode({
  node, selected, onMouseDown,
}: {
  node: DiagramNode;
  selected: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  return (
    <g onMouseDown={onMouseDown} style={{ cursor: "grab" }}>
      <circle
        cx={node.x} cy={node.y} r={6}
        fill={selected ? "hsl(196,85%,50%)" : "hsl(174,80%,55%)"}
      />
      {selected && (
        <circle cx={node.x} cy={node.y} r={12}
          fill="none" stroke="hsl(196,85%,50%)" strokeWidth={1} strokeDasharray="3 2" />
      )}
    </g>
  );
}

function IONode({
  node, isInput, selected, onMouseDown,
}: {
  node: DiagramNode;
  isInput: boolean;
  selected: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  return (
    <g onMouseDown={onMouseDown} style={{ cursor: "grab" }}>
      {isInput ? (
        <polygon
          points={`${node.x},${node.y - 10} ${node.x + 20},${node.y} ${node.x},${node.y + 10}`}
          fill="hsl(220,18%,16%)"
          stroke={selected ? "hsl(196,85%,50%)" : "hsl(174,80%,55%)"}
          strokeWidth={1.5}
        />
      ) : (
        <polygon
          points={`${node.x - 20},${node.y - 10} ${node.x},${node.y} ${node.x - 20},${node.y + 10}`}
          fill="hsl(220,18%,16%)"
          stroke={selected ? "hsl(196,85%,50%)" : "hsl(174,80%,55%)"}
          strokeWidth={1.5}
        />
      )}
      <text
        x={isInput ? node.x - 8 : node.x + 8}
        y={node.y - 14}
        textAnchor="middle" fill="hsl(174,80%,55%)"
        fontSize={10} fontFamily="monospace"
      >
        {node.label}
      </text>
    </g>
  );
}

function EdgeLine({
  edge, nodes, selected, onClick,
}: {
  edge: DiagramEdge;
  nodes: DiagramNode[];
  selected: boolean;
  onClick: () => void;
}) {
  const fromNode = nodes.find(n => n.id === edge.from);
  const toNode = nodes.find(n => n.id === edge.to);
  if (!fromNode || !toNode) return null;

  const from = getOutputPort(fromNode);
  const to = getInputPort(toNode);

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let path: string;

  if (Math.abs(dy) < 5) {
    path = `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  } else if (Math.abs(dx) < 5) {
    path = `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  } else {
    const midX = from.x + dx / 2;
    path = `M ${from.x} ${from.y} L ${midX} ${from.y} L ${midX} ${to.y} L ${to.x} ${to.y}`;
  }

  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const arrowLen = 8;
  const ax1 = to.x - arrowLen * Math.cos(angle - 0.4);
  const ay1 = to.y - arrowLen * Math.sin(angle - 0.4);
  const ax2 = to.x - arrowLen * Math.cos(angle + 0.4);
  const ay2 = to.y - arrowLen * Math.sin(angle + 0.4);

  return (
    <g onClick={onClick} style={{ cursor: "pointer" }}>
      <path d={path} fill="none" stroke="transparent" strokeWidth={12} />
      <path
        d={path}
        fill="none"
        stroke={selected ? "hsl(196,85%,50%)" : "hsl(174,80%,55%)"}
        strokeWidth={selected ? 2.5 : 1.5}
      />
      <polygon
        points={`${to.x},${to.y} ${ax1},${ay1} ${ax2},${ay2}`}
        fill={selected ? "hsl(196,85%,50%)" : "hsl(174,80%,55%)"}
      />
    </g>
  );
}

// ─── TF Edit Modal ───────────────────────────────────────────────────────────

type BlockRole = "forward" | "feedback";

function TFEditModal({
  node, onSave, onCancel,
}: {
  node: DiagramNode;
  onSave: (id: string, label: string, num: string, den: string, role: BlockRole) => void;
  onCancel: () => void;
}) {
  const inferRole = (n: DiagramNode): BlockRole =>
    /^H/i.test(n.label) ? "feedback" : "forward";

  const [label, setLabel] = useState(node.label);
  const [num, setNum] = useState(node.tf?.num ?? "1");
  const [den, setDen] = useState(node.tf?.den ?? "1");
  const [role, setRole] = useState<BlockRole>(inferRole(node));

  const handleRoleChange = (r: BlockRole) => {
    setRole(r);
    if (r === "forward" && /^H/i.test(label)) {
      setLabel(label.replace(/^H/i, "G"));
    } else if (r === "feedback" && /^G/i.test(label)) {
      setLabel(label.replace(/^G/i, "H"));
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="panel-section p-4 w-80 space-y-3">
        <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">Edit Transfer Function</h3>

        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">Block Role</label>
          <div className="flex gap-1.5">
            {([
              { value: "forward" as const, label: "G(s) Forward" },
              { value: "feedback" as const, label: "H(s) Feedback" },
            ]).map(opt => (
              <button
                key={opt.value}
                onClick={() => handleRoleChange(opt.value)}
                className={cn(
                  "flex-1 py-1.5 rounded text-[10px] font-mono font-semibold border transition-all",
                  role === opt.value
                    ? opt.value === "forward"
                      ? "bg-primary/20 border-primary/50 text-primary"
                      : "bg-accent/20 border-accent/50 text-accent"
                    : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-0.5">Label</label>
          <input
            value={label} onChange={e => setLabel(e.target.value)}
            className="w-full bg-secondary/70 border border-border rounded px-2 py-1 text-xs font-mono text-foreground focus:outline-none focus:border-primary"
          />
        </div>

        <div className="bg-secondary/40 border border-border rounded-md p-3 space-y-1">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">
            Transfer Function {role === "forward" ? "G" : "H"}(s)
          </label>
          <div className="flex flex-col items-center gap-0.5">
            <input
              value={num} onChange={e => setNum(e.target.value)}
              placeholder="e.g. 1, s+1, 2s^2+3s+1"
              className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs font-mono text-center text-foreground focus:outline-none focus:border-primary"
            />
            <div className="w-4/5 h-px bg-primary/60 my-0.5" />
            <input
              value={den} onChange={e => setDen(e.target.value)}
              placeholder="e.g. s, s+2, s^2+3s+2"
              className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs font-mono text-center text-foreground focus:outline-none focus:border-primary"
            />
          </div>
          <p className="text-[9px] text-muted-foreground text-center mt-1 font-mono">
            {label}(s) = ({num || "?"}) / ({den || "?"})
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => onSave(node.id, label, num, den, role)}
            className="btn-glow flex-1 py-1.5 rounded text-xs font-bold"
          >
            Save
          </button>
          <button
            onClick={onCancel}
            className="flex-1 py-1.5 rounded text-xs font-semibold border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Toolbar ─────────────────────────────────────────────────────────────────

const TOOLBAR_ITEMS: { type: NodeType; icon: string; label: string }[] = [
  { type: "block",    icon: "▢", label: "G(s) Block" },
  { type: "summing",  icon: "⊕", label: "Σ Junction" },
  { type: "pickoff",  icon: "●", label: "Pick-off" },
  { type: "input",    icon: "▷", label: "Input" },
  { type: "output",   icon: "◁", label: "Output" },
];

const TEMPLATES = [
  { label: "Series", create: createSeriesTemplate },
  { label: "Feedback", create: createFeedbackTemplate },
  { label: "Parallel", create: createParallelTemplate },
];

// ─── Main Editor Component ───────────────────────────────────────────────────

interface DiagramEditorProps {
  onAnalyze?: (result: SolverResult | null, error: string) => void;
}

export function DiagramEditor({ onAnalyze }: DiagramEditorProps) {
  const {
    current: diagram, push: pushDiagram,
    undo, redo, reset: resetDiagram,
    canUndo, canRedo,
  } = useHistory(createSeriesTemplate());

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<{ fromId: string } | null>(null);
  const [tool, setTool] = useState<"select" | "connect" | "delete">("select");

  // Zoom/Pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef<{ nodeId: string; offsetX: number; offsetY: number } | null>(null);

  // Helper to commit diagram changes with undo support
  const setDiagram = useCallback((updater: (prev: DiagramState) => DiagramState) => {
    pushDiagram(updater(diagram));
  }, [diagram, pushDiagram]);

  // ─── Handlers ────────────────────────────────────────────────────

  const updateNode = useCallback((id: string, updates: Partial<DiagramNode>) => {
    // For dragging we update without pushing to history (push on mouseup)
    pushDiagram({
      ...diagram,
      nodes: diagram.nodes.map(n => n.id === id ? { ...n, ...updates } : n),
    });
  }, [diagram, pushDiagram]);

  // Lightweight update for dragging (no history push)
  const updateNodeDrag = useCallback((id: string, x: number, y: number) => {
    // Directly mutate the history's current entry for smooth dragging
    // We'll push a final state on mouseup
  }, []);

  const addNode = useCallback((type: NodeType) => {
    const id = genId(type[0]);
    const newNode: DiagramNode = {
      id, type,
      x: 250, y: 150,
      label: type === "block" ? `G${diagram.nodes.filter(n => n.type === "block").length + 1}`
        : type === "summing" ? "Σ"
        : type === "pickoff" ? "·"
        : type === "input" ? "U(s)" : "C(s)",
      ...(type === "block" ? { tf: { num: "1", den: "s + 1" } } : {}),
      ...(type === "summing" ? { signs: {} } : {}),
    };
    pushDiagram({ ...diagram, nodes: [...diagram.nodes, newNode] });
    setSelectedId(id);
  }, [diagram, pushDiagram]);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    const isEdge = diagram.edges.some(e => e.id === selectedId);
    if (isEdge) {
      pushDiagram({
        ...diagram,
        edges: diagram.edges.filter(e => e.id !== selectedId),
      });
    } else {
      pushDiagram({
        ...diagram,
        nodes: diagram.nodes.filter(n => n.id !== selectedId),
        edges: diagram.edges.filter(e => e.from !== selectedId && e.to !== selectedId),
      });
    }
    setSelectedId(null);
  }, [selectedId, diagram, pushDiagram]);

  const getSvgPoint = useCallback((clientX: number, clientY: number) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top - pan.y) / zoom,
    };
  }, [zoom, pan]);

  const handleSvgMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === svgRef.current || (e.target as Element).tagName === "rect" && (e.target as Element).getAttribute("fill") === "url(#grid)") {
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        // Middle click or Alt+click to pan
        isPanning.current = true;
        panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
        e.preventDefault();
        return;
      }
      setSelectedId(null);
    }
  }, [pan]);

  const handleNodeMouseDown = useCallback((nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (tool === "connect") {
      if (!connecting) {
        setConnecting({ fromId: nodeId });
      } else {
        if (connecting.fromId !== nodeId) {
          const edgeId = genId("e");
          pushDiagram({
            ...diagram,
            edges: [...diagram.edges, { id: edgeId, from: connecting.fromId, to: nodeId }],
          });
        }
        setConnecting(null);
      }
      return;
    }

    if (tool === "delete") {
      pushDiagram({
        ...diagram,
        nodes: diagram.nodes.filter(n => n.id !== nodeId),
        edges: diagram.edges.filter(e => e.from !== nodeId && e.to !== nodeId),
      });
      return;
    }

    setSelectedId(nodeId);

    const { x: svgX, y: svgY } = getSvgPoint(e.clientX, e.clientY);
    const node = diagram.nodes.find(n => n.id === nodeId);
    if (!node) return;

    draggingRef.current = {
      nodeId,
      offsetX: svgX - node.x,
      offsetY: svgY - node.y,
    };
  }, [tool, connecting, diagram, pushDiagram, getSvgPoint]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isPanning.current) {
        setPan({
          x: panStart.current.panX + (e.clientX - panStart.current.x),
          y: panStart.current.panY + (e.clientY - panStart.current.y),
        });
        return;
      }
      if (!draggingRef.current || !svgRef.current) return;
      const { x, y } = getSvgPoint(e.clientX, e.clientY);
      const nx = snap(x - draggingRef.current.offsetX);
      const ny = snap(y - draggingRef.current.offsetY);
      updateNode(draggingRef.current.nodeId, { x: nx, y: ny });
    };

    const handleMouseUp = () => {
      isPanning.current = false;
      draggingRef.current = null;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [updateNode, getSvgPoint]);

  // Wheel zoom
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(prev => Math.max(0.3, Math.min(3, prev * delta)));
    };
    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, []);

  const handleAnalyze = useCallback(() => {
    const result = analyzeDiagram(diagram);
    if ("error" in result) {
      onAnalyze?.(null, result.error);
    } else {
      onAnalyze?.(result.result, "");
    }
  }, [diagram, onAnalyze]);

  const handleSaveTF = useCallback((id: string, label: string, num: string, den: string, _role: string) => {
    pushDiagram({
      ...diagram,
      nodes: diagram.nodes.map(n => n.id === id ? { ...n, label, tf: { num, den } } : n),
    });
    setEditingNodeId(null);
  }, [diagram, pushDiagram]);

  const loadTemplate = useCallback((create: () => DiagramState) => {
    resetDiagram(create());
    setSelectedId(null);
    setConnecting(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [resetDiagram]);

  // ─── Keyboard ────────────────────────────────────────────────────

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (editingNodeId) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        deleteSelected();
      }
      if (e.key === "Escape") {
        setSelectedId(null);
        setConnecting(null);
        setTool("select");
      }
      // Undo/Redo
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [deleteSelected, editingNodeId, undo, redo]);

  const editingNode = editingNodeId ? diagram.nodes.find(n => n.id === editingNodeId) : null;

  const viewBox = `${-pan.x / zoom} ${-pan.y / zoom} ${600 / zoom} ${350 / zoom}`;

  return (
    <div className="relative flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border flex-wrap">
        {/* Undo/Redo */}
        <div className="flex items-center gap-0.5 mr-1">
          <button
            onClick={undo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className={cn(
              "px-1.5 py-1 text-xs font-mono rounded transition-all",
              canUndo ? "text-muted-foreground hover:text-foreground hover:bg-secondary" : "text-muted-foreground/30"
            )}
          >
            ↶
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            className={cn(
              "px-1.5 py-1 text-xs font-mono rounded transition-all",
              canRedo ? "text-muted-foreground hover:text-foreground hover:bg-secondary" : "text-muted-foreground/30"
            )}
          >
            ↷
          </button>
        </div>

        <div className="w-px h-5 bg-border mx-0.5" />

        {/* Mode tools */}
        <div className="flex items-center gap-0.5 mr-2">
          {([
            { mode: "select" as const, icon: "↖", tip: "Select & Move" },
            { mode: "connect" as const, icon: "⤳", tip: "Connect" },
            { mode: "delete" as const, icon: "✕", tip: "Delete" },
          ]).map(t => (
            <button
              key={t.mode}
              onClick={() => { setTool(t.mode); setConnecting(null); }}
              title={t.tip}
              className={cn(
                "px-2 py-1 text-xs font-mono rounded transition-all",
                tool === t.mode
                  ? "bg-primary/20 text-primary border border-primary/40"
                  : "text-muted-foreground hover:text-foreground border border-transparent"
              )}
            >
              {t.icon}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-border mx-1" />

        {/* Add nodes */}
        {TOOLBAR_ITEMS.map(item => (
          <button
            key={item.type}
            onClick={() => addNode(item.type)}
            title={`Add ${item.label}`}
            className="px-2 py-1 text-[10px] font-mono text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-all border border-transparent hover:border-primary/30"
          >
            {item.icon} {item.label}
          </button>
        ))}

        <div className="w-px h-5 bg-border mx-1" />

        {/* Templates */}
        {TEMPLATES.map(t => (
          <button
            key={t.label}
            onClick={() => loadTemplate(t.create)}
            className="px-2 py-1 text-[10px] font-mono text-muted-foreground hover:text-accent hover:bg-accent/10 rounded transition-all"
          >
            {t.label}
          </button>
        ))}

        <div className="flex-1" />

        {/* Zoom controls */}
        <div className="flex items-center gap-1 mr-2">
          <button
            onClick={() => setZoom(z => Math.max(0.3, z - 0.15))}
            className="px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground hover:text-foreground rounded hover:bg-secondary"
          >
            −
          </button>
          <span className="text-[9px] font-mono text-muted-foreground w-8 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom(z => Math.min(3, z + 0.15))}
            className="px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground hover:text-foreground rounded hover:bg-secondary"
          >
            +
          </button>
          <button
            onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
            className="px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground hover:text-foreground rounded hover:bg-secondary"
            title="Reset view"
          >
            ⊡
          </button>
        </div>

        {/* Delete selected */}
        {selectedId && (
          <button
            onClick={deleteSelected}
            className="px-2 py-1 text-[10px] font-mono text-destructive hover:bg-destructive/10 rounded border border-destructive/30 transition-all"
          >
            🗑 Delete
          </button>
        )}

        {/* Analyze */}
        <button
          onClick={handleAnalyze}
          className="btn-glow px-3 py-1 rounded text-[10px] font-bold"
        >
          ⚡ Analyze
        </button>
      </div>

      {/* Connection mode indicator */}
      {connecting && (
        <div className="absolute top-12 left-3 z-40 bg-accent/20 border border-accent/40 rounded px-2 py-1 text-[10px] font-mono text-accent">
          Click target node to complete connection… (Esc to cancel)
        </div>
      )}

      {/* SVG Canvas */}
      <div className="flex-1 overflow-hidden bg-background/50 relative">
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox={viewBox}
          className="min-w-[600px] min-h-[350px]"
          onMouseDown={handleSvgMouseDown}
          style={{ cursor: isPanning.current ? "grabbing" : tool === "connect" ? "crosshair" : tool === "delete" ? "not-allowed" : "default" }}
        >
          {/* Grid */}
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="hsl(220,15%,12%)" strokeWidth={0.5} />
            </pattern>
          </defs>
          <rect x={-pan.x / zoom} y={-pan.y / zoom} width={600 / zoom} height={350 / zoom} fill="url(#grid)" />

          {/* Edges */}
          {diagram.edges.map(edge => (
            <EdgeLine
              key={edge.id}
              edge={edge}
              nodes={diagram.nodes}
              selected={selectedId === edge.id}
              onClick={() => {
                if (tool === "delete") {
                  pushDiagram({
                    ...diagram,
                    edges: diagram.edges.filter(e => e.id !== edge.id),
                  });
                } else {
                  setSelectedId(edge.id);
                }
              }}
            />
          ))}

          {/* Nodes */}
          {diagram.nodes.map(node => {
            const isSelected = selectedId === node.id;
            const mouseDown = (e: React.MouseEvent) => handleNodeMouseDown(node.id, e);

            switch (node.type) {
              case "block":
                return <BlockNode key={node.id} node={node} selected={isSelected}
                  onMouseDown={mouseDown} onEditTF={setEditingNodeId} />;
              case "summing":
                return <SummingNode key={node.id} node={node} selected={isSelected}
                  onMouseDown={mouseDown} />;
              case "pickoff":
                return <PickoffNode key={node.id} node={node} selected={isSelected}
                  onMouseDown={mouseDown} />;
              case "input":
              case "output":
                return <IONode key={node.id} node={node} isInput={node.type === "input"}
                  selected={isSelected} onMouseDown={mouseDown} />;
            }
          })}
        </svg>

        {/* TF Edit Modal */}
        {editingNode && (
          <TFEditModal
            node={editingNode}
            onSave={handleSaveTF}
            onCancel={() => setEditingNodeId(null)}
          />
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-t border-border text-[9px] font-mono text-muted-foreground">
        <span>{diagram.nodes.length} nodes</span>
        <span>{diagram.edges.length} edges</span>
        <span>{diagram.nodes.filter(n => n.type === "block").length} blocks</span>
        {selectedId && <span className="text-accent">Selected: {selectedId}</span>}
        <span className="ml-auto">Ctrl+Z undo · Ctrl+Y redo · Scroll to zoom · Alt+drag to pan</span>
      </div>
    </div>
  );
}
