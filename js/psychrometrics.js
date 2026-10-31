/*
 * Thin adapter around PsychroLib (https://github.com/psychrometrics/psychrolib, MIT).
 * Exposes the small API the chart needs, in SI units:
 * temperatures in °C, pressures in Pa, humidity ratio in kg/kg dry air, enthalpy in kJ/kg.
 *
 * PsychroLib clamps humidity ratios to a minimum of 1e-7 and throws on out-of-range input.
 * The chart traces iso-lines by detecting where they leave the valid region, so clamped
 * minimum values and thrown errors are reported here as NaN / negative instead.
 */
(function (global) {
  'use strict';

  var lib = global.psychrolib;
  if (!lib) throw new Error('psychrolib.js must be loaded before psychrometrics.js');
  lib.SetUnitSystem(lib.SI);

  var LIB_MIN_W = 1e-7;

  function safe(fn) {
    return function () {
      try {
        return fn.apply(null, arguments);
      } catch (err) {
        return NaN;
      }
    };
  }

  function unclampW(w) {
    return w <= LIB_MIN_W * 1.0001 ? -1 : w;
  }

  var saturationPressure = safe(function (t) {
    return lib.GetSatVapPres(t);
  });

  var wFromPw = safe(function (pw, p) {
    return unclampW(lib.GetHumRatioFromVapPres(pw, p));
  });

  var pwFromW = safe(function (w, p) {
    return w <= 0 ? 0 : lib.GetVapPresFromHumRatio(w, p);
  });

  var wSat = safe(function (t, p) {
    return lib.GetSatHumRatio(t, p);
  });

  var wFromRh = safe(function (t, rh, p) {
    if (rh <= 0) return 0;
    return lib.GetHumRatioFromRelHum(t, Math.min(rh, 1), p);
  });

  var rhFromW = safe(function (t, w, p) {
    if (w <= 0) return 0;
    return lib.GetRelHumFromVapPres(t, Math.min(lib.GetVapPresFromHumRatio(w, p), lib.GetSatVapPres(t)));
  });

  var dewPoint = safe(function (t, w, p) {
    if (w <= LIB_MIN_W) return -Infinity;
    return lib.GetTDewPointFromHumRatio(t, w, p);
  });

  var wFromWetBulb = safe(function (t, twb, p) {
    if (twb > t) return NaN;
    return unclampW(lib.GetHumRatioFromTWetBulb(t, twb, p));
  });

  var wetBulb = safe(function (t, w, p) {
    return lib.GetTWetBulbFromHumRatio(t, Math.max(w, LIB_MIN_W), p);
  });

  function enthalpy(t, w) {
    return lib.GetMoistAirEnthalpy(t, Math.max(w, LIB_MIN_W)) / 1000;
  }

  var wFromEnthalpy = safe(function (t, h) {
    return unclampW(lib.GetHumRatioFromEnthalpyAndTDryBulb(h * 1000, t));
  });

  function specificVolume(t, w, p) {
    return lib.GetMoistAirVolume(t, Math.max(w, LIB_MIN_W), p);
  }

  /* PsychroLib has no W(T, v) inverse; v is linear in W, so invert it from two evaluations. */
  function wFromSpecificVolume(t, v, p) {
    var v0 = lib.GetMoistAirVolume(t, LIB_MIN_W, p);
    var v1 = lib.GetMoistAirVolume(t, 0.01 + LIB_MIN_W, p);
    return LIB_MIN_W + ((v - v0) / (v1 - v0)) * 0.01;
  }

  function pressureFromElevation(z) {
    return lib.GetStandardAtmPressure(z);
  }

  function properties(t, w, p) {
    var v = specificVolume(t, w, p);
    return {
      dryBulb: t,
      humidityRatio: w,
      relativeHumidity: rhFromW(t, w, p),
      wetBulb: wetBulb(t, w, p),
      dewPoint: dewPoint(t, w, p),
      enthalpy: enthalpy(t, w),
      specificVolume: v,
      vapourPressure: pwFromW(w, p),
      absoluteHumidity: (w / v) * 1000,
      density: lib.GetMoistAirDensity(t, Math.max(w, LIB_MIN_W), p)
    };
  }

  global.Psychro = {
    lib: lib,
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
    properties: properties
  };
})(window);
