import {rollups, min, max, mean, extent, flatRollup} from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import {epwJson} from "./epw2json.js";
import "./psychrolib.js";

let modal = document.getElementById("modalWindow"),
    bsModal = new bootstrap.Modal(modal),
    modalHeader = modal.querySelector(".modal-header"),
    modalHeaderClose = modal.querySelector(".btn-close"),
    modalTitle = modal.querySelector(".modal-title"),
    modalBody = modal.querySelector(".modal-body"),
    modalFooter = modal.querySelector(".modal-footer");

modal.addEventListener("show.bs.modal", ev => {
    modalHeader.classList.add("bg-info", "text-white");
    modalHeaderClose.classList.add("visually-hidden");
    modalTitle.innerHTML = "<span class='material-symbols-outlined'>description</span> Cargando archivo";
    modalBody.innerHTML = "<span class='material-symbols-outlined spin fs-1'>progress_activity</span>";
    modalFooter.classList.add("visually-hidden");
});

modal.addEventListener("shown.bs.modal", async ev => {
    let evItems = ev.target.items,
        evFiles = ev.target.files,
        validFile = await validateExtension(evFiles),
        files = [...evFiles],
        items = [...evItems];
    if (validFile) {
        if (items.length == 1 || files.length == 1) { // process if it is only one file
            if (files.length == 1 ) { // Use DataTransfer interface to access the files
                files.forEach( file => {
                    readSingleFile(file);
                });
            } else { // Use DataTransferItemList interface to access the files
                items.forEach( item => {
                    // If dropped items aren't files, reject them
                    if (item.kind === "file") {
                        const file = item.getAsFile();
                        readSingleFile(file);
                    }
                });
            }
        } else { // reject if it is more than one file
            modalHeader.classList.remove("bg-info", "bg-danger", "text-white");
            modalHeader.classList.add("bg-warning");
            modalHeaderClose.classList.remove("visually-hidden");
            modalTitle.innerHTML = "<span class='material-symbols-outlined pulse'>warning</span> Atención";
            modalBody.innerHTML = "Arrastra un solo archivo";
            modalFooter.classList.remove("visually-hidden");
        }
    }
});

modal.addEventListener("hidden.bs.modal", e => {
    modalHeader.classList.remove("bg-info", "bg-danger", "bg-warning", "text-white",);
    modalHeaderClose.classList.remove("visually-hidden");
    modalTitle.innerHTML = "";
    modalBody.innerHTML = "";
    modalFooter.classList.remove("visually-hidden");
});

const preventDefaults = e => {
    e.preventDefault();
    e.stopPropagation();
}
const highlight = e => {
    document.getElementById("chartdiv").classList.add("highlight");
    document.getElementById("upload").style.display = "block";
}
const unhighlight = e => {
    document.getElementById("chartdiv").classList.remove("highlight");
    document.getElementById("upload").style.display = "none";
}
const validateExtension = async files => {
    let allowedExtensions = /(\.csv|\.epw)$/i;
    for (const file of files) {
        if (!allowedExtensions.exec(file.name)) {
            modalHeader.classList.add("bg-danger", "text-white");
            modalHeaderClose.classList.remove("visually-hidden");
            modalTitle.innerHTML = "<span class='material-symbols-outlined pulse'>error</span> Error";
            modalBody.innerHTML = "<span class='text-danger'>Usa solo archivos con extensión .epw o .csv</span>";
            modalFooter.classList.remove("visually-hidden");
            return false;
        } else {
            return true;
        }
    }
}
const processFile = e => {
    modal.items = e.dataTransfer.items;
    modal.files = e.dataTransfer.files;
    bsModal.show();
}

["dragenter", "dragover", "dragleave", "drop"].forEach(eventName => {
    document.getElementById("chartdiv").addEventListener(eventName, preventDefaults, false);
    document.body.addEventListener(eventName, preventDefaults, false);
});
["dragenter", "dragover"].forEach(eventName => {
    document.getElementById("chartdiv").addEventListener(eventName, highlight, false);
});
["dragleave", "drop"].forEach(eventName => {
    document.getElementById("chartdiv").addEventListener(eventName, unhighlight, false);
});
document.getElementById("chartdiv").addEventListener("drop", processFile, false);

// function to create a range array
const arrayRange = (start, stop, step) =>
    Array.from(
        { length: (stop - start) / step + 1 },
        (value, index) => parseFloat((start + index * step).toFixed(1))
    );

