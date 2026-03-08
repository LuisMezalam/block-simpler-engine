import React, { useState, useCallback, useMemo } from "react";
import { solve, SolverResult, ConnectionType, stabilityLabel } from "@/lib/solver";
import { computeMargins, StabilityMargins } from "@/lib/margins";
import { BlockDiagram } from "@/components/BlockDiagram";
import { DiagramEditor } from "@/components/DiagramEditor";
import { SanityLibrary } from "@/components/SanityLibrary";
import { StateSpacePanel } from "@/components/StateSpacePanel";
import { AnalysisPlots } from "@/components/AnalysisPlots";
import { cn } from "@/lib/utils";

type ConnectionMode = ConnectionType;

const CONNECTION_OPTIONS: { value: ConnectionMode; label: string; desc: string; icon: string }[] = [
  { value: "series",           label: "Series (Cascade)",  desc: "G_eq = G₁·G₂·...·Gₙ", icon: "→" },
  { value: "parallel",         label: "Parallel",          desc: "G_eq = G₁ + G₂ + ...", icon: "⊕" },
  { value: "feedback_negative",label: "Negative Feedback", desc: "G_eq = G/(1+GH)",        icon: "↩" },
  { value: "unity_feedback",   label: "Unity Feedback",    desc: "G_eq = G/(1+G)",         icon: "↺" },
  { value: "feedback_positive",label: "Positive Feedback", desc: "G_eq = G/(1−GH)",        icon: "↑" },
];

type BlockState = { id: string; label: string; num: string; den: string };

const DEFAULT_BLOCKS: BlockState[] = [
  { id: "g1", label: "G₁", num: "1", den: "s + 1" },
  { id: "g2", label: "G₂", num: "2", den: "s + 2" },
];
const DEFAULT_FEEDBACK: BlockState = { id: "h1", label: "H", num: "1", den: "1" };

// ─── Typed block input component ─────────────────────────────────────────────
function TFInput({
  label,
  num,
  den,
  onChange,
  hint,
}: {
  label: string;
  num: string;
  den: string;
  onChange: (num: string, den: string) => void;
  hint?: string;
}) {
  return (
    <div className="tf-block rounded-lg p-3">
      <div className="text-xs font-bold text-primary mb-2 font-mono">{label}</div>
      {hint && <div className="text-[10px] text-muted-foreground/60 font-mono mb-1.5">{hint}</div>}
      <div className="space-y-1.5">
        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-0.5">
            Numerator N(s)
          </label>
          <input
            type="text"
            value={num}
            onChange={e => onChange(e.target.value, den)}
            placeholder="e.g. 1, s+1, 2s^2+3s+1"
            className="w-full bg-secondary/70 border border-border rounded px-2 py-1 text-xs font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary transition-colors"
          />
        </div>
        <div className="h-px bg-primary/30 mx-1" />
        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-0.5">
            Denominator D(s)
          </label>
          <input
            type="text"
            value={den}
            onChange={e => onChange(num, e.target.value)}
            placeholder="e.g. s, s+2, s^2+3s+2"
            className="w-full bg-secondary/70 border border-border rounded px-2 py-1 text-xs font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary transition-colors"
          />
        </div>
      </div>
    </div>
  );
}

