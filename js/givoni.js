/*
 * Givoni bioclimatic chart zones (after Givoni 1998), drawn as outlined polygons.
 *
 * How the zones are defined (checked against screenshots of Marsh's chart at 77.2 kPa, mean outdoor temperature 10, 19 and 28 °C):
 *  - All temperatures shift together with the mean outdoor temperature: shift = 0.31 °C per °C of mean outdoor temperature
 *    relative to 19 °C (the ASHRAE 55 adaptive slope). At 19 °C the comfort zone is 20-27 °C.
 *  - Humidity limits are percentages of the saturation humidity ratio at the shifted temperature, a 16 g/kg cap,
 *    and a constant-enthalpy line. Edges that lie on a relative-humidity line (20%, 80%, 100%) follow the true RH curve.
 *  - Everything is recomputed at the current pressure.
 *
 * build(p) returns [dry-bulb °C, humidity ratio kg/kg] vertices (call setMeanOutdoor first).
 *   close: undefined = closed solid outline, 'none' = leave the last edge open
 *   dash: dash pattern    width: line width    fill: 'r,g,b,a'
 *   labels: {t, w in g/kg, v: vertical, sat: follow the saturation curve}, or {dyn: (p) => label} for computed labels;
 *           use \n for line breaks and textRh for the shorter text shown in the RH chart.
 *           Labels are centred vertically in the zone at their temperature t; band(t, p, wTop) returns [lo, hi]
 *           (kg/kg) to centre in a different region (e.g. the strip below the comfort zone) instead.
 *           edgeT + rightInset keep a label rightInset pixels inside a vertical edge of its zone (edgeAbs: the edge does
 *           not move with the mean outdoor temperature); visible(shift) can hide a label, e.g. when its zone leaves the plot.
 *   classify:false = not counted when classifying a point (display only)
 */
