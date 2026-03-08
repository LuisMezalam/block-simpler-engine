import React, { useState, useEffect, useMemo, useCallback } from "react";
import { DiagramState, DiagramNode, analyzeDiagram } from "@/lib/diagramEngine";
import { SolverResult } from "@/lib/solver";
import { cn } from "@/lib/utils";

// ─── Parameter Detection ─────────────────────────────────────────────────────

/** Known symbolic gain parameters with sensible defaults and ranges */
const PARAM_DEFS: Record<string, { min: number; max: number; step: number; default: number }> = {
  K:   { min: 0, max: 100, step: 0.5,  default: 1 },
  Kp:  { min: 0, max: 100, step: 0.5,  default: 1 },
  Ki:  { min: 0, max: 50,  step: 0.1,  default: 1 },
  Kd:  { min: 0, max: 50,  step: 0.1,  default: 1 },
  K_P: { min: 0, max: 100, step: 0.5,  default: 1 },
  K_b: { min: 0, max: 100, step: 0.5,  default: 1 },
  K_f: { min: 0, max: 100, step: 0.5,  default: 1 },
  T:   { min: 0.01, max: 10, step: 0.01, default: 1 },
  wn:  { min: 0.1, max: 50, step: 0.1, default: 2 },
  z:   { min: 0, max: 2, step: 0.01, default: 0.5 },
  a:   { min: 0.1, max: 50, step: 0.1, default: 1 },
  b:   { min: 0.1, max: 50, step: 0.1, default: 2 },
};

/** Regex to match symbolic tokens (not 's', not pure numbers) */
const SYMBOL_RE = /\b([A-Za-z_][A-Za-z0-9_]*)\b/g;
const SKIP = new Set(["s", "e", "j"]);

/** Extract all symbolic parameters from a diagram's block TFs */
function extractParams(diagram: DiagramState): string[] {
  const found = new Set<string>();
  for (const node of diagram.nodes) {
    if (node.type !== "block" || !node.tf) continue;
    for (const expr of [node.tf.num, node.tf.den]) {
      let match: RegExpExecArray | null;
      SYMBOL_RE.lastIndex = 0;
      while ((match = SYMBOL_RE.exec(expr)) !== null) {
        const sym = match[1];
        if (!SKIP.has(sym) && isNaN(Number(sym))) {
          found.add(sym);
        }
      }
    }
  }
  return Array.from(found).sort();
}

/** Substitute numeric values for all symbolic parameters in an expression string */
function substituteExpr(expr: string, values: Record<string, number>): string {
  // Replace longer tokens first to avoid partial matches (e.g. Kp before K)
  const tokens = Object.keys(values).sort((a, b) => b.length - a.length);
  let result = expr;
  for (const token of tokens) {
    // Replace token with numeric value, handling implicit multiplication: "2K" → "2*K"
    const re = new RegExp(`\\b${token}\\b`, "g");
    result = result.replace(re, String(values[token]));
  }
  // Handle implicit multiplication: "2(..." → "2*(..."  and  ")2" → ")*2", "2 3" patterns
  result = result.replace(/(\d)\s*\(/g, "$1*(");
  result = result.replace(/\)\s*(\d)/g, ")*$1");
  return result;
}

