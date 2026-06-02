import React from "react";
import { Identity, CATEGORY_META } from "@/lib/identities";
import { cn } from "@/lib/utils";

type Props = {
  identity: Identity;
  isExpanded: boolean;
  onToggle: () => void;
};

export function IdentityCard({ identity, isExpanded, onToggle }: Props) {
  const catMeta = CATEGORY_META[identity.category];

  const badgeClass = {
    primary: "badge-series",
    accent: "badge-parallel",
    warning: "badge-feedback",
    success: "bg-success/10 text-success border border-success/30",
    info: "bg-info/10 text-info border border-info/30",
  }[catMeta.color] ?? "badge-series";

  const supportMeta = {
    live: {
      label: "LIVE TOOL",
      className: "bg-success/10 text-success border border-success/30",
    },
    partial: {
      label: "PARTIAL",
      className: "bg-warning/10 text-warning border border-warning/30",
    },
    reference: {
      label: "REFERENCE",
      className: "bg-muted text-muted-foreground border border-border",
    },
  }[identity.support];

  return (
    <div
      className={cn(
        "identity-card rounded-lg overflow-hidden cursor-pointer",
        isExpanded && "border-l-primary border border-primary/20"
      )}
      onClick={onToggle}
    >
      {/* Header */}
      <div className="p-3 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={cn("text-[10px] font-mono px-1.5 py-0.5 rounded font-medium", badgeClass)}>
              {catMeta.label}
            </span>
            <span className={cn("text-[10px] font-mono px-1.5 py-0.5 rounded font-medium", supportMeta.className)}>
              {supportMeta.label}
            </span>
            {identity.warning && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/30">
                ⚠️ WARNING
              </span>
            )}
          </div>
          <h3 className="text-sm font-semibold text-foreground leading-snug">{identity.name}</h3>
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{identity.description}</p>
          {identity.toolPath && (
            <p className="text-[10px] text-muted-foreground/80 mt-1 font-mono">
              Tool: {identity.toolPath}
            </p>
          )}
        </div>
        <div className="text-muted-foreground text-xs mt-0.5 flex-shrink-0">
          {isExpanded ? "▲" : "▼"}
        </div>
      </div>

      {/* Formula preview (always visible) */}
      <div className="mx-3 mb-3 px-3 py-2 eq-display rounded text-xs font-mono text-primary leading-relaxed">
        <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Equivalent</div>
        <div className="text-primary">{identity.equivalent}</div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-border mx-3 mb-3 pt-3 space-y-3">
          {/* Diagram */}
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Diagram</div>
            <pre className="text-xs font-mono text-accent leading-relaxed whitespace-pre-wrap">
              {identity.formula}
            </pre>
          </div>

          {/* Derivation */}
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Derivation</div>
            <ol className="space-y-1">
              {identity.derivation.map((step, i) => (
                <li key={i} className="flex gap-2 text-xs">
                  <span className="text-muted-foreground flex-shrink-0 font-mono">{i + 1}.</span>
                  <span className="font-mono text-foreground/90">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Notes */}
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Key Notes</div>
            <ul className="space-y-1">
              {identity.notes.map((note, i) => (
                <li key={i} className="flex gap-2 text-xs">
                  <span className="text-primary flex-shrink-0">•</span>
                  <span className="text-foreground/80">{note}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Warning */}
          {identity.warning && (
            <div className="px-3 py-2 bg-destructive/10 border border-destructive/30 rounded text-xs text-destructive font-medium">
              {identity.warning}
            </div>
          )}

          {/* Reference */}
          {identity.reference && (
            <div className="text-[10px] text-muted-foreground">
              📚 {identity.reference}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
