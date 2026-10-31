/*
 * Givoni bioclimatic chart zones (after Givoni 1998), drawn as outlined polygons.
 * Limits are NOT fixed humidity ratios: they are percentages of the saturation humidity ratio (W / Wsat, which
 * differs slightly from true RH), a 16 g/kg humidity cap and a constant-enthalpy line, recomputed at the current
 * pressure so the zones move correctly with altitude. Values are for a mean outdoor temperature of 19 °C (comfort zone 20-27 °C)
 * and were checked against screenshots of Marsh's chart at 101.3 and 77.2 kPa. Edit freely.
 *
 * build(p) returns [dry-bulb °C, humidity ratio kg/kg] vertices.
 *   close: undefined = closed solid outline, 'none' = leave the last edge open, 'dotted' = dotted last edge
 *   dash: dash pattern    width: line width    fill: 'r,g,b,a'    extra: function(p) -> extra dotted polylines
 *   labels: text drawn on the chart ({t, w in g/kg, v: vertical, sat: follow the saturation curve})
 *   classify:false = not counted when classifying a point (display only)
 */
(function (global) {
  'use strict';

  var P = global.Psychro;
  var CAP = 0.016; // upper humidity limit, 16 g/kg at any pressure

  // Percentage of the saturation humidity ratio at pressure p (this is how the zone limits are defined).
  function pct(r, p) { return function (t) { return r * P.wSat(t, p); }; }
  function arc(fn, t0, t1) {
    var out = [], n = Math.max(2, Math.ceil(Math.abs(t1 - t0) / 0.25));
    for (var i = 0; i <= n; i++) { var t = t0 + ((t1 - t0) * i) / n; out.push([t, fn(t)]); }
    return out;
  }
  function pt(t, g) { return [t, g / 1000]; }
  function capped(fn) { return function (t) { return Math.min(CAP, fn(t)); }; }

  // Lower humidity limit shared by comfort, mass cooling and evaporative cooling: 20% of saturation at 20 °C (a horizontal line).
  function wLow(p) { return 0.2 * P.wSat(20, p); }
  // Comfort top edge: RH 80% curve, never above 16 g/kg, from 25 °C back to 20 °C.
  function comfortTopLeft(p) { return arc(capped(pct(0.8, p)), 25, 20); }
  // Comfort top-right: RH 50% at 27 °C, then up to (25 °C, 16 g/kg).
  function comfortTop(p) { return [[27, pct(0.5, p)(27)]].concat(comfortTopLeft(p)); }

  var ZONES = [
    { id: 'ac', code: 'AC', name: 'Air-conditioning', rgb: '71,85,105', classify: false, close: 'none', dash: [8, 5],
      build: function () { return [pt(41, 0), pt(50, 0), pt(50, 16), pt(40, 16)]; },
      labels: [{ text: 'AIR-CONDITIONING', t: 49.2, w: 8, v: true }, { text: 'AIR-CONDITIONING & DEHUMIDIFICATION', t: 39, w: 22.6 }] },
    { id: 'heat', code: 'AH', name: 'Heating', rgb: '153,27,27', classify: false,
      labels: [{ text: 'HEATING', t: 3.1, w: 2.5, v: true }] },
    { id: 'as', code: 'ASH', name: 'Active solar heating', rgb: '234,88,12', close: 'none',
      build: function (p) { return [pt(7, 0), pt(4, 0)].concat(arc(pct(1, p), 4, 7)); },
      labels: [{ text: 'ACTIVE SOLAR', t: 4.7, w: 2.5, v: true }] },
    { id: 'ps', code: 'PSH', name: 'Passive solar heating', rgb: '202,138,4', close: 'none',
      build: function (p) { return [pt(19, 0), pt(8, 0)].concat(arc(pct(1, p), 8, 19)); },
      extra: function (p) { return [[[19, 0], [19, pct(1, p)(19)]]]; },
      labels: [{ text: 'PASSIVE SOLAR HEATING', t: 8.7, w: 3.3, v: true }] },
    { id: 'ig', code: 'IG', name: 'Internal gains', rgb: '161,98,7', close: 'none',
      build: function (p) { return arc(pct(0.2, p), 17.5, 12.5).concat(arc(pct(0.8, p), 12.5, 17.5)); },
      labels: [{ text: 'INTERNAL GAINS', t: 13.1, w: 4.5, v: true }] },
    { id: 'win', code: 'WIN', name: 'Winter', rgb: '120,113,108', classify: false, close: 'none', dash: [2, 4], width: 1.6,
      build: function (p) { return arc(pct(0.2, p), 19.5, 18).concat(arc(pct(0.8, p), 18, 19.5)); },
      labels: [{ text: 'WINTER', t: 18.7, w: 6.5, v: true }] },
    { id: 'h', code: 'H', name: 'Humidification', rgb: '180,120,20', classify: false, close: 'none',
      build: function () { return [pt(19, 0), pt(23.5, 0)]; },
      labels: [{ text: 'HUMIDIFICATION', t: 15, w: 0.6 }] },
    { id: 'mnv', code: 'MNV', name: 'Mass cooling + night ventilation', rgb: '147,51,234',
      build: function (p) {
        var wb = wLow(p);
        return [[37, wb], [44, wb], [44, Math.min(CAP, pct(0.2, p)(44))], [40, CAP], [33, CAP], [37, Math.min(CAP, pct(0.3, p)(37))]];
      },
      labels: [{ text: 'MASS COOLING & NIGHT VENTILATION', t: 42.2, w: 8, v: true }] },
    { id: 'm', code: 'M', name: 'Mass cooling', rgb: '192,38,211',
      build: function (p) {
        var wb = wLow(p);
        return [[20, wb], [37, wb], [37, Math.min(CAP, pct(0.3, p)(37))], [33, CAP]].concat(comfortTopLeft(p));
      },
      labels: [{ text: 'MASS COOLING', t: 36.4, w: 8, v: true }] },
    { id: 'v', code: 'V', name: 'Natural ventilation', rgb: '37,99,235',
      build: function (p) {
        return arc(pct(1, p), 20, 27).concat([[32, pct(0.5, p)(32)], [32, pct(0.2, p)(32)]], arc(pct(0.2, p), 32, 27), comfortTop(p));
      },
      labels: [{ text: 'NATURAL VENTILATION', t: 23.8, w: 17.9, sat: true }] },
    { id: 'dec', code: 'EC', name: 'Evaporative cooling', rgb: '2,132,199',
      build: function (p) {
        var wb = wLow(p);
        var t0 = (1.006 * 20 + wb * (2501 + 1.86 * 20)) / 1.006;   // constant-enthalpy line from the comfort corner down to W = 0
        return [[20, wb], [t0, 0], [41, 0], [41, pct(0.1, p)(41)], [39, pct(0.2, p)(39)], [36, pct(0.3, p)(36)]].concat(comfortTopLeft(p));
      },
      labels: [{ text: 'EVAPORATIVE COOLING', t: 34.1, w: 0.6 }] },
    { id: 'c', code: 'C', name: 'Comfort', rgb: '15,118,110', fill: '134,239,172,0.3',
      build: function (p) { return arc(pct(0.2, p), 20, 27).concat(comfortTop(p)); },
      labels: [{ text: 'COMFORT ZONE', t: 23.5, w: 10 }] }
  ];

  ZONES.forEach(function (z) { z.show = true; });

  function polygon(z, p) {
    if (!z.build) return null;
    if (z._p !== p) { z._poly = z.build(p); z._p = p; }   // memoised per pressure
    return z._poly;
  }

  function contains(z, t, w, p) {
    if (z.classify === false) return false;
    var poly = polygon(z, p);
    if (!poly) return false;
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var a = poly[i], b = poly[j];
      if ((a[1] > w) !== (b[1] > w) && t < ((b[0] - a[0]) * (w - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }

  function classify(t, w, p) {
    var hits = ZONES.filter(function (z) { return contains(z, t, w, p); });
    if (hits.length) return hits;
    if (t < 20) return [{ id: 'heat', code: 'AH', name: 'Active heating', rgb: '153,27,27' }];
    if (w > 0.012) return [{ id: 'dehum', code: 'AC', name: 'Air-conditioning + dehumidification', rgb: '71,85,105' }];
    return [{ id: 'ac', code: 'AC', name: 'Air-conditioning', rgb: '71,85,105' }];
  }

  global.Givoni = { zones: ZONES, contains: contains, polygon: polygon, classify: classify };
})(window);