((global) => {
  'use strict';

  const P = global.Psychro;
  const CAP = 0.016;   // upper humidity limit, 16 g/kg at any pressure
  let TMO = 19;      // mean outdoor temperature, °C
  let D = 0;         // temperature shift, °C

  const T = (t) => t + D;
  const rh = (r, p) => (t) => P.wFromRh(t, r, p);            // true relative humidity curve
  const pct = (r, p) => (t) => r * P.wSat(t, p);              // percentage of the saturation humidity ratio
  const capped = (fn) => (t) => Math.min(CAP, fn(t));
  const arc = (fn, t0, t1) => {
    const out = [], n = Math.max(2, Math.ceil(Math.abs(t1 - t0) / 0.25));
    for (let i = 0; i < n + 1; i++) { const t = t0 + ((t1 - t0) * i) / n; out.push([t, fn(t)]); }
    return out;
  };
  const pt = (t, g) => [t, g / 1000];

  const wLow = (p) => P.wFromRh(T(20), 0.2, p);                                   // lower humidity limit (comfort corner)
  const comfortTopLeft = (p) => arc(capped(rh(0.8, p)), T(25), T(20));           // RH 80% curve, never above 16 g/kg
  const comfortTop = (p) => [[T(27), Math.min(CAP, pct(0.5, p)(T(27)))]].concat(comfortTopLeft(p));

  const ZONES = [
    { id: 'ac', code: 'AC', name: 'Air-conditioning', rgb: '71,85,105', classify: false, close: 'none', dash: [8, 5],
      build: () => [pt(T(41), 0), pt(50, 0), pt(50, 16), pt(T(40), 16)],
      labels: [{ text: 'AIR-CONDITIONING', t: 49, w: 8, v: true, edgeT: 50, edgeAbs: true, rightInset: 14, visible: (d) => 41 + d < 49 }, { text: 'AIR-CONDITIONING &\nDEHUMIDIFICATION', t: 39, w: 22.6, band: (t, p, wTop) => [CAP, Math.min(P.wSat(t, p), wTop)] }] },
    { id: 'heat', code: 'AH', name: 'Heating', rgb: '153,27,27', classify: false,
      labels: [{ text: 'HEATING', t: 3.1, w: 2.5, v: true, band: (t, p) => [0, P.wSat(t, p)] }] },
    { id: 'as', code: 'ASH', name: 'Active solar heating', rgb: '234,88,12', close: 'none',
      build: (p) => [pt(T(7), 0), pt(T(4), 0)].concat(arc(rh(1, p), T(4), T(7))),
      labels: [{ text: 'ACTIVE\nSOLAR', t: 4.7, w: 2.5, v: true }] },
    { id: 'ps', code: 'PSH', name: 'Passive solar heating', rgb: '202,138,4', close: 'none',
      build: (p) => [pt(T(19), 0), pt(T(8), 0)].concat(arc(rh(1, p), T(8), T(19))),
      labels: [{ text: 'PASSIVE SOLAR\nHEATING', t: 8.7, w: 3.3, v: true }] },
    { id: 'ig', code: 'IG', name: 'Internal gains', rgb: '161,98,7', close: 'none',
      build: (p) => arc(rh(0.2, p), T(17.5), T(12.5)).concat(arc(rh(0.8, p), T(12.5), T(17.5))),
      labels: [{ text: 'INTERNAL\nGAINS', t: 13.1, w: 4.5, v: true }] },
    { id: 'win', code: 'WIN', name: 'Winter', rgb: '120,113,108', classify: false, close: 'none', dash: [2, 4], width: 1.6,
      build: (p) => arc(rh(0.2, p), T(19.5), T(18)).concat(arc(rh(0.8, p), T(18), T(19.5))),
      labels: [{ text: 'WINTER', t: 18.7, w: 6.5, v: true }] },
    { id: 'h', code: 'H', name: 'Humidification', rgb: '180,120,20', classify: false, close: 'none',
      build: () => [pt(T(19), 0), pt(T(23.5), 0)],
      labels: [{ text: 'HUMIDIFICATION', t: 15, w: 0.6, band: (t, p) => [0, P.wFromRh(t, 0.2, p)] }] },
    { id: 'mnv', code: 'MNV', name: 'Mass cooling + night ventilation', rgb: '147,51,234',
      build: (p) => {
        const wb = wLow(p);
        return [[T(37), wb], [T(44), wb], [T(44), Math.min(CAP, pct(0.2, p)(T(44)))], [T(40), CAP], [T(33), CAP], [T(37), Math.min(CAP, pct(0.3, p)(T(37)))]];
      },
      labels: [{ text: 'MASS COOLING &\nNIGHT VENTILATION', textRh: 'MASS COOL &\nNIGHT VENT.', t: 43, w: 8, v: true, edgeT: 44, rightInset: 20 }] },
    { id: 'm', code: 'M', name: 'Mass cooling', rgb: '192,38,211',
      build: (p) => {
        const wb = wLow(p);
        return [[T(20), wb], [T(37), wb], [T(37), Math.min(CAP, pct(0.3, p)(T(37)))], [T(33), CAP]].concat(comfortTopLeft(p));
      },
      labels: [{ text: 'MASS COOLING', t: 36.4, w: 8, v: true }] },
    { id: 'v', code: 'V', name: 'Natural ventilation', rgb: '37,99,235',
      build: (p) => arc(rh(1, p), T(20), T(27)).concat([[T(32), pct(0.5, p)(T(32))], [T(32), rh(0.2, p)(T(32))]], arc(rh(0.2, p), T(32), T(27)), comfortTop(p)),
      labels: [{ text: 'NATURAL VENTILATION', t: 23.5, w: 17.9, sat: true }] },
    { id: 'dec', code: 'EC', name: 'Evaporative cooling', rgb: '2,132,199',
      build: (p) => {
        const wb = wLow(p);
        const t0 = (1.006 * T(20) + wb * (2501 + 1.86 * T(20))) / 1.006;   // constant-enthalpy line from the comfort corner down to W = 0
        return [[T(20), wb], [t0, 0], [T(41), 0], [T(41), pct(0.1, p)(T(41))], [T(39), pct(0.2, p)(T(39))], [T(36), pct(0.3, p)(T(36))]].concat(comfortTopLeft(p));
      },
      labels: [{ text: 'EVAPORATIVE COOLING', t: 34.1, w: 0.6, band: (t, p) => [0, wLow(p)] }] },
    { id: 'c', code: 'C', name: 'Comfort', rgb: '15,118,110', fill: '134,239,172,0.3',
      build: (p) => arc(rh(0.2, p), T(20), T(27)).concat(comfortTop(p)),
      labels: [{ text: 'COMFORT\nZONE', t: 23.5, w: 10 }] },
    // Dotted line at the mean outdoor temperature, labelled just above the saturation curve.
    { id: 'tmo', code: 'MOT', name: 'Mean outdoor temperature', rgb: '15,23,42', classify: false, close: 'none', dash: [2, 4], width: 1.6, absolute: true,
      build: (p) => [[TMO, 0], [TMO, P.wSat(TMO, p) + 0.002]],
      labels: [{ dyn: (p) => ({ text: TMO.toFixed(1) + ' °C', t: TMO - 0.3, w: (P.wSat(TMO, p) + 0.0012) * 1000, rot: -Math.PI / 2, abs: true }) }] }
  ];

  ZONES.forEach((z) => { z.show = true; });

  const setMeanOutdoor = (t) => { TMO = t; D = 0.31 * (t - 19); };

  const polygon = (z, p) => {
    if (!z.build) return null;
    const key = p + '|' + TMO;
    if (z._k !== key) { z._poly = z.build(p); z._k = key; }   // memoised per pressure and mean outdoor temperature
    return z._poly;
  };

  const contains = (z, t, w, p) => {
    if (z.classify === false) return false;
    const poly = polygon(z, p);
    if (!poly) return false;
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a[1] > w) !== (b[1] > w) && t < ((b[0] - a[0]) * (w - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  };

  const classify = (t, w, p) => {
    const hits = ZONES.filter((z) => contains(z, t, w, p));
    if (hits.length) return hits;
    if (t < T(20)) return [{ id: 'heat', code: 'AH', name: 'Active heating', rgb: '153,27,27' }];
    if (w > 0.012) return [{ id: 'dehum', code: 'AC', name: 'Air-conditioning + dehumidification', rgb: '71,85,105' }];
    return [{ id: 'ac', code: 'AC', name: 'Air-conditioning', rgb: '71,85,105' }];
  };

  global.Givoni = { zones: ZONES, contains: contains, polygon: polygon, classify: classify, setMeanOutdoor: setMeanOutdoor, shift: () => D };
})(window);