// ─── Result panel ─────────────────────────────────────────────────────────────
function ResultPanel({ result, error }: { result: SolverResult | null; error: string }) {
  const [showDerivation, setShowDerivation] = useState(false);

  if (error) {
    return (
      <div className="panel-section p-4">
        <div className="text-xs text-destructive font-mono bg-destructive/10 border border-destructive/20 rounded p-3">
          ⚠️ {error}
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="panel-section p-6 text-center">
        <div className="text-4xl mb-3 opacity-30">⚡</div>
        <p className="text-sm text-muted-foreground">
          Configure your block diagram and click{" "}
          <strong className="text-primary">Calculate G_eq(s)</strong> to see the exact typed result.
        </p>
        <p className="text-[11px] text-muted-foreground/60 mt-2 font-mono">
          Powered by exact polynomial arithmetic · GCD simplification · Stability analysis
        </p>
      </div>
    );
  }

  const stab = stabilityLabel(result.stability);
  const connLabel = CONNECTION_OPTIONS.find(o => o.value === result.connectionType)?.label ?? result.connectionType;

  return (
    <div className="panel-section overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-3 flex-wrap">
        <span className="text-[10px] font-mono px-2 py-0.5 rounded font-semibold badge-series">
          {connLabel}
        </span>
        <span className={cn("text-[10px] font-mono px-2 py-0.5 rounded font-semibold border", stab.color,
          result.stability === "stable" ? "bg-success/10 border-success/30" :
          result.stability === "unstable" ? "bg-destructive/10 border-destructive/30" :
          "bg-warning/10 border-warning/30"
        )}>
          {stab.label}
        </span>
        <h3 className="text-sm font-bold text-foreground">G_eq(s)</h3>
      </div>

      <div className="p-4 space-y-4">
        {/* Main TF result — exact polynomial form */}
        <div className="result-display rounded-lg p-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
            Exact G_eq(s) — Polynomial Arithmetic Result
          </div>
          <div className="flex flex-col items-start gap-1">
            <div className="text-sm font-mono text-primary font-medium leading-relaxed break-all">
              {result.display.num}
            </div>
            <div className="h-px w-full bg-primary/40" />
            <div className="text-sm font-mono text-foreground/80 leading-relaxed break-all">
              {result.display.den}
            </div>
          </div>
        </div>

        {/* Formula identity */}
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Identity Applied</div>
          <div className="eq-display rounded px-3 py-2 text-xs font-mono text-accent leading-relaxed break-all">
            {result.formula}
          </div>
        </div>

        {/* Characteristic equation */}
        <div className="bg-secondary/50 rounded px-3 py-2">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Characteristic Equation</div>
          <div className="text-xs font-mono text-warning break-all">{result.charEq}</div>
        </div>

        {/* Poles & Zeros */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-secondary/50 rounded px-3 py-2">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Closed-Loop Poles</div>
            {result.poles.length === 0 ? (
              <div className="text-xs font-mono text-muted-foreground">None</div>
            ) : result.poles.map((p, i) => (
              <div key={i} className={cn("text-xs font-mono", isNaN(p.re) ? "text-muted-foreground" : p.re > 1e-8 ? "text-destructive" : "text-foreground/90")}>
                s = {isNaN(p.re) ? `solve: ${result.charEq}` : `${p.re > 0 ? "+" : ""}${p.re.toFixed(4)}${Math.abs(p.im) > 1e-10 ? ` ± j${Math.abs(p.im).toFixed(4)}` : ""}`}
              </div>
            ))}
          </div>
          <div className="bg-secondary/50 rounded px-3 py-2">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Zeros</div>
            {result.zeros.length === 0 ? (
              <div className="text-xs font-mono text-muted-foreground">None</div>
            ) : result.zeros.map((z, i) => (
              <div key={i} className="text-xs font-mono text-foreground/90">
                s = {isNaN(z.re) ? "?" : `${z.re.toFixed(4)}${Math.abs(z.im) > 1e-10 ? ` ± j${Math.abs(z.im).toFixed(4)}` : ""}`}
              </div>
            ))}
          </div>
        </div>

        {/* Derivation accordion */}
        <div>
          <button
            onClick={() => setShowDerivation(!showDerivation)}
            className="w-full flex items-center justify-between text-xs font-semibold text-muted-foreground hover:text-foreground uppercase tracking-wider py-1 border-t border-border pt-3"
          >
            <span>Step-by-Step Algebraic Derivation</span>
            <span>{showDerivation ? "▲" : "▼"}</span>
          </button>
          {showDerivation && (
            <ol className="mt-2 space-y-1.5">
              {result.derivation.map((step, i) => (
                <li key={i} className="flex gap-2 text-xs">
                  <span className="text-muted-foreground font-mono flex-shrink-0 w-4">{i + 1}.</span>
                  <span className={cn(
                    "font-mono leading-relaxed break-all",
                    step.includes("⚠️") || step.includes("❌") ? "text-warning" :
                    step.includes("🔑") ? "text-accent" :
                    step === "" ? "hidden" :
                    "text-foreground/85"
                  )}>
                    {step}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Numeric presets (use parseable polynomial strings) ───────────────────────
const PRESETS = [
  {
    label: "First-Order Unity Feedback",
    connection: "unity_feedback" as ConnectionMode,
    blocks: [{ id: "g1", label: "G", num: "1", den: "s + 1" }],
    feedbackBlock: DEFAULT_FEEDBACK,
  },
  {
    label: "Second-Order (ωn=2, ζ=0.5)",
    connection: "unity_feedback" as ConnectionMode,
    blocks: [{ id: "g1", label: "G", num: "4", den: "s^2 + 2s" }],
    feedbackBlock: DEFAULT_FEEDBACK,
  },
  {
    label: "Double Integrator w/ Feedback",
    connection: "unity_feedback" as ConnectionMode,
    blocks: [{ id: "g1", label: "G", num: "1", den: "s^2" }],
    feedbackBlock: DEFAULT_FEEDBACK,
  },
  {
    label: "Series: Two First-Order Plants",
    connection: "series" as ConnectionMode,
    blocks: [
      { id: "g1", label: "G₁", num: "1", den: "s + 1" },
      { id: "g2", label: "G₂", num: "2", den: "s + 2" },
    ],
    feedbackBlock: DEFAULT_FEEDBACK,
  },
  {
    label: "Tachometer Feedback",
    connection: "feedback_negative" as ConnectionMode,
    blocks: [{ id: "g1", label: "G", num: "10", den: "s^2 + s" }],
    feedbackBlock: { id: "h1", label: "H", num: "2s", den: "1" },
  },
  {
    label: "Parallel: Proportional + Integral",
    connection: "parallel" as ConnectionMode,
    blocks: [
      { id: "g1", label: "P", num: "2", den: "1" },
      { id: "g2", label: "I", num: "1", den: "s" },
    ],
    feedbackBlock: DEFAULT_FEEDBACK,
  },
];

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Index() {
  const [connectionType, setConnectionType] = useState<ConnectionMode>("series");
  const [blocks, setBlocks] = useState<BlockState[]>(DEFAULT_BLOCKS);
  const [feedbackBlock, setFeedbackBlock] = useState<BlockState>(DEFAULT_FEEDBACK);
  const [result, setResult] = useState<SolverResult | null>(null);
  const [error, setError] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"builder" | "statespace" | "library">("builder");
  const [showPresets, setShowPresets] = useState(false);

  const needsFeedback = connectionType === "feedback_negative" || connectionType === "feedback_positive";
  const needsMultiBlock = connectionType === "series" || connectionType === "parallel";

  const handleCalculate = useCallback(() => {
    try {
      setError("");
      for (const b of blocks) {
        if (!b.num.trim() || !b.den.trim()) {
          throw new Error(`Block ${b.label}: numerator and denominator cannot be empty.`);
        }
      }
      if (needsFeedback && !feedbackBlock.num.trim()) {
        throw new Error("Feedback block H(s): numerator cannot be empty.");
      }

      const activeBlocks = needsFeedback || connectionType === "unity_feedback"
        ? [blocks[0]] : blocks;

      const res = solve(
        connectionType,
        activeBlocks.map(b => ({ id: b.id, label: b.label, numStr: b.num, denStr: b.den })),
        needsFeedback
          ? { id: feedbackBlock.id, label: feedbackBlock.label, numStr: feedbackBlock.num, denStr: feedbackBlock.den }
          : undefined
      );
      setResult(res);
    } catch (e: any) {
      setError(e.message || "Calculation error");
      setResult(null);
    }
  }, [connectionType, blocks, feedbackBlock, needsFeedback]);

  const addBlock = () => {
    const n = blocks.length + 1;
    setBlocks([...blocks, { id: `g${n}`, label: `G${n}`, num: "1", den: "s + 1" }]);
  };

  const removeBlock = (id: string) => {
    if (blocks.length <= 2) return;
    setBlocks(blocks.filter(b => b.id !== id));
  };

  const updateBlock = (id: string, num: string, den: string) => {
    setBlocks(blocks.map(b => b.id === id ? { ...b, num, den } : b));
  };

  const applyPreset = (preset: typeof PRESETS[0]) => {
    setConnectionType(preset.connection);
    setBlocks(preset.blocks);
    setFeedbackBlock(preset.feedbackBlock);
    setResult(null);
    setError("");
    setShowPresets(false);
  };

  // Convert BlockState to BlockConfig for BlockDiagram
  const diagramBlocks = (needsFeedback || connectionType === "unity_feedback" ? [blocks[0]] : blocks)
    .map(b => ({ id: b.id, label: b.label, tf: { num: b.num, den: b.den } }));
  const diagramFeedback = needsFeedback
    ? { id: feedbackBlock.id, label: feedbackBlock.label, tf: { num: feedbackBlock.num, den: feedbackBlock.den } }
    : undefined;

  const TAB_LABELS: { id: "builder" | "statespace" | "library"; icon: string; label: string }[] = [
    { id: "builder",    icon: "⚙",  label: "Builder" },
    { id: "statespace", icon: "Σ",  label: "State-Space" },
    { id: "library",    icon: "📚", label: "Library" },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Nav */}
      <header className="border-b border-border bg-card px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <div className="w-2 h-2 rounded-full bg-accent" />
            <div className="w-2 h-2 rounded-full bg-warning" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-foreground tracking-wide">
              Block Diagram Simplifier
            </h1>
            <p className="text-[10px] text-muted-foreground font-mono">
              U(s) → G(s) → C(s) · Exact Polynomial Arithmetic · State-Space Conversion
            </p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
          Nise · Ogata · Franklin
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel */}
        <div className="w-80 flex-shrink-0 border-r border-border flex flex-col bg-card">
          {/* Tab switcher */}
          <div className="flex border-b border-border">
            {TAB_LABELS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex-1 py-2.5 text-[10px] font-semibold tracking-wide uppercase transition-all",
                  activeTab === tab.id
                    ? "text-primary border-b-2 border-primary bg-primary/5"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {/* Builder Tab */}
          {activeTab === "builder" && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Presets */}
              <div>
                <button
                  onClick={() => setShowPresets(!showPresets)}
                  className="w-full flex items-center justify-between text-xs font-semibold text-muted-foreground hover:text-foreground uppercase tracking-wider py-1"
                >
                  <span>Quick Presets</span>
                  <span>{showPresets ? "▲" : "▼"}</span>
                </button>
                {showPresets && (
                  <div className="mt-2 space-y-1">
                    {PRESETS.map((p, i) => (
                      <button
                        key={i}
                        onClick={() => applyPreset(p)}
                        className="w-full text-left px-3 py-2 rounded bg-secondary hover:bg-secondary/80 text-xs text-foreground hover:text-primary transition-colors"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Connection type */}
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-2">
                  Connection Type
                </label>
                <div className="space-y-1.5">
                  {CONNECTION_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setConnectionType(opt.value);
                        setResult(null);
                        setError("");
                        if ((opt.value === "feedback_negative" || opt.value === "feedback_positive" || opt.value === "unity_feedback") && blocks.length > 1) {
                          setBlocks([blocks[0]]);
                        }
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2 rounded border text-left transition-all",
                        connectionType === opt.value
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-secondary/30 text-muted-foreground hover:border-border/80 hover:text-foreground"
                      )}
                    >
                      <span className="text-base w-5 text-center flex-shrink-0">{opt.icon}</span>
                      <div>
                        <div className="text-xs font-semibold">{opt.label}</div>
                        <div className="text-[10px] font-mono text-muted-foreground">{opt.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Forward path blocks */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    {needsFeedback || connectionType === "unity_feedback" ? "Forward Path G(s)" : "Transfer Function Blocks"}
                  </label>
                  {needsMultiBlock && (
                    <button
                      onClick={addBlock}
                      className="text-[10px] text-primary hover:text-accent font-mono px-2 py-0.5 rounded border border-primary/30 hover:border-accent/50 transition-all"
                    >
                      + Add Block
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {(needsFeedback || connectionType === "unity_feedback" ? [blocks[0]] : blocks).map(block => (
                    <div key={block.id} className="relative">
                      <TFInput
                        label={`${block.label}(s)`}
                        num={block.num}
                        den={block.den}
                        onChange={(num, den) => updateBlock(block.id, num, den)}
                        hint="e.g. num: 1  den: s+1  →  G(s)=1/(s+1)"
                      />
                      {needsMultiBlock && blocks.length > 2 && (
                        <button
                          onClick={() => removeBlock(block.id)}
                          className="absolute top-2 right-2 text-[10px] text-muted-foreground hover:text-destructive"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Feedback block */}
              {needsFeedback && (
                <div>
                  <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-2">
                    Feedback Path H(s)
                  </label>
                  <TFInput
                    label="H(s)"
                    num={feedbackBlock.num}
                    den={feedbackBlock.den}
                    onChange={(num, den) => setFeedbackBlock({ ...feedbackBlock, num, den })}
                  />
                </div>
              )}

              {connectionType === "unity_feedback" && (
                <div className="eq-display rounded px-3 py-2 text-[10px] font-mono text-muted-foreground">
                  Unity feedback: H(s) = 1 · Uses exact N_G / (D_G + N_G) identity
                </div>
              )}

              {/* Info banner */}
              <div className="eq-display rounded px-3 py-2">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Polynomial Solver</div>
                <div className="text-[10px] font-mono text-muted-foreground leading-snug">
                  Coefficients are parsed into exact number arrays · GCD cancellation · Stability via pole real parts
                </div>
              </div>

              <button
                onClick={handleCalculate}
                className="btn-glow w-full py-2.5 rounded-lg text-sm font-bold tracking-wide"
              >
                ⚡ Calculate G_eq(s)
              </button>
            </div>
          )}

          {/* State-Space Tab */}
          {activeTab === "statespace" && (
            <div className="flex-1 overflow-hidden">
              <StateSpacePanel />
            </div>
          )}

          {/* Library Tab */}
          {activeTab === "library" && (
            <div className="flex-1 overflow-hidden">
              <SanityLibrary />
            </div>
          )}
        </div>

        {/* Main canvas + result */}
        <div className="flex-1 flex flex-col overflow-y-auto">
          {/* Interactive Block Diagram Editor (builder tab) */}
          {activeTab === "builder" && (
            <div className="panel-section m-4 mb-2 h-[500px] flex flex-col overflow-hidden flex-shrink-0">
              <div className="px-4 py-2 border-b border-border flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-signal" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Block Diagram Editor
                </span>
                <span className="text-[9px] font-mono text-muted-foreground/60 ml-auto">
                  Drag to move · ⤳ to connect · Click ✎ to edit G(s)
                </span>
              </div>
              <DiagramEditor
                onAnalyze={(res, err) => {
                  if (res) {
                    setResult(res);
                    setError("");
                  } else {
                    setResult(null);
                    setError(err);
                  }
                }}
              />
            </div>
          )}

          {/* State-space diagram placeholder */}
          {activeTab === "statespace" && (
            <div className="panel-section m-4 mb-2 flex-shrink-0">
              <div className="px-4 py-2 border-b border-border flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  State-Space Representation
                </span>
              </div>
              <div className="p-4">
                <svg width="500" height="80" className="mx-auto overflow-visible" viewBox="0 0 500 80">
                  {/* u(t) → B → Σ → integrate → x(t) → C → y(t) */}
                  <text x="10" y="42" fill="hsl(174,80%,55%)" fontSize={11} fontFamily="monospace">u(t)</text>
                  <line x1="40" y1="38" x2="70" y2="38" stroke="hsl(174,80%,55%)" strokeWidth={1.5} />
                  <rect x="70" y="24" width="40" height="28" rx={4} fill="hsl(220,18%,13%)" stroke="hsl(174,60%,35%)" strokeWidth={1.5} />
                  <text x="90" y="42" textAnchor="middle" fill="hsl(174,80%,45%)" fontSize={10} fontFamily="monospace">B</text>
                  <line x1="110" y1="38" x2="135" y2="38" stroke="hsl(174,80%,55%)" strokeWidth={1.5} />
                  <circle cx="147" cy="38" r="12" fill="hsl(220,18%,16%)" stroke="hsl(174,80%,55%)" strokeWidth={1.5} />
                  <text x="147" y="43" textAnchor="middle" fill="hsl(174,80%,55%)" fontSize={11} fontFamily="monospace">Σ</text>
                  <line x1="159" y1="38" x2="185" y2="38" stroke="hsl(174,80%,55%)" strokeWidth={1.5} />
                  <rect x="185" y="24" width="50" height="28" rx={4} fill="hsl(220,18%,13%)" stroke="hsl(174,60%,35%)" strokeWidth={1.5} />
                  <text x="210" y="42" textAnchor="middle" fill="hsl(174,80%,45%)" fontSize={10} fontFamily="monospace">∫ dt</text>
                  <line x1="235" y1="38" x2="275" y2="38" stroke="hsl(174,80%,55%)" strokeWidth={1.5} />
                  <text x="255" y="30" fill="hsl(174,80%,55%)" fontSize={9} fontFamily="monospace">x(t)</text>
                  <circle cx="275" cy="38" r="3" fill="hsl(174,80%,55%)" />
                  <rect x="285" y="24" width="40" height="28" rx={4} fill="hsl(220,18%,13%)" stroke="hsl(174,60%,35%)" strokeWidth={1.5} />
                  <text x="305" y="42" textAnchor="middle" fill="hsl(174,80%,45%)" fontSize={10} fontFamily="monospace">C</text>
                  <line x1="325" y1="38" x2="370" y2="38" stroke="hsl(174,80%,55%)" strokeWidth={1.5} />
                  <circle cx="370" cy="38" r="12" fill="hsl(220,18%,16%)" stroke="hsl(174,80%,55%)" strokeWidth={1.5} />
                  <text x="370" y="43" textAnchor="middle" fill="hsl(174,80%,55%)" fontSize={11} fontFamily="monospace">Σ</text>
                  <line x1="382" y1="38" x2="420" y2="38" stroke="hsl(174,80%,55%)" strokeWidth={1.5} />
                  <polygon points="416,34 424,38 416,42" fill="hsl(174,80%,55%)" />
                  <text x="430" y="42" fill="hsl(174,80%,55%)" fontSize={11} fontFamily="monospace">y(t)</text>
                  {/* D feedthrough */}
                  <line x1="40" y1="38" x2="40" y2="70" stroke="hsl(196,85%,50%)" strokeWidth={1} strokeDasharray="3 2" />
                  <line x1="40" y1="70" x2="370" y2="70" stroke="hsl(196,85%,50%)" strokeWidth={1} strokeDasharray="3 2" />
                  <rect x="178" y="60" width="30" height="18" rx={3} fill="hsl(220,18%,13%)" stroke="hsl(196,60%,35%)" strokeWidth={1} />
                  <text x="193" y="73" textAnchor="middle" fill="hsl(196,85%,50%)" fontSize={9} fontFamily="monospace">D</text>
                  <line x1="370" y1="70" x2="370" y2="50" stroke="hsl(196,85%,50%)" strokeWidth={1} strokeDasharray="3 2" />
                  {/* A feedback */}
                  <line x1="275" y1="38" x2="275" y2="10" stroke="hsl(215,15%,55%)" strokeWidth={1} strokeDasharray="3 2" />
                  <line x1="147" y1="10" x2="275" y2="10" stroke="hsl(215,15%,55%)" strokeWidth={1} strokeDasharray="3 2" />
                  <rect x="178" y="3" width="30" height="14" rx={3} fill="hsl(220,18%,13%)" stroke="hsl(215,25%,30%)" strokeWidth={1} />
                  <text x="193" y="14" textAnchor="middle" fill="hsl(215,15%,55%)" fontSize={9} fontFamily="monospace">A</text>
                  <line x1="147" y1="10" x2="147" y2="26" stroke="hsl(215,15%,55%)" strokeWidth={1} strokeDasharray="3 2" />
                </svg>
              </div>
            </div>
          )}

          {/* Result panel (builder only) */}
          {activeTab === "builder" && (
            <div className="overflow-y-auto px-4 pb-4 max-h-[50vh] space-y-3">
              <ResultPanel result={result} error={error} />
              {result && <AnalysisPlots result={result} />}
            </div>
          )}

          {/* Library full-width info */}
          {activeTab === "library" && (
            <div className="flex-1 overflow-y-auto p-4">
              <div className="panel-section p-6 text-center">
                <div className="text-3xl mb-3">📚</div>
                <h3 className="text-sm font-bold text-foreground mb-2">Sanity Check Library</h3>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  Browse verified block diagram identities in the left panel. Each identity includes a formal derivation,
                  notes on poles/zeros, and textbook references (Nise, Ogata, Franklin).
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
