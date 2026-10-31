/*
 * Moist-air psychrometric relations (SI units).
 * Based on the ASHRAE Handbook of Fundamentals equations.
 * Temperatures in °C, pressures in Pa, humidity ratio in kg/kg dry air.
 */
(function (global) {
  'use strict';

  var MW_RATIO = 0.621945;

  function saturationPressure(t) {
    var T = t + 273.15;
    if (t < 0) {
      return Math.exp(
        -5.6745359e3 / T +
          6.3925247 -
          9.677843e-3 * T +
          6.2215701e-7 * T * T +
          2.0747825e-9 * T * T * T -
          9.484024e-13 * T * T * T * T +
          4.1635019 * Math.log(T)
      );
    }
    return Math.exp(
      -5.8002206e3 / T +
        1.3914993 -
        4.8640239e-2 * T +
        4.1764768e-5 * T * T -
        1.4452093e-8 * T * T * T +
        6.5459673 * Math.log(T)
    );
  }

  function wFromPw(pw, p) {
    return (MW_RATIO * pw) / (p - pw);
  }

  function pwFromW(w, p) {
    return (p * w) / (MW_RATIO + w);
  }

  function wSat(t, p) {
    return wFromPw(saturationPressure(t), p);
  }

  function wFromRh(t, rh, p) {
    return wFromPw(rh * saturationPressure(t), p);
  }

  function rhFromW(t, w, p) {
    return pwFromW(w, p) / saturationPressure(t);
  }

  function bisect(fn, target, lo, hi, iterations) {
    var a = lo;
    var b = hi;
    var fa = fn(a) - target;
    for (var i = 0; i < (iterations || 50); i++) {
      var m = (a + b) / 2;
      var fm = fn(m) - target;
      if (fa * fm <= 0) {
        b = m;
      } else {
        a = m;
        fa = fm;
      }
    }
    return (a + b) / 2;
  }

  function dewPoint(w, p) {
    var pw = pwFromW(w, p);
    if (pw <= 0) return -Infinity;
    return bisect(saturationPressure, pw, -100, 120, 50);
  }

  function wFromWetBulb(t, twb, p) {
    var wsStar = wSat(twb, p);
    if (twb >= 0) {
      return ((2501 - 2.326 * twb) * wsStar - 1.006 * (t - twb)) / (2501 + 1.86 * t - 4.186 * twb);
    }
    return ((2830 - 0.24 * twb) * wsStar - 1.006 * (t - twb)) / (2830 + 1.86 * t - 2.1 * twb);
  }

  function wetBulb(t, w, p) {
    return bisect(function (twb) { return wFromWetBulb(t, twb, p); }, w, -100, t, 50);
  }

  function enthalpy(t, w) {
    return 1.006 * t + w * (2501 + 1.86 * t);
  }

  function wFromEnthalpy(t, h) {
    return (h - 1.006 * t) / (2501 + 1.86 * t);
  }

  function specificVolume(t, w, p) {
    return (0.287042 * (t + 273.15) * (1 + 1.607858 * w)) / (p / 1000);
  }

  function wFromSpecificVolume(t, v, p) {
    return ((v * (p / 1000)) / (0.287042 * (t + 273.15)) - 1) / 1.607858;
  }

  function pressureFromElevation(z) {
    return 101325 * Math.pow(1 - 2.25577e-5 * z, 5.2559);
  }

  function properties(t, w, p) {
    var v = specificVolume(t, w, p);
    return {
      dryBulb: t,
      humidityRatio: w,
      relativeHumidity: rhFromW(t, w, p),
      wetBulb: wetBulb(t, w, p),
      dewPoint: dewPoint(w, p),
      enthalpy: enthalpy(t, w),
      specificVolume: v,
      vapourPressure: pwFromW(w, p),
      absoluteHumidity: (w / v) * 1000,
      density: (1 + w) / v
    };
  }

  global.Psychro = {
    saturationPressure: saturationPressure,
    wFromPw: wFromPw,
    pwFromW: pwFromW,
    wSat: wSat,
    wFromRh: wFromRh,
    rhFromW: rhFromW,
    dewPoint: dewPoint,
    wFromWetBulb: wFromWetBulb,
    wetBulb: wetBulb,
    enthalpy: enthalpy,
    wFromEnthalpy: wFromEnthalpy,
    specificVolume: specificVolume,
    wFromSpecificVolume: wFromSpecificVolume,
    pressureFromElevation: pressureFromElevation,
    properties: properties,
    bisect: bisect
  };
})(window);
