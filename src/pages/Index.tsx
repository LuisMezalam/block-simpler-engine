import React, { useState, useCallback } from "react";
import {
  simplify,
  BlockConfig,
  SimplificationResult,
  ConnectionType,
} from "@/lib/transferFunctions";
import { BlockDiagram } from "@/components/BlockDiagram";
import { ResultPanel } from "@/components/ResultPanel";
import { SanityLibrary } from "@/components/SanityLibrary";
import { cn } from "@/lib/utils";

type ConnectionMode = ConnectionType | "unity_feedback";

const CONNECTION_OPTIONS: { value: ConnectionMode; label: string; desc: string; icon: string }[] = [
  {
    value: "series",
    label: "Series (Cascade)",
    desc: "G_eq = G₁·G₂·...·Gₙ",
    icon: "→",
  },
  {
    value: "parallel",
    label: "Parallel",
    desc: "G_eq = G₁ + G₂ + ...",
    icon: "⊕",
  },
  {
    value: "feedback_negative",
    label: "Negative Feedback",
    desc: "G_eq = G/(1+GH)",
    icon: "↩",
  },
  {
    value: "unity_feedback",
    label: "Unity Feedback",
    desc: "G_eq = G/(1+G)",
    icon: "↺",
  },
  {
    value: "feedback_positive",
    label: "Positive Feedback",
    desc: "G_eq = G/(1−GH)",
    icon: "↑",
  },
];

const DEFAULT_BLOCKS: BlockConfig[] = [
  { id: "g1", label: "G₁", tf: { num: "K₁", den: "s + a₁" } },
  { id: "g2", label: "G₂", tf: { num: "K₂", den: "s + a₂" } },
];

const DEFAULT_FEEDBACK: BlockConfig = {
  id: "h1",
  label: "H",
  tf: { num: "1", den: "1" },
};

function TFInput({
  label,
  tf,
  onChange,
}: {
  label: string;
  tf: { num: string; den: string };
  onChange: (tf: { num: string; den: string }) => void;
}) {
  return (
    <div className="tf-block rounded-lg p-3">
      <div className="text-xs font-bold text-primary mb-2 font-mono">{label}</div>
      <div className="space-y-1.5">
        <div>
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-0.5">
            Numerator N(s)
          </label>
          <input
            type="text"
            value={tf.num}
            onChange={(e) => onChange({ ...tf, num: e.target.value })}
            placeholder="e.g. K, s+1, s²+2s+1"
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
            value={tf.den}
            onChange={(e) => onChange({ ...tf, den: e.target.value })}
            placeholder="e.g. s, s+2, s²+3s+2"
            className="w-full bg-secondary/70 border border-border rounded px-2 py-1 text-xs font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary transition-colors"
          />
        </div>
      </div>
    </div>
  );
}

const PRESETS = [
  {
    label: "First-Order (RL circuit)",
    connection: "unity_feedback" as ConnectionMode,
    blocks: [{ id: "g1", label: "G", tf: { num: "K", den: "Ts + 1" } }],
    feedbackBlock: DEFAULT_FEEDBACK,
  },
  {
    label: "Second-Order System",
    connection: "unity_feedback" as ConnectionMode,
    blocks: [{ id: "g1", label: "G", tf: { num: "wn^2", den: "s(s + 2*z*wn)" } }],
    feedbackBlock: DEFAULT_FEEDBACK,
  },
  {
    label: "DC Motor (Cascade)",
    connection: "series" as ConnectionMode,
    blocks: [
      { id: "g1", label: "G_arm", tf: { num: "1", den: "Ls + R" } },
      { id: "g2", label: "G_mech", tf: { num: "Kₜ", den: "Js + B" } },
    ],
    feedbackBlock: DEFAULT_FEEDBACK,
  },
  {
    label: "PD + Plant",
    connection: "series" as ConnectionMode,
    blocks: [
      { id: "g1", label: "C(s)", tf: { num: "Kd·s + Kp", den: "1" } },
      { id: "g2", label: "P(s)", tf: { num: "1", den: "ms + b" } },
    ],
    feedbackBlock: DEFAULT_FEEDBACK,
  },
  {
    label: "Tachometer Feedback",
    connection: "feedback_negative" as ConnectionMode,
    blocks: [{ id: "g1", label: "G", tf: { num: "K", den: "s(s+1)" } }],
    feedbackBlock: { id: "h1", label: "H", tf: { num: "Kₜs", den: "1" } },
  },
];

