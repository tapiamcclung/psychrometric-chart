# Interactive Psychrometric Chart

A self-contained psychrometric chart. Plain HTML, CSS and JavaScript, with no build step and no external CDNs (PsychroLib is vendored in `js/vendor/`).

## Deploy

Upload this folder to any static web server (Apache, Nginx, IIS, S3, GitHub Pages, Netlify, Vercel...) and open `index.html`.
You can also open `index.html` straight from disk.

```
psychro/
├── index.html
├── README.md
├── css/styles.css
└── js/
    ├── app.js             chart rendering, interaction and UI
    ├── comfort.js         PMV/PPD (ISO 7730) and adaptive comfort (ASHRAE 55)
    ├── givoni.js          Givoni bioclimatic zone definitions
    ├── psychrometrics.js  moist-air property equations (uses PsychroLib when loaded)
    ├── sidebar.js         collapsible left Controls sidebar
    ├── strategies.js      right-hand Strategies sidebar
    └── vendor/
        └── psychrolib.js  PsychroLib (vendored)
```

## Features

- Psychrometric chart with an animated transition to a relative humidity chart
- Lines for dry-bulb, humidity ratio, relative humidity, wet-bulb, vapour pressure, specific volume and enthalpy, which you can toggle or highlight
- Draggable indicator that shows the full set of moist-air properties
- PMV comfort zones (ISO 7730 categories I/II/III) based on met, clo, air velocity and radiant offset
- ASHRAE 55 adaptive comfort bands (80% / 90% acceptability)
- Givoni bioclimatic chart: outlined, labelled zones (comfort zone filled green) laid out like Marsh's Psychrometric Chart, with a toggle per zone and strategy hours for loaded weather files. Zones shift with the mean outdoor temperature (the control is shared with the adaptive comfort overlay) and a dotted line marks that temperature
- Process lines: add, label, drag and delete points
- Load EPW weather files or CSV files (dry-bulb plus RH columns) by file picker or drag and drop, with an hourly frequency overlay, monthly filtering and comfort-hour statistics
- Configurable ranges, atmospheric pressure or elevation, and title/sub-title. Defaults are 0–50 °C and 0–35 g/kg (right axis labelled every 5 g/kg); loading a weather file widens the ranges only as far as that file needs, and clearing the data restores the defaults
- Collapsible Strategies sidebar (right): lists the Givoni zone(s) at the indicator with placeholder strategy text. It does not open by itself; its tab shows how many strategies apply to the selected point
- Clicks in the grey area above the 100% RH line, on the axes or in the margins are ignored; only clicks inside the chart move the indicator
- RH line labels: lines that wrap to the top axis are labelled above the chart, lines that end at the right edge are labelled inside the chart; in the RH chart all RH labels are on the right, outside the chart, and the left RH axis ticks are removed (the axis title moves to the right)
- Collapsible Controls sidebar (left), mirrored by the Strategies sidebar (right)
- Weather-data overlay: hourly points are binned into cells (1 °C × 1 g/kg in the psychrometric chart, 1 °C × `RH_STEP` % RH in the RH chart so cells are true rectangles); clicking shows the hours in that cell in the readout, and a legend in the bottom-right corner shows the colour ramp from 1 hour to the busiest cell
- "From weather data" for the mean outdoor temperature shows the value being used in the text box
- Hovering the chart in Givoni mode highlights every zone under the pointer
- The Current conditions box has a minimize/expand button and is minimized automatically in the RH chart (it shows a one-line summary)
- Export to PNG, CSV or JSON

## Givoni bioclimatic chart

Choose "Givoni bioclimatic chart" under Comfort overlay. Each zone can be toggled, and strategy hours are counted for loaded weather files.

- Humidity limits are percentages of the saturation humidity ratio (W/Wsat, which differs slightly from true RH), a 16 g/kg cap, and a constant-enthalpy line (evaporative cooling); everything is recomputed at the current pressure
- All zone temperatures shift by 0.31 °C per °C of mean outdoor temperature relative to 19 °C (the ASHRAE 55 adaptive slope), so at 19 °C the comfort zone is 20–27 °C. This was fitted to screenshots at 10, 19 and 28 °C; other values are extrapolated
- Edges that lie on a relative humidity line (20%, 80%, 100%) follow the true RH curve, including the natural ventilation bottom edge

## Configuration

- Zone vertices: `js/givoni.js`
- Strategy text: `TEXT` table at the top of `js/strategies.js` (currently placeholders)
- Mean outdoor temperature slope: `setMeanOutdoor()` in `js/givoni.js` (0.31 °C per °C)
- RH chart cell height: `RH_STEP` in `js/app.js` (currently 2)

## Notes

- Active solar, passive solar, internal gains and winter are open C shapes (internal gains and winter follow the RH 20% and 80% curves); zone outlines are drawn outside the plot clip so edges on the saturation curve and the axis stay visible
- Winter, internal gains and comfort zones are separated by a small gap (0.5 °C)
- The 100% RH line is thin and light grey so zone outlines on top of it stay visible
- At low atmospheric pressure (altitude) the saturation curve rises above the top of the chart; Givoni zone corners are capped at the top edge and the natural ventilation label sits just inside the saturation curve
- On wide screens the app is locked to the window height and the sidebars scroll inside themselves; on narrow screens (860 px or less) the panels stack and the chart is pinned to the top while you scroll
- Zone geometry was checked against screenshots of Marsh's chart at 101.3 and 77.2 kPa, not against its source code
- Unticking "From weather data" keeps the value shown in the box as the manual setting; while it follows the weather data the box is greyed out
- The mass cooling and night ventilation label is split in two lines, and shortened to "MASS COOL & / NIGHT VENT." in the RH chart
- Data cells are inset by up to 2 px on every side so grid lines show between neighbouring cells
- Givoni labels are centred vertically in their zone at the label's temperature (a label can set `band` in `js/givoni.js` to centre in a different region); the natural ventilation label hugs the saturation curve at the top of its region; the mass cooling and night ventilation label stays 20 px inside the right edge of its zone; the AIR-CONDITIONING label stays flush with the right edge of the chart whatever the mean outdoor temperature, and is hidden once its zone has moved out of the plot; the active solar, passive solar heating, internal gains, comfort zone and air-conditioning & dehumidification labels are split in two lines
- `RH_STEP` is 2 (RH chart cells are 1 °C wide and 2 % RH tall)
- All project scripts (`app.js`, `comfort.js`, `givoni.js`, `psychrometrics.js`, `sidebar.js`, `strategies.js`) use `const`/`let` and arrow functions: there is no `var` and no `function` keyword left (functions are `const name = (...) => ...`, so a function must be defined above the code that calls it at load time). The vendored `js/vendor/psychrolib.js` is unchanged

## Limitations

- Zone limits come from screenshots of a reference chart and Givoni (1998), not from its source code; compare against your own reference before relying on them
- "From weather data" uses the mean of the loaded (month-filtered) data, not a 30-day running mean
- Strategy text in the Strategies sidebar is placeholder text

## Embedding

```html
<iframe src="/psychro/index.html" style="width:100%;height:800px;border:0"></iframe>
```

## Credits

Moist-air equations follow ASHRAE; [PsychroLib](https://github.com/psychrometrics/psychrolib) is vendored. The Givoni zone layout follows Givoni (1998) as drawn in [Andrew Marsh's Psychrometric Chart](https://drajmarsh.bitbucket.io/psychro-chart2d.html); the code here is original.
