/*
 * Thermal comfort models.
 *  - PMV / PPD per ISO 7730 (Fanger), as used in ASHRAE Standard 55.
 *  - Adaptive comfort model per ASHRAE Standard 55.
 */
((global) => {
  'use strict';

  /**
   * @param {number} ta  air temperature (°C)
   * @param {number} tr  mean radiant temperature (°C)
   * @param {number} vel relative air velocity (m/s)
   * @param {number} pa  partial water vapour pressure (Pa)
   * @param {number} met metabolic rate (met)
   * @param {number} clo clothing insulation (clo)
   */
  const pmv = (ta, tr, vel, pa, met, clo) => {
    const icl = 0.155 * clo;
    const m = met * 58.15;
    const mw = m;
    const fcl = icl <= 0.078 ? 1 + 1.29 * icl : 1.05 + 0.645 * icl;
    const hcf = 12.1 * Math.sqrt(vel);
    const taa = ta + 273;
    const tra = tr + 273;
    const tcla = taa + (35.5 - ta) / (3.5 * icl + 0.1);

    const p1 = icl * fcl;
    const p2 = p1 * 3.96;
    const p3 = p1 * 100;
    const p4 = p1 * taa;
    const p5 = 308.7 - 0.028 * mw + p2 * Math.pow(tra / 100, 4);
    let xn = tcla / 100;
    let xf = tcla / 50;
    let hc = hcf;
    let n = 0;

    while (Math.abs(xn - xf) > 0.00015) {
      xf = (xf + xn) / 2;
      const hcn = 2.38 * Math.pow(Math.abs(100 * xf - taa), 0.25);
      hc = hcf > hcn ? hcf : hcn;
      xn = (p5 + p4 * hc - p2 * Math.pow(xf, 4)) / (100 + p3 * hc);
      if (++n > 150) return { pmv: NaN, ppd: NaN };
    }

    const tcl = 100 * xn - 273;
    const hl1 = 3.05 * 0.001 * (5733 - 6.99 * mw - pa);
    const hl2 = mw > 58.15 ? 0.42 * (mw - 58.15) : 0;
    const hl3 = 1.7 * 0.00001 * m * (5867 - pa);
    const hl4 = 0.0014 * m * (34 - ta);
    const hl5 = 3.96 * fcl * (Math.pow(xn, 4) - Math.pow(tra / 100, 4));
    const hl6 = fcl * hc * (tcl - ta);
    const ts = 0.303 * Math.exp(-0.036 * m) + 0.028;
    const value = ts * (mw - hl1 - hl2 - hl3 - hl4 - hl5 - hl6);
    const ppd = 100 - 95 * Math.exp(-0.03353 * Math.pow(value, 4) - 0.2179 * Math.pow(value, 2));
    return { pmv: value, ppd: ppd };
  };

  const adaptive = (meanOutdoor) => {
    const applicable = meanOutdoor >= 10 && meanOutdoor <= 33.5;
    const t = Math.min(Math.max(meanOutdoor, 10), 33.5);
    const neutral = 0.31 * t + 17.8;
    return {
      applicable: applicable,
      neutral: neutral,
      limits80: [neutral - 3.5, neutral + 3.5],
      limits90: [neutral - 2.5, neutral + 2.5]
    };
  };

  /**
   * Estimate clothing level from 6am outdoor temperature (Schiavon & Lee, 2013).
   */
  const cloFromOutdoor6am = (t6) => {
    if (t6 < -5) return 1.0;
    if (t6 < 5) return 0.818 - 0.0364 * t6;
    if (t6 < 26) return Math.pow(10, -0.1635 - 0.0066 * t6);
    return 0.46;
  };

  const sensationLabel = (value) => {
    if (!Number.isFinite(value)) return '—';
    if (value <= -2.5) return 'Cold';
    if (value <= -1.5) return 'Cool';
    if (value <= -0.5) return 'Slightly cool';
    if (value < 0.5) return 'Neutral';
    if (value < 1.5) return 'Slightly warm';
    if (value < 2.5) return 'Warm';
    return 'Hot';
  };

  global.Comfort = {
    pmv: pmv,
    adaptive: adaptive,
    cloFromOutdoor6am: cloFromOutdoor6am,
    sensationLabel: sensationLabel
  };
})(window);
