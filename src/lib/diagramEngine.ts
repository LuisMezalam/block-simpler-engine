/**
 * Diagram Engine
 * ===============
 * Analyzes a visual block diagram graph (nodes + edges) to determine
 * the topology and compute G_eq(s) using the typed solver.
 *
 * Supports nested (inner/outer) feedback loops via recursive reduction:
 * 1. Detect the innermost feedback loop
 * 2. Reduce it to an equivalent block
 * 3. Re-analyze the simplified diagram
 *
 * Node types: input, output, block, summing, pickoff
 * Edges connect output ports to input ports.
 */

import { solve, SolverResult, ConnectionType } from "./solver";
import { parsePoly, mulAll, format as fmtPoly, simplifyTF, TypedTF, mul, add, sub } from "./polynomial";

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

/** 
 * Detect feedback loops. Returns ALL detected loops sorted innermost-first.
 * Each loop includes the summing junction, pickoff, forward blocks, feedback blocks, and sign.
 */
interface FeedbackLoop {
  hasFeedback: boolean;
  feedbackBlocks: DiagramNode[];
  forwardBlocks: DiagramNode[];
  isPositive: boolean;
  /** The summing junction node at the start of this loop */
  sumNode?: DiagramNode;
  /** The pickoff node that starts the feedback path */
  pickoffNode?: DiagramNode;
  /** All node IDs involved in this loop (for nested reduction) */
  loopNodeIds: Set<string>;
}

function detectFeedbackLoop(state: DiagramState): FeedbackLoop {
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
        fbVisited.add(pickoff.id);

        while (current && !fbVisited.has(current.id)) {
          fbVisited.add(current.id);
          if (current.type === "block") feedbackPath.push(current);
          if (current.type === "summing") {
            // Found feedback loop — gather forward blocks between this summing junction and the pickoff
            const forwardBlocks = getForwardPathBlocks(state, current.id, pickoff.id);

            // Check sign on the summing junction
            const sumNode = current;
            const incomingEdge = edges.find(e => e.to === sumNode.id && fbVisited.has(e.from));
            const sign = sumNode.signs?.[incomingEdge?.id ?? ""] ?? "-";

            const loopNodeIds = new Set<string>([sumNode.id, pickoff.id, ...feedbackPath.map(b => b.id), ...forwardBlocks.map(b => b.id)]);

            return {
              hasFeedback: true,
              feedbackBlocks: feedbackPath,
              forwardBlocks,
              isPositive: sign === "+",
              sumNode,
              pickoffNode: pickoff,
              loopNodeIds,
            };
          }
          // Follow next edge
          const nextEdge = edges.find(e => e.from === current!.id && e.to !== pickoff.id);
          current = nextEdge ? nodes.find(n => n.id === nextEdge.to)! : undefined!;
        }
      }
    }
  }

  return { hasFeedback: false, feedbackBlocks: [], forwardBlocks: [], isPositive: false, loopNodeIds: new Set() };
}

/** Get blocks in the forward path between a summing junction and a pickoff point */
function getForwardPathBlocks(state: DiagramState, sumId: string, pickoffId: string): DiagramNode[] {
  const { nodes, edges } = state;
  const blocks: DiagramNode[] = [];
  const visited = new Set<string>();

  function dfs(nodeId: string): boolean {
    if (visited.has(nodeId)) return false;
    visited.add(nodeId);
    if (nodeId === pickoffId) return true;

    const node = nodes.find(n => n.id === nodeId);
    if (!node) return false;

    const outEdges = edges.filter(e => e.from === nodeId);
    for (const e of outEdges) {
      if (dfs(e.to)) {
        if (node.type === "block") blocks.unshift(node);
        return true;
      }
    }
    return false;
  }

  dfs(sumId);
  return blocks;
}

/**
 * Reduce a detected feedback loop into an equivalent block node.
 * Returns a new DiagramState with the loop replaced by a single equivalent block.
 */
function reduceInnerLoop(state: DiagramState, loop: FeedbackLoop): DiagramState {
  if (!loop.sumNode || !loop.pickoffNode) return state;

  const fwdBlock = combineSeriesBlocks(loop.forwardBlocks);
  const NG = parsePoly(fwdBlock.numStr);
  const DG = parsePoly(fwdBlock.denStr);

  let numPoly: ReturnType<typeof parsePoly>;
  let denPoly: ReturnType<typeof parsePoly>;

  if (loop.feedbackBlocks.length === 0) {
    // Unity feedback
    numPoly = NG;
    denPoly = add(DG, NG);
  } else {
    const fbk = combineSeriesBlocks(loop.feedbackBlocks);
    const NH = parsePoly(fbk.numStr);
    const DH = parsePoly(fbk.denStr);
    numPoly = mul(NG, DH);
    if (loop.isPositive) {
      denPoly = sub(mul(DG, DH), mul(NG, NH));
    } else {
      denPoly = add(mul(DG, DH), mul(NG, NH));
    }
  }

  const simplified = simplifyTF({ num: numPoly, den: denPoly });
  const eqLabel = `[${fwdBlock.label}]_cl`;
  const eqId = `eq_${loop.sumNode.id}_${loop.pickoffNode.id}`;

  // Create equivalent block at the summing junction position
  const eqNode: DiagramNode = {
    id: eqId,
    type: "block",
    x: loop.sumNode.x,
    y: loop.sumNode.y,
    label: eqLabel,
    tf: { num: fmtPoly(simplified.num), den: fmtPoly(simplified.den) },
  };

  // Remove loop nodes (summing, pickoff, feedback blocks, forward blocks inside the loop)
  const removeIds = new Set<string>([
    loop.sumNode.id,
    loop.pickoffNode.id,
    ...loop.feedbackBlocks.map(b => b.id),
    ...loop.forwardBlocks.map(b => b.id),
  ]);

  // Find edges into the summing junction (from outside the loop = input edges)
  const { edges, nodes } = state;
  const inputEdges = edges.filter(e => e.to === loop.sumNode!.id && !removeIds.has(e.from));
  const outputEdges = edges.filter(e => e.from === loop.pickoffNode!.id && !removeIds.has(e.to));

  // Remove all edges connected to removed nodes
  const newEdges = edges.filter(e => !removeIds.has(e.from) && !removeIds.has(e.to));

  // Re-wire: connect input sources → equivalent block → output targets
  for (const ie of inputEdges) {
    newEdges.push({ id: `${ie.id}_re`, from: ie.from, to: eqId });
  }
  for (const oe of outputEdges) {
    newEdges.push({ id: `${oe.id}_re`, from: eqId, to: oe.to });
  }

  const newNodes = nodes.filter(n => !removeIds.has(n.id));
  newNodes.push(eqNode);

  return { nodes: newNodes, edges: newEdges };
}