/** Create a resolved copy of the diagram with all symbolic params substituted */
function resolveDiagram(diagram: DiagramState, values: Record<string, number>): DiagramState {
  return {
    ...diagram,
    nodes: diagram.nodes.map(n => {
      if (n.type !== "block" || !n.tf) return n;
      return {
        ...n,
        tf: {
          num: substituteExpr(n.tf.num, values),
          den: substituteExpr(n.tf.den, values),
        },
      };
    }),
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

interface GainTunerProps {
  diagram: DiagramState;
  onAnalyze?: (result: SolverResult | null, error: string) => void;
}

export function GainTuner({ diagram, onAnalyze }: GainTunerProps) {
  const params = useMemo(() => extractParams(diagram), [diagram]);

  // Initialize parameter values from defaults
  const [values, setValues] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const p of params) {
      init[p] = PARAM_DEFS[p]?.default ?? 1;
    }
    return init;
  });

  // Update values when params change (new blocks added/removed)
  useEffect(() => {
    setValues(prev => {
      const next: Record<string, number> = {};
      for (const p of params) {
        next[p] = prev[p] ?? PARAM_DEFS[p]?.default ?? 1;
      }
      return next;
    });
  }, [params]);

  const [expanded, setExpanded] = useState(true);
  const [liveUpdate, setLiveUpdate] = useState(true);

  const runAnalysis = useCallback((vals: Record<string, number>) => {
    if (!onAnalyze) return;
    try {
      const resolved = resolveDiagram(diagram, vals);
      const result = analyzeDiagram(resolved);
      if ("error" in result) {
        onAnalyze(null, result.error);
      } else {
        onAnalyze(result.result, "");
      }
    } catch (e: any) {
      onAnalyze(null, e.message || "Gain tuning analysis failed");
    }
  }, [diagram, onAnalyze]);

  const handleSliderChange = useCallback((param: string, value: number) => {
    setValues(prev => {
      const next = { ...prev, [param]: value };
      if (liveUpdate) {
        // Debounce slightly with requestAnimationFrame
        requestAnimationFrame(() => runAnalysis(next));
      }
      return next;
    });
  }, [liveUpdate, runAnalysis]);

  const handleApply = useCallback(() => {
    runAnalysis(values);
  }, [runAnalysis, values]);

  const handleReset = useCallback(() => {
    const defaults: Record<string, number> = {};
    for (const p of params) {
      defaults[p] = PARAM_DEFS[p]?.default ?? 1;
    }
    setValues(defaults);
    if (liveUpdate) runAnalysis(defaults);
  }, [params, liveUpdate, runAnalysis]);

  if (params.length === 0) return null;

  return (
    <div className="absolute top-12 right-2 z-30 w-52">
      <div className="rounded border border-border/60 bg-background/90 backdrop-blur-sm shadow-lg overflow-hidden">
        {/* Header */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
        >
          <span>🎚 Gain Tuning ({params.length})</span>
          <span>{expanded ? "▲" : "▼"}</span>
        </button>

        {expanded && (
          <div className="px-3 pb-3 space-y-2">
            {/* Live toggle */}
            <div className="flex items-center justify-between">
              <label className="text-[9px] text-muted-foreground font-mono">Live update</label>
              <button
                onClick={() => setLiveUpdate(!liveUpdate)}
                className={cn(
                  "w-7 h-3.5 rounded-full relative transition-colors",
                  liveUpdate ? "bg-primary/60" : "bg-muted"
                )}
              >
                <span className={cn(
                  "absolute top-0.5 w-2.5 h-2.5 rounded-full bg-foreground transition-transform",
                  liveUpdate ? "left-[14px]" : "left-0.5"
                )} />
              </button>
            </div>

            {/* Parameter sliders */}
            {params.map(param => {
              const def = PARAM_DEFS[param] ?? { min: 0, max: 10, step: 0.1, default: 1 };
              const val = values[param] ?? (def as any).default ?? 1;
              return (
                <div key={param} className="space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-semibold text-primary">{param}</span>
                    <input
                      type="number"
                      value={val}
                      step={def.step}
                      min={def.min}
                      max={def.max}
                      onChange={e => handleSliderChange(param, parseFloat(e.target.value) || 0)}
                      className="w-14 text-[10px] font-mono bg-secondary/70 border border-border rounded px-1 py-0.5 text-foreground text-right focus:outline-none focus:border-primary"
                    />
                  </div>
                  <input
                    type="range"
                    min={def.min}
                    max={def.max}
                    step={def.step}
                    value={val}
                    onChange={e => handleSliderChange(param, parseFloat(e.target.value))}
                    className="w-full h-1.5 appearance-none bg-muted rounded-full cursor-pointer accent-primary"
                    style={{ accentColor: "hsl(174,80%,45%)" }}
                  />
                  <div className="flex justify-between text-[8px] font-mono text-muted-foreground/60">
                    <span>{def.min}</span>
                    <span>{def.max}</span>
                  </div>
                </div>
              );
            })}

            {/* Action buttons */}
            <div className="flex gap-1.5 pt-1">
              {!liveUpdate && (
                <button
                  onClick={handleApply}
                  className="btn-glow flex-1 py-1 rounded text-[9px] font-bold"
                >
                  ⚡ Apply
                </button>
              )}
              <button
                onClick={handleReset}
                className="flex-1 py-1 rounded text-[9px] font-mono border border-border text-muted-foreground hover:text-foreground transition-colors"
              >
                Reset
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