//function to get psychrometric data
const get_psychroData = altitude => {
    let dryBulb = arrayRange(0, 50, 0.1); // 0 to 50 every 0.1 oC
    let relativeHumidity = arrayRange(0.1, 1, 0.1); // 0.1 to 1 every 0.1 %

    //call this function with an altitude value
    if(altitude != 0){
        altitude = altitude;
    } else {
        altitude = 0;
    }

    //set unit system - SI
    psychrolib.SetUnitSystem(psychrolib.SI);
    //barometric pressure by altitude
    let pressure = psychrolib.GetStandardAtmPressure(altitude);

    let data = [],
        temp;

    //###################### Relative Humidity Lines #################################
    for (let [keyTemp, valueTemp] of Object.entries(dryBulb)) {
        let currentData = {temp: valueTemp};

        for (let [keyHumidity, valueHumidity] of Object.entries(relativeHumidity)) {
            let ah = psychrolib.GetHumRatioFromRelHum(valueTemp, valueHumidity, pressure)*1000;
            currentData[`hum${parseInt(keyHumidity)+1}`] = ah;
        }
        data.push(currentData);
    }
    //###################### Relative Humidity Lines #################################

    return data;
}

// function to create an axis range
const createRange = (value, axis, label) => {
    let rangeDataItem = axis.makeDataItem({
        value: value
    });

    let range = axis.createAxisRange(rangeDataItem);

    range.get("label").setAll({
        forceHidden: false,
        text: label,
        fontSize: "0.75em"
    });

    range.get("tick").set("visible", true);
    range.get("grid").setAll({
        forceHidden: true,
        strokeOpacity: 0.2,
        location: 1
    });
}

const zoneConfig = { // TODO: add actual gifs for each zone
    CZ: {
        label: "ZONA DE CONFORT",
        gifs: [
            { src: "./gifs/10.gif", title: "Estrategia 1 ZC" },
            { src: "./gifs/10.gif", title: "Estrategia 2 ZC" }
        ]
    },
    NV: {
        label: "VENTILACIÓN NATURAL",
        gifs: [
            { src: "./gifs/10.gif", title: "Estrategia 1 VN" },
            { src: "./gifs/10.gif", title: "Estrategia 2 VN" }
        ]
    },
    WME: {
        label: "INVIERNO",
        gifs: [
            { src: "./gifs/10.gif", title: "Estrategia 1 I" },
            { src: "./gifs/10.gif", title: "Estrategia 2 I" }
        ]
    },
    IG: {
        label: "GANANCIAS INTERNAS",
        gifs: [
            { src: "./gifs/10.gif", title: "Estrategia 1 GI" },
            { src: "./gifs/10.gif", title: "Estrategia 2 GI" }
        ]
    },
    PSH: {
        label: "CALENTAMIENTO SOLAR PASIVO",
        gifs: [
            { src: "./gifs/10.gif", title: "Estrategia 1 CSP" },
            { src: "./gifs/10.gif", title: "Estrategia 2 CSP" }
        ]
    },
    ASH: {
        label: "CALENTAMIENTO SOLAR ACTIVO",
        gifs: [
            { src: "./gifs/10.gif", title: "Estrategia 1 CSA" },
            { src: "./gifs/10.gif", title: "Estrategia 2 CSA" }
        ]
    }
};

// function to create RH lines series
const createRHSeries = (name, field, data) => {
    let series = chart.series.push(
        am5xy.SmoothedXLineSeries.new(root, {
            name: name,
            xAxis: xAxis,
            yAxis: yAxis,
            valueYField: field,
            valueXField: "temp",
            baseAxis: name == "100%" ? yAxis : xAxis,
            stroke: am5.color(0x767d84),
            fill: am5.color(0xffffff),
            layer: 30   // fill white and put on top to hide grid and give sense of curved plot
        })
    );
    if (name == "100%") {
        series.strokes.template.setAll({
            strokeWidth: 1,
            strokeOpacity: 0.7,
        });
        series.fills.template.setAll({
            fillOpacity: 1,
            visible: true
        });
    } else {
        series.strokes.template.setAll({
            strokeDasharray: [3, 2],
            strokeWidth: 1,
            strokeOpacity: 0.7,
        });
    }

    series.data.setAll(data);
    chart.set(name, series);
}

