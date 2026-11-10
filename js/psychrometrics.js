/*
 * Thin adapter around PsychroLib (https://github.com/psychrometrics/psychrolib, MIT).
 * Exposes the small API the chart needs, in SI units:
 * temperatures in °C, pressures in Pa, humidity ratio in kg/kg dry air, enthalpy in kJ/kg.
 *
 * PsychroLib clamps humidity ratios to a minimum of 1e-7 and throws on out-of-range input.
 * The chart traces iso-lines by detecting where they leave the valid region, so clamped
 * minimum values and thrown errors are reported here as NaN / negative instead.
 */
((global) => {
  'use strict';

  const lib = global.psychrolib;
  if (!lib) throw new Error('psychrolib.js must be loaded before psychrometrics.js');
  lib.SetUnitSystem(lib.SI);

  const LIB_MIN_W = 1e-7;

  const safe = (fn) => (...args) => {
      try {
        return fn(...args);
      } catch (err) {
        return NaN;
      }
    };

  const unclampW = (w) => w <= LIB_MIN_W * 1.0001 ? -1 : w;

  const saturationPressure = safe((t) => lib.GetSatVapPres(t));

  const wFromPw = safe((pw, p) => unclampW(lib.GetHumRatioFromVapPres(pw, p)));

  const pwFromW = safe((w, p) => w <= 0 ? 0 : lib.GetVapPresFromHumRatio(w, p));

  const wSat = safe((t, p) => lib.GetSatHumRatio(t, p));

  const wFromRh = safe((t, rh, p) => {
    if (rh <= 0) return 0;
    return lib.GetHumRatioFromRelHum(t, Math.min(rh, 1), p);
  });

  const rhFromW = safe((t, w, p) => {
    if (w <= 0) return 0;
    return lib.GetRelHumFromVapPres(t, Math.min(lib.GetVapPresFromHumRatio(w, p), lib.GetSatVapPres(t)));
  });

  const dewPoint = safe((t, w, p) => {
    if (w <= LIB_MIN_W) return -Infinity;
    return lib.GetTDewPointFromHumRatio(t, w, p);
  });

  const wFromWetBulb = safe((t, twb, p) => {
    if (twb > t) return NaN;
    return unclampW(lib.GetHumRatioFromTWetBulb(t, twb, p));
  });

  const wetBulb = safe((t, w, p) => lib.GetTWetBulbFromHumRatio(t, Math.max(w, LIB_MIN_W), p));

  const enthalpy = (t, w) => lib.GetMoistAirEnthalpy(t, Math.max(w, LIB_MIN_W)) / 1000;

  const wFromEnthalpy = safe((t, h) => unclampW(lib.GetHumRatioFromEnthalpyAndTDryBulb(h * 1000, t)));

  const specificVolume = (t, w, p) => lib.GetMoistAirVolume(t, Math.max(w, LIB_MIN_W), p);

  /* PsychroLib has no W(T, v) inverse; v is linear in W, so invert it from two evaluations. */
  const wFromSpecificVolume = (t, v, p) => {
    const v0 = lib.GetMoistAirVolume(t, LIB_MIN_W, p);
    const v1 = lib.GetMoistAirVolume(t, 0.01 + LIB_MIN_W, p);
    return LIB_MIN_W + ((v - v0) / (v1 - v0)) * 0.01;
  };

  const pressureFromElevation = (z) => lib.GetStandardAtmPressure(z);

  const properties = (t, w, p) => {
    const v = specificVolume(t, w, p);
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
  };

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
