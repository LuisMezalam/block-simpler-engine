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
      {/* Show signs */}
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
        <>
          <polygon
            points={`${node.x},${node.y - 10} ${node.x + 20},${node.y} ${node.x},${node.y + 10}`}
            fill="hsl(220,18%,16%)"
            stroke={selected ? "hsl(196,85%,50%)" : "hsl(174,80%,55%)"}
            strokeWidth={1.5}
          />
        </>
      ) : (
        <>
          <polygon
            points={`${node.x - 20},${node.y - 10} ${node.x},${node.y} ${node.x - 20},${node.y + 10}`}
            fill="hsl(220,18%,16%)"
            stroke={selected ? "hsl(196,85%,50%)" : "hsl(174,80%,55%)"}
            strokeWidth={1.5}
          />
        </>
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

  // Calculate path with right-angle routing
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let path: string;

  if (Math.abs(dy) < 5) {
    // Straight horizontal
    path = `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  } else if (Math.abs(dx) < 5) {
    // Straight vertical
    path = `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  } else {
    // L-shaped or Z-shaped routing
    const midX = from.x + dx / 2;
    path = `M ${from.x} ${from.y} L ${midX} ${from.y} L ${midX} ${to.y} L ${to.x} ${to.y}`;
  }

  // Arrowhead
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const arrowLen = 8;
  const ax1 = to.x - arrowLen * Math.cos(angle - 0.4);
  const ay1 = to.y - arrowLen * Math.sin(angle - 0.4);
  const ax2 = to.x - arrowLen * Math.cos(angle + 0.4);
  const ay2 = to.y - arrowLen * Math.sin(angle + 0.4);

  return (
    <g onClick={onClick} style={{ cursor: "pointer" }}>
      {/* Hit area */}
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

        {/* Role selector */}
        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">Block Role</label>
          <div className="flex gap-1.5">
            {([
              { value: "forward" as const, label: "G(s) Forward", color: "primary" },
              { value: "feedback" as const, label: "H(s) Feedback", color: "accent" },
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

        {/* TF fraction display */}
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
  const [diagram, setDiagram] = useState<DiagramState>(createSeriesTemplate);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<{ fromId: string } | null>(null);
  const [tool, setTool] = useState<"select" | "connect" | "delete">("select");

  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef<{ nodeId: string; offsetX: number; offsetY: number } | null>(null);

  // ─── Handlers ────────────────────────────────────────────────────

  const updateNode = useCallback((id: string, updates: Partial<DiagramNode>) => {
    setDiagram(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => n.id === id ? { ...n, ...updates } : n),
    }));
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
    setDiagram(prev => ({ ...prev, nodes: [...prev.nodes, newNode] }));
    setSelectedId(id);
  }, [diagram.nodes]);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    // Check if it's an edge
    const isEdge = diagram.edges.some(e => e.id === selectedId);
    if (isEdge) {
      setDiagram(prev => ({
        ...prev,
        edges: prev.edges.filter(e => e.id !== selectedId),
      }));
    } else {
      // Delete node and connected edges
      setDiagram(prev => ({
        ...prev,
        nodes: prev.nodes.filter(n => n.id !== selectedId),
        edges: prev.edges.filter(e => e.from !== selectedId && e.to !== selectedId),
      }));
    }
    setSelectedId(null);
  }, [selectedId, diagram.edges]);

  const handleSvgMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === svgRef.current) {
      setSelectedId(null);
    }
  }, []);

  const handleNodeMouseDown = useCallback((nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (tool === "connect") {
      if (!connecting) {
        setConnecting({ fromId: nodeId });
      } else {
        // Complete connection
        if (connecting.fromId !== nodeId) {
          const edgeId = genId("e");
          setDiagram(prev => ({
            ...prev,
            edges: [...prev.edges, { id: edgeId, from: connecting.fromId, to: nodeId }],
          }));
        }
        setConnecting(null);
      }
      return;
    }

    if (tool === "delete") {
      setSelectedId(nodeId);
      // Defer delete
      setDiagram(prev => ({
        ...prev,
        nodes: prev.nodes.filter(n => n.id !== nodeId),
        edges: prev.edges.filter(e => e.from !== nodeId && e.to !== nodeId),
      }));
      return;
    }

    setSelectedId(nodeId);

    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = (e.clientX - rect.left);
    const svgY = (e.clientY - rect.top);
    const node = diagram.nodes.find(n => n.id === nodeId);
    if (!node) return;

    draggingRef.current = {
      nodeId,
      offsetX: svgX - node.x,
      offsetY: svgY - node.y,
    };
  }, [tool, connecting, diagram.nodes]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const x = snap(e.clientX - rect.left - draggingRef.current.offsetX);
      const y = snap(e.clientY - rect.top - draggingRef.current.offsetY);
      updateNode(draggingRef.current.nodeId, { x, y });
    };

    const handleMouseUp = () => {
      draggingRef.current = null;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [updateNode]);

  const handleAnalyze = useCallback(() => {
    const result = analyzeDiagram(diagram);
    if ("error" in result) {
      onAnalyze?.(null, result.error);
    } else {
      onAnalyze?.(result.result, "");
    }
  }, [diagram, onAnalyze]);

  const handleSaveTF = useCallback((id: string, label: string, num: string, den: string, _role: string) => {
    updateNode(id, { label, tf: { num, den } });
    setEditingNodeId(null);
  }, [updateNode]);

  const loadTemplate = useCallback((create: () => DiagramState) => {
    setDiagram(create());
    setSelectedId(null);
    setConnecting(null);
  }, []);

  // ─── Keyboard ────────────────────────────────────────────────────

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (editingNodeId) return; // Don't capture when editing
      if (e.key === "Delete" || e.key === "Backspace") {
        deleteSelected();
      }
      if (e.key === "Escape") {
        setSelectedId(null);
        setConnecting(null);
        setTool("select");
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [deleteSelected, editingNodeId]);

  const editingNode = editingNodeId ? diagram.nodes.find(n => n.id === editingNodeId) : null;

  return (
    <div className="relative flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border flex-wrap">
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
      <div className="flex-1 overflow-auto bg-background/50 relative">
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox="0 0 600 350"
          className="min-w-[600px] min-h-[350px]"
          onMouseDown={handleSvgMouseDown}
          style={{ cursor: tool === "connect" ? "crosshair" : tool === "delete" ? "not-allowed" : "default" }}
        >
          {/* Grid */}
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="hsl(220,15%,12%)" strokeWidth={0.5} />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />

          {/* Edges */}
          {diagram.edges.map(edge => (
            <EdgeLine
              key={edge.id}
              edge={edge}
              nodes={diagram.nodes}
              selected={selectedId === edge.id}
              onClick={() => {
                if (tool === "delete") {
                  setDiagram(prev => ({
                    ...prev,
                    edges: prev.edges.filter(e => e.id !== edge.id),
                  }));
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
        <span className="ml-auto">Del/Backspace to remove · Esc to deselect</span>
      </div>
    </div>
  );
}
