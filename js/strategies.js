/*
 * Right-hand "Strategies" sidebar for the Givoni chart. Shows PLACEHOLDER text for every zone that contains
 * the indicator (zones overlap, so several can apply). Replace the text below with real guidance.
 * app.js dispatches a 'psychro:zones' event whenever the indicator moves while the Givoni chart is active.
 */
(function () {
  'use strict';

  var TEXT = {
    c:    { tips: ['Placeholder: conditions are within the comfort zone.', 'Placeholder: no active conditioning is needed.'] },
    v:    { tips: ['Placeholder: open windows on opposite sides for cross-ventilation.', 'Placeholder: use ceiling fans to extend the comfort range.'] },
    m:    { tips: ['Placeholder: use heavy walls and floors to absorb daytime heat.', 'Placeholder: shade the thermal mass from direct summer sun.'] },
    mnv:  { tips: ['Placeholder: ventilate at night to flush stored heat.', 'Placeholder: close the building during the hottest hours.'] },
    dec:  { tips: ['Placeholder: direct evaporative coolers work well in dry air.', 'Placeholder: provide an outlet for the added moisture.'] },
    ps:   { tips: ['Placeholder: orient large glazing toward the sun.', 'Placeholder: add thermal mass behind the glass to store heat.'] },
    as:   { tips: ['Placeholder: consider solar collectors for space or water heating.', 'Placeholder: pair collectors with storage.'] },
    ig:   { tips: ['Placeholder: tight envelope and good insulation keep internal gains useful.', 'Placeholder: heat from people and equipment may be enough.'] },
    heat: { tips: ['Placeholder: active heating is required.', 'Placeholder: improve insulation and airtightness first.'] },
    h:    { tips: ['Placeholder: air is dry; consider humidification.', 'Placeholder: indoor plants or water features can help.'] },
    ac:   { tips: ['Placeholder: mechanical cooling is required.', 'Placeholder: reduce loads with shading and insulation first.'] },
    dehum:{ tips: ['Placeholder: mechanical cooling with dehumidification is required.', 'Placeholder: control moisture sources and infiltration.'] }
  };

  var panel = document.getElementById('strategies');
  var toggle = document.getElementById('strategies-toggle');
  var body = document.getElementById('strategies-body');
  var list = document.getElementById('strategies-list');
  var sub = document.getElementById('strategies-sub');
  var model = document.getElementById('comfort-model');
  var chev = toggle.querySelector('.chev');

  function setOpen(open) {
    panel.classList.toggle('collapsed', !open);
    body.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    chev.textContent = open ? '›' : '‹';
  }

  function message(text) {
    list.textContent = '';
    var p = document.createElement('p');
    p.className = 'hint';
    p.textContent = text;
    list.appendChild(p);
  }

  function render(zones, t, w) {
    sub.textContent = t.toFixed(1) + ' °C, ' + (w * 1000).toFixed(1) + ' g/kg';
    list.textContent = '';
    zones.forEach(function (z) {
      var card = document.createElement('section');
      card.className = 'strategy';
      card.style.borderLeftColor = 'rgb(' + z.rgb + ')';
      var h = document.createElement('h3');
      h.textContent = z.name;
      card.appendChild(h);
      var ul = document.createElement('ul');
      ((TEXT[z.id] || { tips: ['Placeholder text.'] }).tips).forEach(function (tip) {
        var li = document.createElement('li');
        li.textContent = tip;
        ul.appendChild(li);
      });
      card.appendChild(ul);
      list.appendChild(card);
    });
  }

  toggle.addEventListener('click', function () { setOpen(panel.classList.contains('collapsed')); });

  document.addEventListener('psychro:zones', function (e) {
    render(e.detail.zones, e.detail.t, e.detail.w);
  });

  // A click inside the chart (not the grey area or axes) in Givoni mode opens the sidebar.
  document.addEventListener('psychro:chartclick', function () {
    if (model.value === 'givoni') setOpen(true);
  });

  model.addEventListener('change', function () {
    sub.textContent = '';
    if (model.value !== 'givoni') message('Choose “Givoni bioclimatic chart” under Comfort overlay, then click the chart to see strategies for that point.');
    else if (!list.querySelector('.strategy')) message('Click the chart to see strategies for that point.');
  });

  setOpen(false);
  message(model.value === 'givoni' ? 'Click the chart to see strategies for that point.'
    : 'Choose “Givoni bioclimatic chart” under Comfort overlay, then click the chart to see strategies for that point.');
})();
