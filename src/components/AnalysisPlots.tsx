import React, { useMemo, useRef, useCallback, useState } from "react";
import { SolverResult } from "@/lib/solver";
import { format, poly, roots, evaluate } from "@/lib/polynomial";
import { computeMargins } from "@/lib/margins";
import {
  buildControllerDesign,
  CONTROLLER_SPECS,
  DEFAULT_CONTROLLER_PARAMS,
  type ControllerKind,
  type ControllerParams,
} from "@/lib/controllerDesign";
import { generateMatlabControlScript } from "@/lib/matlabExport";
import { Slider } from "@/components/ui/slider";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, ReferenceDot,
  ReferenceArea,
} from "recharts";
import html2canvas from "html2canvas";
import { Activity, Clipboard, Download, FileDown, GitBranch, SlidersHorizontal, Target, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
// ─── SVG Crosshair Layer ─────────────────────────────────────────────────────

function SvgCrosshairLayer({
  bounds,
  fromX,
  fromY,
  labelX = "x",
  labelY = "y",
  curvePoints,
  snapRadius = 20,
}: {
  bounds: { x1: number; y1: number; x2: number; y2: number };
  fromX: (svgX: number) => string;
  fromY: (svgY: number) => string;
  labelX?: string;
  labelY?: string;
  curvePoints?: { x: number; y: number }[];
  snapRadius?: number;
}) {
  const [pos, setPos] = React.useState<{ x: number; y: number } | null>(null);
  const [snapped, setSnapped] = React.useState<{ x: number; y: number } | null>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGRectElement>) => {
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const svgPt = pt.matrixTransform(ctm.inverse());
    setPos({ x: svgPt.x, y: svgPt.y });

    // Snap to nearest curve point
    if (curvePoints && curvePoints.length > 0) {
      let bestDist = Infinity;
      let bestPt: { x: number; y: number } | null = null;
      for (let i = 0; i < curvePoints.length; i++) {
        const cp = curvePoints[i];
        const dx = cp.x - svgPt.x;
        const dy = cp.y - svgPt.y;
        const d = dx * dx + dy * dy;
        if (d < bestDist) {
          bestDist = d;
          bestPt = cp;
        }
      }
      if (bestPt && Math.sqrt(bestDist) <= snapRadius) {
        setSnapped(bestPt);
      } else {
        setSnapped(null);
      }
    } else {
      setSnapped(null);
    }
  }, [curvePoints, snapRadius]);

  const { x1, y1, x2, y2 } = bounds;
  const inBounds = pos && pos.x >= x1 && pos.x <= x2 && pos.y >= y1 && pos.y <= y2;

  // Use snapped position for readout if available, otherwise raw cursor
  const display = snapped || pos;

  const boxW = 95;
  const boxH = 22;
  const bx = display ? (display.x + boxW + 12 > x2 ? display.x - boxW - 8 : display.x + 8) : 0;
  const by = display ? (display.y - boxH - 4 < y1 ? display.y + 4 : display.y - boxH - 4) : 0;

  return (
    <g>
      <rect
        x={x1} y={y1} width={x2 - x1} height={y2 - y1}
        fill="transparent"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { setPos(null); setSnapped(null); }}
        style={{ cursor: "crosshair" }}
      />
      {inBounds && display && (
        <>
          <line x1={display.x} y1={y1} x2={display.x} y2={y2}
            stroke="hsl(var(--foreground) / 0.25)" strokeWidth={0.5} strokeDasharray="3 3" pointerEvents="none" />
          <line x1={x1} y1={display.y} x2={x2} y2={display.y}
            stroke="hsl(var(--foreground) / 0.25)" strokeWidth={0.5} strokeDasharray="3 3" pointerEvents="none" />
          {/* Snap indicator dot */}
          {snapped && (
            <circle cx={snapped.x} cy={snapped.y} r={3.5}
              fill="hsl(var(--accent))" stroke="hsl(var(--background))" strokeWidth={1} pointerEvents="none" />
          )}
          <rect x={bx} y={by} width={boxW} height={boxH} rx={3}
            fill="hsl(var(--card) / 0.92)" stroke={snapped ? "hsl(var(--accent))" : "hsl(var(--border))"} strokeWidth={0.5} pointerEvents="none" />
          <text x={bx + 4} y={by + 9} fill="hsl(var(--foreground))" fontSize={7} fontFamily="monospace" pointerEvents="none">
            {labelX}: {fromX(display.x)}
          </text>
          <text x={bx + 4} y={by + 18} fill="hsl(var(--foreground))" fontSize={7} fontFamily="monospace" pointerEvents="none">
            {labelY}: {fromY(display.y)}
          </text>
        </>
      )}
    </g>
  );
}

// ─── Pole-Zero Map (SVG) ─────────────────────────────────────────────────────

function PoleZeroMap({ result }: { result: SolverResult }) {
  const allPoints = [...result.poles, ...result.zeros].filter(p => !isNaN(p.re));
  if (allPoints.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground font-mono">
        No computable poles/zeros (higher-order — solve characteristic eq.)
      </div>
    );
  }

  const margin = 1;
  const reVals = allPoints.map(p => p.re);
  const imVals = allPoints.map(p => p.im);
  const maxAbs = Math.max(
    Math.max(...reVals.map(Math.abs), ...imVals.map(Math.abs)),
    0.5
  ) + margin;

  const W = 280, H = 280;
  const cx = W / 2, cy = H / 2;
  const scaleVal = (W / 2 - 30) / maxAbs;

  const toSvg = (re: number, im: number) => ({
    x: cx + re * scaleVal,
    y: cy - im * scaleVal,
  });

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} className="max-w-[280px] mx-auto">
      {/* Axes */}
      <line x1={0} y1={cy} x2={W} y2={cy} stroke="hsl(var(--border))" strokeWidth={1} />
      <line x1={cx} y1={0} x2={cx} y2={H} stroke="hsl(var(--border))" strokeWidth={1} />
      <text x={W - 8} y={cy - 4} fill="hsl(var(--muted-foreground))" fontSize={8} fontFamily="monospace">Re</text>
      <text x={cx + 4} y={10} fill="hsl(var(--muted-foreground))" fontSize={8} fontFamily="monospace">Im</text>

      {/* LHP shading */}
      <rect x={0} y={0} width={cx} height={H} fill="hsl(var(--success) / 0.05)" />

      {/* Grid ticks */}
      {[-2, -1, 1, 2].map(v => {
        const pos = toSvg(v * (maxAbs / 3), 0);
        const posI = toSvg(0, v * (maxAbs / 3));
        return (
          <g key={v}>
            <line x1={pos.x} y1={cy - 3} x2={pos.x} y2={cy + 3} stroke="hsl(var(--muted-foreground))" strokeWidth={0.5} />
            <text x={pos.x} y={cy + 12} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={7} fontFamily="monospace">
              {(v * maxAbs / 3).toFixed(1)}
            </text>
            <line x1={cx - 3} y1={posI.y} x2={cx + 3} y2={posI.y} stroke="hsl(var(--muted-foreground))" strokeWidth={0.5} />
          </g>
        );
      })}

      {/* Poles (×) */}
      {result.poles.filter(p => !isNaN(p.re)).map((p, i) => {
        const { x, y } = toSvg(p.re, p.im);
        const color = p.re > 1e-8 ? "hsl(var(--destructive))" : "hsl(var(--primary))";
        return (
          <g key={`p${i}`}>
            <line x1={x - 5} y1={y - 5} x2={x + 5} y2={y + 5} stroke={color} strokeWidth={2} />
            <line x1={x - 5} y1={y + 5} x2={x + 5} y2={y - 5} stroke={color} strokeWidth={2} />
          </g>
        );
      })}

      {/* Zeros (○) */}
      {result.zeros.filter(z => !isNaN(z.re)).map((z, i) => {
        const { x, y } = toSvg(z.re, z.im);
        return (
          <circle key={`z${i}`} cx={x} cy={y} r={5}
            fill="none" stroke="hsl(var(--accent))" strokeWidth={2} />
        );
      })}

      {/* Legend */}
      <g transform={`translate(8, ${H - 25})`}>
        <line x1={0} y1={0} x2={6} y2={6} stroke="hsl(var(--primary))" strokeWidth={1.5} />
        <line x1={6} y1={0} x2={0} y2={6} stroke="hsl(var(--primary))" strokeWidth={1.5} />
        <text x={12} y={6} fill="hsl(var(--muted-foreground))" fontSize={7} fontFamily="monospace">Poles</text>
        <circle cx={50} cy={3} r={4} fill="none" stroke="hsl(var(--accent))" strokeWidth={1.5} />
        <text x={58} y={6} fill="hsl(var(--muted-foreground))" fontSize={7} fontFamily="monospace">Zeros</text>
      </g>

      {/* Crosshair */}
      <SvgCrosshairLayer
        bounds={{ x1: 0, y1: 0, x2: W, y2: H }}
        fromX={(x) => ((x - cx) / scaleVal).toFixed(2)}
        fromY={(y) => (-(y - cy) / scaleVal).toFixed(2)}
        labelX="Re"
        labelY="Im"
        curvePoints={[
          ...result.poles.filter(p => !isNaN(p.re)).map(p => toSvg(p.re, p.im)),
          ...result.zeros.filter(z => !isNaN(z.re)).map(z => toSvg(z.re, z.im)),
        ]}
      />
    </svg>
  );
}

// ─── Shared simulation engine ────────────────────────────────────────────────

function simulate(result: SolverResult, inputType: "step" | "impulse") {
  const { num, den } = result.equivalentTF;
  const n = den.coeffs.length - 1;
  if (n === 0) {
    const gain = num.coeffs[0] / den.coeffs[0];
    const val = inputType === "step" ? gain : 0;
    return Array.from({ length: 200 }, (_, i) => ({ t: i * 0.05, y: i === 0 && inputType === "impulse" ? gain : val }));
  }

  const an = den.coeffs[n];
  const a = den.coeffs.map(c => c / an);
  const b = num.coeffs.map(c => c / an);

  const dt = 0.005;
  const tMax = 10;
  const steps = Math.ceil(tMax / dt);
  const x = new Float64Array(n);
  const points: { t: number; y: number }[] = [];

  for (let k = 0; k <= steps; k++) {
    const t = k * dt;
    let y = 0;
    for (let i = 0; i < Math.min(b.length, n); i++) {
      y += (b[i] || 0) * x[i];
    }
    if (b.length > n) y += b[n];
    if (k % 10 === 0) points.push({ t: parseFloat(t.toFixed(3)), y: parseFloat(y.toFixed(6)) });

    // Input: step=1 always, impulse=1/dt at k=0 only
    const u = inputType === "step" ? 1 : (k === 0 ? 1 / dt : 0);

    const xn = new Float64Array(n);
    for (let i = 0; i < n - 1; i++) xn[i] = x[i] + dt * x[i + 1];
    let xdot_last = u;
    for (let i = 0; i < n; i++) xdot_last -= a[i] * x[i];
    xn[n - 1] = x[n - 1] + dt * xdot_last;
    x.set(xn);
  }
  return points;
}

// ─── Time Response (Step + Impulse) ──────────────────────────────────────────

