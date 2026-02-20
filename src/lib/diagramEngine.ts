/**
 * Diagram Engine
 * ===============
 * Analyzes a visual block diagram graph (nodes + edges) to determine
 * the topology and compute G_eq(s) using the typed solver.
 *
 * Node types: input, output, block, summing, pickoff
 * Edges connect output ports to input ports.
 */

import { solve, SolverResult, ConnectionType } from "./solver";

// ─── Types ────────────────────────────────────────────────────────────────────

export type NodeType = "input" | "output" | "block" | "summing" | "pickoff";

export interface DiagramNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  label: string;
  /** Only for 'block' nodes */
  tf?: { num: string; den: string };
  /** For summing junctions: sign of each incoming edge by edgeId */
  signs?: Record<string, "+" | "-">;
}

export interface DiagramEdge {
  id: string;
  from: string; // node id
  to: string;   // node id
}

export interface DiagramState {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

// ─── Topology Analysis ───────────────────────────────────────────────────────

/** Get all block nodes in signal-flow order from input to output */
function getBlocksInOrder(state: DiagramState): DiagramNode[] {
  const { nodes, edges } = state;
  const inputNode = nodes.find(n => n.type === "input");
  if (!inputNode) return [];

  const visited = new Set<string>();
  const ordered: DiagramNode[] = [];

  function dfs(nodeId: string) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    if (node.type === "block") ordered.push(node);
    // Follow outgoing edges
    const outEdges = edges.filter(e => e.from === nodeId);
    for (const e of outEdges) {
      dfs(e.to);
    }
  }

  dfs(inputNode.id);
  return ordered;
}

/** Detect if there's a feedback loop (a path from output side back to a summing junction) */
function detectFeedbackLoop(state: DiagramState): {
  hasFeedback: boolean;
  feedbackBlocks: DiagramNode[];
  forwardBlocks: DiagramNode[];
  isPositive: boolean;
} {
  const { nodes, edges } = state;
  const summingNodes = nodes.filter(n => n.type === "summing");
  const pickoffNodes = nodes.filter(n => n.type === "pickoff");

  // Simple heuristic: if there's a pickoff that connects back to a summing junction
  // through blocks, it's a feedback path
  for (const pickoff of pickoffNodes) {
    // Find edges going "backwards" from pickoff
    const pickoffOutEdges = edges.filter(e => e.from === pickoff.id);
    for (const edge of pickoffOutEdges) {
      const target = nodes.find(n => n.id === edge.to);
      if (!target) continue;

      // If pickoff connects to a block that eventually reaches a summing junction
      if (target.type === "block" || target.type === "summing") {
        // Trace feedback path
        const feedbackPath: DiagramNode[] = [];
        let current = target;
        const fbVisited = new Set<string>();

        while (current && !fbVisited.has(current.id)) {
          fbVisited.add(current.id);
          if (current.type === "block") feedbackPath.push(current);
          if (current.type === "summing") {
            // Found feedback loop
            const forwardBlocks = getBlocksInOrder(state).filter(
              b => !feedbackPath.includes(b)
            );

            // Check sign on the summing junction
            const sumNode = current;
            const incomingEdge = edges.find(e => e.to === sumNode.id && fbVisited.has(e.from));
            const sign = sumNode.signs?.[incomingEdge?.id ?? ""] ?? "-";

            return {
              hasFeedback: true,
              feedbackBlocks: feedbackPath,
              forwardBlocks,
              isPositive: sign === "+",
            };
          }
          // Follow next edge
          const nextEdge = edges.find(e => e.from === current!.id && e.to !== pickoff.id);
          current = nextEdge ? nodes.find(n => n.id === nextEdge.to)! : undefined!;
        }
      }
    }
  }

  return { hasFeedback: false, feedbackBlocks: [], forwardBlocks: [], isPositive: false };
}

