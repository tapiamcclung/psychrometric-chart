/*
 * Thermal comfort models.
 *  - PMV / PPD per ISO 7730 (Fanger), as used in ASHRAE Standard 55.
 *  - Adaptive comfort model per ASHRAE Standard 55.
 */
(function (global) {
  'use strict';

  /**
   * @param {number} ta  air temperature (°C)
   * @param {number} tr  mean radiant temperature (°C)
   * @param {number} vel relative air velocity (m/s)
   * @param {number} pa  partial water vapour pressure (Pa)
   * @param {number} met metabolic rate (met)
   * @param {number} clo clothing insulation (clo)
   */
  function pmv(ta, tr, vel, pa, met, clo) {
    var icl = 0.155 * clo;
    var m = met * 58.15;
    var mw = m;
    var fcl = icl <= 0.078 ? 1 + 1.29 * icl : 1.05 + 0.645 * icl;
    var hcf = 12.1 * Math.sqrt(vel);
    var taa = ta + 273;
    var tra = tr + 273;
    var tcla = taa + (35.5 - ta) / (3.5 * icl + 0.1);

    var p1 = icl * fcl;
    var p2 = p1 * 3.96;
    var p3 = p1 * 100;
    var p4 = p1 * taa;
    var p5 = 308.7 - 0.028 * mw + p2 * Math.pow(tra / 100, 4);
    var xn = tcla / 100;
    var xf = tcla / 50;
    var hc = hcf;
    var n = 0;

    while (Math.abs(xn - xf) > 0.00015) {
      xf = (xf + xn) / 2;
      var hcn = 2.38 * Math.pow(Math.abs(100 * xf - taa), 0.25);
      hc = hcf > hcn ? hcf : hcn;
      xn = (p5 + p4 * hc - p2 * Math.pow(xf, 4)) / (100 + p3 * hc);
      if (++n > 150) return { pmv: NaN, ppd: NaN };
    }

    var tcl = 100 * xn - 273;
    var hl1 = 3.05 * 0.001 * (5733 - 6.99 * mw - pa);
    var hl2 = mw > 58.15 ? 0.42 * (mw - 58.15) : 0;
    var hl3 = 1.7 * 0.00001 * m * (5867 - pa);
    var hl4 = 0.0014 * m * (34 - ta);
    var hl5 = 3.96 * fcl * (Math.pow(xn, 4) - Math.pow(tra / 100, 4));
    var hl6 = fcl * hc * (tcl - ta);
    var ts = 0.303 * Math.exp(-0.036 * m) + 0.028;
    var value = ts * (mw - hl1 - hl2 - hl3 - hl4 - hl5 - hl6);
    var ppd = 100 - 95 * Math.exp(-0.03353 * Math.pow(value, 4) - 0.2179 * Math.pow(value, 2));
    return { pmv: value, ppd: ppd };
  }

  function adaptive(meanOutdoor) {
    var applicable = meanOutdoor >= 10 && meanOutdoor <= 33.5;
    var t = Math.min(Math.max(meanOutdoor, 10), 33.5);
    var neutral = 0.31 * t + 17.8;
    return {
      applicable: applicable,
      neutral: neutral,
      limits80: [neutral - 3.5, neutral + 3.5],
      limits90: [neutral - 2.5, neutral + 2.5]
    };
  }

  /**
   * Estimate clothing level from 6am outdoor temperature (Schiavon & Lee, 2013).
   */
  function cloFromOutdoor6am(t6) {
    if (t6 < -5) return 1.0;
    if (t6 < 5) return 0.818 - 0.0364 * t6;
    if (t6 < 26) return Math.pow(10, -0.1635 - 0.0066 * t6);
    return 0.46;
  }

  function sensationLabel(value) {
    if (!Number.isFinite(value)) return '—';
    if (value <= -2.5) return 'Cold';
    if (value <= -1.5) return 'Cool';
    if (value <= -0.5) return 'Slightly cool';
    if (value < 0.5) return 'Neutral';
    if (value < 1.5) return 'Slightly warm';
    if (value < 2.5) return 'Warm';
    return 'Hot';
  }

  global.Comfort = {
    pmv: pmv,
    adaptive: adaptive,
    cloFromOutdoor6am: cloFromOutdoor6am,
    sensationLabel: sensationLabel
  };
})(window);