const createZoneSeries = ({
    key,            // "CZ" | "NV", etc.
    name,
    data,
    Tn,
    lowerOffset = 0,
    upperOffset = 2.5,   // how far ZnP extends
    lowerHumField = "hum2",
    upperHumField,       // "hum8" | "hum10"
    showFill = true,
    hoverFill = 0x297373,
    fillColor = null,
    shapeMode = "closed",
    dashArray = null
}) => {

    const series = chart.series.push(am5xy.LineSeries.new(root, {
        name,
        xAxis,
        yAxis,
        valueYField: "ah",
        valueXField: "t",
        stroke: am5.color(0x000),
        layer: 30,
        cursorOverStyle: "pointer"
    }));

    // --- shared styling ---
    series.strokes.template.setAll({
        strokeWidth: 2,
        strokeOpacity: 0.7,
        strokeDasharray: dashArray
    });

    series.fills.template.setAll({
        fillOpacity: showFill ? 0.25 : 0,
        visible: showFill,
        interactive: showFill
    });

    if (fillColor && showFill) {
        series.set("fill", am5.color(fillColor));
    }

    if (hoverFill) {
        series.fills.template.states.create("hover", {
            fill: am5.color(hoverFill)
        });
    }

    // --- shared hover behavior ---
    series.events.on("pointerover", ev => {
        ev.target.strokes.template.setAll({ strokeWidth: 4 });
    });

    series.events.on("pointerout", ev => {
        ev.target.strokes.template.setAll({ strokeWidth: 2 });
    });

    // --- zone math ---
    const ZnM = Tn - 2.5 + lowerOffset;
    const ZnP = Tn + 2.5 + upperOffset;
    const Tmid = (ZnM + ZnP) / 2;

    const zoneData = data
        .filter(d => d.temp >= ZnM && d.temp <= ZnP)
        .sort((a, b) => a.temp - b.temp);

    // lower boundary (20%)
    const partLower = zoneData.map(d => ({
        t: d.temp,
        ah: d[lowerHumField] || 0
    }));

    // upper boundary (configurable RH)
    const partUpper = zoneData
        .filter(d => d.temp <= Tmid)
        .map(d => ({
            t: d.temp,
            ah: d[upperHumField]
        }));

    // connector
    const partMid = zoneData
        .filter(d => d.temp == ZnP.toFixed(1))
        .map(d => ({
            t: ZnP,
            ah: d.hum5
        }));

    let polygon;
    if (shapeMode === "closed") {
        polygon = [
            partLower[0],
            ...partUpper,
            ...partMid,
            ...partLower.slice().reverse(),
            partLower[0] // optional safety close
        ];
    }

        else if (shapeMode === "c") {
            const partLowerTrimmed = partLower.filter(d => d.t <= Tmid);
            polygon = [
                ...partLowerTrimmed.slice().reverse(),   // bottom curve
                ...partUpper,   // top curve
            ];
        }

    series.data.setAll(polygon);
    chart.set(key, series);

    return series;
};

const addSeriesLabel = (series, dataItem, {
    text,
    dx = 0,
    dy = 0,
    rotation = 0,
    centerX = am5.p50,
    centerY = am5.p50
}) => {

    series.addBullet(dataItem, am5.Bullet.new(root, {
        sprite: am5.Label.new(root, {
            text,
            textAlign: "center",
            fontSize: "0.9em",
            fontWeight: "600",
            opacity: 0.9,
            centerX: centerX,
            centerY: centerY,
            layer: 30,
            dx,
            dy,
            rotation
        })
    }));

};

const attachSeriesLabel = (series, config) => {
    series.events.on("boundschanged", () => {

        // ensure rendered
        if (!series.dataItems.length || !series.dataItems[0].has("point")) return;

        const points = series.dataItems.map(di => di.get("point"));

        const [minX, maxX] = extent(points, p => p.x);
        const [minY, maxY] = extent(points, p => p.y);

        const rangeX = maxX - minX;
        const rangeY = maxY - minY;

        const first = series.dataItems[0];
        const last = series.dataItems.at(-1);

        const midValueX = (first.get("valueX") + last.get("valueX")) / 2;

        // anchor via axis
        const axis = series.get("xAxis");
        const axisPosition = axis.valueToPosition(midValueX);
        const dataItem = axis.getSeriesItem(series, axisPosition, 0);

        // clear previous bullets
        series.bulletsContainer.children.clear();
        series.bullets.clear();

        // add label
        addSeriesLabel(series, dataItem, {
            ...config,
            dx: typeof config.dx === "function"
                ? config.dx({ rangeX, rangeY })
                : config.dx || 0,
            dy: typeof config.dy === "function"
                ? config.dy({ rangeX, rangeY })
                : config.dy || 0
        });
    });
}

const renderGifGallery = (gifs = []) => {
    if (!gifs.length) return "<p>No hay estrategias</p>";

    return `
        <div class="d-flex flex-column gap-3">
            ${gifs.map(g => `
                <div class="text-center">
                    ${g.title ? `<div class="mb-1 fw-semibold">${g.title}</div>` : ""}
                    <img src="${g.src}" class="img-fluid rounded">
                </div>
            `).join("")}
        </div>
    `;
}

const attachSeriesClick = (series, zone) => {
    const el = document.getElementById("offcanvasNavbar");
    const body = el.querySelector(".offcanvas-body");
    // reuse the SAME instance
    const bsOffcanvas = bootstrap.Offcanvas.getOrCreateInstance(el);

    series.events.on("click", () => {

        body.innerHTML = renderGifGallery(zoneConfig[zone].gifs);
        bsOffcanvas.show();
    });
}

