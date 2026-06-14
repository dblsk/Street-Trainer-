// ============================================================================
// FIRST DUE — Box Study & Active Recall App
// app-map.js — Leaflet map setup, layer rendering, drawing tool, box focus
// ============================================================================

(function () {
  'use strict';

  const FD = window.FirstDue;
  const Store = FD.Store;
  const Toast = FD.Toast;

  let map = null;
  let tileLayer = null;

  // Layer groups
  let boxesLayerGroup = null;     // polygons for response boxes
  let streetsLayerGroup = null;   // polylines for streets
  let labelsLayerGroup = null;    // street label markers
  let drawLayerGroup = null;      // in-progress drawing vertices/lines
  let quizMarkerLayerGroup = null; // pins / highlights used by quiz engine
  let dimOverlay = null;          // semi-opaque rectangle(s) used to "dim" everything outside the active box

  // Maps from feature.id -> Leaflet layer, for quick lookup (click handling, styling updates)
  const boxLayerById = {};
  const streetLayerById = {};
  const labelMarkerById = {};

  const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>';
  const TILE_SUBDOMAINS = ['a', 'b', 'c', 'd'];

  // Overpass API: free OpenStreetMap road-data query service, used to
  // auto-populate a box's street list from its drawn polygon.
  const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
  const OVERPASS_TIMEOUT_MS = 25000;

  // highway tag values we treat as "streets" for quiz purposes — excludes
  // footways, cycleways, service alleys, etc. which would clutter the roster.
  const OSM_HIGHWAY_STREET_TYPES = [
    'motorway', 'trunk', 'primary', 'secondary', 'tertiary',
    'unclassified', 'residential', 'living_street',
    'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link',
  ];

  /**
   * Guard used at the top of every map-dependent public function.
   * Returns true if the map is usable, false (after surfacing the error
   * state + an optional toast) if the map failed to initialize — e.g.
   * Leaflet's library failed to load, or L.map() threw.
   */
  function requireMap(actionLabel) {
    if (map) return true;
    Store.setMapError(true);
    if (actionLabel) {
      Toast.show('Map unavailable — can\'t ' + actionLabel + ' until the map loads.', 'warn');
    }
    return false;
  }

  // ---------------------------------------------------------------------
  // INITIALIZATION
  // ---------------------------------------------------------------------

  function initMap() {
    const settings = Store.state.settings;

    if (typeof L === 'undefined') {
      console.error('[FirstDue] Leaflet library (L) is not available — check network/CDN access.');
      Store.setMapError(true);
      return null;
    }

    try {
      map = L.map('map', {
        center: [settings.homeLat, settings.homeLng],
        zoom: settings.homeZoom,
        zoomControl: true,
        attributionControl: true,
        worldCopyJump: true,
      });
    } catch (err) {
      console.error('[FirstDue] Leaflet map initialization failed:', err);
      map = null;
      Store.setMapError(true);
      return null;
    }

    try {
      boxesLayerGroup = L.layerGroup().addTo(map);
      streetsLayerGroup = L.layerGroup().addTo(map);
      labelsLayerGroup = L.layerGroup().addTo(map);
      drawLayerGroup = L.layerGroup().addTo(map);
      quizMarkerLayerGroup = L.layerGroup().addTo(map);

      loadTileLayer();

      // Map click handler — routes to drawing tool or quiz "locate" handler
      map.on('click', onMapClick);

      map.on('zoomend moveend', function () {
        refreshLabelVisibilityByZoom();
      });

      renderAllBoxes();
      renderAllStreets();
      renderLabels();

      Store.setMapReady(true);
      return map;
    } catch (err) {
      console.error('[FirstDue] Map layer setup failed:', err);
      Store.setMapError(true);
      return null;
    }
  }

  /**
   * Load the OSM tile layer with error handling for render failures
   * (e.g., offline, blocked tiles). If tiles fail to load entirely,
   * surface the map-error banner so the rest of the app remains usable.
   */
  function loadTileLayer() {
    if (tileLayer) {
      map.removeLayer(tileLayer);
      tileLayer = null;
    }

    let tileErrorCount = 0;
    let tileLoadedCount = 0;
    let errorBannerShown = false;

    tileLayer = L.tileLayer(TILE_URL, {
      attribution: TILE_ATTRIBUTION,
      maxZoom: 20,
      subdomains: TILE_SUBDOMAINS,
      detectRetina: true, // serves @2x tiles on high-DPI (retina) screens via the {r} placeholder
      crossOrigin: true,
    });

    tileLayer.on('tileerror', function () {
      tileErrorCount++;
      // If a large proportion of tiles fail very early, assume connectivity issue.
      if (tileErrorCount >= 6 && tileLoadedCount === 0 && !errorBannerShown) {
        errorBannerShown = true;
        Store.setMapError(true);
      }
    });

    tileLayer.on('tileload', function () {
      tileLoadedCount++;
      if (Store.state.mapError) {
        Store.setMapError(false);
      }
    });

    tileLayer.addTo(map);
  }

  function retryMapLoad() {
    Store.setMapError(false);
    if (!map) {
      initMap();
      return;
    }
    loadTileLayer();
    map.invalidateSize();
    Toast.show('Retrying map tile load…', 'info');
  }

  function invalidateSize() {
    if (map) {
      setTimeout(function () { map.invalidateSize(); }, 50);
    }
  }

  // ---------------------------------------------------------------------
  // STYLING HELPERS
  // ---------------------------------------------------------------------

  function masteryForBox(boxNumber) {
    const stats = Store.getBoxStats(boxNumber);
    const ss = stats.streetStats || {};
    let seen = 0, correct = 0;
    Object.keys(ss).forEach(function (sid) {
      seen += ss[sid].seen;
      correct += ss[sid].correct;
    });
    const bi = stats.boxIdentifierStats || { seen: 0, correct: 0 };
    seen += bi.seen;
    correct += bi.correct;

    if (seen === 0) return { ratio: null, level: 'unstudied' };
    const ratio = correct / seen;
    const T = FD.MASTERY_THRESHOLDS;
    let level = 'failing';
    if (ratio >= T.MASTERED) level = 'mastered';
    else if (ratio >= T.REVIEW) level = 'review';
    return { ratio: ratio, level: level };
  }

  function colorForMasteryLevel(level) {
    switch (level) {
      case 'mastered': return { stroke: '#5dffa3', fill: '#5dffa3', fillOpacity: 0.10 };
      case 'review': return { stroke: '#ffb454', fill: '#ffb454', fillOpacity: 0.10 };
      case 'failing': return { stroke: '#ff5d5d', fill: '#ff5d5d', fillOpacity: 0.10 };
      default: return { stroke: '#5de4ff', fill: '#5de4ff', fillOpacity: 0.05 }; // unstudied
    }
  }

  function boxBaseStyle(feature) {
    const boxNumber = feature.properties && feature.properties.boxNumber;
    const mastery = masteryForBox(boxNumber);
    const c = colorForMasteryLevel(mastery.level);
    return {
      color: c.stroke,
      weight: 2,
      opacity: 0.85,
      fillColor: c.fill,
      fillOpacity: c.fillOpacity,
      dashArray: null,
    };
  }

  function boxHoverStyle() {
    return { weight: 3, opacity: 1, fillOpacity: 0.18 };
  }

  function streetBaseStyle() {
    return { color: '#5de4ff', weight: 3, opacity: 0.55 };
  }

  // ---------------------------------------------------------------------
  // RENDERING — BOXES
  // ---------------------------------------------------------------------

  function renderAllBoxes() {
    if (!boxesLayerGroup) return;
    boxesLayerGroup.clearLayers();
    Object.keys(boxLayerById).forEach(function (k) { delete boxLayerById[k]; });

    const fc = Store.state.boxes;
    if (!fc || !Array.isArray(fc.features)) return;

    fc.features.forEach(function (feature) {
      try {
        addBoxLayer(feature);
      } catch (err) {
        console.error('[FirstDue] Failed to render box feature:', feature, err);
      }
    });
  }

  function addBoxLayer(feature) {
    if (!feature.geometry || (feature.geometry.type !== 'Polygon' && feature.geometry.type !== 'MultiPolygon')) {
      console.warn('[FirstDue] Skipping non-polygon box feature:', feature);
      return null;
    }

    const layer = L.geoJSON(feature, { style: boxBaseStyle(feature) }).getLayers()[0];
    if (!layer) return null;

    const boxNumber = feature.properties && feature.properties.boxNumber;

    layer.on('mouseover', function () { layer.setStyle(boxHoverStyle()); });
    layer.on('mouseout', function () { layer.setStyle(boxBaseStyle(feature)); });

    layer.on('click', function (e) {
      // Avoid hijacking clicks while drawing or during a "locate-street" quiz tap
      if (Store.state.drawingActive) return;
      if (Store.state.quiz.phase === 'QUIZ_ONGOING' && Store.state.quiz.mode === 'box-identifier') {
        return; // handled by map click for pin placement check, not by box click
      }
      L.DomEvent.stopPropagation(e);
      focusBox(boxNumber);
      Store.setActiveTab('study');
    });

    // Tooltip with box number on hover (desktop convenience)
    layer.bindTooltip('Box ' + (boxNumber || '—'), {
      sticky: true,
      className: 'font-mono text-xs',
      direction: 'top',
    });

    layer.addTo(boxesLayerGroup);
    boxLayerById[feature.id] = layer;
    return layer;
  }

  function refreshBoxStyles() {
    const fc = Store.state.boxes;
    if (!fc || !Array.isArray(fc.features)) return;
    fc.features.forEach(function (feature) {
      const layer = boxLayerById[feature.id];
      if (layer) layer.setStyle(boxBaseStyle(feature));
    });
  }

  // ---------------------------------------------------------------------
  // RENDERING — STREETS
  // ---------------------------------------------------------------------

  function renderAllStreets() {
    if (!streetsLayerGroup) return;
    streetsLayerGroup.clearLayers();
    Object.keys(streetLayerById).forEach(function (k) { delete streetLayerById[k]; });

    const fc = Store.state.streets;
    if (!fc || !Array.isArray(fc.features)) return;

    fc.features.forEach(function (feature) {
      try {
        addStreetLayer(feature);
      } catch (err) {
        console.error('[FirstDue] Failed to render street feature:', feature, err);
      }
    });
  }

  function addStreetLayer(feature) {
    if (!feature.geometry || feature.geometry.type !== 'LineString') {
      console.warn('[FirstDue] Skipping non-LineString street feature:', feature);
      return null;
    }

    const layer = L.geoJSON(feature, { style: streetBaseStyle() }).getLayers()[0];
    if (!layer) return null;

    layer.bindTooltip(feature.properties && feature.properties.name ? feature.properties.name : 'Unnamed street', {
      sticky: true,
      className: 'font-mono text-xs',
    });

    layer.addTo(streetsLayerGroup);
    streetLayerById[feature.id] = layer;
    return layer;
  }

  // ---------------------------------------------------------------------
  // RENDERING — STREET LABELS (Review Layer toggle)
  // ---------------------------------------------------------------------

  function renderLabels() {
    if (!labelsLayerGroup) return;
    labelsLayerGroup.clearLayers();
    Object.keys(labelMarkerById).forEach(function (k) { delete labelMarkerById[k]; });

    if (!Store.state.labelsVisible) return;

    const fc = Store.state.streets;
    if (!fc || !Array.isArray(fc.features)) return;

    fc.features.forEach(function (feature) {
      if (!feature.geometry || feature.geometry.type !== 'LineString') return;
      const coords = feature.geometry.coordinates;
      if (!coords || coords.length === 0) return;
      const mid = FD.lineMidpoint(coords); // [lng, lat]
      const name = (feature.properties && feature.properties.name) || 'Unnamed';

      const icon = L.divIcon({
        className: '',
        html: '<div class="street-label">' + FD.escapeHtml(name) + '</div>',
        iconSize: null,
      });

      const marker = L.marker([mid[1], mid[0]], { icon: icon, interactive: false, keyboard: false });
      marker.addTo(labelsLayerGroup);
      labelMarkerById[feature.id] = marker;
    });

    refreshLabelVisibilityByZoom();
  }

  /**
   * Hide labels at very low zoom levels to avoid clutter; show at study-level zoom.
   * This is purely cosmetic and independent of the labelsVisible toggle (which
   * is the master on/off switch).
   */
  function refreshLabelVisibilityByZoom() {
    if (!map || !Store.state.labelsVisible) return;
    const zoom = map.getZoom();
    const el = map.getContainer();
    Object.keys(labelMarkerById).forEach(function (id) {
      const marker = labelMarkerById[id];
      const markerEl = marker.getElement();
      if (!markerEl) return;
      markerEl.style.display = zoom >= 14 ? '' : 'none';
    });
  }

  function setLabelsVisible(visible) {
    Store.setLabelsVisible(visible);
    renderLabels();
  }

  // ---------------------------------------------------------------------
  // BOX FOCUS / FILTER MODE (Module 2)
  // ---------------------------------------------------------------------

  function focusBox(boxNumber) {
    if (!map) return;
    const feature = findBoxByNumber(boxNumber);
    if (!feature) {
      Toast.show('Box ' + boxNumber + ' not found.', 'error');
      return;
    }

    const layer = boxLayerById[feature.id];
    if (!layer) {
      Toast.show('Could not focus Box ' + boxNumber + ' — geometry missing.', 'error');
      return;
    }

    Store.setActiveBoxNumber(boxNumber);

    try {
      const bounds = layer.getBounds();
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 18 });
    } catch (err) {
      console.error('[FirstDue] fitBounds failed for box ' + boxNumber + ':', err);
      Toast.show('Could not zoom to Box ' + boxNumber + '.', 'error');
    }

    applyDimOverlay(feature);
    highlightActiveBox(boxNumber);
  }

  function clearFocus() {
    Store.setActiveBoxNumber(null);
    removeDimOverlay();
    refreshBoxStyles();
  }

  function highlightActiveBox(boxNumber) {
    const fc = Store.state.boxes;
    fc.features.forEach(function (feature) {
      const layer = boxLayerById[feature.id];
      if (!layer) return;
      if (feature.properties && feature.properties.boxNumber === boxNumber) {
        layer.setStyle({ weight: 3, opacity: 1, fillOpacity: 0.16, dashArray: null });
        if (layer.bringToFront) layer.bringToFront();
      } else {
        layer.setStyle(Object.assign(boxBaseStyle(feature), { opacity: 0.25, fillOpacity: 0.02 }));
      }
    });
  }

  /**
   * Dim everything outside the active box using a world-covering polygon
   * with a hole cut out for the active box (an SVG-style mask via Leaflet's
   * polygon-with-hole support).
   */
  function applyDimOverlay(boxFeature) {
    removeDimOverlay();

    try {
      const outer = [
        [-90, -180], [-90, 180], [90, 180], [90, -180], [-90, -180]
      ]; // [lat,lng] world ring

      let holes = [];
      const geom = boxFeature.geometry;
      if (geom.type === 'Polygon') {
        holes = geom.coordinates.map(ringToLatLng);
      } else if (geom.type === 'MultiPolygon') {
        geom.coordinates.forEach(function (poly) {
          poly.forEach(function (ring) { holes.push(ringToLatLng(ring)); });
        });
      }

      dimOverlay = L.polygon([outer].concat(holes), {
        stroke: false,
        fillColor: '#0a0e14',
        fillOpacity: 0.55,
        interactive: false,
        className: 'dim-overlay',
      }).addTo(map);
      dimOverlay.bringToBack();
      // Keep tile layer below the dim overlay but the overlay below the boxes/streets
      if (tileLayer) tileLayer.bringToBack();
    } catch (err) {
      console.error('[FirstDue] Failed to apply dim overlay:', err);
      // Non-fatal — focus still works without dimming
    }
  }

  function removeDimOverlay() {
    if (dimOverlay && map) {
      map.removeLayer(dimOverlay);
      dimOverlay = null;
    } else {
      dimOverlay = null;
    }
  }

  function ringToLatLng(ring) {
    // GeoJSON ring is [lng,lat][]; Leaflet polygon expects [lat,lng][]
    return ring.map(function (pt) { return [pt[1], pt[0]]; });
  }

  function findBoxByNumber(boxNumber) {
    const fc = Store.state.boxes;
    return fc.features.find(function (f) { return f.properties && String(f.properties.boxNumber) === String(boxNumber); });
  }

  // ---------------------------------------------------------------------
  // DRAWING TOOL (Module 1 — polygon ingestion)
  // ---------------------------------------------------------------------

  let drawPolyline = null;
  let drawVertexMarkers = [];

  function startDrawing() {
    if (!requireMap('start drawing')) return;
    if (Store.state.drawingActive) return;
    Store.setDrawingActive(true);
    drawVertexMarkers = [];
    drawLayerGroup.clearLayers();
    drawPolyline = null;
    map.getContainer().classList.add('drawing-active');
    Toast.show('Drawing mode: tap the map to place vertices.', 'info');
  }

  function cancelDrawing() {
    Store.setDrawingActive(false);
    if (drawLayerGroup) drawLayerGroup.clearLayers();
    drawVertexMarkers = [];
    drawPolyline = null;
    if (map) map.getContainer().classList.remove('drawing-active');
  }

  function finishDrawing() {
    const verts = Store.state.drawingVertices;
    if (verts.length < 3) {
      Toast.show('A box needs at least 3 points.', 'warn');
      return null;
    }
    return verts; // caller (UI module) collects box number + name and persists
  }

  function addDrawingVertex(latlng) {
    Store.pushDrawingVertex([latlng.lat, latlng.lng]);

    const marker = L.circleMarker(latlng, {
      radius: 5,
      color: '#5de4ff',
      fillColor: '#5de4ff',
      fillOpacity: 1,
      weight: 2,
    }).addTo(drawLayerGroup);
    drawVertexMarkers.push(marker);

    const verts = Store.state.drawingVertices.map(function (v) { return L.latLng(v[0], v[1]); });
    if (drawPolyline) drawLayerGroup.removeLayer(drawPolyline);

    if (verts.length >= 2) {
      // Show closing line preview once >= 3 points
      const lineCoords = verts.length >= 3 ? verts.concat([verts[0]]) : verts;
      drawPolyline = L.polyline(lineCoords, {
        color: '#5de4ff',
        weight: 2,
        dashArray: '4 4',
        opacity: 0.8,
      }).addTo(drawLayerGroup);
    }
  }

  function buildPolygonFeatureFromVertices(verts, properties) {
    // verts: array of [lat,lng] -> GeoJSON ring is [lng,lat], must be closed
    const ring = verts.map(function (v) { return [v[1], v[0]]; });
    ring.push(ring[0]); // close ring
    return {
      type: 'Feature',
      id: FD.genId('box'),
      properties: Object.assign({ layerType: 'box' }, properties),
      geometry: {
        type: 'Polygon',
        coordinates: [ring],
      },
    };
  }

  // ---------------------------------------------------------------------
  // STREET DRAWING (used by Street Database Builder for new segments)
  // ---------------------------------------------------------------------

  let streetDrawActive = false;
  let streetDrawVertices = [];
  let streetDrawPreview = null;

  function startStreetDrawing() {
    if (!requireMap('start street drawing')) return;
    streetDrawActive = true;
    streetDrawVertices = [];
    drawLayerGroup.clearLayers();
    map.getContainer().classList.add('drawing-active');
    Toast.show('Street drawing: tap to place points along the street, then Finish.', 'info');
  }

  function cancelStreetDrawing() {
    streetDrawActive = false;
    streetDrawVertices = [];
    if (drawLayerGroup) drawLayerGroup.clearLayers();
    streetDrawPreview = null;
    if (map) map.getContainer().classList.remove('drawing-active');
  }

  function finishStreetDrawing(name) {
    if (streetDrawVertices.length < 2) {
      Toast.show('A street needs at least 2 points.', 'warn');
      return null;
    }
    const coords = streetDrawVertices.map(function (v) { return [v.lng, v.lat]; });
    const feature = {
      type: 'Feature',
      id: FD.genId('street'),
      properties: { layerType: 'street', name: name, boxNumber: null },
      geometry: { type: 'LineString', coordinates: coords },
    };
    cancelStreetDrawing();
    return feature;
  }

  function addStreetDrawVertex(latlng) {
    streetDrawVertices.push(latlng);
    L.circleMarker(latlng, {
      radius: 4, color: '#ffb454', fillColor: '#ffb454', fillOpacity: 1, weight: 2,
    }).addTo(drawLayerGroup);

    if (streetDrawPreview) drawLayerGroup.removeLayer(streetDrawPreview);
    if (streetDrawVertices.length >= 2) {
      streetDrawPreview = L.polyline(streetDrawVertices, { color: '#ffb454', weight: 2, dashArray: '4 4' }).addTo(drawLayerGroup);
    }
  }

  function getStreetDrawVertexCount() {
    return streetDrawVertices.length;
  }

  function isStreetDrawingActive() {
    return streetDrawActive;
  }

  // ---------------------------------------------------------------------
  // OVERPASS AUTO-POPULATE (street auto-discovery from a drawn box)
  // ---------------------------------------------------------------------

  /**
   * Build an Overpass QL query that returns every named highway way whose
   * geometry intersects the given polygon. `verts` is an array of [lat,lng]
   * pairs (the same format Store.state.drawingVertices uses).
   *
   * Overpass's `poly:` filter expects a space-separated "lat lon lat lon..."
   * string and does NOT need the ring closed (it closes it implicitly), but
   * closing it is harmless and matches GeoJSON convention.
   */
  function buildOverpassQuery(verts) {
    const polyStr = verts.map(function (v) {
      return round6(v[0]) + ' ' + round6(v[1]);
    }).join(' ');

    const highwayFilter = '["highway"~"^(' + OSM_HIGHWAY_STREET_TYPES.join('|') + ')$"]';

    return '[out:json][timeout:25];' +
      'way' + highwayFilter + '["name"](poly:"' + polyStr + '");' +
      'out geom;';
  }

  function round6(n) {
    return Math.round(n * 1e6) / 1e6;
  }

  /**
   * Query Overpass for named streets within the polygon defined by `verts`
   * (array of [lat,lng]) and return an array of GeoJSON LineString Feature
   * objects (street features, NOT yet persisted) tagged with `boxNumber`.
   *
   * Adjacent OSM way-segments sharing the same name are merged into a single
   * LineString per contiguous chain, so one named street produces one quiz
   * target per geometrically-distinct branch rather than dozens of tiny
   * fragments.
   *
   * Returns a Promise resolving to { features, rawWayCount, error }.
   * On network/parse failure, `error` is a human-readable string and
   * `features` is an empty array — callers should save the box regardless
   * and let the user add streets manually (per app convention).
   */
  async function fetchStreetsForPolygon(verts, boxNumber) {
    if (!verts || verts.length < 3) {
      return { features: [], rawWayCount: 0, error: 'Polygon has too few points.' };
    }

    const query = buildOverpassQuery(verts);
    const requestUrl = OVERPASS_ENDPOINT + '?data=' + encodeURIComponent(query);
    const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(function () { controller.abort(); }, OVERPASS_TIMEOUT_MS) : null;

    let response;
    try {
      response = await fetch(requestUrl, {
        method: 'GET',
        signal: controller ? controller.signal : undefined,
      });
    } catch (err) {
      if (timeoutId) clearTimeout(timeoutId);
      const msg = (err && err.name === 'AbortError')
        ? 'Street lookup timed out. You can add streets manually below.'
        : 'Street lookup failed (network error). You can add streets manually below.';
      console.error('[FirstDue] Overpass fetch failed:', err);
      return { features: [], rawWayCount: 0, error: msg };
    }
    if (timeoutId) clearTimeout(timeoutId);

    if (!response.ok) {
      console.error('[FirstDue] Overpass returned HTTP ' + response.status);
      const statusMsg = response.status === 429
        ? 'Street lookup is rate-limited right now (too many requests). Try again in a minute, or add streets manually below.'
        : 'Street lookup failed (server returned ' + response.status + '). You can add streets manually below.';
      return { features: [], rawWayCount: 0, error: statusMsg };
    }

    let data;
    try {
      data = await response.json();
    } catch (err) {
      console.error('[FirstDue] Overpass response was not valid JSON:', err);
      return { features: [], rawWayCount: 0, error: 'Street lookup returned an unreadable response. You can add streets manually below.' };
    }

    const elements = (data && Array.isArray(data.elements)) ? data.elements : [];
    const ways = elements.filter(function (el) {
      return el.type === 'way' &&
        el.geometry && Array.isArray(el.geometry) && el.geometry.length >= 2 &&
        el.tags && typeof el.tags.name === 'string' && el.tags.name.trim().length > 0 &&
        OSM_HIGHWAY_STREET_TYPES.indexOf(el.tags.highway) !== -1;
    });

    const merged = mergeAdjacentNamedWays(ways);

    const features = merged.map(function (way) {
      const coords = way.geometry.map(function (pt) { return [pt.lon, pt.lat]; }); // GeoJSON: [lng, lat]
      return {
        type: 'Feature',
        id: FD.genId('street'),
        properties: {
          layerType: 'street',
          name: way.tags.name.trim(),
          boxNumber: boxNumber,
          source: 'osm',
          osmIds: way.osmIds,
        },
        geometry: { type: 'LineString', coordinates: coords },
      };
    });

    return { features: features, rawWayCount: ways.length, error: null };
  }

  /**
   * Merge consecutive OSM ways that share the same `name` AND whose
   * endpoints connect (the last point of one ≈ the first point of the
   * next, within a small tolerance), into a single longer way. This
   * collapses the common OSM pattern of one street being split into many
   * short segments at every intersection, without merging geometrically
   * separate branches that happen to share a name (e.g. a street that
   * splits around a median, or two disconnected stretches).
   *
   * Input/output elements have the shape: { tags: {name}, geometry: [{lat,lon},...], osmIds: [id,...] }
   */
  function mergeAdjacentNamedWays(ways) {
    const ENDPOINT_TOLERANCE = 1e-5; // ~1m at the equator — OSM shared nodes are exact, but allow tiny float drift

    // Normalize input into a working list with osmIds arrays
    let chains = ways.map(function (w) {
      return {
        tags: { name: w.tags.name },
        geometry: w.geometry.slice(),
        osmIds: [w.id],
      };
    });

    function pointsClose(a, b) {
      return Math.abs(a.lat - b.lat) < ENDPOINT_TOLERANCE && Math.abs(a.lon - b.lon) < ENDPOINT_TOLERANCE;
    }

    let mergedAny = true;
    let iterations = 0;
    // Repeat merge passes until stable (a chain might connect to multiple
    // others in sequence). Cap iterations defensively to avoid pathological
    // infinite loops on malformed data.
    while (mergedAny && iterations < 50) {
      mergedAny = false;
      iterations++;

      for (let i = 0; i < chains.length; i++) {
        if (!chains[i]) continue;
        for (let j = i + 1; j < chains.length; j++) {
          if (!chains[j]) continue;
          const a = chains[i];
          const b = chains[j];
          if (a.tags.name !== b.tags.name) continue;

          const aStart = a.geometry[0];
          const aEnd = a.geometry[a.geometry.length - 1];
          const bStart = b.geometry[0];
          const bEnd = b.geometry[b.geometry.length - 1];

          let combinedGeometry = null;

          if (pointsClose(aEnd, bStart)) {
            combinedGeometry = a.geometry.concat(b.geometry.slice(1));
          } else if (pointsClose(aEnd, bEnd)) {
            combinedGeometry = a.geometry.concat(b.geometry.slice(0, -1).reverse());
          } else if (pointsClose(aStart, bEnd)) {
            combinedGeometry = b.geometry.concat(a.geometry.slice(1));
          } else if (pointsClose(aStart, bStart)) {
            combinedGeometry = b.geometry.slice().reverse().concat(a.geometry.slice(1));
          }

          if (combinedGeometry) {
            chains[i] = {
              tags: a.tags,
              geometry: combinedGeometry,
              osmIds: a.osmIds.concat(b.osmIds),
            };
            chains[j] = null;
            mergedAny = true;
            break; // restart inner loop scan for chain i against remaining chains
          }
        }
      }

      chains = chains.filter(function (c) { return c !== null; });
    }

    return chains;
  }

  // ---------------------------------------------------------------------
  // MAP CLICK ROUTER
  // ---------------------------------------------------------------------

  function onMapClick(e) {
    if (Store.state.drawingActive) {
      addDrawingVertex(e.latlng);
      window.FirstDue.UI && window.FirstDue.UI.onDrawVertexAdded();
      return;
    }

    if (streetDrawActive) {
      addStreetDrawVertex(e.latlng);
      window.FirstDue.UI && window.FirstDue.UI.onStreetDrawVertexAdded();
      return;
    }

    // Quiz: "locate-street" tap handling and "box-identifier" pin placement are
    // delegated to the quiz engine if active.
    if (Store.state.quiz.phase === 'QUIZ_ONGOING') {
      if (Store.state.quiz.mode === 'locate-street') {
        window.FirstDue.Quiz && window.FirstDue.Quiz.onMapTapLocate(e.latlng);
        return;
      }
      if (Store.state.quiz.mode === 'box-identifier') {
        window.FirstDue.Quiz && window.FirstDue.Quiz.onMapTapBoxIdentifier(e.latlng);
        return;
      }
    }
  }

  // ---------------------------------------------------------------------
  // QUIZ HELPERS (used by app-quiz.js — kept here for direct map access)
  // ---------------------------------------------------------------------

  function highlightStreetForQuiz(streetId, colorClass) {
    clearQuizHighlights();
    const layer = streetLayerById[streetId];
    if (!layer) return null;
    const color = colorClass === 'red' ? '#ff5d5d' : '#5dffa3';
    layer.setStyle({ color: color, weight: 5, opacity: 1 });
    layer.getElement && layer.getElement() && layer.getElement().classList.add('pulse-target');
    if (layer.bringToFront) layer.bringToFront();
    return layer;
  }

  function clearQuizHighlights() {
    Object.keys(streetLayerById).forEach(function (id) {
      const layer = streetLayerById[id];
      layer.setStyle(streetBaseStyle());
      const el = layer.getElement && layer.getElement();
      if (el) el.classList.remove('pulse-target');
    });
    if (quizMarkerLayerGroup) quizMarkerLayerGroup.clearLayers();
  }

  function flashStreetResult(streetId, correct) {
    const layer = streetLayerById[streetId];
    if (!layer) return;
    layer.setStyle({ color: correct ? '#5dffa3' : '#ff5d5d', weight: 5, opacity: 1 });
  }

  function dropQuizPin(latlng) {
    if (!requireMap()) return null;
    quizMarkerLayerGroup.clearLayers();
    const marker = L.circleMarker(latlng, {
      radius: 8,
      color: '#ff5d5d',
      fillColor: '#ff5d5d',
      fillOpacity: 0.85,
      weight: 2,
      className: 'pulse-target',
    }).addTo(quizMarkerLayerGroup);
    return marker;
  }

  function panToBoxQuiet(boxNumber, padding) {
    if (!map) return;
    const feature = findBoxByNumber(boxNumber);
    if (!feature) return;
    const layer = boxLayerById[feature.id];
    if (!layer) return;
    try {
      map.fitBounds(layer.getBounds(), { padding: padding || [40, 40], maxZoom: 18, animate: true });
    } catch (err) {
      console.error('[FirstDue] panToBoxQuiet failed:', err);
    }
  }

  function recenterHome() {
    if (!requireMap('recenter the map')) return;
    const s = Store.state.settings;
    map.setView([s.homeLat, s.homeLng], s.homeZoom);
    clearFocus();
  }

  // ---------------------------------------------------------------------
  // SUBSCRIPTIONS
  // ---------------------------------------------------------------------

  function bindStoreSubscriptions() {
    Store.on('boxes:changed', function () {
      renderAllBoxes();
      if (Store.state.activeBoxNumber) {
        highlightActiveBox(Store.state.activeBoxNumber);
      }
    });

    Store.on('streets:changed', function () {
      renderAllStreets();
      renderLabels();
    });

    Store.on('stats:changed', function () {
      refreshBoxStyles();
      if (Store.state.activeBoxNumber) highlightActiveBox(Store.state.activeBoxNumber);
    });

    Store.on('ui:mapError', function (hasError) {
      const banner = document.getElementById('map-error-banner');
      if (!banner) return;
      banner.classList.toggle('hidden', !hasError);
    });
  }

  // ---------------------------------------------------------------------
  // EXPORTS
  // ---------------------------------------------------------------------
  window.FirstDue = window.FirstDue || {};
  window.FirstDue.Map = {
    initMap: initMap,
    getMap: function () { return map; },
    invalidateSize: invalidateSize,
    retryMapLoad: retryMapLoad,
    bindStoreSubscriptions: bindStoreSubscriptions,

    // boxes / streets
    renderAllBoxes: renderAllBoxes,
    renderAllStreets: renderAllStreets,
    renderLabels: renderLabels,
    setLabelsVisible: setLabelsVisible,
    refreshBoxStyles: refreshBoxStyles,
    findBoxByNumber: findBoxByNumber,

    // focus
    focusBox: focusBox,
    clearFocus: clearFocus,
    recenterHome: recenterHome,

    // drawing — boxes
    startDrawing: startDrawing,
    cancelDrawing: cancelDrawing,
    finishDrawing: finishDrawing,
    buildPolygonFeatureFromVertices: buildPolygonFeatureFromVertices,

    // drawing — streets
    startStreetDrawing: startStreetDrawing,
    cancelStreetDrawing: cancelStreetDrawing,
    finishStreetDrawing: finishStreetDrawing,
    getStreetDrawVertexCount: getStreetDrawVertexCount,
    isStreetDrawingActive: isStreetDrawingActive,

    // street auto-discovery (Overpass)
    fetchStreetsForPolygon: fetchStreetsForPolygon,

    // quiz helpers
    highlightStreetForQuiz: highlightStreetForQuiz,
    clearQuizHighlights: clearQuizHighlights,
    flashStreetResult: flashStreetResult,
    dropQuizPin: dropQuizPin,
    panToBoxQuiet: panToBoxQuiet,

    // internal accessors for tests
    _internal: {
      boxLayerById: boxLayerById,
      streetLayerById: streetLayerById,
      labelMarkerById: labelMarkerById,
      masteryForBox: masteryForBox,
      colorForMasteryLevel: colorForMasteryLevel,
      buildOverpassQuery: buildOverpassQuery,
      mergeAdjacentNamedWays: mergeAdjacentNamedWays,
    },
  };

})();