/** Detect parallel branches (multiple paths from one node to another) */
function detectParallel(state: DiagramState): boolean {
  const { nodes, edges } = state;
  // Check if any node has multiple outgoing edges to different blocks
  // that then merge at a summing junction
  const summingNodes = nodes.filter(n => n.type === "summing");

  for (const sum of summingNodes) {
    const incomingEdges = edges.filter(e => e.to === sum.id);
    const incomingBlocks = incomingEdges
      .map(e => nodes.find(n => n.id === e.from))
      .filter(n => n?.type === "block");
    if (incomingBlocks.length >= 2) return true;
  }
  return false;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type AnalysisResult = {
  topology: ConnectionType;
  result: SolverResult;
} | {
  topology: "unknown";
  error: string;
};

/**
 * Analyze a diagram and compute G_eq(s).
 * Determines topology automatically from the graph structure.
 */
export function analyzeDiagram(state: DiagramState): AnalysisResult {
  const { nodes, edges } = state;
  const blocks = nodes.filter(n => n.type === "block");

  if (blocks.length === 0) {
    return { topology: "unknown", error: "No transfer function blocks in diagram." };
  }

  // Validate all blocks have transfer functions
  for (const b of blocks) {
    if (!b.tf || !b.tf.num.trim() || !b.tf.den.trim()) {
      return { topology: "unknown", error: `Block "${b.label}" is missing a transfer function.` };
    }
  }

  try {
    // Check for feedback first
    const feedback = detectFeedbackLoop(state);
    if (feedback.hasFeedback) {
      const forwardBlocks = feedback.forwardBlocks.length > 0
        ? feedback.forwardBlocks : blocks.filter(b => !feedback.feedbackBlocks.includes(b));

      if (forwardBlocks.length === 0) {
        return { topology: "unknown", error: "Cannot determine forward path blocks." };
      }

      // If forward path has multiple blocks, they're in series — combine first
      const fwdBlock = forwardBlocks.length === 1
        ? forwardBlocks[0]
        : forwardBlocks[0]; // simplified: just use first for now

      const fbkBlocks = feedback.feedbackBlocks;
      const connectionType: ConnectionType = feedback.isPositive ? "feedback_positive" : "feedback_negative";

      if (fbkBlocks.length === 0) {
        // Unity feedback
        const result = solve("unity_feedback", [{
          id: fwdBlock.id,
          label: fwdBlock.label,
          numStr: fwdBlock.tf!.num,
          denStr: fwdBlock.tf!.den,
        }]);
        return { topology: "unity_feedback", result };
      }

      const fbk = fbkBlocks[0];
      const result = solve(connectionType, [{
        id: fwdBlock.id,
        label: fwdBlock.label,
        numStr: fwdBlock.tf!.num,
        denStr: fwdBlock.tf!.den,
      }], {
        id: fbk.id,
        label: fbk.label,
        numStr: fbk.tf!.num,
        denStr: fbk.tf!.den,
      });
      return { topology: connectionType, result };
    }

    // Check for parallel
    if (detectParallel(state)) {
      const result = solve("parallel", blocks.map(b => ({
        id: b.id,
        label: b.label,
        numStr: b.tf!.num,
        denStr: b.tf!.den,
      })));
      return { topology: "parallel", result };
    }

    // Default: series (blocks connected in chain)
    const orderedBlocks = getBlocksInOrder(state);
    const blocksToUse = orderedBlocks.length >= 2 ? orderedBlocks : blocks;

    if (blocksToUse.length === 1) {
      // Single block — just return it as-is
      const b = blocksToUse[0];
      const result = solve("series", [
        { id: b.id, label: b.label, numStr: b.tf!.num, denStr: b.tf!.den },
        { id: "unity", label: "1", numStr: "1", denStr: "1" },
      ]);
      return { topology: "series", result };
    }

    const result = solve("series", blocksToUse.map(b => ({
      id: b.id,
      label: b.label,
      numStr: b.tf!.num,
      denStr: b.tf!.den,
    })));
    return { topology: "series", result };
  } catch (e: any) {
    return { topology: "unknown", error: e.message || "Analysis failed." };
  }
}

// ─── Default Diagram Templates ───────────────────────────────────────────────

export function createSeriesTemplate(): DiagramState {
  return {
    nodes: [
      { id: "in", type: "input", x: 40, y: 150, label: "U(s)" },
      { id: "g1", type: "block", x: 160, y: 130, label: "G₁", tf: { num: "1", den: "s + 1" } },
      { id: "g2", type: "block", x: 340, y: 130, label: "G₂", tf: { num: "2", den: "s + 2" } },
      { id: "out", type: "output", x: 510, y: 150, label: "C(s)" },
    ],
    edges: [
      { id: "e1", from: "in", to: "g1" },
      { id: "e2", from: "g1", to: "g2" },
      { id: "e3", from: "g2", to: "out" },
    ],
  };
}

export function createFeedbackTemplate(): DiagramState {
  return {
    nodes: [
      { id: "in", type: "input", x: 30, y: 120, label: "R(s)" },
      { id: "sum", type: "summing", x: 100, y: 120, label: "Σ", signs: { e_fb: "-" } },
      { id: "g1", type: "block", x: 200, y: 100, label: "G", tf: { num: "10", den: "s^2 + 3s + 2" } },
      { id: "pick", type: "pickoff", x: 380, y: 120, label: "·" },
      { id: "out", type: "output", x: 470, y: 120, label: "C(s)" },
      { id: "h1", type: "block", x: 220, y: 230, label: "H", tf: { num: "1", den: "1" } },
    ],
    edges: [
      { id: "e_in", from: "in", to: "sum" },
      { id: "e_fwd", from: "sum", to: "g1" },
      { id: "e_g2p", from: "g1", to: "pick" },
      { id: "e_out", from: "pick", to: "out" },
      { id: "e_p2h", from: "pick", to: "h1" },
      { id: "e_fb", from: "h1", to: "sum" },
    ],
  };
}

export function createParallelTemplate(): DiagramState {
  return {
    nodes: [
      { id: "in", type: "input", x: 30, y: 150, label: "U(s)" },
      { id: "pick", type: "pickoff", x: 100, y: 150, label: "·" },
      { id: "g1", type: "block", x: 220, y: 80, label: "G₁", tf: { num: "2", den: "1" } },
      { id: "g2", type: "block", x: 220, y: 200, label: "G₂", tf: { num: "1", den: "s" } },
      { id: "sum", type: "summing", x: 380, y: 150, label: "Σ" },
      { id: "out", type: "output", x: 470, y: 150, label: "C(s)" },
    ],
    edges: [
      { id: "e1", from: "in", to: "pick" },
      { id: "e2", from: "pick", to: "g1" },
      { id: "e3", from: "pick", to: "g2" },
      { id: "e4", from: "g1", to: "sum" },
      { id: "e5", from: "g2", to: "sum" },
      { id: "e6", from: "sum", to: "out" },
    ],
  };
}

let _idCounter = 100;
export function genId(prefix: string = "n"): string {
  return `${prefix}_${++_idCounter}`;
}