// function to create data series from epw
const createDataSeries = (name, chartData) => {
    let series = chart.series.push(am5xy.LineSeries.new(root, {
        name: name,
        xAxis: xAxis,
        yAxis: yAxis,
        valueYField: "ah",
        valueXField: "t",
    }));
    series.strokes.template.set("visible", false);
    series.strokes.template.set("strokeOpacity", 0);
    series.bullets.push( () => {
        let bulletCircle = am5.Circle.new(root, {
            radius: 2,
            fill: am5.color("#00F"),
            fillOpacity: 0.8,
            layer: 30
        });
        return am5.Bullet.new(root, {
            sprite: bulletCircle
        });
        });

    series.data.setAll(chartData);
    chart.set(name, series);

    return series;
}

// function to create heatmap data series from epw
const createHeatSeries = (name, chartData) => {
    let heatSeries = chart.series.push(am5xy.ColumnSeries.new(root, {
        name: name,
        calculateAggregates: true,
        stroke: am5.color(0xffffff),
        fill: am5.color(0xfe131a),
        fillOpacity: 0.75,
        clustered: false,
        xAxis: xHeatAxis,
        yAxis: yHeatAxis,
        categoryXField: "t",
        categoryYField: "ah",
        valueField: "n"
    }));

    heatSeries.columns.template.setAll({
        tooltipText: "Temperatura: {t} °C\nHumedad absoluta: {ah} g/kg\nObservaciones: {n}",
        strokeOpacity: 0.5,
        strokeWidth: 2,
        fillOpacity: 0.95,
        width: am5.p90,
        height: am5.p90
    });

    // FIXME: do not update color in grid legend square on hover
    heatSeries.columns.template.events.on("pointerover", event => {
        let di = event.target.dataItem;
        if (di) {
            heatLegend.showValue(di.get("value", 0));
        }
    });

    heatSeries.events.on("datavalidated", () => {
        heatLegend.set("startValue", heatSeries.getPrivate("valueLow"));
        heatLegend.set("endValue", heatSeries.getPrivate("valueHigh"));
    });

    // Set up heat rules
    heatSeries.set("heatRules", [{
        target: heatSeries.columns.template,
        min: am5.color(0xfef0f1),
        max: am5.color(0xfe131a),
        dataField: "value",
        key: "fill"
    }]);

    heatSeries.data.setAll(chartData);
    chart.set(name, heatSeries);

    // define array of temperature and absolute humidity of one less than corresponding axis to align heatmap grid
    let temps = arrayRange(0, 49, 1),
        absHums =  arrayRange(0, 34, 1),
        axisTemps = temps.map( t => { return {"t": t} }),
        axisHums = absHums.map( ah => { return {"ah": ah} });

    xHeatAxis.data.setAll(axisTemps);
    yHeatAxis.data.setAll(axisHums);

    return heatSeries;
}

const createRefLine = (Tn, data) => {
    const TnLine = chart.series.push(am5xy.LineSeries.new(root, {
        xAxis: xAxis,
        yAxis: yAxis,
        valueXField: "t",
        valueYField: "ah",
        stroke: am5.color(0x000000),
        layer: 30
    }));

    TnLine.strokes.template.setAll({
        strokeWidth: 2,
        strokeOpacity: 0.8,
        strokeDasharray: [2, 4]
    });

    const boundaryPoint = data.reduce((closest, d) =>
        Math.abs(d.temp - Tn) < Math.abs(closest.temp - Tn) ? d : closest
    );
    const yMax = boundaryPoint.hum10 + 2;

    TnLine.data.setAll([
        { t: Tn, ah: 0 },
        { t: Tn, ah: yMax }
    ]);

    TnLine.bullets.push(() => {
        const label = am5.Label.new(root, {
            text: `Tn = ${Tn} °C`,
            fontSize: "0.7em",
            fontWeight: "600",
            centerX: am5.p0,
            centerY: am5.p50,
            dx: -5,
            dy: -10,
            fill: am5.color(0x000000),
            layer: 30
        });

        return am5.Bullet.new(root, {
            locationY: 1, // top of the line
            sprite: label
        });
    });
}

