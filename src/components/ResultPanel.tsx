import React from "react";
import { SimplificationResult } from "@/lib/transferFunctions";
import { cn } from "@/lib/utils";

type Props = {
  result: SimplificationResult | null;
  error?: string;
};

const CONNECTION_LABELS = {
  series: { label: "Series (Cascade)", badge: "badge-series" },
  parallel: { label: "Parallel", badge: "badge-parallel" },
  feedback_negative: { label: "Negative Feedback", badge: "badge-feedback" },
  feedback_positive: { label: "Positive Feedback", badge: "bg-destructive/15 text-destructive border border-destructive/30" },
  unity_feedback: { label: "Unity Feedback", badge: "badge-feedback" },
};

export function ResultPanel({ result, error }: Props) {
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
          Configure your block diagram above and click <strong className="text-primary">Calculate</strong> to see the equivalent transfer function.
        </p>
      </div>
    );
  }

  const meta = CONNECTION_LABELS[result.connectionType];

  return (
    <div className="panel-section overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-3">
        <span className={cn("text-[10px] font-mono px-2 py-0.5 rounded font-semibold", meta.badge)}>
          {meta.label}
        </span>
        <h3 className="text-sm font-bold text-foreground">Equivalent Transfer Function</h3>
      </div>

      {/* Main Result */}
      <div className="p-4">
        <div className="result-display rounded-lg p-4 mb-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">G_eq(s) =</div>
          {/* Fraction display */}
          <div className="flex flex-col items-start gap-1">
            <div className="text-sm font-mono text-primary font-medium leading-relaxed">
              {result.equivalentTF.num}
            </div>
            <div className="h-px w-full bg-primary/40" />
            <div className="text-sm font-mono text-foreground/80 leading-relaxed">
              {result.equivalentTF.den}
            </div>
          </div>
        </div>

        {/* Formula */}
        <div className="mb-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Identity Applied</div>
          <div className="eq-display rounded px-3 py-2 text-xs font-mono text-accent leading-relaxed">
            {result.formula}
          </div>
        </div>

        {/* Poles & Zeros analysis */}
        <div className="grid grid-cols-1 gap-2 mb-4">
          <div className="bg-secondary/50 rounded px-3 py-2">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Poles Analysis</div>
            <div className="text-xs text-foreground/90 font-mono leading-relaxed">{result.poles}</div>
          </div>
          <div className="bg-secondary/50 rounded px-3 py-2">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Zeros Analysis</div>
            <div className="text-xs text-foreground/90 font-mono leading-relaxed">{result.zeros}</div>
          </div>
        </div>

        {/* Step-by-Step Derivation */}
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
            Step-by-Step Algebraic Derivation
          </div>
          <ol className="space-y-1.5">
            {result.derivation.map((step, i) => (
              <li key={i} className="flex gap-2 text-xs">
                <span className="text-muted-foreground font-mono flex-shrink-0 w-4">{i + 1}.</span>
                <span
                  className={cn(
                    "font-mono leading-relaxed",
                    step.includes("⚠️") ? "text-warning" : "text-foreground/85"
                  )}
                >
                  {step}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
