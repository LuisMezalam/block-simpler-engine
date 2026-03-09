import React, { useState, useEffect, useMemo, useCallback } from "react";
import { DiagramState, analyzeDiagram } from "@/lib/diagramEngine";
import { SolverResult } from "@/lib/solver";
import { cn } from "@/lib/utils";

// ─── Parameter Definitions ───────────────────────────────────────────────────

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

const PID_PARAMS = ["Kp", "Ki", "Kd"] as const;

/** PID presets: [label, Kp, Ki, Kd] */
const PID_PRESETS: [string, number, number, number][] = [
  ["P-only",  1,   0,   0   ],
  ["PI",      1,   0.5, 0   ],
  ["PD",      1,   0,   0.1 ],
  ["PID",     1,   0.5, 0.1 ],
  ["Aggr.",   5,   2,   0.5 ],
];

const SYMBOL_RE = /\b([A-Za-z_][A-Za-z0-9_]*)\b/g;
const SKIP = new Set(["s", "e", "j"]);

function extractParams(diagram: DiagramState): string[] {
  const found = new Set<string>();
  for (const node of diagram.nodes) {
    if (node.type !== "block" || !node.tf) continue;
    for (const expr of [node.tf.num, node.tf.den]) {
      let match: RegExpExecArray | null;
      SYMBOL_RE.lastIndex = 0;
      while ((match = SYMBOL_RE.exec(expr)) !== null) {
        const sym = match[1];
        if (!SKIP.has(sym) && isNaN(Number(sym))) found.add(sym);
      }
    }
  }
  return Array.from(found).sort();
}

function substituteExpr(expr: string, values: Record<string, number>): string {
  const tokens = Object.keys(values).sort((a, b) => b.length - a.length);
  let result = expr;
  for (const token of tokens) {
    const re = new RegExp(`\\b${token}\\b`, "g");
    result = result.replace(re, String(values[token]));
  }
  result = result.replace(/(\d)\s*\(/g, "$1*(");
  result = result.replace(/\)\s*(\d)/g, ")*$1");
  return result;
}

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

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ParamSliderProps {
  param: string;
  value: number;
  color?: string;
  onChange: (param: string, value: number) => void;
}

function ParamSlider({ param, value, color, onChange }: ParamSliderProps) {
  const def = PARAM_DEFS[param] ?? { min: 0, max: 10, step: 0.1, default: 1 };
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono font-semibold" style={{ color: color ?? "hsl(var(--primary))" }}>
          {param}
        </span>
        <input
          type="number"
          value={value}
          step={def.step}
          min={def.min}
          max={def.max}
          onChange={e => onChange(param, parseFloat(e.target.value) || 0)}
          className="w-14 text-[10px] font-mono bg-secondary/70 border border-border rounded px-1 py-0.5 text-foreground text-right focus:outline-none focus:border-primary"
        />
      </div>
      <input
        type="range"
        min={def.min}
        max={def.max}
        step={def.step}
        value={value}
        onChange={e => onChange(param, parseFloat(e.target.value))}
        className="w-full h-1.5 appearance-none bg-muted rounded-full cursor-pointer"
        style={{ accentColor: color ?? "hsl(174,80%,45%)" }}
      />
      <div className="flex justify-between text-[8px] font-mono text-muted-foreground/60">
        <span>{def.min}</span>
        <span>{def.max}</span>
      </div>
    </div>
  );
}

// ─── PID Color coding ─────────────────────────────────────────────────────────
const PID_COLORS: Record<string, string> = {
  Kp: "hsl(174,80%,45%)",  // teal — proportional
  Ki: "hsl(45,90%,55%)",   // amber — integral
  Kd: "hsl(280,70%,65%)",  // violet — derivative
};

// ─── Main Component ───────────────────────────────────────────────────────────

interface GainTunerProps {
  diagram: DiagramState;
  onAnalyze?: (result: SolverResult | null, error: string) => void;
}