function TimeResponsePlot({ result }: { result: SolverResult }) {
  const [mode, setMode] = React.useState<"step" | "impulse">("step");

  const { data, metrics } = useMemo(() => {
    const points = simulate(result, mode);

    const finalValue = points.length > 0 ? points[points.length - 1].y : 0;
    let peakValue = -Infinity, peakTime = 0;
    let riseTime = 0, settlingTime = 0;
    let foundRise10 = false, rise10t = 0, rise90t = 0;

    for (const p of points) {
      if (p.y > peakValue) { peakValue = p.y; peakTime = p.t; }
      if (mode === "step") {
        if (!foundRise10 && finalValue !== 0 && p.y >= 0.1 * finalValue) { rise10t = p.t; foundRise10 = true; }
        if (foundRise10 && riseTime === 0 && p.y >= 0.9 * finalValue) { rise90t = p.t; riseTime = rise90t - rise10t; }
      }
    }

    // Settling time (2% band)
    const ref = mode === "step" ? finalValue : 0;
    const band = mode === "step" ? 0.02 * Math.abs(finalValue || 1) : 0.02 * Math.abs(peakValue || 1);
    for (let i = points.length - 1; i >= 0; i--) {
      if (Math.abs(points[i].y - ref) > band) { settlingTime = points[i].t; break; }
    }

    const overshoot = mode === "step" && finalValue !== 0
      ? Math.max(0, ((peakValue - finalValue) / Math.abs(finalValue)) * 100)
      : 0;

    return { data: points, metrics: { finalValue, overshoot, riseTime, settlingTime, peakTime, peakValue, rise10t, rise90t } };
  }, [result, mode]);

  if (data.length === 0) return null;

  const { finalValue, overshoot, riseTime, settlingTime, peakTime, peakValue, rise10t, rise90t } = metrics;

  const stepMetrics = [
    { label: "Overshoot", value: `${overshoot.toFixed(1)}%`, warn: overshoot > 25 },
    { label: "Rise Time", value: `${riseTime.toFixed(3)}s`, warn: false },
    { label: "Settling", value: `${settlingTime.toFixed(2)}s`, warn: settlingTime > 8 },
    { label: "Peak Time", value: `${peakTime.toFixed(3)}s`, warn: false },
  ];

  const impulseMetrics = [
    { label: "Peak", value: `${peakValue.toFixed(3)}`, warn: false },
    { label: "Peak Time", value: `${peakTime.toFixed(3)}s`, warn: false },
    { label: "Settling", value: `${settlingTime.toFixed(2)}s`, warn: settlingTime > 8 },
    { label: "Final", value: `${finalValue.toFixed(4)}`, warn: Math.abs(finalValue) > 0.05 },
  ];

  const activeMetrics = mode === "step" ? stepMetrics : impulseMetrics;

  return (
    <div className="space-y-2">
      {/* Mode toggle */}
      <div className="flex gap-1 px-1">
        {(["step", "impulse"] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 py-1 text-[9px] font-semibold uppercase rounded transition-all ${
              mode === m
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground hover:text-foreground"
            }`}
          >
            {m === "step" ? "Step Response" : "Impulse Response"}
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={190}>
        <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="t" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} label={{ value: "t (s)", position: "insideBottomRight", offset: -5, fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
          <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
          <Tooltip cursor={{ stroke: "hsl(var(--foreground) / 0.3)", strokeWidth: 1, strokeDasharray: "3 3" }} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 10, fontFamily: "monospace" }} />

          {/* Settling time 2% band */}
          {mode === "step" && finalValue !== 0 && (
            <ReferenceArea
              y1={finalValue * 1.02}
              y2={finalValue * 0.98}
              fill="hsl(var(--primary) / 0.08)"
              stroke="none"
            />
          )}
          {mode === "impulse" && peakValue !== 0 && (
            <ReferenceArea
              y1={0.02 * Math.abs(peakValue)}
              y2={-0.02 * Math.abs(peakValue)}
              fill="hsl(var(--accent) / 0.08)"
              stroke="none"
            />
          )}

          {/* Settling time vertical marker */}
          {settlingTime > 0 && (
            <ReferenceLine
              x={parseFloat(settlingTime.toFixed(4))}
              stroke="hsl(var(--chart-4))"
              strokeDasharray="4 3"
              strokeWidth={1}
              label={{ value: `ts=${settlingTime.toFixed(2)}s`, position: "top", fontSize: 8, fill: "hsl(var(--chart-4))", fontFamily: "monospace" }}
            />
          )}

          {/* Rise time 10%-90% vertical markers (step only) */}
          {mode === "step" && riseTime > 0 && (
            <>
              <ReferenceLine
                x={parseFloat(rise10t.toFixed(4))}
                stroke="hsl(var(--chart-2))"
                strokeDasharray="3 3"
                strokeWidth={1}
                label={{ value: "10%", position: "top", fontSize: 7, fill: "hsl(var(--chart-2))", fontFamily: "monospace" }}
              />
              <ReferenceLine
                x={parseFloat(rise90t.toFixed(4))}
                stroke="hsl(var(--chart-2))"
                strokeDasharray="3 3"
                strokeWidth={1}
                label={{ value: "90%", position: "top", fontSize: 7, fill: "hsl(var(--chart-2))", fontFamily: "monospace" }}
              />
              {/* 10% and 90% horizontal reference lines */}
              <ReferenceLine
                y={0.1 * finalValue}
                stroke="hsl(var(--chart-2) / 0.3)"
                strokeDasharray="2 4"
                strokeWidth={0.5}
              />
              <ReferenceLine
                y={0.9 * finalValue}
                stroke="hsl(var(--chart-2) / 0.3)"
                strokeDasharray="2 4"
                strokeWidth={0.5}
              />
              {/* Shaded rise time region */}
              <ReferenceArea
                x1={parseFloat(rise10t.toFixed(4))}
                x2={parseFloat(rise90t.toFixed(4))}
                fill="hsl(var(--chart-2) / 0.06)"
                stroke="none"
              />
            </>
          )}

          {mode === "step" && <ReferenceLine y={finalValue} stroke="hsl(var(--warning))" strokeDasharray="5 3" strokeWidth={1} />}
          <ReferenceLine y={0} stroke="hsl(var(--border))" />

          {/* Overshoot: peak value line + peak dot (step only) */}
          {mode === "step" && overshoot > 0.1 && (
            <>
              <ReferenceLine
                y={peakValue}
                stroke="hsl(var(--destructive) / 0.5)"
                strokeDasharray="3 4"
                strokeWidth={0.8}
                label={{ value: `Mp=${overshoot.toFixed(1)}%`, position: "right", fontSize: 8, fill: "hsl(var(--destructive))", fontFamily: "monospace" }}
              />
              <ReferenceDot
                x={parseFloat(peakTime.toFixed(4))}
                y={peakValue}
                r={4}
                fill="hsl(var(--destructive))"
                stroke="hsl(var(--destructive-foreground))"
                strokeWidth={1}
              />
            </>
          )}

          {/* Peak marker for impulse */}
          {mode === "impulse" && peakValue !== 0 && (
            <ReferenceDot
              x={parseFloat(peakTime.toFixed(4))}
              y={peakValue}
              r={4}
              fill="hsl(var(--accent))"
              stroke="hsl(var(--accent-foreground))"
              strokeWidth={1}
            />
          )}

          <Line type="monotone" dataKey="y" stroke={mode === "step" ? "hsl(var(--primary))" : "hsl(var(--accent))"} strokeWidth={1.5} dot={false} name={mode === "step" ? "y(t)" : "h(t)"} />
        </LineChart>
      </ResponsiveContainer>

      <div className="grid grid-cols-4 gap-1 px-1">
        {activeMetrics.map(m => (
          <div key={m.label} className="rounded border border-border bg-card/50 px-2 py-1 text-center">
            <div className="text-[8px] text-muted-foreground uppercase tracking-wider">{m.label}</div>
            <div className={`text-[11px] font-mono font-semibold ${m.warn ? "text-destructive" : "text-foreground"}`}>{m.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}




function BodePlot({ result }: { result: SolverResult }) {
  const [showTable, setShowTable] = React.useState(false);

  const { data, margins, keyFreqs } = useMemo(() => {
    const { num, den } = result.equivalentTF;
    const points: { w: number; wLog: number; mag: number; phase: number }[] = [];

    let gcLog: number | null = null;
    let pcLog: number | null = null;
    let gmDb = Infinity;
    let pmDeg = Infinity;
    let magAtPcDb = 0; // magnitude (dB) at phase crossover
    let phaseAtGcDeg = 0; // phase (deg) at gain crossover
    let prevMagDb = NaN;
    let prevPhase = NaN;
    let prevExp = NaN;

    // Evaluate G(jω) helper
    const evalAt = (w: number) => {
      let numRe = 0, numIm = 0;
      for (let k = 0; k < num.coeffs.length; k++) {
        const c = num.coeffs[k];
        const wk = Math.pow(w, k);
        switch (k % 4) {
          case 0: numRe += c * wk; break;
          case 1: numIm += c * wk; break;
          case 2: numRe -= c * wk; break;
          case 3: numIm -= c * wk; break;
        }
      }
      let denRe = 0, denIm = 0;
      for (let k = 0; k < den.coeffs.length; k++) {
        const c = den.coeffs[k];
        const wk = Math.pow(w, k);
        switch (k % 4) {
          case 0: denRe += c * wk; break;
          case 1: denIm += c * wk; break;
          case 2: denRe -= c * wk; break;
          case 3: denIm -= c * wk; break;
        }
      }
      const numMag = Math.sqrt(numRe * numRe + numIm * numIm);
      const denMag = Math.sqrt(denRe * denRe + denIm * denIm);
      const magDb = 20 * Math.log10(numMag / (denMag || 1e-30));
      const numPhase = Math.atan2(numIm, numRe);
      const denPhase = Math.atan2(denIm, denRe);
      const phaseDeg = (numPhase - denPhase) * (180 / Math.PI);
      return { magDb, phaseDeg };
    };

    for (let exp = -2; exp <= 3; exp += 0.05) {
      const w = Math.pow(10, exp);
      const { magDb, phaseDeg } = evalAt(w);

      if (!isNaN(prevMagDb) && gcLog === null) {
        if ((prevMagDb > 0 && magDb <= 0) || (prevMagDb < 0 && magDb >= 0)) {
          const t = Math.abs(prevMagDb) / (Math.abs(prevMagDb) + Math.abs(magDb) + 1e-30);
          gcLog = parseFloat((prevExp + t * (exp - prevExp)).toFixed(2));
          phaseAtGcDeg = prevPhase + t * (phaseDeg - prevPhase);
          pmDeg = 180 + phaseAtGcDeg;
        }
      }

      if (!isNaN(prevPhase) && pcLog === null) {
        if ((prevPhase > -180 && phaseDeg <= -180) || (prevPhase < -180 && phaseDeg >= -180)) {
          const t = Math.abs(prevPhase + 180) / (Math.abs(prevPhase + 180) + Math.abs(phaseDeg + 180) + 1e-30);
          pcLog = parseFloat((prevExp + t * (exp - prevExp)).toFixed(2));
          magAtPcDb = prevMagDb + t * (magDb - prevMagDb);
          gmDb = -magAtPcDb;
        }
      }

      points.push({
        w,
        wLog: parseFloat(exp.toFixed(2)),
        mag: parseFloat(magDb.toFixed(2)),
        phase: parseFloat(phaseDeg.toFixed(2)),
      });

      prevMagDb = magDb;
      prevPhase = phaseDeg;
      prevExp = exp;
    }

    // Build key frequencies table
    const freqTable: Array<{ label: string; w: number; mag: number; phase: number }> = [];

    // Corner frequencies from poles
    const poles = roots(den);
    poles.forEach((p, i) => {
      if (!isNaN(p.re)) {
        const wn = Math.sqrt(p.re * p.re + p.im * p.im);
        if (wn > 0.01 && wn < 1000) {
          const { magDb, phaseDeg } = evalAt(wn);
          freqTable.push({ label: `ωₚ${i + 1}`, w: wn, mag: magDb, phase: phaseDeg });
        }
      }
    });

    // Corner frequencies from zeros
    const zeros = roots(num);
    zeros.forEach((z, i) => {
      if (!isNaN(z.re)) {
        const wn = Math.sqrt(z.re * z.re + z.im * z.im);
        if (wn > 0.01 && wn < 1000) {
          const { magDb, phaseDeg } = evalAt(wn);
          freqTable.push({ label: `ωᵤ${i + 1}`, w: wn, mag: magDb, phase: phaseDeg });
        }
      }
    });

    // Crossover frequencies
    if (gcLog !== null) {
      const wGc = Math.pow(10, gcLog);
      const { magDb, phaseDeg } = evalAt(wGc);
      freqTable.push({ label: "ωgc", w: wGc, mag: magDb, phase: phaseDeg });
    }
    if (pcLog !== null) {
      const wPc = Math.pow(10, pcLog);
      const { magDb, phaseDeg } = evalAt(wPc);
      freqTable.push({ label: "ωpc", w: wPc, mag: magDb, phase: phaseDeg });
    }

    // Standard decades
    [0.1, 1, 10, 100].forEach(w => {
      const { magDb, phaseDeg } = evalAt(w);
      freqTable.push({ label: `${w}`, w, mag: magDb, phase: phaseDeg });
    });

    // Sort by frequency and dedupe
    freqTable.sort((a, b) => a.w - b.w);
    const seen = new Set<string>();
    const unique = freqTable.filter(f => {
      const key = f.w.toFixed(3);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return { data: points, margins: { gcLog, pcLog, gmDb, pmDeg, magAtPcDb, phaseAtGcDeg }, keyFreqs: unique };
  }, [result]);

  const { gcLog, pcLog, gmDb, pmDeg, magAtPcDb, phaseAtGcDeg } = margins;

  const isStable = (gmDb === Infinity || gmDb > 0) && (pmDeg === Infinity || pmDeg > 0);
  const gmColor = gmDb === Infinity ? "text-muted-foreground" : gmDb > 0 ? "text-green-400" : "text-destructive";
  const pmColor = pmDeg === Infinity ? "text-muted-foreground" : pmDeg > 0 ? "text-green-400" : "text-destructive";

  return (
    <div className="space-y-1">
      <div className="flex items-center px-2 py-1">
        <button
          onClick={() => setShowTable(!showTable)}
          className={`ml-auto text-[8px] px-1.5 py-0.5 rounded font-mono ${showTable ? "bg-primary text-primary-foreground" : "bg-muted/50 hover:bg-muted text-muted-foreground"}`}
        >
          {showTable ? "PLOT" : "TABLE"}
        </button>
      </div>

      {!showTable ? (
        <div className="relative">
          {/* Stability margins badge overlay */}
          <div className="absolute top-1 right-3 z-10 flex items-center gap-1.5">
            <div className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[9px] font-mono backdrop-blur-sm border ${
              isStable
                ? "bg-green-950/70 border-green-500/30"
                : "bg-red-950/70 border-destructive/40"
            }`}>
              <span className={`text-[8px] font-bold tracking-wider ${isStable ? "text-green-400" : "text-destructive"}`}>
                {isStable ? "STABLE" : "UNSTABLE"}
              </span>
              <span className="w-px h-3 bg-border" />
              <span className="text-muted-foreground">GM</span>
              <span className={gmColor}>{gmDb === Infinity ? "∞" : `${gmDb.toFixed(1)}dB`}</span>
              {pcLog !== null && (
                <span className="text-muted-foreground/60">@{Math.pow(10, pcLog).toFixed(1)}</span>
              )}
              <span className="w-px h-3 bg-border" />
              <span className="text-muted-foreground">PM</span>
              <span className={pmColor}>{pmDeg === Infinity ? "∞" : `${pmDeg.toFixed(1)}°`}</span>
              {gcLog !== null && (
                <span className="text-muted-foreground/60">@{Math.pow(10, gcLog).toFixed(1)}</span>
              )}
            </div>
          </div>

          {/* Magnitude plot */}
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="wLog" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} hide />
              <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} label={{ value: "dB", angle: -90, position: "insideLeft", fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip cursor={{ stroke: "hsl(var(--foreground) / 0.3)", strokeWidth: 1, strokeDasharray: "3 3" }} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 10, fontFamily: "monospace" }} />
              <ReferenceLine y={0} stroke="hsl(var(--warning))" strokeDasharray="5 3" />
              {/* GM annotation: vertical line at ωpc with shaded region from curve to 0dB */}
              {pcLog !== null && (
                <>
                  <ReferenceLine x={pcLog} stroke="hsl(var(--destructive))" strokeDasharray="6 3" strokeWidth={1.5} />
                  <ReferenceDot x={pcLog} y={magAtPcDb} r={4} fill="hsl(var(--destructive))" stroke="hsl(var(--destructive))" strokeWidth={1} />
                  <ReferenceDot x={pcLog} y={0} r={3} fill="none" stroke="hsl(var(--destructive))" strokeWidth={1.5} />
                  {magAtPcDb < 0 && (
                    <ReferenceArea x1={pcLog - 0.08} x2={pcLog + 0.08} y1={magAtPcDb} y2={0}
                      fill="hsl(var(--destructive))" fillOpacity={0.15} strokeWidth={0}
                      label={{ value: `GM\n${gmDb.toFixed(1)}dB`, position: "right", fontSize: 8, fill: "hsl(var(--destructive))" }}
                    />
                  )}
                  {magAtPcDb >= 0 && (
                    <ReferenceArea x1={pcLog - 0.08} x2={pcLog + 0.08} y1={0} y2={magAtPcDb}
                      fill="hsl(var(--destructive))" fillOpacity={0.12} strokeWidth={0}
                      label={{ value: `GM\n${gmDb.toFixed(1)}dB`, position: "right", fontSize: 8, fill: "hsl(var(--destructive))" }}
                    />
                  )}
                </>
              )}
              {/* Gain crossover marker on mag plot */}
              {gcLog !== null && (
                <>
                  <ReferenceLine x={gcLog} stroke="hsl(var(--primary))" strokeDasharray="6 3" strokeWidth={1} />
                  <ReferenceDot x={gcLog} y={0} r={4} fill="hsl(var(--primary))" stroke="hsl(var(--primary))" strokeWidth={1} />
                </>
              )}
              <Line type="monotone" dataKey="mag" stroke="hsl(var(--accent))" strokeWidth={1.5} dot={false} name="|G(jω)| dB" />
            </LineChart>
          </ResponsiveContainer>

          {/* Phase plot */}
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={data} margin={{ top: 0, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="wLog" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} label={{ value: "log₁₀(ω)", position: "insideBottomRight", offset: -5, fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} label={{ value: "deg", angle: -90, position: "insideLeft", fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip cursor={{ stroke: "hsl(var(--foreground) / 0.3)", strokeWidth: 1, strokeDasharray: "3 3" }} contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 10, fontFamily: "monospace" }} />
              <ReferenceLine y={-180} stroke="hsl(var(--destructive))" strokeDasharray="5 3" />
              {/* PM annotation: vertical line at ωgc with shaded region from phase to -180° */}
              {gcLog !== null && (
                <>
                  <ReferenceLine x={gcLog} stroke="hsl(var(--primary))" strokeDasharray="6 3" strokeWidth={1.5} />
                  <ReferenceDot x={gcLog} y={phaseAtGcDeg} r={4} fill="hsl(var(--primary))" stroke="hsl(var(--primary))" strokeWidth={1} />
                  <ReferenceDot x={gcLog} y={-180} r={3} fill="none" stroke="hsl(var(--primary))" strokeWidth={1.5} />
                  <ReferenceArea x1={gcLog - 0.08} x2={gcLog + 0.08}
                    y1={Math.min(phaseAtGcDeg, -180)} y2={Math.max(phaseAtGcDeg, -180)}
                    fill="hsl(var(--primary))" fillOpacity={0.15} strokeWidth={0}
                    label={{ value: `PM\n${pmDeg.toFixed(1)}°`, position: "right", fontSize: 8, fill: "hsl(var(--primary))" }}
                  />
                </>
              )}
              {/* Phase crossover marker on phase plot */}
              {pcLog !== null && (
                <>
                  <ReferenceLine x={pcLog} stroke="hsl(var(--destructive))" strokeDasharray="6 3" strokeWidth={1} />
                  <ReferenceDot x={pcLog} y={-180} r={4} fill="hsl(var(--destructive))" stroke="hsl(var(--destructive))" strokeWidth={1} />
                </>
              )}
              <Line type="monotone" dataKey="phase" stroke="hsl(var(--primary))" strokeWidth={1.5} dot={false} name="∠G(jω) °" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="overflow-auto max-h-[280px]">
          <table className="w-full text-[9px] font-mono">
            <thead className="sticky top-0 bg-background">
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left py-1 px-2">Freq</th>
                <th className="text-right py-1 px-2">ω (rad/s)</th>
                <th className="text-right py-1 px-2">|G| (dB)</th>
                <th className="text-right py-1 px-2">∠G (°)</th>
              </tr>
            </thead>
            <tbody>
              {keyFreqs.map((f, i) => {
                const isSpecial = f.label.startsWith("ω");
                return (
                  <tr key={i} className={`border-b border-border/50 ${isSpecial ? "bg-primary/5" : ""}`}>
                    <td className={`py-1 px-2 ${isSpecial ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                      {f.label}
                    </td>
                    <td className="text-right py-1 px-2">{f.w < 10 ? f.w.toFixed(3) : f.w.toFixed(1)}</td>
                    <td className={`text-right py-1 px-2 ${Math.abs(f.mag) < 1 ? "text-warning" : ""}`}>
                      {f.mag.toFixed(2)}
                    </td>
                    <td className={`text-right py-1 px-2 ${f.phase < -170 ? "text-destructive" : ""}`}>
                      {f.phase.toFixed(1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}



// ─── Nyquist Plot (SVG) ──────────────────────────────────────────────────────

function NyquistPlot({ result }: { result: SolverResult }) {
  const points = useMemo(() => {
    const { num, den } = result.equivalentTF;
    const pts: { re: number; im: number; w: number }[] = [];

    for (let exp = -3; exp <= 4; exp += 0.02) {
      const w = Math.pow(10, exp);
      let numRe = 0, numIm = 0;
      for (let k = 0; k < num.coeffs.length; k++) {
        const c = num.coeffs[k];
        const wk = Math.pow(w, k);
        switch (k % 4) {
          case 0: numRe += c * wk; break;
          case 1: numIm += c * wk; break;
          case 2: numRe -= c * wk; break;
          case 3: numIm -= c * wk; break;
        }
      }
      let denRe = 0, denIm = 0;
      for (let k = 0; k < den.coeffs.length; k++) {
        const c = den.coeffs[k];
        const wk = Math.pow(w, k);
        switch (k % 4) {
          case 0: denRe += c * wk; break;
          case 1: denIm += c * wk; break;
          case 2: denRe -= c * wk; break;
          case 3: denIm -= c * wk; break;
        }
      }
      const dMagSq = denRe * denRe + denIm * denIm;
      if (dMagSq < 1e-30) continue;
      const gRe = (numRe * denRe + numIm * denIm) / dMagSq;
      const gIm = (numIm * denRe - numRe * denIm) / dMagSq;
      if (Math.abs(gRe) < 1e6 && Math.abs(gIm) < 1e6) {
        pts.push({ re: gRe, im: gIm, w });
      }
    }
    return pts;
  }, [result]);

  if (points.length < 2) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground font-mono">
        Insufficient data for Nyquist plot
      </div>
    );
  }

  // Auto-scale with padding
  const allRe = points.map(p => p.re);
  const allIm = points.map(p => p.im);
  const maxAbs = Math.max(
    Math.max(...allRe.map(Math.abs), ...allIm.map(Math.abs)),
    1.5
  );
  // Clamp to reasonable range
  const range = Math.min(maxAbs * 1.2, 50);

  const W = 280, H = 280;
  const cx = W / 2, cy = H / 2;
  const scale = (W / 2 - 20) / range;

  const toX = (re: number) => cx + re * scale;
  const toY = (im: number) => cy - im * scale;

  // Build SVG path for positive freq
  const pathParts = points.map((p, i) => {
    const x = toX(Math.max(-range, Math.min(range, p.re)));
    const y = toY(Math.max(-range, Math.min(range, p.im)));
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  });

  // Mirror for negative freq (conjugate)
  const mirrorParts = [...points].reverse().map((p, i) => {
    const x = toX(Math.max(-range, Math.min(range, p.re)));
    const y = toY(Math.max(-range, Math.min(range, -p.im)));
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} className="max-w-[280px] mx-auto">
      {/* Axes */}
      <line x1={0} y1={cy} x2={W} y2={cy} stroke="hsl(var(--border))" strokeWidth={1} />
      <line x1={cx} y1={0} x2={cx} y2={H} stroke="hsl(var(--border))" strokeWidth={1} />
      <text x={W - 10} y={cy - 4} fill="hsl(var(--muted-foreground))" fontSize={8} fontFamily="monospace">Re</text>
      <text x={cx + 4} y={10} fill="hsl(var(--muted-foreground))" fontSize={8} fontFamily="monospace">Im</text>

      {/* Unit circle */}
      <circle cx={cx} cy={cy} r={scale} fill="none" stroke="hsl(var(--border))" strokeWidth={0.5} strokeDasharray="4 2" />

      {/* Critical point -1+j0 */}
      <circle cx={toX(-1)} cy={toY(0)} r={5} fill="hsl(var(--destructive) / 0.2)" stroke="hsl(var(--destructive))" strokeWidth={2} />
      <text x={toX(-1) - 2} y={toY(0) + 14} fill="hsl(var(--destructive))" fontSize={8} fontFamily="monospace" textAnchor="middle">−1</text>

      {/* Nyquist contour (positive freq) */}
      <path d={pathParts.join(" ")} fill="none" stroke="hsl(var(--accent))" strokeWidth={1.5} />
      {/* Negative freq (mirror) */}
      <path d={mirrorParts.join(" ")} fill="none" stroke="hsl(var(--accent))" strokeWidth={1} strokeDasharray="4 2" opacity={0.5} />

      {/* Direction arrow at midpoint */}
      {points.length > 10 && (() => {
        const mid = Math.floor(points.length / 4);
        const p = points[mid];
        const pn = points[mid + 1];
        if (!pn) return null;
        const ax = toX(p.re), ay = toY(p.im);
        const dx = toX(pn.re) - ax, dy = toY(pn.im) - ay;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1) return null;
        const ux = dx / len, uy = dy / len;
        return (
          <polygon
            points={`${ax + ux * 6},${ay + uy * 6} ${ax - uy * 3},${ay + ux * 3} ${ax + uy * 3},${ay - ux * 3}`}
            fill="hsl(var(--accent))"
          />
        );
      })()}

      {/* Frequency labels at decade points */}
      {(() => {
        const decadeExps = [-2, -1, 0, 1, 2, 3];
        const labels: React.ReactNode[] = [];
        for (const exp of decadeExps) {
          const targetW = Math.pow(10, exp);
          let bestIdx = -1, bestDist = Infinity;
          for (let i = 0; i < points.length; i++) {
            const d = Math.abs(Math.log10(points[i].w) - exp);
            if (d < bestDist) { bestDist = d; bestIdx = i; }
          }
          if (bestIdx < 0 || bestDist > 0.05) continue;
          const p = points[bestIdx];
          const px = toX(Math.max(-range, Math.min(range, p.re)));
          const py = toY(Math.max(-range, Math.min(range, p.im)));
          if (px < 5 || px > W - 5 || py < 5 || py > H - 5) continue;
          const wLabel = targetW >= 1 ? `${targetW}` : targetW.toFixed(Math.abs(exp));
          const mag = Math.sqrt(p.re * p.re + p.im * p.im);
          const magDb = (20 * Math.log10(mag || 1e-30)).toFixed(1);
          const phaseDeg = (Math.atan2(p.im, p.re) * 180 / Math.PI).toFixed(1);
          const tipW = 100, tipH = 30;
          const tipX = px + tipW + 8 > W ? px - tipW - 4 : px + 8;
          const tipY = py - tipH - 4 < 0 ? py + 8 : py - tipH - 4;
          labels.push(
            <g key={`wl${exp}`} className="group/wl">
              <circle cx={px} cy={py} r={2} fill="hsl(var(--accent))" />
              <circle cx={px} cy={py} r={10} fill="transparent" className="cursor-pointer" />
              <text x={px + 4} y={py - 4} fill="hsl(var(--accent))" fontSize={6.5} fontFamily="monospace"
                stroke="hsl(var(--background))" strokeWidth={2} paintOrder="stroke" pointerEvents="none">
                ω={wLabel}
              </text>
              <g className="opacity-0 group-hover/wl:opacity-100 transition-opacity pointer-events-none">
                <rect x={tipX} y={tipY} width={tipW} height={tipH} rx={3}
                  fill="hsl(var(--popover))" stroke="hsl(var(--border))" strokeWidth={0.5} />
                <text x={tipX + 4} y={tipY + 11} fill="hsl(var(--popover-foreground))" fontSize={6} fontFamily="monospace">
                  |G|={magDb} dB
                </text>
                <text x={tipX + 4} y={tipY + 22} fill="hsl(var(--popover-foreground))" fontSize={6} fontFamily="monospace">
                  ∠G={phaseDeg}°
                </text>
              </g>
            </g>
          );
        }
        return labels;
      })()}

      {/* Legend */}
      <g transform={`translate(8, ${H - 20})`}>
        <line x1={0} y1={3} x2={12} y2={3} stroke="hsl(var(--accent))" strokeWidth={1.5} />
        <text x={16} y={6} fill="hsl(var(--muted-foreground))" fontSize={7} fontFamily="monospace">G(jω)</text>
        <circle cx={55} cy={3} r={3} fill="hsl(var(--destructive) / 0.3)" stroke="hsl(var(--destructive))" strokeWidth={1} />
        <text x={62} y={6} fill="hsl(var(--muted-foreground))" fontSize={7} fontFamily="monospace">−1 crit.</text>
      </g>

      {/* Crosshair */}
      <SvgCrosshairLayer
        bounds={{ x1: 0, y1: 0, x2: W, y2: H }}
        fromX={(x) => ((x - cx) / scale).toFixed(2)}
        fromY={(y) => (-(y - cy) / scale).toFixed(2)}
        labelX="Re"
        labelY="Im"
        curvePoints={points.map(p => ({ x: toX(Math.max(-range, Math.min(range, p.re))), y: toY(Math.max(-range, Math.min(range, p.im))) }))}
      />
    </svg>
  );
}

// ─── Root Locus Plot (SVG) ───────────────────────────────────────────────────

type RootLocusEditMode = "inspect" | "zero" | "pole" | "target";

type RootLocusPlotProps = {
  result: SolverResult;
  controllerKind: ControllerKind;
  controllerParams: ControllerParams;
  onControllerKindChange: (kind: ControllerKind) => void;
  onControllerParamChange: (key: keyof ControllerParams, value: number) => void;
};

function rootsForLocus(coeffs: readonly number[]): Array<{ re: number; im: number }> {
  const trimmed = [...coeffs];
  while (trimmed.length > 1 && Math.abs(trimmed[trimmed.length - 1]) < 1e-14) trimmed.pop();
  const degree = trimmed.length - 1;
  if (degree <= 0) return [];
  if (degree <= 2) return roots(poly(trimmed));

  const leading = trimmed[degree];
  if (Math.abs(leading) < 1e-14) return [];
  const normalized = trimmed.map(c => c / leading);
  const radius = 1 + Math.max(...normalized.slice(0, degree).map(c => Math.abs(c)));
  let estimates = Array.from({ length: degree }, (_, index) => {
    const angle = (2 * Math.PI * index) / degree;
    return {
      re: radius * Math.cos(angle),
      im: radius * Math.sin(angle),
    };
  });

  const evalComplex = (z: { re: number; im: number }) => {
    let acc = { re: normalized[degree], im: 0 };
    for (let i = degree - 1; i >= 0; i--) {
      acc = {
        re: acc.re * z.re - acc.im * z.im + normalized[i],
        im: acc.re * z.im + acc.im * z.re,
      };
    }
    return acc;
  };

  for (let iter = 0; iter < 90; iter++) {
    let maxDelta = 0;
    estimates = estimates.map((root, i) => {
      const value = evalComplex(root);
      let denom = { re: 1, im: 0 };
      for (let j = 0; j < estimates.length; j++) {
        if (i === j) continue;
        const diff = { re: root.re - estimates[j].re, im: root.im - estimates[j].im };
        denom = {
          re: denom.re * diff.re - denom.im * diff.im,
          im: denom.re * diff.im + denom.im * diff.re,
        };
      }
      const denomMagSq = denom.re * denom.re + denom.im * denom.im;
      if (denomMagSq < 1e-24) return root;
      const delta = {
        re: (value.re * denom.re + value.im * denom.im) / denomMagSq,
        im: (value.im * denom.re - value.re * denom.im) / denomMagSq,
      };
      maxDelta = Math.max(maxDelta, Math.hypot(delta.re, delta.im));
      return { re: root.re - delta.re, im: root.im - delta.im };
    });
    if (maxDelta < 1e-9) break;
  }

  return estimates
    .map(root => ({ re: Math.abs(root.re) < 1e-10 ? 0 : root.re, im: Math.abs(root.im) < 1e-10 ? 0 : root.im }))
    .sort((a, b) => b.re - a.re || b.im - a.im);
}

function RootLocusPlot({
  result,
  controllerKind,
  controllerParams,
  onControllerKindChange,
  onControllerParamChange,
}: RootLocusPlotProps) {
  const [kValue, setKValue] = useState(1);
  const [kMax, setKMaxState] = useState(100);
  const [editMode, setEditMode] = useState<RootLocusEditMode>("inspect");
  const [hoverPoint, setHoverPoint] = useState<{ re: number; im: number } | null>(null);
  const [targetZeta, setTargetZeta] = useState(0.7);
  const [targetSettlingTime, setTargetSettlingTime] = useState(2);
  const [designNote, setDesignNote] = useState("Select a placement mode, then click the s-plane.");

  const { loci, olPoles, olZeros, numC, denC } = useMemo(() => {
    const { num, den } = result.equivalentTF;
    const numCoeffs = [...num.coeffs];
    const denCoeffs = [...den.coeffs];
    const maxLen = Math.max(numCoeffs.length, denCoeffs.length);
    while (numCoeffs.length < maxLen) numCoeffs.push(0);
    while (denCoeffs.length < maxLen) denCoeffs.push(0);

    const olp = roots(den);
    const olz = roots(num);
    const kValues: number[] = [0];
    for (let exp = -3; exp <= 4; exp += 0.025) kValues.push(Math.pow(10, exp));

    const branches: Array<Array<{ re: number; im: number; k: number }>> = [];
    for (let i = 0; i < Math.max(olp.length, 1); i++) branches.push([]);

    for (const K of kValues) {
      const charCoeffs = denCoeffs.map((d, i) => d + K * numCoeffs[i]);
      while (charCoeffs.length > 1 && Math.abs(charCoeffs[charCoeffs.length - 1]) < 1e-15) charCoeffs.pop();
      const rts = rootsForLocus(charCoeffs).filter(p => !isNaN(p.re));
      const used = new Set<number>();

      for (let b = 0; b < branches.length; b++) {
        const prev = branches[b].length > 0
          ? branches[b][branches[b].length - 1]
          : olp[b] || { re: 0, im: 0 };

        let bestIdx = -1;
        let bestDist = Infinity;
        for (let r = 0; r < rts.length; r++) {
          if (used.has(r)) continue;
          const dist = (rts[r].re - prev.re) ** 2 + (rts[r].im - prev.im) ** 2;
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = r;
          }
        }
        if (bestIdx >= 0) {
          used.add(bestIdx);
          branches[b].push({ re: rts[bestIdx].re, im: rts[bestIdx].im, k: K });
        }
      }
    }

    return { loci: branches, olPoles: olp, olZeros: olz, numC: numCoeffs, denC: denCoeffs };
  }, [result]);

  const polesAtGain = useCallback((gain: number) => {
    const charCoeffs = denC.map((d, i) => d + gain * numC[i]);
    while (charCoeffs.length > 1 && Math.abs(charCoeffs[charCoeffs.length - 1]) < 1e-15) charCoeffs.pop();
    return rootsForLocus(charCoeffs).filter(p => !isNaN(p.re));
  }, [denC, numC]);

  const summarizePoles = useCallback((poles: Array<{ re: number; im: number }>) => {
    if (poles.length === 0) {
      return { stable: false, damping: NaN, wn: NaN, settling: Infinity, overshoot: Infinity, dominant: null as { re: number; im: number } | null };
    }

    const dominant = poles.reduce((best, pole) => pole.re > best.re ? pole : best, poles[0]);
    const stable = poles.every(pole => pole.re < -1e-8);
    const wn = Math.hypot(dominant.re, dominant.im);
    const damping = stable && wn > 1e-10 ? Math.max(0, Math.min(1, -dominant.re / wn)) : 0;
    const settling = stable ? 4 / Math.max(1e-6, -dominant.re) : Infinity;
    const overshoot = damping > 0 && damping < 1
      ? Math.exp((-Math.PI * damping) / Math.sqrt(1 - damping * damping)) * 100
      : stable ? 0 : Infinity;

    return { stable, damping, wn, settling, overshoot, dominant };
  }, []);

  const clPoles = useMemo(() => polesAtGain(kValue), [kValue, polesAtGain]);
  const currentMetrics = useMemo(() => summarizePoles(clPoles), [clPoles, summarizePoles]);

  const breakawayPoints = useMemo(() => {
    const num = { coeffs: [...numC] };
    const den = { coeffs: [...denC] };
    const points: Array<{ re: number; type: "breakaway" | "breakin" }> = [];
    const bound = Math.max(
      ...olPoles.filter(p => !isNaN(p.re)).map(p => Math.abs(p.re)),
      ...olZeros.filter(z => !isNaN(z.re)).map(z => Math.abs(z.re)),
      2
    ) + 2;
    const step = 0.01;
    const kOfSigma = (sigma: number): number => {
      const n = evaluate(num, sigma);
      if (Math.abs(n) < 1e-12) return NaN;
      return -evaluate(den, sigma) / n;
    };

    let prevK = kOfSigma(-bound);
    let prevSlope = 0;
    for (let sigma = -bound + step; sigma <= bound; sigma += step) {
      const k = kOfSigma(sigma);
      if (isNaN(k) || isNaN(prevK)) {
        prevK = k;
        continue;
      }
      const slope = k - prevK;
      if (prevSlope !== 0 && slope * prevSlope < 0) {
        const bpSigma = sigma - step / 2;
        const bpK = kOfSigma(bpSigma);
        const nearPole = olPoles.some(p => Math.abs(p.re - bpSigma) < 0.05 && Math.abs(p.im) < 0.05);
        const nearZero = olZeros.some(z => Math.abs(z.re - bpSigma) < 0.05 && Math.abs(z.im) < 0.05);
        if (!isNaN(bpK) && bpK > 0.001 && !nearPole && !nearZero) {
          points.push({ re: bpSigma, type: prevSlope > 0 ? "breakaway" : "breakin" });
        }
      }
      prevSlope = slope;
      prevK = k;
    }
    return points;
  }, [numC, denC, olPoles, olZeros]);

  const asymptotes = useMemo(() => {
    const realPoles = olPoles.filter(p => !isNaN(p.re));
    const realZeros = olZeros.filter(z => !isNaN(z.re));
    const diff = realPoles.length - realZeros.length;
    if (diff <= 0) return null;
    const sumPoles = realPoles.reduce((s, p) => s + p.re, 0);
    const sumZeros = realZeros.reduce((s, z) => s + z.re, 0);
    return {
      centroid: (sumPoles - sumZeros) / diff,
      angles: Array.from({ length: diff }, (_, k) => ((2 * k + 1) * Math.PI) / diff),
      n: realPoles.length,
      m: realZeros.length,
    };
  }, [olPoles, olZeros]);

  const controllerMarkers = useMemo(() => {
    const zeros: Array<{ re: number; im: number; label: string }> = [];
    const poles: Array<{ re: number; im: number; label: string }> = [];
    const kp = Math.max(1e-9, controllerParams.kp);
    const ki = Math.max(0, controllerParams.ki);
    const kd = Math.max(0, controllerParams.kd);

    if (controllerKind === "pi" || controllerKind === "pid") {
      poles.push({ re: 0, im: 0, label: "C pole" });
    }
    if (controllerKind === "pi" && ki > 0) {
      zeros.push({ re: -ki / kp, im: 0, label: "PI zero" });
    }
    if (controllerKind === "pd" && kd > 0) {
      zeros.push({ re: -kp / kd, im: 0, label: "PD zero" });
    }
    if (controllerKind === "pid" && kd > 0) {
      rootsForLocus([ki, kp, kd])
        .filter(z => !isNaN(z.re))
        .forEach((z, index) => zeros.push({ re: z.re, im: z.im, label: `PID zero ${index + 1}` }));
    }
    if (controllerKind === "lead" || controllerKind === "lag") {
      zeros.push({ re: -Math.max(1e-6, controllerParams.zero), im: 0, label: `${controllerKind} zero` });
      poles.push({ re: -Math.max(1e-6, controllerParams.pole), im: 0, label: `${controllerKind} pole` });
    }

    return { zeros, poles };
  }, [controllerKind, controllerParams]);

  const allPts = [
    ...olPoles,
    ...olZeros,
    ...controllerMarkers.zeros,
    ...controllerMarkers.poles,
    ...clPoles,
    ...loci.flatMap(branch => branch),
  ].filter(p => !isNaN(p.re) && Math.abs(p.re) < 150 && Math.abs(p.im) < 150);

  if (allPts.length < 2) {
    return (
      <div className="flex min-h-[420px] items-center justify-center text-xs font-mono text-muted-foreground">
        Insufficient data for root locus
      </div>
    );
  }

  const reVals = allPts.map(p => p.re);
  const imVals = allPts.map(p => p.im);
  const maxAbs = Math.max(Math.max(...reVals.map(Math.abs), ...imVals.map(Math.abs)), 0.75) + 0.65;
  const W = 620;
  const H = 430;
  const pad = { l: 46, r: 22, t: 24, b: 38 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const cx = pad.l + plotW / 2;
  const cy = pad.t + plotH / 2;
  const scale = Math.min(plotW, plotH) / (2 * maxAbs);
  const toX = (re: number) => cx + re * scale;
  const toY = (im: number) => cy - im * scale;

  const branchColors = [
    "hsl(var(--primary))",
    "hsl(var(--accent))",
    "hsl(160, 70%, 50%)",
    "hsl(32, 90%, 58%)",
    "hsl(280, 65%, 62%)",
    "hsl(350, 75%, 60%)",
  ];

  const formatNumber = (value: number, digits = 3) => {
    if (Number.isNaN(value)) return "n/a";
    if (!Number.isFinite(value)) return "inf";
    if (Math.abs(value) >= 100) return value.toFixed(1);
    if (Math.abs(value) >= 10) return value.toFixed(2);
    return value.toFixed(digits);
  };

  const svgPointFromEvent = (event: React.MouseEvent<SVGSVGElement>) => {
    const svg = event.currentTarget;
    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const svgPt = pt.matrixTransform(ctm.inverse());
    return { re: (svgPt.x - cx) / scale, im: -(svgPt.y - cy) / scale };
  };

  const applyControllerZero = (re: number) => {
    const zero = Math.max(0.001, Math.abs(re || 0.001));
    if (controllerKind === "lead" || controllerKind === "lag") {
      onControllerParamChange("zero", zero);
      onControllerKindChange(zero < controllerParams.pole ? "lead" : "lag");
      setDesignNote(`Moved compensator zero to s = -${formatNumber(zero)}.`);
      return;
    }
    if (controllerKind === "pi") {
      onControllerParamChange("ki", Math.max(0.001, controllerParams.kp * zero));
      setDesignNote(`Moved PI zero to s = -${formatNumber(zero)} by updating Ki.`);
      return;
    }
    if (controllerKind === "pd") {
      onControllerParamChange("kd", Math.max(0.001, controllerParams.kp / zero));
      setDesignNote(`Moved PD zero to s = -${formatNumber(zero)} by updating Kd.`);
      return;
    }
    if (controllerKind === "pid") {
      onControllerParamChange("ki", Math.max(0.001, controllerParams.kp * zero));
      setDesignNote(`Adjusted PID's PI zero estimate toward s = -${formatNumber(zero)}.`);
      return;
    }
    onControllerKindChange("pd");
    onControllerParamChange("kd", Math.max(0.001, controllerParams.kp / zero));
    setDesignNote(`Switched to PD and placed a zero at s = -${formatNumber(zero)}.`);
  };

  const applyControllerPole = (re: number) => {
    const pole = Math.max(0.001, Math.abs(re || 0.001));
    if (controllerKind === "lead" || controllerKind === "lag") {
      onControllerParamChange("pole", pole);
      onControllerKindChange(controllerParams.zero < pole ? "lead" : "lag");
      setDesignNote(`Moved compensator pole to s = -${formatNumber(pole)}.`);
      return;
    }
    onControllerKindChange(controllerParams.zero < pole ? "lead" : "lag");
    onControllerParamChange("pole", pole);
    setDesignNote(`Switched to lead/lag form and placed a finite pole at s = -${formatNumber(pole)}.`);
  };

  const pickNearestGain = (re: number, im: number) => {
    let best: { re: number; im: number; k: number } | null = null;
    let bestDist = Infinity;
    for (const point of loci.flatMap(branch => branch)) {
      const dist = (point.re - re) ** 2 + (point.im - im) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        best = point;
      }
    }
    if (best) {
      const nextK = Math.max(0, Math.min(kMax, best.k));
      setKValue(nextK);
      setDesignNote(`Selected K = ${formatNumber(nextK)} from the nearest locus point.`);
    }
  };

  const handlePlotClick = (event: React.MouseEvent<SVGSVGElement>) => {
    if (editMode === "inspect") return;
    const point = svgPointFromEvent(event);
    if (!point) return;
    const realAxisRe = point.re > -0.001 ? -Math.max(Math.abs(point.re), 0.05) : point.re;
    if (editMode === "zero") applyControllerZero(realAxisRe);
    if (editMode === "pole") applyControllerPole(realAxisRe);
    if (editMode === "target") pickNearestGain(point.re, point.im);
  };

  const handlePlotMove = (event: React.MouseEvent<SVGSVGElement>) => {
    if (editMode === "inspect") {
      setHoverPoint(null);
      return;
    }
    setHoverPoint(svgPointFromEvent(event));
  };

  const optimizeGain = () => {
    let best: { k: number; cost: number; metrics: ReturnType<typeof summarizePoles> } | null = null;
    let fallback: { k: number; cost: number; metrics: ReturnType<typeof summarizePoles> } | null = null;
    const maxExp = Math.max(-2, Math.log10(Math.max(kMax, 1)));
    for (let exp = -3; exp <= maxExp; exp += 0.0125) {
      const candidateK = Math.pow(10, exp);
      const metrics = summarizePoles(polesAtGain(candidateK));
      const fallbackCost = (metrics.dominant?.re ?? 999) + (metrics.stable ? 0 : 50);
      if (!fallback || fallbackCost < fallback.cost) fallback = { k: candidateK, cost: fallbackCost, metrics };

      if (!metrics.stable || !Number.isFinite(metrics.damping) || !Number.isFinite(metrics.settling)) continue;

      const dampingCost = Math.abs(metrics.damping - targetZeta) * 3.5;
      const settlingCost = targetSettlingTime > 0 ? Math.abs(Math.log(metrics.settling / targetSettlingTime)) : 0;
      const speedBias = metrics.settling * 0.02;
      const cost = dampingCost + settlingCost + speedBias;
      if (!best || cost < best.cost) best = { k: candidateK, cost, metrics };
    }

    const winner = best ?? fallback;
    if (winner) {
      setKValue(Math.min(kMax, winner.k));
      setDesignNote(
        best
          ? `Optimized K = ${formatNumber(winner.k)} for zeta ${formatNumber(winner.metrics.damping, 2)} and Ts ${formatNumber(winner.metrics.settling, 2)}s.`
          : `No stable gain met the target; selected K = ${formatNumber(winner.k)} as the least unstable candidate.`
      );
    }
  };

  const commitGainToController = () => {
    const gain = Math.max(1e-6, kValue);
    if (controllerKind === "none") {
      onControllerKindChange("p");
      onControllerParamChange("kp", gain);
    } else if (controllerKind === "lead" || controllerKind === "lag") {
      onControllerParamChange("gain", controllerParams.gain * gain);
    } else {
      onControllerParamChange("kp", controllerParams.kp * gain);
      if (controllerKind === "pi" || controllerKind === "pid") onControllerParamChange("ki", controllerParams.ki * gain);
      if (controllerKind === "pd" || controllerKind === "pid") onControllerParamChange("kd", controllerParams.kd * gain);
    }
    setKValue(1);
    setDesignNote(`Committed loop gain ${formatNumber(gain)} into C(s); locus K reset to 1.`);
  };

  const modeButtonClass = (mode: RootLocusEditMode) => cn(
    "flex items-center justify-center gap-1 rounded border px-2 py-1.5 text-[10px] font-semibold transition-colors",
    editMode === mode
      ? "border-primary bg-primary/15 text-primary"
      : "border-border bg-background/35 text-muted-foreground hover:border-primary/35 hover:text-foreground"
  );

  const majorTicks = Array.from({ length: 9 }, (_, i) => -4 + i).filter(value => Math.abs(value) <= maxAbs);
  const wnValues = [0.5, 1, 2, 5, 10].filter(wn => wn < maxAbs * 0.95);

  return (
    <div className="grid min-h-[520px] gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="overflow-hidden rounded-lg border border-border bg-card/35">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-secondary/20 px-3 py-2">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-foreground">Root Locus Design Canvas</div>
            <div className="text-[10px] text-muted-foreground">Click-to-place real-axis controller poles/zeros and tune gain from the s-plane.</div>
          </div>
          <div className="grid grid-cols-4 gap-1 text-center text-[9px]">
            <div className="rounded border border-border bg-background/35 px-2 py-1">
              <div className="text-muted-foreground">K</div>
              <div className="font-mono text-foreground">{formatNumber(kValue, 2)}</div>
            </div>
            <div className="rounded border border-border bg-background/35 px-2 py-1">
              <div className="text-muted-foreground">zeta</div>
              <div className="font-mono text-foreground">{formatNumber(currentMetrics.damping, 2)}</div>
            </div>
            <div className="rounded border border-border bg-background/35 px-2 py-1">
              <div className="text-muted-foreground">Ts</div>
              <div className="font-mono text-foreground">{formatNumber(currentMetrics.settling, 2)}s</div>
            </div>
            <div className="rounded border border-border bg-background/35 px-2 py-1">
              <div className="text-muted-foreground">State</div>
              <div className={cn("font-mono font-semibold", currentMetrics.stable ? "text-success" : "text-destructive")}>
                {currentMetrics.stable ? "stable" : "unstable"}
              </div>
            </div>
          </div>
        </div>

        <svg
          width="100%"
          height="430"
          viewBox={`0 0 ${W} ${H}`}
          className={cn("block w-full bg-background", editMode !== "inspect" && "cursor-crosshair")}
          onClick={handlePlotClick}
          onMouseMove={handlePlotMove}
          onMouseLeave={() => setHoverPoint(null)}
        >
          <rect x={pad.l} y={pad.t} width={Math.max(0, cx - pad.l)} height={plotH} fill="hsl(var(--success) / 0.035)" />
          <rect x={cx} y={pad.t} width={Math.max(0, W - pad.r - cx)} height={plotH} fill="hsl(var(--destructive) / 0.035)" />

          {majorTicks.map(tick => (
            <g key={`xt${tick}`}>
              <line x1={toX(tick)} y1={pad.t} x2={toX(tick)} y2={H - pad.b} stroke="hsl(var(--border) / 0.42)" strokeWidth={0.7} />
              <text x={toX(tick)} y={H - 14} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={9} fontFamily="monospace">
                {tick}
              </text>
            </g>
          ))}
          {majorTicks.map(tick => (
            <g key={`yt${tick}`}>
              <line x1={pad.l} y1={toY(tick)} x2={W - pad.r} y2={toY(tick)} stroke="hsl(var(--border) / 0.35)" strokeWidth={0.7} />
              <text x={pad.l - 8} y={toY(tick) + 3} textAnchor="end" fill="hsl(var(--muted-foreground))" fontSize={9} fontFamily="monospace">
                {tick}
              </text>
            </g>
          ))}

          <line x1={pad.l} y1={cy} x2={W - pad.r} y2={cy} stroke="hsl(var(--foreground) / 0.32)" strokeWidth={1.2} />
          <line x1={cx} y1={pad.t} x2={cx} y2={H - pad.b} stroke="hsl(var(--foreground) / 0.32)" strokeWidth={1.2} strokeDasharray="6 4" />
          <text x={W - pad.r - 8} y={cy - 8} fill="hsl(var(--muted-foreground))" fontSize={10} fontFamily="monospace">Re</text>
          <text x={cx + 7} y={pad.t + 12} fill="hsl(var(--muted-foreground))" fontSize={10} fontFamily="monospace">Im</text>

          {[0.2, 0.4, 0.6, 0.8].map(zeta => {
            const theta = Math.acos(zeta);
            const lineLen = maxAbs * 1.5;
            const dx = -lineLen * Math.cos(theta) * scale;
            const dy = lineLen * Math.sin(theta) * scale;
            return (
              <g key={`zeta${zeta}`}>
                <line x1={cx} y1={cy} x2={cx + dx} y2={cy - dy} stroke="hsl(var(--muted-foreground) / 0.16)" strokeWidth={0.9} strokeDasharray="4 5" />
                <line x1={cx} y1={cy} x2={cx + dx} y2={cy + dy} stroke="hsl(var(--muted-foreground) / 0.16)" strokeWidth={0.9} strokeDasharray="4 5" />
                <text x={cx + dx * 0.72} y={cy - dy * 0.72 - 4} fill="hsl(var(--muted-foreground) / 0.45)" fontSize={8} fontFamily="monospace">
                  z={zeta}
                </text>
              </g>
            );
          })}

          {wnValues.map(wn => (
            <g key={`wn${wn}`}>
              <circle cx={cx} cy={cy} r={wn * scale} fill="none" stroke="hsl(var(--muted-foreground) / 0.13)" strokeWidth={0.9} strokeDasharray="2 5" />
              <text x={cx + 5} y={cy - wn * scale - 4} fill="hsl(var(--muted-foreground) / 0.4)" fontSize={8} fontFamily="monospace">
                wn={wn}
              </text>
            </g>
          ))}

          {asymptotes && asymptotes.angles.map((angle, i) => {
            const ax = toX(asymptotes.centroid);
            const ay = toY(0);
            const len = maxAbs * 1.8 * scale;
            return (
              <line
                key={`asym${i}`}
                x1={ax}
                y1={ay}
                x2={ax + Math.cos(angle) * len}
                y2={ay - Math.sin(angle) * len}
                stroke="hsl(var(--warning) / 0.38)"
                strokeWidth={1}
                strokeDasharray="7 5"
              />
            );
          })}

          {loci.map((branch, branchIndex) => {
            const visible = branch.filter(p => Math.abs(p.re) < maxAbs * 1.6 && Math.abs(p.im) < maxAbs * 1.6);
            if (visible.length < 2) return null;
            const d = visible.map((p, i) => `${i === 0 ? "M" : "L"}${toX(p.re).toFixed(1)},${toY(p.im).toFixed(1)}`).join(" ");
            return (
              <path
                key={`branch${branchIndex}`}
                d={d}
                fill="none"
                stroke={branchColors[branchIndex % branchColors.length]}
                strokeWidth={2.4}
                opacity={0.92}
              />
            );
          })}

          {breakawayPoints.map((bp, index) => (
            <polygon
              key={`break${index}`}
              points={`${toX(bp.re)},${toY(0) - 5} ${toX(bp.re) + 5},${toY(0)} ${toX(bp.re)},${toY(0) + 5} ${toX(bp.re) - 5},${toY(0)}`}
              fill="hsl(var(--warning) / 0.18)"
              stroke="hsl(var(--warning))"
              strokeWidth={1.5}
            />
          ))}

          {olPoles.filter(p => !isNaN(p.re)).map((p, i) => (
            <g key={`pole${i}`}>
              <line x1={toX(p.re) - 6} y1={toY(p.im) - 6} x2={toX(p.re) + 6} y2={toY(p.im) + 6} stroke="hsl(var(--destructive))" strokeWidth={2.3} />
              <line x1={toX(p.re) - 6} y1={toY(p.im) + 6} x2={toX(p.re) + 6} y2={toY(p.im) - 6} stroke="hsl(var(--destructive))" strokeWidth={2.3} />
            </g>
          ))}

          {olZeros.filter(z => !isNaN(z.re)).map((z, i) => (
            <circle key={`zero${i}`} cx={toX(z.re)} cy={toY(z.im)} r={6} fill="hsl(var(--background))" stroke="hsl(var(--accent))" strokeWidth={2.3} />
          ))}

          {controllerMarkers.zeros.map((z, i) => (
            <g key={`cz${i}`}>
              <circle cx={toX(z.re)} cy={toY(z.im)} r={10} fill="none" stroke="hsl(var(--primary))" strokeWidth={1.5} strokeDasharray="3 2" />
              <text x={toX(z.re) + 12} y={toY(z.im) - 8} fill="hsl(var(--primary))" fontSize={8} fontFamily="monospace">{z.label}</text>
            </g>
          ))}
          {controllerMarkers.poles.map((p, i) => (
            <g key={`cp${i}`}>
              <rect x={toX(p.re) - 9} y={toY(p.im) - 9} width={18} height={18} fill="none" stroke="hsl(var(--warning))" strokeWidth={1.5} strokeDasharray="3 2" />
              <text x={toX(p.re) + 12} y={toY(p.im) + 12} fill="hsl(var(--warning))" fontSize={8} fontFamily="monospace">{p.label}</text>
            </g>
          ))}

          {clPoles.map((p, i) => (
            <g key={`cl${i}`}>
              <circle cx={toX(p.re)} cy={toY(p.im)} r={8} fill="hsl(var(--warning) / 0.2)" stroke="hsl(var(--warning))" strokeWidth={2} />
              <circle cx={toX(p.re)} cy={toY(p.im)} r={2.5} fill="hsl(var(--warning))" />
            </g>
          ))}

          {loci.map((branch, branchIndex) => {
            if (branch.length < 16) return null;
            const p0 = branch[Math.floor(branch.length * 0.36)];
            const p1 = branch[Math.floor(branch.length * 0.36) + 1];
            if (!p0 || !p1) return null;
            const ax = toX(p0.re);
            const ay = toY(p0.im);
            const dx = toX(p1.re) - ax;
            const dy = toY(p1.im) - ay;
            const len = Math.hypot(dx, dy);
            if (len < 1) return null;
            const ux = dx / len;
            const uy = dy / len;
            return (
              <polygon
                key={`arrow${branchIndex}`}
                points={`${ax + ux * 8},${ay + uy * 8} ${ax - uy * 4},${ay + ux * 4} ${ax + uy * 4},${ay - ux * 4}`}
                fill={branchColors[branchIndex % branchColors.length]}
              />
            );
          })}

          {hoverPoint && editMode !== "inspect" && (
            <g pointerEvents="none">
              <line x1={toX(hoverPoint.re)} y1={pad.t} x2={toX(hoverPoint.re)} y2={H - pad.b} stroke="hsl(var(--primary) / 0.45)" strokeDasharray="4 4" />
              <line x1={pad.l} y1={toY(hoverPoint.im)} x2={W - pad.r} y2={toY(hoverPoint.im)} stroke="hsl(var(--primary) / 0.25)" strokeDasharray="4 4" />
              {(editMode === "zero" || editMode === "pole") && (
                <circle
                  cx={toX(hoverPoint.re > -0.001 ? -Math.max(Math.abs(hoverPoint.re), 0.05) : hoverPoint.re)}
                  cy={toY(0)}
                  r={8}
                  fill={editMode === "zero" ? "hsl(var(--primary) / 0.14)" : "hsl(var(--warning) / 0.14)"}
                  stroke={editMode === "zero" ? "hsl(var(--primary))" : "hsl(var(--warning))"}
                  strokeWidth={1.5}
                />
              )}
            </g>
          )}
        </svg>
      </div>

      <aside className="space-y-3">
        <div className="rounded-lg border border-border bg-card/35 p-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Direct Placement</div>
          <div className="grid grid-cols-3 gap-1.5">
            <button type="button" onClick={() => setEditMode("inspect")} className={modeButtonClass("inspect")}>Inspect</button>
            <button type="button" onClick={() => setEditMode("zero")} className={modeButtonClass("zero")}>+ Zero</button>
            <button type="button" onClick={() => setEditMode("pole")} className={modeButtonClass("pole")}>+ Pole</button>
          </div>
          <button type="button" onClick={() => setEditMode("target")} className={cn(modeButtonClass("target"), "mt-2 w-full")}>
            Pick Target Gain
          </button>
          <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
            Zero/pole placement snaps to the real axis and updates the active controller form.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card/35 p-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Gain Optimizer</div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[9px] uppercase tracking-wide text-muted-foreground">
              Target zeta
              <input
                aria-label="Target damping ratio"
                type="number"
                min={0.05}
                max={0.99}
                step={0.01}
                value={targetZeta}
                onChange={(event) => setTargetZeta(Math.max(0.05, Math.min(0.99, Number(event.target.value) || 0.7)))}
                className="mt-1 w-full rounded border border-border bg-secondary/50 px-2 py-1 text-xs font-mono text-foreground outline-none focus:border-primary"
              />
            </label>
            <label className="text-[9px] uppercase tracking-wide text-muted-foreground">
              Target Ts
              <input
                aria-label="Target settling time"
                type="number"
                min={0.05}
                step={0.05}
                value={targetSettlingTime}
                onChange={(event) => setTargetSettlingTime(Math.max(0.05, Number(event.target.value) || 2))}
                className="mt-1 w-full rounded border border-border bg-secondary/50 px-2 py-1 text-xs font-mono text-foreground outline-none focus:border-primary"
              />
            </label>
          </div>
          <button type="button" onClick={optimizeGain} className="mt-2 w-full rounded border border-primary/35 bg-primary/10 px-2 py-1.5 text-[10px] font-semibold text-primary transition-colors hover:bg-primary/15">
            Optimize K
          </button>
          <button type="button" onClick={commitGainToController} className="mt-2 w-full rounded border border-border bg-background/45 px-2 py-1.5 text-[10px] font-semibold text-foreground transition-colors hover:border-primary/35">
            Commit K into C(s)
          </button>
        </div>

        <div className="rounded-lg border border-border bg-card/35 p-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Loop Gain</div>
          <input
            aria-label="Root locus gain"
            type="number"
            value={kValue}
            min={0}
            max={kMax}
            step={kMax / 500}
            onChange={(event) => {
              const next = Number.parseFloat(event.target.value);
              if (Number.isFinite(next) && next >= 0) setKValue(Math.min(next, kMax));
            }}
            className="mb-2 w-full rounded border border-border bg-secondary/50 px-2 py-1.5 text-right text-xs font-mono text-foreground outline-none focus:border-primary"
          />
          <Slider value={[kValue]} onValueChange={([value]) => setKValue(value)} min={0} max={kMax} step={kMax / 500} />
          <div className="mt-2 flex flex-wrap gap-1 text-[9px] font-mono">
            {[10, 50, 100, 500, 1000].map(limit => (
              <button
                key={limit}
                type="button"
                onClick={() => { setKMaxState(limit); if (kValue > limit) setKValue(limit); }}
                className={cn(
                  "rounded border px-1.5 py-0.5 transition-colors",
                  kMax === limit ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {limit}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card/35 p-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Design Readout</div>
          <div className="space-y-1 text-[10px] font-mono text-muted-foreground">
            {clPoles.map((pole, index) => (
              <div key={`readout${index}`} className={pole.re > 1e-8 ? "text-destructive" : "text-foreground/85"}>
                s{index + 1} = {formatNumber(pole.re)}{Math.abs(pole.im) > 1e-8 ? ` ${pole.im >= 0 ? "+" : "-"} j${formatNumber(Math.abs(pole.im))}` : ""}
              </div>
            ))}
          </div>
          <div className="mt-2 rounded border border-border bg-background/35 px-2 py-1.5 text-[10px] leading-snug text-muted-foreground">
            {designNote}
          </div>
          {asymptotes && (
            <div className="mt-2 text-[9px] font-mono text-muted-foreground">
              centroid = {formatNumber(asymptotes.centroid)}; angles = {asymptotes.angles.map(angle => `${(angle * 180 / Math.PI).toFixed(0)}deg`).join(", ")}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function NicholsChart({ result }: { result: SolverResult }) {
  const { data, margins } = useMemo(() => {
    const { num, den } = result.equivalentTF;
    const pts: { phaseDeg: number; magDb: number; w: number }[] = [];

    let gcPhase: number | null = null;
    let pcMag: number | null = null;
    let gmDb = Infinity;
    let pmDeg = Infinity;

    let prevMagDb = NaN;
    let prevPhase = NaN;

    for (let exp = -3; exp <= 4; exp += 0.02) {
      const w = Math.pow(10, exp);
      let numRe = 0, numIm = 0;
      for (let k = 0; k < num.coeffs.length; k++) {
        const c = num.coeffs[k];
        const wk = Math.pow(w, k);
        switch (k % 4) {
          case 0: numRe += c * wk; break;
          case 1: numIm += c * wk; break;
          case 2: numRe -= c * wk; break;
          case 3: numIm -= c * wk; break;
        }
      }
      let denRe = 0, denIm = 0;
      for (let k = 0; k < den.coeffs.length; k++) {
        const c = den.coeffs[k];
        const wk = Math.pow(w, k);
        switch (k % 4) {
          case 0: denRe += c * wk; break;
          case 1: denIm += c * wk; break;
          case 2: denRe -= c * wk; break;
          case 3: denIm -= c * wk; break;
        }
      }
      const dMagSq = denRe * denRe + denIm * denIm;
      if (dMagSq < 1e-30) continue;
      const gRe = (numRe * denRe + numIm * denIm) / dMagSq;
      const gIm = (numIm * denRe - numRe * denIm) / dMagSq;
      const mag = Math.sqrt(gRe * gRe + gIm * gIm);
      const magDb = 20 * Math.log10(mag || 1e-30);
      const phaseDeg = Math.atan2(gIm, gRe) * (180 / Math.PI);

      // Detect crossovers
      if (!isNaN(prevMagDb)) {
        if (gcPhase === null && ((prevMagDb > 0 && magDb <= 0) || (prevMagDb < 0 && magDb >= 0))) {
          const t = Math.abs(prevMagDb) / (Math.abs(prevMagDb) + Math.abs(magDb) + 1e-30);
          gcPhase = prevPhase + t * (phaseDeg - prevPhase);
          pmDeg = 180 + gcPhase;
        }
        if (pcMag === null && ((prevPhase > -180 && phaseDeg <= -180) || (prevPhase < -180 && phaseDeg >= -180))) {
          const t = Math.abs(prevPhase + 180) / (Math.abs(prevPhase + 180) + Math.abs(phaseDeg + 180) + 1e-30);
          pcMag = prevMagDb + t * (magDb - prevMagDb);
          gmDb = -pcMag;
        }
      }

      if (magDb > -80 && magDb < 80) {
        pts.push({ phaseDeg, magDb, w });
      }
      prevMagDb = magDb;
      prevPhase = phaseDeg;
    }
    return { data: pts, margins: { gcPhase, pcMag, gmDb, pmDeg } };
  }, [result]);

  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground font-mono">
        Insufficient data for Nichols chart
      </div>
    );
  }

  // Chart dimensions
  const W = 360, H = 300;
  const padL = 40, padR = 15, padT = 15, padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  // Axis ranges
  const phaseMin = -360, phaseMax = 0;
  const magMin = -40, magMax = 40;
  const phaseRange = phaseMax - phaseMin;
  const magRange = magMax - magMin;

  const toX = (phase: number) => padL + ((phase - phaseMin) / phaseRange) * plotW;
  const toY = (mag: number) => padT + ((magMax - mag) / magRange) * plotH;

  // Build path
  const pathD = data.map((p, i) => {
    const x = toX(Math.max(phaseMin, Math.min(phaseMax, p.phaseDeg)));
    const y = toY(Math.max(magMin, Math.min(magMax, p.magDb)));
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  // M-circle contours (closed-loop magnitude in dB)
  const mCircleValues = [-12, -6, -3, -1, 0, 0.25, 0.5, 1, 3, 6, 12];

  // Generate M-circle points: |G/(1+G)| = M where M = 10^(MdB/20)
  // Parametrically: for each M, sweep angle to get (phase, magdB) locus
  const mCirclePaths: Array<{ mDb: number; path: string }> = [];
  for (const mDb of mCircleValues) {
    const M = Math.pow(10, mDb / 20);
    const pts: string[] = [];
    for (let theta = 0; theta <= 360; theta += 2) {
      const rad = (theta * Math.PI) / 180;
      // G = M*e^(j*theta) / (1 - M*e^(j*theta)) ... but we need the Nichols form
      // Use: for |T|=M, T = G/(1+G), so G = T/(1-T), T = M*e^(j*alpha)
      const tRe = M * Math.cos(rad);
      const tIm = M * Math.sin(rad);
      const dRe = 1 - tRe;
      const dIm = -tIm;
      const dMagSq = dRe * dRe + dIm * dIm;
      if (dMagSq < 1e-10) continue;
      const gRe = (tRe * dRe + tIm * dIm) / dMagSq;
      const gIm = (tIm * dRe - tRe * dIm) / dMagSq;
      const gMag = Math.sqrt(gRe * gRe + gIm * gIm);
      const gMagDb = 20 * Math.log10(gMag || 1e-30);
      const gPhaseDeg = Math.atan2(gIm, gRe) * (180 / Math.PI);

      if (gPhaseDeg >= phaseMin && gPhaseDeg <= phaseMax && gMagDb >= magMin && gMagDb <= magMax) {
        const x = toX(gPhaseDeg);
        const y = toY(gMagDb);
        pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      }
    }
    if (pts.length > 3) {
      mCirclePaths.push({ mDb, path: "M" + pts.join(" L") });
    }
  }

  // Direction arrow
  const midIdx = Math.floor(data.length / 3);
  const arrowData = midIdx < data.length - 1 ? {
    x1: toX(data[midIdx].phaseDeg), y1: toY(data[midIdx].magDb),
    x2: toX(data[midIdx + 1].phaseDeg), y2: toY(data[midIdx + 1].magDb),
  } : null;

  const { gcPhase, pcMag, gmDb, pmDeg } = margins;

  return (
    <div className="space-y-1">
      <div className="flex gap-3 px-2 py-1 text-[9px] font-mono text-muted-foreground">
        <span>GM: <span className={gmDb !== Infinity ? (gmDb > 0 ? "text-green-400" : "text-destructive") : ""}>{gmDb === Infinity ? "∞" : `${gmDb.toFixed(1)} dB`}</span></span>
        <span>PM: <span className={pmDeg !== Infinity ? (pmDeg > 0 ? "text-green-400" : "text-destructive") : ""}>{pmDeg === Infinity ? "∞" : `${pmDeg.toFixed(1)}°`}</span></span>
      </div>
      <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} className="max-w-[360px] mx-auto">
        {/* Grid lines */}
        {[-360, -315, -270, -225, -180, -135, -90, -45, 0].map(p => (
          <line key={`gp${p}`} x1={toX(p)} y1={padT} x2={toX(p)} y2={padT + plotH}
            stroke={p === -180 ? "hsl(var(--destructive) / 0.4)" : "hsl(var(--border) / 0.5)"}
            strokeWidth={p === -180 ? 1.5 : 0.5}
            strokeDasharray={p === -180 ? "6 3" : "2 3"} />
        ))}
        {[-40, -20, 0, 20, 40].map(m => (
          <line key={`gm${m}`} x1={padL} y1={toY(m)} x2={padL + plotW} y2={toY(m)}
            stroke={m === 0 ? "hsl(var(--warning) / 0.5)" : "hsl(var(--border) / 0.5)"}
            strokeWidth={m === 0 ? 1.5 : 0.5}
            strokeDasharray={m === 0 ? "6 3" : "2 3"} />
        ))}

        {/* M-circles */}
        {mCirclePaths.map(({ mDb, path }) => (
          <path key={`mc${mDb}`} d={path} fill="none"
            stroke={Math.abs(mDb) <= 1 ? "hsl(var(--primary) / 0.3)" : "hsl(var(--muted-foreground) / 0.15)"}
            strokeWidth={Math.abs(mDb) <= 1 ? 0.8 : 0.5}
            strokeDasharray="3 4" />
        ))}
        {/* M-circle labels */}
        {mCirclePaths.map(({ mDb, path }) => {
          const match = path.match(/M([\d.]+),([\d.]+)/);
          if (!match) return null;
          return (
            <text key={`ml${mDb}`} x={parseFloat(match[1]) + 2} y={parseFloat(match[2]) - 2}
              fill="hsl(var(--muted-foreground) / 0.4)" fontSize={6} fontFamily="monospace">
              {mDb > 0 ? `+${mDb}` : mDb}dB
            </text>
          );
        })}

        {/* N-circles (constant closed-loop phase contours) */}
        {(() => {
          const nPhaseValues = [-150, -120, -90, -60, -30, -10, 10, 30, 60, 90, 120, 150];
          const nPaths: Array<{ nDeg: number; path: string }> = [];
          for (const nDeg of nPhaseValues) {
            const alpha = (nDeg * Math.PI) / 180;
            const pts: Array<[number, number]> = [];
            // Sweep |T| from very small to very large to trace the N-circle
            for (let logM = -2; logM <= 2; logM += 0.02) {
              const Mmag = Math.pow(10, logM);
              const tRe = Mmag * Math.cos(alpha);
              const tIm = Mmag * Math.sin(alpha);
              const dRe = 1 - tRe;
              const dIm = -tIm;
              const dMagSq = dRe * dRe + dIm * dIm;
              if (dMagSq < 1e-10) continue;
              const gRe2 = (tRe * dRe + tIm * dIm) / dMagSq;
              const gIm2 = (tIm * dRe - tRe * dIm) / dMagSq;
              const gMag2 = Math.sqrt(gRe2 * gRe2 + gIm2 * gIm2);
              const gMagDb2 = 20 * Math.log10(gMag2 || 1e-30);
              const gPhaseDeg2 = Math.atan2(gIm2, gRe2) * (180 / Math.PI);
              if (gPhaseDeg2 >= phaseMin && gPhaseDeg2 <= phaseMax && gMagDb2 >= magMin && gMagDb2 <= magMax) {
                pts.push([toX(gPhaseDeg2), toY(gMagDb2)]);
              }
            }
            // Filter out large jumps (discontinuities from wrapping)
            if (pts.length > 3) {
              const segments: string[] = [];
              let seg: string[] = [`M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`];
              for (let i = 1; i < pts.length; i++) {
                const dx = pts[i][0] - pts[i - 1][0];
                const dy = pts[i][1] - pts[i - 1][1];
                if (Math.sqrt(dx * dx + dy * dy) > 50) {
                  if (seg.length > 2) segments.push(seg.join(" "));
                  seg = [`M${pts[i][0].toFixed(1)},${pts[i][1].toFixed(1)}`];
                } else {
                  seg.push(`L${pts[i][0].toFixed(1)},${pts[i][1].toFixed(1)}`);
                }
              }
              if (seg.length > 2) segments.push(seg.join(" "));
              if (segments.length > 0) {
                nPaths.push({ nDeg, path: segments.join(" ") });
              }
            }
          }
          return (
            <>
              {nPaths.map(({ nDeg, path }) => (
                <path key={`nc${nDeg}`} d={path} fill="none"
                  stroke="hsl(var(--chart-4) / 0.25)"
                  strokeWidth={0.5}
                  strokeDasharray="2 4" />
              ))}
              {nPaths.map(({ nDeg, path }) => {
                const match = path.match(/M([\d.]+),([\d.]+)/);
                if (!match) return null;
                return (
                  <text key={`nl${nDeg}`} x={parseFloat(match[1]) + 2} y={parseFloat(match[2]) + 6}
                    fill="hsl(var(--chart-4) / 0.35)" fontSize={5.5} fontFamily="monospace">
                    {nDeg}°
                  </text>
                );
              })}
            </>
          );
        })()}

        {/* Critical point (-180°, 0 dB) */}
        <circle cx={toX(-180)} cy={toY(0)} r={5}
          fill="hsl(var(--destructive) / 0.2)" stroke="hsl(var(--destructive))" strokeWidth={2} />

        {/* GM annotation */}
        {pcMag !== null && (
          <>
            <line x1={toX(-180)} y1={toY(pcMag)} x2={toX(-180)} y2={toY(0)}
              stroke="hsl(var(--destructive) / 0.6)" strokeWidth={2} strokeDasharray="4 2" />
            <circle cx={toX(-180)} cy={toY(pcMag)} r={3}
              fill="hsl(var(--destructive))" stroke="none" />
          </>
        )}

        {/* PM annotation */}
        {gcPhase !== null && (
          <>
            <line x1={toX(gcPhase)} y1={toY(0)} x2={toX(-180)} y2={toY(0)}
              stroke="hsl(var(--primary) / 0.6)" strokeWidth={2} strokeDasharray="4 2" />
            <circle cx={toX(gcPhase)} cy={toY(0)} r={3}
              fill="hsl(var(--primary))" stroke="none" />
          </>
        )}

        {/* Open-loop curve */}
        <path d={pathD} fill="none" stroke="hsl(var(--accent))" strokeWidth={2} />

        {/* Frequency labels at decade points */}
        {(() => {
          const decadeExps = [-2, -1, 0, 1, 2, 3];
          const labels: React.ReactNode[] = [];
          for (const exp of decadeExps) {
            const targetW = Math.pow(10, exp);
            let bestIdx = -1, bestDist = Infinity;
            for (let i = 0; i < data.length; i++) {
              const d = Math.abs(Math.log10(data[i].w) - exp);
              if (d < bestDist) { bestDist = d; bestIdx = i; }
            }
            if (bestIdx < 0 || bestDist > 0.05) continue;
            const p = data[bestIdx];
            const px = toX(Math.max(phaseMin, Math.min(phaseMax, p.phaseDeg)));
            const py = toY(Math.max(magMin, Math.min(magMax, p.magDb)));
            if (px < padL || px > W - padR || py < padT || py > H - padB) continue;
            const wLabel = targetW >= 1 ? `${targetW}` : targetW.toFixed(Math.abs(exp));
            const tipW = 110, tipH = 30;
            const tipX = px + tipW + 8 > W - padR ? px - tipW - 4 : px + 8;
            const tipY = py - tipH - 4 < padT ? py + 8 : py - tipH - 4;
            labels.push(
              <g key={`wl${exp}`} className="group/wl">
                <circle cx={px} cy={py} r={2.5} fill="hsl(var(--accent))" />
                <circle cx={px} cy={py} r={12} fill="transparent" className="cursor-pointer" />
                <text x={px + 5} y={py - 5} fill="hsl(var(--accent))" fontSize={7} fontFamily="monospace"
                  stroke="hsl(var(--background))" strokeWidth={2.5} paintOrder="stroke" pointerEvents="none">
                  ω={wLabel}
                </text>
                <g className="opacity-0 group-hover/wl:opacity-100 transition-opacity pointer-events-none">
                  <rect x={tipX} y={tipY} width={tipW} height={tipH} rx={3}
                    fill="hsl(var(--popover))" stroke="hsl(var(--border))" strokeWidth={0.5} />
                  <text x={tipX + 4} y={tipY + 11} fill="hsl(var(--popover-foreground))" fontSize={6.5} fontFamily="monospace">
                    |G|={p.magDb.toFixed(1)} dB
                  </text>
                  <text x={tipX + 4} y={tipY + 22} fill="hsl(var(--popover-foreground))" fontSize={6.5} fontFamily="monospace">
                    ∠G={p.phaseDeg.toFixed(1)}°
                  </text>
                </g>
              </g>
            );
          }
          return labels;
        })()}

        {/* Direction arrow */}
        {arrowData && (() => {
          const dx = arrowData.x2 - arrowData.x1;
          const dy = arrowData.y2 - arrowData.y1;
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len < 1) return null;
          const ux = dx / len, uy = dy / len;
          return (
            <polygon
              points={`${arrowData.x1 + ux * 7},${arrowData.y1 + uy * 7} ${arrowData.x1 - uy * 3.5},${arrowData.y1 + ux * 3.5} ${arrowData.x1 + uy * 3.5},${arrowData.y1 - ux * 3.5}`}
              fill="hsl(var(--accent))"
            />
          );
        })()}

        {/* Axis labels */}
        {[-360, -270, -180, -90, 0].map(p => (
          <text key={`xl${p}`} x={toX(p)} y={padT + plotH + 15} textAnchor="middle"
            fill="hsl(var(--muted-foreground))" fontSize={8} fontFamily="monospace">{p}°</text>
        ))}
        {[-40, -20, 0, 20, 40].map(m => (
          <text key={`yl${m}`} x={padL - 5} y={toY(m) + 3} textAnchor="end"
            fill="hsl(var(--muted-foreground))" fontSize={8} fontFamily="monospace">{m}</text>
        ))}
        <text x={padL + plotW / 2} y={H - 2} textAnchor="middle"
          fill="hsl(var(--muted-foreground))" fontSize={8} fontFamily="monospace">Open-Loop Phase (deg)</text>
        <text x={8} y={padT + plotH / 2} textAnchor="middle"
          fill="hsl(var(--muted-foreground))" fontSize={8} fontFamily="monospace"
          transform={`rotate(-90, 8, ${padT + plotH / 2})`}>dB</text>

        {/* Legend */}
        <g transform={`translate(${padL + 5}, ${padT + 5})`}>
          <line x1={0} y1={3} x2={12} y2={3} stroke="hsl(var(--accent))" strokeWidth={2} />
          <text x={16} y={6} fill="hsl(var(--muted-foreground))" fontSize={7} fontFamily="monospace">G(jω)</text>
          <line x1={50} y1={3} x2={62} y2={3} stroke="hsl(var(--primary) / 0.3)" strokeWidth={0.8} strokeDasharray="3 4" />
          <text x={66} y={6} fill="hsl(var(--muted-foreground))" fontSize={7} fontFamily="monospace">M-circles</text>
          <line x1={115} y1={3} x2={127} y2={3} stroke="hsl(var(--chart-4) / 0.4)" strokeWidth={0.5} strokeDasharray="2 4" />
          <text x={131} y={6} fill="hsl(var(--muted-foreground))" fontSize={7} fontFamily="monospace">N-circles</text>
        </g>

        {/* Crosshair */}
        <SvgCrosshairLayer
          bounds={{ x1: padL, y1: padT, x2: W - padR, y2: H - padB }}
          fromX={(x) => (phaseMin + ((x - padL) / plotW) * phaseRange).toFixed(1) + "°"}
          fromY={(y) => (magMax - ((y - padT) / plotH) * magRange).toFixed(1) + " dB"}
          labelX="∠"
          labelY="|G|"
          curvePoints={data.map(p => ({ x: toX(Math.max(phaseMin, Math.min(phaseMax, p.phaseDeg))), y: toY(Math.max(magMin, Math.min(magMax, p.magDb))) }))}
        />
      </svg>
    </div>
  );
}

// ─── Combined Panel ──────────────────────────────────────────────────────────

type PlotTab = "pzmap" | "step" | "bode" | "nyquist" | "nichols" | "rlocus";

const PLOT_TABS: { id: PlotTab; label: string; model: "closed" | "open" }[] = [
  { id: "pzmap", label: "P-Z", model: "closed" },
  { id: "step", label: "Step", model: "closed" },
  { id: "bode", label: "Bode", model: "open" },
  { id: "nyquist", label: "Nyquist", model: "open" },
  { id: "nichols", label: "Nichols", model: "open" },
  { id: "rlocus", label: "R.Locus", model: "open" },
];

function formatMetric(value: number, suffix = "", digits = 2): string {
  if (value === Infinity) return `inf${suffix}`;
  if (!Number.isFinite(value)) return `--${suffix}`;
  return `${value.toFixed(digits)}${suffix}`;
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Embedded preview browsers can deny clipboard writes when the page is not focused.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  return copied;
}

function ParameterInput({
  label,
  value,
  onChange,
  min = 0,
  step = 0.1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  step?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <input
        aria-label={label}
        type="number"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        step={step}
        onChange={(event) => {
          const next = Number.parseFloat(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
        className="w-full rounded border border-border bg-secondary/60 px-2 py-1.5 text-xs font-mono text-foreground outline-none transition-colors focus:border-primary"
      />
    </label>
  );
}

export function AnalysisPlots({ result }: { result: SolverResult }) {
  const [tab, setTab] = React.useState<PlotTab>("pzmap");
  const [controllerKind, setControllerKind] = React.useState<ControllerKind>("none");
  const [params, setParams] = React.useState<ControllerParams>(DEFAULT_CONTROLLER_PARAMS);
  const [matlabStatus, setMatlabStatus] = React.useState("");
  const plotRef = useRef<HTMLDivElement>(null);

  const design = useMemo(
    () => buildControllerDesign(result.equivalentTF, controllerKind, params),
    [result, controllerKind, params]
  );

  const isDirectStudy = controllerKind === "none";
  const activePlotMeta = PLOT_TABS.find((item) => item.id === tab) ?? PLOT_TABS[0];
  const openLoopResult = isDirectStudy ? result : design.openLoopResult;
  const closedLoopResult = isDirectStudy ? result : design.closedLoopResult;
  const activeResult = activePlotMeta.model === "closed" ? closedLoopResult : openLoopResult;
  const matlabScript = useMemo(
    () => generateMatlabControlScript({
      plant: result.equivalentTF,
      controllerKind,
      params,
      openDesigner: true,
    }),
    [controllerKind, params, result.equivalentTF]
  );
  const margins = useMemo(
    () => computeMargins(openLoopResult.equivalentTF.num, openLoopResult.equivalentTF.den),
    [openLoopResult]
  );
  const controllerTf = design.controller;
  const activeSpec = design.spec;

  const updateParam = useCallback((key: keyof ControllerParams, value: number) => {
    setParams((prev) => ({ ...prev, [key]: value }));
    setMatlabStatus("");
  }, []);

  const handleExport = useCallback(async () => {
    if (!plotRef.current) return;

    try {
      const canvas = await html2canvas(plotRef.current, {
        backgroundColor: "#0d1117",
        scale: 2,
        logging: false,
      });

      const link = document.createElement("a");
      link.download = `${tab}-plot.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.error("Export failed:", err);
    }
  }, [tab]);

  const handleCopyMatlabScript = useCallback(async () => {
    const copied = await copyTextToClipboard(matlabScript);
    setMatlabStatus(copied ? "MATLAB script copied." : "Copy blocked; use Download .m instead.");
  }, [matlabScript]);

  const handleDownloadMatlabScript = useCallback(() => {
    const blob = new Blob([matlabScript], { type: "text/x-matlab" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "block_simplifier_control_design.m";
    link.click();
    URL.revokeObjectURL(url);
    setMatlabStatus("MATLAB .m script downloaded.");
  }, [matlabScript]);

  const controllerParamControls = (() => {
    switch (controllerKind) {
      case "p":
        return <ParameterInput label="Kp" value={params.kp} onChange={(value) => updateParam("kp", value)} />;
      case "pi":
        return (
          <div className="grid grid-cols-2 gap-2">
            <ParameterInput label="Kp" value={params.kp} onChange={(value) => updateParam("kp", value)} />
            <ParameterInput label="Ki" value={params.ki} onChange={(value) => updateParam("ki", value)} />
          </div>
        );
      case "pd":
        return (
          <div className="grid grid-cols-2 gap-2">
            <ParameterInput label="Kp" value={params.kp} onChange={(value) => updateParam("kp", value)} />
            <ParameterInput label="Kd" value={params.kd} onChange={(value) => updateParam("kd", value)} />
          </div>
        );
      case "pid":
        return (
          <div className="grid grid-cols-3 gap-2">
            <ParameterInput label="Kp" value={params.kp} onChange={(value) => updateParam("kp", value)} />
            <ParameterInput label="Ki" value={params.ki} onChange={(value) => updateParam("ki", value)} />
            <ParameterInput label="Kd" value={params.kd} onChange={(value) => updateParam("kd", value)} />
          </div>
        );
      case "lead":
      case "lag":
        return (
          <div className="grid grid-cols-3 gap-2">
            <ParameterInput label="K" value={params.gain} onChange={(value) => updateParam("gain", value)} />
            <ParameterInput label="Zero" value={params.zero} onChange={(value) => updateParam("zero", value)} min={0.001} />
            <ParameterInput label="Pole" value={params.pole} onChange={(value) => updateParam("pole", value)} min={0.001} />
          </div>
        );
      case "none":
        return (
          <div className="rounded border border-border bg-secondary/25 px-3 py-2 text-[11px] leading-snug text-muted-foreground">
            Direct study uses the analyzed G_eq(s). Pick a controller to switch into unity-feedback design mode.
          </div>
        );
    }
  })();

  const gainKey: keyof ControllerParams =
    controllerKind === "lead" || controllerKind === "lag" ? "gain" : "kp";
  const showGainSlider = controllerKind !== "none";

  return (
    <div className="panel-section overflow-hidden">
      <div className="border-b border-border bg-card/80 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">Controller Design Studio</h3>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
              Linked classical-design views for studying G_eq(s), shaping C(s)G(s), and checking T(s).
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-[10px] sm:min-w-[330px]">
            <div className="rounded border border-border bg-secondary/25 px-2 py-1.5">
              <div className="text-muted-foreground">GM</div>
              <div className="font-mono font-semibold text-foreground">{formatMetric(margins.gainMarginDb, " dB", 1)}</div>
            </div>
            <div className="rounded border border-border bg-secondary/25 px-2 py-1.5">
              <div className="text-muted-foreground">PM</div>
              <div className="font-mono font-semibold text-foreground">{formatMetric(margins.phaseMarginDeg, " deg", 1)}</div>
            </div>
            <div className="rounded border border-border bg-secondary/25 px-2 py-1.5">
              <div className="text-muted-foreground">CL</div>
              <div
                className={cn(
                  "font-mono font-semibold",
                  closedLoopResult.stability === "stable"
                    ? "text-success"
                    : closedLoopResult.stability === "unstable"
                      ? "text-destructive"
                      : "text-warning"
                )}
              >
                {closedLoopResult.stability.replace("_", " ")}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
          <div className="space-y-3">
            <div className="grid gap-1.5 sm:grid-cols-4 lg:grid-cols-7">
              {CONTROLLER_SPECS.map((spec) => (
                <button
                  key={spec.kind}
                  type="button"
                  onClick={() => setControllerKind(spec.kind)}
                  title={spec.useWhen}
                  className={cn(
                    "rounded border px-2 py-2 text-left transition-all",
                    controllerKind === spec.kind
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-secondary/20 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                  )}
                >
                  <div className="text-[10px] font-bold uppercase tracking-wide">{spec.shortLabel}</div>
                  <div className="mt-0.5 text-[9px] leading-tight">{spec.label}</div>
                </button>
              ))}
            </div>

            <div className="rounded-lg border border-border bg-secondary/20 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Target className="h-3.5 w-3.5 text-primary" />
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {isDirectStudy ? "Direct Model Study" : "Unity-Feedback Controller Design"}
                  </span>
                </div>
                <span className="rounded border border-border bg-background/35 px-2 py-0.5 text-[9px] font-mono text-muted-foreground">
                  {activeSpec.formula}
                </span>
              </div>
              {controllerParamControls}
              {showGainSlider && (
                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-[9px] font-mono text-muted-foreground">
                    <span>{gainKey === "gain" ? "Compensator gain" : "Proportional gain"}</span>
                    <span>{params[gainKey].toFixed(3)}</span>
                  </div>
                  <Slider
                    value={[params[gainKey]]}
                    onValueChange={([value]) => updateParam(gainKey, value)}
                    min={0}
                    max={50}
                    step={0.05}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="rounded-lg border border-border bg-background/35 p-3">
              <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Activity className="h-3.5 w-3.5 text-primary" />
                Model Stack
              </div>
              <div className="space-y-2 text-[10px] font-mono">
                <div className="rounded border border-border bg-secondary/20 px-2 py-1.5">
                  <div className="text-muted-foreground">G(s)</div>
                  <div className="break-all text-foreground">({result.display.num}) / ({result.display.den})</div>
                </div>
                <div className="rounded border border-border bg-secondary/20 px-2 py-1.5">
                  <div className="text-muted-foreground">C(s)</div>
                  <div className="break-all text-foreground">
                    ({format(controllerTf.num)}) / ({format(controllerTf.den)})
                  </div>
                </div>
                <div className="rounded border border-primary/25 bg-primary/5 px-2 py-1.5">
                  <div className="text-muted-foreground">Active plot model</div>
                  <div className="break-all text-foreground">
                    {activePlotMeta.model === "open" ? "Open-loop L(s)" : isDirectStudy ? "Direct G_eq(s)" : "Closed-loop T(s)"}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background/35 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <Zap className="h-3.5 w-3.5 text-primary" />
                  MATLAB Bridge
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleCopyMatlabScript}
                    className="flex items-center gap-1 rounded border border-border bg-secondary/25 px-2 py-1 text-[10px] font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                    title="Copy MATLAB script"
                  >
                    <Clipboard className="h-3 w-3" />
                    Copy
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadMatlabScript}
                    className="flex items-center gap-1 rounded border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary transition-colors hover:border-primary/60 hover:bg-primary/15"
                    title="Download MATLAB script"
                  >
                    <FileDown className="h-3 w-3" />
                    .m
                  </button>
                </div>
              </div>
              <div className="mb-2 rounded border border-primary/20 bg-primary/5 px-2 py-1.5 text-[10px] leading-snug text-muted-foreground">
                Generates G(s), C(s), L(s), T(s), response plots, margins, and Control System Designer launch code.
              </div>
              <pre className="max-h-40 overflow-auto rounded border border-border bg-secondary/30 p-2 text-[9px] leading-relaxed text-muted-foreground">
                {matlabScript}
              </pre>
              {matlabStatus && (
                <div className="mt-2 rounded border border-border bg-secondary/20 px-2 py-1 text-[10px] text-muted-foreground">
                  {matlabStatus}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex border-b border-border items-center bg-background/70">
        {PLOT_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2 text-[10px] font-semibold tracking-wide uppercase transition-all ${
              tab === t.id
                ? "text-primary border-b-2 border-primary bg-primary/5"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title={t.model === "open" ? "Uses open-loop L(s)=C(s)G(s)" : "Uses closed-loop T(s) or direct model"}
          >
            {t.label}
          </button>
        ))}
        <button
          onClick={handleExport}
          className="px-2 py-2 text-muted-foreground hover:text-primary transition-colors"
          title="Export active plot as PNG"
        >
          <Download className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className={cn("grid gap-3 p-3", tab === "rlocus" ? "xl:grid-cols-1" : "xl:grid-cols-[minmax(0,1fr)_220px]")}>
        <div
          ref={plotRef}
          className={cn(
            "rounded border border-border bg-background",
            tab === "rlocus" ? "min-h-[560px] p-0" : "min-h-[250px] p-3"
          )}
        >
          {tab === "pzmap" && <PoleZeroMap result={activeResult} />}
          {tab === "step" && <TimeResponsePlot result={activeResult} />}
          {tab === "bode" && <BodePlot result={activeResult} />}
          {tab === "nyquist" && <NyquistPlot result={activeResult} />}
          {tab === "nichols" && <NicholsChart result={activeResult} />}
          {tab === "rlocus" && (
            <RootLocusPlot
              result={activeResult}
              controllerKind={controllerKind}
              controllerParams={params}
              onControllerKindChange={setControllerKind}
              onControllerParamChange={updateParam}
            />
          )}
        </div>

        {tab !== "rlocus" && (
        <div className="rounded border border-border bg-secondary/20 p-3">
          <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <GitBranch className="h-3.5 w-3.5 text-primary" />
            Design Notes
          </div>
          <div className="space-y-2 text-[11px] leading-snug text-muted-foreground">
            <p>{activeSpec.purpose}</p>
            <p>{activeSpec.useWhen}</p>
            <div className="rounded border border-border bg-background/40 px-2 py-1.5 font-mono text-[10px]">
              {activePlotMeta.model === "open"
                ? "Loop-shaping plot: tune C(s) against gain/phase behavior."
                : isDirectStudy
                  ? "Direct plot: current analyzed equivalent transfer function."
                  : "Closed-loop plot: response after unity feedback."}
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

