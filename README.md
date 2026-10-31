# Interactive Psychrometric Chart

A self-contained, dependency-free psychrometric chart. Plain HTML, CSS and JavaScript, with no build step and no external CDNs.

## Deploy

Upload this folder to any static web server (Apache, Nginx, IIS, S3, GitHub Pages, Netlify, Vercel...) and open `index.html`.
You can also open `index.html` straight from disk.

```
psychro/
├── index.html
├── css/styles.css
└── js/
    ├── psychrometrics.js   moist-air property equations (ASHRAE, SI units)
    ├── comfort.js          PMV/PPD (ISO 7730) and adaptive comfort (ASHRAE 55)
    └── app.js              chart rendering and UI
```

## Features

- Psychrometric chart with an animated transition to a relative humidity chart
- Lines for dry-bulb, humidity ratio, relative humidity, wet-bulb, vapour pressure, specific volume and enthalpy, which you can toggle or highlight
- Draggable indicator that shows the full set of moist-air properties
- PMV comfort zones (ISO 7730 categories I/II/III) based on met, clo, air velocity and radiant offset
- ASHRAE 55 adaptive comfort bands (80% / 90% acceptability)
- Process lines: add, label, drag and delete points
- Load EPW weather files or CSV files (dry-bulb plus RH columns) by file picker or drag and drop, with an hourly frequency overlay, monthly filtering and comfort-hour statistics
- Configurable ranges, atmospheric pressure or elevation, and title/sub-title
- Export to PNG, CSV or JSON

## Embedding

```html
<iframe src="index.html" style="width:100%;height:800px;border:0"></iframe>
```
