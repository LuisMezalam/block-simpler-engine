import React, { useMemo, useState } from "react";
import { ExternalLink, Search, ShieldCheck, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AWESOME_MATLAB_ROBOTICS_LICENSE_URL,
  AWESOME_MATLAB_ROBOTICS_URL,
  ROBOTICS_ACCESS_META,
  ROBOTICS_CATEGORIES,
  ROBOTICS_CATEGORY_META,
  ROBOTICS_LICENSE_NOTE,
  ROBOTICS_RESOURCES,
  resourceMatchesQuery,
  type RoboticsResourceCategory,
} from "@/lib/roboticsResources";

export function RoboticsResourceHub() {
  const [activeCategory, setActiveCategory] = useState<RoboticsResourceCategory | "all">("all");
  const [search, setSearch] = useState("");

  const categoryCounts = useMemo(() => {
    return ROBOTICS_CATEGORIES.reduce<Record<RoboticsResourceCategory, number>>((counts, category) => {
      counts[category] = ROBOTICS_RESOURCES.filter((resource) => resource.category === category).length;
      return counts;
    }, {} as Record<RoboticsResourceCategory, number>);
  }, []);

  const filteredResources = useMemo(() => {
    return ROBOTICS_RESOURCES.filter((resource) => {
      const categoryMatch = activeCategory === "all" || resource.category === activeCategory;
      return categoryMatch && resourceMatchesQuery(resource, search);
    });
  }, [activeCategory, search]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 pb-3 pt-4">
        <div className="mb-2 flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded border border-primary/30 bg-primary/10">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
          </div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">
            Robotics Resource Hub
          </h2>
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground">
          {ROBOTICS_RESOURCES.length} curated links from the MathWorks robotics list, organized for control, planning, ROS, simulation, and hardware workflows.
        </p>

        <div className="mt-3 flex gap-2">
          <a
            href={AWESOME_MATLAB_ROBOTICS_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex flex-1 items-center justify-center gap-1 rounded border border-border bg-secondary/35 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            Source
            <ExternalLink className="h-3 w-3" />
          </a>
          <a
            href={AWESOME_MATLAB_ROBOTICS_LICENSE_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex flex-1 items-center justify-center gap-1 rounded border border-border bg-secondary/35 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            License
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search ROS, SLAM, PID, UAV..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full rounded border border-border bg-secondary px-7 py-1.5 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border px-4 py-2">
        <button
          type="button"
          onClick={() => setActiveCategory("all")}
          className={cn(
            "rounded px-2 py-0.5 font-mono text-[10px] transition-all",
            activeCategory === "all"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          )}
        >
          All ({ROBOTICS_RESOURCES.length})
        </button>
        {ROBOTICS_CATEGORIES.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => setActiveCategory(category)}
            className={cn(
              "rounded px-2 py-0.5 font-mono text-[10px] transition-all",
              activeCategory === category
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            {ROBOTICS_CATEGORY_META[category].shortLabel} ({categoryCounts[category]})
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        <div className="rounded border border-warning/25 bg-warning/10 px-3 py-2">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-warning" />
            <p className="text-[10px] leading-snug text-muted-foreground">{ROBOTICS_LICENSE_NOTE}</p>
          </div>
        </div>

        {filteredResources.length === 0 ? (
          <div className="rounded border border-border bg-secondary/25 px-3 py-8 text-center text-xs text-muted-foreground">
            No robotics resources match that search.
          </div>
        ) : (
          filteredResources.map((resource) => {
            const access = ROBOTICS_ACCESS_META[resource.access];
            const category = ROBOTICS_CATEGORY_META[resource.category];

            return (
              <article
                key={resource.id}
                className="rounded-lg border border-border bg-secondary/20 p-3 transition-colors hover:border-primary/35 hover:bg-primary/5"
              >
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <span className={cn("rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase", access.tone)}>
                    {access.label}
                  </span>
                  <span className="rounded border border-border bg-background/45 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-muted-foreground">
                    {category.label}
                  </span>
                </div>

                <h3 className="text-sm font-semibold leading-snug text-foreground">{resource.title}</h3>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  {resource.description}
                </p>

                <div className="mt-2 flex flex-wrap gap-1">
                  {resource.tags.slice(0, 4).map((tag) => (
                    <span
                      key={tag}
                      className="rounded border border-border bg-background/40 px-1.5 py-0.5 text-[9px] text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="mt-3 rounded border border-border bg-background/30 px-2 py-1.5">
                  <div className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Requirements
                  </div>
                  <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                    {resource.requires}
                  </p>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <a
                    href={resource.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary transition-colors hover:bg-primary/15"
                  >
                    Open Resource
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  {resource.related?.map((link) => (
                    <a
                      key={link.url}
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground transition-colors hover:text-primary"
                    >
                      {link.label}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ))}
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