export default function Index() {
  const [connectionType, setConnectionType] = useState<ConnectionMode>("series");
  const [blocks, setBlocks] = useState<BlockConfig[]>(DEFAULT_BLOCKS);
  const [feedbackBlock, setFeedbackBlock] = useState<BlockConfig>(DEFAULT_FEEDBACK);
  const [result, setResult] = useState<SimplificationResult | null>(null);
  const [error, setError] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"builder" | "library">("builder");
  const [showPresets, setShowPresets] = useState(false);

  const needsFeedback = connectionType === "feedback_negative" || connectionType === "feedback_positive";
  const needsMultiBlock = connectionType === "series" || connectionType === "parallel";

  const handleCalculate = useCallback(() => {
    try {
      setError("");
      // Validate inputs
      for (const b of blocks) {
        if (!b.tf.num.trim() || !b.tf.den.trim()) {
          throw new Error(`Block ${b.label}: numerator and denominator cannot be empty.`);
        }
      }
      if (needsFeedback && !feedbackBlock.tf.num.trim()) {
        throw new Error("Feedback block H(s): numerator cannot be empty.");
      }

      const res = simplify(
        connectionType as any,
        blocks,
        needsFeedback ? feedbackBlock : undefined
      );
      setResult(res);
    } catch (e: any) {
      setError(e.message || "Calculation error");
      setResult(null);
    }
  }, [connectionType, blocks, feedbackBlock, needsFeedback]);

  const addBlock = () => {
    const n = blocks.length + 1;
    setBlocks([
      ...blocks,
      {
        id: `g${n}`,
        label: `G${n}`,
        tf: { num: "K", den: "s + a" },
      },
    ]);
  };

  const removeBlock = (id: string) => {
    if (blocks.length <= 2) return;
    setBlocks(blocks.filter((b) => b.id !== id));
  };

  const updateBlock = (id: string, tf: { num: string; den: string }) => {
    setBlocks(blocks.map((b) => (b.id === id ? { ...b, tf } : b)));
  };

  const applyPreset = (preset: typeof PRESETS[0]) => {
    setConnectionType(preset.connection);
    setBlocks(preset.blocks);
    setFeedbackBlock(preset.feedbackBlock);
    setResult(null);
    setError("");
    setShowPresets(false);
  };

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
              U(s) → G(s) → C(s) · Transfer Function Calculator
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground font-mono hidden sm:block">
            CSUN ME · CSUN Ch.1 · Nise · Ogata · Franklin
          </span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel — Builder / Library */}
        <div className="w-80 flex-shrink-0 border-r border-border flex flex-col bg-card">
          {/* Tab switcher */}
          <div className="flex border-b border-border">
            {(["builder", "library"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "flex-1 py-2.5 text-xs font-semibold tracking-wide uppercase transition-all",
                  activeTab === tab
                    ? "text-primary border-b-2 border-primary bg-primary/5"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab === "builder" ? "⚙ Builder" : "📚 Library"}
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
                  {CONNECTION_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setConnectionType(opt.value);
                        setResult(null);
                        setError("");
                        // Adjust blocks for connection type
                        if (
                          (opt.value === "feedback_negative" ||
                            opt.value === "feedback_positive" ||
                            opt.value === "unity_feedback") &&
                          blocks.length > 1
                        ) {
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
                    {needsFeedback || connectionType === "unity_feedback"
                      ? "Forward Path G(s)"
                      : "Transfer Function Blocks"}
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
                  {(needsFeedback || connectionType === "unity_feedback"
                    ? [blocks[0]]
                    : blocks
                  ).map((block) => (
                    <div key={block.id} className="relative">
                      <TFInput
                        label={block.label + "(s)"}
                        tf={block.tf}
                        onChange={(tf) => updateBlock(block.id, tf)}
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
                    tf={feedbackBlock.tf}
                    onChange={(tf) => setFeedbackBlock({ ...feedbackBlock, tf })}
                  />
                </div>
              )}

              {connectionType === "unity_feedback" && (
                <div className="eq-display rounded px-3 py-2 text-[10px] font-mono text-muted-foreground">
                  Unity feedback: H(s) = 1 (identity sensor, no dynamics)
                </div>
              )}

              {/* Calculate button */}
              <button
                onClick={handleCalculate}
                className="btn-glow w-full py-2.5 rounded-lg text-sm font-bold tracking-wide"
              >
                ⚡ Calculate G_eq(s)
              </button>
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
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Block diagram visualization */}
          <div className="panel-section m-4 mb-2 flex-shrink-0">
            <div className="px-4 py-2 border-b border-border flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-signal" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Block Diagram Preview
              </span>
            </div>
            <div className="p-4 overflow-x-auto">
              <BlockDiagram
                connectionType={connectionType}
                blocks={
                  needsFeedback || connectionType === "unity_feedback"
                    ? [blocks[0]]
                    : blocks
                }
                feedbackBlock={needsFeedback ? feedbackBlock : undefined}
              />
            </div>
          </div>

          {/* Result */}
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <ResultPanel result={result} error={error} />
          </div>
        </div>
      </div>
    </div>
  );
}