/** Detect parallel branches (multiple paths from one node to another) */
function detectParallel(state: DiagramState): boolean {
  const { nodes, edges } = state;
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

/** Combine multiple series blocks into one equivalent block by multiplying TFs */
function combineSeriesBlocks(blocks: DiagramNode[]): { id: string; label: string; numStr: string; denStr: string } {
  if (blocks.length === 1) {
    const b = blocks[0];
    return { id: b.id, label: b.label, numStr: b.tf!.num, denStr: b.tf!.den };
  }
  // Multiply all numerators and denominators
  const numPoly = mulAll(blocks.map(b => parsePoly(b.tf!.num)));
  const denPoly = mulAll(blocks.map(b => parsePoly(b.tf!.den)));
  const simplified = simplifyTF({ num: numPoly, den: denPoly });
  return {
    id: blocks.map(b => b.id).join("_"),
    label: blocks.map(b => b.label).join("·"),
    numStr: fmtPoly(simplified.num),
    denStr: fmtPoly(simplified.den),
  };
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
 * Supports nested feedback loops via recursive reduction:
 * detects innermost loop → reduces to equivalent block → re-analyzes.
 */
export function analyzeDiagram(state: DiagramState, depth: number = 0): AnalysisResult {
  // Guard against infinite recursion
  if (depth > 10) {
    return { topology: "unknown", error: "Too many nested loops (max depth 10)." };
  }

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
    // Check for feedback loop
    const feedback = detectFeedbackLoop(state);
    if (feedback.hasFeedback) {
      // Count total feedback loops — if more than one, reduce innermost first then recurse
      const summingCount = nodes.filter(n => n.type === "summing").length;
      const pickoffCount = nodes.filter(n => n.type === "pickoff").length;

      if (summingCount > 1 && pickoffCount > 1) {
        // Multiple loops detected — reduce this one and re-analyze
        const reducedState = reduceInnerLoop(state, feedback);
        return analyzeDiagram(reducedState, depth + 1);
      }

      // Single feedback loop — solve directly
      const forwardBlocks = feedback.forwardBlocks.length > 0
        ? feedback.forwardBlocks : blocks.filter(b => !feedback.feedbackBlocks.includes(b));

      if (forwardBlocks.length === 0) {
        return { topology: "unknown", error: "Cannot determine forward path blocks." };
      }

      const fwdBlock = combineSeriesBlocks(forwardBlocks);
      const fbkBlocks = feedback.feedbackBlocks;
      const connectionType: ConnectionType = feedback.isPositive ? "feedback_positive" : "feedback_negative";

      if (fbkBlocks.length === 0) {
        const result = solve("unity_feedback", [{
          id: fwdBlock.id, label: fwdBlock.label,
          numStr: fwdBlock.numStr, denStr: fwdBlock.denStr,
        }]);
        return { topology: "unity_feedback", result };
      }

      const fbk = combineSeriesBlocks(fbkBlocks);
      const result = solve(connectionType, [{
        id: fwdBlock.id, label: fwdBlock.label,
        numStr: fwdBlock.numStr, denStr: fwdBlock.denStr,
      }], {
        id: fbk.id, label: fbk.label,
        numStr: fbk.numStr, denStr: fbk.denStr,
      });
      return { topology: connectionType, result };
    }

    // Check for parallel
    if (detectParallel(state)) {
      const result = solve("parallel", blocks.map(b => ({
        id: b.id, label: b.label,
        numStr: b.tf!.num, denStr: b.tf!.den,
      })));
      return { topology: "parallel", result };
    }

    // Default: series
    const orderedBlocks = getBlocksInOrder(state);
    const blocksToUse = orderedBlocks.length >= 2 ? orderedBlocks : blocks;

    if (blocksToUse.length === 1) {
      const b = blocksToUse[0];
      const result = solve("series", [
        { id: b.id, label: b.label, numStr: b.tf!.num, denStr: b.tf!.den },
        { id: "unity", label: "1", numStr: "1", denStr: "1" },
      ]);
      return { topology: "series", result };
    }

    const result = solve("series", blocksToUse.map(b => ({
      id: b.id, label: b.label,
      numStr: b.tf!.num, denStr: b.tf!.den,
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
