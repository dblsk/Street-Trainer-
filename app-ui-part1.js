// ============================================================================
// FIRST DUE — Box Study & Active Recall App
// app-ui.js — Tab rendering, sidebar/mobile sheet wiring, modals
// (Part 1: Dashboard, Box Builder, shared helpers, modals)
// ============================================================================

(function () {
  'use strict';

  const FD = window.FirstDue;
  const Store = FD.Store;
  const Toast = FD.Toast;
  const esc = FD.escapeHtml;

  // ---------------------------------------------------------------------
  // ICON REFRESH HELPER
  // ---------------------------------------------------------------------
  function refreshIcons(root) {
    if (window.lucide) {
      window.lucide.createIcons(root ? { nodes: [root] } : undefined);
    }
  }

  // ---------------------------------------------------------------------
  // TAB RENDERING DISPATCH
  // ---------------------------------------------------------------------

  const TAB_TITLES = {
    dashboard: 'DASHBOARD',
    builder: 'BOX BUILDER',
    study: 'STUDY MODE',
    quiz: 'QUIZ',
  };

  function renderActiveTab() {
    const tab = Store.state.activeTab;
    const desktopRoot = document.getElementById('tab-content-desktop');
    const mobileRoot = document.getElementById('tab-content-mobile');
    const sheetTitle = document.getElementById('sheet-title');

    let html = '';
    switch (tab) {
      case 'dashboard': html = renderDashboardTab(); break;
      case 'builder': html = renderBuilderTab(); break;
      case 'study': html = window.FirstDue.UI.renderStudyTab(); break;
      case 'quiz': html = window.FirstDue.UI.renderQuizTab(); break;
      default: html = renderDashboardTab();
    }

    desktopRoot.innerHTML = html;
    mobileRoot.innerHTML = html;
    if (sheetTitle) sheetTitle.textContent = TAB_TITLES[tab] || 'FIRST DUE';

    refreshIcons(desktopRoot);
    refreshIcons(mobileRoot);

    bindDynamicHandlers(desktopRoot);
    bindDynamicHandlers(mobileRoot);

    syncTabIndicators();
  }

  /**
   * bindDynamicHandlers is implemented in app-ui-part2.js and attached to
   * window.FirstDue.UI after that file loads. This thin wrapper lets
   * functions defined in this file (part1) call it without a hard
   * compile-time dependency on load order.
   */
  function bindDynamicHandlers(root) {
    if (window.FirstDue.UI.bindDynamicHandlers) {
      window.FirstDue.UI.bindDynamicHandlers(root);
    }
  }

  function syncTabIndicators() {
    const tab = Store.state.activeTab;
    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      const isActive = btn.dataset.tab === tab;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    document.querySelectorAll('.tab-btn-m').forEach(function (btn) {
      const isActive = btn.dataset.tab === tab;
      btn.classList.toggle('active', isActive);
    });
  }

  // ---------------------------------------------------------------------
  // SHARED UI FRAGMENTS
  // ---------------------------------------------------------------------

  function sectionHeader(title, icon) {
    return '<div class="flex items-center gap-2 mb-2.5">' +
      '<i data-lucide="' + icon + '" class="w-3.5 h-3.5 text-alert-cyan"></i>' +
      '<h3 class="text-[11px] font-display font-700 uppercase tracking-[0.16em] text-ink-500">' + esc(title) + '</h3>' +
      '</div>';
  }

  function emptyState(message, icon) {
    return '<div class="flex flex-col items-center justify-center text-center py-8 px-4 border border-dashed border-base-600 rounded-md">' +
      '<i data-lucide="' + (icon || 'inbox') + '" class="w-6 h-6 text-ink-500 mb-2"></i>' +
      '<p class="text-xs text-ink-500 leading-relaxed max-w-[220px]">' + esc(message) + '</p>' +
      '</div>';
  }

  function masteryBadge(level, ratio) {
    const map = {
      mastered: { label: 'MASTERED', cls: 'text-alert-green border-alert-green/40 bg-alert-green/10' },
      review: { label: 'REVIEW NEEDED', cls: 'text-alert-amber border-alert-amber/40 bg-alert-amber/10' },
      failing: { label: 'FAILING', cls: 'text-alert-red border-alert-red/40 bg-alert-red/10' },
      unstudied: { label: 'UNSTUDIED', cls: 'text-ink-500 border-base-600 bg-base-800' },
    };
    const m = map[level] || map.unstudied;
    const pctStr = ratio !== null && ratio !== undefined ? Math.round(ratio * 100) + '%' : '—';
    return '<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-700 border ' + m.cls + '">' +
      m.label + (ratio !== null && ratio !== undefined ? ' · ' + pctStr : '') + '</span>';
  }

  // ---------------------------------------------------------------------
  // DASHBOARD TAB (Module 4: Performance Analytics + Heat Map)
  // ---------------------------------------------------------------------

  function renderDashboardTab() {
    const boxes = Store.state.boxes.features || [];
    const MapMod = window.FirstDue.Map;

    let body = '';

    if (boxes.length === 0) {
      body += emptyState('No Response Boxes defined yet. Head to Box Builder to draw your first box, or import a GeoJSON file from Settings.', 'map');
    } else {
      // Overall stats summary
      const summary = computeOverallSummary(boxes);
      body += '<div class="grid grid-cols-3 gap-2 mb-4">' +
        statTile('Mastered', summary.mastered, 'text-alert-green') +
        statTile('Review', summary.review, 'text-alert-amber') +
        statTile('Failing/New', summary.failing + summary.unstudied, 'text-alert-red') +
        '</div>';

      // Heat grid — the signature dashboard element
      body += sectionHeader('Box Heat Grid', 'grid-3x3');
      body += '<p class="text-[11px] text-ink-500 mb-2.5 leading-relaxed">Tap a box to jump to it on the map and open Study Mode.</p>';
      body += '<div class="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-5">';
      boxes
        .slice()
        .sort(function (a, b) { return String(a.properties.boxNumber).localeCompare(String(b.properties.boxNumber), undefined, { numeric: true }); })
        .forEach(function (f) {
          const boxNumber = f.properties.boxNumber;
          const mastery = MapMod._internal.masteryForBox(boxNumber);
          body += heatTile(boxNumber, mastery);
        });
      body += '</div>';

      // Per-box breakdown list
      body += sectionHeader('Box Details', 'list');
      body += '<div class="space-y-2 mb-4">';
      boxes
        .slice()
        .sort(function (a, b) { return String(a.properties.boxNumber).localeCompare(String(b.properties.boxNumber), undefined, { numeric: true }); })
        .forEach(function (f) {
          body += boxDetailRow(f);
        });
      body += '</div>';
    }

    return wrapTabPanel(body);
  }

  function statTile(label, value, colorCls) {
    return '<div class="bg-base-800 border border-base-700 rounded-md p-2.5 text-center">' +
      '<div class="font-display font-700 text-xl ' + colorCls + '">' + value + '</div>' +
      '<div class="text-[10px] font-mono uppercase tracking-wider text-ink-500 mt-0.5">' + esc(label) + '</div>' +
      '</div>';
  }

  function heatTile(boxNumber, mastery) {
    const colorMap = {
      mastered: 'bg-alert-green/15 border-alert-green/50 text-alert-green',
      review: 'bg-alert-amber/15 border-alert-amber/50 text-alert-amber',
      failing: 'bg-alert-red/15 border-alert-red/50 text-alert-red',
      unstudied: 'bg-base-800 border-base-600 text-ink-500',
    };
    const cls = colorMap[mastery.level] || colorMap.unstudied;
    const pct = mastery.ratio !== null ? Math.round(mastery.ratio * 100) + '%' : '—';
    return '<button data-action="focus-box" data-box="' + esc(boxNumber) + '" ' +
      'class="heat-tile rounded-md border ' + cls + ' flex flex-col items-center justify-center gap-0.5 hover:opacity-80 transition-opacity active:scale-95">' +
      '<span class="font-mono font-700 text-xs leading-tight">' + esc(boxNumber) + '</span>' +
      '<span class="font-mono text-[10px] opacity-80">' + pct + '</span>' +
      '</button>';
  }

  function boxDetailRow(feature) {
    const boxNumber = feature.properties.boxNumber;
    const MapMod = window.FirstDue.Map;
    const mastery = MapMod._internal.masteryForBox(boxNumber);
    const stats = Store.getBoxStats(boxNumber);

    // Hardest street: lowest correct ratio among streets with attempts
    let hardest = null, hardestRatio = Infinity;
    Object.keys(stats.streetStats || {}).forEach(function (sid) {
      const s = stats.streetStats[sid];
      if (s.seen === 0) return;
      const ratio = s.correct / s.seen;
      if (ratio < hardestRatio) {
        hardestRatio = ratio;
        const sf = Store.state.streets.features.find(function (f) { return f.id === sid; });
        hardest = sf ? sf.properties.name : null;
      }
    });

    const streetCount = window.FirstDue.Quiz.streetsForBox(boxNumber).length;

    return '<div class="bg-base-800 border border-base-700 rounded-md p-2.5">' +
      '<div class="flex items-center justify-between mb-1.5">' +
      '<button data-action="focus-box" data-box="' + esc(boxNumber) + '" class="font-mono font-700 text-sm text-ink-100 hover:text-alert-cyan transition-colors flex items-center gap-1.5">' +
      '<i data-lucide="map-pin" class="w-3.5 h-3.5"></i> Box ' + esc(boxNumber) +
      '</button>' +
      masteryBadge(mastery.level, mastery.ratio) +
      '</div>' +
      '<div class="flex items-center justify-between text-[11px] text-ink-500 font-mono">' +
      '<span>' + streetCount + ' street' + (streetCount === 1 ? '' : 's') + '</span>' +
      '<span class="truncate max-w-[140px]" title="' + esc(hardest || '') + '">' + (hardest ? 'Hardest: ' + esc(hardest) : 'No attempts yet') + '</span>' +
      '</div>' +
      '<div class="flex gap-1.5 mt-2">' +
      '<button data-action="focus-box" data-box="' + esc(boxNumber) + '" class="flex-1 text-[10px] font-display font-600 uppercase tracking-wide py-1.5 rounded border border-base-600 hover:border-alert-cyan/50 text-ink-300 transition-colors">View</button>' +
      '<button data-action="go-quiz" data-box="' + esc(boxNumber) + '" class="flex-1 text-[10px] font-display font-600 uppercase tracking-wide py-1.5 rounded border border-alert-cyan/40 hover:bg-alert-cyan/10 text-alert-cyan transition-colors">Quiz</button>' +
      '<button data-action="reset-box-stats" data-box="' + esc(boxNumber) + '" title="Reset stats for this box" class="w-8 text-[10px] py-1.5 rounded border border-base-600 hover:border-alert-red/50 text-ink-500 hover:text-alert-red transition-colors flex items-center justify-center">' +
      '<i data-lucide="rotate-ccw" class="w-3 h-3"></i></button>' +
      '</div>' +
      '</div>';
  }

  function computeOverallSummary(boxes) {
    const MapMod = window.FirstDue.Map;
    const out = { mastered: 0, review: 0, failing: 0, unstudied: 0 };
    boxes.forEach(function (f) {
      const m = MapMod._internal.masteryForBox(f.properties.boxNumber);
      out[m.level] = (out[m.level] || 0) + 1;
    });
    return out;
  }

  // ---------------------------------------------------------------------
  // BOX BUILDER TAB (Module 1: Ingestion Engine)
  // ---------------------------------------------------------------------

  function renderBuilderTab() {
    const boxes = Store.state.boxes.features || [];
    const drawing = Store.state.drawingActive;
    const streetDrawing = window.FirstDue._streetDrawActive || false;

    let body = '';

    // -- Draw New Box --
    body += sectionHeader('Define Response Box', 'shapes');
    if (drawing) {
      const vCount = Store.state.drawingVertices.length;
      body += '<div class="bg-alert-cyan/10 border border-alert-cyan/40 rounded-md p-3 mb-3">' +
        '<p class="text-xs text-ink-100 mb-2">Drawing in progress — <span class="font-mono text-alert-cyan">' + vCount + '</span> point(s) placed on the map.</p>' +
        '<div class="grid grid-cols-2 gap-2 mb-2">' +
        '<label class="block"><span class="text-[10px] text-ink-500 font-mono">Box Number</span>' +
        '<input id="new-box-number" type="text" placeholder="e.g. 2401" class="mt-1 w-full bg-base-800 border border-base-600 rounded px-2 py-1.5 font-mono text-xs focus:border-alert-cyan/60" /></label>' +
        '<label class="block"><span class="text-[10px] text-ink-500 font-mono">Label (optional)</span>' +
        '<input id="new-box-label" type="text" placeholder="e.g. North Sector" class="mt-1 w-full bg-base-800 border border-base-600 rounded px-2 py-1.5 font-mono text-xs focus:border-alert-cyan/60" /></label>' +
        '</div>' +
        '<p class="text-[10px] text-ink-500 leading-relaxed mb-2">On save, named streets inside this shape are automatically pulled from OpenStreetMap. Anything missing can be added below afterward.</p>' +
        '<div class="flex gap-2">' +
        '<button data-action="finish-draw-box" class="flex-1 text-xs font-display font-600 uppercase tracking-wide py-1.5 rounded bg-alert-green/15 border border-alert-green/40 text-alert-green hover:bg-alert-green/25 transition-colors">Save Box (' + vCount + ' pts)</button>' +
        '<button data-action="cancel-draw-box" class="flex-1 text-xs font-display font-600 uppercase tracking-wide py-1.5 rounded bg-alert-red/15 border border-alert-red/40 text-alert-red hover:bg-alert-red/25 transition-colors">Cancel</button>' +
        '</div>' +
        '</div>';
    } else {
      body += '<button data-action="start-draw-box" class="w-full mb-3 text-xs font-display font-600 uppercase tracking-wide py-2.5 rounded border border-alert-cyan/40 hover:bg-alert-cyan/10 text-alert-cyan transition-colors flex items-center justify-center gap-2">' +
        '<i data-lucide="pencil" class="w-3.5 h-3.5"></i> Draw New Box on Map</button>';
    }

    // -- Existing Boxes List --
    body += sectionHeader('Defined Boxes (' + boxes.length + ')', 'database');
    if (boxes.length === 0) {
      body += emptyState('Draw a box above, or import an existing GeoJSON file from Settings.', 'shapes');
    } else {
      body += '<div class="space-y-2 mb-5">';
      boxes
        .slice()
        .sort(function (a, b) { return String(a.properties.boxNumber).localeCompare(String(b.properties.boxNumber), undefined, { numeric: true }); })
        .forEach(function (f) {
          const streetCount = window.FirstDue.Quiz.streetsForBox(f.properties.boxNumber).length;
          body += '<div class="bg-base-800 border border-base-700 rounded-md p-2.5 flex items-center justify-between gap-2">' +
            '<div class="min-w-0">' +
            '<div class="font-mono font-700 text-sm">Box ' + esc(f.properties.boxNumber) + '</div>' +
            '<div class="text-[10px] text-ink-500 font-mono truncate">' + esc(f.properties.label || 'No label') + ' · ' + streetCount + ' street' + (streetCount === 1 ? '' : 's') + '</div>' +
            '</div>' +
            '<div class="flex items-center gap-1.5 shrink-0">' +
            '<button data-action="focus-box" data-box="' + esc(f.properties.boxNumber) + '" title="View on map" class="w-7 h-7 rounded border border-base-600 hover:border-alert-cyan/50 flex items-center justify-center text-ink-300 hover:text-alert-cyan"><i data-lucide="eye" class="w-3.5 h-3.5"></i></button>' +
            '<button data-action="delete-box" data-box-id="' + esc(f.id) + '" data-box="' + esc(f.properties.boxNumber) + '" title="Delete box" class="w-7 h-7 rounded border border-base-600 hover:border-alert-red/50 flex items-center justify-center text-ink-300 hover:text-alert-red"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>' +
            '</div>' +
            '</div>';
        });
      body += '</div>';
    }

    // -- Street Database Builder --
    body += sectionHeader('Street Database Builder', 'route');
    body += '<p class="text-[11px] text-ink-500 mb-2.5 leading-relaxed">Assign street names to boxes. Draw new street segments on the map, or assign names to existing imported streets below.</p>';

    if (streetDrawing) {
      body += '<div class="bg-alert-amber/10 border border-alert-amber/40 rounded-md p-3 mb-3">' +
        '<p class="text-xs text-ink-100 mb-2">Drawing street — tap map to add points, then name it.</p>' +
        '<div class="grid grid-cols-2 gap-2 mb-2">' +
        '<label class="block"><span class="text-[10px] text-ink-500 font-mono">Street Name</span>' +
        '<input id="new-street-name" type="text" placeholder="e.g. Iona Sound Dr" class="mt-1 w-full bg-base-800 border border-base-600 rounded px-2 py-1.5 font-mono text-xs focus:border-alert-amber/60" /></label>' +
        '<label class="block"><span class="text-[10px] text-ink-500 font-mono">Assign to Box</span>' +
        '<select id="new-street-box" class="mt-1 w-full bg-base-800 border border-base-600 rounded px-2 py-1.5 font-mono text-xs focus:border-alert-amber/60">' +
        boxOptionsHtml(boxes, null, true) +
        '</select></label>' +
        '</div>' +
        '<div class="flex gap-2">' +
        '<button data-action="finish-draw-street" class="flex-1 text-xs font-display font-600 uppercase tracking-wide py-1.5 rounded bg-alert-green/15 border border-alert-green/40 text-alert-green hover:bg-alert-green/25 transition-colors">Save Street</button>' +
        '<button data-action="cancel-draw-street" class="flex-1 text-xs font-display font-600 uppercase tracking-wide py-1.5 rounded bg-alert-red/15 border border-alert-red/40 text-alert-red hover:bg-alert-red/25 transition-colors">Cancel</button>' +
        '</div>' +
        '</div>';
    } else {
      body += '<button data-action="start-draw-street" class="w-full mb-3 text-xs font-display font-600 uppercase tracking-wide py-2.5 rounded border border-alert-amber/40 hover:bg-alert-amber/10 text-alert-amber transition-colors flex items-center justify-center gap-2">' +
        '<i data-lucide="route" class="w-3.5 h-3.5"></i> Draw New Street on Map</button>';
    }

    // List of streets (with inline edit for name + box assignment)
    const streets = Store.state.streets.features || [];
    body += '<div class="text-[10px] font-mono uppercase tracking-wider text-ink-500 mb-2">' + streets.length + ' street segment' + (streets.length === 1 ? '' : 's') + ' total</div>';
    if (streets.length === 0) {
      body += emptyState('No streets yet. Draw streets above or import a GeoJSON file containing LineString features.', 'route');
    } else {
      body += '<div class="space-y-1.5 max-h-[340px] overflow-y-auto pr-0.5">';
      streets
        .slice()
        .sort(function (a, b) {
          const an = (a.properties.name || '').toLowerCase();
          const bn = (b.properties.name || '').toLowerCase();
          return an.localeCompare(bn);
        })
        .forEach(function (f) {
          body += streetEditRow(f, boxes);
        });
      body += '</div>';
    }

    return wrapTabPanel(body);
  }

  function boxOptionsHtml(boxes, selectedBoxNumber, includeUnassigned) {
    let html = '';
    if (includeUnassigned) html += '<option value="">— Unassigned —</option>';
    boxes
      .slice()
      .sort(function (a, b) { return String(a.properties.boxNumber).localeCompare(String(b.properties.boxNumber), undefined, { numeric: true }); })
      .forEach(function (f) {
        const bn = f.properties.boxNumber;
        const sel = (selectedBoxNumber !== null && String(selectedBoxNumber) === String(bn)) ? ' selected' : '';
        html += '<option value="' + esc(bn) + '"' + sel + '>Box ' + esc(bn) + '</option>';
      });
    return html;
  }

  function streetEditRow(feature, boxes) {
    const isOsm = feature.properties && feature.properties.source === 'osm';
    const osmBadge = isOsm
      ? '<span title="Auto-discovered from OpenStreetMap" class="shrink-0 text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-alert-cyan/30 text-alert-cyan/80">OSM</span>'
      : '';
    return '<div class="bg-base-800 border border-base-700 rounded-md p-2 flex items-center gap-1.5">' +
      osmBadge +
      '<input data-action="edit-street-name" data-street-id="' + esc(feature.id) + '" type="text" value="' + esc(feature.properties.name || '') + '" placeholder="Street name" ' +
      'class="flex-1 min-w-0 bg-base-900 border border-base-600 rounded px-2 py-1 font-mono text-xs focus:border-alert-cyan/60" />' +
      '<select data-action="edit-street-box" data-street-id="' + esc(feature.id) + '" class="bg-base-900 border border-base-600 rounded px-1.5 py-1 font-mono text-xs focus:border-alert-cyan/60 w-24 shrink-0">' +
      boxOptionsHtml(boxes, feature.properties.boxNumber, true) +
      '</select>' +
      '<button data-action="delete-street" data-street-id="' + esc(feature.id) + '" title="Delete street" class="w-7 h-7 shrink-0 rounded border border-base-600 hover:border-alert-red/50 flex items-center justify-center text-ink-500 hover:text-alert-red"><i data-lucide="x" class="w-3.5 h-3.5"></i></button>' +
      '</div>';
  }

  // ---------------------------------------------------------------------
  // TAB PANEL WRAPPER
  // ---------------------------------------------------------------------

  function wrapTabPanel(innerHtml) {
    return '<div class="p-4 panel-enter">' + innerHtml + '</div>';
  }

  // ---------------------------------------------------------------------
  // SETTINGS MODAL
  // ---------------------------------------------------------------------

  function openSettingsModal() {
    const s = Store.state.settings;
    document.getElementById('setting-lat').value = s.homeLat;
    document.getElementById('setting-lng').value = s.homeLng;
    document.getElementById('setting-zoom').value = s.homeZoom;
    document.getElementById('setting-fuzzy').value = s.fuzzyTolerance;
    document.getElementById('fuzzy-val').textContent = s.fuzzyTolerance;
    window.FirstDue.UI.renderBasemapSelector();
    document.getElementById('settings-modal').classList.remove('hidden');
    refreshIcons(document.getElementById('settings-modal'));
  }

  function closeSettingsModal() {
    document.getElementById('settings-modal').classList.add('hidden');
  }

  function saveSettingsFromModal() {
    const lat = parseFloat(document.getElementById('setting-lat').value);
    const lng = parseFloat(document.getElementById('setting-lng').value);
    const zoom = parseInt(document.getElementById('setting-zoom').value, 10);
    const fuzzy = parseInt(document.getElementById('setting-fuzzy').value, 10);

    if (isNaN(lat) || lat < -90 || lat > 90) { Toast.show('Latitude must be between -90 and 90.', 'error'); return; }
    if (isNaN(lng) || lng < -180 || lng > 180) { Toast.show('Longitude must be between -180 and 180.', 'error'); return; }
    if (isNaN(zoom) || zoom < 1 || zoom > 19) { Toast.show('Zoom must be between 1 and 19.', 'error'); return; }

    Store.setSettings({
      homeLat: lat, homeLng: lng, homeZoom: zoom,
      fuzzyTolerance: FD.clamp(isNaN(fuzzy) ? 1 : fuzzy, 0, 3),
    });
    Toast.show('Settings saved.', 'success');
  }

  function useCurrentMapCenter() {
    const map = window.FirstDue.Map.getMap();
    if (!map) return;
    const c = map.getCenter();
    document.getElementById('setting-lat').value = c.lat.toFixed(6);
    document.getElementById('setting-lng').value = c.lng.toFixed(6);
    document.getElementById('setting-zoom').value = map.getZoom();
    Toast.show('Coordinates updated from current map view — click outside to apply, or they save automatically.', 'info');
    saveSettingsFromModal();
  }

  // ---------------------------------------------------------------------
  // IMPORT / EXPORT
  // ---------------------------------------------------------------------

  function exportGeoJSONFile() {
    const data = Store.exportGeoJSON();
    downloadJSON(data, 'first-due-boxes-' + dateStamp() + '.geojson');
    Toast.show('Boxes & streets exported.', 'success');
  }

  function exportStatsFile() {
    const data = Store.exportStats();
    downloadJSON(data, 'first-due-stats-' + dateStamp() + '.json');
    Toast.show('Performance stats exported.', 'success');
  }

  function downloadJSON(obj, filename) {
    try {
      const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    } catch (err) {
      console.error('[FirstDue] Export failed:', err);
      Toast.show('Export failed: ' + err.message, 'error');
    }
  }

  function dateStamp() {
    const d = new Date();
    const pad = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function handleImportFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const data = JSON.parse(e.target.result);
        let toImport = data;
        if (data.type === 'FirstDueExport' && data.boxes && data.streets) {
          toImport = data;
        } else if (data.type === 'FirstDueStatsExport') {
          if (data.stats) Store.setStats(data.stats);
          if (data.settings) Store.setSettings(data.settings);
          Toast.show('Stats imported.', 'success');
          return;
        }
        Store.importGeoJSON(toImport);
        Toast.show('Import successful — ' +
          (Store.state.boxes.features.length) + ' box(es), ' +
          (Store.state.streets.features.length) + ' street(s).', 'success');
        renderActiveTab();
      } catch (err) {
        console.error('[FirstDue] Import failed:', err);
        Toast.show('Import failed: file is not valid JSON/GeoJSON.', 'error');
      }
    };
    reader.onerror = function () {
      Toast.show('Could not read the selected file.', 'error');
    };
    reader.readAsText(file);
  }

  function confirmResetAllData() {
    const ok = window.confirm('This will permanently delete all boxes, streets, and performance stats stored in this browser. This cannot be undone. Continue?');
    if (!ok) return;
    Store.resetAllData();
    window.FirstDue.Map.clearFocus();
    window.FirstDue.Map.recenterHome();
    renderActiveTab();
    Toast.show('All local data has been reset.', 'success');
  }

  // ---------------------------------------------------------------------
  // EXPORTS (this file is part 1 — more attached by app-ui-part2.js)
  // ---------------------------------------------------------------------
  window.FirstDue = window.FirstDue || {};
  window.FirstDue.UI = window.FirstDue.UI || {};
  Object.assign(window.FirstDue.UI, {
    refreshIcons: refreshIcons,
    renderActiveTab: renderActiveTab,
    syncTabIndicators: syncTabIndicators,
    sectionHeader: sectionHeader,
    emptyState: emptyState,
    masteryBadge: masteryBadge,
    wrapTabPanel: wrapTabPanel,
    boxOptionsHtml: boxOptionsHtml,

    // settings modal
    openSettingsModal: openSettingsModal,
    closeSettingsModal: closeSettingsModal,
    saveSettingsFromModal: saveSettingsFromModal,
    useCurrentMapCenter: useCurrentMapCenter,

    // import/export
    exportGeoJSONFile: exportGeoJSONFile,
    exportStatsFile: exportStatsFile,
    handleImportFile: handleImportFile,
    confirmResetAllData: confirmResetAllData,
    downloadJSON: downloadJSON,
  });

})();
