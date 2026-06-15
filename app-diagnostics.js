// ============================================================================
// BOX RECALL — Box Study & Active Recall App
// app-diagnostics.js — Strict client-side test suite (Step 4)
//
// Mocks map renders, simulates correct/incorrect quiz answers, verifies
// LocalStorage read/write, and prints a pass/fail console log + on-screen
// diagnostic output.
// ============================================================================

(function () {
  'use strict';

  const FD = window.BoxRecall;
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
      const mastery = window.BoxRecall.Map._internal.masteryForBox('__DIAG__');
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

    const MapMod = window.BoxRecall.Map;
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

    const MapMod = window.BoxRecall.Map;
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

        // --- Request shape: GET method with URL-encoded ?data= query (required for CORS compatibility) ---
        let capturedUrl = null;
        let capturedOpts = null;
        window.fetch = function (url, opts) {
          capturedUrl = url;
          capturedOpts = opts;
          return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ elements: [] }); } });
        };
        return MapMod.fetchStreetsForPolygon(verts, '__DIAG_OVERPASS__').then(function () {
          assert(capturedOpts && capturedOpts.method === 'GET', 'Overpass request uses GET (not POST) for CORS compatibility', capturedOpts && capturedOpts.method);
          assert(typeof capturedUrl === 'string' && capturedUrl.indexOf('?data=') !== -1, 'Overpass request URL includes a ?data= query parameter', capturedUrl);
          assert(typeof capturedUrl === 'string' && capturedUrl.indexOf('[') === -1 && capturedUrl.indexOf('"') === -1, 'Overpass query is properly URL-encoded (no raw [ or " characters)', capturedUrl);
          assert(!capturedOpts || !capturedOpts.body, 'GET request has no request body');

          const decodedQuery = decodeURIComponent(capturedUrl.split('?data=')[1]);
          assert(decodedQuery.indexOf('[timeout:60]') !== -1, 'query uses a 60s server-side timeout (raised from 25s to accommodate large real-world polygons)', decodedQuery.substring(0, 40));

          // --- Closing-duplicate-point stripping: a GeoJSON-style ring whose
          // last point repeats the first should be sent to Overpass without
          // that trailing duplicate (avoids a redundant zero-length closing edge).
          const ringWithDup = verts.concat([verts[0]]);
          let dupCapturedUrl = null;
          window.fetch = function (url) { dupCapturedUrl = url; return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ elements: [] }); } }); };
          return MapMod.fetchStreetsForPolygon(ringWithDup, '__DIAG_OVERPASS__').then(function () {
            const dupDecoded = decodeURIComponent(dupCapturedUrl.split('?data=')[1]);
            const polyStr = dupDecoded.match(/poly:"([^"]+)"/)[1];
            const coordCount = polyStr.split(' ').length / 2;
            assert(coordCount === verts.length, 'a ring with a GeoJSON-style closing duplicate point sends only the unique vertices to Overpass (duplicate stripped)', { inputVerts: ringWithDup.length, sentCoords: coordCount, expected: verts.length });

            // --- Overpass "remark" field (HTTP 200 + partial results due to
            // server-side timeout) is detected and surfaced as a warning,
            // WITHOUT discarding whatever partial features were returned. ---
            window.fetch = function () {
              return Promise.resolve({
                ok: true,
                json: function () {
                  return Promise.resolve({
                    remark: 'runtime error: Query timed out in "query" at line 1 after 60 seconds.',
                    elements: [
                      { type: 'way', id: 301, tags: { highway: 'primary', name: 'Partial Result Pkwy' }, geometry: [{ lat: 28.031, lon: -82.448 }, { lat: 28.032, lon: -82.447 }] },
                    ],
                  });
                },
              });
            };
            return MapMod.fetchStreetsForPolygon(verts, '__DIAG_OVERPASS__').then(function (resultRemark) {
              assert(resultRemark.features.length === 1, 'a "remark" (timeout) response still returns whatever partial features were found', resultRemark.features.length);
              assert(typeof resultRemark.error === 'string' && resultRemark.error.toLowerCase().includes('timed out'), 'a "remark" (timeout) response sets an error explaining the lookup was incomplete', resultRemark.error);
              assert(resultRemark.error.toLowerCase().includes('manually'), 'the timeout error suggests adding missing streets manually', resultRemark.error);

              // A response with NO remark field should NOT trigger this path.
              window.fetch = function () {
                return Promise.resolve({
                  ok: true,
                  json: function () {
                    return Promise.resolve({
                      elements: [
                        { type: 'way', id: 302, tags: { highway: 'primary', name: 'Normal Result Pkwy' }, geometry: [{ lat: 28.031, lon: -82.448 }, { lat: 28.032, lon: -82.447 }] },
                      ],
                    });
                  },
                });
              };
              return MapMod.fetchStreetsForPolygon(verts, '__DIAG_OVERPASS__').then(function (resultNoRemark) {
                assert(resultNoRemark.error === null, 'a normal response with no "remark" field returns no error', resultNoRemark.error);

                return continueErrorPathTests();
              });
            });
          });
        });

        function continueErrorPathTests() {
          // --- Error paths: network failure, 429 rate limit, and other non-OK HTTP status ---
          window.fetch = function () { return Promise.reject(new TypeError('mock network failure')); };
          return MapMod.fetchStreetsForPolygon(verts, '__DIAG_OVERPASS__').then(function (result2) {
            assert(result2.features.length === 0 && typeof result2.error === 'string' && result2.error.toLowerCase().includes('manually'), 'network failure returns empty features with a "add manually" message', result2);

            window.fetch = function () { return Promise.resolve({ ok: false, status: 429 }); };
            return MapMod.fetchStreetsForPolygon(verts, '__DIAG_OVERPASS__').then(function (result429) {
              assert(result429.features.length === 0 && result429.error.toLowerCase().includes('rate-limited'), 'HTTP 429 returns a rate-limit-specific message', result429.error);

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
          });
        }
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
  // TEST: Fairfax County GIS box import (input parsing, query construction,
  // feature conversion, and a mocked end-to-end import including the
  // per-box Overpass street lookup). Sandboxed — restores real data after.
  // ---------------------------------------------------------------------
  function testFairfaxImport() {
    section('Fairfax County GIS Box Import');

    const Import = window.BoxRecall.Import;
    if (!Import) {
      fail('Fairfax import module not loaded', 'window.BoxRecall.Import is missing');
      return Promise.resolve();
    }

    // --- Input parsing ---
    let r = Import.parseBoxNumberList('3801, 3802, 3815');
    assert(JSON.stringify(r.numbers) === '[3801,3802,3815]' && r.invalidTokens.length === 0, 'parseBoxNumberList parses a comma-separated list', r);

    r = Import.parseBoxNumberList('3801\n3802  3815,3820');
    assert(JSON.stringify(r.numbers) === '[3801,3802,3815,3820]', 'parseBoxNumberList handles mixed whitespace/newline/comma separators', r);

    r = Import.parseBoxNumberList('3801, abc, 3815');
    assert(JSON.stringify(r.numbers) === '[3801,3815]' && JSON.stringify(r.invalidTokens) === '["abc"]', 'parseBoxNumberList separates invalid tokens from valid numbers', r);

    r = Import.parseBoxNumberList('');
    assert(r.numbers.length === 0 && r.invalidTokens.length === 0, 'parseBoxNumberList("") returns empty arrays');

    assert(Import.parseStationNumber('41') === 41, 'parseStationNumber("41") = 41');
    assert(Import.parseStationNumber(' 41 ') === 41, 'parseStationNumber trims whitespace');
    assert(Import.parseStationNumber('') === null, 'parseStationNumber("") = null');
    assert(Import.parseStationNumber('41.5') === null, 'parseStationNumber rejects non-integers', Import.parseStationNumber('41.5'));

    // --- Where-clause construction ---
    let w = Import.buildWhereClause(41, []);
    assert(w === 'FIRST_DUE = 41 AND FIRE_BOX_NUM <> ' + Import._internal.GOMAPS_BOX_NUM, 'buildWhereClause: station-only excludes GOMAPS box', w);

    w = Import.buildWhereClause(null, [3801, 3802]);
    assert(w === 'FIRE_BOX_NUM IN (3801,3802) AND FIRE_BOX_NUM <> ' + Import._internal.GOMAPS_BOX_NUM, 'buildWhereClause: box-list-only', w);

    w = Import.buildWhereClause(41, [3801, 3802]);
    assert(w === '(FIRST_DUE = 41 OR FIRE_BOX_NUM IN (3801,3802)) AND FIRE_BOX_NUM <> ' + Import._internal.GOMAPS_BOX_NUM, 'buildWhereClause: combined criteria use OR + parens', w);

    assert(Import.buildWhereClause(null, []) === null, 'buildWhereClause returns null when neither criterion is given');

    // --- Feature conversion ---
    const mockArcGisFeature = {
      type: 'Feature',
      properties: { FIRE_BOX_NUM: 3801.0, FIRE_BOX_TEXT: 'IONA SOUND DR AREA', FIRST_DUE: 41, BATTALION: '4B2', DIVISION: '420', JURISDICTION: 'FAIRFAX COUNTY', BOX_TYPE: null },
      geometry: { type: 'Polygon', coordinates: [[[-77.1, 38.8], [-77.1, 38.81], [-77.09, 38.81], [-77.09, 38.8], [-77.1, 38.8]]] },
    };
    const converted = Import._internal.convertFairfaxFeatureToBoxFeature(mockArcGisFeature);
    assert(!!converted, 'convertFairfaxFeatureToBoxFeature converts a valid ArcGIS feature');
    if (converted) {
      assert(converted.properties.boxNumber === '3801', 'converted boxNumber normalizes 3801.0 -> "3801"', converted.properties.boxNumber);
      assert(converted.properties.label === 'IONA SOUND DR AREA', 'converted label uses FIRE_BOX_TEXT', converted.properties.label);
      assert(converted.properties.layerType === 'box', 'converted feature has layerType "box"');
      assert(converted.properties.source === 'fairfax-frd', 'converted feature is tagged source="fairfax-frd"');
      assert(!converted.id, 'converted feature has no id (assigned by caller at persist time)');
    }

    const lineFeature = { type: 'Feature', properties: { FIRE_BOX_NUM: 1 }, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } };
    assert(Import._internal.convertFairfaxFeatureToBoxFeature(lineFeature) === null, 'non-polygon geometry is rejected (returns null)');

    const noBoxNum = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]] } };
    assert(Import._internal.convertFairfaxFeatureToBoxFeature(noBoxNum) === null, 'feature with no FIRE_BOX_NUM is rejected (returns null)');

    // --- Mocked end-to-end: fetchFairfaxFireBoxes + persistBoxWithStreetLookup (sandboxed) ---
    const UI = window.BoxRecall.UI;
    if (!UI || !UI.persistBoxWithStreetLookup) {
      fail('persistBoxWithStreetLookup not exported', 'window.BoxRecall.UI.persistBoxWithStreetLookup is missing — skipping end-to-end import test');
      return Promise.resolve();
    }

    const snapshot = {
      boxes: FD.deepClone(Store.state.boxes),
      streets: FD.deepClone(Store.state.streets),
    };
    const realFetch = window.fetch;

    try {
      // First call (Fairfax query) returns one box with FIRE_BOX_NUM 444444
      // (a number unlikely to collide with the user's real data); second+
      // calls (Overpass, via fetchStreetsForPolygon) return one named street.
      let fetchCallCount = 0;
      window.fetch = function (url) {
        fetchCallCount++;
        if (typeof url === 'string' && url.indexOf('fairfaxcounty.gov') !== -1) {
          return Promise.resolve({
            ok: true,
            json: function () {
              return Promise.resolve({
                type: 'FeatureCollection',
                features: [{
                  type: 'Feature',
                  properties: { FIRE_BOX_NUM: 444444.0, FIRE_BOX_TEXT: 'DIAG IMPORT BOX', FIRST_DUE: 99, BATTALION: '9B9', DIVISION: '999', JURISDICTION: 'TEST', BOX_TYPE: null },
                  geometry: { type: 'Polygon', coordinates: [[[-77.10, 38.80], [-77.10, 38.81], [-77.09, 38.81], [-77.09, 38.80], [-77.10, 38.80]]] },
                }],
              });
            },
          });
        }
        // Overpass (or any other) call: return one named residential way.
        return Promise.resolve({
          ok: true,
          json: function () {
            return Promise.resolve({
              elements: [
                { type: 'way', id: 5001, tags: { highway: 'residential', name: 'Diag Import Ave' }, geometry: [{ lat: 38.805, lon: -77.099 }, { lat: 38.806, lon: -77.098 }] },
              ],
            });
          },
        });
      };

      return Import.fetchFairfaxFireBoxes(99, []).then(function (result) {
        assert(result.error === null, 'mocked fetchFairfaxFireBoxes returns no error', result.error);
        assert(result.features.length === 1, 'mocked fetchFairfaxFireBoxes returns 1 converted box feature', result.features.length);

        const feature = result.features[0];
        if (!feature) return;

        feature.id = FD.genId('box');
        assert(feature.properties.boxNumber === '444444', 'imported feature has the expected boxNumber', feature.properties.boxNumber);
        assert(window.BoxRecall.Map.findBoxByNumber('444444') === undefined, 'sandbox box number 444444 does not collide with existing data before persist');

        return UI.persistBoxWithStreetLookup(feature, { silent: true, skipRender: true }).then(function (persistResult) {
          assert(persistResult.addedStreets === 1, 'persistBoxWithStreetLookup adds 1 street from the mocked Overpass response', persistResult);
          assert(persistResult.streetError === null, 'persistBoxWithStreetLookup reports no street error', persistResult.streetError);

          const savedBox = window.BoxRecall.Map.findBoxByNumber('444444');
          assert(!!savedBox && savedBox.properties.source === 'fairfax-frd', 'imported box is persisted with source="fairfax-frd"', savedBox && savedBox.properties);

          const savedStreets = window.BoxRecall.Quiz.streetsForBox('444444');
          assert(savedStreets.length === 1 && savedStreets[0].properties.name === 'Diag Import Ave', 'imported box has its auto-discovered street persisted', savedStreets);

          assert(fetchCallCount >= 2, 'both the Fairfax GIS query and the Overpass street lookup were called', fetchCallCount);
        });
      }).catch(function (err) {
        fail('testFairfaxImport async chain threw', err.message);
      }).finally(function () {
        window.fetch = realFetch;
        Store.setBoxes(snapshot.boxes);
        Store.setStreets(snapshot.streets);
      });
    } catch (err) {
      window.fetch = realFetch;
      Store.setBoxes(snapshot.boxes);
      Store.setStreets(snapshot.streets);
      fail('testFairfaxImport threw synchronously', err.message);
      return Promise.resolve();
    }
  }

  // ---------------------------------------------------------------------
  // TEST: split-street dedup fix (mocked Overpass — sandboxed)
  // ---------------------------------------------------------------------
  /**
   * Regression test for a bug where boxes ended up missing streets that
   * ARE inside their polygon: when OSM splits a single named street into
   * multiple disconnected segments (interrupted by a different road, a
   * loop, a gap — common for ordinary residential streets), Overpass
   * returns each segment as its own way. mergeAdjacentNamedWays correctly
   * keeps these as separate chains (they don't share an endpoint), but the
   * within-import duplicate-name+midpoint check in
   * persistBoxWithStreetLookup previously compared each new street against
   * streets ALREADY ADDED EARLIER IN THE SAME IMPORT — so if two segments
   * of "Main St" had midpoints within ~30m of each other (easy for a
   * street with a short gap), the second was treated as a duplicate of the
   * first and silently dropped, even on a brand-new box with zero
   * pre-existing streets.
   *
   * Fixed by making the duplicate check compare only against streets that
   * existed in the database BEFORE this import started. This test mocks
   * Overpass to return two same-named, nearby-but-disconnected ways plus
   * one unrelated street, and confirms ALL THREE are persisted.
   */
  function testSplitStreetDedup() {
    section('Split-Street Dedup Fix');

    const UI = window.BoxRecall.UI;
    if (!UI || !UI.saveNewBoxWithStreetLookup) {
      fail('saveNewBoxWithStreetLookup not exported', 'window.BoxRecall.UI.saveNewBoxWithStreetLookup is missing — skipping');
      return Promise.resolve();
    }

    const snapshot = {
      boxes: FD.deepClone(Store.state.boxes),
      streets: FD.deepClone(Store.state.streets),
    };
    const realFetch = window.fetch;

    try {
      window.fetch = function () {
        return Promise.resolve({
          ok: true,
          json: function () {
            return Promise.resolve({
              elements: [
                // "Main St" split into two disconnected segments ~17m
                // apart (well under the ~30m STREET_DUPLICATE_TOLERANCE_DEG),
                // no shared endpoint -- genuinely distinct street segments.
                { type: 'way', id: 9001, tags: { highway: 'residential', name: 'Main St' }, geometry: [{ lat: 39.0500, lon: -76.9500 }, { lat: 39.0505, lon: -76.9500 }] },
                { type: 'way', id: 9002, tags: { highway: 'residential', name: 'Main St' }, geometry: [{ lat: 39.0500, lon: -76.9498 }, { lat: 39.0505, lon: -76.9498 }] },
                // Unrelated street, far away.
                { type: 'way', id: 9003, tags: { highway: 'residential', name: 'Oak Ave' }, geometry: [{ lat: 39.0600, lon: -76.9600 }, { lat: 39.0605, lon: -76.9600 }] },
              ],
            });
          },
        });
      };

      const verts = [[39.045, -76.955], [39.045, -76.943], [39.065, -76.943], [39.065, -76.955]]; // [lat,lng]

      return UI.saveNewBoxWithStreetLookup(verts, '__DIAG_SPLIT_STREET__', 'Diag Split Street Box').then(function () {
        const streets = window.BoxRecall.Quiz.streetsForBox('__DIAG_SPLIT_STREET__');
        const mainSt = streets.filter(function (f) { return f.properties.name === 'Main St'; });
        const oakAve = streets.filter(function (f) { return f.properties.name === 'Oak Ave'; });

        assert(streets.length === 3, 'all 3 streets are persisted (none dropped as a false duplicate)', streets.length);
        assert(mainSt.length === 2, 'both "Main St" segments are kept as distinct streets', mainSt.length);
        assert(oakAve.length === 1, '"Oak Ave" is also persisted', oakAve.length);

        const mainStOsmIds = mainSt.map(function (f) { return (f.properties.osmIds || []).join(','); }).sort();
        assert(mainStOsmIds.join('|') === '9001|9002', 'the two "Main St" features correspond to the two distinct OSM way ids', mainStOsmIds);
      }).catch(function (err) {
        fail('testSplitStreetDedup async chain threw', err.message);
      }).finally(function () {
        window.fetch = realFetch;
        Store.setBoxes(snapshot.boxes);
        Store.setStreets(snapshot.streets);
      });
    } catch (err) {
      window.fetch = realFetch;
      Store.setBoxes(snapshot.boxes);
      Store.setStreets(snapshot.streets);
      fail('testSplitStreetDedup threw synchronously', err.message);
      return Promise.resolve();
    }
  }

  // ---------------------------------------------------------------------
  // TEST: Overpass zero-result signals (mocked — sandboxed)
  // ---------------------------------------------------------------------
  /**
   * persistBoxWithStreetLookup distinguishes three "0 streets added, no
   * HTTP/timeout error" cases via rawElementCount/rawWayCount, each with a
   * different toast:
   *   1. rawElementCount === 0 — Overpass returned HTTP 200 with ZERO
   *      elements and no error/remark. For a populated area this is
   *      suspicious: could be a genuinely empty area, but could also be
   *      Overpass silently declining the request (soft rate-limit / abuse
   *      detection returning empty results rather than a 429). Framed as
   *      "0 results, no error reported... may be a temporary lookup
   *      issue" so it's distinguishable from "this area has no streets."
   *   2. rawElementCount > 0, rawWayCount === 0 — Overpass returned data,
   *      but none of it matched our street-type/name filters (e.g. only
   *      footways). More benign — "found data, but no named streets
   *      matching our road types."
   *   3. rawWayCount > 0, addedStreets === 0 — candidates were found, but
   *      all were deduped against streets already saved for this box.
   *      "found N streets... but all were already present."
   *
   * Each case is mocked directly via window.fetch and checked against
   * persistBoxWithStreetLookup's return value AND its toast text/type.
   */
  function testOverpassZeroResultSignals() {
    section('Overpass Zero-Result Signals');

    const UI = window.BoxRecall.UI;
    const Toast = FD.Toast;
    if (!UI || !UI.persistBoxWithStreetLookup) {
      fail('persistBoxWithStreetLookup not exported', 'window.BoxRecall.UI.persistBoxWithStreetLookup is missing — skipping');
      return Promise.resolve();
    }

    const snapshot = {
      boxes: FD.deepClone(Store.state.boxes),
      streets: FD.deepClone(Store.state.streets),
    };
    const realFetch = window.fetch;
    const realToastShow = Toast.show;

    function withCapturedToasts(fn) {
      const toasts = [];
      Toast.show = function (msg, type, opts) {
        toasts.push({ msg: msg, type: type });
        return realToastShow.call(Toast, msg, type, opts);
      };
      return fn().finally(function () { Toast.show = realToastShow; }).then(function (result) {
        return { result: result, toasts: toasts };
      });
    }

    function mockBoxFeature(boxNumber) {
      return {
        type: 'Feature', id: FD.genId('box'),
        properties: { layerType: 'box', boxNumber: boxNumber, label: 'Diag Zero-Result Box', source: 'manual' },
        geometry: { type: 'Polygon', coordinates: [[[-77.5, 38.5], [-77.49, 38.5], [-77.49, 38.51], [-77.5, 38.51], [-77.5, 38.5]]] },
      };
    }

    function cleanupBox(boxNumber) {
      const box = window.BoxRecall.Map.findBoxByNumber(boxNumber);
      if (box) Store.removeBox(box.id);
    }

    return Promise.resolve()
      // --- Case 1: rawElementCount === 0 (HTTP 200, zero elements) ---
      .then(function () {
        window.fetch = function () {
          return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ elements: [] }); } });
        };
        return withCapturedToasts(function () {
          return UI.persistBoxWithStreetLookup(mockBoxFeature('__DIAG_ZERO_1__'), {});
        }).then(function (outcome) {
          assert(outcome.result.rawElementCount === 0, 'case 1: rawElementCount is 0 for an empty Overpass response', outcome.result.rawElementCount);
          assert(outcome.result.rawWayCount === 0, 'case 1: rawWayCount is 0', outcome.result.rawWayCount);
          assert(outcome.result.addedStreets === 0, 'case 1: addedStreets is 0', outcome.result.addedStreets);
          assert(outcome.result.streetError === null, 'case 1: streetError is null (this is NOT an HTTP/timeout error)', outcome.result.streetError);

          const warnToast = outcome.toasts.find(function (t) { return t.type === 'warn'; });
          assert(!!warnToast && /0 results.*no error reported/i.test(warnToast.msg), 'case 1: shows a "0 results, no error reported" warning toast', warnToast);
          assert(!!warnToast && /temporary lookup issue/i.test(warnToast.msg), 'case 1: toast suggests this may be a temporary lookup issue (not "this area has no streets")', warnToast);

          cleanupBox('__DIAG_ZERO_1__');
        });
      })
      // --- Case 2: rawElementCount > 0, rawWayCount === 0 (data, but filtered out) ---
      .then(function () {
        window.fetch = function () {
          return Promise.resolve({
            ok: true,
            json: function () {
              return Promise.resolve({
                elements: [
                  { type: 'way', id: 8001, tags: { highway: 'footway', name: 'Some Path' }, geometry: [{ lat: 38.5, lon: -77.5 }, { lat: 38.501, lon: -77.5 }] },
                ],
              });
            },
          });
        };
        return withCapturedToasts(function () {
          return UI.persistBoxWithStreetLookup(mockBoxFeature('__DIAG_ZERO_2__'), {});
        }).then(function (outcome) {
          assert(outcome.result.rawElementCount === 1, 'case 2: rawElementCount is 1 (Overpass returned data)', outcome.result.rawElementCount);
          assert(outcome.result.rawWayCount === 0, 'case 2: rawWayCount is 0 (footway does not match our highway-type filter)', outcome.result.rawWayCount);
          assert(outcome.result.addedStreets === 0, 'case 2: addedStreets is 0', outcome.result.addedStreets);

          const warnToast = outcome.toasts.find(function (t) { return t.type === 'warn'; });
          assert(!!warnToast && /found data.*no named streets matching/i.test(warnToast.msg), 'case 2: shows a distinct "found data, but no matching road types" toast', warnToast);
          assert(!!warnToast && !/no error reported/i.test(warnToast.msg), 'case 2: does NOT use case 1\'s "no error reported" phrasing (these are different situations)', warnToast);

          cleanupBox('__DIAG_ZERO_2__');
        });
      })
      // --- Case 3: rawWayCount > 0, but all deduped against pre-existing streets ---
      .then(function () {
        const boxNumber = '__DIAG_ZERO_3__';
        const existingStreet = {
          type: 'Feature', id: FD.genId('street'),
          properties: { layerType: 'street', name: 'Main St', boxNumber: boxNumber, source: 'osm', osmIds: [8101] },
          geometry: { type: 'LineString', coordinates: [[-77.5, 38.5], [-77.4995, 38.5005]] },
        };
        Store.addStreet(existingStreet);

        window.fetch = function () {
          return Promise.resolve({
            ok: true,
            json: function () {
              return Promise.resolve({
                elements: [
                  { type: 'way', id: 8101, tags: { highway: 'residential', name: 'Main St' }, geometry: [{ lat: 38.5, lon: -77.5 }, { lat: 38.5005, lon: -77.4995 }] },
                ],
              });
            },
          });
        };
        return withCapturedToasts(function () {
          return UI.persistBoxWithStreetLookup(mockBoxFeature(boxNumber), {});
        }).then(function (outcome) {
          assert(outcome.result.rawElementCount === 1, 'case 3: rawElementCount is 1', outcome.result.rawElementCount);
          assert(outcome.result.rawWayCount === 1, 'case 3: rawWayCount is 1 (a candidate WAS found)', outcome.result.rawWayCount);
          assert(outcome.result.addedStreets === 0, 'case 3: addedStreets is 0 (it was a duplicate)', outcome.result.addedStreets);
          assert(outcome.result.skippedDupeStreets === 1, 'case 3: skippedDupeStreets is 1', outcome.result.skippedDupeStreets);

          const infoToast = outcome.toasts.find(function (t) { return t.type === 'info' && /already present/i.test(t.msg); });
          assert(!!infoToast && /found 1 street.*all was already present/i.test(infoToast.msg), 'case 3: shows an "found N streets, but all were already present" info toast', infoToast);

          cleanupBox(boxNumber);
          Store.removeStreet(existingStreet.id);
        });
      })
      .catch(function (err) {
        fail('testOverpassZeroResultSignals threw', err.message);
      })
      .finally(function () {
        window.fetch = realFetch;
        Toast.show = realToastShow;
        Store.setBoxes(snapshot.boxes);
        Store.setStreets(snapshot.streets);
      });
  }

  // ---------------------------------------------------------------------
  // TEST: Quiz state machine (mocked — sandboxed, restores real quiz state)
  // ---------------------------------------------------------------------
  function testQuizStateMachine() {
    section('Quiz State Machine (mocked questions)');

    const Quiz = window.BoxRecall.Quiz;
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

    const Quiz = window.BoxRecall.Quiz;
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
      assert(exported.type === 'BoxRecallExport', 'exportGeoJSON returns BoxRecallExport envelope');
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

    const MapMod = window.BoxRecall.Map;
    assert(typeof s.basemap === 'string' && !!MapMod.BASEMAPS[s.basemap], 'persisted basemap is a recognized key', s.basemap);
  }

  // ---------------------------------------------------------------------
  // TEST: Basemap switching (satellite/light/dark config, getBasemap,
  // setBasemap, fallback for unrecognized keys). Sandboxed — restores the
  // original basemap setting afterward.
  // ---------------------------------------------------------------------
  function testBasemapSwitching() {
    section('Basemap Switching');

    const MapMod = window.BoxRecall.Map;
    const originalBasemap = Store.state.settings.basemap;
    let lastAppliedKey = originalBasemap; // tracks what the live map's tiles currently reflect

    try {
      // --- Config shape: every basemap has a base layer with url/attribution, and a label/icon ---
      assert(Array.isArray(MapMod.BASEMAP_ORDER) && MapMod.BASEMAP_ORDER.length >= 2, 'BASEMAP_ORDER lists at least 2 basemaps', MapMod.BASEMAP_ORDER);
      MapMod.BASEMAP_ORDER.forEach(function (key) {
        const meta = MapMod.BASEMAPS[key];
        assert(!!meta, 'BASEMAP_ORDER entry "' + key + '" has a corresponding BASEMAPS config', key);
        if (!meta) return;
        assert(typeof meta.label === 'string' && meta.label.length > 0, 'basemap "' + key + '" has a non-empty label', meta.label);
        assert(typeof meta.icon === 'string' && meta.icon.length > 0, 'basemap "' + key + '" has an icon name', meta.icon);
        assert(!!meta.base && typeof meta.base.url === 'string' && meta.base.url.indexOf('{z}') !== -1, 'basemap "' + key + '" base layer URL is a tile template containing {z}', meta.base && meta.base.url);
        assert(!!meta.base && typeof meta.base.attribution === 'string' && meta.base.attribution.length > 0, 'basemap "' + key + '" base layer has a non-empty attribution', meta.base && meta.base.attribution);
        if (meta.labels) {
          assert(typeof meta.labels.url === 'string' && meta.labels.url.indexOf('{z}') !== -1, 'basemap "' + key + '" labels layer URL is a tile template containing {z}', meta.labels.url);
        }
      });

      // --- satellite config specifically: imagery + labels overlay (the combination requested for visibility) ---
      const sat = MapMod.BASEMAPS.satellite;
      assert(!!sat, 'a "satellite" basemap is configured');
      if (sat) {
        assert(!!sat.labels, 'satellite basemap includes a labels overlay layer (so street/place names remain visible over imagery)', sat.labels);
        assert(sat.base.url.indexOf('World_Imagery') !== -1, 'satellite base layer uses Esri World Imagery service', sat.base.url);
      }

      // --- getBasemap() returns the current persisted key ---
      Store.setSettings({ basemap: 'dark' });
      assert(MapMod.getBasemap() === 'dark', 'getBasemap() reflects Store.state.settings.basemap after a direct settings change');

      // --- getBasemap() falls back to DEFAULT_BASEMAP for an unrecognized persisted value ---
      Store.setSettings({ basemap: '__not_a_real_basemap__' });
      const fallback = MapMod.getBasemap();
      assert(!!MapMod.BASEMAPS[fallback], 'getBasemap() falls back to a valid key when the persisted value is unrecognized', fallback);

      // --- setBasemap() persists a valid key, reloads live tiles when the key changes, and is idempotent for the same key ---
      Store.setSettings({ basemap: 'light' });
      MapMod.setBasemap('dark');
      lastAppliedKey = 'dark';
      assert(Store.state.settings.basemap === 'dark', 'setBasemap("dark") persists to Store.state.settings.basemap');

      MapMod.setBasemap('dark'); // no-op, same key — live tiles remain on 'dark'
      assert(Store.state.settings.basemap === 'dark', 'setBasemap() with the already-active key is a harmless no-op');

      // --- setBasemap() with an unrecognized key falls back to DEFAULT_BASEMAP rather than persisting garbage ---
      MapMod.setBasemap('__bogus__');
      lastAppliedKey = MapMod.getBasemap();
      assert(!!MapMod.BASEMAPS[Store.state.settings.basemap], 'setBasemap() with an unrecognized key results in a valid persisted basemap', Store.state.settings.basemap);

    } catch (err) {
      fail('testBasemapSwitching threw an exception', err.message);
    } finally {
      // Restore the live map to its pre-test basemap. setBasemap() only
      // reloads tiles when the requested key differs from the current
      // persisted value, so call it while lastAppliedKey is still current
      // to guarantee the reload actually fires (when needed).
      if (lastAppliedKey !== originalBasemap && Store.state.mapReady) {
        MapMod.setBasemap(originalBasemap);
      }
      // Always ensure the persisted setting matches, even if mapReady is
      // false (setBasemap no-ops without a live map in that case).
      Store.setSettings({ basemap: originalBasemap });
    }
  }

  /**
   * 7 always-JS-toggled elements (modals, banners, the quiz overlay, the
   * drawing banner) use the native HTML `hidden` ATTRIBUTE to control
   * visibility, rather than a `.hidden` CSS class. The hidden attribute has
   * built-in browser-default display:none — no CSS needed from us or
   * Tailwind — so these elements hide correctly even if Tailwind's CDN is
   * unreachable (previously, hide/show relied entirely on Tailwind's
   * `.hidden{display:none}`, and a slow/blocked CDN meant ALL of these
   * elements rendered simultaneously: the cause of "leftover drawing
   * banner" / "duplicate header" / stacked-modal symptoms).
   *
   * This deliberately does NOT apply to #sidebar or the desktop
   * map-controls bar, which use Tailwind's `hidden md:flex` responsive
   * CLASS pattern (hidden on mobile, shown via a breakpoint override on
   * desktop) — those continue to depend on Tailwind as before, since the
   * hidden ATTRIBUTE and hidden CLASS are independent and don't collide.
   *
   * SECOND FIX (this revision): several of these elements also carry a
   * `flex` class for their shown layout. On a live page with Tailwind v4,
   * `.flex` lives in `@layer utilities` and/or may be `!important`
   * (Tailwind's `important` config flag) — either can make `.flex` beat a
   * plain `[hidden]{display:none}` regardless of [hidden]'s higher
   * specificity, since cascade layers resolve before specificity and
   * !important rules are compared separately. Fixed via
   * `div[hidden], input[hidden] { display: none !important; }` —
   * !important rules ARE compared by specificity among themselves (0,1,1
   * beats 0,1,0), and an unlayered !important rule beats anything in any
   * layer. This is scoped to the hidden ATTRIBUTE specifically, which
   * #sidebar (class="hidden md:flex", no hidden attribute) can never
   * match — so it can't re-trigger the earlier regression where a blanket
   * `.hidden{display:none!important}` CLASS rule defeated #sidebar's
   * `md:flex`. See the probe tests below, which reproduce all three ways
   * .flex can be defined and confirm [hidden] wins in each.
   */
  function testHiddenClassEnforcement() {
    section('Hidden Attribute Enforcement');

    if (typeof document === 'undefined') {
      log('Skipped (no document available)', 'diag-info');
      return;
    }

    // A bare element with the hidden ATTRIBUTE should compute to
    // display:none with zero CSS from us or Tailwind — this is a browser
    // built-in, which is the whole point of using it here.
    const probe = document.createElement('div');
    probe.hidden = true;
    probe.id = '__diag_hidden_probe__';
    document.body.appendChild(probe);
    try {
      const display = window.getComputedStyle(probe).display;
      assert(display === 'none', 'the hidden attribute results in display:none via computed style (browser built-in, no CSS required)', display);
    } finally {
      probe.remove();
    }

    // Spot-check the real always-JS-toggled elements: each should be using
    // the hidden ATTRIBUTE (not a .hidden class) for its current
    // hidden/shown state, and that attribute should be effective.
    ['draw-banner', 'settings-modal', 'quiz-overlay', 'map-error-banner', 'diagnostics-modal', 'active-box-pill', 'input-import-geojson'].forEach(function (id) {
      const el = document.getElementById(id);
      if (!el) { fail('#' + id + ' exists in the DOM', 'not found'); return; }
      assert(!el.classList.contains('hidden'), '#' + id + ' does not use the .hidden CLASS (uses the hidden ATTRIBUTE instead)', el.className);
      if (el.hidden) {
        assert(window.getComputedStyle(el).display === 'none', '#' + id + ' with the hidden attribute computes to display:none', window.getComputedStyle(el).display);
      } else {
        log('#' + id + ' currently visible (hidden=false) — not asserting display:none; expected if its show-condition is active', 'diag-info');
      }
    });

    // #sidebar and the desktop map-controls bar should be UNCHANGED —
    // still using Tailwind's hidden/md:flex responsive class pattern, not
    // the hidden attribute (they're never JS-toggled).
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      assert(sidebar.classList.contains('hidden') && sidebar.classList.contains('md:flex'), '#sidebar still uses the hidden/md:flex responsive class pattern (untouched by the hidden-attribute change)', sidebar.className);
      assert(sidebar.hidden === false, '#sidebar does not have the hidden attribute set (visibility is purely class/breakpoint-driven)', sidebar.hidden);
    } else {
      fail('#sidebar exists in the DOM', 'not found');
    }

    // --- [hidden] vs .flex, across the ways .flex can be defined ---
    // Several real elements (settings-modal, quiz-overlay, map-error-banner,
    // diagnostics-modal, active-box-pill) carry `flex` in their shown-state
    // class list. On a live page with Tailwind v4 (cdn.tailwindcss.com),
    // .flex is emitted inside `@layer utilities`, and/or (with Tailwind's
    // `important` config flag) as `!important`. Either can make .flex win
    // over a plain [hidden]{display:none} regardless of [hidden]'s higher
    // specificity (0,1,1 vs 0,1,0) — cascade layers are resolved BEFORE
    // specificity, and !important rules are compared separately. The fix is
    // div[hidden]/input[hidden] with !important: !important rules ARE
    // compared by specificity among themselves, so our (0,1,1) beats a
    // plain or !important (0,1,0) .flex either way, and an unlayered
    // !important rule beats anything in any layer (the one exception to
    // "unlayered loses to layered" that both layers and Tailwind docs call
    // out). This test reproduces all three .flex definitions and confirms
    // a hidden div with that class still computes to display:none in each.
    const probeStyle = document.createElement('style');
    probeStyle.textContent =
      '.__diag_flex_plain__ { display: flex; }' +
      '.__diag_flex_important__ { display: flex !important; }' +
      '@layer __diag_test_layer__ { .__diag_flex_layered__ { display: flex; } }';
    document.head.appendChild(probeStyle);

    [
      { cls: '__diag_flex_plain__', label: 'a plain .flex class' },
      { cls: '__diag_flex_important__', label: 'an !important .flex class (Tailwind "important" config flag)' },
      { cls: '__diag_flex_layered__', label: 'a .flex class inside @layer (Tailwind v4 utilities layer)' },
    ].forEach(function (probeDef) {
      const el = document.createElement('div');
      el.id = '__diag_hidden_probe_' + probeDef.cls;
      el.className = probeDef.cls;
      el.hidden = true;
      document.body.appendChild(el);
      try {
        const hiddenDisplay = window.getComputedStyle(el).display;
        assert(hiddenDisplay === 'none', 'a hidden <div> with ' + probeDef.label + ' still computes to display:none', hiddenDisplay);

        el.hidden = false;
        const shownDisplay = window.getComputedStyle(el).display;
        assert(shownDisplay === 'flex', 'once hidden=false, ' + probeDef.label + ' applies normally (display:flex)', shownDisplay);
      } finally {
        el.remove();
      }
    });

    probeStyle.remove();
  }

  // ---------------------------------------------------------------------
  // RUN ALL
  // ---------------------------------------------------------------------
  async function runAll() {
    results = [];
    const startTime = performance.now();

    log('BOX RECALL — Diagnostic Test Suite', 'diag-head');
    log('Started: ' + new Date().toISOString(), 'diag-info');

    try { testLevenshtein(); } catch (e) { fail('testLevenshtein crashed', e.message); }
    try { testNormalizeStreetName(); } catch (e) { fail('testNormalizeStreetName crashed', e.message); }
    try { testFuzzyMatch(); } catch (e) { fail('testFuzzyMatch crashed', e.message); }
    try { testGeometryHelpers(); } catch (e) { fail('testGeometryHelpers crashed', e.message); }
    try { testLocalStorage(); } catch (e) { fail('testLocalStorage crashed', e.message); }
    try { testStoreMutators(); } catch (e) { fail('testStoreMutators crashed', e.message); }
    try { testMapRenderMocks(); } catch (e) { fail('testMapRenderMocks crashed', e.message); }
    try { await testOverpassStreetDiscovery(); } catch (e) { fail('testOverpassStreetDiscovery crashed', e.message); }
    try { await testFairfaxImport(); } catch (e) { fail('testFairfaxImport crashed', e.message); }
    try { await testSplitStreetDedup(); } catch (e) { fail('testSplitStreetDedup crashed', e.message); }
    try { await testOverpassZeroResultSignals(); } catch (e) { fail('testOverpassZeroResultSignals crashed', e.message); }
    try { testQuizStateMachine(); } catch (e) { fail('testQuizStateMachine crashed', e.message); }
    try { testShuffleAndDuplicateAvoidance(); } catch (e) { fail('testShuffleAndDuplicateAvoidance crashed', e.message); }
    try { testImportExportRoundTrip(); } catch (e) { fail('testImportExportRoundTrip crashed', e.message); }
    try { testSettingsBounds(); } catch (e) { fail('testSettingsBounds crashed', e.message); }
    try { testBasemapSwitching(); } catch (e) { fail('testBasemapSwitching crashed', e.message); }
    try { testHiddenClassEnforcement(); } catch (e) { fail('testHiddenClassEnforcement crashed', e.message); }

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
      if (r.cls === 'diag-pass') console.log('[BoxRecall Diagnostics]', r.text);
      else if (r.cls === 'diag-fail') console.error('[BoxRecall Diagnostics]', r.text);
      else console.info('[BoxRecall Diagnostics]', r.text);
    });
    console.log('[BoxRecall Diagnostics] SUMMARY:', { total: total, passed: passed, failed: failed, elapsedMs: elapsed });

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
  window.BoxRecall = window.BoxRecall || {};
  window.BoxRecall.Diagnostics = {
    runAll: runAll,
    renderToElement: renderToElement,
    getResults: function () { return results; },
  };

})();