const setupAxes = (elevation, Tn) => {
    let psychroData = get_psychroData(elevation);

    // get temperature values where 40%-100% RH lines intersect with truncated axis
    let ahValues = psychroData.filter(k => k.temp == 50)[0],
        xAxisAHValues = Object.fromEntries(
            Object.entries(ahValues).filter(([key, value]) => value > 35 && key != "temp") ),
        yAxisAHValues = Object.fromEntries(
            Object.entries(ahValues).filter(([key, value]) => value < 35) );

    // Place labels for RH lines on top x axis
    Object.keys(xAxisAHValues).map( ah => {
        let minTemp = psychroData.filter(k => k[ah] > 35)[0].temp,
            maxTemp = psychroData.filter(k => k[ah] < 35).slice(-1)[0].temp,
            limitTemp = parseFloat((minTemp + (maxTemp - minTemp)/2).toFixed(2)),
            label = `${ah.split("hum")[1]*10}%`;
        createRange(limitTemp, xAxisRH, label);
    });

    // Place labels for RH lines on right y axis
    Object.entries(yAxisAHValues).map( kv => {
        let ah = kv[0],
            temp = kv[1],
            label = `${ah.split("hum")[1]*10}%`;
        createRange(temp, yAxisRH, label);
    });

    // Create relative humidity series
    let relativeHumidity = arrayRange(0.1, 1, 0.1);
    relativeHumidity.forEach( rh => {
        let name = rh.toLocaleString("en", {style: "percent"}),
            field = `hum${rh*10}`;
        createRHSeries(name, field, psychroData);
    });

    // Create active solar heating zone
    let seriesASH = createZoneSeries({
        key: "ASH",
        name: "ASH",
        data: psychroData,
        Tn,
        lowerOffset: -16.5,
        upperOffset: -14.5,          // ZnP = Tn + 2.5
        lowerHumField: "hum0",    // 0%
        upperHumField: "hum10",   // 100%
        showFill: true,
        fillColor: "#fff",
        shapeMode: "c",
        dashArray: null
    });

    // Create passive solar heating zone
    let seriesPSH = createZoneSeries({
        key: "PSH",
        name: "PSH",
        data: psychroData,
        Tn,
        lowerOffset: -12,
        upperOffset: 5,          // ZnP = Tn + 2.5
        lowerHumField: "hum0",    // 0%
        upperHumField: "hum10",   // 100%
        showFill: true,
        fillColor: "#fff",
        shapeMode: "c",
        dashArray: null
    });

    // Create internal gains zone
    let seriesIG = createZoneSeries({
        key: "IG",
        name: "IG",
        data: psychroData,
        Tn,
        lowerOffset: -8,
        upperOffset: -3,          // ZnP = Tn + 2.5
        lowerHumField: "hum2",    // 20%
        upperHumField: "hum8",   // 80%
        showFill: true,
        fillColor: "#fff",
        shapeMode: "c",
        dashArray: null
    });

    // Create winter mass effect zone
    let seriesWME = createZoneSeries({
        key: "WME",
        name: "WME",
        data: psychroData,
        Tn,
        lowerOffset: -2.5,
        upperOffset: -4.5,          // ZnP = Tn + 2.5
        lowerHumField: "hum2",    // 20%
        upperHumField: "hum8",   // 80%
        showFill: true,
        fillColor: "#fff",
        shapeMode: "c",
        dashArray: [8,4]
    });

    // Create natural ventilation zone
    let seriesNV = createZoneSeries({
        key: "NV",
        name: "NV",
        data: psychroData,
        Tn,
        lowerOffset: 0,
        upperOffset: 5,          // ZnP = Tn + 2.5
        lowerHumField: "hum2",    // 20%
        upperHumField: "hum10",   // 100%
        showFill: true,
        fillColor: "#fff",
        shapeMode: "closed",
        dashArray: null
    });

    // Create comfort zone
    let seriesCZ = createZoneSeries({
        key: "CZ",
        name: "CZ",
        data: psychroData,
        Tn,
        lowerOffset: 0,
        upperOffset: 0,          // ZnP = Tn + 2.5
        lowerHumField: "hum2",   // 20%
        upperHumField: "hum8",   // 80%
        showFill: true,
        fillColor: "#35FE4C",
        shapeMode: "closed",
        dashArray: null
    });

    attachSeriesLabel(seriesCZ, {
        text: "ZONA DE\nCONFORT",
        centerX: am5.p0,
        centerY: am5.p0,
        dx: ({ rangeX }) => rangeX/2 * 0.25,
        dy: ({ rangeY }) => -rangeY/2 * 1.25
    });
    attachSeriesClick(seriesCZ, "CZ");

    attachSeriesLabel(seriesNV, {
        text: "VENTILACIÓN NATURAL",
        rotation: -30, // TODO: fix this angle - maybe get slope between min temp and max AH points
        centerX: am5.p0,
        centerY: am5.p100,
        dx: ({ rangeX }) => rangeX/2 * 0.15,
        dy: ({ rangeY }) => -rangeY/2 * 1.25
    });
    attachSeriesClick(seriesNV, "NV");

    attachSeriesLabel(seriesWME, {
        text: "INVIERNO",
        rotation: 90,
        centerX: am5.p50,
        centerY: am5.p0,
        dx: ({ rangeX }) => -rangeX/2 * .75,
        dy: ({ rangeY }) => -rangeY/2 * 0.85
    });
    attachSeriesClick(seriesWME, "WME");

    attachSeriesLabel(seriesIG, {
        text: "GANANCIAS\nINTERNAS",
        rotation: 90,
        centerX: am5.p50,
        centerY: am5.p0,
        dx: ({ rangeX }) => -rangeX/2 * 1.45,
        dy: ({ rangeY }) => -rangeY/2 * 0.6
    });
    attachSeriesClick(seriesIG, "IG");

    attachSeriesLabel(seriesPSH, {
        text: "CALENTAMIENTO\nSOLAR PASIVO",
        rotation: 90,
        centerX: am5.p50,
        centerY: am5.p0,
        dx: ({ rangeX }) => -rangeX/2 * 1.75,
        dy: ({ rangeY }) => -rangeY/2 * 0.5
    });
    attachSeriesClick(seriesPSH, "PSH");

    attachSeriesLabel(seriesASH, {
        text: "CALENTAMIENTO\nSOLAR ACTIVO",
        rotation: 90,
        centerX: am5.p50,
        centerY: am5.p0,
        dx: ({ rangeX }) => -rangeX/2 * 1.25,
        dy: ({ rangeY }) => -rangeY/2 * 1.1
    });
    attachSeriesClick(seriesASH, "ASH");

    createRefLine(Tn, psychroData);

    return {
        zones: [seriesASH, seriesPSH, seriesIG, seriesWME, seriesNV, seriesCZ]
    };
}

