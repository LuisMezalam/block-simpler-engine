import React, { useMemo } from "react";
import { SolverResult } from "@/lib/solver";
import {
  analyzeCourseChecks,
  formatCourseValue,
  LimitValue,
} from "@/lib/courseAnalysis";
import { format } from "@/lib/polynomial";
import { cn } from "@/lib/utils";

function valueTone(value: LimitValue, kind: "constant" | "error") {
  if (value === "undefined") return "text-muted-foreground";
  if (value === "infinity") return kind === "error" ? "text-destructive" : "text-success";
  if (kind === "error") return Math.abs(value) < 1e-8 ? "text-success" : "text-warning";
  return Math.abs(value) < 1e-8 ? "text-muted-foreground" : "text-foreground";
}

function verdictClass(verdict: string) {
  if (verdict === "stable") return "text-success bg-success/10 border-success/30";
  if (verdict === "unstable") return "text-destructive bg-destructive/10 border-destructive/30";
  if (verdict === "special") return "text-warning bg-warning/10 border-warning/30";
  return "text-muted-foreground bg-secondary/50 border-border";
}

export function CourseInsightPanel({ result }: { result: SolverResult }) {
  const course = useMemo(() => analyzeCourseChecks(result), [result]);
  const { routh, staticError } = course;

  const constants = [
    { label: "Kp", value: staticError.constants.kp },
    { label: "Kv", value: staticError.constants.kv },
    { label: "Ka", value: staticError.constants.ka },
  ];

  const errors = [
    { label: "Step ess", value: staticError.errors.step },
    { label: "Ramp ess", value: staticError.errors.ramp },
    { label: "Parabolic ess", value: staticError.errors.parabolic },
  ];

  return (
    <div className="panel-section overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-3 flex-wrap">
        <div className="w-1.5 h-1.5 rounded-full bg-warning" />
        <h3 className="text-sm font-bold text-foreground">Course Checks</h3>
        <span className="text-[10px] font-mono text-muted-foreground">
          ME 484: stability, error constants, response intuition
        </span>
      </div>

      <div className="p-4 grid gap-3 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-lg border border-border bg-secondary/25 overflow-hidden">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between gap-2">
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Routh-Hurwitz
              </div>
              <div className="text-xs font-mono text-foreground/90 break-all">
                {routh.polynomial} = 0
              </div>
            </div>
            <span
              className={cn(
                "text-[10px] font-mono px-2 py-0.5 rounded border font-semibold uppercase",
                verdictClass(routh.verdict)
              )}
            >
              {routh.verdict}
            </span>
          </div>

          <div className="p-3 grid gap-3 md:grid-cols-[0.9fr_1.1fr]">
            <div className="overflow-x-auto">
              <table className="w-full text-[10px] font-mono">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium pb-1">Row</th>
                    <th className="text-left font-medium pb-1">Routh array</th>
                  </tr>
                </thead>
                <tbody>
                  {routh.rows.map((row) => (
                    <tr key={row.power} className="border-t border-border/60">
                      <td className="py-1 pr-3 text-primary">s^{row.power}</td>
                      <td className="py-1 text-foreground/85">
                        {row.values.map((value) => formatCourseValue(value, 3)).join("  ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-2">
              <div className="rounded border border-border bg-background/40 px-3 py-2">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  First Column
                </div>
                <div className="text-xs font-mono text-foreground/90 break-all">
                  {routh.firstColumn.map((value) => formatCourseValue(value, 3)).join(", ")}
                </div>
                <div className="mt-1 text-[10px] font-mono text-muted-foreground">
                  Sign changes: {routh.signChanges}
                </div>
              </div>
              {routh.notes.slice(0, 2).map((note) => (
                <p key={note} className="text-[10px] leading-snug text-muted-foreground">
                  {note}
                </p>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-secondary/25 overflow-hidden">
          <div className="px-3 py-2 border-b border-border">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Static Error Constants
            </div>
            <div className="text-xs font-mono text-foreground/90 break-all">
              {staticError.loopLabel}: [{format(staticError.loopGain.num)}] / [{format(staticError.loopGain.den)}]
            </div>
          </div>

          <div className="p-3 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded border border-primary/30 bg-primary/10 px-2 py-2 text-center">
                <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Type</div>
                <div className="text-lg font-mono font-bold text-primary">{staticError.systemType}</div>
              </div>
              {constants.map((item) => (
                <div key={item.label} className="rounded border border-border bg-background/40 px-2 py-2 text-center">
                  <div className="text-[9px] text-muted-foreground uppercase tracking-wider">{item.label}</div>
                  <div className={cn("text-sm font-mono font-semibold", valueTone(item.value, "constant"))}>
                    {formatCourseValue(item.value, 3)}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {errors.map((item) => (
                <div key={item.label} className="rounded border border-border bg-background/40 px-2 py-2 text-center">
                  <div className="text-[9px] text-muted-foreground uppercase tracking-wider">{item.label}</div>
                  <div className={cn("text-sm font-mono font-semibold", valueTone(item.value, "error"))}>
                    {formatCourseValue(item.value, 3)}
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded border border-border bg-background/40 px-3 py-2">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                Course Rule
              </div>
              <p className="text-[10px] leading-snug text-muted-foreground">
                Type 0 gives finite step error; type 1 gives zero step error and finite ramp error;
                type 2 gives zero step and ramp error with finite parabolic error.
              </p>
            </div>

            <p className="text-[10px] leading-snug text-muted-foreground">
              {staticError.notes[staticError.notes.length - 1]}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
