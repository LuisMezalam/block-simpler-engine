import React, { useState } from "react";
import { IDENTITIES, CATEGORY_META, IdentityCategory } from "@/lib/identities";
import { IdentityCard } from "./IdentityCard";
import { cn } from "@/lib/utils";

const CATEGORIES: IdentityCategory[] = [
  "cascade",
  "parallel",
  "feedback",
  "moving",
  "algebraic",
  "signal_flow",
];

export function SanityLibrary() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<IdentityCategory | "all">("all");
  const [search, setSearch] = useState("");

  const filtered = IDENTITIES.filter((id) => {
    const catMatch = activeCategory === "all" || id.category === activeCategory;
    const searchMatch =
      !search ||
      id.name.toLowerCase().includes(search.toLowerCase()) ||
      id.description.toLowerCase().includes(search.toLowerCase()) ||
      id.equivalent.toLowerCase().includes(search.toLowerCase());
    return catMatch && searchMatch;
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-border">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <h2 className="text-sm font-bold text-foreground tracking-wide uppercase">
            Sanity Check Library
          </h2>
        </div>
        <p className="text-[11px] text-muted-foreground leading-snug">
          {IDENTITIES.length} verified identities — CSUN Ch.1, Nise, Ogata, Franklin
        </p>

        {/* Search */}
        <input
          type="text"
          placeholder="Search identities..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mt-2 w-full bg-secondary border border-border rounded px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary font-mono"
        />
      </div>

      {/* Category filter */}
      <div className="px-4 py-2 border-b border-border flex gap-1 flex-wrap">
        <button
          onClick={() => setActiveCategory("all")}
          className={cn(
            "text-[10px] px-2 py-0.5 rounded font-mono transition-all",
            activeCategory === "all"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary"
          )}
        >
          All ({IDENTITIES.length})
        </button>
        {CATEGORIES.map((cat) => {
          const count = IDENTITIES.filter((id) => id.category === cat).length;
          const meta = CATEGORY_META[cat];
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                "text-[10px] px-2 py-0.5 rounded font-mono transition-all",
                activeCategory === cat
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              {meta.label.split(" ")[0]} ({count})
            </button>
          );
        })}
      </div>

      {/* Identity list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center text-muted-foreground text-xs py-8">
            No identities match your search.
          </div>
        ) : (
          filtered.map((identity) => (
            <IdentityCard
              key={identity.id}
              identity={identity}
              isExpanded={expandedId === identity.id}
              onToggle={() =>
                setExpandedId(expandedId === identity.id ? null : identity.id)
              }
            />
          ))
        )}
      </div>
    </div>
  );
}