// function to read epw file
const readSingleFile = file => {
    if (file) {
        let reader = new FileReader();
        reader.readAsText(file);
        reader.onload = e => { // read as file
            let contents = e.target.result,
                raw = reader.result,
                epw = epwJson(raw); // parse epw file as json

            let altitude = epw.elevation != undefined ? epw.elevation : 0;
            //set unit system - SI
            psychrolib.SetUnitSystem(psychrolib.SI);
            let pressure = psychrolib.GetStandardAtmPressure(altitude),
                // convert relative humidity from epw to absolute humidity to plot in chart
                pointData = epw.weatherData.map( d => {
                    let ah = psychrolib.GetHumRatioFromRelHum(+d[6], +d[8]/100, pressure)*1000;
                    return {"t": +d[6],
                            "tFloor": Math.floor(d[6]),
                            "ah": ah,
                            "ahFloor": Math.floor(ah),
                            "month": +d[1]}
                }),
                // sumarize data in  groups of temperature, absolute humidity, and number of observations
                heatData = flatRollup(pointData, d => d.length, d => d.tFloor, d => d.ahFloor)
                    .map(d => { return {"t": d[0], "ah": d[1], "n": d[2]} });

            let meanTempByMonth = rollups(pointData, v => mean(v, d => d.t), d => d.month),
                meanTempObj = meanTempByMonth.map(d => { return {"month": d[0], "meanTemp": +d[1].toFixed(2)} }),
                minTempMonth = rollups(pointData, v => min(v, d => d.t), d => d.month),
                maxTempMonth = rollups(pointData, v => max(v, d => d.t), d => d.month),
                meanTemp = mean(meanTempObj, d => d.meanTemp).toFixed(1),
                Tn = +parseFloat(17.6 + 0.31*meanTemp).toFixed(2);

            // remove all series and RH axes ticks and labels before adding new ones
            chart.series.clear();
            xAxisRH.axisRanges.clear();
            yAxisRH.axisRanges.clear();
            legend.data.clear();
            legend.children.clear();
            // adjust axes, ticks, and labels for epw data
            const { zones } = setupAxes(altitude, Tn); // TODO: update xAxis min limit from epw data
            const dataSeries = createDataSeries("Datos horarios", pointData);
            const heatSeries = createHeatSeries("Malla distribuida", heatData);
            legend.data.setAll([dataSeries, heatSeries]);
            givoniLegend(zones);

            // Bring confort zone to front
            chart.get("CZ").toFront();
            
            // Update chart info
            let chartInfoText = `${epw.stationLocation}, ${epw.country}\nElevación: ${epw.elevation} m\nLatitud: ${epw.latitude}\nLongitud: ${epw.longitude}`;
            chartInfo.set("text", chartInfoText);
            bsModal.hide();
        };
    } else {
        modalHeader.classList.remove("bg-info", "bg-warning");
        modalHeader.classList.add("bg-danger", "text-white");
        modalHeaderClose.classList.remove("visually-hidden");
        modalTitle.innerHTML = "<span class='material-symbols-outlined'>error</span> Error";
        modalBody.innerHTML = "<span class='text-danger'>No se pudo cargar el archivo. Intente de nuevo</span>";;
        modalFooter.classList.remove("visually-hidden");
    }
};

// Create root element
let root = am5.Root.new("chartdiv");
root._logo.dispose();

