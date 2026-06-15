// ============================================================================
// BOX RECALL — Box Study & Active Recall App
// app-core.js — State management, persistence, configuration
// ============================================================================

(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // CONSTANTS
  // ---------------------------------------------------------------------
  const LS_KEYS = {
    BOXES: 'fd_boxes_v1',          // GeoJSON FeatureCollection of response boxes
    STREETS: 'fd_streets_v1',      // GeoJSON FeatureCollection of street segments
    STATS: 'fd_stats_v1',          // Per-box / per-street performance stats
    SETTINGS: 'fd_settings_v1',    // App configuration (home coords, zoom, fuzzy tolerance)
  };

  const DEFAULT_SETTINGS = {
    homeLat: 28.0395,     // Default: somewhere generic (Tampa Bay area, FL) — user-configurable
    homeLng: -82.4544,
    homeZoom: 13,
    fuzzyTolerance: 1,
    labelsVisible: true,
    basemap: 'satellite', // 'satellite' | 'light' | 'dark'
    theme: 'auto',        // 'auto' (follow OS) | 'light' | 'dark'
  };

  const MASTERY_THRESHOLDS = {
    MASTERED: 0.8,   // >= 80% -> green
    REVIEW: 0.5,     // >= 50% and < 80% -> yellow
    // < 50% (or unstudied) -> red
  };

  const STREET_SUFFIX_MAP = {
    'street': 'st', 'st': 'st',
    'avenue': 'ave', 'ave': 'ave', 'av': 'ave',
    'drive': 'dr', 'dr': 'dr',
    'road': 'rd', 'rd': 'rd',
    'boulevard': 'blvd', 'blvd': 'blvd',
    'lane': 'ln', 'ln': 'ln',
    'court': 'ct', 'ct': 'ct',
    'place': 'pl', 'pl': 'pl',
    'circle': 'cir', 'cir': 'cir',
    'terrace': 'ter', 'ter': 'ter',
    'way': 'way',
    'trail': 'trl', 'trl': 'trl',
    'parkway': 'pkwy', 'pkwy': 'pkwy',
    'highway': 'hwy', 'hwy': 'hwy',
    'square': 'sq', 'sq': 'sq',
    'loop': 'loop',
    'crossing': 'xing', 'xing': 'xing',
    'point': 'pt', 'pt': 'pt',
    'run': 'run',
    'path': 'path',
    'alley': 'aly', 'aly': 'aly',
    'bend': 'bnd', 'bnd': 'bnd',
    'cove': 'cv', 'cv': 'cv',
    'crest': 'crst', 'crst': 'crst',
    'pass': 'pass',
    'pike': 'pike',
    'row': 'row',
    'walk': 'walk',
    'sound': 'snd', 'snd': 'snd',
  };

  // ---------------------------------------------------------------------
  // UTILITIES
  // ---------------------------------------------------------------------

  /** Generate a reasonably unique ID. */
  function genId(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  /** Clamp a number between min and max. */
  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  /** Deep clone via JSON (sufficient for GeoJSON / plain-data structures here). */
  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * Safe LocalStorage read with JSON parsing and fallback.
   * Returns `fallback` if the key is missing, empty, or contains invalid JSON.
   */
  function lsGet(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null || raw === undefined || raw === '') return deepClone(fallback);
      const parsed = JSON.parse(raw);
      return parsed;
    } catch (err) {
      console.warn('[BoxRecall] LocalStorage read failed for key "' + key + '":', err);
      return deepClone(fallback);
    }
  }

  /**
   * Safe LocalStorage write with JSON stringification.
   * Returns true on success, false on failure (e.g. quota exceeded, private mode).
   */
  function lsSet(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.error('[BoxRecall] LocalStorage write failed for key "' + key + '":', err);
      Toast && Toast.show('Save failed — storage may be full or unavailable.', 'error');
      return false;
    }
  }

  function lsRemove(key) {
    try {
      window.localStorage.removeItem(key);
      return true;
    } catch (err) {
      console.error('[BoxRecall] LocalStorage remove failed for key "' + key + '":', err);
      return false;
    }
  }

  /**
   * Normalize a street name for fuzzy comparison:
   * - lowercase
   * - trim whitespace, collapse multiple spaces
   * - strip punctuation (periods, commas)
   * - expand common directional abbreviations is intentionally NOT done (kept literal)
   * - normalize known suffix words to their abbreviation (St/Street -> st)
   */
  function normalizeStreetName(name) {
    if (!name) return '';
    let s = String(name).toLowerCase().trim();
    s = s.replace(/[.,]/g, '');
    s = s.replace(/\s+/g, ' ');

    const parts = s.split(' ');
    if (parts.length > 1) {
      const last = parts[parts.length - 1];
      if (STREET_SUFFIX_MAP[last]) {
        parts[parts.length - 1] = STREET_SUFFIX_MAP[last];
        s = parts.join(' ');
      }
    }
    return s;
  }

  /**
   * Levenshtein Distance between two strings (iterative, O(n*m) space-optimized to two rows).
   */
  function levenshteinDistance(a, b) {
    a = a || '';
    b = b || '';
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    let prevRow = new Array(b.length + 1);
    let currRow = new Array(b.length + 1);

    for (let j = 0; j <= b.length; j++) prevRow[j] = j;

    for (let i = 1; i <= a.length; i++) {
      currRow[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        currRow[j] = Math.min(
          prevRow[j] + 1,      // deletion
          currRow[j - 1] + 1,  // insertion
          prevRow[j - 1] + cost // substitution
        );
      }
      const tmp = prevRow;
      prevRow = currRow;
      currRow = tmp;
    }
    return prevRow[b.length];
  }

  /**
   * Fuzzy-match a user's guess against a target street name.
   * Returns { isMatch: boolean, distance: number, normalizedGuess, normalizedTarget }.
   * Tolerance is the maximum allowed Levenshtein distance after normalization.
   */
  function fuzzyMatchStreet(guess, target, tolerance) {
    const ng = normalizeStreetName(guess);
    const nt = normalizeStreetName(target);
    const distance = levenshteinDistance(ng, nt);
    return {
      isMatch: distance <= clamp(tolerance, 0, 10) && ng.length > 0,
      distance: distance,
      normalizedGuess: ng,
      normalizedTarget: nt,
    };
  }

  /** Compute the centroid of a polygon's [lng,lat] ring (simple average — fine for label placement). */
  function ringCentroid(ring) {
    let sx = 0, sy = 0, n = 0;
    ring.forEach(function (pt) {
      sx += pt[0];
      sy += pt[1];
      n++;
    });
    if (n === 0) return [0, 0];
    return [sx / n, sy / n];
  }

  /** Compute a bounding-box centroid-ish midpoint of a LineString's coordinates. */
  function lineMidpoint(coords) {
    if (!coords || coords.length === 0) return [0, 0];
    const mid = Math.floor((coords.length - 1) / 2);
    return coords[mid];
  }

  /** Point-in-polygon test using ray casting. point = [lng,lat], ring = array of [lng,lat]. */
  function pointInRing(point, ring) {
    let inside = false;
    const x = point[0], y = point[1];
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1];
      const xj = ring[j][0], yj = ring[j][1];
      const intersect = ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  /** Distance (degrees, approximate) from a point to a line segment — used for "tap nearest street" hit testing. */
  function pointToSegmentDistance(p, a, b) {
    const px = p[0], py = p[1];
    const ax = a[0], ay = a[1];
    const bx = b[0], by = b[1];
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = clamp(t, 0, 1);
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    const ddx = px - cx, ddy = py - cy;
    return Math.sqrt(ddx * ddx + ddy * ddy);
  }

  /** Minimum distance from a point to any segment of a LineString. */
  function pointToLineDistance(point, coords) {
    let min = Infinity;
    for (let i = 0; i < coords.length - 1; i++) {
      const d = pointToSegmentDistance(point, coords[i], coords[i + 1]);
      if (d < min) min = d;
    }
    return min;
  }

  // ---------------------------------------------------------------------
  // STATE STORE
  // ---------------------------------------------------------------------

  /**
   * Central reactive-ish state store. Not a full framework — just a simple
   * pub/sub so different modules (map renderer, sidebar, quiz engine) can
   * react to state changes without tight coupling.
   */
  const Store = (function () {
    const listeners = {};

    const state = {
      // Loaded data
      boxes: lsGet(LS_KEYS.BOXES, { type: 'FeatureCollection', features: [] }),
      streets: lsGet(LS_KEYS.STREETS, { type: 'FeatureCollection', features: [] }),
      stats: lsGet(LS_KEYS.STATS, {}), // keyed by boxNumber -> { streetStats: {streetId: {seen, correct}}, lastStudied }
      settings: Object.assign({}, DEFAULT_SETTINGS, lsGet(LS_KEYS.SETTINGS, {})),

      // UI / runtime state (not persisted)
      activeTab: 'home',
      activeBoxNumber: null,    // currently focused Box Number (string)
      drawingActive: false,
      drawingVertices: [],      // array of [lat,lng] while drawing
      labelsVisible: true,
      mapReady: false,
      mapError: false,
      selectedBoxIds: new Set(), // box feature ids currently checked in Manage's bulk-select list
      selectedStreetIds: new Set(), // street feature ids currently checked in Manage's street list
      streetFilterBoxNumber: '', // '' = all boxes, '__unassigned__' = streets with no boxNumber, else a boxNumber string

      // Quiz state machine
      quiz: {
        phase: 'IDLE',          // IDLE -> QUIZ_ONGOING -> ANSWER_SUBMITTED -> RESULTS_SCORE
        mode: null,             // 'name-street' | 'locate-street' | 'box-identifier'
        boxNumber: null,
        questionIndex: 0,
        totalQuestions: 0,
        currentTarget: null,    // street feature or box feature depending on mode
        currentTargetLayer: null,
        lastResult: null,       // { correct: bool, message, distance }
        sessionResults: [],     // array of { mode, targetId, correct }
        queue: [],              // shuffled list of targets for this session
      },
    };

    state.labelsVisible = state.settings.labelsVisible !== false;

    function on(event, fn) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(fn);
      return function unsubscribe() {
        listeners[event] = listeners[event].filter(function (f) { return f !== fn; });
      };
    }

    function emit(event, payload) {
      (listeners[event] || []).forEach(function (fn) {
        try { fn(payload); } catch (err) { console.error('[BoxRecall] Listener error for "' + event + '":', err); }
      });
      (listeners['*'] || []).forEach(function (fn) {
        try { fn({ event: event, payload: payload }); } catch (err) { console.error('[BoxRecall] Wildcard listener error:', err); }
      });
    }

    // -- Persistence-backed mutators --------------------------------------

    function setBoxes(featureCollection) {
      state.boxes = featureCollection;
      lsSet(LS_KEYS.BOXES, state.boxes);
      emit('boxes:changed', state.boxes);
    }

    function addBox(feature) {
      if (!state.boxes.features) state.boxes.features = [];
      state.boxes.features.push(feature);
      setBoxes(state.boxes);
    }

    function updateBox(boxId, updater) {
      const idx = state.boxes.features.findIndex(function (f) { return f.id === boxId; });
      if (idx === -1) return false;
      const updated = updater(deepClone(state.boxes.features[idx]));
      state.boxes.features[idx] = updated;
      setBoxes(state.boxes);
      return true;
    }

    /**
     * Remove a box AND cascade-delete everything that belongs to it: its
     * streets (matched by boxNumber) and its quiz stats. This is the only
     * way boxes are removed — there is no "orphaned streets" state by
     * design, so the street list and dashboard never accumulate
     * disconnected data after a box is deleted.
     *
     * Returns true if a box was actually removed.
     */
    function removeBox(boxId) {
      const target = state.boxes.features.find(function (f) { return f.id === boxId; });
      if (!target) return false;

      const boxNumber = target.properties.boxNumber;

      state.boxes.features = state.boxes.features.filter(function (f) { return f.id !== boxId; });
      setBoxes(state.boxes);

      state.streets.features = state.streets.features.filter(function (f) {
        return !(f.properties && String(f.properties.boxNumber) === String(boxNumber));
      });
      setStreets(state.streets);

      resetBoxStats(boxNumber);
      state.selectedBoxIds.delete(boxId);

      // If the street-list filter was scoped to this box, reset it to "All
      // Boxes" — otherwise the filter dropdown would show "All Boxes" (no
      // option matches the stale value) while the list still filters by
      // the now-nonexistent box number, showing an empty list that looks
      // like "0 of N (filtered)" with no visible explanation.
      if (state.streetFilterBoxNumber === String(boxNumber)) {
        state.streetFilterBoxNumber = '';
      }

      return true;
    }

    /**
     * Cascade-delete multiple boxes (and their streets + stats) in a single
     * batched operation — used by bulk "Delete Selected". Equivalent to
     * calling removeBox() for each id, but only writes to LocalStorage and
     * emits change events once per affected collection rather than once per
     * box, which matters when deleting many boxes at once.
     *
     * Returns the number of boxes actually removed.
     */
    function removeBoxesCascade(boxIds) {
      const idSet = new Set(boxIds);
      const targets = state.boxes.features.filter(function (f) { return idSet.has(f.id); });
      if (targets.length === 0) return 0;

      const boxNumbers = new Set(targets.map(function (f) { return String(f.properties.boxNumber); }));

      state.boxes.features = state.boxes.features.filter(function (f) { return !idSet.has(f.id); });
      setBoxes(state.boxes);

      state.streets.features = state.streets.features.filter(function (f) {
        return !(f.properties && boxNumbers.has(String(f.properties.boxNumber)));
      });
      setStreets(state.streets);

      boxNumbers.forEach(function (bn) { resetBoxStats(bn); });
      idSet.forEach(function (id) { state.selectedBoxIds.delete(id); });

      if (boxNumbers.has(String(state.streetFilterBoxNumber))) {
        state.streetFilterBoxNumber = '';
      }

      return targets.length;
    }

    function setStreets(featureCollection) {
      state.streets = featureCollection;
      lsSet(LS_KEYS.STREETS, state.streets);
      emit('streets:changed', state.streets);
    }

    function addStreet(feature) {
      if (!state.streets.features) state.streets.features = [];
      state.streets.features.push(feature);
      setStreets(state.streets);
    }

    function updateStreet(streetId, updater) {
      const idx = state.streets.features.findIndex(function (f) { return f.id === streetId; });
      if (idx === -1) return false;
      const updated = updater(deepClone(state.streets.features[idx]));
      state.streets.features[idx] = updated;
      setStreets(state.streets);
      return true;
    }

    /**
     * Remove a street and clean up its per-street stats entry (if any),
     * under whichever box that street currently belongs to. Keeping
     * stats[boxNumber].streetStats[streetId] around for a deleted street
     * would be orphaned data with no UI ever showing it again.
     */
    function removeStreet(streetId) {
      const target = state.streets.features.find(function (f) { return f.id === streetId; });
      if (!target) return false;

      state.streets.features = state.streets.features.filter(function (f) { return f.id !== streetId; });
      setStreets(state.streets);

      const boxNumber = target.properties && target.properties.boxNumber;
      if (boxNumber !== null && boxNumber !== undefined && state.stats[boxNumber] && state.stats[boxNumber].streetStats[streetId]) {
        delete state.stats[boxNumber].streetStats[streetId];
        setStats(state.stats);
      }

      state.selectedStreetIds.delete(streetId);

      return true;
    }

    /**
     * Cascade-delete multiple streets (and their per-street stats entries)
     * in a single batched operation — used by Manage's bulk "Delete
     * Selected" for streets. Equivalent to calling removeStreet() for each
     * id, but writes to LocalStorage once rather than once per street.
     *
     * Returns the number of streets actually removed.
     */
    function removeStreetsCascade(streetIds) {
      const idSet = new Set(streetIds);
      const targets = state.streets.features.filter(function (f) { return idSet.has(f.id); });
      if (targets.length === 0) return 0;

      state.streets.features = state.streets.features.filter(function (f) { return !idSet.has(f.id); });
      setStreets(state.streets);

      let statsChanged = false;
      targets.forEach(function (f) {
        const boxNumber = f.properties && f.properties.boxNumber;
        if (boxNumber !== null && boxNumber !== undefined && state.stats[boxNumber] && state.stats[boxNumber].streetStats[f.id]) {
          delete state.stats[boxNumber].streetStats[f.id];
          statsChanged = true;
        }
      });
      if (statsChanged) setStats(state.stats);

      idSet.forEach(function (id) { state.selectedStreetIds.delete(id); });

      return targets.length;
    }

    function setStats(stats) {
      state.stats = stats;
      lsSet(LS_KEYS.STATS, state.stats);
      emit('stats:changed', state.stats);
    }

    function getBoxStats(boxNumber) {
      return state.stats[boxNumber] || { streetStats: {}, boxIdentifierStats: { seen: 0, correct: 0 }, lastStudied: null };
    }

    function recordStreetAttempt(boxNumber, streetId, wasCorrect) {
      if (!state.stats[boxNumber]) {
        state.stats[boxNumber] = { streetStats: {}, boxIdentifierStats: { seen: 0, correct: 0 }, lastStudied: null };
      }
      const bs = state.stats[boxNumber];
      if (!bs.streetStats[streetId]) bs.streetStats[streetId] = { seen: 0, correct: 0 };
      bs.streetStats[streetId].seen += 1;
      if (wasCorrect) bs.streetStats[streetId].correct += 1;
      bs.lastStudied = new Date().toISOString();
      setStats(state.stats);
    }

    function recordBoxIdentifierAttempt(boxNumber, wasCorrect) {
      if (!state.stats[boxNumber]) {
        state.stats[boxNumber] = { streetStats: {}, boxIdentifierStats: { seen: 0, correct: 0 }, lastStudied: null };
      }
      const bs = state.stats[boxNumber];
      bs.boxIdentifierStats.seen += 1;
      if (wasCorrect) bs.boxIdentifierStats.correct += 1;
      bs.lastStudied = new Date().toISOString();
      setStats(state.stats);
    }

    function resetBoxStats(boxNumber) {
      if (state.stats[boxNumber]) {
        delete state.stats[boxNumber];
        setStats(state.stats);
      }
    }

    function setSettings(partial) {
      state.settings = Object.assign({}, state.settings, partial);
      lsSet(LS_KEYS.SETTINGS, state.settings);
      emit('settings:changed', state.settings);
    }

    // -- Theme (light/dark) -------------------------------------------------

    /**
     * Resolve the stored theme preference ('light' | 'dark' | 'auto') to an
     * actual 'light' | 'dark' value, following the OS preference when set
     * to 'auto'.
     */
    function getEffectiveTheme() {
      const pref = state.settings.theme || 'auto';
      if (pref === 'light' || pref === 'dark') return pref;
      const prefersDark = typeof window !== 'undefined' && window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;
      return prefersDark ? 'dark' : 'light';
    }

    /**
     * Apply a theme to <html> (adds/removes the .dark class) and persist the
     * preference. Pass 'auto' to follow the OS preference going forward;
     * pass 'light'/'dark' to pin it explicitly. Does not persist if the
     * resolved value hasn't changed, to avoid redundant DOM writes.
     */
    function setTheme(pref) {
      if (pref !== 'light' && pref !== 'dark' && pref !== 'auto') pref = 'auto';
      setSettings({ theme: pref });
      applyEffectiveTheme();
    }

    /**
     * Toggle between light and dark based on the CURRENTLY DISPLAYED theme
     * (not the stored preference) — so toggling away from 'auto' moves to
     * the opposite of whatever is on screen right now, which is the
     * intuitive behavior regardless of what 'auto' currently resolves to.
     */
    function toggleTheme() {
      const current = getEffectiveTheme();
      setTheme(current === 'dark' ? 'light' : 'dark');
    }

    /** Sync <html class="dark"> with the resolved effective theme. */
    function applyEffectiveTheme() {
      if (typeof document === 'undefined') return;
      const dark = getEffectiveTheme() === 'dark';
      document.documentElement.classList.toggle('dark', dark);
      emit('ui:theme', getEffectiveTheme());
    }

    // -- Transient UI setters ----------------------------------------------

    function setActiveTab(tab) {
      state.activeTab = tab;
      emit('ui:tab', tab);
    }

    function setActiveBoxNumber(boxNumber) {
      state.activeBoxNumber = boxNumber;
      emit('ui:activeBox', boxNumber);
    }

    // -- Bulk box selection (Manage tab) ------------------------------------

    function toggleBoxSelection(boxId) {
      if (state.selectedBoxIds.has(boxId)) {
        state.selectedBoxIds.delete(boxId);
      } else {
        state.selectedBoxIds.add(boxId);
      }
      emit('ui:boxSelection', state.selectedBoxIds);
    }

    function isBoxSelected(boxId) {
      return state.selectedBoxIds.has(boxId);
    }

    /**
     * Select all currently-defined boxes, or clear the selection if every
     * box is already selected — i.e. the standard "select all" checkbox
     * toggle behavior (acts as "select none" once everything is checked).
     */
    function toggleSelectAllBoxes() {
      const allIds = state.boxes.features.map(function (f) { return f.id; });
      const allSelected = allIds.length > 0 && allIds.every(function (id) { return state.selectedBoxIds.has(id); });
      state.selectedBoxIds = allSelected ? new Set() : new Set(allIds);
      emit('ui:boxSelection', state.selectedBoxIds);
    }

    function clearBoxSelection() {
      if (state.selectedBoxIds.size === 0) return;
      state.selectedBoxIds = new Set();
      emit('ui:boxSelection', state.selectedBoxIds);
    }

    // -- Bulk street selection (Manage tab) ----------------------------------

    function toggleStreetSelection(streetId) {
      if (state.selectedStreetIds.has(streetId)) {
        state.selectedStreetIds.delete(streetId);
      } else {
        state.selectedStreetIds.add(streetId);
      }
      emit('ui:streetSelection', state.selectedStreetIds);
    }

    function isStreetSelected(streetId) {
      return state.selectedStreetIds.has(streetId);
    }

    /**
     * Select all streets in `visibleIds` (the currently-filtered/visible
     * set, computed by the UI), or clear the selection if every one of
     * those is already selected — the standard "select all" checkbox
     * toggle. Unlike toggleSelectAllBoxes, this is scoped to a caller-
     * provided id list rather than ALL streets, since the street list is
     * filterable by box and "select all" should mean "all visible",
     * matching the checkboxes actually on screen.
     */
    function toggleSelectAllStreets(visibleIds) {
      const allSelected = visibleIds.length > 0 && visibleIds.every(function (id) { return state.selectedStreetIds.has(id); });
      if (allSelected) {
        visibleIds.forEach(function (id) { state.selectedStreetIds.delete(id); });
      } else {
        visibleIds.forEach(function (id) { state.selectedStreetIds.add(id); });
      }
      emit('ui:streetSelection', state.selectedStreetIds);
    }

    function clearStreetSelection() {
      if (state.selectedStreetIds.size === 0) return;
      state.selectedStreetIds = new Set();
      emit('ui:streetSelection', state.selectedStreetIds);
    }

    /** '' (all boxes) | '__unassigned__' | a boxNumber string. */
    function setStreetFilterBoxNumber(value) {
      state.streetFilterBoxNumber = value || '';
      emit('ui:streetFilter', state.streetFilterBoxNumber);
    }

    function setDrawingActive(active) {
      state.drawingActive = active;
      state.drawingVertices = [];
      emit('ui:drawing', active);
    }

    function pushDrawingVertex(latlng) {
      state.drawingVertices.push(latlng);
      emit('ui:drawingVertex', state.drawingVertices);
    }

    function setLabelsVisible(visible) {
      state.labelsVisible = visible;
      setSettings({ labelsVisible: visible });
      emit('ui:labelsVisible', visible);
    }

    function setMapReady(ready) {
      state.mapReady = ready;
      emit('ui:mapReady', ready);
    }

    function setMapError(hasError) {
      state.mapError = hasError;
      emit('ui:mapError', hasError);
    }

    // -- Quiz state machine --------------------------------------------------

    function quizDispatch(action, payload) {
      const q = state.quiz;
      switch (action) {
        case 'START':
          state.quiz = Object.assign({}, q, {
            phase: 'QUIZ_ONGOING',
            mode: payload.mode,
            boxNumber: payload.boxNumber,
            questionIndex: 0,
            totalQuestions: payload.queue.length,
            queue: payload.queue,
            currentTarget: payload.queue[0] || null,
            currentTargetLayer: null,
            lastResult: null,
            sessionResults: [],
          });
          break;
        case 'SUBMIT_ANSWER':
          state.quiz = Object.assign({}, q, {
            phase: 'ANSWER_SUBMITTED',
            lastResult: payload.result,
            sessionResults: q.sessionResults.concat([payload.resultRecord]),
          });
          break;
        case 'NEXT_QUESTION': {
          const nextIndex = q.questionIndex + 1;
          if (nextIndex >= q.totalQuestions) {
            state.quiz = Object.assign({}, q, { phase: 'RESULTS_SCORE' });
          } else {
            state.quiz = Object.assign({}, q, {
              phase: 'QUIZ_ONGOING',
              questionIndex: nextIndex,
              currentTarget: q.queue[nextIndex],
              currentTargetLayer: null,
              lastResult: null,
            });
          }
          break;
        }
        case 'END':
        case 'RESET':
          state.quiz = Object.assign({}, q, {
            phase: 'IDLE',
            mode: null,
            boxNumber: null,
            questionIndex: 0,
            totalQuestions: 0,
            currentTarget: null,
            currentTargetLayer: null,
            lastResult: null,
            sessionResults: [],
            queue: [],
          });
          break;
        default:
          console.warn('[BoxRecall] Unknown quiz action:', action);
          return;
      }
      emit('quiz:changed', state.quiz);
    }

    function setQuizTargetLayer(layer) {
      state.quiz.currentTargetLayer = layer;
    }

    // -- Bulk import / reset --------------------------------------------------

    function importGeoJSON(geojson) {
      // Expecting either a combined object { boxes: FC, streets: FC, stats?: {} }
      // or a plain FeatureCollection where features are tagged with properties.layerType
      let boxesFC = { type: 'FeatureCollection', features: [] };
      let streetsFC = { type: 'FeatureCollection', features: [] };

      if (geojson && geojson.boxes && geojson.streets) {
        boxesFC = geojson.boxes;
        streetsFC = geojson.streets;
      } else if (geojson && geojson.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
        geojson.features.forEach(function (f) {
          const lt = f.properties && f.properties.layerType;
          if (lt === 'street' || (f.geometry && f.geometry.type === 'LineString')) {
            streetsFC.features.push(f);
          } else if (lt === 'box' || (f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'))) {
            boxesFC.features.push(f);
          }
        });
      } else {
        throw new Error('Unrecognized GeoJSON structure.');
      }

      // Ensure every feature has an id
      boxesFC.features.forEach(function (f) { if (!f.id) f.id = genId('box'); if (!f.properties) f.properties = {}; });
      streetsFC.features.forEach(function (f) { if (!f.id) f.id = genId('street'); if (!f.properties) f.properties = {}; });

      setBoxes(boxesFC);
      setStreets(streetsFC);

      if (geojson && geojson.stats) {
        setStats(geojson.stats);
      }
    }

    function exportGeoJSON() {
      return {
        type: 'BoxRecallExport',
        version: 1,
        exportedAt: new Date().toISOString(),
        boxes: state.boxes,
        streets: state.streets,
      };
    }

    function exportStats() {
      return {
        type: 'BoxRecallStatsExport',
        version: 1,
        exportedAt: new Date().toISOString(),
        stats: state.stats,
        settings: state.settings,
      };
    }

    function resetAllData() {
      state.boxes = { type: 'FeatureCollection', features: [] };
      state.streets = { type: 'FeatureCollection', features: [] };
      state.stats = {};
      state.settings = Object.assign({}, DEFAULT_SETTINGS);
      lsRemove(LS_KEYS.BOXES);
      lsRemove(LS_KEYS.STREETS);
      lsRemove(LS_KEYS.STATS);
      lsRemove(LS_KEYS.SETTINGS);
      emit('boxes:changed', state.boxes);
      emit('streets:changed', state.streets);
      emit('stats:changed', state.stats);
      emit('settings:changed', state.settings);
    }

    return {
      state: state,
      on: on,
      emit: emit,
      // boxes
      setBoxes: setBoxes, addBox: addBox, updateBox: updateBox, removeBox: removeBox, removeBoxesCascade: removeBoxesCascade,
      // streets
      setStreets: setStreets, addStreet: addStreet, updateStreet: updateStreet, removeStreet: removeStreet, removeStreetsCascade: removeStreetsCascade,
      // stats
      setStats: setStats, getBoxStats: getBoxStats,
      recordStreetAttempt: recordStreetAttempt,
      recordBoxIdentifierAttempt: recordBoxIdentifierAttempt,
      resetBoxStats: resetBoxStats,
      // settings
      setSettings: setSettings,
      getEffectiveTheme: getEffectiveTheme,
      setTheme: setTheme,
      toggleTheme: toggleTheme,
      applyEffectiveTheme: applyEffectiveTheme,
      // ui
      setActiveTab: setActiveTab,
      setActiveBoxNumber: setActiveBoxNumber,
      toggleBoxSelection: toggleBoxSelection,
      isBoxSelected: isBoxSelected,
      toggleSelectAllBoxes: toggleSelectAllBoxes,
      clearBoxSelection: clearBoxSelection,
      toggleStreetSelection: toggleStreetSelection,
      isStreetSelected: isStreetSelected,
      toggleSelectAllStreets: toggleSelectAllStreets,
      clearStreetSelection: clearStreetSelection,
      setStreetFilterBoxNumber: setStreetFilterBoxNumber,
      setDrawingActive: setDrawingActive,
      pushDrawingVertex: pushDrawingVertex,
      setLabelsVisible: setLabelsVisible,
      setMapReady: setMapReady,
      setMapError: setMapError,
      // quiz
      quizDispatch: quizDispatch,
      setQuizTargetLayer: setQuizTargetLayer,
      // import/export
      importGeoJSON: importGeoJSON,
      exportGeoJSON: exportGeoJSON,
      exportStats: exportStats,
      resetAllData: resetAllData,
    };
  })();

  // ---------------------------------------------------------------------
  // TOAST NOTIFICATIONS
  // ---------------------------------------------------------------------
  const Toast = (function () {
    let container = null;
    let nextId = 1;
    const DEFAULT_DURATION_MS = 3200;

    function ensureContainer() {
      if (!container) container = document.getElementById('toast-stack');
      return container;
    }

    /**
     * Show a toast notification.
     * @param {string} message
     * @param {'info'|'success'|'error'|'warn'} type
     * @param {{sticky?: boolean, duration?: number}} [options]
     *   sticky: if true, the toast stays until dismiss(id) is called (used
     *     for "in progress…" states like network lookups).
     *   duration: override the auto-dismiss time in ms (ignored if sticky).
     * @returns {number} an id that can be passed to dismiss()
     */
    function show(message, type, options) {
      type = type || 'info';
      options = options || {};
      const id = nextId++;

      const el = document.createElement('div');
      const colorMap = {
        info: 'border-base-600 text-ink-100',
        success: 'border-alert-green/50 text-alert-green',
        error: 'border-alert-red/50 text-alert-red',
        warn: 'border-alert-amber/50 text-alert-amber',
      };
      const iconMap = {
        info: 'info',
        success: 'check-circle-2',
        error: 'alert-triangle',
        warn: 'alert-triangle',
      };
      el.dataset.toastId = String(id);
      el.className = 'toast-item pointer-events-auto w-full md:w-auto max-w-sm bg-base-900 border ' + (colorMap[type] || colorMap.info) +
        ' rounded-md px-3 py-2 text-xs font-mono shadow-lg flex items-center gap-2';
      el.innerHTML = '<i data-lucide="' + (iconMap[type] || iconMap.info) + '" class="w-3.5 h-3.5 shrink-0' + (options.sticky ? ' animate-spin' : '') + '"></i><span class="flex-1">' + escapeHtml(message) + '</span>';

      // Use a spinner icon for sticky/in-progress toasts if available
      if (options.sticky) {
        const icon = el.querySelector('i');
        if (icon) icon.setAttribute('data-lucide', 'loader-2');
      }

      const c = ensureContainer();
      c.appendChild(el);
      if (window.lucide) window.lucide.createIcons({ nodes: [el] });

      if (!options.sticky) {
        const duration = typeof options.duration === 'number' ? options.duration : DEFAULT_DURATION_MS;
        setTimeout(function () { removeToastEl(el); }, duration);
      }

      return id;
    }

    function removeToastEl(el) {
      if (!el || !el.parentNode) return;
      el.style.transition = 'opacity 0.25s, transform 0.25s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(6px)';
      setTimeout(function () { el.remove(); }, 260);
    }

    /** Dismiss a toast by the id returned from show(). No-op if already gone. */
    function dismiss(id) {
      const c = ensureContainer();
      if (!c) return;
      const el = c.querySelector('[data-toast-id="' + id + '"]');
      if (el) removeToastEl(el);
    }

    return { show: show, dismiss: dismiss };
  })();

  /** Minimal HTML escaping for any user-provided strings rendered as innerHTML. */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str == null ? '' : str);
    return div.innerHTML;
  }

  // ---------------------------------------------------------------------
  // EXPORTS (attach to window for cross-file access in this single-file app)
  // ---------------------------------------------------------------------
  window.BoxRecall = window.BoxRecall || {};
  Object.assign(window.BoxRecall, {
    LS_KEYS: LS_KEYS,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    MASTERY_THRESHOLDS: MASTERY_THRESHOLDS,
    STREET_SUFFIX_MAP: STREET_SUFFIX_MAP,
    genId: genId,
    clamp: clamp,
    deepClone: deepClone,
    lsGet: lsGet,
    lsSet: lsSet,
    lsRemove: lsRemove,
    normalizeStreetName: normalizeStreetName,
    levenshteinDistance: levenshteinDistance,
    fuzzyMatchStreet: fuzzyMatchStreet,
    ringCentroid: ringCentroid,
    lineMidpoint: lineMidpoint,
    pointInRing: pointInRing,
    pointToSegmentDistance: pointToSegmentDistance,
    pointToLineDistance: pointToLineDistance,
    escapeHtml: escapeHtml,
    Store: Store,
    Toast: Toast,
  });

  // Make Toast available globally for early references in lsSet before full init
  window.Toast = Toast;

})();
