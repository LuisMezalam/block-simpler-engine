import React, { useMemo } from "react";
import { SolverResult } from "@/lib/solver";
import { evaluate, roots } from "@/lib/polynomial";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";

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
    </svg>
  );
}

// ─── Step Response ───────────────────────────────────────────────────────────

function StepResponsePlot({ result }: { result: SolverResult }) {
  const { data, metrics } = useMemo(() => {
    const { num, den } = result.equivalentTF;
    const n = den.coeffs.length - 1;
    if (n === 0) {
      const gain = num.coeffs[0] / den.coeffs[0];
      const pts = Array.from({ length: 100 }, (_, i) => ({ t: i * 0.1, y: gain }));
      return { data: pts, metrics: { finalValue: gain, overshoot: 0, riseTime: 0, settlingTime: 0, peakTime: 0, peakValue: gain } };
    }

    const an = den.coeffs[n];
    const a = den.coeffs.map(c => c / an);
    const b = num.coeffs.map(c => c / an);

    const dt = 0.01;
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
      if (k % 5 === 0) points.push({ t: parseFloat(t.toFixed(3)), y: parseFloat(y.toFixed(6)) });

      const xn = new Float64Array(n);
      for (let i = 0; i < n - 1; i++) xn[i] = x[i] + dt * x[i + 1];
      let xdot_last = 1;
      for (let i = 0; i < n; i++) xdot_last -= a[i] * x[i];
      xn[n - 1] = x[n - 1] + dt * xdot_last;
      x.set(xn);
    }

    const finalValue = points.length > 0 ? points[points.length - 1].y : 0;
    let peakValue = -Infinity, peakTime = 0;
    let riseTime = 0, settlingTime = 0;
    let foundRise10 = false, rise10t = 0;

    for (const p of points) {
      if (p.y > peakValue) { peakValue = p.y; peakTime = p.t; }
      if (!foundRise10 && p.y >= 0.1 * finalValue) { rise10t = p.t; foundRise10 = true; }
      if (foundRise10 && riseTime === 0 && p.y >= 0.9 * finalValue) { riseTime = p.t - rise10t; }
    }

    const band = 0.02 * Math.abs(finalValue || 1);
    for (let i = points.length - 1; i >= 0; i--) {
      if (Math.abs(points[i].y - finalValue) > band) { settlingTime = points[i].t; break; }
    }

    const overshoot = finalValue !== 0 ? Math.max(0, ((peakValue - finalValue) / Math.abs(finalValue)) * 100) : 0;

    return { data: points, metrics: { finalValue, overshoot, riseTime, settlingTime, peakTime, peakValue } };
  }, [result]);

  if (data.length === 0) return null;

  const { finalValue, overshoot, riseTime, settlingTime, peakTime } = metrics;

  return (
    <div className="space-y-2">
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="t" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} label={{ value: "t (s)", position: "insideBottomRight", offset: -5, fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
          <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
          <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 10, fontFamily: "monospace" }} />
          <ReferenceLine y={finalValue} stroke="hsl(var(--warning))" strokeDasharray="5 3" strokeWidth={1} />
          <ReferenceLine y={0} stroke="hsl(var(--border))" />
          <Line type="monotone" dataKey="y" stroke="hsl(var(--primary))" strokeWidth={1.5} dot={false} name="y(t)" />
        </LineChart>
      </ResponsiveContainer>
      <div className="grid grid-cols-4 gap-1 px-1">
        {[
          { label: "Overshoot", value: `${overshoot.toFixed(1)}%`, warn: overshoot > 25 },
          { label: "Rise Time", value: `${riseTime.toFixed(3)}s`, warn: false },
          { label: "Settling", value: `${settlingTime.toFixed(2)}s`, warn: settlingTime > 8 },
          { label: "Peak Time", value: `${peakTime.toFixed(3)}s`, warn: false },
        ].map(m => (
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
  const { data, margins } = useMemo(() => {
    const { num, den } = result.equivalentTF;
    const points: { w: number; wLog: number; mag: number; phase: number }[] = [];

    let gcLog: number | null = null;
    let pcLog: number | null = null;
    let gmDb = Infinity;
    let pmDeg = Infinity;
    let prevMagDb = NaN;
    let prevPhase = NaN;
    let prevExp = NaN;

    for (let exp = -2; exp <= 3; exp += 0.05) {
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
      const numMag = Math.sqrt(numRe * numRe + numIm * numIm);
      const denMag = Math.sqrt(denRe * denRe + denIm * denIm);
      const magDb = 20 * Math.log10(numMag / (denMag || 1e-30));

      const numPhase = Math.atan2(numIm, numRe);
      const denPhase = Math.atan2(denIm, denRe);
      const phaseDeg = (numPhase - denPhase) * (180 / Math.PI);

      if (!isNaN(prevMagDb) && gcLog === null) {
        if ((prevMagDb > 0 && magDb <= 0) || (prevMagDb < 0 && magDb >= 0)) {
          const t = Math.abs(prevMagDb) / (Math.abs(prevMagDb) + Math.abs(magDb) + 1e-30);
          gcLog = parseFloat((prevExp + t * (exp - prevExp)).toFixed(2));
          pmDeg = 180 + (prevPhase + t * (phaseDeg - prevPhase));
        }
      }

      if (!isNaN(prevPhase) && pcLog === null) {
        if ((prevPhase > -180 && phaseDeg <= -180) || (prevPhase < -180 && phaseDeg >= -180)) {
          const t = Math.abs(prevPhase + 180) / (Math.abs(prevPhase + 180) + Math.abs(phaseDeg + 180) + 1e-30);
          pcLog = parseFloat((prevExp + t * (exp - prevExp)).toFixed(2));
          const magAtPc = prevMagDb + t * (magDb - prevMagDb);
          gmDb = -magAtPc;
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
    return { data: points, margins: { gcLog, pcLog, gmDb, pmDeg } };
  }, [result]);

  const { gcLog, pcLog, gmDb, pmDeg } = margins;

  return (
    <div className="space-y-1">
      <div className="flex gap-3 px-2 py-1 text-[9px] font-mono text-muted-foreground">
        <span>GM: <span className={gmDb !== Infinity ? (gmDb > 0 ? "text-green-400" : "text-destructive") : ""}>{gmDb === Infinity ? "∞" : `${gmDb.toFixed(1)} dB`}</span></span>
        <span>PM: <span className={pmDeg !== Infinity ? (pmDeg > 0 ? "text-green-400" : "text-destructive") : ""}>{pmDeg === Infinity ? "∞" : `${pmDeg.toFixed(1)}°`}</span></span>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="wLog" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} hide />
          <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} label={{ value: "dB", angle: -90, position: "insideLeft", fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
          <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 10, fontFamily: "monospace" }} />
          <ReferenceLine y={0} stroke="hsl(var(--warning))" strokeDasharray="5 3" />
          {pcLog !== null && <ReferenceLine x={pcLog} stroke="hsl(var(--destructive))" strokeDasharray="6 3" strokeWidth={1.5} label={{ value: `GM=${gmDb.toFixed(1)}dB`, position: "top", fontSize: 8, fill: "hsl(var(--destructive))" }} />}
          {gcLog !== null && <ReferenceLine x={gcLog} stroke="hsl(var(--primary))" strokeDasharray="6 3" strokeWidth={1} />}
          <Line type="monotone" dataKey="mag" stroke="hsl(var(--accent))" strokeWidth={1.5} dot={false} name="|G(jω)| dB" />
        </LineChart>
      </ResponsiveContainer>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data} margin={{ top: 0, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="wLog" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} label={{ value: "log₁₀(ω)", position: "insideBottomRight", offset: -5, fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
          <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} label={{ value: "deg", angle: -90, position: "insideLeft", fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
          <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 10, fontFamily: "monospace" }} />
          <ReferenceLine y={-180} stroke="hsl(var(--destructive))" strokeDasharray="5 3" />
          {gcLog !== null && <ReferenceLine x={gcLog} stroke="hsl(var(--primary))" strokeDasharray="6 3" strokeWidth={1.5} label={{ value: `PM=${pmDeg.toFixed(1)}°`, position: "top", fontSize: 8, fill: "hsl(var(--primary))" }} />}
          {pcLog !== null && <ReferenceLine x={pcLog} stroke="hsl(var(--destructive))" strokeDasharray="6 3" strokeWidth={1} />}
          <Line type="monotone" dataKey="phase" stroke="hsl(var(--primary))" strokeWidth={1.5} dot={false} name="∠G(jω) °" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Nyquist Plot (SVG) ──────────────────────────────────────────────────────

function NyquistPlot({ result }: { result: SolverResult }) {
  const points = useMemo(() => {
    const { num, den } = result.equivalentTF;
    const pts: { re: number; im: number }[] = [];

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
        pts.push({ re: gRe, im: gIm });
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

      {/* Legend */}
      <g transform={`translate(8, ${H - 20})`}>
        <line x1={0} y1={3} x2={12} y2={3} stroke="hsl(var(--accent))" strokeWidth={1.5} />
        <text x={16} y={6} fill="hsl(var(--muted-foreground))" fontSize={7} fontFamily="monospace">G(jω)</text>
        <circle cx={55} cy={3} r={3} fill="hsl(var(--destructive) / 0.3)" stroke="hsl(var(--destructive))" strokeWidth={1} />
        <text x={62} y={6} fill="hsl(var(--muted-foreground))" fontSize={7} fontFamily="monospace">−1 crit.</text>
      </g>
    </svg>
  );
}

// ─── Root Locus Plot (SVG) ───────────────────────────────────────────────────

function RootLocusPlot({ result }: { result: SolverResult }) {
  const { loci, olPoles, olZeros } = useMemo(() => {
    const { num, den } = result.equivalentTF;
    // For root locus we need to find roots of den + K*num = 0 for varying K
    // Characteristic eq: 1 + K·G(s) = 0  →  den(s) + K·num(s) = 0

    const numC = [...num.coeffs];
    const denC = [...den.coeffs];
    const maxLen = Math.max(numC.length, denC.length);
    while (numC.length < maxLen) numC.push(0);
    while (denC.length < maxLen) denC.push(0);

    // Open-loop poles (K=0) and zeros
    const olp = roots(den);
    const olz = roots(num);

    // Sweep K from 0 to large value
    const kValues: number[] = [];
    // Log-spaced from 0.01 to 1000 + a few near zero
    for (let e = -2; e <= 3; e += 0.03) kValues.push(Math.pow(10, e));
    kValues.unshift(0.001, 0.005);

    const branches: Array<Array<{ re: number; im: number; k: number }>> = [];
    // Initialize branches from open-loop poles
    for (let i = 0; i < olp.length; i++) branches.push([]);

    for (const K of kValues) {
      // Build polynomial den + K*num
      const charCoeffs = denC.map((d, i) => d + K * numC[i]);
      // Trim trailing zeros
      while (charCoeffs.length > 1 && Math.abs(charCoeffs[charCoeffs.length - 1]) < 1e-15) charCoeffs.pop();

      const charPoly = { coeffs: charCoeffs };
      const rts = roots(charPoly);

      // Match roots to nearest branch (greedy assignment)
      const used = new Set<number>();
      const branchOrder: number[] = [];

      for (let b = 0; b < branches.length; b++) {
        const prev = branches[b].length > 0
          ? branches[b][branches[b].length - 1]
          : olp[b] || { re: 0, im: 0 };

        let bestIdx = -1, bestDist = Infinity;
        for (let r = 0; r < rts.length; r++) {
          if (used.has(r) || isNaN(rts[r].re)) continue;
          const dist = (rts[r].re - prev.re) ** 2 + (rts[r].im - prev.im) ** 2;
          if (dist < bestDist) { bestDist = dist; bestIdx = r; }
        }
        if (bestIdx >= 0) {
          used.add(bestIdx);
          branchOrder.push(bestIdx);
        }
      }

      branchOrder.forEach((ri, b) => {
        if (ri >= 0 && ri < rts.length) {
          branches[b].push({ re: rts[ri].re, im: rts[ri].im, k: K });
        }
      });
    }

    return { loci: branches, olPoles: olp, olZeros: olz };
  }, [result]);

  // Compute bounds
  const allPts = [
    ...olPoles, ...olZeros,
    ...loci.flatMap(b => b),
  ].filter(p => !isNaN(p.re) && Math.abs(p.re) < 100 && Math.abs(p.im) < 100);

  if (allPts.length < 2) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground font-mono">
        Insufficient data for root locus
      </div>
    );
  }

  const reVals = allPts.map(p => p.re);
  const imVals = allPts.map(p => p.im);
  const margin = 0.5;
  const maxAbs = Math.max(
    Math.max(...reVals.map(Math.abs), ...imVals.map(Math.abs)),
    0.5
  ) + margin;

  const W = 280, H = 280;
  const cx = W / 2, cy = H / 2;
  const scale = (W / 2 - 20) / maxAbs;

  const toX = (re: number) => cx + re * scale;
  const toY = (im: number) => cy - im * scale;

  // Colors for branches
  const branchColors = [
    "hsl(var(--primary))",
    "hsl(var(--accent))",
    "hsl(160, 70%, 50%)",
    "hsl(30, 80%, 55%)",
    "hsl(280, 60%, 55%)",
    "hsl(350, 70%, 55%)",
  ];

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} className="max-w-[280px] mx-auto">
      {/* Axes */}
      <line x1={0} y1={cy} x2={W} y2={cy} stroke="hsl(var(--border))" strokeWidth={1} />
      <line x1={cx} y1={0} x2={cx} y2={H} stroke="hsl(var(--border))" strokeWidth={1} />
      <text x={W - 10} y={cy - 4} fill="hsl(var(--muted-foreground))" fontSize={8} fontFamily="monospace">Re</text>
      <text x={cx + 4} y={10} fill="hsl(var(--muted-foreground))" fontSize={8} fontFamily="monospace">Im</text>

      {/* LHP shading */}
      <rect x={0} y={0} width={cx} height={H} fill="hsl(var(--primary) / 0.03)" />

      {/* jω axis label */}
      <line x1={cx} y1={0} x2={cx} y2={H} stroke="hsl(var(--border))" strokeWidth={0.5} strokeDasharray="4 2" />

      {/* Root locus branches */}
      {loci.map((branch, b) => {
        if (branch.length < 2) return null;
        const color = branchColors[b % branchColors.length];
        const d = branch
          .filter(p => Math.abs(p.re) < maxAbs * 1.5 && Math.abs(p.im) < maxAbs * 1.5)
          .map((p, i) => `${i === 0 ? "M" : "L"}${toX(p.re).toFixed(1)},${toY(p.im).toFixed(1)}`)
          .join(" ");
        return <path key={b} d={d} fill="none" stroke={color} strokeWidth={1.5} opacity={0.8} />;
      })}

      {/* Open-loop poles (×) */}
      {olPoles.filter(p => !isNaN(p.re)).map((p, i) => {
        const x = toX(p.re), y = toY(p.im);
        return (
          <g key={`p${i}`}>
            <line x1={x - 5} y1={y - 5} x2={x + 5} y2={y + 5} stroke="hsl(var(--destructive))" strokeWidth={2} />
            <line x1={x - 5} y1={y + 5} x2={x + 5} y2={y - 5} stroke="hsl(var(--destructive))" strokeWidth={2} />
          </g>
        );
      })}

      {/* Open-loop zeros (○) */}
      {olZeros.filter(z => !isNaN(z.re)).map((z, i) => {
        const x = toX(z.re), y = toY(z.im);
        return (
          <circle key={`z${i}`} cx={x} cy={y} r={5}
            fill="none" stroke="hsl(var(--accent))" strokeWidth={2} />
        );
      })}

      {/* Direction arrows on branches */}
      {loci.map((branch, b) => {
        if (branch.length < 10) return null;
        const mid = Math.floor(branch.length / 3);
        const p0 = branch[mid], p1 = branch[mid + 1];
        if (!p0 || !p1) return null;
        const ax = toX(p0.re), ay = toY(p0.im);
        const dx = toX(p1.re) - ax, dy = toY(p1.im) - ay;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1) return null;
        const ux = dx / len, uy = dy / len;
        return (
          <polygon key={`a${b}`}
            points={`${ax + ux * 6},${ay + uy * 6} ${ax - uy * 3},${ay + ux * 3} ${ax + uy * 3},${ay - ux * 3}`}
            fill={branchColors[b % branchColors.length]}
          />
        );
      })}

      {/* Legend */}
      <g transform={`translate(6, ${H - 20})`}>
        <line x1={0} y1={0} x2={6} y2={6} stroke="hsl(var(--destructive))" strokeWidth={1.5} />
        <line x1={6} y1={0} x2={0} y2={6} stroke="hsl(var(--destructive))" strokeWidth={1.5} />
        <text x={10} y={6} fill="hsl(var(--muted-foreground))" fontSize={7} fontFamily="monospace">OL Poles</text>
        <circle cx={60} cy={3} r={3} fill="none" stroke="hsl(var(--accent))" strokeWidth={1.5} />
        <text x={66} y={6} fill="hsl(var(--muted-foreground))" fontSize={7} fontFamily="monospace">OL Zeros</text>
        <text x={110} y={6} fill="hsl(var(--muted-foreground))" fontSize={7} fontFamily="monospace">K: 0→∞</text>
      </g>
    </svg>
  );
}

// ─── Combined Panel ──────────────────────────────────────────────────────────

type PlotTab = "pzmap" | "step" | "bode" | "nyquist" | "rlocus";

export function AnalysisPlots({ result }: { result: SolverResult }) {
  const [tab, setTab] = React.useState<PlotTab>("pzmap");

  const tabs: { id: PlotTab; label: string }[] = [
    { id: "pzmap", label: "P-Z" },
    { id: "step", label: "Step" },
    { id: "bode", label: "Bode" },
    { id: "nyquist", label: "Nyquist" },
    { id: "rlocus", label: "R.Locus" },
  ];

  return (
    <div className="panel-section overflow-hidden">
      <div className="flex border-b border-border">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2 text-[10px] font-semibold tracking-wide uppercase transition-all ${
              tab === t.id
                ? "text-primary border-b-2 border-primary bg-primary/5"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="p-3 min-h-[220px]">
        {tab === "pzmap" && <PoleZeroMap result={result} />}
        {tab === "step" && <StepResponsePlot result={result} />}
        {tab === "bode" && <BodePlot result={result} />}
        {tab === "nyquist" && <NyquistPlot result={result} />}
        {tab === "rlocus" && <RootLocusPlot result={result} />}
      </div>
    </div>
  );
}
