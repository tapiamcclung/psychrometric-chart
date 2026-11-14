(() => {
  'use strict';

  const t = (key, vars) => I18n.t(key, vars);
  const lowerEs = (s) => (I18n.lang === 'es' ? s.toLowerCase() : s); // Spanish names mid-sentence are lower case

  const P = window.Psychro;
  const C = window.Comfort;
  const G = window.Givoni;

  const $ = (id) => document.getElementById(id);

  const COLORS = {
    page: '#ffffff',
    invalid: '#f1f2ee',
    ink: '#1b2430',
    muted: '#5b6670',
    major: '#a7afb7',
    minor: '#d6dadd',
    saturation: '#1b2430',
    accent: '#0f766e',
    accentRgb: '15,118,110',
    dataRgb: '217,119,6',
    point: '#be123c'
  };

  const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const FAMILIES = [
    { id: 'dbt', name: 'Dry-bulb temp.', unit: '°C', show: true },
    { id: 'w', name: 'Humidity ratio', unit: 'g/kg', show: true },
    { id: 'rh', name: 'Relative humidity', unit: '%', show: true },
    // color tints the lines, tick labels and axis title; axis.where: 'sat' = the title follows the saturation curve (pref = preferred spot, 0-1 along it), 'outside' = title in its own lane outside the chart
    { id: 'wbt', name: 'Wet-bulb temp.', unit: '°C', show: false, color: '#1d4ed8', title: 'Wet-bulb temperature (°C)', axis: { where: 'sat', pref: 0.3 } },
    { id: 'pv', name: 'Vapour pressure', unit: 'kPa', show: false, color: '#7e22ce', title: 'Vapour pressure (kPa)', axis: { where: 'outside' } },
    { id: 'v', name: 'Specific volume', unit: 'm³/kg', show: false, color: '#4d7c0f', title: 'Specific volume (m³/kg dry air)', axis: { where: 'outside' } },
    { id: 'h', name: 'Enthalpy', unit: 'kJ/kg', show: false, color: '#9a3412', title: 'Enthalpy (kJ/kg dry air)', axis: { where: 'sat', pref: 0.7 } }
  ];

  const famShown = (id) => FAMILIES.some((f) => f.id === id && f.show);
  const famById = (id) => FAMILIES.find((f) => f.id === id);
  const tint = (hex, a) => 'rgba(' + parseInt(hex.slice(1, 3), 16) + ',' + parseInt(hex.slice(3, 5), 16) + ',' + parseInt(hex.slice(5, 7), 16) + ',' + a + ')';

  const state = {
    tMin: 0,
    tMax: 50,
    wMax: 35,
    pressure: 101325,
    morph: 0,
    morphTarget: 0,
    indicator: { t: 22, w: 0 },
    points: [],
    selected: -1,
    highlight: null,
    comfort: 'pmv',
    met: 1.1,
    clo: 0.5,
    vel: 0.1,
    mrtOffset: 0,
    tOut: 20,
    tOutAuto: false,
    data: null,
    station: null,
    month: 0,
    showData: true,
    title: I18n.t('Psychrometric Chart'),
    subtitle: ''
  };

  state.indicator.w = P.wFromRh(22, 0.5, state.pressure);

  const canvas = $('chart');
  const ctx = canvas.getContext('2d');
  const size = { w: 0, h: 0, dpr: 1 };
  const plot = { x0: 0, y0: 0, x1: 0, y1: 0 };
  const cache = { valid: [], comfort: [], bins: null, binMax: 0, stats: null };
  const labelBoxes = []; // boxes of the tick labels drawn this frame, so axis titles can keep clear of them
  let renderQueued = false;
  let drag = null;

  /* ---------------------------------------------------------------- */
  /* Coordinate mapping                                                */
  /* ---------------------------------------------------------------- */

  const computeLayout = () => {
    const narrow = size.w < 560;
    plot.x0 = narrow ? 44 : 64;
    plot.x1 = size.w - (narrow ? 44 : 64);
    plot.y0 = 64;
    plot.y1 = size.h - 52;
  };

  const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;

  const yFraction = (t, w) => {
    const psy = (w * 1000) / state.wMax;
    if (state.morph === 0) return psy;
    const rh = clamp(P.rhFromW(t, w, state.pressure), 0, 1.05);
    return psy * (1 - state.morph) + rh * state.morph;
  };

  const toScreen = (t, w) => {
    const x = plot.x0 + ((t - state.tMin) / (state.tMax - state.tMin)) * (plot.x1 - plot.x0);
    const y = plot.y1 - yFraction(t, w) * (plot.y1 - plot.y0);
    return [x, y];
  };

  /* Highest humidity ratio that is both physically possible and inside the top of the plot. */
  const wTopAt = (t) => {
    const ws = P.wSat(t, state.pressure);
    if (yFraction(t, ws) <= 1) return ws;
    let lo = 0;
    let hi = ws;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (yFraction(t, mid) <= 1) lo = mid;
      else hi = mid;
    }
    return lo;
  };

  const fromScreen = (x, y) => {
    let t = state.tMin + ((x - plot.x0) / (plot.x1 - plot.x0)) * (state.tMax - state.tMin);
    t = clamp(t, state.tMin, state.tMax);
    const target = clamp((plot.y1 - y) / (plot.y1 - plot.y0), 0, 1);
    const wTop = wTopAt(t);
    if (target <= 0) return { t: t, w: 0 };
    if (target >= yFraction(t, wTop)) return { t: t, w: wTop };
    let lo = 0;
    let hi = wTop;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (yFraction(t, mid) < target) lo = mid;
      else hi = mid;
    }
    return { t: t, w: (lo + hi) / 2 };
  };

  const densify = (pts, maxDt, maxDw) => {
    maxDt = maxDt || 0.25;
    maxDw = maxDw || 0.0004;
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      if (i > 0) {
        const a = pts[i - 1];
        const b = pts[i];
        const n = Math.ceil(Math.max(Math.abs(b[0] - a[0]) / maxDt, Math.abs(b[1] - a[1]) / maxDw));
        for (let k = 1; k < n; k++) {
          const f = k / n;
          out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
        }
      }
      out.push(pts[i]);
    }
    return out;
  };

  const insidePlot = (p, pad) => {
    pad = pad || 0.5;
    return p[0] >= plot.x0 - pad && p[0] <= plot.x1 + pad && p[1] >= plot.y0 - pad && p[1] <= plot.y1 + pad;
  };

  /* ---------------------------------------------------------------- */
  /* Line family construction                                          */
  /* ---------------------------------------------------------------- */

  const sampleCurve = (fn, tStart) => {
    const p = state.pressure;
    const segments = [];
    const t0 = Math.max(state.tMin, tStart === undefined ? state.tMin : tStart);
    const t1 = state.tMax;
    if (t0 >= t1) return segments;

    const valid = (t) => {
      const w = fn(t);
      return Number.isFinite(w) && w >= -1e-12 && w <= P.wSat(t, p) * (1 + 1e-9);
    };

    const boundary = (ta, tb) => {
      const va = valid(ta);
      let a = ta;
      let b = tb;
      for (let i = 0; i < 30; i++) {
        const m = (a + b) / 2;
        if (valid(m) === va) a = m;
        else b = m;
      }
      const t = va ? a : b;
      return [t, clamp(fn(t), 0, P.wSat(t, p))];
    };

    const step = 0.25;
    const n = Math.ceil((t1 - t0) / step);
    let current = null;
    let prevT = null;
    let prevValid = false;
    for (let i = 0; i <= n; i++) {
      const t = Math.min(t0 + i * step, t1);
      const v = valid(t);
      if (v) {
        if (!current) {
          current = [];
          if (prevT !== null && !prevValid) current.push(boundary(prevT, t));
        }
        current.push([t, fn(t)]);
      } else if (current) {
        current.push(boundary(prevT, t));
        if (current.length > 1) segments.push(current);
        current = null;
      }
      prevT = t;
      prevValid = v;
    }
    if (current && current.length > 1) segments.push(current);
    return segments;
  };

  const addLines = (family, value, segments, major, label, anchor) => {
    segments.forEach((pts, idx) => {
      family.lines.push({
        value: value,
        pts: pts,
        major: major,
        label: idx === 0 ? label : null,
        anchor: anchor
      });
    });
  };

  const buildFamilies = () => {
    const p = state.pressure;
    const fam = {};
    FAMILIES.forEach((f) => {
      f.lines = [];
      fam[f.id] = f;
    });

    for (let t = Math.ceil(state.tMin); t <= Math.floor(state.tMax); t++) {
      fam.dbt.lines.push({ value: t, pts: [[t, 0], [t, P.wSat(t, p)]], major: t % 5 === 0, label: null });
    }

    for (let r = 10; r <= 100; r += 10) {
      ((rh) => {
        addLines(fam.rh, rh, sampleCurve((tt) => P.wFromRh(tt, rh / 100, p)), true, rh + '%', 'rh');
      })(r);
    }

    const labelEvery = state.wMax > 32 ? 5 : state.wMax > 16 ? 2 : 1;
    for (let g = 1; g <= state.wMax; g++) {
      ((gw) => {
        addLines(fam.w, gw, sampleCurve(() => gw / 1000), gw % 5 === 0, gw % labelEvery === 0 ? String(gw) : null, 'right');
      })(g);
    }

    for (let twb = Math.ceil(state.tMin); twb <= state.tMax; twb++) {
      ((tw) => {
        const major = tw % 5 === 0;
        addLines(fam.wbt, tw, sampleCurve((tt) => P.wFromWetBulb(tt, tw, p), tw), major, major ? tw + '°' : null, 'start');
      })(twb);
    }

    const pvMax = P.saturationPressure(state.tMax) / 1000;
    for (let pv = 0.5; pv <= pvMax; pv += 0.5) {
      ((kpa) => {
        const major = Math.abs(kpa - Math.round(kpa)) < 1e-6;
        addLines(fam.pv, kpa, sampleCurve(() => P.wFromPw(kpa * 1000, p)), major, major ? kpa.toFixed(1) + ' kPa' : null, 'endInside');
      })(pv);
    }

    // from the lowest volume in the chart (bottom-left) to the highest (top-right corner), so the range follows pressure and axis limits
    const vLo = Math.floor(P.specificVolume(state.tMin, 0, p) * 100);
    const vHi = Math.ceil(P.specificVolume(state.tMax, Math.min(P.wSat(state.tMax, p), state.wMax / 1000), p) * 100);
    for (let vi = vLo; vi <= vHi; vi++) {
      ((vv) => {
        const v = vv / 100;
        const major = vv % 5 === 0;
        addLines(fam.v, v, sampleCurve((tt) => P.wFromSpecificVolume(tt, v, p)), major, vv % 2 === 0 ? v.toFixed(2) : null, 'end');
      })(vi);
    }

    for (let h = -20; h <= 250; h += 5) {
      ((hh) => {
        const major = hh % 10 === 0;
        addLines(fam.h, hh, sampleCurve((tt) => P.wFromEnthalpy(tt, hh)), major, major ? String(hh) : null, 'start');
      })(h);
    }

    const sat = [];
    for (let ts = state.tMin; ts <= state.tMax + 1e-9; ts += 0.25) sat.push([ts, P.wSat(ts, p)]);
    cache.saturation = sat;
    cache.valid = sat.concat([[state.tMax, 0], [state.tMin, 0]]);
  };

  /* ---------------------------------------------------------------- */
  /* Comfort zones                                                     */
  /* ---------------------------------------------------------------- */

  const pmvAt = (t, w) => C.pmv(t, t + state.mrtOffset, state.vel, P.pwFromW(w, state.pressure), state.met, state.clo);

  const solveT = (w, target) => {
    let lo = -10;
    let hi = 50;
    const pa = P.pwFromW(w, state.pressure);
    const f = (t) => C.pmv(t, t + state.mrtOffset, state.vel, pa, state.met, state.clo).pmv;
    if (f(lo) > target) return lo;
    if (f(hi) < target) return hi;
    for (let i = 0; i < 36; i++) {
      const m = (lo + hi) / 2;
      const v = f(m);
      if (!Number.isFinite(v) || v < target) lo = m;
      else hi = m;
    }
    return (lo + hi) / 2;
  };

  const saturationBetween = (tFrom, tTo) => {
    const out = [];
    const step = tFrom < tTo ? 0.25 : -0.25;
    for (let t = tFrom; step > 0 ? t <= tTo : t >= tTo; t += step) out.push([t, P.wSat(t, state.pressure)]);
    out.push([tTo, P.wSat(tTo, state.pressure)]);
    return out;
  };

  const bandPolygon = (lo, hi) => {
    lo = Math.max(lo, state.tMin);
    hi = Math.min(hi, state.tMax);
    if (hi <= lo) return null;
    return [[lo, 0], [hi, 0]].concat(saturationBetween(hi, lo));
  };

  const buildComfort = () => {
    syncTout();
    const zones = [];
    let note = '';
    if (state.comfort === 'pmv') {
      [0.7, 0.5, 0.2].forEach((level, idx) => {
        const left = [];
        const right = [];
        const rows = 90;
        const wTop = state.wMax / 1000;
        for (let i = 0; i <= rows; i++) {
          const w = (wTop * i) / rows;
          const tLo = solveT(w, -level);
          const tHi = solveT(w, level);
          const lo = Math.max(tLo, P.dewPoint(tHi, w, state.pressure));
          if (!(lo < tHi)) {
            if (left.length) break;
            continue;
          }
          left.push([lo, w]);
          right.push([tHi, w]);
        }
        if (left.length > 1) {
          zones.push({
            poly: left.concat(right.reverse()),
            alpha: [0.12, 0.2, 0.28][idx],
            label: ['Cat. III ±0.7', 'Cat. II ±0.5', 'Cat. I ±0.2'][idx]
          });
        }
      });
      note = t('Shaded bands show |PMV| ≤ 0.7, 0.5 and 0.2 (ISO 7730 categories III, II, I). Mean radiant temperature = air temperature + radiant offset.');
    } else if (state.comfort === 'adaptive') {
      const tOut = effectiveTOut();
      const a = C.adaptive(tOut);
      const z80 = bandPolygon(a.limits80[0], a.limits80[1]);
      const z90 = bandPolygon(a.limits90[0], a.limits90[1]);
      if (z80) zones.push({ poly: z80, alpha: 0.16, label: t('80% acceptability') });
      if (z90) zones.push({ poly: z90, alpha: 0.24, label: t('90% acceptability') });
      note =
        t('Neutral operative temperature {neutral} °C for a mean outdoor temperature of {tout} °C.', { neutral: a.neutral.toFixed(1), tout: tOut.toFixed(1) }) +
        (a.applicable ? '' : ' ' + t('Outside the 10–33.5 °C range of applicability, limits are clamped.'));
    } else if (state.comfort === 'givoni') {
      G.setMeanOutdoor(effectiveTOut());
      G.zones.forEach((gz) => {
        if (!gz.show) return;
        const poly = G.polygon(gz, state.pressure);
        // Keep corners inside the chart: at low pressure (altitude) the saturation curve rises above the top edge.
        const wCap = state.wMax / 1000;
        if (poly) zones.push({ poly: poly.map((v) => [v[0], Math.min(v[1], wCap)]), zone: gz, label: t(gz.name) });
      });
      note = t('Building bioclimatic chart after Givoni (1998), developed-country limits. Areas outside every zone need active heating or air-conditioning. All zones shift with the mean outdoor temperature ({tout} °C here); limits are editable in js/givoni.js.', { tout: effectiveTOut().toFixed(1) });
    }
    cache.comfort = zones.map((z) => {
      if (z.zone) z.tail = densify([z.poly[z.poly.length - 1], z.poly[0]], 0.25, 0.0004);
      z.poly = densify(z.poly, 0.25, 0.0004);
      return z;
    });
    $('comfort-note').textContent = note;
  };

  const inComfort = (t, w) => {
    if (state.comfort === 'pmv') {
      return Math.abs(pmvAt(t, w).pmv) <= 0.5;
    }
    if (state.comfort === 'adaptive') {
      const a = C.adaptive(effectiveTOut());
      return t >= a.limits80[0] && t <= a.limits80[1];
    }
    if (state.comfort === 'givoni') {
      return G.contains(G.zones[G.zones.length - 1], t, w, state.pressure);
    }
    return false;
  };

  // When "From weather data" is on, show the mean temperature actually used in the text box.
  const syncTout = () => {
    if (state.tOutAuto && state.data) $('tout').value = effectiveTOut().toFixed(1);
  };

  const effectiveTOut = () => {
    if (state.tOutAuto && state.data) {
      const rows = filteredData();
      if (rows.length) {
        let sum = 0;
        for (let i = 0; i < rows.length; i++) sum += rows[i].t;
        return sum / rows.length;
      }
    }
    return state.tOut;
  };

  /* ---------------------------------------------------------------- */
  /* Weather data                                                      */
  /* ---------------------------------------------------------------- */

  const filteredData = () => {
    if (!state.data) return [];
    if (!state.month) return state.data;
    return state.data.filter((d) => d.month === state.month);
  };

  const RH_STEP = 2; // RH chart cells: 1 °C wide, 2 % RH tall

  const buildData = () => {
    syncTout();
    if (state.comfort === 'givoni') G.setMeanOutdoor(effectiveTOut());
    cache.bins = null;
    cache.rhBins = null;
    cache.stats = null;
    if (!state.data) return;
    const rows = filteredData();
    const bins = {};
    const rhBins = {};
    let rhMax = 0;
    let max = 0;
    let comfortHours = 0;
    const strategyHours = {};
    const p = state.pressure;
    for (let i = 0; i < rows.length; i++) {
      const d = rows[i];
      const w = P.wFromRh(d.t, d.rh, p);
      d.w = w;
      if (state.comfort === 'givoni') {
        G.classify(d.t, w, p).forEach((z) => {
          strategyHours[z.name] = (strategyHours[z.name] || 0) + 1;
        });
        if (strategyHours.Comfort && G.contains(G.zones[G.zones.length - 1], d.t, w, p)) comfortHours++;
      } else if (state.comfort !== 'none' && inComfort(d.t, w)) comfortHours++;
      const bx = Math.floor(d.t);
      const by = Math.floor(w * 1000);
      if (d.t >= state.tMin && d.t <= state.tMax) { // same data binned by RH for the RH chart
        const rkey = bx + ':' + Math.min(Math.floor((d.rh * 100) / RH_STEP), 100 / RH_STEP - 1);
        rhBins[rkey] = (rhBins[rkey] || 0) + 1;
        if (rhBins[rkey] > rhMax) rhMax = rhBins[rkey];
      }
      if (d.t < state.tMin || d.t > state.tMax || by >= state.wMax) continue;
      const key = bx + ':' + by;
      bins[key] = (bins[key] || 0) + 1;
      if (bins[key] > max) max = bins[key];
    }
    cache.bins = bins;
    cache.binMax = max;
    cache.rhBins = rhBins;
    cache.rhBinMax = rhMax;
    cache.stats = { total: rows.length, comfort: comfortHours };

    const period = state.month ? t(MONTHS[state.month]) : t('full year');
    let text = t('{n} hourly records ({period}). Darkest cell: {max} h.', { n: rows.length, period, max });
    const stats = $('data-stats');
    if (state.comfort === 'givoni' && rows.length) {
      stats.textContent = text + ' ' + t('Hours where each strategy is effective (zones overlap, so totals exceed 100%):');
      const ul = document.createElement('ul');
      ul.className = 'strategy-stats';
      Object.keys(strategyHours)
        .sort((a, b) => strategyHours[b] - strategyHours[a])
        .forEach((name) => {
          const li = document.createElement('li');
          const label = document.createElement('span');
          label.textContent = `${t(name)}: `;
          const val = document.createElement('span');
          val.textContent = ((strategyHours[name] / rows.length) * 100).toFixed(1) + '%';
          li.appendChild(label);
          li.appendChild(val);
          ul.appendChild(li);
        });
      stats.appendChild(ul);
      return;
    }
    if (state.comfort !== 'none' && rows.length) {
      text += ' ' + t('{h} h ({pct}%) fall inside the {zone} comfort zone.', {
        h: comfortHours,
        pct: ((comfortHours / rows.length) * 100).toFixed(1),
        zone: t(state.comfort === 'pmv' ? 'PMV ±0.5' : 'adaptive 80%')
      });
    }
    stats.textContent = text;
  };

  const parseWeather = (text, fileName) => {
    const lines = text.split(/\r?\n/);
    const rows = [];
    let station = null;

    if (/^LOCATION/i.test(lines[0])) {
      const loc = lines[0].split(',');
      station = {
        name: loc[1],
        region: loc[2],
        country: loc[3],
        wmo: loc[5],
        latitude: parseFloat(loc[6]),
        longitude: parseFloat(loc[7]),
        timezone: parseFloat(loc[8]),
        elevation: parseFloat(loc[9])
      };
      for (let i = 8; i < lines.length; i++) {
        const f = lines[i].split(',');
        if (f.length < 10) continue;
        const t = parseFloat(f[6]);
        const rh = parseFloat(f[8]);
        if (!Number.isFinite(t) || !Number.isFinite(rh) || t >= 99.9 || rh > 100 || rh < 0) continue;
        rows.push({ month: parseInt(f[1], 10), t: t, rh: rh / 100 });
      }
    } else {
      const header = lines[0].split(/[,;\t]/).map((s) => s.trim().toLowerCase());
      const hasHeader = header.some((s) => /[a-z]/.test(s));
      let ti = 0;
      let ri = 1;
      let mi = -1;
      if (hasHeader) {
        ti = header.findIndex((s) => /dry.?bulb|drybulb|temp/.test(s));
        ri = header.findIndex((s) => /relative.?humid|\brh\b|humidity/.test(s));
        mi = header.findIndex((s) => /^month$|\bmonth\b/.test(s));
        if (ti < 0) ti = 0;
        if (ri < 0) ri = 1;
      }
      let maxRh = 0;
      for (let j = hasHeader ? 1 : 0; j < lines.length; j++) {
        const c = lines[j].split(/[,;\t]/);
        if (c.length < 2) continue;
        const tt = parseFloat(c[ti]);
        const rr = parseFloat(c[ri]);
        if (!Number.isFinite(tt) || !Number.isFinite(rr)) continue;
        if (rr > maxRh) maxRh = rr;
        rows.push({ month: mi >= 0 ? parseInt(c[mi], 10) || 0 : 0, t: tt, rh: rr });
      }
      const scale = maxRh > 1.5 ? 100 : 1;
      rows.forEach((r) => { r.rh = clamp(r.rh / scale, 0, 1); });
      station = { name: fileName };
    }

    if (!rows.length) {
      window.alert(t('No usable dry-bulb temperature / relative humidity data was found in {file}.', { file: fileName }));
      return;
    }

    state.data = rows;
    state.station = station;
    state.month = 0;
    $('month').value = '0';

    if (Number.isFinite(station.elevation)) {
      $('elevation').value = String(Math.round(station.elevation));
      setPressure(P.pressureFromElevation(station.elevation));
    }

    // Start from the default ranges (0-50 °C, 0-35 g/kg) and widen only as far as the data needs.
    let tLo = Infinity;
    let tHi = -Infinity;
    let wHi = 0;
    rows.forEach((r) => {
      if (r.t < tLo) tLo = r.t;
      if (r.t > tHi) tHi = r.t;
      const wg = P.wFromRh(r.t, r.rh, state.pressure) * 1000;
      if (wg > wHi) wHi = wg;
    });
    state.tMin = Math.min(0, clamp(Math.floor(tLo / 5) * 5, -40, 60));
    state.tMax = Math.max(50, clamp(Math.ceil(tHi / 5) * 5, state.tMin + 10, 70));
    state.wMax = Math.max(35, clamp(Math.ceil(wHi / 5) * 5, 5, 100));
    $('tmin').value = String(state.tMin);
    $('tmax').value = String(state.tMax);
    $('wmax').value = String(state.wMax);
    $('dbt').min = String(state.tMin);
    $('dbt').max = String(state.tMax);

    renderStation();
    $('station').hidden = false;
    rebuild();
  };

  const renderStation = () => {
    const s = state.station;
    const dl = $('station-info');
    dl.textContent = '';
    if (!s) return;
    const entries = [
      [t('Name'), s.name],
      [t('Region'), s.region],
      [t('Country'), s.country],
      [t('WMO'), s.wmo],
      [t('Latitude'), Number.isFinite(s.latitude) ? s.latitude.toFixed(2) + '°' : null],
      [t('Longitude'), Number.isFinite(s.longitude) ? s.longitude.toFixed(2) + '°' : null],
      [t('Timezone'), Number.isFinite(s.timezone) ? 'UTC' + (s.timezone >= 0 ? '+' : '') + s.timezone : null],
      [t('Elevation'), Number.isFinite(s.elevation) ? s.elevation + ' m' : null]
    ];
    entries.forEach((e) => {
      if (e[1] === undefined || e[1] === null || e[1] === '') return;
      const dt = document.createElement('dt');
      dt.textContent = e[0];
      const dd = document.createElement('dd');
      dd.textContent = e[1];
      dl.appendChild(dt);
      dl.appendChild(dd);
    });
  };

  const loadFile = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      parseWeather(String(reader.result), file.name);
    };
    reader.readAsText(file);
  };

  /* ---------------------------------------------------------------- */
  /* Rendering                                                         */
  /* ---------------------------------------------------------------- */

  const pathFrom = (pts) => {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const s = toScreen(pts[i][0], pts[i][1]);
      if (i === 0) ctx.moveTo(s[0], s[1]);
      else ctx.lineTo(s[0], s[1]);
    }
  };

  const screenPts = (pts) => {
    const out = new Array(pts.length);
    for (let i = 0; i < pts.length; i++) out[i] = toScreen(pts[i][0], pts[i][1]);
    return out;
  };

  const haloText = (text, x, y, color, bold) => {
    ctx.font = (bold ? '600 ' : '') + '10px ' + getComputedStyle(document.body).fontFamily;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  };

  const clipPlot = () => {
    ctx.beginPath();
    ctx.rect(plot.x0, plot.y0, plot.x1 - plot.x0, plot.y1 - plot.y0);
    ctx.clip();
  };

  const drawFamilies = () => {
    const hl = state.highlight;
    const order = FAMILIES.filter((f) => f.show && f.id !== hl);
    const hlFam = FAMILIES.find((f) => f.id === hl && f.show);
    if (hlFam) order.push(hlFam);

    order.forEach((fam) => {
      const isHl = fam.id === hl;
      const tints = fam.color ? { major: tint(fam.color, 0.7), minor: tint(fam.color, 0.35) } : null;
      ctx.globalAlpha = hl && !isHl ? 0.4 : 1;
      fam.lines.forEach((line) => {
        line._s = screenPts(line.pts);
        ctx.beginPath();
        for (let i = 0; i < line._s.length; i++) {
          if (i === 0) ctx.moveTo(line._s[i][0], line._s[i][1]);
          else ctx.lineTo(line._s[i][0], line._s[i][1]);
        }
        if (isHl) {
          ctx.strokeStyle = COLORS.accent;
          ctx.lineWidth = line.major ? 1.6 : 0.8;
        } else {
          ctx.strokeStyle = line.major ? COLORS.major : COLORS.minor;
          ctx.lineWidth = line.major ? 0.9 : 0.6;
          if (fam.id === 'rh') {
            ctx.strokeStyle = '#8b949d';
            ctx.lineWidth = 0.9;
          }
          if (tints) ctx.strokeStyle = line.major ? tints.major : tints.minor;
        }
        ctx.stroke();
      });
    });
    ctx.globalAlpha = 1;
  };

  // Where an RH line leaves the plot: the crossing point with the top or right edge, and which edge it was.
  const rhExit = (s) => {
    for (let i = s.length - 1; i >= 0; i--) {
      if (!insidePlot(s[i])) continue;
      const p0 = s[i];
      const p1 = s[i + 1];
      if (!p1) return { x: p0[0], y: p0[1], top: false };
      const fx = p1[0] > plot.x1 ? (plot.x1 - p0[0]) / (p1[0] - p0[0]) : 1;
      const fy = p1[1] < plot.y0 ? (plot.y0 - p0[1]) / (p1[1] - p0[1]) : 1;
      const f = Math.min(fx, fy);
      return { x: p0[0] + f * (p1[0] - p0[0]), y: p0[1] + f * (p1[1] - p0[1]), top: fy < fx };
    }
    return { x: s[0][0], y: s[0][1], top: false };
  };

  /* Axis titles for wet-bulb, vapour pressure, specific volume and enthalpy. Each title follows the curve its tick
     labels sit on, offset away from them. If it would overlap a tick label or another title it slides along the curve,
     then tries a second offset, and is skipped only if nothing is free. */
  const pathSampler = (pts) => {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = cum[cum.length - 1];
    const at = (d) => {
      d = clamp(d, 0, total);
      let i = 1;
      while (i < pts.length - 1 && cum[i] < d) i++;
      const f = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f];
    };
    return { total: total, at: at };
  };

  const axisPath = () => {
    const flip = state.morph > 0.5; // RH chart: the saturation curve is the top edge, so the title goes just below it
    return { pts: screenPts(cache.saturation).filter((s) => insidePlot(s, 0)), off: flip ? [12, 26] : [22, 36], flip: flip };
  };

  // The dotted mean outdoor temperature line (Givoni chart) and its rotated label, as boxes other labels keep clear of.
  const meanOutdoorBoxes = () => {
    const gz = G.zones.find((z) => z.id === 'tmo');
    if (state.comfort !== 'givoni' || !gz || !gz.show) return [];
    const tm = effectiveTOut();
    const ws = P.wSat(tm, state.pressure);
    const x = toScreen(tm, 0)[0];
    const top = toScreen(tm, ws + 0.002)[1];
    const c = toScreen(tm - 0.3, ws + 0.0012);
    ctx.font = '600 10px ' + getComputedStyle(document.body).fontFamily;
    const len = ctx.measureText(tm.toFixed(1) + ' °C').width + 4;
    return [{ x: x - 3, y: top, w: 6, h: plot.y1 - top }, { x: c[0] - 8, y: c[1] - len / 2, w: 16, h: len }];
  };

  // The text as a chain of small boxes along its direction, so rotated titles are tested against labels fairly closely.
  const titleBoxes = (cx, cy, ang, w, h) => {
    const n = Math.max(2, Math.ceil(w / 12));
    const seg = w / n;
    const hx = (Math.abs(Math.cos(ang)) * seg + Math.abs(Math.sin(ang)) * h) / 2;
    const hy = (Math.abs(Math.sin(ang)) * seg + Math.abs(Math.cos(ang)) * h) / 2;
    const out = [];
    for (let i = 0; i < n; i++) {
      const d = -w / 2 + (i + 0.5) * seg;
      out.push({ x: cx + Math.cos(ang) * d - hx, y: cy + Math.sin(ang) * d - hy, w: hx * 2, h: hy * 2 });
    }
    return out;
  };

  const boxesOverlap = (a, b) => a.x < b.x + b.w + 2 && a.x + a.w + 2 > b.x && a.y < b.y + b.h + 1 && a.y + a.h + 1 > b.y;

  const drawAxisTitles = () => {
    const hl = state.highlight;
    const taken = labelBoxes.concat(meanOutdoorBoxes());
    const ro = $('readout').getBoundingClientRect(); // the Current conditions box floats over the chart
    const cr = canvas.getBoundingClientRect();
    if (ro.width > 0) taken.push({ x: ro.left - cr.left - 4, y: ro.top - cr.top - 4, w: ro.width + 8, h: ro.height + 8 });
    const order = FAMILIES.filter((f) => f.show && f.axis && f.axis.where === 'sat' && f.id !== hl);
    const hlFam = FAMILIES.find((f) => f.id === hl && f.show && f.axis && f.axis.where === 'sat');
    if (hlFam) order.unshift(hlFam); // the highlighted family gets first pick of the free space
    ctx.font = '600 10px ' + getComputedStyle(document.body).fontFamily;
    order.forEach((fam) => {
      const text = t(fam.title);
      const w = ctx.measureText(text).width + 4;
      const path = axisPath();
      if (path.pts.length < 2) return;
      const sm = pathSampler(path.pts);
      if (sm.total < w) return;
      const deltas = [0];
      for (let d = 10; d < sm.total; d += 10) deltas.push(d, -d);
      let found = null;
      path.off.some((off) => deltas.some((dd) => {
        const c = fam.axis.pref * sm.total + dd;
        if (c - w / 2 < 0 || c + w / 2 > sm.total) return false;
        const p0 = sm.at(c - w / 2);
        const p1 = sm.at(c + w / 2);
        const ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
        const mid = sm.at(c);
        const side = path.flip ? -1 : 1;
        const cx = mid[0] + Math.sin(ang) * off * side;
        const cy = mid[1] - Math.cos(ang) * off * side;
        const boxes = titleBoxes(cx, cy, ang, w, 11);
        const inside = boxes.every((b) => b.x >= plot.x0 && b.x + b.w <= plot.x1 && b.y >= plot.y0 && b.y + b.h <= plot.y1);
        if (!inside || boxes.some((b) => taken.some((o) => boxesOverlap(b, o)))) return false;
        found = { cx: cx, cy: cy, ang: ang, boxes: boxes };
        return true;
      }));
      if (!found) return;
      found.boxes.forEach((b) => taken.push(b));
      ctx.save();
      ctx.globalAlpha = hl && hl !== fam.id ? 0.5 : 1;
      ctx.translate(found.cx, found.cy);
      ctx.rotate(Math.abs(found.ang) > Math.PI / 2 + 1e-9 ? found.ang + Math.PI : found.ang); // never upside down
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      haloText(text, 0, 0, fam.id === hl ? COLORS.accent : fam.color, true);
      ctx.restore();
    });
  };

  const drawFamilyLabels = () => {
    const hl = state.highlight;
    labelBoxes.length = 0;
    const avoid = meanOutdoorBoxes();
    ctx.textBaseline = 'middle';
    FAMILIES.forEach((fam) => {
      if (!fam.show || fam.id === 'dbt') return;
      const isHl = fam.id === hl;
      const color = isHl ? COLORS.accent : fam.color || COLORS.muted;
      const baseAlpha = hl && !isHl ? 0.5 : 1;
      const placed = [];
      fam.lines.forEach((line) => {
        ctx.globalAlpha = baseAlpha * (line.anchor === 'right' ? 1 - state.morph : line.anchor === 'rh' ? Math.abs(1 - 2 * state.morph) : 1);
        if (ctx.globalAlpha <= 0.02) return;
        if (!line.label || !line._s) return;
        const s = line._s;
        let anchor = null;
        let i;
        if (line.anchor === 'start') {
          for (i = 0; i < s.length; i++) if (insidePlot(s[i])) { anchor = s[i]; break; }
        } else {
          for (i = s.length - 1; i >= 0; i--) if (insidePlot(s[i])) { anchor = s[i]; break; }
        }
        if (!anchor) return;
        const x = anchor[0];
        const y = anchor[1];
        let lx;
        let ly;
        let align;
        if (line.anchor === 'right') {
          if (x < plot.x1 - 2) return;
          align = 'left';
          lx = plot.x1 + 6;
          ly = y;
        } else if (line.anchor === 'rh') {
          const ex = rhExit(s);
          if (state.morph > 0.5) { // RH chart: label outside, on the right axis only
            align = 'left';
            lx = plot.x1 + 6;
            ly = ex.y;
          } else if (ex.top) { // wraps to the top axis: label above the chart
            align = 'center';
            lx = ex.x;
            ly = plot.y0 - 9;
          } else { // leaves through the right edge: label inside, as before
            align = 'right';
            lx = x - 4;
            ly = Math.max(y + 7, plot.y0 + 7);
          }
        } else if (line.anchor === 'start') {
          align = 'right';
          lx = x - 4;
          ly = y - 5;
        } else if (line.anchor === 'endInside') {
          align = 'right';
          lx = x - 4;
          ly = y - 6;
        } else if (x > plot.x1 - 1) { // line leaves through the right edge: label inside, clear of the g/kg numbers
          align = 'right';
          lx = x - 4;
          ly = y - 7;
        } else {
          align = 'left';
          lx = x + 3;
          ly = y - 7;
        }
        ctx.font = (isHl ? '600 ' : '') + '10px ' + getComputedStyle(document.body).fontFamily;
        const width = ctx.measureText(line.label).width + 4;
        let left = align === 'right' ? lx - width : align === 'center' ? lx - width / 2 : lx;
        if (line.anchor === 'start' && avoid.length) { // wet-bulb and enthalpy: slide left until clear of the mean outdoor line and its label
          const hit = () => avoid.find((o) => left < o.x + o.w + 2 && left + width + 2 > o.x && ly - 6 < o.y + o.h && ly + 6 > o.y);
          const home = left;
          for (let k = 0; k < 4 && hit(); k++) left = hit().x - width - 3;
          if (hit()) return;
          lx = left + width; // these labels are right-aligned
          if (left !== home && labelBoxes.some((o) => left < o.x + o.w + 1 && left + width + 1 > o.x && ly - 6 < o.y + o.h && ly + 6 > o.y)) return; // moved onto another label: drop it
        }
        const slack = line.anchor === 'rh' ? 6 : 0; // neighbouring RH labels along the top may overlap slightly
        const collides = placed.some((b) => left < b.x + b.w - slack && left + width > b.x + slack && Math.abs(ly - b.y) < 11);
        if (collides) return;
        placed.push({ x: left, y: ly, w: width });
        labelBoxes.push({ x: left, y: ly - 6, w: width, h: 12 });
        ctx.textAlign = align;
        haloText(line.label, lx, ly, color, isHl);
      });
      ctx.globalAlpha = 1;
    });
    drawAxisTitles();
  };

  const drawData = () => {
    if (!state.showData) return;
    drawBins(cache.bins, cache.binMax, false, Math.max(0, 1 - 2 * state.morph));   // psychrometric chart cells (1 °C x 1 g/kg)
    drawBins(cache.rhBins, cache.rhBinMax, true, Math.max(0, 2 * state.morph - 1)); // RH chart cells (1 °C x 5 % RH): true rectangles
  };

  // Shrink a convex quadrilateral (screen points) by m pixels on every side, so neighbouring cells leave a small gap.
  const insetQuad = (q, m) => {
    const cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4;
    const cy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
    const lines = [];
    for (let i = 0; i < 4; i++) {
      const p = q[i];
      const r = q[(i + 1) % 4];
      const dx = r[0] - p[0];
      const dy = r[1] - p[1];
      const len = Math.hypot(dx, dy) || 1;
      let nx = -dy / len;
      let ny = dx / len;
      if ((cx - p[0]) * nx + (cy - p[1]) * ny < 0) { nx = -nx; ny = -ny; } // normal pointing into the cell
      lines.push({ px: p[0] + nx * m, py: p[1] + ny * m, dx: dx, dy: dy });
    }
    const out = [];
    for (let k = 0; k < 4; k++) { // corner k = where the offset edges k-1 and k meet
      const l1 = lines[(k + 3) % 4];
      const l2 = lines[k];
      const det = l1.dx * l2.dy - l1.dy * l2.dx;
      if (Math.abs(det) < 1e-9) { out.push([l2.px, l2.py]); continue; }
      const t = ((l2.px - l1.px) * l2.dy - (l2.py - l1.py) * l2.dx) / det;
      out.push([l1.px + t * l1.dx, l1.py + t * l1.dy]);
    }
    return out;
  };

  const drawBins = (bins, max, isRh, fade) => {
    if (!bins || fade <= 0) return;
    max = max || 1;
    const p = state.pressure;
    Object.keys(bins).forEach((key) => {
      const parts = key.split(':');
      const t = Number(parts[0]);
      const g = Number(parts[1]);
      let a, b, c, d;
      if (isRh) {
        const r0 = (g * RH_STEP) / 100;
        const r1 = ((g + 1) * RH_STEP) / 100;
        a = toScreen(t, P.wFromRh(t, r0, p));
        b = toScreen(t + 1, P.wFromRh(t + 1, r0, p));
        c = toScreen(t + 1, P.wFromRh(t + 1, r1, p));
        d = toScreen(t, P.wFromRh(t, r1, p));
      } else {
        a = toScreen(t, g / 1000);
        b = toScreen(t + 1, g / 1000);
        c = toScreen(t + 1, (g + 1) / 1000);
        d = toScreen(t, (g + 1) / 1000);
      }
      const intensity = Math.sqrt(bins[key] / max);
      ctx.fillStyle = 'rgba(' + COLORS.dataRgb + ',' + ((0.12 + intensity * 0.78) * fade).toFixed(3) + ')';
      const cw = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const ch = Math.hypot(d[0] - a[0], d[1] - a[1]);
      const margin = Math.min(2, 0.15 * Math.min(cw, ch)); // up to 2 px; smaller for tiny cells
      const q = margin >= 0.3 ? insetQuad([a, b, c, d], margin) : [a, b, c, d];
      ctx.beginPath();
      ctx.moveTo(q[0][0], q[0][1]);
      ctx.lineTo(q[1][0], q[1][1]);
      ctx.lineTo(q[2][0], q[2][1]);
      ctx.lineTo(q[3][0], q[3][1]);
      ctx.closePath();
      ctx.fill();
    });
  };


  const drawComfort = () => {
    cache.comfort.forEach((z) => {
      const gz = z.zone;
      if (gz) { // Givoni zone: fill only here (inside the clip); outlines are drawn by drawGivoniOutlines
        if (gz.fill) {
          pathFrom(z.poly);
          ctx.closePath();
          ctx.fillStyle = 'rgba(' + gz.fill + ')';
          ctx.fill();
        }
        if (hoverSet[gz.id] && state.comfort === 'givoni') { // highlight the zone(s) under the pointer
          pathFrom(z.poly);
          ctx.closePath();
          ctx.fillStyle = 'rgba(' + gz.rgb + ',0.28)';
          ctx.fill();
        }
        return;
      }
      const rgb = z.zone ? z.zone.rgb : COLORS.accentRgb;
      pathFrom(z.poly);
      ctx.closePath();
      ctx.fillStyle = 'rgba(' + rgb + ',' + (z.zone ? (z.zone.id === 'c' ? 0.3 : 0.1) : z.alpha) + ')';
      ctx.fill();
      ctx.strokeStyle = 'rgba(' + rgb + ',0.85)';
      ctx.lineWidth = z.zone ? 1.4 : 1;
      ctx.stroke();
    });
  };

  // Legend for the data cells: the same colour ramp as drawData(), from 1 hour to the busiest cell.
  const drawDataLegend = () => {
    const rhView = state.morph > 0.5;
    const max = rhView ? cache.rhBinMax : cache.binMax;
    if (!(rhView ? cache.rhBins : cache.bins) || !state.showData || !max) return;
    const font = getComputedStyle(document.body).fontFamily;
    const n = 6;
    const sw = 22;
    const w = n * sw;
    const x0 = plot.x1 - w - 16;
    const y0 = plot.y1 - 30;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(x0 - 8, y0 - 22, w + 16, 54);
    ctx.fillStyle = '#3b3f45';
    ctx.font = '600 10px ' + font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(t('Hours per cell'), x0, y0 - 8);
    for (let i = 0; i < n; i++) {
      const v = 1 + ((max - 1) * i) / (n - 1);
      ctx.fillStyle = 'rgba(' + COLORS.dataRgb + ',' + (0.12 + Math.sqrt(v / max) * 0.78).toFixed(3) + ')';
      ctx.fillRect(x0 + i * sw, y0, sw, 10);
    }
    ctx.strokeStyle = 'rgba(59,63,69,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, 9);
    ctx.fillStyle = '#3b3f45';
    ctx.font = '10px ' + font;
    ctx.fillText('1', x0, y0 + 22);
    ctx.textAlign = 'right';
    ctx.fillText(String(max), x0 + w, y0 + 22);
    ctx.restore();
  };

  // Zone outlines are drawn outside the plot clip so edges lying on the saturation curve or the W = 0 axis stay fully visible.
  const drawGivoniOutlines = () => {
    ctx.save();
    ctx.strokeStyle = '#3b3f45';
    ctx.lineJoin = 'round';
    cache.comfort.forEach((z) => {
      const gz = z.zone;
      if (!gz) return;
      ctx.setLineDash(gz.dash || []);
      ctx.lineWidth = hoverSet[gz.id] ? 3.6 : gz.width || 2.2;
      pathFrom(z.poly);
      if (gz.close === undefined) ctx.closePath();
      ctx.stroke();
      if (gz.close === 'dotted') {
        ctx.setLineDash([2, 4]);
        ctx.lineWidth = 1.6;
        pathFrom(z.tail);
        ctx.stroke();
      }
      if (gz.extra) {
        ctx.setLineDash([2, 4]);
        ctx.lineWidth = 1.6;
        gz.extra(state.pressure).forEach((seg) => {
          pathFrom(densify(seg.map((v) => [v[0], Math.min(v[1], state.wMax / 1000)]), 0.25, 0.0004));
          ctx.stroke();
        });
      }
    });
    ctx.restore();
  };

  // Vertical centre (screen y) of a label's region at screen x: the span of its zone polygon, or of label.band.
  const labelCenterY = (zoneEntry, l, lt, x) => {
    const wTop = state.wMax / 1000;
    if (l.band) {
      const bd = l.band(lt, state.pressure, wTop);
      return (toScreen(lt, Math.min(bd[0], wTop))[1] + toScreen(lt, Math.min(bd[1], wTop))[1]) / 2;
    }
    if (!zoneEntry) return null;
    const s = screenPts(zoneEntry.poly);
    const ys = [];
    for (let i = 0; i < s.length; i++) {
      const p = s[i];
      const q = s[(i + 1) % s.length];
      if (p[0] <= x !== q[0] <= x) ys.push(p[1] + ((x - p[0]) * (q[1] - p[1])) / (q[0] - p[0]));
    }
    if (ys.length < 2) return null;
    return (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2;
  };

  const drawGivoniLabels = () => {
    if (state.comfort !== 'givoni') return;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const entries = {};
    cache.comfort.forEach((z) => { if (z.zone) entries[z.zone.id] = z; });
    G.zones.forEach((gz) => {
      if (!gz.show || !gz.labels) return;
      gz.labels.forEach((l) => {
        if (l.visible && !l.visible(G.shift())) return; // e.g. the zone has moved out of the plot
        const l0 = l.dyn ? l.dyn(state.pressure) : l; // computed labels (mean outdoor temperature) are placed absolutely
        const lt = l0.abs ? l0.t : l0.t + G.shift();   // other labels move with the zones
        let wl = l0.w / 1000;
        if (l.sat) { // sit just inside the saturation curve at any pressure
          const ws = Math.min(P.wSat(lt, state.pressure), state.wMax / 1000);
          wl = ws - 0.15 * (ws - P.wFromRh(lt, 0.8, state.pressure));
        }
        let s = toScreen(lt, wl);
        if (l0.edgeT !== undefined) { // keep the label a fixed number of pixels inside a vertical (right) edge of its zone
          const edgeX = toScreen(l0.edgeAbs ? l0.edgeT : l0.edgeT + G.shift(), 0)[0];
          s = [edgeX - (l0.rightInset || 0), s[1]];
        }
        if (!l0.abs && !l.sat) { // centre the label vertically inside its region (curve labels hug the curve instead)
          const cy = labelCenterY(entries[gz.id], l0, lt, s[0]);
          if (cy !== null) s = [s[0], cy];
        }
        let ang = l0.rot !== undefined ? l0.rot : l0.v ? Math.PI / 2 : 0;
        if (l.sat) { // run the text along the saturation curve
          const a = toScreen(lt - 0.5, P.wSat(lt - 0.5, state.pressure));
          const b = toScreen(lt + 0.5, P.wSat(lt + 0.5, state.pressure));
          ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
          // hug the curve: sit on it, then move 14 px into the region perpendicular to the curve
          const sp = toScreen(lt, Math.min(P.wSat(lt, state.pressure), state.wMax / 1000));
          s = [sp[0] - Math.sin(ang) * 14, sp[1] + Math.cos(ang) * 14];
        }
        ctx.save();
        ctx.translate(s[0], s[1]);
        ctx.rotate(ang);
        const lines = t(state.morph > 0.5 && l0.textRh ? l0.textRh : l0.text).split('\n'); // shorter text in the RH chart
        lines.forEach((ln, i) => {
          haloText(ln, 0, (i - (lines.length - 1) / 2) * 12, '#3b3f45', true);
        });
        ctx.restore();
      });
    });
  };

  const drawAxes = () => {
    const font = getComputedStyle(document.body).fontFamily;
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 1;
    ctx.strokeRect(plot.x0 + 0.5, plot.y0 + 0.5, plot.x1 - plot.x0 - 1, plot.y1 - plot.y0 - 1);

    ctx.font = '11px ' + font;
    ctx.fillStyle = COLORS.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    if (famShown('dbt')) { // ticks, numbers and title belong to the dry-bulb metric
      const range = state.tMax - state.tMin;
      const step = range > 80 ? 10 : 5;
      for (let t = Math.ceil(state.tMin); t <= state.tMax; t++) {
        const x = toScreen(t, 0)[0];
        const major = t % step === 0;
        ctx.beginPath();
        ctx.moveTo(x, plot.y1);
        ctx.lineTo(x, plot.y1 + (major ? 6 : 3));
        ctx.stroke();
        if (major) ctx.fillText(String(t), x, plot.y1 + 8);
      }
    }

    // Axis titles. The titles of one axis (dry-bulb + specific volume at the bottom, humidity ratio or RH + vapour pressure
    // on the right) sit side by side as a group centred on the axis, so one or two are always balanced.
    ctx.font = '600 11px ' + font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const GAP = 28;
    const spread = (items, mid) => { // centre of each title along the axis, the whole group centred on mid
      const ws = items.map((it) => ctx.measureText(it.text).width);
      let pos = mid - (ws.reduce((sum, w) => sum + w, 0) + GAP * (items.length - 1)) / 2;
      return items.map((it, k) => {
        const c = pos + ws[k] / 2;
        pos += ws[k] + GAP;
        return c;
      });
    };
    const item = (id, text, alpha) => ({ text: t(text), color: id ? famById(id).color : COLORS.ink, alpha: alpha });

    const bottom = [];
    if (famShown('dbt')) bottom.push(item(null, 'Dry-bulb temperature (°C)', 1));
    if (famShown('v')) bottom.push(item('v', famById('v').title, 1));
    spread(bottom, (plot.x0 + plot.x1) / 2).forEach((c, k) => {
      ctx.fillStyle = bottom[k].color;
      ctx.fillText(bottom[k].text, c, plot.y1 + 32);
    });

    // Right axis: just outside the widest number of the axis (g/kg numbers, or "100%" in the RH chart). Both the humidity ratio
    // and RH titles cross-fade; the vapour pressure title joins whichever of the two is showing.
    const rightX = (widest) => {
      ctx.save();
      ctx.font = '10px ' + font;
      const x = Math.min(plot.x1 + 6 + ctx.measureText(widest).width + 14, size.w - 8);
      ctx.restore();
      return x;
    };
    const rhView = state.morph > 0.5;
    [['w', 'Humidity ratio (g/kg dry air)', String(state.wMax), 1 - state.morph], ['rh', 'Relative humidity (%)', '100%', state.morph]].forEach((ax) => {
      const items = [];
      if (famShown(ax[0]) && ax[3] > 0) items.push(item(null, ax[1], ax[3]));
      if (famShown('pv') && (ax[0] === 'rh') === rhView) items.push(item('pv', famById('pv').title, 1));
      const x = famShown(ax[0]) ? rightX(ax[2]) : plot.x1 + 14;
      spread(items, (plot.y0 + plot.y1) / 2).forEach((c, k) => {
        ctx.save();
        ctx.globalAlpha = items[k].alpha;
        ctx.translate(x, c);
        ctx.rotate(Math.PI / 2);
        ctx.fillStyle = items[k].color;
        ctx.fillText(items[k].text, 0, 0);
        ctx.restore();
      });
    });
  };

  const drawTitle = () => {
    const font = getComputedStyle(document.body).fontFamily;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = COLORS.ink;
    ctx.font = '650 16px ' + font;
    ctx.fillText(state.title, plot.x0, 28);
    ctx.fillStyle = COLORS.muted;
    ctx.font = '12px ' + font;
    ctx.fillText(state.subtitle || autoSubtitle(), plot.x0, 46);
  };

  const autoSubtitle = () => {
    const parts = [t('Atmospheric pressure {p} kPa', { p: (state.pressure / 1000).toFixed(3) })];
    if (state.comfort === 'pmv') parts.push(t('PMV comfort: {met} met, {clo} clo, {vel} m/s', { met: state.met, clo: state.clo, vel: state.vel }));
    if (state.comfort === 'adaptive') parts.push(t('Adaptive comfort, mean outdoor {t} °C', { t: effectiveTOut().toFixed(1) }));
    if (state.comfort === 'givoni') parts.push(t('Givoni bioclimatic zones'));
    if (state.station && state.station.name) parts.push(state.station.name + (state.month ? ' – ' + t(MONTHS[state.month]) : ''));
    return parts.join('  ·  ');
  };

  const drawProcess = () => {
    if (!state.points.length) return;
    const font = getComputedStyle(document.body).fontFamily;
    if (state.points.length > 1) {
      const pts = state.points.map((pt) => [pt.t, pt.w]);
      pathFrom(densify(pts, 0.2, 0.0002));
      ctx.strokeStyle = COLORS.point;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    state.points.forEach((pt, i) => {
      const s = toScreen(pt.t, pt.w);
      const selected = i === state.selected;
      ctx.beginPath();
      ctx.arc(s[0], s[1], selected ? 9 : 7.5, 0, Math.PI * 2);
      ctx.fillStyle = selected ? '#ffffff' : COLORS.point;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = COLORS.point;
      ctx.stroke();
      ctx.fillStyle = selected ? COLORS.point : '#ffffff';
      ctx.font = '600 9px ' + font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), s[0], s[1] + 0.5);
      if (pt.label) {
        ctx.textAlign = 'left';
        haloText(pt.label, s[0] + 12, s[1] - 10, COLORS.point, true);
      }
    });
  };

  // Brief ring + dashed line from where you clicked to where the indicator snapped (shown when they differ).
  let ghost = null;
  const markClick = (xy) => {
    const s = toScreen(state.indicator.t, state.indicator.w);
    ghost = Math.hypot(s[0] - xy[0], s[1] - xy[1]) > 8 ? { x: xy[0], y: xy[1], t0: performance.now() } : null;
  };
  const drawGhost = () => {
    if (!ghost) return;
    const age = performance.now() - ghost.t0;
    if (age > 700) { ghost = null; return; }
    const s = toScreen(state.indicator.t, state.indicator.w);
    ctx.save();
    ctx.globalAlpha = 0.7 * (1 - age / 700);
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(ghost.x, ghost.y);
    ctx.lineTo(s[0], s[1]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(ghost.x, ghost.y, 8 + age / 60, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    scheduleRender();
  };
  const drawIndicator = () => {
    const ind = state.indicator;
    const s = toScreen(ind.t, ind.w);
    ctx.save();
    clipPlot();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = COLORS.ink;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(s[0], s[1]);
    ctx.lineTo(s[0], plot.y1);
    ctx.moveTo(s[0], s[1]);
    ctx.lineTo(plot.x1, s[1]);
    ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(s[0], s[1], 6, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = COLORS.ink;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(s[0], s[1], 2, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.ink;
    ctx.fill();
  };

  const render = () => {
    renderQueued = false;
    if (!size.w || !size.h) return;
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    ctx.fillStyle = COLORS.page;
    ctx.fillRect(0, 0, size.w, size.h);

    drawTitle();

    ctx.save();
    clipPlot();
    ctx.fillStyle = COLORS.invalid;
    ctx.fillRect(plot.x0, plot.y0, plot.x1 - plot.x0, plot.y1 - plot.y0);
    pathFrom(cache.valid);
    ctx.closePath();
    ctx.fillStyle = COLORS.page;
    ctx.fill();

    ctx.save();
    pathFrom(cache.valid);
    ctx.closePath();
    ctx.clip();
    drawData();
    drawComfort();
    drawFamilies();
    ctx.restore();

    pathFrom(cache.saturation);
    ctx.strokeStyle = '#9aa3ab'; // thin, light 100% RH line so zone outlines on top of it stay visible
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    drawGivoniOutlines();
    drawDataLegend();
    drawAxes();
    drawFamilyLabels();
    drawGivoniLabels();
    drawProcess();
    drawIndicator();
    drawGhost();
  };

  const scheduleRender = () => {
    if (renderQueued) return;
    renderQueued = true;
    window.requestAnimationFrame(render);
  };

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    size.dpr = window.devicePixelRatio || 1;
    size.w = rect.width;
    size.h = rect.height;
    canvas.width = Math.round(rect.width * size.dpr);
    canvas.height = Math.round(rect.height * size.dpr);
    computeLayout();
    const readout = $('readout');
    if (window.innerWidth > 860) {
      readout.style.left = plot.x0 + 10 + 'px';
      readout.style.top = plot.y0 + 10 + 'px';
    } else {
      readout.style.left = '';
      readout.style.top = '';
    }
    render();
  };

  /* ---------------------------------------------------------------- */
  /* UI updates                                                        */
  /* ---------------------------------------------------------------- */

  const fmt = (v, digits) => Number.isFinite(v) ? v.toFixed(digits) : '—';

  const updateReadout = () => {
    const ind = state.indicator;
    const pr = P.properties(ind.t, ind.w, state.pressure);
    const rows = [
      [t('Dry-bulb temp.'), fmt(pr.dryBulb, 1) + ' °C'],
      [t('Relative humidity'), fmt(pr.relativeHumidity * 100, 1) + ' %'],
      [t('Humidity ratio'), fmt(pr.humidityRatio * 1000, 2) + ' g/kg'],
      [t('Wet-bulb temp.'), fmt(pr.wetBulb, 1) + ' °C'],
      [t('Dew-point temp.'), fmt(pr.dewPoint, 1) + ' °C'],
      [t('Vapour pressure'), fmt(pr.vapourPressure / 1000, 3) + ' kPa'],
      [t('Abs. humidity'), fmt(pr.absoluteHumidity, 2) + ' g/m³'],
      [t('Specific volume'), fmt(pr.specificVolume, 4) + ' m³/kg'],
      [t('Enthalpy'), fmt(pr.enthalpy, 2) + ' kJ/kg'],
      [t('Density'), fmt(pr.density, 3) + ' kg/m³']
    ];
    let html = '<p class="readout-compact">' + fmt(ind.t, 1) + ' °C · ' + fmt(pr.relativeHumidity * 100, 0) + ' ' + t('% RH') + '</p><h2>' + t('Current conditions') + '</h2><dl>';
    rows.forEach((r) => {
      html += '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>';
    });
    html += '</dl>';
    if (state.comfort === 'pmv') {
      const c = pmvAt(ind.t, ind.w);
      const ok = Math.abs(c.pmv) <= 0.5;
      html += '<div class="comfort-line"><dl><dt>PMV</dt><dd>' + fmt(c.pmv, 2) + '</dd><dt>PPD</dt><dd>' + fmt(c.ppd, 1) +
        ' %</dd><dt>' + t('Sensation') + '</dt><dd class="' + (ok ? 'ok' : 'bad') + '">' + C.sensationLabel(c.pmv) + '</dd></dl></div>';
    } else if (state.comfort === 'adaptive') {
      const a = C.adaptive(effectiveTOut());
      const in90 = ind.t >= a.limits90[0] && ind.t <= a.limits90[1];
      const in80 = ind.t >= a.limits80[0] && ind.t <= a.limits80[1];
      html += '<div class="comfort-line"><dl><dt>' + t('Neutral temp.') + '</dt><dd>' + fmt(a.neutral, 1) + ' °C</dd><dt>' + t('Acceptability') + '</dt><dd class="' +
        (in80 ? 'ok' : 'bad') + '">' + (in90 ? '90%' : in80 ? '80%' : t('Outside')) + '</dd></dl></div>';
    } else if (state.comfort === 'givoni') {
      G.setMeanOutdoor(effectiveTOut());
      const strategies = G.classify(ind.t, ind.w, state.pressure);
      const comfy = strategies.some((z) => z.id === 'c');
      html += '<div class="comfort-line"><dl><dt>' + t('Strategy') + '</dt><dd class="' + (comfy ? 'ok' : '') + '">' +
        strategies.map((z) => t(z.name)).join(', ') + '</dd></dl></div>';
      document.dispatchEvent(new CustomEvent('psychro:zones', { detail: { zones: strategies, t: ind.t, w: ind.w } }));
    }
    if (state.data && cache.bins && state.showData) { // data cell under the indicator
      const cx = Math.floor(ind.t);
      let count;
      let range;
      if (state.morphTarget >= 0.5) { // RH chart: 1 °C x 5 % RH cells
        const ry = Math.min(Math.floor(clamp(pr.relativeHumidity * 100, 0, 100) / RH_STEP), 100 / RH_STEP - 1);
        count = (cache.rhBins || {})[cx + ':' + ry] || 0;
        range = cx + '–' + (cx + 1) + ' °C, ' + ry * RH_STEP + '–' + (ry + 1) * RH_STEP + ' ' + t('% RH');
      } else { // psychrometric chart: 1 °C x 1 g/kg cells
        const cy = Math.floor(ind.w * 1000);
        count = cache.bins[cx + ':' + cy] || 0;
        range = cx + '–' + (cx + 1) + ' °C, ' + cy + '–' + (cy + 1) + ' g/kg';
      }
      html += '<div class="comfort-line"><dl><dt>' + t('Hours in this cell') + '</dt><dd>' + count + '</dd><dt>' + t('Cell range') + '</dt><dd>' + range + '</dd></dl></div>';
    }
    $('readout-body').innerHTML = html;

    const rhPct = clamp(pr.relativeHumidity * 100, 0, 100);
    $('dbt').value = String(ind.t);
    $('rh').value = String(rhPct);
    if (document.activeElement !== $('dbt-num')) $('dbt-num').value = ind.t.toFixed(1);
    if (document.activeElement !== $('rh-num')) $('rh-num').value = rhPct.toFixed(1);
  };

  const renderPoints = () => {
    const list = $('points-list');
    if (!state.points.length) {
      list.innerHTML = `<li class="hint">${t("No process points yet.")}</li>`;
      return;
    }
    list.textContent = '';
    state.points.forEach((pt, i) => {
      const li = document.createElement('li');
      li.className = 'point' + (i === state.selected ? ' selected' : '');

      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = String(i + 1);

      const body = document.createElement('div');
      const input = document.createElement('input');
      input.type = 'text';
      input.value = pt.label;
      input.placeholder = t('Point {n}', { n: i + 1 });
      input.setAttribute('aria-label', t('Label for point {n}', { n: i + 1 }));
      input.addEventListener('input', () => {
        pt.label = input.value;
        scheduleRender();
      });
      input.addEventListener('focus', () => {
        state.selected = i;
        li.classList.add('selected');
        scheduleRender();
      });
      const vals = document.createElement('span');
      vals.className = 'vals';
      vals.textContent = pointSummary(pt);
      body.appendChild(input);
      body.appendChild(vals);

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn icon';
      del.setAttribute('aria-label', t('Remove point {n}', { n: i + 1 }));
      del.textContent = '×';
      del.addEventListener('click', () => {
        removePoint(i);
      });

      li.appendChild(badge);
      li.appendChild(body);
      li.appendChild(del);
      list.appendChild(li);
    });
  };

  const pointSummary = (pt) => {
    const rh = P.rhFromW(pt.t, pt.w, state.pressure) * 100;
    return pt.t.toFixed(1) + ' °C · ' + rh.toFixed(0) + '% · ' + (pt.w * 1000).toFixed(1) + ' g/kg · ' + P.enthalpy(pt.t, pt.w).toFixed(1) + ' kJ/kg';
  };

  const updatePointValues = () => {
    const items = $('points-list').querySelectorAll('.vals');
    state.points.forEach((pt, i) => {
      if (items[i]) items[i].textContent = pointSummary(pt);
    });
  };

  const removePoint = (i) => {
    state.points.splice(i, 1);
    if (state.selected === i) state.selected = -1;
    else if (state.selected > i) state.selected--;
    renderPoints();
    scheduleRender();
  };

  const renderMetricsTable = () => {
    const body = $('metrics-body');
    body.textContent = '';
    FAMILIES.forEach((fam) => {
      const tr = document.createElement('tr');
      const name = document.createElement('td');
      name.textContent = t(fam.name);
      const unit = document.createElement('span');
      unit.className = 'unit';
      unit.textContent = fam.unit;
      name.appendChild(unit);

      const showTd = document.createElement('td');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = fam.show;
      cb.setAttribute('aria-label', t('Show {name} lines', { name: lowerEs(t(fam.name)) }));
      cb.addEventListener('change', () => {
        fam.show = cb.checked;
        scheduleRender();
      });
      showTd.appendChild(cb);

      const hlTd = document.createElement('td');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'highlight';
      radio.value = fam.id;
      radio.setAttribute('aria-label', t('Highlight {name} lines', { name: lowerEs(t(fam.name)) }));
      radio.addEventListener('change', () => {
        state.highlight = fam.id;
        if (!fam.show) {
          fam.show = true;
          cb.checked = true;
        }
        scheduleRender();
      });
      hlTd.appendChild(radio);

      tr.appendChild(name);
      tr.appendChild(showTd);
      tr.appendChild(hlTd);
      body.appendChild(tr);
    });

    const tr = document.createElement('tr');
    const nameTd = document.createElement('td');
    nameTd.textContent = t('None');
    const empty = document.createElement('td');
    const hlTd = document.createElement('td');
    const none = document.createElement('input');
    none.type = 'radio';
    none.name = 'highlight';
    none.value = '';
    none.checked = true;
    none.setAttribute('aria-label', t('No highlight'));
    none.addEventListener('change', () => {
      state.highlight = null;
      scheduleRender();
    });
    hlTd.appendChild(none);
    tr.appendChild(nameTd);
    tr.appendChild(empty);
    tr.appendChild(hlTd);
    body.appendChild(tr);
  };

  const rebuild = () => {
    buildFamilies();
    buildComfort();
    buildData();
    updateReadout();
    updatePointValues();
    scheduleRender();
  };

  const setIndicator = (t, w) => {
    state.indicator.t = clamp(t, state.tMin, state.tMax);
    state.indicator.w = clamp(w, 0, wTopAt(state.indicator.t));
    updateReadout();
    scheduleRender();
  };

  const setPressure = (pa) => {
    if (!Number.isFinite(pa) || pa < 30000 || pa > 120000) return;
    state.pressure = pa;
    $('pressure').value = (pa / 1000).toFixed(3);
  };

  /* ---------------------------------------------------------------- */
  /* Chart type morph                                                  */
  /* ---------------------------------------------------------------- */

  let animStart = null;
  let animFrom = 0;

  const animateMorph = (target) => {
    state.morphTarget = target;
    animFrom = state.morph;
    animStart = null;
    window.requestAnimationFrame(stepMorph);
    syncChartType();
  };

  const stepMorph = (now) => {
    if (animStart === null) animStart = now;
    const duration = 700;
    const f = clamp((now - animStart) / duration, 0, 1);
    const eased = f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2;
    state.morph = animFrom + (state.morphTarget - animFrom) * eased;
    $('morph').value = String(Math.round(state.morph * 100));
    $('morph-out').textContent = Math.round(state.morph * 100) + '%';
    render();
    if (f < 1) window.requestAnimationFrame(stepMorph);
  };

  let lastRhMode = false;

  const setReadoutMin = (on) => {
    $('readout').classList.toggle('min', on);
    const b = $('readout-toggle');
    b.textContent = on ? '+' : '−';
    b.setAttribute('aria-expanded', String(!on));
    b.setAttribute('aria-label', t(on ? 'Expand current conditions' : 'Minimize current conditions'));
  };

  const syncChartType = () => {
    const rhMode = state.morphTarget >= 0.5;
    if (rhMode !== lastRhMode) { // minimize the conditions box in the RH chart, restore it in the psychrometric chart
      lastRhMode = rhMode;
      setReadoutMin(rhMode);
      updateReadout();
    }
    $('btn-psy').classList.toggle('active', !rhMode);
    $('btn-rh').classList.toggle('active', rhMode);
    $('btn-psy').setAttribute('aria-pressed', String(!rhMode));
    $('btn-rh').setAttribute('aria-pressed', String(rhMode));
  };

  /* ---------------------------------------------------------------- */
  /* Pointer interaction                                               */
  /* ---------------------------------------------------------------- */

  const localPoint = (e) => {
    const rect = canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  };

  const hitPoint = (xy) => {
    for (let i = state.points.length - 1; i >= 0; i--) {
      const s = toScreen(state.points[i].t, state.points[i].w);
      if (Math.hypot(s[0] - xy[0], s[1] - xy[1]) <= 11) return i;
    }
    return -1;
  };

  // Givoni zones under the pointer (highlighted while hovering).
  let hoverSet = {};
  let hoverKey = '';
  const setHover = (pos) => {
    const ids = [];
    if (pos && state.comfort === 'givoni') {
      G.setMeanOutdoor(effectiveTOut());
      G.zones.forEach((z) => {
        if (z.show && G.contains(z, pos.t, pos.w, state.pressure)) ids.push(z.id);
      });
    }
    const key = ids.join(',');
    if (key === hoverKey) return;
    hoverKey = key;
    hoverSet = {};
    ids.forEach((id) => { hoverSet[id] = true; });
    scheduleRender();
  };

  // True only inside the plot rectangle and on or below the 100% RH line.
  const inChart = (xy) => {
    if (xy[0] < plot.x0 || xy[0] > plot.x1 || xy[1] < plot.y0 || xy[1] > plot.y1) return false;
    const t = state.tMin + ((xy[0] - plot.x0) / (plot.x1 - plot.x0)) * (state.tMax - state.tMin);
    const target = (plot.y1 - xy[1]) / (plot.y1 - plot.y0);
    return target <= yFraction(t, wTopAt(t)) + 1e-9;
  };

  canvas.addEventListener('pointerdown', (e) => {
    const xy = localPoint(e);
    const hit = hitPoint(xy);
    if (hit < 0 && !inChart(xy)) return;
    canvas.setPointerCapture(e.pointerId);
    canvas.focus({ preventScroll: true });
    if (hit >= 0) {
      state.selected = hit;
      drag = { type: 'point', index: hit };
      renderPoints();
    } else {
      if (state.selected >= 0) {
        state.selected = -1;
        renderPoints();
      }
      drag = { type: 'indicator' };
      const pos = fromScreen(xy[0], xy[1]);
      setIndicator(pos.t, pos.w);
      markClick(xy);
      document.dispatchEvent(new CustomEvent('psychro:chartclick'));
    }
    scheduleRender();
  });

  canvas.addEventListener('pointermove', (e) => {
    const xy = localPoint(e);
    if (!drag) {
      const over = inChart(xy);
      canvas.style.cursor = hitPoint(xy) >= 0 ? 'grab' : over ? 'crosshair' : 'default';
      setHover(over ? fromScreen(xy[0], xy[1]) : null);
      return;
    }
    const pos = fromScreen(xy[0], xy[1]);
    if (drag.type === 'point') {
      const pt = state.points[drag.index];
      pt.t = pos.t;
      pt.w = pos.w;
      updatePointValues();
      scheduleRender();
    } else {
      setIndicator(pos.t, pos.w);
    }
  });

  const endDrag = (e) => {
    if (drag && canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    drag = null;
  };

  canvas.addEventListener('pointerleave', () => { if (!drag) setHover(null); });
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  canvas.addEventListener('keydown', (e) => {
    const ind = state.indicator;
    const big = e.shiftKey ? 10 : e.ctrlKey || e.metaKey ? 0.1 : 1;
    const rh = P.rhFromW(ind.t, ind.w, state.pressure);
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const t = clamp(ind.t + (e.key === 'ArrowLeft' ? -0.5 : 0.5) * big, state.tMin, state.tMax);
      setIndicator(t, P.wFromRh(t, rh, state.pressure));
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const nr = clamp(rh + (e.key === 'ArrowUp' ? 0.01 : -0.01) * big, 0, 1);
      setIndicator(ind.t, P.wFromRh(ind.t, nr, state.pressure));
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && state.selected >= 0) {
      e.preventDefault();
      removePoint(state.selected);
    } else if (e.key === 'Enter') {
      addPoint();
    }
  });

  const addPoint = () => {
    state.points.push({ t: state.indicator.t, w: state.indicator.w, label: '' });
    state.selected = state.points.length - 1;
    renderPoints();
    scheduleRender();
  };

  /* ---------------------------------------------------------------- */
  /* Controls                                                          */
  /* ---------------------------------------------------------------- */

  const num = (id, fallback) => {
    const v = parseFloat($(id).value);
    return Number.isFinite(v) ? v : fallback;
  };

  const bindSlider = (rangeId, numId, apply) => {
    $(rangeId).addEventListener('input', () => {
      apply(parseFloat($(rangeId).value));
    });
    $(numId).addEventListener('change', () => {
      const v = parseFloat($(numId).value);
      if (Number.isFinite(v)) apply(v);
    });
  };

  bindSlider('dbt', 'dbt-num', (t) => {
    const rh = P.rhFromW(state.indicator.t, state.indicator.w, state.pressure);
    t = clamp(t, state.tMin, state.tMax);
    setIndicator(t, P.wFromRh(t, clamp(rh, 0, 1), state.pressure));
  });

  bindSlider('rh', 'rh-num', (rh) => {
    setIndicator(state.indicator.t, P.wFromRh(state.indicator.t, clamp(rh, 0, 100) / 100, state.pressure));
  });

  $('btn-psy').addEventListener('click', () => { animateMorph(0); });
  $('btn-rh').addEventListener('click', () => { animateMorph(1); });
  $('morph').addEventListener('input', () => {
    state.morph = parseFloat($('morph').value) / 100;
    state.morphTarget = state.morph;
    syncChartType();
    $('morph-out').textContent = Math.round(state.morph * 100) + '%';
    syncChartType();
    scheduleRender();
  });

  const syncComfortControls = () => {
    $('pmv-controls').hidden = state.comfort !== 'pmv';
    $('adaptive-controls').hidden = state.comfort !== 'adaptive' && state.comfort !== 'givoni'; // Givoni zones also use the mean outdoor temperature
    $('givoni-controls').hidden = state.comfort !== 'givoni';
  };

  const renderGivoniZones = () => {
    const list = $('givoni-zones');
    list.textContent = '';
    G.zones.slice().reverse().forEach((gz) => {
      const label = document.createElement('label');
      label.className = 'zone-toggle';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = gz.show;
      cb.addEventListener('change', () => {
        gz.show = cb.checked;
        buildComfort();
        scheduleRender();
      });
      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.background = 'rgba(' + gz.rgb + ',0.25)';
      swatch.style.borderColor = 'rgb(' + gz.rgb + ')';
      const code = document.createElement('span');
      code.className = 'zone-code';
      code.style.color = 'rgb(' + gz.rgb + ')';
      code.textContent = gz.code;
      const name = document.createElement('span');
      name.textContent = t(gz.name);
      label.appendChild(cb);
      label.appendChild(swatch);
      label.appendChild(code);
      label.appendChild(name);
      list.appendChild(label);
    });
  };

  $('comfort-model').addEventListener('change', () => {
    state.comfort = $('comfort-model').value;
    syncComfortControls();
    buildComfort();
    buildData();
    updateReadout();
    scheduleRender();
  });

  ['met', 'clo', 'vel', 'mrt', 'tout'].forEach((id) => {
    $(id).addEventListener('change', () => {
      state.met = clamp(num('met', 1.1), 0.7, 4);
      state.clo = clamp(num('clo', 0.5), 0, 2);
      state.vel = clamp(num('vel', 0.1), 0, 2);
      state.mrtOffset = clamp(num('mrt', 0), -10, 10);
      state.tOut = clamp(num('tout', 20), -10, 45);
      buildComfort();
      buildData();
      updateReadout();
      scheduleRender();
    });
  });

  $('readout-toggle').addEventListener('click', () => {
    setReadoutMin(!$('readout').classList.contains('min'));
  });

  $('tout-auto').addEventListener('change', () => {
    const wasAuto = state.tOutAuto;
    state.tOutAuto = $('tout-auto').checked;
    // Turning "From weather data" off keeps the value shown in the box as the manual setting.
    if (wasAuto && !state.tOutAuto) state.tOut = clamp(num('tout', state.tOut), -10, 45);
    $('tout').disabled = state.tOutAuto && !!state.data;
    buildComfort();
    buildData();
    updateReadout();
    scheduleRender();
  });

  $('add-point').addEventListener('click', addPoint);
  $('clear-points').addEventListener('click', () => {
    state.points = [];
    state.selected = -1;
    renderPoints();
    scheduleRender();
  });

  $('file-input').addEventListener('change', () => {
    const file = $('file-input').files[0];
    if (file) loadFile(file);
    $('file-input').value = '';
  });

  $('month').addEventListener('change', () => {
    state.month = parseInt($('month').value, 10) || 0;
    buildComfort();
    buildData();
    updateReadout();
    scheduleRender();
  });

  $('show-data').addEventListener('change', () => {
    state.showData = $('show-data').checked;
    scheduleRender();
  });

  $('clear-data').addEventListener('click', () => {
    state.data = null;
    state.station = null;
    $('station').hidden = true;
    state.tMin = 0;
    state.tMax = 50;
    state.wMax = 35;
    $('tmin').value = '0';
    $('tmax').value = '50';
    $('wmax').value = '35';
    $('dbt').min = '0';
    $('dbt').max = '50';
    setIndicator(state.indicator.t, state.indicator.w);
    rebuild();
  });

  ['tmin', 'tmax', 'wmax'].forEach((id) => {
    $(id).addEventListener('change', () => {
      const tMin = Math.round(num('tmin', 0));
      let tMax = Math.round(num('tmax', 50));
      if (tMax - tMin < 10) tMax = tMin + 10;
      state.tMin = clamp(tMin, -40, 60);
      state.tMax = clamp(tMax, state.tMin + 10, 70);
      state.wMax = clamp(Math.round(num('wmax', 35)), 5, 100);
      $('tmin').value = String(state.tMin);
      $('tmax').value = String(state.tMax);
      $('wmax').value = String(state.wMax);
      $('dbt').min = String(state.tMin);
      $('dbt').max = String(state.tMax);
      setIndicator(state.indicator.t, state.indicator.w);
      rebuild();
    });
  });

  $('pressure').addEventListener('change', () => {
    setPressure(num('pressure', 101.325) * 1000);
    rebuild();
  });

  $('apply-elevation').addEventListener('click', () => {
    setPressure(P.pressureFromElevation(num('elevation', 0)));
    rebuild();
  });

  $('title').addEventListener('input', () => {
    state.title = $('title').value;
    scheduleRender();
  });

  $('subtitle').addEventListener('input', () => {
    state.subtitle = $('subtitle').value;
    scheduleRender();
  });

  /* ---------------------------------------------------------------- */
  /* Export                                                            */
  /* ---------------------------------------------------------------- */

  const download = (name, blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => { URL.revokeObjectURL(url); }, 1000);
  };

  const exportRows = () => {
    const rows = [{ name: t('Indicator'), t: state.indicator.t, w: state.indicator.w }];
    state.points.forEach((pt, i) => {
      rows.push({ name: pt.label || t('Point {n}', { n: i + 1 }), t: pt.t, w: pt.w });
    });
    return rows.map((r) => {
      const pr = P.properties(r.t, r.w, state.pressure);
      return {
        name: r.name,
        dryBulb_C: +pr.dryBulb.toFixed(2),
        relativeHumidity_pct: +(pr.relativeHumidity * 100).toFixed(2),
        humidityRatio_gkg: +(pr.humidityRatio * 1000).toFixed(3),
        wetBulb_C: +pr.wetBulb.toFixed(2),
        dewPoint_C: +pr.dewPoint.toFixed(2),
        vapourPressure_kPa: +(pr.vapourPressure / 1000).toFixed(4),
        absoluteHumidity_gm3: +pr.absoluteHumidity.toFixed(3),
        specificVolume_m3kg: +pr.specificVolume.toFixed(4),
        enthalpy_kJkg: +pr.enthalpy.toFixed(3),
        density_kgm3: +pr.density.toFixed(4)
      };
    });
  };

  $('export-png').addEventListener('click', () => {
    canvas.toBlob((blob) => {
      if (blob) download('psychrometric-chart.png', blob);
    }, 'image/png');
  });

  $('export-csv').addEventListener('click', () => {
    const rows = exportRows();
    const keys = Object.keys(rows[0]);
    const csv = keys.join(',') + '\n' + rows.map((r) => keys.map((k) => {
        const v = r[k];
        return typeof v === 'string' ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(',')).join('\n');
    download('psychrometric-data.csv', new Blob([csv], { type: 'text/csv' }));
  });

  $('export-json').addEventListener('click', () => {
    const payload = {
      pressure_Pa: state.pressure,
      comfort: state.comfort,
      points: exportRows()
    };
    download('psychrometric-data.json', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  });

  /* ---------------------------------------------------------------- */
  /* Drag & drop                                                       */
  /* ---------------------------------------------------------------- */

  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer || Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') < 0) return;
    e.preventDefault();
    dragDepth++;
    $('drop-overlay').hidden = false;
  });
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  window.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) $('drop-overlay').hidden = true;
  });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    $('drop-overlay').hidden = true;
    const file = e.dataTransfer && e.dataTransfer.files[0];
    if (file) loadFile(file);
  });

  /* ---------------------------------------------------------------- */
  /* Init                                                              */
  /* ---------------------------------------------------------------- */

  $('title').value = state.title;
  renderMetricsTable();
  renderPoints();
  renderGivoniZones();
  syncComfortControls();
  rebuild();

  // Language change: translate everything the scripts build dynamically
  document.addEventListener('i18n:change', (e) => {
    if (state.title === I18n.tIn(e.detail.previous, 'Psychrometric Chart')) { // still the default title
      state.title = t('Psychrometric Chart');
      $('title').value = state.title;
    }
    renderMetricsTable();
    renderPoints();
    renderGivoniZones();
    renderStation();
    setReadoutMin($('readout').classList.contains('min'));
    rebuild();
  });

  if (window.ResizeObserver) {
    new ResizeObserver(resize).observe($('chart-wrap'));
  } else {
    window.addEventListener('resize', resize);
  }
  resize();
})();
