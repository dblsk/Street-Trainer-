// ============================================================================
// FIRST DUE — Box Study & Active Recall App
// app-diagnostics.js — Strict client-side test suite (Step 4)
//
// Mocks map renders, simulates correct/incorrect quiz answers, verifies
// LocalStorage read/write, and prints a pass/fail console log + on-screen
// diagnostic output.
// ============================================================================

(function () {
  'use strict';

  const FD = window.FirstDue;
  const Store = FD.Store;

  let results = [];

  function log(line, cls) {
    results.push({ text: line, cls: cls || 'diag-info' });
  }

  function pass(name) {
    log('  ✔ PASS — ' + name, 'diag-pass');
    return true;
  }

  function fail(name, detail) {
    log('  ✘ FAIL — ' + name + (detail ? ' :: ' + detail : ''), 'diag-fail');
    return false;
  }

  function section(title) {
    log('', 'diag-info');
    log('── ' + title + ' ──', 'diag-head');
  }

  function assert(condition, name, detail) {
    return condition ? pass(name) : fail(name, detail);
  }

  // ---------------------------------------------------------------------
  // TEST: Levenshtein Distance & Fuzzy Matching (Module 3 scoring core)
  // ---------------------------------------------------------------------
  function testLevenshtein() {
    section('Levenshtein Distance Algorithm');

    assert(FD.levenshteinDistance('kitten', 'sitting') === 3, 'kitten/sitting = 3', 'got ' + FD.levenshteinDistance('kitten', 'sitting'));
    assert(FD.levenshteinDistance('', '') === 0, 'empty/empty = 0');
    assert(FD.levenshteinDistance('abc', '') === 3, 'abc/empty = 3');
    assert(FD.levenshteinDistance('', 'abc') === 3, 'empty/abc = 3');
    assert(FD.levenshteinDistance('same', 'same') === 0, 'identical strings = 0');
    assert(FD.levenshteinDistance('flaw', 'lawn') === 2, 'flaw/lawn = 2', 'got ' + FD.levenshteinDistance('flaw', 'lawn'));
  }

  function testNormalizeStreetName() {
    section('Street Name Normalization');

    assert(FD.normalizeStreetName('Iona Sound Drive') === 'iona sound dr', 'expands "Drive" -> "dr"', FD.normalizeStreetName('Iona Sound Drive'));
    assert(FD.normalizeStreetName('Main St.') === 'main st', 'strips trailing period', FD.normalizeStreetName('Main St.'));
    assert(FD.normalizeStreetName('  Oak   Avenue  ') === 'oak ave', 'collapses whitespace + maps Avenue->ave', FD.normalizeStreetName('  Oak   Avenue  '));
    assert(FD.normalizeStreetName('') === '', 'empty input -> empty output');
    assert(FD.normalizeStreetName('Elm Court') === 'elm ct', 'Court -> ct', FD.normalizeStreetName('Elm Court'));
  }

  function testFuzzyMatch() {
    section('Fuzzy Matching (Name the Street)');

    // Tolerance 1: minor suffix/typo variations should pass
    let m = FD.fuzzyMatchStreet('Iona Sound Dr', 'Iona Sound Drive', 1);
    assert(m.isMatch === true, '"Iona Sound Dr" matches "Iona Sound Drive" at tol=1', JSON.stringify(m));

    // Single-character substitution within an otherwise-normalized name (distance 1)
    m = FD.fuzzyMatchStreet('Iona Sound Dx', 'Iona Sound Dr', 1);
    assert(m.isMatch === true && m.distance === 1, '1-character substitution matches at tol=1', JSON.stringify(m));

    m = FD.fuzzyMatchStreet('Iona Sound', 'Iona Sound Drive', 1);
    assert(m.isMatch === false, 'missing suffix word fails at tol=1 (large edit distance)', JSON.stringify(m));

    m = FD.fuzzyMatchStreet('iona sound dr', 'IONA SOUND DR', 0);
    assert(m.isMatch === true, 'case-insensitive exact match at tol=0', JSON.stringify(m));

    m = FD.fuzzyMatchStreet('', 'Main St', 3);
    assert(m.isMatch === false, 'empty guess never matches regardless of tolerance', JSON.stringify(m));

    // Transposed letters = 2 substitutions in Levenshtein terms; passes at tol=2 but not tol=1
    m = FD.fuzzyMatchStreet('Mian St', 'Main St', 2);
    assert(m.isMatch === true && m.distance === 2, 'transposed letters (distance 2) match at tol=2', JSON.stringify(m));

    m = FD.fuzzyMatchStreet('Mian St', 'Main St', 1);
    assert(m.isMatch === false, 'transposed letters (distance 2) do NOT match at tol=1', JSON.stringify(m));
  }

  // ---------------------------------------------------------------------
  // TEST: Geometry helpers (point-in-polygon, point-to-line)
  // ---------------------------------------------------------------------
  function testGeometryHelpers() {
    section('Geometry Helpers');

    // Simple unit square ring [lng,lat]
    const square = [[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]];
    assert(FD.pointInRing([0.5, 0.5], square) === true, 'center point is inside unit square');
    assert(FD.pointInRing([1.5, 0.5], square) === false, 'point outside unit square returns false');
    assert(FD.pointInRing([0.0001, 0.0001], square) === true, 'point near corner is inside');

    // Point-to-segment / point-to-line distance
    const dSeg = FD.pointToSegmentDistance([0, 1], [0, 0], [2, 0]); // point above midpoint of horizontal segment
    assert(Math.abs(dSeg - 1) < 1e-9, 'perpendicular distance from point to segment = 1', 'got ' + dSeg);

    const line = [[0, 0], [2, 0], [4, 0]];
    const dLine = FD.pointToLineDistance([1, 0.5], line);
    assert(Math.abs(dLine - 0.5) < 1e-9, 'point-to-line distance to nearest segment = 0.5', 'got ' + dLine);

    // Centroid / midpoint sanity
    const c = FD.ringCentroid(square.slice(0, 4)); // exclude closing duplicate
    assert(Math.abs(c[0] - 0.5) < 1e-9 && Math.abs(c[1] - 0.5) < 1e-9, 'ringCentroid of unit square = (0.5, 0.5)', JSON.stringify(c));

    const mid = FD.lineMidpoint([[0, 0], [10, 10]]);
    assert(Array.isArray(mid) && mid.length === 2, 'lineMidpoint returns a coordinate pair', JSON.stringify(mid));
  }

  // ---------------------------------------------------------------------
  // TEST: LocalStorage read/write
  // ---------------------------------------------------------------------
  function testLocalStorage() {
    section('LocalStorage Read/Write');

    const TEST_KEY = '__fd_diagnostic_test_key__';
    const payload = { hello: 'world', n: 42, arr: [1, 2, 3] };

    const writeOk = FD.lsSet(TEST_KEY, payload);
    assert(writeOk === true, 'lsSet returns true on successful write');

    const readBack = FD.lsGet(TEST_KEY, null);
    assert(JSON.stringify(readBack) === JSON.stringify(payload), 'lsGet round-trips the same object', JSON.stringify(readBack));

    FD.lsRemove(TEST_KEY);
    const afterRemove = FD.lsGet(TEST_KEY, 'FALLBACK');
    assert(afterRemove === 'FALLBACK', 'lsGet returns fallback after key removed', JSON.stringify(afterRemove));

    // Corrupt-JSON fallback behaviour
    try {
      window.localStorage.setItem(TEST_KEY, '{not valid json');
      const corrupted = FD.lsGet(TEST_KEY, { safe: true });
      assert(corrupted && corrupted.safe === true, 'lsGet returns fallback on corrupt JSON without throwing', JSON.stringify(corrupted));
    } finally {
      FD.lsRemove(TEST_KEY);
    }

    // Verify the real persisted keys exist & are well-formed FeatureCollections / objects
    const boxesRaw = window.localStorage.getItem(FD.LS_KEYS.BOXES);
    assert(boxesRaw === null || (function () {
      try { const p = JSON.parse(boxesRaw); return p.type === 'FeatureCollection' && Array.isArray(p.features); } catch (e) { return false; }
    })(), 'persisted boxes key (if present) is a valid FeatureCollection');

    const settingsRaw = window.localStorage.getItem(FD.LS_KEYS.SETTINGS);
    assert(settingsRaw === null || (function () {
      try { const p = JSON.parse(settingsRaw); return typeof p === 'object' && p !== null; } catch (e) { return false; }
    })(), 'persisted settings key (if present) is a valid object');
  }

  // ---------------------------------------------------------------------
  // TEST: Store mutators (boxes/streets/stats) on a sandboxed snapshot
  // ---------------------------------------------------------------------
  function testStoreMutators() {
    section('State Store Mutators (sandboxed — restores real data after)');

    // Snapshot real state so the diagnostic suite never corrupts user data.
    const snapshot = {
      boxes: FD.deepClone(Store.state.boxes),
      streets: FD.deepClone(Store.state.streets),
      stats: FD.deepClone(Store.state.stats),
    };

    try {
      // Inject a fake box + street
      const fakeBox = {
        type: 'Feature',
        id: '__diag_box__',
        properties: { layerType: 'box', boxNumber: '__DIAG__', label: 'Diagnostic Box' },
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 0.001], [0.001, 0.001], [0.001, 0], [0, 0]]] },
      };
      const fakeStreet = {
        type: 'Feature',
        id: '__diag_street__',
        properties: { layerType: 'street', name: 'Diagnostic Test Ave', boxNumber: '__DIAG__' },
        geometry: { type: 'LineString', coordinates: [[0, 0], [0.001, 0.001]] },
      };

      Store.addBox(fakeBox);
      assert(Store.state.boxes.features.some(function (f) { return f.id === '__diag_box__'; }), 'addBox adds a feature to state.boxes');

      Store.addStreet(fakeStreet);
      assert(Store.state.streets.features.some(function (f) { return f.id === '__diag_street__'; }), 'addStreet adds a feature to state.streets');

      // updateBox
      const updateOk = Store.updateBox('__diag_box__', function (f) { f.properties.label = 'Updated Label'; return f; });
      assert(updateOk === true, 'updateBox returns true for existing feature');
      const updatedBox = Store.state.boxes.features.find(function (f) { return f.id === '__diag_box__'; });
      assert(updatedBox && updatedBox.properties.label === 'Updated Label', 'updateBox persists the mutation');

      // recordStreetAttempt (correct then incorrect)
      Store.recordStreetAttempt('__DIAG__', '__diag_street__', true);
      Store.recordStreetAttempt('__DIAG__', '__diag_street__', false);
      const bs = Store.getBoxStats('__DIAG__');
      assert(bs.streetStats['__diag_street__'].seen === 2, 'recordStreetAttempt increments "seen"', JSON.stringify(bs.streetStats['__diag_street__']));
      assert(bs.streetStats['__diag_street__'].correct === 1, 'recordStreetAttempt increments "correct" only on success', JSON.stringify(bs.streetStats['__diag_street__']));

      // recordBoxIdentifierAttempt
      Store.recordBoxIdentifierAttempt('__DIAG__', true);
      const bs2 = Store.getBoxStats('__DIAG__');
      assert(bs2.boxIdentifierStats.seen === 1 && bs2.boxIdentifierStats.correct === 1, 'recordBoxIdentifierAttempt records box-ID stats', JSON.stringify(bs2.boxIdentifierStats));

      // Mastery calculation should now be "review" or "mastered" depending on ratio
      // total seen=3, correct=2 -> ratio 0.667 -> 'review'
      const mastery = window.FirstDue.Map._internal.masteryForBox('__DIAG__');
      assert(mastery.level === 'review', 'masteryForBox computes "review" for 2/3 ratio', JSON.stringify(mastery));

      // removeStreet / removeBox
      const removedStreet = Store.removeStreet('__diag_street__');
      assert(removedStreet === true, 'removeStreet returns true for existing feature');

      const removedBox = Store.removeBox('__diag_box__');
      assert(removedBox === true, 'removeBox returns true for existing feature');

      Store.resetBoxStats('__DIAG__');
      const bsAfterReset = Store.state.stats['__DIAG__'];
      assert(bsAfterReset === undefined, 'resetBoxStats removes the box entry from stats');

    } catch (err) {
      fail('Store mutator test threw an exception', err.message);
    } finally {
      // Restore real data exactly as it was before the diagnostic run.
      Store.setBoxes(snapshot.boxes);
      Store.setStreets(snapshot.streets);
      Store.setStats(snapshot.stats);
    }
  }

  // ---------------------------------------------------------------------
  // TEST: Map render mocking (verifies map module exposes expected surface
  // and that styling/mastery functions don't throw on edge cases)
  // ---------------------------------------------------------------------
  function testMapRenderMocks() {
    section('Map Render Mocks & Error Handling');

    const MapMod = window.FirstDue.Map;
    assert(typeof MapMod.getMap === 'function', 'Map module exposes getMap()');

    const map = MapMod.getMap();
    if (Store.state.mapReady) {
      assert(map !== null && map !== undefined, 'Leaflet map instance exists when Store.state.mapReady=true');
      assert(Store.state.mapError === false, 'mapError is false when mapReady is true');
    } else {
      assert(map === null, 'getMap() returns null when Store.state.mapReady=false (map init did not complete)');
      log('  ℹ INFO — map unavailable (mapReady=false); skipping map-instance assertions. This is expected if Leaflet failed to load (e.g. offline or CDN blocked).', 'diag-info');
    }

    // masteryForBox on a box number with zero attempts -> 'unstudied', ratio null
    const m = MapMod._internal.masteryForBox('__NONEXISTENT_BOX__');
    assert(m.level === 'unstudied' && m.ratio === null, 'masteryForBox handles unknown box gracefully', JSON.stringify(m));

    // colorForMasteryLevel covers all four levels without throwing
    ['mastered', 'review', 'failing', 'unstudied', 'something-unexpected'].forEach(function (lvl) {
      const c = MapMod._internal.colorForMasteryLevel(lvl);
      assert(c && typeof c.stroke === 'string', 'colorForMasteryLevel("' + lvl + '") returns a style object', JSON.stringify(c));
    });

    // Simulate a tile error event without a real network call
    try {
      let bannerToggled = false;
      const unsub = Store.on('ui:mapError', function (val) { bannerToggled = (val === true || val === false); });
      Store.setMapError(true);
      Store.setMapError(false);
      unsub();
      assert(bannerToggled === true, 'setMapError emits ui:mapError event (mocked banner toggle observed)');
    } catch (err) {
      fail('Mocked tile-error event handling threw', err.message);
    }

    // Rendering an empty FeatureCollection should not throw
    try {
      const snapshotBoxes = FD.deepClone(Store.state.boxes);
      const snapshotStreets = FD.deepClone(Store.state.streets);
      Store.setBoxes({ type: 'FeatureCollection', features: [] });
      Store.setStreets({ type: 'FeatureCollection', features: [] });
      MapMod.renderAllBoxes();
      MapMod.renderAllStreets();
      MapMod.renderLabels();
      pass('renderAllBoxes/renderAllStreets/renderLabels handle empty FeatureCollections without throwing');
      Store.setBoxes(snapshotBoxes);
      Store.setStreets(snapshotStreets);
    } catch (err) {
      fail('Rendering empty FeatureCollections threw', err.message);
    }

    // Malformed feature (wrong geometry type) should be skipped, not throw
    try {
      const badBox = { type: 'Feature', id: '__diag_bad_box__', properties: { boxNumber: '__BAD__' }, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } };
      const layer = MapMod._internal && undefined; // not directly callable; use addBoxLayer indirectly via renderAllBoxes
      const snapshot = FD.deepClone(Store.state.boxes);
      Store.state.boxes.features.push(badBox); // direct mutation for test only (not persisted via setBoxes to avoid lsSet noise)
      MapMod.renderAllBoxes();
      pass('renderAllBoxes skips malformed (non-Polygon) box features without throwing');
      Store.state.boxes = snapshot;
      MapMod.renderAllBoxes();
    } catch (err) {
      fail('Malformed feature handling threw', err.message);
      // attempt recovery
      try { MapMod.renderAllBoxes(); } catch (e2) { /* ignore */ }
    }
  }

  // ---------------------------------------------------------------------
  // TEST: Overpass street auto-discovery (query builder, way-merging, and
  // fetchStreetsForPolygon with a mocked fetch — no real network call)
  // ---------------------------------------------------------------------
  function testOverpassStreetDiscovery() {
    section('Overpass Street Auto-Discovery');

    const MapMod = window.FirstDue.Map;
    const internal = MapMod._internal;

    if (!internal.buildOverpassQuery || !internal.mergeAdjacentNamedWays) {
      fail('Overpass internals not exported', 'buildOverpassQuery/mergeAdjacentNamedWays missing from Map._internal');
      return;
    }

    // --- Query builder ---
    const verts = [[28.04, -82.46], [28.05, -82.46], [28.05, -82.45], [28.04, -82.45]];
    const query = internal.buildOverpassQuery(verts);
    assert(query.startsWith('[out:json]'), 'query starts with [out:json]', query.slice(0, 20));
    assert(query.includes('poly:"28.04 -82.46'), 'query embeds polygon coordinates as "lat lon lat lon..."', query);
    assert(query.includes('["name"]'), 'query requires a name tag', query);
    assert(query.includes('out geom'), 'query requests inline geometry via "out geom"', query);
    assert(!/\.\d{7,}/.test(query), 'coordinates are rounded to 6 decimal places');

    // --- mergeAdjacentNamedWays: contiguous same-name ways merge; disconnected same-name ways stay separate ---
    const wayA = { id: 1, tags: { name: 'Main St' }, geometry: [{ lat: 28.04, lon: -82.46 }, { lat: 28.041, lon: -82.459 }] };
    const wayB = { id: 2, tags: { name: 'Main St' }, geometry: [{ lat: 28.041, lon: -82.459 }, { lat: 28.042, lon: -82.458 }] };
    const wayC = { id: 3, tags: { name: 'Oak Ave' }, geometry: [{ lat: 28.05, lon: -82.45 }, { lat: 28.051, lon: -82.449 }] };
    const wayD = { id: 4, tags: { name: 'Oak Ave' }, geometry: [{ lat: 28.06, lon: -82.44 }, { lat: 28.061, lon: -82.439 }] };

    const merged = internal.mergeAdjacentNamedWays([wayA, wayB, wayC, wayD]);
    const mainSt = merged.find(function (m) { return m.tags.name === 'Main St'; });
    assert(merged.length === 3, 'merge produces 3 chains (1 merged Main St + 2 separate Oak Ave)', merged.length);
    assert(!!mainSt && mainSt.geometry.length === 3 && mainSt.osmIds.length === 2, 'adjacent same-name ways merge into one chain spanning both', mainSt);
    assert(merged.filter(function (m) { return m.tags.name === 'Oak Ave'; }).length === 2, 'disconnected same-name ways remain separate features');

    // --- fetchStreetsForPolygon with a mocked fetch (success path) ---
    const realFetch = window.fetch;
    try {
      window.fetch = function () {
        return Promise.resolve({
          ok: true,
          json: function () {
            return Promise.resolve({
              elements: [
                { type: 'way', id: 201, tags: { highway: 'residential', name: 'Diagnostic Test Dr' }, geometry: [{ lat: 28.041, lon: -82.459 }, { lat: 28.042, lon: -82.458 }] },
                { type: 'way', id: 202, tags: { highway: 'residential', name: 'Diagnostic Test Dr' }, geometry: [{ lat: 28.042, lon: -82.458 }, { lat: 28.043, lon: -82.457 }] },
                { type: 'way', id: 203, tags: { highway: 'footway', name: 'Excluded Footpath' }, geometry: [{ lat: 28.05, lon: -82.45 }, { lat: 28.051, lon: -82.449 }] },
                { type: 'way', id: 204, tags: { highway: 'residential' }, geometry: [{ lat: 28.06, lon: -82.44 }, { lat: 28.061, lon: -82.439 }] },
              ],
            });
          },
        });
      };

      return MapMod.fetchStreetsForPolygon(verts, '__DIAG_OVERPASS__').then(function (result) {
        assert(result.error === null, 'mocked successful fetch returns no error', result.error);
        assert(result.rawWayCount === 2, 'rawWayCount counts only valid named-highway ways (excludes footway and unnamed)', result.rawWayCount);
        assert(result.features.length === 1, 'two adjacent same-name ways merge into a single feature', result.features.length);

        const feature = result.features[0];
        if (feature) {
          assert(feature.properties.name === 'Diagnostic Test Dr', 'merged feature has the expected name', feature.properties.name);
          assert(feature.properties.boxNumber === '__DIAG_OVERPASS__', 'feature is tagged with the requesting boxNumber', feature.properties.boxNumber);
          assert(feature.properties.source === 'osm', 'feature is tagged source="osm"', feature.properties.source);
          assert(feature.geometry.type === 'LineString' && feature.geometry.coordinates.length === 3, 'merged feature geometry has 3 points (2+2 ways sharing 1 node)', feature.geometry);
          assert(Math.abs(feature.geometry.coordinates[0][0] - (-82.459)) < 1e-9 && Math.abs(feature.geometry.coordinates[0][1] - 28.041) < 1e-9, 'feature coordinates are in [lng,lat] order', feature.geometry.coordinates[0]);
        }

        // --- Error paths: network failure and non-OK HTTP status ---
        window.fetch = function () { return Promise.reject(new TypeError('mock network failure')); };
        return MapMod.fetchStreetsForPolygon(verts, '__DIAG_OVERPASS__').then(function (result2) {
          assert(result2.features.length === 0 && typeof result2.error === 'string' && result2.error.toLowerCase().includes('manually'), 'network failure returns empty features with a "add manually" message', result2);

          window.fetch = function () { return Promise.resolve({ ok: false, status: 503 }); };
          return MapMod.fetchStreetsForPolygon(verts, '__DIAG_OVERPASS__').then(function (result3) {
            assert(result3.features.length === 0 && typeof result3.error === 'string', 'non-OK HTTP response returns empty features with an error message', result3);

            // --- too-few-points guard: should not call fetch at all ---
            let fetchCalled = false;
            window.fetch = function () { fetchCalled = true; return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ elements: [] }); } }); };
            return MapMod.fetchStreetsForPolygon([[28, -82], [28.1, -82]], '__DIAG_OVERPASS__').then(function (result4) {
              assert(result4.features.length === 0 && typeof result4.error === 'string', 'a polygon with <3 points returns an error');
              assert(fetchCalled === false, 'a polygon with <3 points does not call fetch at all');
            });
          });
        });
      }).catch(function (err) {
        fail('testOverpassStreetDiscovery async chain threw', err.message);
      }).finally(function () {
        window.fetch = realFetch;
      });
    } catch (err) {
      window.fetch = realFetch;
      fail('testOverpassStreetDiscovery threw synchronously', err.message);
      return Promise.resolve();
    }
  }

  // ---------------------------------------------------------------------
  // TEST: Quiz state machine (mocked — sandboxed, restores real quiz state)
  // ---------------------------------------------------------------------
  function testQuizStateMachine() {
    section('Quiz State Machine (mocked questions)');

    const Quiz = window.FirstDue.Quiz;
    const snapshot = FD.deepClone(Store.state.quiz);

    try {
      // Build a tiny mock queue of "street" targets directly (bypassing map dependency)
      const mockQueue = [
        { id: 'mock_street_1', type: 'Feature', properties: { name: 'Test Lane', boxNumber: '__MOCKBOX__' }, geometry: { type: 'LineString', coordinates: [[0, 0], [0.001, 0.001]] } },
        { id: 'mock_street_2', type: 'Feature', properties: { name: 'Sample Drive', boxNumber: '__MOCKBOX__' }, geometry: { type: 'LineString', coordinates: [[0.001, 0], [0.002, 0.001]] } },
      ];

      Store.quizDispatch('START', { mode: 'name-street', boxNumber: '__MOCKBOX__', queue: mockQueue });
      assert(Store.state.quiz.phase === 'QUIZ_ONGOING', 'START transitions phase to QUIZ_ONGOING');
      assert(Store.state.quiz.totalQuestions === 2, 'START sets totalQuestions from queue length');
      assert(Store.state.quiz.currentTarget && Store.state.quiz.currentTarget.id === 'mock_street_1', 'START sets currentTarget to first queue item');

      // Simulate a CORRECT answer via fuzzy match directly (bypassing DOM/map)
      const target = Store.state.quiz.currentTarget;
      const guess = 'Test Ln'; // should fuzzy-match "Test Lane" (Lane->ln) within tolerance
      const fuzzy = FD.fuzzyMatchStreet(guess, target.properties.name, Store.state.settings.fuzzyTolerance);
      Store.quizDispatch('SUBMIT_ANSWER', {
        result: { correct: fuzzy.isMatch, message: 'mock', distance: fuzzy.distance },
        resultRecord: { mode: 'name-street', targetId: target.id, correct: fuzzy.isMatch },
      });
      assert(Store.state.quiz.phase === 'ANSWER_SUBMITTED', 'SUBMIT_ANSWER transitions phase to ANSWER_SUBMITTED');
      assert(Store.state.quiz.sessionResults.length === 1, 'SUBMIT_ANSWER appends to sessionResults');
      assert(fuzzy.isMatch === true, '"Test Ln" fuzzy-matches "Test Lane" (CORRECT simulated answer)', JSON.stringify(fuzzy));

      // Advance to next question
      Store.quizDispatch('NEXT_QUESTION');
      assert(Store.state.quiz.phase === 'QUIZ_ONGOING', 'NEXT_QUESTION returns to QUIZ_ONGOING when more questions remain');
      assert(Store.state.quiz.questionIndex === 1, 'NEXT_QUESTION increments questionIndex');
      assert(Store.state.quiz.currentTarget.id === 'mock_street_2', 'NEXT_QUESTION advances currentTarget to second queue item');

      // Simulate an INCORRECT answer
      const target2 = Store.state.quiz.currentTarget;
      const badGuess = 'Completely Different Road';
      const fuzzy2 = FD.fuzzyMatchStreet(badGuess, target2.properties.name, Store.state.settings.fuzzyTolerance);
      assert(fuzzy2.isMatch === false, 'unrelated guess does NOT fuzzy-match (INCORRECT simulated answer)', JSON.stringify(fuzzy2));
      Store.quizDispatch('SUBMIT_ANSWER', {
        result: { correct: fuzzy2.isMatch, message: 'mock', distance: fuzzy2.distance },
        resultRecord: { mode: 'name-street', targetId: target2.id, correct: fuzzy2.isMatch },
      });
      assert(Store.state.quiz.sessionResults.length === 2, 'second SUBMIT_ANSWER appends to sessionResults (length=2)');

      // Final NEXT_QUESTION -> RESULTS_SCORE (no more questions)
      Store.quizDispatch('NEXT_QUESTION');
      assert(Store.state.quiz.phase === 'RESULTS_SCORE', 'NEXT_QUESTION transitions to RESULTS_SCORE when queue exhausted');

      // getSessionSummary computes correct percentage (1 correct / 2 total = 50%)
      const summary = Quiz.getSessionSummary();
      assert(summary.total === 2, 'session summary total = 2', JSON.stringify(summary));
      assert(summary.correct === 1, 'session summary correct = 1 (one right, one wrong)', JSON.stringify(summary));
      assert(summary.pct === 50, 'session summary pct = 50%', JSON.stringify(summary));

      // END resets to IDLE
      Store.quizDispatch('END');
      assert(Store.state.quiz.phase === 'IDLE', 'END resets phase to IDLE');
      assert(Store.state.quiz.queue.length === 0, 'END clears the queue');

    } catch (err) {
      fail('Quiz state machine test threw an exception', err.message);
    } finally {
      Store.state.quiz = snapshot;
      Store.emit('quiz:changed', Store.state.quiz);
    }
  }

  function testShuffleAndDuplicateAvoidance() {
    section('Quiz Queue Helpers');

    const Quiz = window.FirstDue.Quiz;
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const shuffled = Quiz._internal.shuffle(arr);
    assert(shuffled.length === arr.length, 'shuffle preserves array length');
    assert(arr.every(function (v) { return shuffled.indexOf(v) !== -1; }), 'shuffle preserves all original elements');
    assert(arr.join(',') === [1,2,3,4,5,6,7,8,9,10].join(','), 'shuffle does not mutate the original array');

    // avoidAdjacentDuplicates: feed a queue with forced adjacent duplicate ids
    const dupQueue = [
      { id: 'a' }, { id: 'a' }, { id: 'b' }, { id: 'c' },
    ];
    const fixed = Quiz._internal.avoidAdjacentDuplicates(dupQueue);
    let hasAdjacentDup = false;
    for (let i = 1; i < fixed.length; i++) {
      if (fixed[i].id === fixed[i - 1].id) hasAdjacentDup = true;
    }
    assert(hasAdjacentDup === false, 'avoidAdjacentDuplicates removes adjacent duplicate ids when alternatives exist', JSON.stringify(fixed));
  }

  // ---------------------------------------------------------------------
  // TEST: GeoJSON import/export round-trip (sandboxed)
  // ---------------------------------------------------------------------
  function testImportExportRoundTrip() {
    section('GeoJSON Import/Export Round-Trip');

    const snapshot = {
      boxes: FD.deepClone(Store.state.boxes),
      streets: FD.deepClone(Store.state.streets),
    };

    try {
      const mockExportInput = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature', id: 'rt_box_1',
            properties: { layerType: 'box', boxNumber: '__RT__', label: 'Round Trip Box' },
            geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 0.01], [0.01, 0.01], [0.01, 0], [0, 0]]] },
          },
          {
            type: 'Feature', id: 'rt_street_1',
            properties: { layerType: 'street', name: 'Round Trip Rd', boxNumber: '__RT__' },
            geometry: { type: 'LineString', coordinates: [[0, 0], [0.01, 0.01]] },
          },
        ],
      };

      Store.importGeoJSON(mockExportInput);
      assert(Store.state.boxes.features.some(function (f) { return f.id === 'rt_box_1'; }), 'importGeoJSON correctly routes Polygon features into boxes');
      assert(Store.state.streets.features.some(function (f) { return f.id === 'rt_street_1'; }), 'importGeoJSON correctly routes LineString features into streets');

      const exported = Store.exportGeoJSON();
      assert(exported.type === 'FirstDueExport', 'exportGeoJSON returns FirstDueExport envelope');
      assert(exported.boxes.features.some(function (f) { return f.id === 'rt_box_1'; }), 'exportGeoJSON includes previously-imported box');

      // Round-trip: re-import the export and confirm idempotence
      Store.importGeoJSON(exported);
      assert(Store.state.boxes.features.filter(function (f) { return f.id === 'rt_box_1'; }).length === 1, 're-importing an export does not duplicate features (exact id match)');

    } catch (err) {
      fail('Import/export round-trip test threw an exception', err.message);
    } finally {
      Store.setBoxes(snapshot.boxes);
      Store.setStreets(snapshot.streets);
    }
  }

  // ---------------------------------------------------------------------
  // TEST: Settings validation bounds
  // ---------------------------------------------------------------------
  function testSettingsBounds() {
    section('Settings Validation');

    assert(FD.clamp(5, 0, 3) === 3, 'clamp(5,0,3) = 3 (upper bound)');
    assert(FD.clamp(-2, 0, 3) === 0, 'clamp(-2,0,3) = 0 (lower bound)');
    assert(FD.clamp(2, 0, 3) === 2, 'clamp(2,0,3) = 2 (within range)');

    const s = Store.state.settings;
    assert(s.homeLat >= -90 && s.homeLat <= 90, 'persisted homeLat within valid range', s.homeLat);
    assert(s.homeLng >= -180 && s.homeLng <= 180, 'persisted homeLng within valid range', s.homeLng);
    assert(s.homeZoom >= 1 && s.homeZoom <= 19, 'persisted homeZoom within valid range', s.homeZoom);
    assert(s.fuzzyTolerance >= 0 && s.fuzzyTolerance <= 3, 'persisted fuzzyTolerance within valid range', s.fuzzyTolerance);
  }

  // ---------------------------------------------------------------------
  // RUN ALL
  // ---------------------------------------------------------------------
  async function runAll() {
    results = [];
    const startTime = performance.now();

    log('FIRST DUE — Diagnostic Test Suite', 'diag-head');
    log('Started: ' + new Date().toISOString(), 'diag-info');

    try { testLevenshtein(); } catch (e) { fail('testLevenshtein crashed', e.message); }
    try { testNormalizeStreetName(); } catch (e) { fail('testNormalizeStreetName crashed', e.message); }
    try { testFuzzyMatch(); } catch (e) { fail('testFuzzyMatch crashed', e.message); }
    try { testGeometryHelpers(); } catch (e) { fail('testGeometryHelpers crashed', e.message); }
    try { testLocalStorage(); } catch (e) { fail('testLocalStorage crashed', e.message); }
    try { testStoreMutators(); } catch (e) { fail('testStoreMutators crashed', e.message); }
    try { testMapRenderMocks(); } catch (e) { fail('testMapRenderMocks crashed', e.message); }
    try { await testOverpassStreetDiscovery(); } catch (e) { fail('testOverpassStreetDiscovery crashed', e.message); }
    try { testQuizStateMachine(); } catch (e) { fail('testQuizStateMachine crashed', e.message); }
    try { testShuffleAndDuplicateAvoidance(); } catch (e) { fail('testShuffleAndDuplicateAvoidance crashed', e.message); }
    try { testImportExportRoundTrip(); } catch (e) { fail('testImportExportRoundTrip crashed', e.message); }
    try { testSettingsBounds(); } catch (e) { fail('testSettingsBounds crashed', e.message); }

    const elapsed = (performance.now() - startTime).toFixed(1);
    const total = results.filter(function (r) { return r.cls === 'diag-pass' || r.cls === 'diag-fail'; }).length;
    const passed = results.filter(function (r) { return r.cls === 'diag-pass'; }).length;
    const failed = results.filter(function (r) { return r.cls === 'diag-fail'; }).length;

    log('', 'diag-info');
    log('────────────────────────────────────', 'diag-head');
    log('TOTAL: ' + total + '  |  PASSED: ' + passed + '  |  FAILED: ' + failed + '  |  ' + elapsed + 'ms', failed === 0 ? 'diag-pass' : 'diag-fail');
    log(failed === 0 ? '✔ ALL TESTS PASSED — system vetted.' : '✘ ' + failed + ' TEST(S) FAILED — review above.', failed === 0 ? 'diag-pass' : 'diag-fail');

    // Console output (per spec: print pass/fail console log confirmation)
    results.forEach(function (r) {
      if (r.cls === 'diag-pass') console.log('[FirstDue Diagnostics]', r.text);
      else if (r.cls === 'diag-fail') console.error('[FirstDue Diagnostics]', r.text);
      else console.info('[FirstDue Diagnostics]', r.text);
    });
    console.log('[FirstDue Diagnostics] SUMMARY:', { total: total, passed: passed, failed: failed, elapsedMs: elapsed });

    return { total: total, passed: passed, failed: failed, results: results };
  }

  function renderToElement(el) {
    el.innerHTML = '';
    results.forEach(function (r) {
      const line = document.createElement('div');
      line.className = r.cls;
      line.textContent = r.text;
      el.appendChild(line);
    });
  }

  // ---------------------------------------------------------------------
  // EXPORTS
  // ---------------------------------------------------------------------
  window.FirstDue = window.FirstDue || {};
  window.FirstDue.Diagnostics = {
    runAll: runAll,
    renderToElement: renderToElement,
    getResults: function () { return results; },
  };

})();
