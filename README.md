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
    └── vendor/
        └── psychrolib.js  PsychroLib (vendored)
```

## Features

- Psychrometric chart with an animated transition to a relative humidity chart
- Lines for dry-bulb, humidity ratio, relative humidity, wet-bulb, vapour pressure, specific volume and enthalpy, which you can toggle or highlight
- Draggable indicator that shows the full set of moist-air properties
- PMV comfort zones (ISO 7730 categories I/II/III) based on met, clo, air velocity and radiant offset
- ASHRAE 55 adaptive comfort bands (80% / 90% acceptability)
- Givoni bioclimatic chart: outlined, labelled zones (comfort zone filled green) laid out like Marsh's Psychrometric Chart, with a toggle per zone and strategy hours for loaded weather files
- Process lines: add, label, drag and delete points
- Load EPW weather files or CSV files (dry-bulb plus RH columns) by file picker or drag and drop, with an hourly frequency overlay, monthly filtering and comfort-hour statistics
- Configurable ranges, atmospheric pressure or elevation, and title/sub-title
- Export to PNG, CSV or JSON

## Givoni bioclimatic chart

Choose "Givoni bioclimatic chart" under Comfort overlay. Each zone can be toggled, and strategy hours are counted for loaded weather files.

## Configuration

- Zone vertices: `js/givoni.js`

## Embedding

```html
<iframe src="/psychro/index.html" style="width:100%;height:800px;border:0"></iframe>
```

## Credits

Moist-air equations follow ASHRAE; [PsychroLib](https://github.com/psychrometrics/psychrolib) is vendored. The Givoni zone layout follows Givoni (1998) as drawn in [Andrew Marsh's Psychrometric Chart](https://drajmarsh.bitbucket.io/psychro-chart2d.html); the code here is original.