// Set themes
root.setThemes([
    am5themes_Animated.new(root)
]);

// Create chart
let chart = root.container.children.push(
    am5xy.XYChart.new(root, {
        panX: true,
        panY: true,
        wheelY: "zoomXY",
        pinchZoomX: true,
        pinchZoomY: true,
        layout: root.verticalLayout,
        paddingLeft: 5,
        paddingRight: 5,
    })
);

// Add Cursor
chart.set("cursor", am5xy.XYCursor.new(root, {}));
let cursor = chart.get("cursor");

cursor.lineX.setAll({
    stroke: am5.color(0x550000),
    strokeWidth: 0.7,
    strokeDasharray: [3, 3],
});

cursor.lineY.setAll({
    stroke: am5.color(0x550000),
    strokeWidth: 0.7,
    strokeDasharray: [4, 3],
});

// Create axes
let xAxis = chart.xAxes.push(
    am5xy.ValueAxis.new(root, {
        min: 0,
        max: 50,
        autoZoom: false,
        strictMinMax: true,
        maxDeviation: 0,
        extraTooltipPrecision: 1,
        renderer: am5xy.AxisRendererX.new(root, {
            minGridDistance: 100,
            minorGridEnabled: true,
            stroke: am5.color(0x767d84),
            strokeOpacity: 1,
            strokeWidth: 1
        }),
        tooltip: am5.Tooltip.new(root, {
            themeTags: ["axis"],
            animationDuration: 300
        })
    })
);

xAxis.children.push(am5.Label.new(root, {
    text: "Temperatura de bulbo seco (°C)",
    textAlign: "center",
    x: am5.p50,
    fontSize: "0.75em"
}));

let xRenderer = xAxis.get("renderer");
xRenderer.ticks.template.setAll({
    visible: true
});
xRenderer.labels.template.setAll({
    fontSize: "0.75em"
});

let yAxis = chart.yAxes.push(
    am5xy.ValueAxis.new(root, {
        min: 0,
        max: 35,
        autoZoom: false,
        strictMinMax: true,
        maxDeviation: 0,
        renderer: am5xy.AxisRendererY.new(root, {
            opposite: true,
        })
    })
);

let yRenderer = yAxis.get("renderer");
yRenderer.grid.template.set("forceHidden", true);
yRenderer.labels.template.set("forceHidden", true);

let yAxisAH = chart.yAxes.push(
    am5xy.ValueAxis.new(root, {
        min: 0,
        max: 35,
        x: 0,
        autoZoom: false,
        strictMinMax: true,
        maxDeviation: 0,
        extraTooltipPrecision: 1,
        renderer: am5xy.AxisRendererY.new(root, {
            opposite: true,
            minGridDistance: 50,
            stroke: am5.color(0x767d84),
            strokeOpacity: 1,
            strokeWidth: 1,
            minorGridEnabled: true,
            visible: true
        }),
        tooltip: am5.Tooltip.new(root, {
            themeTags: ["axis"],
            animationDuration: 300
        })
    })
);

yAxisAH.children.push(am5.Label.new(root, {
    text: "Humedad absoluta (g/kg)",
    textAlign: "center",
    y: am5.p50,
    rotation: 90,
    fontSize: "0.75em"
}));

let yRendererAH = yAxisAH.get("renderer");
yRendererAH.ticks.template.setAll({
    visible: true
});
yRendererAH.grid.template.set("forceHidden", false);
yRendererAH.labels.template.setAll({
    forceHidden: false,
    fontSize: "0.75em"
});

let xAxisRH = chart.xAxes.push(
    am5xy.ValueAxis.new(root, {
        min: 0,
        max: 50,
        autoZoom: false,
        strictMinMax: true,
        maxDeviation: 0,
        numberFormat: "#.'%'",
        renderer: am5xy.AxisRendererX.new(root, {
            opposite: true,
            minGridDistance: 50,
            stroke: am5.color(0x767d84),
            strokeOpacity: 1,
            strokeWidth: 1
        }),
    })
);

let xRendererRH = xAxisRH.get("renderer");
xRendererRH.grid.template.set("forceHidden", true);
xRendererRH.labels.template.set("forceHidden", true);

let yAxisRH = chart.yAxes.push(
    am5xy.ValueAxis.new(root, {
        min: 0,
        max: 35,
        autoZoom: false,
        strictMinMax: true,
        maxDeviation: 0,
        numberFormat: "#.'%'",
        renderer: am5xy.AxisRendererY.new(root, {
            opposite: true,
            minGridDistance: 50,
            stroke: am5.color(0x767d84),
            strokeOpacity: 1,
            strokeWidth: 1,
            inside: true
        }),
    })
);

let yRendererRH = yAxisRH.get("renderer");
yRendererRH.grid.template.set("forceHidden", true);
yRendererRH.labels.template.set("forceHidden", true);

