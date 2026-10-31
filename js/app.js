(function () {
  'use strict';

  var P = window.Psychro;
  var C = window.Comfort;
  var G = window.Givoni;

  function $(id) {
    return document.getElementById(id);
  }

  var COLORS = {
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

  var MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  var FAMILIES = [
    { id: 'dbt', name: 'Dry-bulb temp.', unit: '°C', show: true },
    { id: 'w', name: 'Humidity ratio', unit: 'g/kg', show: true },
    { id: 'rh', name: 'Relative humidity', unit: '%', show: true },
    { id: 'wbt', name: 'Wet-bulb temp.', unit: '°C', show: false },
    { id: 'pv', name: 'Vapour pressure', unit: 'kPa', show: false },
    { id: 'v', name: 'Specific volume', unit: 'm³/kg', show: false },
    { id: 'h', name: 'Enthalpy', unit: 'kJ/kg', show: false }
  ];

  var state = {
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
    title: 'Psychrometric Chart',
    subtitle: ''
  };

  state.indicator.w = P.wFromRh(22, 0.5, state.pressure);

  var canvas = $('chart');
  var ctx = canvas.getContext('2d');
  var size = { w: 0, h: 0, dpr: 1 };
  var plot = { x0: 0, y0: 0, x1: 0, y1: 0 };
  var cache = { valid: [], comfort: [], bins: null, binMax: 0, stats: null };
  var renderQueued = false;
  var drag = null;

  /* ---------------------------------------------------------------- */
  /* Coordinate mapping                                                */
  /* ---------------------------------------------------------------- */

  function computeLayout() {
    var narrow = size.w < 560;
    plot.x0 = narrow ? 44 : 64;
    plot.x1 = size.w - (narrow ? 72 : 84);
    plot.y0 = 64;
    plot.y1 = size.h - 52;
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function yFraction(t, w) {
    var psy = (w * 1000) / state.wMax;
    if (state.morph === 0) return psy;
    var rh = clamp(P.rhFromW(t, w, state.pressure), 0, 1.05);
    return psy * (1 - state.morph) + rh * state.morph;
  }

  function toScreen(t, w) {
    var x = plot.x0 + ((t - state.tMin) / (state.tMax - state.tMin)) * (plot.x1 - plot.x0);
    var y = plot.y1 - yFraction(t, w) * (plot.y1 - plot.y0);
    return [x, y];
  }

  /* Highest humidity ratio that is both physically possible and inside the top of the plot. */
  function wTopAt(t) {
    var ws = P.wSat(t, state.pressure);
    if (yFraction(t, ws) <= 1) return ws;
    var lo = 0;
    var hi = ws;
    for (var i = 0; i < 40; i++) {
      var mid = (lo + hi) / 2;
      if (yFraction(t, mid) <= 1) lo = mid;
      else hi = mid;
    }
    return lo;
  }

  function fromScreen(x, y) {
    var t = state.tMin + ((x - plot.x0) / (plot.x1 - plot.x0)) * (state.tMax - state.tMin);
    t = clamp(t, state.tMin, state.tMax);
    var target = clamp((plot.y1 - y) / (plot.y1 - plot.y0), 0, 1);
    var wTop = wTopAt(t);
    if (target <= 0) return { t: t, w: 0 };
    if (target >= yFraction(t, wTop)) return { t: t, w: wTop };
    var lo = 0;
    var hi = wTop;
    for (var i = 0; i < 40; i++) {
      var mid = (lo + hi) / 2;
      if (yFraction(t, mid) < target) lo = mid;
      else hi = mid;
    }
    return { t: t, w: (lo + hi) / 2 };
  }

  function densify(pts, maxDt, maxDw) {
    maxDt = maxDt || 0.25;
    maxDw = maxDw || 0.0004;
    var out = [];
    for (var i = 0; i < pts.length; i++) {
      if (i > 0) {
        var a = pts[i - 1];
        var b = pts[i];
        var n = Math.ceil(Math.max(Math.abs(b[0] - a[0]) / maxDt, Math.abs(b[1] - a[1]) / maxDw));
        for (var k = 1; k < n; k++) {
          var f = k / n;
          out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
        }
      }
      out.push(pts[i]);
    }
    return out;
  }

  function insidePlot(p, pad) {
    pad = pad || 0.5;
    return p[0] >= plot.x0 - pad && p[0] <= plot.x1 + pad && p[1] >= plot.y0 - pad && p[1] <= plot.y1 + pad;
  }

  /* ---------------------------------------------------------------- */
  /* Line family construction                                          */
  /* ---------------------------------------------------------------- */

  function sampleCurve(fn, tStart) {
    var p = state.pressure;
    var segments = [];
    var t0 = Math.max(state.tMin, tStart === undefined ? state.tMin : tStart);
    var t1 = state.tMax;
    if (t0 >= t1) return segments;

    function valid(t) {
      var w = fn(t);
      return Number.isFinite(w) && w >= -1e-12 && w <= P.wSat(t, p) * (1 + 1e-9);
    }

    function boundary(ta, tb) {
      var va = valid(ta);
      var a = ta;
      var b = tb;
      for (var i = 0; i < 30; i++) {
        var m = (a + b) / 2;
        if (valid(m) === va) a = m;
        else b = m;
      }
      var t = va ? a : b;
      return [t, clamp(fn(t), 0, P.wSat(t, p))];
    }

    var step = 0.25;
    var n = Math.ceil((t1 - t0) / step);
    var current = null;
    var prevT = null;
    var prevValid = false;
    for (var i = 0; i <= n; i++) {
      var t = Math.min(t0 + i * step, t1);
      var v = valid(t);
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
  }

  function addLines(family, value, segments, major, label, anchor) {
    segments.forEach(function (pts, idx) {
      family.lines.push({
        value: value,
        pts: pts,
        major: major,
        label: idx === 0 ? label : null,
        anchor: anchor
      });
    });
  }

  function buildFamilies() {
    var p = state.pressure;
    var fam = {};
    FAMILIES.forEach(function (f) {
      f.lines = [];
      fam[f.id] = f;
    });

    for (var t = Math.ceil(state.tMin); t <= Math.floor(state.tMax); t++) {
      fam.dbt.lines.push({ value: t, pts: [[t, 0], [t, P.wSat(t, p)]], major: t % 5 === 0, label: null });
    }

    for (var r = 10; r <= 100; r += 10) {
      (function (rh) {
        addLines(fam.rh, rh, sampleCurve(function (tt) { return P.wFromRh(tt, rh / 100, p); }), true, rh + '%', 'rh');
      })(r);
    }

    var labelEvery = state.wMax > 32 ? 5 : state.wMax > 16 ? 2 : 1;
    for (var g = 1; g <= state.wMax; g++) {
      (function (gw) {
        addLines(fam.w, gw, sampleCurve(function () { return gw / 1000; }), gw % 5 === 0, gw % labelEvery === 0 ? String(gw) : null, 'right');
      })(g);
    }

    for (var twb = Math.ceil(state.tMin); twb <= state.tMax; twb++) {
      (function (tw) {
        var major = tw % 5 === 0;
        addLines(fam.wbt, tw, sampleCurve(function (tt) { return P.wFromWetBulb(tt, tw, p); }, tw), major, major ? tw + '°' : null, 'start');
      })(twb);
    }

    var pvMax = P.saturationPressure(state.tMax) / 1000;
    for (var pv = 0.5; pv <= pvMax; pv += 0.5) {
      (function (kpa) {
        var major = Math.abs(kpa - Math.round(kpa)) < 1e-6;
        addLines(fam.pv, kpa, sampleCurve(function () { return P.wFromPw(kpa * 1000, p); }), major, major ? kpa.toFixed(1) + ' kPa' : null, 'endInside');
      })(pv);
    }

    for (var vi = 70; vi <= 110; vi++) {
      (function (vv) {
        var v = vv / 100;
        var major = vv % 5 === 0;
        addLines(fam.v, v, sampleCurve(function (tt) { return P.wFromSpecificVolume(tt, v, p); }), major, vv % 2 === 0 ? v.toFixed(2) : null, 'end');
      })(vi);
    }

    for (var h = -20; h <= 250; h += 5) {
      (function (hh) {
        var major = hh % 10 === 0;
        addLines(fam.h, hh, sampleCurve(function (tt) { return P.wFromEnthalpy(tt, hh); }), major, major ? String(hh) : null, 'start');
      })(h);
    }

    var sat = [];
    for (var ts = state.tMin; ts <= state.tMax + 1e-9; ts += 0.25) sat.push([ts, P.wSat(ts, p)]);
    cache.saturation = sat;
    cache.valid = sat.concat([[state.tMax, 0], [state.tMin, 0]]);
  }

  /* ---------------------------------------------------------------- */
  /* Comfort zones                                                     */
  /* ---------------------------------------------------------------- */

  function pmvAt(t, w) {
    return C.pmv(t, t + state.mrtOffset, state.vel, P.pwFromW(w, state.pressure), state.met, state.clo);
  }

  function solveT(w, target) {
    var lo = -10;
    var hi = 50;
    var pa = P.pwFromW(w, state.pressure);
    function f(t) {
      return C.pmv(t, t + state.mrtOffset, state.vel, pa, state.met, state.clo).pmv;
    }
    if (f(lo) > target) return lo;
    if (f(hi) < target) return hi;
    for (var i = 0; i < 36; i++) {
      var m = (lo + hi) / 2;
      var v = f(m);
      if (!Number.isFinite(v) || v < target) lo = m;
      else hi = m;
    }
    return (lo + hi) / 2;
  }

  function saturationBetween(tFrom, tTo) {
    var out = [];
    var step = tFrom < tTo ? 0.25 : -0.25;
    for (var t = tFrom; step > 0 ? t <= tTo : t >= tTo; t += step) out.push([t, P.wSat(t, state.pressure)]);
    out.push([tTo, P.wSat(tTo, state.pressure)]);
    return out;
  }

  function bandPolygon(lo, hi) {
    lo = Math.max(lo, state.tMin);
    hi = Math.min(hi, state.tMax);
    if (hi <= lo) return null;
    return [[lo, 0], [hi, 0]].concat(saturationBetween(hi, lo));
  }

  function buildComfort() {
    var zones = [];
    var note = '';
    if (state.comfort === 'pmv') {
      [0.7, 0.5, 0.2].forEach(function (level, idx) {
        var left = [];
        var right = [];
        var rows = 90;
        var wTop = state.wMax / 1000;
        for (var i = 0; i <= rows; i++) {
          var w = (wTop * i) / rows;
          var tLo = solveT(w, -level);
          var tHi = solveT(w, level);
          var lo = Math.max(tLo, P.dewPoint(tHi, w, state.pressure));
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
      note = 'Shaded bands show |PMV| ≤ 0.7, 0.5 and 0.2 (ISO 7730 categories III, II, I). Mean radiant temperature = air temperature + radiant offset.';
    } else if (state.comfort === 'adaptive') {
      var tOut = effectiveTOut();
      var a = C.adaptive(tOut);
      var z80 = bandPolygon(a.limits80[0], a.limits80[1]);
      var z90 = bandPolygon(a.limits90[0], a.limits90[1]);
      if (z80) zones.push({ poly: z80, alpha: 0.16, label: '80% acceptability' });
      if (z90) zones.push({ poly: z90, alpha: 0.24, label: '90% acceptability' });
      note =
        'Neutral operative temperature ' + a.neutral.toFixed(1) + ' °C for a mean outdoor temperature of ' + tOut.toFixed(1) + ' °C.' +
        (a.applicable ? '' : ' Outside the 10–33.5 °C range of applicability, limits are clamped.');
    } else if (state.comfort === 'givoni') {
      G.zones.forEach(function (gz) {
        if (!gz.show) return;
        var poly = G.polygon(gz, state.pressure);
        // Keep corners inside the chart: at low pressure (altitude) the saturation curve rises above the top edge.
        var wCap = state.wMax / 1000;
        if (poly) zones.push({ poly: poly.map(function (v) { return [v[0], Math.min(v[1], wCap)]; }), zone: gz, label: gz.name });
      });
      note = 'Building bioclimatic chart after Givoni (1998), developed-country limits. Areas outside every zone need active heating or air-conditioning. Boundaries are editable in js/givoni.js.';
    }
    cache.comfort = zones.map(function (z) {
      if (z.zone) z.tail = densify([z.poly[z.poly.length - 1], z.poly[0]], 0.25, 0.0004);
      z.poly = densify(z.poly, 0.25, 0.0004);
      return z;
    });
    $('comfort-note').textContent = note;
  }

  function inComfort(t, w) {
    if (state.comfort === 'pmv') {
      return Math.abs(pmvAt(t, w).pmv) <= 0.5;
    }
    if (state.comfort === 'adaptive') {
      var a = C.adaptive(effectiveTOut());
      return t >= a.limits80[0] && t <= a.limits80[1];
    }
    if (state.comfort === 'givoni') {
      return G.contains(G.zones[G.zones.length - 1], t, w, state.pressure);
    }
    return false;
  }

  function effectiveTOut() {
    if (state.tOutAuto && state.data) {
      var rows = filteredData();
      if (rows.length) {
        var sum = 0;
        for (var i = 0; i < rows.length; i++) sum += rows[i].t;
        return sum / rows.length;
      }
    }
    return state.tOut;
  }

  /* ---------------------------------------------------------------- */
  /* Weather data                                                      */
  /* ---------------------------------------------------------------- */

  function filteredData() {
    if (!state.data) return [];
    if (!state.month) return state.data;
    return state.data.filter(function (d) {
      return d.month === state.month;
    });
  }

  function buildData() {
    cache.bins = null;
    cache.stats = null;
    if (!state.data) return;
    var rows = filteredData();
    var bins = {};
    var max = 0;
    var comfortHours = 0;
    var strategyHours = {};
    var p = state.pressure;
    for (var i = 0; i < rows.length; i++) {
      var d = rows[i];
      var w = P.wFromRh(d.t, d.rh, p);
      d.w = w;
      if (state.comfort === 'givoni') {
        G.classify(d.t, w, p).forEach(function (z) {
          strategyHours[z.name] = (strategyHours[z.name] || 0) + 1;
        });
        if (strategyHours.Comfort && G.contains(G.zones[G.zones.length - 1], d.t, w, p)) comfortHours++;
      } else if (state.comfort !== 'none' && inComfort(d.t, w)) comfortHours++;
      var bx = Math.floor(d.t);
      var by = Math.floor(w * 1000);
      if (d.t < state.tMin || d.t > state.tMax || by >= state.wMax) continue;
      var key = bx + ':' + by;
      bins[key] = (bins[key] || 0) + 1;
      if (bins[key] > max) max = bins[key];
    }
    cache.bins = bins;
    cache.binMax = max;
    cache.stats = { total: rows.length, comfort: comfortHours };

    var period = state.month ? MONTHS[state.month] : 'full year';
    var text = rows.length + ' hourly records (' + period + '). Darkest cell: ' + max + ' h.';
    var stats = $('data-stats');
    if (state.comfort === 'givoni' && rows.length) {
      stats.textContent = text + ' Hours where each strategy is effective (zones overlap, so totals exceed 100%):';
      var ul = document.createElement('ul');
      ul.className = 'strategy-stats';
      Object.keys(strategyHours)
        .sort(function (a, b) { return strategyHours[b] - strategyHours[a]; })
        .forEach(function (name) {
          var li = document.createElement('li');
          var label = document.createElement('span');
          label.textContent = name;
          var val = document.createElement('span');
          val.textContent = ((strategyHours[name] / rows.length) * 100).toFixed(1) + '%';
          li.appendChild(label);
          li.appendChild(val);
          ul.appendChild(li);
        });
      stats.appendChild(ul);
      return;
    }
    if (state.comfort !== 'none' && rows.length) {
      text += ' ' + comfortHours + ' h (' + ((comfortHours / rows.length) * 100).toFixed(1) + '%) fall inside the ' +
        (state.comfort === 'pmv' ? 'PMV ±0.5' : 'adaptive 80%') + ' comfort zone.';
    }
    stats.textContent = text;
  }

  function parseWeather(text, fileName) {
    var lines = text.split(/\r?\n/);
    var rows = [];
    var station = null;

    if (/^LOCATION/i.test(lines[0])) {
      var loc = lines[0].split(',');
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
      for (var i = 8; i < lines.length; i++) {
        var f = lines[i].split(',');
        if (f.length < 10) continue;
        var t = parseFloat(f[6]);
        var rh = parseFloat(f[8]);
        if (!Number.isFinite(t) || !Number.isFinite(rh) || t >= 99.9 || rh > 100 || rh < 0) continue;
        rows.push({ month: parseInt(f[1], 10), t: t, rh: rh / 100 });
      }
    } else {
      var header = lines[0].split(/[,;\t]/).map(function (s) { return s.trim().toLowerCase(); });
      var hasHeader = header.some(function (s) { return /[a-z]/.test(s); });
      var ti = 0;
      var ri = 1;
      var mi = -1;
      if (hasHeader) {
        ti = header.findIndex(function (s) { return /dry.?bulb|drybulb|temp/.test(s); });
        ri = header.findIndex(function (s) { return /relative.?humid|\brh\b|humidity/.test(s); });
        mi = header.findIndex(function (s) { return /^month$|\bmonth\b/.test(s); });
        if (ti < 0) ti = 0;
        if (ri < 0) ri = 1;
      }
      var maxRh = 0;
      for (var j = hasHeader ? 1 : 0; j < lines.length; j++) {
        var c = lines[j].split(/[,;\t]/);
        if (c.length < 2) continue;
        var tt = parseFloat(c[ti]);
        var rr = parseFloat(c[ri]);
        if (!Number.isFinite(tt) || !Number.isFinite(rr)) continue;
        if (rr > maxRh) maxRh = rr;
        rows.push({ month: mi >= 0 ? parseInt(c[mi], 10) || 0 : 0, t: tt, rh: rr });
      }
      var scale = maxRh > 1.5 ? 100 : 1;
      rows.forEach(function (r) { r.rh = clamp(r.rh / scale, 0, 1); });
      station = { name: fileName };
    }

    if (!rows.length) {
      window.alert('No usable dry-bulb temperature / relative humidity data was found in ' + fileName + '.');
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
    var tLo = Infinity;
    var tHi = -Infinity;
    var wHi = 0;
    rows.forEach(function (r) {
      if (r.t < tLo) tLo = r.t;
      if (r.t > tHi) tHi = r.t;
      var wg = P.wFromRh(r.t, r.rh, state.pressure) * 1000;
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
  }

  function renderStation() {
    var s = state.station;
    var dl = $('station-info');
    dl.textContent = '';
    if (!s) return;
    var entries = [
      ['Name', s.name],
      ['Region', s.region],
      ['Country', s.country],
      ['WMO', s.wmo],
      ['Latitude', Number.isFinite(s.latitude) ? s.latitude.toFixed(2) + '°' : null],
      ['Longitude', Number.isFinite(s.longitude) ? s.longitude.toFixed(2) + '°' : null],
      ['Timezone', Number.isFinite(s.timezone) ? 'UTC' + (s.timezone >= 0 ? '+' : '') + s.timezone : null],
      ['Elevation', Number.isFinite(s.elevation) ? s.elevation + ' m' : null]
    ];
    entries.forEach(function (e) {
      if (e[1] === undefined || e[1] === null || e[1] === '') return;
      var dt = document.createElement('dt');
      dt.textContent = e[0];
      var dd = document.createElement('dd');
      dd.textContent = e[1];
      dl.appendChild(dt);
      dl.appendChild(dd);
    });
  }

  function loadFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      parseWeather(String(reader.result), file.name);
    };
    reader.readAsText(file);
  }

  /* ---------------------------------------------------------------- */
  /* Rendering                                                         */
  /* ---------------------------------------------------------------- */

  function pathFrom(pts) {
    ctx.beginPath();
    for (var i = 0; i < pts.length; i++) {
      var s = toScreen(pts[i][0], pts[i][1]);
      if (i === 0) ctx.moveTo(s[0], s[1]);
      else ctx.lineTo(s[0], s[1]);
    }
  }

  function screenPts(pts) {
    var out = new Array(pts.length);
    for (var i = 0; i < pts.length; i++) out[i] = toScreen(pts[i][0], pts[i][1]);
    return out;
  }

  function haloText(text, x, y, color, bold) {
    ctx.font = (bold ? '600 ' : '') + '10px ' + getComputedStyle(document.body).fontFamily;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function clipPlot() {
    ctx.beginPath();
    ctx.rect(plot.x0, plot.y0, plot.x1 - plot.x0, plot.y1 - plot.y0);
    ctx.clip();
  }

  function drawFamilies() {
    var hl = state.highlight;
    var order = FAMILIES.filter(function (f) { return f.show && f.id !== hl; });
    var hlFam = FAMILIES.find(function (f) { return f.id === hl && f.show; });
    if (hlFam) order.push(hlFam);

    order.forEach(function (fam) {
      var isHl = fam.id === hl;
      ctx.globalAlpha = hl && !isHl ? 0.4 : 1;
      fam.lines.forEach(function (line) {
        line._s = screenPts(line.pts);
        ctx.beginPath();
        for (var i = 0; i < line._s.length; i++) {
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
        }
        ctx.stroke();
      });
    });
    ctx.globalAlpha = 1;
  }

  // Where an RH line leaves the plot: the crossing point with the top or right edge, and which edge it was.
  function rhExit(s) {
    for (var i = s.length - 1; i >= 0; i--) {
      if (!insidePlot(s[i])) continue;
      var p0 = s[i];
      var p1 = s[i + 1];
      if (!p1) return { x: p0[0], y: p0[1], top: false };
      var fx = p1[0] > plot.x1 ? (plot.x1 - p0[0]) / (p1[0] - p0[0]) : 1;
      var fy = p1[1] < plot.y0 ? (plot.y0 - p0[1]) / (p1[1] - p0[1]) : 1;
      var f = Math.min(fx, fy);
      return { x: p0[0] + f * (p1[0] - p0[0]), y: p0[1] + f * (p1[1] - p0[1]), top: fy < fx };
    }
    return { x: s[0][0], y: s[0][1], top: false };
  }

  function drawFamilyLabels() {
    var hl = state.highlight;
    ctx.textBaseline = 'middle';
    FAMILIES.forEach(function (fam) {
      if (!fam.show || fam.id === 'dbt') return;
      var isHl = fam.id === hl;
      var color = isHl ? COLORS.accent : COLORS.muted;
      var baseAlpha = hl && !isHl ? 0.5 : 1;
      var placed = [];
      fam.lines.forEach(function (line) {
        ctx.globalAlpha = baseAlpha * (line.anchor === 'right' ? 1 - state.morph : 1);
        if (ctx.globalAlpha <= 0.02) return;
        if (!line.label || !line._s) return;
        var s = line._s;
        var anchor = null;
        var i;
        if (line.anchor === 'start') {
          for (i = 0; i < s.length; i++) if (insidePlot(s[i])) { anchor = s[i]; break; }
        } else {
          for (i = s.length - 1; i >= 0; i--) if (insidePlot(s[i])) { anchor = s[i]; break; }
        }
        if (!anchor) return;
        var x = anchor[0];
        var y = anchor[1];
        var lx;
        var ly;
        var align;
        if (line.anchor === 'right') {
          if (x < plot.x1 - 2) return;
          align = 'left';
          lx = plot.x1 + 6;
          ly = y;
        } else if (line.anchor === 'rh') {
          var ex = rhExit(s);
          if (ex.top) { // leaves through the top edge: label above the chart
            align = 'center';
            lx = ex.x;
            ly = plot.y0 - 9;
          } else { // leaves through the right edge (the only case in the RH chart): label outside, to the right
            align = 'left';
            lx = plot.x1 + 6 + 24 * (1 - state.morph);
            ly = ex.y;
          }
        } else if (line.anchor === 'start') {
          align = 'right';
          lx = x - 4;
          ly = y - 5;
        } else if (line.anchor === 'endInside') {
          align = 'right';
          lx = x - 4;
          ly = y - 6;
        } else {
          align = 'left';
          lx = x + 3;
          ly = y - 7;
        }
        ctx.font = (isHl ? '600 ' : '') + '10px ' + getComputedStyle(document.body).fontFamily;
        var width = ctx.measureText(line.label).width + 4;
        var left = align === 'right' ? lx - width : align === 'center' ? lx - width / 2 : lx;
        var slack = line.anchor === 'rh' ? 6 : 0; // neighbouring RH labels along the top may overlap slightly
        var collides = placed.some(function (b) {
          return left < b.x + b.w - slack && left + width > b.x + slack && Math.abs(ly - b.y) < 11;
        });
        if (collides) return;
        placed.push({ x: left, y: ly, w: width });
        ctx.textAlign = align;
        haloText(line.label, lx, ly, color, isHl);
      });
      ctx.globalAlpha = 1;
    });
  }

  function drawData() {
    if (!cache.bins || !state.showData) return;
    var max = cache.binMax || 1;
    Object.keys(cache.bins).forEach(function (key) {
      var parts = key.split(':');
      var t = Number(parts[0]);
      var g = Number(parts[1]);
      var w0 = g / 1000;
      var w1 = (g + 1) / 1000;
      var a = toScreen(t, w0);
      var b = toScreen(t + 1, w0);
      var c = toScreen(t + 1, w1);
      var d = toScreen(t, w1);
      var intensity = Math.sqrt(cache.bins[key] / max);
      ctx.fillStyle = 'rgba(' + COLORS.dataRgb + ',' + (0.12 + intensity * 0.78).toFixed(3) + ')';
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.lineTo(c[0], c[1]);
      ctx.lineTo(d[0], d[1]);
      ctx.closePath();
      ctx.fill();
    });
  }

  function drawComfort() {
    cache.comfort.forEach(function (z) {
      var gz = z.zone;
      if (gz) { // Givoni zone: fill only here (inside the clip); outlines are drawn by drawGivoniOutlines
        if (gz.fill) {
          pathFrom(z.poly);
          ctx.closePath();
          ctx.fillStyle = 'rgba(' + gz.fill + ')';
          ctx.fill();
        }
        return;
      }
      var rgb = z.zone ? z.zone.rgb : COLORS.accentRgb;
      pathFrom(z.poly);
      ctx.closePath();
      ctx.fillStyle = 'rgba(' + rgb + ',' + (z.zone ? (z.zone.id === 'c' ? 0.3 : 0.1) : z.alpha) + ')';
      ctx.fill();
      ctx.strokeStyle = 'rgba(' + rgb + ',0.85)';
      ctx.lineWidth = z.zone ? 1.4 : 1;
      ctx.stroke();
    });
  }

  // Zone outlines are drawn outside the plot clip so edges lying on the saturation curve or the W = 0 axis stay fully visible.
  function drawGivoniOutlines() {
    ctx.save();
    ctx.strokeStyle = '#3b3f45';
    ctx.lineJoin = 'round';
    cache.comfort.forEach(function (z) {
      var gz = z.zone;
      if (!gz) return;
      ctx.setLineDash(gz.dash || []);
      ctx.lineWidth = gz.width || 2.2;
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
        gz.extra(state.pressure).forEach(function (seg) {
          pathFrom(densify(seg.map(function (v) { return [v[0], Math.min(v[1], state.wMax / 1000)]; }), 0.25, 0.0004));
          ctx.stroke();
        });
      }
    });
    ctx.restore();
  }

  function drawGivoniLabels() {
    if (state.comfort !== 'givoni') return;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    G.zones.forEach(function (gz) {
      if (!gz.show || !gz.labels) return;
      gz.labels.forEach(function (l) {
        var wl = l.w / 1000;
        if (l.sat) { // sit just inside the saturation curve at any pressure
          var ws = Math.min(P.wSat(l.t, state.pressure), state.wMax / 1000);
          wl = ws - 0.15 * (ws - P.wFromRh(l.t, 0.8, state.pressure));
        }
        var s = toScreen(l.t, wl);
        var ang = l.v ? Math.PI / 2 : 0;
        if (l.sat) { // run the text along the saturation curve
          var a = toScreen(l.t - 0.5, P.wSat(l.t - 0.5, state.pressure));
          var b = toScreen(l.t + 0.5, P.wSat(l.t + 0.5, state.pressure));
          ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        }
        ctx.save();
        ctx.translate(s[0], s[1]);
        ctx.rotate(ang);
        haloText(l.text, 0, 0, '#3b3f45', true);
        ctx.restore();
      });
    });
  }

  function drawAxes() {
    var font = getComputedStyle(document.body).fontFamily;
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 1;
    ctx.strokeRect(plot.x0 + 0.5, plot.y0 + 0.5, plot.x1 - plot.x0 - 1, plot.y1 - plot.y0 - 1);

    ctx.font = '11px ' + font;
    ctx.fillStyle = COLORS.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    var range = state.tMax - state.tMin;
    var step = range > 80 ? 10 : 5;
    for (var t = Math.ceil(state.tMin); t <= state.tMax; t++) {
      var x = toScreen(t, 0)[0];
      var major = t % step === 0;
      ctx.beginPath();
      ctx.moveTo(x, plot.y1);
      ctx.lineTo(x, plot.y1 + (major ? 6 : 3));
      ctx.stroke();
      if (major) ctx.fillText(String(t), x, plot.y1 + 8);
    }
    ctx.font = '600 11px ' + font;
    ctx.fillText('Dry-bulb temperature (°C)', (plot.x0 + plot.x1) / 2, plot.y1 + 26);

    ctx.save();
    ctx.globalAlpha = 1 - state.morph;
    ctx.translate(size.w - 12, (plot.y0 + plot.y1) / 2);
    ctx.rotate(Math.PI / 2);
    ctx.textBaseline = 'middle';
    ctx.fillText('Humidity ratio (g/kg dry air)', 0, 0);
    ctx.restore();

    if (state.morph > 0) {
      ctx.save();
      ctx.globalAlpha = state.morph;
      ctx.font = '11px ' + font;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (var r = 0; r <= 100; r += 10) {
        var y = plot.y1 - (r / 100) * (plot.y1 - plot.y0);
        ctx.beginPath();
        ctx.moveTo(plot.x0 - 5, y);
        ctx.lineTo(plot.x0, y);
        ctx.stroke();
        ctx.fillText(r + '%', plot.x0 - 7, y);
      }
      ctx.translate(12, (plot.y0 + plot.y1) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.font = '600 11px ' + font;
      ctx.textAlign = 'center';
      ctx.fillText('Relative humidity (%)', 0, 0);
      ctx.restore();
    }
  }

  function drawTitle() {
    var font = getComputedStyle(document.body).fontFamily;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = COLORS.ink;
    ctx.font = '650 16px ' + font;
    ctx.fillText(state.title, plot.x0, 28);
    ctx.fillStyle = COLORS.muted;
    ctx.font = '12px ' + font;
    ctx.fillText(state.subtitle || autoSubtitle(), plot.x0, 46);
  }

  function autoSubtitle() {
    var parts = ['Atmospheric pressure ' + (state.pressure / 1000).toFixed(3) + ' kPa'];
    if (state.comfort === 'pmv') parts.push('PMV comfort: ' + state.met + ' met, ' + state.clo + ' clo, ' + state.vel + ' m/s');
    if (state.comfort === 'adaptive') parts.push('Adaptive comfort, mean outdoor ' + effectiveTOut().toFixed(1) + ' °C');
    if (state.comfort === 'givoni') parts.push('Givoni bioclimatic zones');
    if (state.station && state.station.name) parts.push(state.station.name + (state.month ? ' – ' + MONTHS[state.month] : ''));
    return parts.join('  ·  ');
  }

  function drawProcess() {
    if (!state.points.length) return;
    var font = getComputedStyle(document.body).fontFamily;
    if (state.points.length > 1) {
      var pts = state.points.map(function (pt) { return [pt.t, pt.w]; });
      pathFrom(densify(pts, 0.2, 0.0002));
      ctx.strokeStyle = COLORS.point;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    state.points.forEach(function (pt, i) {
      var s = toScreen(pt.t, pt.w);
      var selected = i === state.selected;
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
  }

  // Brief ring + dashed line from where you clicked to where the indicator snapped (shown when they differ).
  var ghost = null;
  function markClick(xy) {
    var s = toScreen(state.indicator.t, state.indicator.w);
    ghost = Math.hypot(s[0] - xy[0], s[1] - xy[1]) > 8 ? { x: xy[0], y: xy[1], t0: performance.now() } : null;
  }
  function drawGhost() {
    if (!ghost) return;
    var age = performance.now() - ghost.t0;
    if (age > 700) { ghost = null; return; }
    var s = toScreen(state.indicator.t, state.indicator.w);
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
  }
  function drawIndicator() {
    var ind = state.indicator;
    var s = toScreen(ind.t, ind.w);
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
    if (state.morph > 0.5) ctx.lineTo(plot.x0, s[1]);
    else ctx.lineTo(plot.x1, s[1]);
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
  }

  function render() {
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
    drawAxes();
    drawFamilyLabels();
    drawGivoniLabels();
    drawProcess();
    drawIndicator();
    drawGhost();
  }

  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    window.requestAnimationFrame(render);
  }

  function resize() {
    var rect = canvas.getBoundingClientRect();
    size.dpr = window.devicePixelRatio || 1;
    size.w = rect.width;
    size.h = rect.height;
    canvas.width = Math.round(rect.width * size.dpr);
    canvas.height = Math.round(rect.height * size.dpr);
    computeLayout();
    var readout = $('readout');
    if (window.innerWidth > 860) {
      readout.style.left = plot.x0 + 10 + 'px';
      readout.style.top = plot.y0 + 10 + 'px';
    } else {
      readout.style.left = '';
      readout.style.top = '';
    }
    render();
  }

  /* ---------------------------------------------------------------- */
  /* UI updates                                                        */
  /* ---------------------------------------------------------------- */

  function fmt(v, digits) {
    return Number.isFinite(v) ? v.toFixed(digits) : '—';
  }

  function updateReadout() {
    var ind = state.indicator;
    var pr = P.properties(ind.t, ind.w, state.pressure);
    var rows = [
      ['Dry-bulb temp.', fmt(pr.dryBulb, 1) + ' °C'],
      ['Relative humidity', fmt(pr.relativeHumidity * 100, 1) + ' %'],
      ['Humidity ratio', fmt(pr.humidityRatio * 1000, 2) + ' g/kg'],
      ['Wet-bulb temp.', fmt(pr.wetBulb, 1) + ' °C'],
      ['Dew-point temp.', fmt(pr.dewPoint, 1) + ' °C'],
      ['Vapour pressure', fmt(pr.vapourPressure / 1000, 3) + ' kPa'],
      ['Abs. humidity', fmt(pr.absoluteHumidity, 2) + ' g/m³'],
      ['Specific volume', fmt(pr.specificVolume, 4) + ' m³/kg'],
      ['Enthalpy', fmt(pr.enthalpy, 2) + ' kJ/kg'],
      ['Density', fmt(pr.density, 3) + ' kg/m³']
    ];
    var html = '<h2>Current conditions</h2><dl>';
    rows.forEach(function (r) {
      html += '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>';
    });
    html += '</dl>';
    if (state.comfort === 'pmv') {
      var c = pmvAt(ind.t, ind.w);
      var ok = Math.abs(c.pmv) <= 0.5;
      html += '<div class="comfort-line"><dl><dt>PMV</dt><dd>' + fmt(c.pmv, 2) + '</dd><dt>PPD</dt><dd>' + fmt(c.ppd, 1) +
        ' %</dd><dt>Sensation</dt><dd class="' + (ok ? 'ok' : 'bad') + '">' + C.sensationLabel(c.pmv) + '</dd></dl></div>';
    } else if (state.comfort === 'adaptive') {
      var a = C.adaptive(effectiveTOut());
      var in90 = ind.t >= a.limits90[0] && ind.t <= a.limits90[1];
      var in80 = ind.t >= a.limits80[0] && ind.t <= a.limits80[1];
      html += '<div class="comfort-line"><dl><dt>Neutral temp.</dt><dd>' + fmt(a.neutral, 1) + ' °C</dd><dt>Acceptability</dt><dd class="' +
        (in80 ? 'ok' : 'bad') + '">' + (in90 ? '90%' : in80 ? '80%' : 'Outside') + '</dd></dl></div>';
    } else if (state.comfort === 'givoni') {
      var strategies = G.classify(ind.t, ind.w, state.pressure);
      var comfy = strategies.some(function (z) { return z.id === 'c'; });
      html += '<div class="comfort-line"><dl><dt>Strategy</dt><dd class="' + (comfy ? 'ok' : '') + '">' +
        strategies.map(function (z) { return z.name; }).join(', ') + '</dd></dl></div>';
      document.dispatchEvent(new CustomEvent('psychro:zones', { detail: { zones: strategies, t: ind.t, w: ind.w } }));
    }
    $('readout').innerHTML = html;

    var rhPct = clamp(pr.relativeHumidity * 100, 0, 100);
    $('dbt').value = String(ind.t);
    $('rh').value = String(rhPct);
    if (document.activeElement !== $('dbt-num')) $('dbt-num').value = ind.t.toFixed(1);
    if (document.activeElement !== $('rh-num')) $('rh-num').value = rhPct.toFixed(1);
  }

  function renderPoints() {
    var list = $('points-list');
    list.textContent = '';
    state.points.forEach(function (pt, i) {
      var li = document.createElement('li');
      li.className = 'point' + (i === state.selected ? ' selected' : '');

      var badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = String(i + 1);

      var body = document.createElement('div');
      var input = document.createElement('input');
      input.type = 'text';
      input.value = pt.label;
      input.placeholder = 'Point ' + (i + 1);
      input.setAttribute('aria-label', 'Label for point ' + (i + 1));
      input.addEventListener('input', function () {
        pt.label = input.value;
        scheduleRender();
      });
      input.addEventListener('focus', function () {
        state.selected = i;
        li.classList.add('selected');
        scheduleRender();
      });
      var vals = document.createElement('span');
      vals.className = 'vals';
      vals.textContent = pointSummary(pt);
      body.appendChild(input);
      body.appendChild(vals);

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn icon';
      del.setAttribute('aria-label', 'Remove point ' + (i + 1));
      del.textContent = '×';
      del.addEventListener('click', function () {
        removePoint(i);
      });

      li.appendChild(badge);
      li.appendChild(body);
      li.appendChild(del);
      list.appendChild(li);
    });
  }

  function pointSummary(pt) {
    var rh = P.rhFromW(pt.t, pt.w, state.pressure) * 100;
    return pt.t.toFixed(1) + ' °C · ' + rh.toFixed(0) + '% · ' + (pt.w * 1000).toFixed(1) + ' g/kg · ' + P.enthalpy(pt.t, pt.w).toFixed(1) + ' kJ/kg';
  }

  function updatePointValues() {
    var items = $('points-list').querySelectorAll('.vals');
    state.points.forEach(function (pt, i) {
      if (items[i]) items[i].textContent = pointSummary(pt);
    });
  }

  function removePoint(i) {
    state.points.splice(i, 1);
    if (state.selected === i) state.selected = -1;
    else if (state.selected > i) state.selected--;
    renderPoints();
    scheduleRender();
  }

  function renderMetricsTable() {
    var body = $('metrics-body');
    body.textContent = '';
    FAMILIES.forEach(function (fam) {
      var tr = document.createElement('tr');
      var name = document.createElement('td');
      name.textContent = fam.name;
      var unit = document.createElement('span');
      unit.className = 'unit';
      unit.textContent = fam.unit;
      name.appendChild(unit);

      var showTd = document.createElement('td');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = fam.show;
      cb.setAttribute('aria-label', 'Show ' + fam.name + ' lines');
      cb.addEventListener('change', function () {
        fam.show = cb.checked;
        scheduleRender();
      });
      showTd.appendChild(cb);

      var hlTd = document.createElement('td');
      var radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'highlight';
      radio.value = fam.id;
      radio.setAttribute('aria-label', 'Highlight ' + fam.name + ' lines');
      radio.addEventListener('change', function () {
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

    var tr = document.createElement('tr');
    var nameTd = document.createElement('td');
    nameTd.textContent = 'None';
    var empty = document.createElement('td');
    var hlTd = document.createElement('td');
    var none = document.createElement('input');
    none.type = 'radio';
    none.name = 'highlight';
    none.value = '';
    none.checked = true;
    none.setAttribute('aria-label', 'No highlight');
    none.addEventListener('change', function () {
      state.highlight = null;
      scheduleRender();
    });
    hlTd.appendChild(none);
    tr.appendChild(nameTd);
    tr.appendChild(empty);
    tr.appendChild(hlTd);
    body.appendChild(tr);
  }

  function rebuild() {
    buildFamilies();
    buildComfort();
    buildData();
    updateReadout();
    updatePointValues();
    scheduleRender();
  }

  function setIndicator(t, w) {
    state.indicator.t = clamp(t, state.tMin, state.tMax);
    state.indicator.w = clamp(w, 0, wTopAt(state.indicator.t));
    updateReadout();
    scheduleRender();
  }

  function setPressure(pa) {
    if (!Number.isFinite(pa) || pa < 30000 || pa > 120000) return;
    state.pressure = pa;
    $('pressure').value = (pa / 1000).toFixed(3);
  }

  /* ---------------------------------------------------------------- */
  /* Chart type morph                                                  */
  /* ---------------------------------------------------------------- */

  var animStart = null;
  var animFrom = 0;

  function animateMorph(target) {
    state.morphTarget = target;
    animFrom = state.morph;
    animStart = null;
    window.requestAnimationFrame(stepMorph);
    syncChartType();
  }

  function stepMorph(now) {
    if (animStart === null) animStart = now;
    var duration = 700;
    var f = clamp((now - animStart) / duration, 0, 1);
    var eased = f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2;
    state.morph = animFrom + (state.morphTarget - animFrom) * eased;
    $('morph').value = String(Math.round(state.morph * 100));
    $('morph-out').textContent = Math.round(state.morph * 100) + '%';
    render();
    if (f < 1) window.requestAnimationFrame(stepMorph);
  }

  function syncChartType() {
    var rhMode = state.morphTarget >= 0.5;
    $('btn-psy').classList.toggle('active', !rhMode);
    $('btn-rh').classList.toggle('active', rhMode);
    $('btn-psy').setAttribute('aria-pressed', String(!rhMode));
    $('btn-rh').setAttribute('aria-pressed', String(rhMode));
  }

  /* ---------------------------------------------------------------- */
  /* Pointer interaction                                               */
  /* ---------------------------------------------------------------- */

  function localPoint(e) {
    var rect = canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  function hitPoint(xy) {
    for (var i = state.points.length - 1; i >= 0; i--) {
      var s = toScreen(state.points[i].t, state.points[i].w);
      if (Math.hypot(s[0] - xy[0], s[1] - xy[1]) <= 11) return i;
    }
    return -1;
  }

  // True only inside the plot rectangle and on or below the 100% RH line.
  function inChart(xy) {
    if (xy[0] < plot.x0 || xy[0] > plot.x1 || xy[1] < plot.y0 || xy[1] > plot.y1) return false;
    var t = state.tMin + ((xy[0] - plot.x0) / (plot.x1 - plot.x0)) * (state.tMax - state.tMin);
    var target = (plot.y1 - xy[1]) / (plot.y1 - plot.y0);
    return target <= yFraction(t, wTopAt(t)) + 1e-9;
  }

  canvas.addEventListener('pointerdown', function (e) {
    var xy = localPoint(e);
    var hit = hitPoint(xy);
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
      var pos = fromScreen(xy[0], xy[1]);
      setIndicator(pos.t, pos.w);
      markClick(xy);
      document.dispatchEvent(new CustomEvent('psychro:chartclick'));
    }
    scheduleRender();
  });

  canvas.addEventListener('pointermove', function (e) {
    var xy = localPoint(e);
    if (!drag) {
      canvas.style.cursor = hitPoint(xy) >= 0 ? 'grab' : inChart(xy) ? 'crosshair' : 'default';
      return;
    }
    var pos = fromScreen(xy[0], xy[1]);
    if (drag.type === 'point') {
      var pt = state.points[drag.index];
      pt.t = pos.t;
      pt.w = pos.w;
      updatePointValues();
      scheduleRender();
    } else {
      setIndicator(pos.t, pos.w);
    }
  });

  function endDrag(e) {
    if (drag && canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    drag = null;
  }

  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  canvas.addEventListener('keydown', function (e) {
    var ind = state.indicator;
    var big = e.shiftKey ? 10 : e.ctrlKey || e.metaKey ? 0.1 : 1;
    var rh = P.rhFromW(ind.t, ind.w, state.pressure);
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      var t = clamp(ind.t + (e.key === 'ArrowLeft' ? -0.5 : 0.5) * big, state.tMin, state.tMax);
      setIndicator(t, P.wFromRh(t, rh, state.pressure));
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      var nr = clamp(rh + (e.key === 'ArrowUp' ? 0.01 : -0.01) * big, 0, 1);
      setIndicator(ind.t, P.wFromRh(ind.t, nr, state.pressure));
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && state.selected >= 0) {
      e.preventDefault();
      removePoint(state.selected);
    } else if (e.key === 'Enter') {
      addPoint();
    }
  });

  function addPoint() {
    state.points.push({ t: state.indicator.t, w: state.indicator.w, label: '' });
    state.selected = state.points.length - 1;
    renderPoints();
    scheduleRender();
  }

  /* ---------------------------------------------------------------- */
  /* Controls                                                          */
  /* ---------------------------------------------------------------- */

  function num(id, fallback) {
    var v = parseFloat($(id).value);
    return Number.isFinite(v) ? v : fallback;
  }

  function bindSlider(rangeId, numId, apply) {
    $(rangeId).addEventListener('input', function () {
      apply(parseFloat($(rangeId).value));
    });
    $(numId).addEventListener('change', function () {
      var v = parseFloat($(numId).value);
      if (Number.isFinite(v)) apply(v);
    });
  }

  bindSlider('dbt', 'dbt-num', function (t) {
    var rh = P.rhFromW(state.indicator.t, state.indicator.w, state.pressure);
    t = clamp(t, state.tMin, state.tMax);
    setIndicator(t, P.wFromRh(t, clamp(rh, 0, 1), state.pressure));
  });

  bindSlider('rh', 'rh-num', function (rh) {
    setIndicator(state.indicator.t, P.wFromRh(state.indicator.t, clamp(rh, 0, 100) / 100, state.pressure));
  });

  $('btn-psy').addEventListener('click', function () { animateMorph(0); });
  $('btn-rh').addEventListener('click', function () { animateMorph(1); });
  $('morph').addEventListener('input', function () {
    state.morph = parseFloat($('morph').value) / 100;
    state.morphTarget = state.morph;
    $('morph-out').textContent = Math.round(state.morph * 100) + '%';
    syncChartType();
    scheduleRender();
  });

  function syncComfortControls() {
    $('pmv-controls').hidden = state.comfort !== 'pmv';
    $('adaptive-controls').hidden = state.comfort !== 'adaptive';
    $('givoni-controls').hidden = state.comfort !== 'givoni';
  }

  function renderGivoniZones() {
    var list = $('givoni-zones');
    list.textContent = '';
    G.zones.slice().reverse().forEach(function (gz) {
      var label = document.createElement('label');
      label.className = 'zone-toggle';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = gz.show;
      cb.addEventListener('change', function () {
        gz.show = cb.checked;
        buildComfort();
        scheduleRender();
      });
      var swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.background = 'rgba(' + gz.rgb + ',0.25)';
      swatch.style.borderColor = 'rgb(' + gz.rgb + ')';
      var code = document.createElement('span');
      code.className = 'zone-code';
      code.style.color = 'rgb(' + gz.rgb + ')';
      code.textContent = gz.code;
      var name = document.createElement('span');
      name.textContent = gz.name;
      label.appendChild(cb);
      label.appendChild(swatch);
      label.appendChild(code);
      label.appendChild(name);
      list.appendChild(label);
    });
  }

  $('comfort-model').addEventListener('change', function () {
    state.comfort = $('comfort-model').value;
    syncComfortControls();
    buildComfort();
    buildData();
    updateReadout();
    scheduleRender();
  });

  ['met', 'clo', 'vel', 'mrt', 'tout'].forEach(function (id) {
    $(id).addEventListener('change', function () {
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

  $('tout-auto').addEventListener('change', function () {
    state.tOutAuto = $('tout-auto').checked;
    $('tout').disabled = state.tOutAuto && !!state.data;
    buildComfort();
    buildData();
    updateReadout();
    scheduleRender();
  });

  $('add-point').addEventListener('click', addPoint);
  $('clear-points').addEventListener('click', function () {
    state.points = [];
    state.selected = -1;
    renderPoints();
    scheduleRender();
  });

  $('file-input').addEventListener('change', function () {
    var file = $('file-input').files[0];
    if (file) loadFile(file);
    $('file-input').value = '';
  });

  $('month').addEventListener('change', function () {
    state.month = parseInt($('month').value, 10) || 0;
    buildComfort();
    buildData();
    updateReadout();
    scheduleRender();
  });

  $('show-data').addEventListener('change', function () {
    state.showData = $('show-data').checked;
    scheduleRender();
  });

  $('clear-data').addEventListener('click', function () {
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

  ['tmin', 'tmax', 'wmax'].forEach(function (id) {
    $(id).addEventListener('change', function () {
      var tMin = Math.round(num('tmin', 0));
      var tMax = Math.round(num('tmax', 50));
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

  $('pressure').addEventListener('change', function () {
    setPressure(num('pressure', 101.325) * 1000);
    rebuild();
  });

  $('apply-elevation').addEventListener('click', function () {
    setPressure(P.pressureFromElevation(num('elevation', 0)));
    rebuild();
  });

  $('title').addEventListener('input', function () {
    state.title = $('title').value;
    scheduleRender();
  });

  $('subtitle').addEventListener('input', function () {
    state.subtitle = $('subtitle').value;
    scheduleRender();
  });

  /* ---------------------------------------------------------------- */
  /* Export                                                            */
  /* ---------------------------------------------------------------- */

  function download(name, blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function exportRows() {
    var rows = [{ name: 'Indicator', t: state.indicator.t, w: state.indicator.w }];
    state.points.forEach(function (pt, i) {
      rows.push({ name: pt.label || 'Point ' + (i + 1), t: pt.t, w: pt.w });
    });
    return rows.map(function (r) {
      var pr = P.properties(r.t, r.w, state.pressure);
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
  }

  $('export-png').addEventListener('click', function () {
    canvas.toBlob(function (blob) {
      if (blob) download('psychrometric-chart.png', blob);
    }, 'image/png');
  });

  $('export-csv').addEventListener('click', function () {
    var rows = exportRows();
    var keys = Object.keys(rows[0]);
    var csv = keys.join(',') + '\n' + rows.map(function (r) {
      return keys.map(function (k) {
        var v = r[k];
        return typeof v === 'string' ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(',');
    }).join('\n');
    download('psychrometric-data.csv', new Blob([csv], { type: 'text/csv' }));
  });

  $('export-json').addEventListener('click', function () {
    var payload = {
      pressure_Pa: state.pressure,
      comfort: state.comfort,
      points: exportRows()
    };
    download('psychrometric-data.json', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  });

  /* ---------------------------------------------------------------- */
  /* Drag & drop                                                       */
  /* ---------------------------------------------------------------- */

  var dragDepth = 0;
  window.addEventListener('dragenter', function (e) {
    if (!e.dataTransfer || Array.prototype.indexOf.call(e.dataTransfer.types, 'Files') < 0) return;
    e.preventDefault();
    dragDepth++;
    $('drop-overlay').hidden = false;
  });
  window.addEventListener('dragover', function (e) {
    e.preventDefault();
  });
  window.addEventListener('dragleave', function () {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) $('drop-overlay').hidden = true;
  });
  window.addEventListener('drop', function (e) {
    e.preventDefault();
    dragDepth = 0;
    $('drop-overlay').hidden = true;
    var file = e.dataTransfer && e.dataTransfer.files[0];
    if (file) loadFile(file);
  });

  /* ---------------------------------------------------------------- */
  /* Init                                                              */
  /* ---------------------------------------------------------------- */

  renderMetricsTable();
  renderPoints();
  renderGivoniZones();
  syncComfortControls();
  rebuild();

  if (window.ResizeObserver) {
    new ResizeObserver(resize).observe($('chart-wrap'));
  } else {
    window.addEventListener('resize', resize);
  }
  resize();
})();