export function GainTuner({ diagram, onAnalyze }: GainTunerProps) {
  const diagramParams = useMemo(() => extractParams(diagram), [diagram]);
  const [pidMode, setPidMode] = useState(false);

  // In PID mode, always include Kp/Ki/Kd even if not in diagram
  const params = useMemo(() => {
    if (!pidMode) return diagramParams;
    const all = new Set([...PID_PARAMS, ...diagramParams]);
    return Array.from(all).sort();
  }, [pidMode, diagramParams]);

  const [values, setValues] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const p of [...diagramParams, ...PID_PARAMS]) {
      init[p] = PARAM_DEFS[p]?.default ?? 1;
    }
    return init;
  });

  useEffect(() => {
    setValues(prev => {
      const next: Record<string, number> = { ...prev };
      for (const p of params) {
        if (!(p in next)) next[p] = PARAM_DEFS[p]?.default ?? 1;
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
      if (liveUpdate) requestAnimationFrame(() => runAnalysis(next));
      return next;
    });
  }, [liveUpdate, runAnalysis]);

  const handleApply = useCallback(() => runAnalysis(values), [runAnalysis, values]);

  const handleReset = useCallback(() => {
    const defaults: Record<string, number> = {};
    for (const p of params) defaults[p] = PARAM_DEFS[p]?.default ?? 1;
    setValues(defaults);
    if (liveUpdate) runAnalysis(defaults);
  }, [params, liveUpdate, runAnalysis]);

  const applyPIDPreset = useCallback((kp: number, ki: number, kd: number) => {
    setValues(prev => {
      const next = { ...prev, Kp: kp, Ki: ki, Kd: kd };
      if (liveUpdate) requestAnimationFrame(() => runAnalysis(next));
      return next;
    });
  }, [liveUpdate, runAnalysis]);

  // Only show if there are params, or if PID mode is explicitly on
  if (params.length === 0 && !pidMode) return null;

  // Separate PID params from "other" params for display ordering
  const pidParamList = pidMode ? PID_PARAMS.filter(p => params.includes(p)) : [];
  const otherParams = params.filter(p => !PID_PARAMS.includes(p as any));

  return (
    <div className="absolute top-12 right-2 z-30 w-56">
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

            {/* Controls row: Live + PID Mode */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <label className="text-[9px] text-muted-foreground font-mono">Live</label>
                <button
                  onClick={() => setLiveUpdate(!liveUpdate)}
                  className={cn(
                    "w-7 h-3.5 rounded-full relative transition-colors",
                    liveUpdate ? "bg-primary/60" : "bg-muted"
                  )}
                >
                  <span className={cn(
                    "absolute top-0.5 w-2.5 h-2.5 rounded-full bg-foreground transition-all",
                    liveUpdate ? "left-[14px]" : "left-0.5"
                  )} />
                </button>
              </div>

              {/* PID Mode toggle */}
              <button
                onClick={() => setPidMode(m => !m)}
                className={cn(
                  "flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold border transition-colors",
                  pidMode
                    ? "bg-primary/20 border-primary/50 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
                )}
              >
                <span>PID</span>
                {pidMode ? "✓" : "+"}
              </button>
            </div>

            {/* ── PID preset section ── */}
            {pidMode && (
              <div className="space-y-1.5 rounded border border-border/40 bg-muted/30 p-2">
                {/* Section label */}
                <div className="flex items-center gap-1 text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <span>⚙️</span><span>PID Presets</span>
                </div>

                {/* Preset buttons */}
                <div className="flex flex-wrap gap-1">
                  {PID_PRESETS.map(([label, kp, ki, kd]) => (
                    <button
                      key={label}
                      onClick={() => applyPIDPreset(kp, ki, kd)}
                      className="px-1.5 py-0.5 rounded text-[8px] font-mono border border-border/60 bg-secondary/50 text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* PID sliders with color coding */}
                <div className="space-y-2 pt-1">
                  {pidParamList.map(param => (
                    <ParamSlider
                      key={param}
                      param={param}
                      value={values[param] ?? 1}
                      color={PID_COLORS[param]}
                      onChange={handleSliderChange}
                    />
                  ))}
                </div>

                {/* PID formula reminder */}
                <div className="text-[8px] font-mono text-muted-foreground/50 text-center pt-0.5">
                  C(s) = Kp + Ki/s + Kd·s
                </div>
              </div>
            )}

            {/* Other params */}
            {otherParams.map(param => (
              <ParamSlider
                key={param}
                param={param}
                value={values[param] ?? 1}
                onChange={handleSliderChange}
              />
            ))}

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
