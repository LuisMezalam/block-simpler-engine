/**
 * Gain Margin & Phase Margin Computation
 * =======================================
 * Computes frequency-domain stability margins from a transfer function's
 * polynomial representation.
 *
 * - Gain Margin (GM): measured at the phase crossover frequency ω_pc
 *   where ∠G(jω) = -180°. GM = -20·log₁₀|G(jω_pc)| dB.
 *
 * - Phase Margin (PM): measured at the gain crossover frequency ω_gc
 *   where |G(jω)| = 1 (0 dB). PM = 180° + ∠G(jω_gc).
 *
 * Reference: Ogata §8-2, Nise §10.7, Franklin §6.3
 */

import type { Poly } from "./polynomial";

export interface StabilityMargins {
  /** Gain margin in dB (positive = stable). Infinity if no phase crossover. */
  gainMarginDb: number;
  /** Phase crossover frequency (rad/s) where phase = -180° */
  phaseCrossoverFreq: number | null;
  /** Phase margin in degrees (positive = stable). Infinity if no gain crossover. */
  phaseMarginDeg: number;
  /** Gain crossover frequency (rad/s) where |G(jω)| = 0 dB */
  gainCrossoverFreq: number | null;
}

/** Evaluate polynomial at s = jω, returning {re, im} */
function evalPolyJw(p: Poly, w: number): { re: number; im: number } {
  let re = 0, im = 0;
  for (let k = 0; k < p.coeffs.length; k++) {
    const c = p.coeffs[k];
    const wk = Math.pow(w, k);
    switch (k % 4) {
      case 0: re += c * wk; break;
      case 1: im += c * wk; break;
      case 2: re -= c * wk; break;
      case 3: im -= c * wk; break;
    }
  }
  return { re, im };
}

/** Compute |G(jω)| and ∠G(jω) in degrees */
function evalTfAtFreq(
  num: Poly,
  den: Poly,
  w: number
): { mag: number; phaseDeg: number } {
  const n = evalPolyJw(num, w);
  const d = evalPolyJw(den, w);

  // G(jω) = (n.re + j·n.im) / (d.re + j·d.im)
  const dMagSq = d.re * d.re + d.im * d.im;
  if (dMagSq < 1e-30) return { mag: Infinity, phaseDeg: 0 };

  const gRe = (n.re * d.re + n.im * d.im) / dMagSq;
  const gIm = (n.im * d.re - n.re * d.im) / dMagSq;

  const mag = Math.sqrt(gRe * gRe + gIm * gIm);
  const phaseDeg = Math.atan2(gIm, gRe) * (180 / Math.PI);

  return { mag, phaseDeg };
}

/**
 * Compute gain margin and phase margin for a transfer function.
 * Sweeps frequency from 10^-3 to 10^4 rad/s.
 */
export function computeMargins(num: Poly, den: Poly): StabilityMargins {
  const freqs: number[] = [];
  for (let exp = -3; exp <= 4; exp += 0.005) {
    freqs.push(Math.pow(10, exp));
  }

  let gainCrossoverFreq: number | null = null;
  let phaseCrossoverFreq: number | null = null;
  let phaseMarginDeg = Infinity;
  let gainMarginDb = Infinity;

  let prevMagDb = NaN;
  let prevPhase = NaN;

  for (const w of freqs) {
    const { mag, phaseDeg } = evalTfAtFreq(num, den, w);
    const magDb = 20 * Math.log10(mag || 1e-30);

    // Unwrap phase for crossover detection — use raw phase
    // Phase crossover: phase crosses -180° (look for crossing from above or below)
    if (!isNaN(prevPhase)) {
      // Gain crossover: |G| crosses 0 dB (mag crosses 1)
      if ((prevMagDb > 0 && magDb <= 0) || (prevMagDb < 0 && magDb >= 0)) {
        // Linear interpolation for crossover frequency
        const t = Math.abs(prevMagDb) / (Math.abs(prevMagDb) + Math.abs(magDb) + 1e-30);
        const wGc = freqs[freqs.indexOf(w) - 1] * (1 - t) + w * t;
        const atGc = evalTfAtFreq(num, den, wGc);

        if (gainCrossoverFreq === null) {
          gainCrossoverFreq = wGc;
          phaseMarginDeg = 180 + atGc.phaseDeg;
        }
      }

      // Phase crossover: phase crosses -180°
      // Handle wrap: check if phase transitions through -180
      const crossed180 =
        (prevPhase > -180 && phaseDeg <= -180) ||
        (prevPhase < -180 && phaseDeg >= -180);

      if (crossed180) {
        const t = Math.abs(prevPhase + 180) / (Math.abs(prevPhase + 180) + Math.abs(phaseDeg + 180) + 1e-30);
        const wPc = freqs[freqs.indexOf(w) - 1] * (1 - t) + w * t;
        const atPc = evalTfAtFreq(num, den, wPc);
        const gmDb = -20 * Math.log10(atPc.mag || 1e-30);

        if (phaseCrossoverFreq === null) {
          phaseCrossoverFreq = wPc;
          gainMarginDb = gmDb;
        }
      }
    }

    prevMagDb = magDb;
    prevPhase = phaseDeg;
  }

  return {
    gainMarginDb,
    phaseCrossoverFreq,
    phaseMarginDeg,
    gainCrossoverFreq,
  };
}
