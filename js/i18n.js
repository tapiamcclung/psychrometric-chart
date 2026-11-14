/*
 * Interface translations. English is the source language and every English string is also its own key:
 * t('Some text') returns the Spanish text when Spanish is selected and the key itself otherwise, so a missing
 * translation simply stays in English. Placeholders look like {name}: t('Point {n}', { n: 3 }).
 *
 * Static text and attributes (aria-label, title, placeholder) in index.html are translated in place by walking the
 * DOM. Containers that scripts fill dynamically carry data-i18n-skip and are re-rendered by the scripts when the
 * language changes (they listen for the 'i18n:change' event).
 */
(() => {
  'use strict';

  const STORAGE_KEY = 'psychro.lang';
  const DEFAULT_LANG = 'es';

  const ES = {
    // ---- page chrome
    'Interactive Psychrometric Chart': 'Diagrama psicrométrico interactivo',
    'Interactive psychrometric chart': 'Diagrama psicrométrico interactivo',
    'No highlight': 'Sin resaltado',
    'Interactive psychrometric chart with comfort overlays, process lines and weather data mapping.': 'Diagrama psicrométrico interactivo con capas de confort, líneas de proceso y mapeo de datos climáticos.',
    'Chart controls': 'Controles del diagrama',
    'Collapse controls': 'Contraer controles',
    'Expand controls': 'Expandir controles',
    'Controls': 'Controles',
    'Language': 'Idioma',
    'Psychrometric Chart': 'Diagrama psicrométrico',
    'Interactive moist-air properties & thermal comfort': 'Propiedades interactivas del aire húmedo y confort térmico',
    'Chart type': 'Tipo de diagrama',
    'Psychrometric': 'Psicrométrico',
    'Relative humidity': 'Humedad relativa',
    'Transition': 'Transición',
    'Current conditions': 'Condiciones actuales',
    'Dry-bulb temperature': 'Temperatura de bulbo seco',
    'Dry-bulb temperature in °C': 'Temperatura de bulbo seco en °C',
    'Relative humidity in %': 'Humedad relativa en %',
    'Drag anywhere on the chart to move the indicator. Arrow keys nudge it when the chart is focused.': 'Arrastra en cualquier parte del diagrama para mover el indicador. Las teclas de flecha lo desplazan cuando el diagrama está activo.',
    'Comfort overlay': 'Capa de confort',
    'Model': 'Modelo',
    'None': 'Ninguno',
    'Adaptive – ASHRAE 55': 'Adaptativo – ASHRAE 55',
    'Givoni bioclimatic chart': 'Diagrama bioclimático de Givoni',
    'Design strategies': 'Estrategias de diseño',
    'Metabolic rate (met)': 'Tasa metabólica (met)',
    'Clothing (clo)': 'Vestimenta (clo)',
    'Air velocity (m/s)': 'Velocidad del aire (m/s)',
    'Radiant offset (K)': 'Compensación radiante (K)',
    'Mean outdoor temp. (°C)': 'Temp. exterior media (°C)',
    'From weather data': 'A partir de datos climáticos',
    'Chart metrics': 'Variables del diagrama',
    'Metric': 'Variable',
    'Show': 'Mostrar',
    'Highlight': 'Resaltar',
    'Process lines': 'Líneas de proceso',
    'Add point': 'Agregar punto',
    'Clear': 'Borrar',
    'No process points yet.': 'No hay puntos todavía.',
    'Click a point on the chart to select and drag it. Press Delete to remove the selected point.': 'Haz clic en un punto del diagrama para seleccionarlo y arrastrarlo. Presiona Supr (Delete) para eliminar el punto seleccionado.',
    'Weather data': 'Datos climáticos',
    'Load EPW / CSV…': 'Cargar EPW / CSV…',
    'Or drop a file anywhere on the page. CSV files need dry-bulb temperature and relative humidity columns (an optional month column enables filtering).': 'O suelta un archivo en cualquier parte de la página. Los archivos CSV necesitan columnas de temperatura de bulbo seco y humedad relativa (una columna opcional de mes permite filtrar).',
    'Period': 'Periodo',
    'Full year': 'Año completo',
    'January': 'Enero', 'February': 'Febrero', 'March': 'Marzo', 'April': 'Abril', 'May': 'Mayo', 'June': 'Junio',
    'July': 'Julio', 'August': 'Agosto', 'September': 'Septiembre', 'October': 'Octubre', 'November': 'Noviembre', 'December': 'Diciembre',
    'Show hourly frequency overlay': 'Mostrar capa de frecuencia horaria',
    'Remove data': 'Quitar datos',
    'Chart settings': 'Ajustes del diagrama',
    'Min temp. (°C)': 'Temp. mín. (°C)',
    'Max temp. (°C)': 'Temp. máx. (°C)',
    'Max humidity (g/kg)': 'Humedad máx. (g/kg)',
    'Pressure (kPa)': 'Presión (kPa)',
    'Elevation (m)': 'Elevación (m)',
    'Set from elevation': 'Calcular a partir de la elevación',
    'Title': 'Título',
    'Sub-title': 'Subtítulo',
    'Export': 'Exportar',
    'Save PNG': 'Guardar PNG',
    'Save CSV': 'Guardar CSV',
    'Save JSON': 'Guardar JSON',
    'Minimize current conditions': 'Minimizar condiciones actuales',
    'Expand current conditions': 'Expandir condiciones actuales',
    'Drop EPW or CSV file to load': 'Suelta un archivo EPW o CSV para cargarlo',
    'Strategies': 'Estrategias',

    // ---- months and chart variables
    'Jan': 'Ene', 'Feb': 'Feb', 'Mar': 'Mar', 'Apr': 'Abr', 'Jun': 'Jun',  // 'May' is also the full month name, see above
    'Jul': 'Jul', 'Aug': 'Ago', 'Sep': 'Sep', 'Oct': 'Oct', 'Nov': 'Nov', 'Dec': 'Dic',
    'Dry-bulb temp.': 'Temp. de bulbo seco',
    'Humidity ratio': 'Razón de humedad',
    'Wet-bulb temp.': 'Temp. de bulbo húmedo',
    'Dew-point temp.': 'Temp. de punto de rocío',
    'Vapour pressure': 'Presión de vapor',
    'Specific volume': 'Volumen específico',
    'Enthalpy': 'Entalpía',
    'Abs. humidity': 'Humedad absoluta',
    'Density': 'Densidad',
    'Show {name} lines': 'Mostrar líneas de {name}',
    'Highlight {name} lines': 'Resaltar líneas de {name}',

    // ---- chart text
    'Dry-bulb temperature (°C)': 'Temperatura de bulbo seco (°C)',
    'Humidity ratio (g/kg dry air)': 'Razón de humedad (g/kg de aire seco)',
    'Relative humidity (%)': 'Humedad relativa (%)',
    'Wet-bulb temperature (°C)': 'Temperatura de bulbo húmedo (°C)',
    'Vapour pressure (kPa)': 'Presión de vapor (kPa)',
    'Specific volume (m³/kg dry air)': 'Volumen específico (m³/kg de aire seco)',
    'Enthalpy (kJ/kg dry air)': 'Entalpía (kJ/kg de aire seco)',
    'Hours per cell': 'Horas por celda',
    'Atmospheric pressure {p} kPa': 'Presión atmosférica {p} kPa',
    'PMV comfort: {met} met, {clo} clo, {vel} m/s': 'Confort PMV: {met} met, {clo} clo, {vel} m/s',
    'Adaptive comfort, mean outdoor {t} °C': 'Confort adaptativo, exterior medio {t} °C',
    'Givoni bioclimatic zones': 'Zonas bioclimáticas de Givoni',

    // ---- readout
    '% RH': '% HR',
    'Strategy': 'Estrategia',
    'Sensation': 'Sensación',
    'Neutral temp.': 'Temp. neutra',
    'Acceptability': 'Aceptabilidad',
    'Outside': 'Fuera',
    'Hours in this cell': 'Horas en esta celda',
    'Cell range': 'Rango de la celda',
    'Cold': 'Frío', 'Cool': 'Fresco', 'Slightly cool': 'Ligeramente fresco', 'Neutral': 'Neutro',
    'Slightly warm': 'Ligeramente cálido', 'Warm': 'Cálido', 'Hot': 'Caluroso',

    // ---- comfort notes and data statistics
    'Shaded bands show |PMV| ≤ 0.7, 0.5 and 0.2 (ISO 7730 categories III, II, I). Mean radiant temperature = air temperature + radiant offset.': 'Las bandas sombreadas muestran |PMV| ≤ 0.7, 0.5 y 0.2 (categorías III, II, I de ISO 7730). Temperatura radiante media = temperatura del aire + compensación radiante.',
    '80% acceptability': '80% de aceptabilidad',
    '90% acceptability': '90% de aceptabilidad',
    'Neutral operative temperature {neutral} °C for a mean outdoor temperature of {tout} °C.': 'Temperatura operativa neutra de {neutral} °C para una temperatura exterior media de {tout} °C.',
    'Outside the 10–33.5 °C range of applicability, limits are clamped.': 'Fuera del intervalo de aplicabilidad de 10–33.5 °C, los límites se acotan.',
    'Building bioclimatic chart after Givoni (1998), developed-country limits. Areas outside every zone need active heating or air-conditioning. All zones shift with the mean outdoor temperature ({tout} °C here); limits are editable in js/givoni.js.': 'Diagrama bioclimático de edificios según Givoni (1998), con límites para países desarrollados. Las áreas fuera de todas las zonas requieren calefacción activa o aire acondicionado. Todas las zonas se desplazan con la temperatura exterior media ({tout} °C aquí); los límites se pueden editar en js/givoni.js.',
    'full year': 'año completo',
    '{n} hourly records ({period}). Darkest cell: {max} h.': '{n} registros horarios ({period}). Celda más oscura: {max} h.',
    'Hours where each strategy is effective (zones overlap, so totals exceed 100%):': 'Horas en que cada estrategia es efectiva (las zonas se traslapan, por lo que los totales superan el 100%):',
    '{h} h ({pct}%) fall inside the {zone} comfort zone.': '{h} h ({pct}%) caen dentro de la zona de confort {zone}.',
    'adaptive 80%': 'adaptativa 80%',
    'No usable dry-bulb temperature / relative humidity data was found in {file}.': 'No se encontraron datos utilizables de temperatura de bulbo seco / humedad relativa en {file}.',

    // ---- weather station
    'Name': 'Nombre', 'Region': 'Región', 'Country': 'País', 'WMO': 'OMM', 'Latitude': 'Latitud', 'Longitude': 'Longitud',
    'Timezone': 'Zona horaria', 'Elevation': 'Elevación',

    // ---- points and exports
    'Point {n}': 'Punto {n}',
    'Label for point {n}': 'Etiqueta del punto {n}',
    'Remove point {n}': 'Quitar el punto {n}',
    'Indicator': 'Indicador',

    // ---- Givoni zones (names)
    'Air-conditioning': 'Aire acondicionado',
    'Heating': 'Calefacción',
    'Active solar heating': 'Calefacción solar activa',
    'Passive solar heating': 'Calefacción solar pasiva',
    'Internal gains': 'Ganancias internas',
    'Winter': 'Invierno',
    'Humidification': 'Humidificación',
    'Mass cooling + night ventilation': 'Masa térmica + ventilación nocturna',
    'Mass cooling': 'Enfriamiento por masa térmica',
    'Natural ventilation': 'Ventilación natural',
    'Evaporative cooling': 'Enfriamiento evaporativo',
    'Comfort': 'Confort',
    'Mean outdoor temperature': 'Temperatura exterior media',
    'Active heating': 'Calefacción activa',
    'Air-conditioning + dehumidification': 'Aire acondicionado + deshumidificación',

    // ---- Givoni zone labels drawn on the chart
    'AIR-CONDITIONING': 'AIRE ACONDICIONADO',
    'AIR-CONDITIONING &\nDEHUMIDIFICATION': 'AIRE ACONDICIONADO Y\nDESHUMIDIFICACIÓN',
    'HEATING': 'CALEFACCIÓN',
    'ACTIVE\nSOLAR': 'SOLAR\nACTIVA',
    'PASSIVE SOLAR\nHEATING': 'CALEFACCIÓN\nSOLAR PASIVA',
    'INTERNAL\nGAINS': 'GANANCIAS\nINTERNAS',
    'WINTER': 'INVIERNO',
    'HUMIDIFICATION': 'HUMIDIFICACIÓN',
    'MASS COOLING &\nNIGHT VENTILATION': 'MASA TÉRMICA Y\nVENTILACIÓN NOCTURNA',
    'MASS COOL &\nNIGHT VENT.': 'MASA TÉRM. Y\nVENT. NOCT.',
    'MASS COOLING': 'MASA TÉRMICA',
    'NATURAL VENTILATION': 'VENTILACIÓN NATURAL',
    'EVAPORATIVE COOLING': 'ENFRIAMIENTO EVAPORATIVO',
    'COMFORT\nZONE': 'ZONA DE\nCONFORT',

    // ---- Strategies sidebar
    '{n} strategies for the selected point': '{n} estrategias para el punto seleccionado',
    '1 strategy for the selected point': '1 estrategia para el punto seleccionado',
    'Choose “Givoni bioclimatic chart” under Comfort overlay, then click the chart to see strategies for that point.': 'Elige «Diagrama bioclimático de Givoni» en Capa de confort y luego haz clic en el diagrama para ver las estrategias de ese punto.',
    'Click the chart to see strategies for that point.': 'Haz clic en el diagrama para ver las estrategias de ese punto.',
    'Placeholder text.': 'Texto provisional.',
    'Placeholder: conditions are within the comfort zone.': 'Texto provisional: las condiciones están dentro de la zona de confort.',
    'Placeholder: no active conditioning is needed.': 'Texto provisional: no se requiere acondicionamiento activo.',
    'Placeholder: open windows on opposite sides for cross-ventilation.': 'Texto provisional: abre ventanas en lados opuestos para lograr ventilación cruzada.',
    'Placeholder: use ceiling fans to extend the comfort range.': 'Texto provisional: usa ventiladores de techo para ampliar el intervalo de confort.',
    'Placeholder: use heavy walls and floors to absorb daytime heat.': 'Texto provisional: usa muros y pisos pesados para absorber el calor del día.',
    'Placeholder: shade the thermal mass from direct summer sun.': 'Texto provisional: protege la masa térmica del sol directo de verano.',
    'Placeholder: ventilate at night to flush stored heat.': 'Texto provisional: ventila por la noche para evacuar el calor almacenado.',
    'Placeholder: close the building during the hottest hours.': 'Texto provisional: cierra el edificio durante las horas más calurosas.',
    'Placeholder: direct evaporative coolers work well in dry air.': 'Texto provisional: los enfriadores evaporativos directos funcionan bien en aire seco.',
    'Placeholder: provide an outlet for the added moisture.': 'Texto provisional: prevé una salida para la humedad añadida.',
    'Placeholder: orient large glazing toward the sun.': 'Texto provisional: orienta los grandes vidrios hacia el sol.',
    'Placeholder: add thermal mass behind the glass to store heat.': 'Texto provisional: agrega masa térmica detrás del vidrio para almacenar calor.',
    'Placeholder: consider solar collectors for space or water heating.': 'Texto provisional: considera colectores solares para calentar espacios o agua.',
    'Placeholder: pair collectors with storage.': 'Texto provisional: combina los colectores con almacenamiento.',
    'Placeholder: tight envelope and good insulation keep internal gains useful.': 'Texto provisional: una envolvente hermética y buen aislamiento mantienen útiles las ganancias internas.',
    'Placeholder: heat from people and equipment may be enough.': 'Texto provisional: el calor de las personas y los equipos puede ser suficiente.',
    'Placeholder: active heating is required.': 'Texto provisional: se requiere calefacción activa.',
    'Placeholder: improve insulation and airtightness first.': 'Texto provisional: mejora primero el aislamiento y la hermeticidad.',
    'Placeholder: air is dry; consider humidification.': 'Texto provisional: el aire está seco; considera humidificar.',
    'Placeholder: indoor plants or water features can help.': 'Texto provisional: las plantas de interior o las fuentes de agua pueden ayudar.',
    'Placeholder: mechanical cooling is required.': 'Texto provisional: se requiere enfriamiento mecánico.',
    'Placeholder: reduce loads with shading and insulation first.': 'Texto provisional: reduce primero las cargas con sombreado y aislamiento.',
    'Placeholder: mechanical cooling with dehumidification is required.': 'Texto provisional: se requiere enfriamiento mecánico con deshumidificación.',
    'Placeholder: control moisture sources and infiltration.': 'Texto provisional: controla las fuentes de humedad y la infiltración.'
  };

  const DICTIONARIES = { es: ES, en: {} };
  const ATTRS = ['aria-label', 'title', 'placeholder', 'alt'];
  const textOriginals = new WeakMap();
  const attrOriginals = new WeakMap();
  let lang = DEFAULT_LANG;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'es' || saved === 'en') lang = saved;
  } catch (err) { /* storage unavailable: keep the default */ }

  const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m)) : s);
  const tIn = (code, key, vars) => {
    const dict = DICTIONARIES[code] || {};
    return fill(Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : key, vars);
  };
  const t = (key, vars) => tIn(lang, key, vars);

  const skipped = (node) => {
    for (let e = node.nodeType === 1 ? node : node.parentElement; e; e = e.parentElement) {
      if (e.nodeName === 'SCRIPT' || e.nodeName === 'STYLE' || e.hasAttribute('data-i18n-skip')) return true;
    }
    return false;
  };

  const translateDom = () => {
    document.documentElement.lang = lang;
    const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode();
    while (node) {
      if (node.nodeType === 3) {
        if (!skipped(node)) {
          if (!textOriginals.has(node)) textOriginals.set(node, node.nodeValue);
          const original = textOriginals.get(node);
          const key = original.replace(/\s+/g, ' ').trim();
          if (key) {
            const lead = original.match(/^\s*/)[0];
            const trail = original.match(/\s*$/)[0];
            node.nodeValue = lead + t(key) + trail;
          }
        }
      } else if (!skipped(node)) {
        let saved = attrOriginals.get(node);
        ATTRS.forEach((attr) => {
          if (!node.hasAttribute(attr)) return;
          if (!saved) { saved = {}; attrOriginals.set(node, saved); }
          if (saved[attr] === undefined) saved[attr] = node.getAttribute(attr);
          node.setAttribute(attr, t(saved[attr]));
        });
      }
      node = walker.nextNode();
    }
    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      if (!meta.dataset.i18nOriginal) meta.dataset.i18nOriginal = meta.getAttribute('content');
      meta.setAttribute('content', t(meta.dataset.i18nOriginal));
    }
  };

  const setLang = (code) => {
    if (code !== 'es' && code !== 'en') return;
    const previous = lang;
    lang = code;
    try { window.localStorage.setItem(STORAGE_KEY, code); } catch (err) { /* ignore */ }
    translateDom();
    document.querySelectorAll('input[name="lang"]').forEach((r) => { r.checked = r.value === code; });
    document.dispatchEvent(new CustomEvent('i18n:change', { detail: { lang: code, previous } }));
  };

  document.querySelectorAll('input[name="lang"]').forEach((r) => {
    r.checked = r.value === lang;
    r.addEventListener('change', () => { if (r.checked) setLang(r.value); });
  });
  translateDom();

  window.I18n = { t, tIn, setLang, get lang() { return lang; } };
})();
