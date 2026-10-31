/*
 * Givoni building bioclimatic chart.
 *
 * Zone boundaries approximate Givoni (1998), "Climate Considerations in Building and Urban
 * Design", limits for developed countries. Each zone is bounded by dry-bulb temperature,
 * humidity ratio, and optionally relative humidity and wet-bulb temperature limits, so the
 * boundaries can be tuned here without touching the drawing code.
 *
 *   tLo/tHi  dry-bulb range (°C)
 *   wLo/wHi  humidity ratio range (g/kg dry air)
 *   rhHi     maximum relative humidity (0-1)
 *   wbtHi    maximum wet-bulb temperature (°C)
 *   label    [dry-bulb °C, humidity ratio g/kg] where the zone code is drawn
 */
(function (global) {
  'use strict';

  var P = global.Psychro;

  var ZONES = [
    { id: 'iec', code: 'IEC', name: 'Indirect evaporative cooling', rgb: '100,116,139', tLo: 20, tHi: 44, wLo: 0, wHi: 14, wbtHi: 24, label: [42, 6.5] },
    { id: 'dec', code: 'DEC', name: 'Direct evaporative cooling', rgb: '2,132,199', tLo: 20, tHi: 42, wLo: 0, wbtHi: 22, label: [38.5, 3] },
    { id: 'mnv', code: 'MNV', name: 'Thermal mass + night ventilation', rgb: '147,51,234', tLo: 20, tHi: 38, wLo: 4, wHi: 14, label: [36.5, 11] },
    { id: 'm', code: 'M', name: 'High thermal mass', rgb: '192,38,211', tLo: 20, tHi: 35, wLo: 4, wHi: 14, label: [33.5, 13] },
    { id: 'v', code: 'V', name: 'Natural ventilation', rgb: '37,99,235', tLo: 20, tHi: 32, wLo: 4, wHi: 19, rhHi: 0.9, label: [26, 17.5] },
    { id: 'psh', code: 'PSH', name: 'Passive solar heating', rgb: '234,88,12', tLo: 12, tHi: 20, wLo: 2, wHi: 12, rhHi: 0.9, label: [16, 6] },
    { id: 'hu', code: 'H', name: 'Humidification', rgb: '202,138,4', tLo: 20, tHi: 27, wLo: 0, wHi: 4, label: [23.5, 2] },
    { id: 'c', code: 'C', name: 'Comfort', rgb: '15,118,110', tLo: 20, tHi: 27, wLo: 4, wHi: 12, rhHi: 0.8, label: [23.5, 8] }
  ];

  ZONES.forEach(function (z) {
    z.show = true;
  });

  function upper(z, t, p) {
    var w = P.wSat(t, p);
    if (z.wHi !== undefined) w = Math.min(w, z.wHi / 1000);
    if (z.rhHi !== undefined) w = Math.min(w, P.wFromRh(t, z.rhHi, p));
    if (z.wbtHi !== undefined && t >= z.wbtHi) {
      var wb = P.wFromWetBulb(t, z.wbtHi, p);
      w = Math.min(w, Number.isFinite(wb) ? wb : -1);
    }
    return w;
  }

  function contains(z, t, w, p) {
    if (t < z.tLo || t > z.tHi) return false;
    if (w < z.wLo / 1000) return false;
    return w <= upper(z, t, p);
  }

  function polygon(z, p) {
    var wLo = z.wLo / 1000;
    var bottom = [];
    var top = [];
    var step = 0.25;
    for (var t = z.tLo; t <= z.tHi + 1e-9; t += step) {
      var tt = Math.min(t, z.tHi);
      var wu = upper(z, tt, p);
      if (!(wu > wLo)) {
        if (bottom.length) break;
        continue;
      }
      bottom.push([tt, wLo]);
      top.push([tt, wu]);
    }
    if (bottom.length < 2) return null;
    return bottom.concat(top.reverse());
  }

  function classify(t, w, p) {
    var hits = ZONES.filter(function (z) {
      return contains(z, t, w, p);
    });
    if (hits.length) return hits;
    if (t < 20) return [{ id: 'heat', code: 'AH', name: 'Active heating', rgb: '153,27,27' }];
    if (w > 0.012) return [{ id: 'dehum', code: 'AC', name: 'Air-conditioning + dehumidification', rgb: '71,85,105' }];
    return [{ id: 'ac', code: 'AC', name: 'Air-conditioning', rgb: '71,85,105' }];
  }

  global.Givoni = {
    zones: ZONES,
    contains: contains,
    polygon: polygon,
    classify: classify
  };
})(window);