// heatmap to show grid of values
let xHeatAxis = chart.xAxes.push(
    am5xy.CategoryAxis.new(root, {
        maxDeviation: 0,
        renderer: am5xy.AxisRendererX.new(root, {
            minGridDistance: 30
        }),
        categoryField: "t"
    })
);
let xHeatRenderer = xHeatAxis.get("renderer");
xHeatRenderer.grid.template.set("visible", false);
xHeatRenderer.labels.template.set("forceHidden", true);

let yHeatAxis = chart.yAxes.push(
    am5xy.CategoryAxis.new(root, {
        maxDeviation: 0,
        renderer: am5xy.AxisRendererY.new(root, {
            minGridDistance: 30,
            minorGridEnabled: true,
            visible: false
        }),
        categoryField: "ah"
    })
);
let yHeatRenderer = yHeatAxis.get("renderer");
yHeatRenderer.grid.template.set("visible", false);
yHeatRenderer.labels.template.set("forceHidden", true);

// add chart info
let chartInfo = root.container.children.push(am5.Label.new(root, {
    text: "Arrastra y suelta un archivo .epw sobre la gráfica",
    textAlign: "left",
    fontSize: "1em",
    y: 20,
    layer: 30,
    paddingTop: 0,
    paddingBottom: 0
}));

// Grid and points legend
let legend = chart.bottomAxesContainer.children.push(am5.Legend.new(root, {
    layout: root.horizontalLayout,
    y: am5.p50,
    centerY: am5.p50
}));

legend.labels.template.set("fontSize", "0.75em");
legend.markers.template.setAll({
    width: 24,
    height: 18
});
legend.markerRectangles.template.setAll({
    cornerRadiusTL: 0,
    cornerRadiusTR: 0,
    cornerRadiusBL: 0,
    cornerRadiusBR: 0,
    opacity: 0.75
});

// Heat legend
let heatLegend = chart.bottomAxesContainer.children.push(am5.HeatLegend.new(root, {
    orientation: "horizontal",
    endColor: am5.color(0xfe131a),
    startColor: am5.color(0xfef0f1),
    width: am5.p50
}));

// set heatLegend font sizes
heatLegend.get("tooltip").label.setAll({
  fontSize: "0.75em"
});
heatLegend.startLabel.set("fontSize", "0.75em");
heatLegend.endLabel.set("fontSize", "0.75em");

// General legend container
let legendContainer = chart.children.push(am5.Container.new(root, {
    centerX: am5.p50,
    x: am5.p50,
    layout: root.gridLayout
}));

// Add both legends
legendContainer.children.push(legend);
legendContainer.children.push(heatLegend);

const fadeSeries = (series, show) => {

    series.set("interactive", show);

    series.animate({
        key: "opacity",
        to: show ? 1 : 0,
        duration: 250
    });

    if (!show) {
        setTimeout(() => series.set("visible", false), 250);
    } else {
        series.set("visible", true);
    }
};

const givoniLegend = seriesList => {
    const zoneToggle = legend.children.push(
        am5.Container.new(root, {
            layout: root.horizontalLayout,
            cursorOverStyle: "pointer",
            paddingRight: 40,
            paddingTop: 0,
            centerY: am5.p50,
            dy: -2,
            valign: "middle" ,
            interactive: true
        })
    );

    const marker = zoneToggle.children.push(
        am5.Rectangle.new(root, {
            width: 24,
            height: 18,
            stroke: am5.color(0x000000),
            strokeWidth: 1,
            cornerRadius: 0,
            centerY: am5.p0,
            interactive: false
        })
    );
    zoneToggle.set("background", am5.Rectangle.new(root, {
        fill: am5.color(0x000000),
        fillOpacity: 0,   // invisible but clickable
        fillPattern: null
    }));

    zoneToggle.children.push(
        am5.Label.new(root, {
            text: "Diagrama de Givoni",
            fontSize: "0.75em",
            centerY: am5.p50,
            dy: 9,
            interactive: false
        })
    );
    zoneToggle.setAll({
        interactive: true,
        cursorOverStyle: "pointer"
    });

    let zonesVisible = true;

    zoneToggle.events.on("click", () => {

        zonesVisible = !zonesVisible;
        seriesList.forEach(s => fadeSeries(s, zonesVisible));

        zoneToggle.animate({
            key: "opacity",
            to: zonesVisible ? 1 : 0.3,
            duration: 250
        });
    });
}

const { zones } = setupAxes(0, 23);
// initial fake legend
const dataSeries = createDataSeries("Datos horarios", [{ah: 40, t: 23}]);
const heatSeries = createHeatSeries("Malla distribuida", [{t: 23, ah: 40, n : 1}]);
legend.data.setAll([dataSeries, heatSeries]);
givoniLegend(zones);