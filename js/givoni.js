/*
 * Givoni bioclimatic chart zones, drawn as outlined polygons (after Givoni 1998 / the layout used on
 * Climate Consultant and Marsh's Psychrometric Chart). Vertices were read off a reference image, so treat
 * them as approximate and edit freely.
 *
 * Each zone: build(p) returns [dry-bulb °C, humidity ratio kg/kg] vertices. Helper pt(t, g/kg) makes a vertex,
 * arc(rh(r,p), t0, t1) follows a relative-humidity curve (rh(1,p) = saturation).
 *   close: undefined = closed solid outline, 'none' = leave the last edge open, 'dotted' = dotted last edge
 *   dash: dash pattern for the whole outline    fill: 'r,g,b,a'    extra: dotted connector lines [t, g/kg]
 *   labels: text drawn on the chart ({t, w in g/kg, v: vertical, sat: follow the saturation curve})
 *   classify:false = not counted when classifying a point (display only)
 */
(function (global) {
  'use strict';

  var P = global.Psychro;

  function rh(r, p) { return function (t) { return P.wFromRh(t, r, p); }; }
  function arc(fn, t0, t1) {
    var out = [], n = Math.max(2, Math.ceil(Math.abs(t1 - t0) / 0.5));
    for (var i = 0; i <= n; i++) { var t = t0 + ((t1 - t0) * i) / n; out.push([t, fn(t)]); }
    return out;
  }
  function pt(t, g) { return [t, g / 1000]; }

  // Edges shared by Comfort and its neighbours: RH 80% on top-left, RH 20% below.
  function comfortTop(p) { return [pt(27, 11.3), [25, rh(0.8, p)(25)]].concat(arc(rh(0.8, p), 25, 20)); }

  var ZONES = [
    { id: 'ac', code: 'AC', name: 'Air-conditioning', rgb: '71,85,105', classify: false, close: 'none', dash: [8, 5],
      build: function () { return [pt(41, 0), pt(50, 0), pt(50, 16), pt(40, 16)]; },
      labels: [{ text: 'AIR-CONDITIONING', t: 49.2, w: 8, v: true }, { text: 'AIR-CONDITIONING & DEHUMIDIFICATION', t: 39, w: 22.6 }] },
    { id: 'heat', code: 'AH', name: 'Heating', rgb: '153,27,27', classify: false,
      labels: [{ text: 'HEATING', t: 3.1, w: 2.5, v: true }] },
    { id: 'as', code: 'ASH', name: 'Active solar heating', rgb: '234,88,12', close: 'none',
      build: function (p) { return [pt(7, 0), pt(4, 0)].concat(arc(rh(1, p), 4, 7)); },
      labels: [{ text: 'ACTIVE SOLAR', t: 4.7, w: 2.5, v: true }] },
    { id: 'ps', code: 'PSH', name: 'Passive solar heating', rgb: '202,138,4', close: 'dotted',
      build: function (p) { return [pt(19, 0), pt(8, 0)].concat(arc(rh(1, p), 8, 19)); },
      labels: [{ text: 'PASSIVE SOLAR HEATING', t: 8.7, w: 3.3, v: true }] },
    { id: 'ig', code: 'IG', name: 'Internal gains', rgb: '161,98,7', close: 'dotted',
      build: function () { return [pt(17.5, 2.5), pt(12.5, 1.8), pt(12.5, 7.2), pt(17.5, 10)]; },
      extra: [[[17.5, 10], [20, 11.8]], [[17.5, 2.5], [20, 2.94]]],
      labels: [{ text: 'INTERNAL GAINS', t: 13.1, w: 4.5, v: true }, { text: 'WINTER', t: 18.4, w: 6.5, v: true }] },
    { id: 'h', code: 'H', name: 'Humidification', rgb: '180,120,20', classify: false, close: 'none',
      build: function () { return [pt(19, 0), pt(23.5, 0)]; },
      labels: [{ text: 'HUMIDIFICATION', t: 15, w: 0.6 }] },
    { id: 'mnv', code: 'MNV', name: 'Mass cooling + night ventilation', rgb: '147,51,234',
      build: function () { return [pt(37, 3), pt(44, 3), pt(44, 12.3), pt(40, 16), pt(33, 16), pt(37, 12.3)]; },
      labels: [{ text: 'MASS COOLING & NIGHT VENTILATION', t: 42.2, w: 7.8, v: true }] },
    { id: 'm', code: 'M', name: 'Mass cooling', rgb: '192,38,211',
      build: function (p) { return [pt(20, 3), pt(37, 3), pt(37, 12.3), pt(33, 16), [25, rh(0.8, p)(25)]].concat(arc(rh(0.8, p), 25, 20)); },
      labels: [{ text: 'MASS COOLING', t: 36.4, w: 7.7, v: true }] },
    { id: 'v', code: 'V', name: 'Natural ventilation', rgb: '37,99,235',
      build: function (p) {
        return arc(rh(1, p), 20, 27).concat([pt(32, 15.3), [32, rh(0.2, p)(32)]], arc(rh(0.2, p), 32, 27), comfortTop(p));
      },
      labels: [{ text: 'NATURAL VENTILATION', t: 23.8, w: 17.9, sat: true }] },
    { id: 'dec', code: 'EC', name: 'Evaporative cooling', rgb: '2,132,199',
      build: function (p) {
        return [[20, rh(0.2, p)(20)], pt(27.2, 0), pt(41, 0), pt(41, 5.2), pt(39, 9.2), pt(36, 11.6), [25, rh(0.8, p)(25)]].concat(arc(rh(0.8, p), 25, 20));
      },
      labels: [{ text: 'EVAPORATIVE COOLING', t: 34.1, w: 0.6 }] },
    { id: 'c', code: 'C', name: 'Comfort', rgb: '15,118,110', fill: '134,239,172,0.3',
      build: function (p) { return arc(rh(0.2, p), 20, 27).concat(comfortTop(p)); },
      labels: [{ text: 'COMFORT ZONE', t: 23.5, w: 9.9 }] }
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
