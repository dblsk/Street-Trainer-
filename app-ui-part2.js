// ============================================================================
// BOX RECALL — Box Study & Active Recall App
// app-ui-part2.js — Quiz overlay (map bottom bar), dynamic action dispatch
// ============================================================================

(function () {
  'use strict';

  const FD = window.BoxRecall;
  const Store = FD.Store;
  const Toast = FD.Toast;
  const esc = FD.escapeHtml;
  const UI = window.BoxRecall.UI;

  // ---------------------------------------------------------------------
  // QUIZ MAP OVERLAY (bottom bar over the map — question + answer input)
  // ---------------------------------------------------------------------

  function renderQuizOverlay() {
    const overlay = document.getElementById('quiz-overlay');
    if (!overlay) return;
    const quiz = Store.state.quiz;

    if (quiz.phase === 'IDLE' || quiz.phase === 'RESULTS_SCORE') {
      overlay.hidden = true;
      overlay.innerHTML = '';
      return;
    }

    overlay.hidden = false;

    const target = quiz.currentTarget;
    let questionHtml = '';
    let answerHtml = '';

    if (quiz.mode === 'name-street') {
      questionHtml = '<p class="text-sm text-ink-100 mb-2">What is the name of the highlighted street?</p>';
      if (quiz.phase === 'QUIZ_ONGOING') {
        answerHtml = '<div class="flex gap-2">' +
          '<input id="quiz-answer-input" type="text" autocomplete="off" autocapitalize="words" placeholder="Type street name…" ' +
          'class="flex-1 bg-base-800 border border-base-600 rounded px-3 py-2.5 font-mono text-sm focus:border-alert-cyan/60" />' +
          '<button data-action="submit-name-street" class="px-4 py-2.5 rounded bg-alert-cyan/15 border border-alert-cyan/40 text-alert-cyan font-display font-600 uppercase tracking-wide text-xs hover:bg-alert-cyan/25 transition-colors">Submit</button>' +
          '</div>';
      } else {
        answerHtml = resultRow(quiz.lastResult);
      }
    } else if (quiz.mode === 'locate-street') {
      const targetName = (target && target.properties && target.properties.name) || '';
      questionHtml = '<p class="text-sm text-ink-100 mb-2">Where is <span class="font-mono font-700 text-alert-green">' + esc(targetName) + '</span>? Tap it on the map.</p>';
      if (quiz.phase === 'ANSWER_SUBMITTED') {
        answerHtml = resultRow(quiz.lastResult);
      } else {
        answerHtml = '<p class="text-[11px] text-ink-500 font-mono">Tap the highlighted box area where you believe this street is.</p>';
      }
    } else if (quiz.mode === 'box-identifier') {
      questionHtml = '<p class="text-sm text-ink-100 mb-2">Which Response Box is the dropped pin located in?</p>';
      if (quiz.phase === 'QUIZ_ONGOING') {
        const boxes = Store.state.boxes.features;
        answerHtml = '<div class="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">';
        boxes
          .slice()
          .sort(function (a, b) { return String(a.properties.boxNumber).localeCompare(String(b.properties.boxNumber), undefined, { numeric: true }); })
          .forEach(function (f) {
            answerHtml += '<button data-action="submit-box-identifier" data-box="' + esc(f.properties.boxNumber) + '" class="px-3 py-1.5 rounded border border-base-600 hover:border-alert-amber/50 hover:bg-alert-amber/10 font-mono text-xs transition-colors">' + esc(f.properties.boxNumber) + '</button>';
          });
        answerHtml += '</div>';
      } else {
        answerHtml = resultRow(quiz.lastResult);
      }
    }

    let nextBtn = '';
    if (quiz.phase === 'ANSWER_SUBMITTED') {
      const isLast = (quiz.questionIndex + 1) >= quiz.totalQuestions;
      nextBtn = '<button data-action="next-question" class="mt-2 w-full py-2.5 rounded bg-alert-cyan/15 border border-alert-cyan/40 text-alert-cyan font-display font-600 uppercase tracking-wide text-xs hover:bg-alert-cyan/25 transition-colors flex items-center justify-center gap-1.5">' +
        (isLast ? '<i data-lucide="flag" class="w-3.5 h-3.5"></i>See Results' : '<i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>Next Question') +
        '</button>';
    }

    overlay.innerHTML = '<div class="pointer-events-auto w-full md:max-w-lg bg-base-900/95 border border-base-700 rounded-t-xl md:rounded-xl backdrop-blur-sm shadow-2xl p-3.5">' +
      '<div class="flex items-center justify-between mb-1.5">' +
      '<span class="text-[10px] font-mono uppercase tracking-wider text-ink-500">Question ' + (quiz.questionIndex + 1) + ' / ' + quiz.totalQuestions + '</span>' +
      '<span class="text-[10px] font-mono uppercase tracking-wider text-ink-500">' + (quiz.boxNumber ? 'Box ' + esc(quiz.boxNumber) : 'All Boxes') + '</span>' +
      '</div>' +
      questionHtml +
      answerHtml +
      nextBtn +
      '</div>';

    UI.refreshIcons(overlay);

    if (quiz.mode === 'name-street' && quiz.phase === 'QUIZ_ONGOING') {
      const input = document.getElementById('quiz-answer-input');
      if (input) {
        input.focus();
        input.onkeydown = function (e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            window.BoxRecall.Quiz.submitNameStreetAnswer(input.value);
          }
        };
      }
    }

    // Bind newly-injected overlay action buttons (submit/next/identifier choices)
    bindDynamicHandlers(overlay);
  }

  function resultRow(result) {
    if (!result) return '';
    const cls = result.correct ? 'border-alert-green/40 bg-alert-green/10 text-alert-green' : 'border-alert-red/40 bg-alert-red/10 text-alert-red';
    const icon = result.correct ? 'check-circle-2' : 'x-circle';
    return '<div class="flex items-start gap-2 p-2.5 rounded border ' + cls + '">' +
      '<i data-lucide="' + icon + '" class="w-4 h-4 shrink-0 mt-0.5"></i>' +
      '<span class="text-xs leading-relaxed">' + esc(result.message) + '</span>' +
      '</div>';
  }

  /** Brief full-overlay flash to reinforce correct/incorrect. */
  function flashFeedback(correct) {
    const overlay = document.getElementById('quiz-overlay');
    if (!overlay) return;
    const child = overlay.firstElementChild;
    if (!child) return;
    child.classList.remove('flash-correct', 'flash-wrong');
    void child.offsetWidth; // restart animation
    child.classList.add(correct ? 'flash-correct' : 'flash-wrong');
  }

  // ---------------------------------------------------------------------
  // SHARED: SAVE A NEW BOX + AUTO-LOOKUP ITS STREETS VIA OVERPASS
  // ---------------------------------------------------------------------

  const STREET_DUPLICATE_TOLERANCE_DEG = 0.0003; // ~30m — midpoints within this distance + same normalized name are treated as the same street

  // Delay between successive Overpass requests in a batch import. Overpass
  // is a free, shared, public service — a tight loop of N back-to-back
  // requests (one per box) is the kind of burst pattern that public-API
  // rate-limiting/abuse-detection targets, and a soft block (HTTP 200 with
  // empty results, no error) can look identical to "this area has no
  // streets." A small pacing delay between boxes is a courtesy to the
  // shared service and reduces the chance of triggering that.
  const OVERPASS_BATCH_DELAY_MS = 1000;

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  /**
   * Extract one or more rings, each as an array of [lat,lng] pairs (the
   * format fetchStreetsForPolygon/Overpass expects), from a Polygon or
   * MultiPolygon GeoJSON geometry. Only outer rings are used (holes are
   * ignored — a fire box with a donut hole still wants streets from its
   * full extent for quiz purposes). Returns [] for unsupported geometry
   * types.
   */
  function ringsAsLatLngFromGeometry(geometry) {
    if (!geometry) return [];
    if (geometry.type === 'Polygon') {
      const outer = geometry.coordinates[0] || [];
      return outer.length >= 3 ? [outer.map(function (c) { return [c[1], c[0]]; })] : [];
    }
    if (geometry.type === 'MultiPolygon') {
      return geometry.coordinates
        .map(function (poly) { return poly[0] || []; })
        .filter(function (outer) { return outer.length >= 3; })
        .map(function (outer) { return outer.map(function (c) { return [c[1], c[0]]; }); });
    }
    return [];
  }

  /**
   * Core logic: persist a box feature (already built — Polygon or
   * MultiPolygon), then asynchronously query Overpass for named streets
   * within it (per-ring for MultiPolygon, merged/deduped) and add any not
   * already present. Always saves the box immediately, independent of the
   * street-lookup outcome.
   *
   * @param {GeoJSON.Feature} feature - full box feature, including `id`
   * @param {{ silent?: boolean, skipRender?: boolean }} [options]
   *   silent: suppress the per-box success/warn toast (used by batch
   *     imports, which show one summary toast instead).
   *   skipRender: don't call renderActiveTab() (used by batch imports,
   *     which render once after the whole batch completes).
   * @returns {Promise<{ addedStreets: number, skippedDupeStreets: number, streetError: string|null, rawElementCount: number, rawWayCount: number }>}
   *   rawElementCount/rawWayCount: aggregated across all rings, before
   *   merge/dedup — see fetchStreetsForPolygon for what these distinguish.
   */
  async function persistBoxWithStreetLookup(feature, options) {
    options = options || {};
    const boxNumber = feature.properties.boxNumber;

    Store.addBox(feature);
    if (!options.skipRender) renderActiveTab();

    const rings = ringsAsLatLngFromGeometry(feature.geometry);
    if (rings.length === 0) {
      if (!options.silent) Toast.show('Box ' + boxNumber + ' saved, but its geometry has no usable ring for a street lookup. Add streets manually below.', 'warn', { duration: 7000 });
      return { addedStreets: 0, skippedDupeStreets: 0, streetError: 'no usable geometry ring' };
    }

    const loadingToastId = options.silent ? null : Toast.show('Box ' + boxNumber + ' saved. Looking up streets…', 'info', { sticky: true });

    // Query Overpass once per ring (a MultiPolygon box may have disjoint
    // parts), merging results and deduping by OSM way id so a street that
    // happens to touch two rings isn't added twice.
    let combinedFeatures = [];
    let firstError = null;
    const seenOsmIds = new Set();
    let totalRawElementCount = 0;
    let totalRawWayCount = 0;

    for (let i = 0; i < rings.length; i++) {
      let result;
      try {
        result = await window.BoxRecall.Map.fetchStreetsForPolygon(rings[i], boxNumber);
      } catch (err) {
        console.error('[BoxRecall] Unexpected error during street lookup:', err);
        result = { features: [], rawWayCount: 0, rawElementCount: 0, error: 'Street lookup failed unexpectedly.' };
      }
      if (result.error && !firstError) firstError = result.error;
      totalRawElementCount += result.rawElementCount || 0;
      totalRawWayCount += result.rawWayCount || 0;
      result.features.forEach(function (sf) {
        const key = (sf.properties.osmIds || []).join(',');
        if (key && seenOsmIds.has(key)) return;
        if (key) seenOsmIds.add(key);
        combinedFeatures.push(sf);
      });
    }

    if (loadingToastId) Toast.dismiss(loadingToastId);

    // Snapshot of streets ALREADY in the database for this box, BEFORE this
    // import — used only to avoid re-adding a street that was saved by a
    // PREVIOUS import (e.g. re-running the lookup, or an overlapping box).
    // Deliberately NOT mutated during the loop below: two different OSM
    // ways found in THIS SAME Overpass result that happen to share a name
    // and have midpoints within STREET_DUPLICATE_TOLERANCE_DEG of each
    // other (e.g. a street OSM splits into multiple disconnected segments —
    // common for streets interrupted by a different road, a loop, or a
    // gap) are real, distinct streets and must both be kept. If this were
    // mutated during the loop, the second such segment would be (incorrectly)
    // treated as a duplicate of the first — even on a brand-new box with no
    // prior streets at all, silently dropping real street segments. Exact
    // within-import duplicates (the same OSM way appearing twice, e.g. from
    // overlapping MultiPolygon rings) are already prevented upstream via
    // seenOsmIds.
    const existingNames = Store.state.streets.features
      .filter(function (f) { return f.properties && String(f.properties.boxNumber) === String(boxNumber); })
      .map(function (f) {
        return {
          normName: FD.normalizeStreetName(f.properties.name || ''),
          midpoint: FD.lineMidpoint(f.geometry.coordinates),
        };
      });

    let addedCount = 0;
    let skippedDupeCount = 0;

    combinedFeatures.forEach(function (sf) {
      const normName = FD.normalizeStreetName(sf.properties.name || '');
      const midpoint = FD.lineMidpoint(sf.geometry.coordinates);

      const isDuplicate = existingNames.some(function (ex) {
        if (ex.normName !== normName) return false;
        const dLng = Math.abs(ex.midpoint[0] - midpoint[0]);
        const dLat = Math.abs(ex.midpoint[1] - midpoint[1]);
        return dLng < STREET_DUPLICATE_TOLERANCE_DEG && dLat < STREET_DUPLICATE_TOLERANCE_DEG;
      });

      if (isDuplicate) {
        skippedDupeCount++;
        return;
      }

      Store.addStreet(sf);
      addedCount++;
    });

    if (!options.skipRender) renderActiveTab();

    if (!options.silent) {
      if (firstError && addedCount === 0) {
        Toast.show('Box ' + boxNumber + ': ' + firstError, 'warn', { duration: 7000 });
      } else if (addedCount === 0 && totalRawElementCount === 0) {
        // Overpass returned HTTP 200 with zero elements, no error, no
        // remark — looks like "this area has no roads", but for any
        // populated area that's suspicious. Could be a genuinely empty
        // area, a misplaced/degenerate polygon, OR Overpass silently
        // declining the request (soft rate-limit / abuse detection
        // returning empty results rather than a 429 or remark) — which
        // HTTP-status and remark checks above don't catch. Phrasing this
        // distinctly from "no named streets found" so it's not confused
        // with the (more common, more benign) "found data, none matched
        // our filters" case below.
        Toast.show('Box ' + boxNumber + ': OpenStreetMap returned 0 results for this area (no error reported). If this seems wrong for the area, it may be a temporary lookup issue — try again in a bit, or add streets manually below.', 'warn', { duration: 9000 });
      } else if (addedCount === 0 && totalRawWayCount === 0) {
        // Overpass returned data, but none of it was a named way of a
        // street-like highway type — plausible for a very small box or one
        // covering mostly non-residential land.
        Toast.show('Box ' + boxNumber + ': OpenStreetMap found data for this area, but no named streets matching our road types. Add streets manually below.', 'warn', { duration: 7000 });
      } else if (addedCount === 0) {
        // Overpass found candidate ways (rawWayCount > 0), but all were
        // deduped against streets already saved for this box.
        Toast.show('Box ' + boxNumber + ': OpenStreetMap found ' + totalRawWayCount + ' street' + (totalRawWayCount === 1 ? '' : 's') + ' for this area, but all ' + (totalRawWayCount === 1 ? 'was' : 'were') + ' already present.', 'info', { duration: 7000 });
      } else if (firstError) {
        // Partial success: some streets were added, but the lookup didn't
        // finish (e.g. Overpass timed out on a large/complex polygon).
        let msg = 'Box ' + boxNumber + ': added ' + addedCount + ' street' + (addedCount === 1 ? '' : 's') + ' from OpenStreetMap, but the ' + firstError.charAt(0).toLowerCase() + firstError.slice(1);
        if (skippedDupeCount > 0) msg += ' (' + skippedDupeCount + ' already present)';
        Toast.show(msg, 'warn', { duration: 9000 });
      } else {
        let msg = 'Box ' + boxNumber + ': added ' + addedCount + ' street' + (addedCount === 1 ? '' : 's') + ' from OpenStreetMap.';
        if (skippedDupeCount > 0) msg += ' (' + skippedDupeCount + ' already present)';
        msg += ' Review the list and add anything missing.';
        Toast.show(msg, 'success', { duration: 8000 });
      }
    }

    return { addedStreets: addedCount, skippedDupeStreets: skippedDupeCount, streetError: firstError, rawElementCount: totalRawElementCount, rawWayCount: totalRawWayCount };
  }

  /**
   * Handle the "Import Boxes" button in the Fairfax County GIS panel:
   * read station-number and box-number-list inputs, fetch matching Fire Box
   * features from Fairfax County's public GIS, skip any whose box number
   * already exists locally, persist the rest (each with its own Overpass
   * street lookup, silenced — a single summary toast covers the whole
   * batch), and render once at the end.
   */
  async function runFairfaxImport(buttonEl, root) {
    const scope = root || document;
    const stationInput = scope.querySelector('#ffx-station-number');
    const boxesInput = scope.querySelector('#ffx-box-numbers');

    const stationText = stationInput ? stationInput.value.trim() : '';
    const boxesText = boxesInput ? boxesInput.value.trim() : '';

    const Import = window.BoxRecall.Import;
    const stationNumber = Import.parseStationNumber(stationText);
    const boxList = Import.parseBoxNumberList(boxesText);

    if (stationText && stationNumber === null) {
      Toast.show('Station number must be a whole number (e.g. 41).', 'warn');
      return;
    }
    if (boxList.invalidTokens.length > 0) {
      Toast.show('Box numbers must be whole numbers — couldn\'t read: ' + boxList.invalidTokens.join(', '), 'warn', { duration: 6000 });
      return;
    }
    if (stationNumber === null && boxList.numbers.length === 0) {
      Toast.show('Enter a station number and/or at least one box number.', 'warn');
      return;
    }

    const originalButtonHtml = buttonEl.innerHTML;
    buttonEl.disabled = true;
    buttonEl.classList.add('opacity-50', 'cursor-not-allowed');
    buttonEl.innerHTML = '<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i> Importing…';
    UI.refreshIcons(buttonEl);

    const loadingToastId = Toast.show('Querying Fairfax County GIS…', 'info', { sticky: true });

    let result;
    try {
      result = await Import.fetchFairfaxFireBoxes(stationNumber, boxList.numbers);
    } catch (err) {
      console.error('[BoxRecall] Fairfax import failed unexpectedly:', err);
      result = { features: [], rawCount: 0, error: 'Import failed unexpectedly. Try again, or draw the box manually.' };
    }

    if (loadingToastId) Toast.dismiss(loadingToastId);

    if (result.error && result.features.length === 0) {
      Toast.show(result.error, 'error', { duration: 7000 });
      restoreButton();
      return;
    }

    if (result.features.length === 0) {
      const criteria = [];
      if (stationNumber !== null) criteria.push('station ' + stationNumber);
      if (boxList.numbers.length > 0) criteria.push('box number' + (boxList.numbers.length === 1 ? '' : 's') + ' ' + boxList.numbers.join(', '));
      Toast.show('No Fire Box records found for ' + criteria.join(' or ') + '. Double-check the number(s), or draw the box manually.', 'warn', { duration: 7000 });
      restoreButton();
      return;
    }

    // Skip boxes that already exist locally (by boxNumber).
    const toImport = [];
    let skippedExisting = 0;
    result.features.forEach(function (f) {
      if (window.BoxRecall.Map.findBoxByNumber(f.properties.boxNumber)) {
        skippedExisting++;
      } else {
        toImport.push(f);
      }
    });

    if (toImport.length === 0) {
      Toast.show('Found ' + result.features.length + ' box' + (result.features.length === 1 ? '' : 'es') + ', but all are already in your list.', 'info', { duration: 6000 });
      restoreButton();
      return;
    }

    const progressToastId = Toast.show('Importing ' + toImport.length + ' box' + (toImport.length === 1 ? '' : 'es') + '… looking up streets for each.', 'info', { sticky: true });

    let totalStreetsAdded = 0;
    let boxesWithStreetErrors = 0;
    let boxesWithZeroOverpassResults = 0;

    for (let i = 0; i < toImport.length; i++) {
      const f = toImport[i];
      f.id = FD.genId('box');
      try {
        const r = await persistBoxWithStreetLookup(f, { silent: true, skipRender: true });
        totalStreetsAdded += r.addedStreets;
        if (r.streetError) boxesWithStreetErrors++;
        // rawElementCount === 0 with no streetError: Overpass returned HTTP
        // 200 with zero elements, no error/remark. See
        // persistBoxWithStreetLookup's non-silent toast for the same
        // condition — suspicious for a populated area, possible soft
        // rate-limit. Tracked separately from boxesWithStreetErrors since
        // it's not an "error" by our existing categorization, but is the
        // signal that would indicate Overpass started declining requests
        // partway through a batch.
        if (!r.streetError && r.rawElementCount === 0) boxesWithZeroOverpassResults++;
      } catch (err) {
        console.error('[BoxRecall] persistBoxWithStreetLookup failed for box ' + f.properties.boxNumber + ':', err);
        boxesWithStreetErrors++;
      }

      // Pace requests to Overpass — skip the delay after the last box.
      if (i < toImport.length - 1) await sleep(OVERPASS_BATCH_DELAY_MS);
    }

    if (progressToastId) Toast.dismiss(progressToastId);

    renderActiveTab();
    restoreButton();

    // Final summary toast.
    let msg = 'Imported ' + toImport.length + ' box' + (toImport.length === 1 ? '' : 'es') + ' from Fairfax County';
    if (totalStreetsAdded > 0) {
      msg += ' with ' + totalStreetsAdded + ' street' + (totalStreetsAdded === 1 ? '' : 's') + ' from OpenStreetMap';
    }
    msg += '.';
    if (skippedExisting > 0) msg += ' ' + skippedExisting + ' already in your list, skipped.';
    if (boxesWithStreetErrors > 0) msg += ' ' + boxesWithStreetErrors + ' box' + (boxesWithStreetErrors === 1 ? '' : 'es') + ' had street-lookup issues — check their street lists.';
    if (boxesWithZeroOverpassResults > 0) {
      msg += ' ' + boxesWithZeroOverpassResults + ' box' + (boxesWithZeroOverpassResults === 1 ? '' : 'es') + ' got 0 results from OpenStreetMap with no error reported';
      msg += boxesWithZeroOverpassResults === toImport.length
        ? ' — this may indicate a temporary OpenStreetMap lookup issue affecting the whole batch. Try importing again, or in smaller batches.'
        : ' — if those areas should have streets, try re-importing just those boxes individually.';
    }
    Toast.show(msg, (boxesWithStreetErrors > 0 || boxesWithZeroOverpassResults > 0) ? 'warn' : 'success', { duration: 11000 });

    function restoreButton() {
      buttonEl.disabled = false;
      buttonEl.classList.remove('opacity-50', 'cursor-not-allowed');
      buttonEl.innerHTML = originalButtonHtml;
      UI.refreshIcons(buttonEl);
    }
  }

  /**
   * Wrapper preserving the original entry point for manually-drawn boxes:
   * builds a Polygon feature from drawing vertices, then delegates to
   * persistBoxWithStreetLookup. Also handles the drawing-mode UI cleanup
   * (cancel drawing, hide banner, etc.) that only applies to the manual
   * draw flow.
   *
   * @param {Array<[number,number]>} verts - drawing vertices, [lat,lng] pairs
   * @param {string} boxNumber
   * @param {string} label
   */
  async function saveNewBoxWithStreetLookup(verts, boxNumber, label) {
    const feature = window.BoxRecall.Map.buildPolygonFeatureFromVertices(verts, { boxNumber: boxNumber, label: label });
    window.BoxRecall.Map.cancelDrawing();
    hideDrawBanner();
    syncTopBarDrawButtons();
    await persistBoxWithStreetLookup(feature, {});
  }

  // ---------------------------------------------------------------------
  // DYNAMIC EVENT DISPATCH (data-action="...")
  // ---------------------------------------------------------------------

  function renderActiveTab() {
    UI.renderActiveTab();
  }

  function bindDynamicHandlers(root) {
    if (!root) return;

    root.querySelectorAll('[data-action]').forEach(function (el) {
      const action = el.dataset.action;

      if (el._fdBound) return;
      el._fdBound = true;

      switch (action) {
        case 'focus-box':
          el.addEventListener('click', function () {
            window.BoxRecall.Map.focusBox(el.dataset.box);
            Store.setActiveBoxNumber(el.dataset.box);
            Store.setActiveTab('home');
            renderActiveTab();
            collapseSheetIfNeeded();
          });
          break;

        case 'open-box-sheet':
          el.addEventListener('click', function () {
            window.BoxRecall.Map.focusBox(el.dataset.box);
            Store.setActiveBoxNumber(el.dataset.box);
            renderActiveTab();
          });
          break;

        case 'close-box-sheet':
          el.addEventListener('click', function () {
            Store.setActiveBoxNumber(null);
            window.BoxRecall.Map.clearFocus();
            renderActiveTab();
          });
          break;

        case 'go-quiz-mode':
          el.addEventListener('click', function () {
            const mode = el.dataset.mode;
            const box = el.dataset.box;
            Store.setActiveTab('home');
            window.BoxRecall.Quiz.startQuiz(mode, box);
            renderActiveTab();
          });
          break;

        case 'reset-box-stats':
          el.addEventListener('click', function () {
            const box = el.dataset.box;
            const ok = window.confirm('Reset all performance stats for Box ' + box + '?');
            if (!ok) return;
            Store.resetBoxStats(box);
            renderActiveTab();
            Toast.show('Stats reset for Box ' + box + '.', 'success');
          });
          break;

        case 'toggle-labels':
          el.addEventListener('click', function () {
            const newVal = !Store.state.labelsVisible;
            window.BoxRecall.Map.setLabelsVisible(newVal);
            renderActiveTab();
            syncTopBarLabelButtons();
          });
          break;

        case 'start-draw-box':
          el.addEventListener('click', function () {
            window.BoxRecall.Map.startDrawing();
            renderActiveTab();
            syncTopBarDrawButtons();
            showDrawBanner('box');
          });
          break;

        case 'cancel-draw-box':
          el.addEventListener('click', function () {
            window.BoxRecall.Map.cancelDrawing();
            renderActiveTab();
            syncTopBarDrawButtons();
            hideDrawBanner();
          });
          break;

        case 'finish-draw-box':
          el.addEventListener('click', function () {
            const verts = window.BoxRecall.Map.finishDrawing();
            if (!verts) return;
            const numberInput = root.querySelector('#new-box-number');
            const labelInput = root.querySelector('#new-box-label');
            const boxNumber = (numberInput && numberInput.value.trim()) || '';
            const label = (labelInput && labelInput.value.trim()) || '';

            if (!boxNumber) {
              Toast.show('Enter a Box Number before saving.', 'warn');
              return;
            }
            const existing = window.BoxRecall.Map.findBoxByNumber(boxNumber);
            if (existing) {
              Toast.show('Box ' + boxNumber + ' already exists. Choose a different number.', 'error');
              return;
            }

            saveNewBoxWithStreetLookup(verts, boxNumber, label).catch(function (err) {
              console.error('[BoxRecall] saveNewBoxWithStreetLookup failed:', err);
              Toast.show('Box ' + boxNumber + ' saved, but street lookup failed unexpectedly. Add streets manually below.', 'warn', { duration: 7000 });
            });
          });
          break;

        case 'import-fairfax-boxes':
          el.addEventListener('click', function () {
            runFairfaxImport(el, root);
          });
          break;

        case 'toggle-box-select':
          el.addEventListener('change', function () {
            Store.toggleBoxSelection(el.dataset.boxId);
            renderActiveTab();
          });
          break;

        case 'select-all-boxes':
          el.addEventListener('change', function () {
            Store.toggleSelectAllBoxes();
            renderActiveTab();
          });
          break;

        case 'bulk-delete-boxes':
          el.addEventListener('click', function () {
            const ids = Array.from(Store.state.selectedBoxIds);
            if (ids.length === 0) return;

            const targets = Store.state.boxes.features.filter(function (f) { return ids.indexOf(f.id) !== -1; });
            const boxLabel = targets.length === 1
              ? 'Box ' + targets[0].properties.boxNumber
              : targets.length + ' boxes';
            const totalStreets = targets.reduce(function (sum, f) {
              return sum + window.BoxRecall.Quiz.streetsForBox(f.properties.boxNumber).length;
            }, 0);
            const streetClause = totalStreets > 0 ? (' and ' + totalStreets + ' street' + (totalStreets === 1 ? '' : 's')) : '';

            const ok = window.confirm('Delete ' + boxLabel + streetClause + '? Quiz history for ' + (targets.length === 1 ? 'this box' : 'these boxes') + ' will also be reset. This cannot be undone.');
            if (!ok) return;

            // If the active (map-focused) box is among those being deleted, clear focus first.
            const activeTarget = targets.find(function (f) { return f.properties.boxNumber === Store.state.activeBoxNumber; });
            if (activeTarget) window.BoxRecall.Map.clearFocus();

            const removedCount = Store.removeBoxesCascade(ids);
            renderActiveTab();
            Toast.show(removedCount + ' box' + (removedCount === 1 ? '' : 'es') + ' deleted' + streetClause + '.', 'success');
          });
          break;

        case 'delete-box':
          el.addEventListener('click', function () {
            const boxId = el.dataset.boxId;
            const boxNumber = el.dataset.box;
            const streetCount = window.BoxRecall.Quiz.streetsForBox(boxNumber).length;
            const streetClause = streetCount > 0 ? (' and ' + streetCount + ' street' + (streetCount === 1 ? '' : 's')) : '';
            const ok = window.confirm('Delete Box ' + boxNumber + streetClause + '? Quiz history for this box will also be reset. This cannot be undone.');
            if (!ok) return;
            Store.removeBox(boxId);
            if (Store.state.activeBoxNumber === boxNumber) window.BoxRecall.Map.clearFocus();
            renderActiveTab();
            Toast.show('Box ' + boxNumber + ' deleted' + streetClause + '.', 'success');
          });
          break;

        case 'start-draw-street':
          el.addEventListener('click', function () {
            window.BoxRecall.Map.startStreetDrawing();
            window.BoxRecall._streetDrawActive = true;
            renderActiveTab();
            syncTopBarDrawButtons();
            showDrawBanner('street');
          });
          break;

        case 'cancel-draw-street':
          el.addEventListener('click', function () {
            window.BoxRecall.Map.cancelStreetDrawing();
            window.BoxRecall._streetDrawActive = false;
            renderActiveTab();
            syncTopBarDrawButtons();
            hideDrawBanner();
          });
          break;

        case 'finish-draw-street':
          el.addEventListener('click', function () {
            const nameInput = root.querySelector('#new-street-name');
            const boxSelect = root.querySelector('#new-street-box');
            const name = (nameInput && nameInput.value.trim()) || '';
            const boxNumber = (boxSelect && boxSelect.value) || null;

            if (!name) {
              Toast.show('Enter a street name before saving.', 'warn');
              return;
            }

            const feature = window.BoxRecall.Map.finishStreetDrawing(name);
            if (!feature) return;
            feature.properties.boxNumber = boxNumber || null;
            Store.addStreet(feature);
            window.BoxRecall._streetDrawActive = false;
            hideDrawBanner();
            syncTopBarDrawButtons();
            renderActiveTab();
            Toast.show('Street "' + name + '" saved.', 'success');
          });
          break;

        case 'delete-street':
          el.addEventListener('click', function () {
            const id = el.dataset.streetId;
            const feature = Store.state.streets.features.find(function (f) { return f.id === id; });
            const name = feature ? (feature.properties.name || 'this street') : 'this street';
            const ok = window.confirm('Delete "' + name + '"? This cannot be undone.');
            if (!ok) return;
            Store.removeStreet(id);
            renderActiveTab();
            Toast.show('Street deleted.', 'success');
          });
          break;

        case 'filter-streets-by-box':
          el.addEventListener('change', function () {
            Store.setStreetFilterBoxNumber(el.value);
            renderActiveTab();
          });
          break;

        case 'toggle-street-select':
          el.addEventListener('change', function () {
            Store.toggleStreetSelection(el.dataset.streetId);
            renderActiveTab();
          });
          break;

        case 'select-all-streets':
          el.addEventListener('change', function () {
            // "Select all" is scoped to the currently-filtered/visible
            // streets, not every street in the app — reuse the same
            // filter predicate renderBuilderTab uses for what's displayed.
            const filterValue = Store.state.streetFilterBoxNumber || '';
            const visibleIds = UI.streetsMatchingFilter(Store.state.streets.features, filterValue)
              .map(function (f) { return f.id; });
            Store.toggleSelectAllStreets(visibleIds);
            renderActiveTab();
          });
          break;

        case 'bulk-delete-streets':
          el.addEventListener('click', function () {
            const ids = Array.from(Store.state.selectedStreetIds);
            if (ids.length === 0) return;

            const targets = Store.state.streets.features.filter(function (f) { return ids.indexOf(f.id) !== -1; });
            const label = targets.length === 1
              ? '"' + (targets[0].properties.name || 'this street') + '"'
              : targets.length + ' streets';

            const ok = window.confirm('Delete ' + label + '? This cannot be undone.');
            if (!ok) return;

            const removedCount = Store.removeStreetsCascade(ids);
            renderActiveTab();
            Toast.show(removedCount + ' street' + (removedCount === 1 ? '' : 's') + ' deleted.', 'success');
          });
          break;

        case 'submit-name-street':
          el.addEventListener('click', function () {
            const input = document.getElementById('quiz-answer-input');
            window.BoxRecall.Quiz.submitNameStreetAnswer(input ? input.value : '');
          });
          break;

        case 'submit-box-identifier':
          el.addEventListener('click', function () {
            window.BoxRecall.Quiz.submitBoxIdentifierAnswer(el.dataset.box);
          });
          break;

        case 'next-question':
          el.addEventListener('click', function () {
            window.BoxRecall.Quiz.nextQuestion();
            renderActiveTab();
          });
          break;

        case 'end-quiz':
          el.addEventListener('click', function () {
            const box = Store.state.quiz.boxNumber;
            window.BoxRecall.Quiz.endQuiz();
            if (box) Store.setActiveBoxNumber(box);
            renderActiveTab();
          });
          break;

        case 'start-quiz':
          el.addEventListener('click', function () {
            const mode = el.dataset.mode;
            const select = document.getElementById('quiz-box-select');
            const box = select ? select.value : '';
            window.BoxRecall.Quiz.startQuiz(mode, box || null);
            renderActiveTab();
          });
          break;

        case 'retry-quiz':
          el.addEventListener('click', function () {
            const mode = el.dataset.mode;
            const box = el.dataset.box || null;
            window.BoxRecall.Quiz.startQuiz(mode, box);
            renderActiveTab();
          });
          break;

        case 'quiz-new-session':
          el.addEventListener('click', function () {
            const box = Store.state.quiz.boxNumber;
            Store.quizDispatch('RESET');
            if (box) Store.setActiveBoxNumber(box);
            renderActiveTab();
            renderQuizOverlay();
          });
          break;

        case 'edit-street-name':
          el.addEventListener('change', function () {
            const id = el.dataset.streetId;
            const value = el.value.trim();
            Store.updateStreet(id, function (f) { f.properties.name = value; return f; });
            Toast.show('Street name updated.', 'success');
          });
          break;

        case 'edit-street-box':
          el.addEventListener('change', function () {
            const id = el.dataset.streetId;
            const value = el.value || null;
            Store.updateStreet(id, function (f) { f.properties.boxNumber = value; return f; });
            renderActiveTab();
          });
          break;
      }
    });

    const studySelect = root.querySelector('#study-box-select');
    if (studySelect && !studySelect._fdBound) {
      studySelect._fdBound = true;
      studySelect.addEventListener('change', function () {
        if (studySelect.value) {
          window.BoxRecall.Map.focusBox(studySelect.value);
        } else {
          Store.setActiveBoxNumber(null);
          window.BoxRecall.Map.clearFocus();
        }
        renderActiveTab();
      });
    }
  }

  // ---------------------------------------------------------------------
  // TOP-BAR / BANNER SYNC HELPERS
  // ---------------------------------------------------------------------

  function syncTopBarLabelButtons() {
    const visible = Store.state.labelsVisible;
    [document.getElementById('btn-toggle-labels'), document.getElementById('btn-toggle-labels-m')].forEach(function (btn) {
      if (!btn) return;
      btn.setAttribute('aria-pressed', visible ? 'true' : 'false');
      const icon = btn.querySelector('i');
      if (!icon) return;
      icon.classList.toggle('text-alert-cyan', visible);
      icon.classList.toggle('text-ink-500', !visible);
    });
  }

  function syncTopBarDrawButtons() {
    const active = Store.state.drawingActive || !!window.BoxRecall._streetDrawActive;
    [document.getElementById('btn-draw-mode'), document.getElementById('btn-draw-mode-m')].forEach(function (btn) {
      if (!btn) return;
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      const icon = btn.querySelector('i');
      if (!icon) return;
      icon.classList.toggle('text-alert-amber', active);
      icon.classList.toggle('text-ink-300', !active);
    });
  }

  /**
   * Update the basemap-switcher button icon/title to reflect the currently
   * active basemap. Lucide replaces <i data-lucide="..."> with an inline
   * <svg> on first render, so changing icons later means re-injecting an
   * <i> placeholder and re-running createIcons for just that button.
   */
  function syncBasemapButtons() {
    const key = window.BoxRecall.Map.getBasemap();
    const meta = window.BoxRecall.Map.BASEMAPS[key];
    if (!meta) return;

    [document.getElementById('btn-basemap'), document.getElementById('btn-basemap-m')].forEach(function (btn) {
      if (!btn) return;
      btn.title = 'Basemap: ' + meta.label + ' (tap to switch)';
      if (btn.dataset.basemapIcon === meta.icon) return;

      btn.dataset.basemapIcon = meta.icon;
      btn.innerHTML = '<i data-lucide="' + meta.icon + '" class="w-4 h-4 text-ink-300"></i>';
      UI.refreshIcons(btn);
    });
  }

  /**
   * Update the theme-toggle button icon to reflect the CURRENTLY DISPLAYED
   * theme: a sun icon (offering to switch to dark) when light is active, a
   * moon icon (offering to switch to light) when dark is active. Same
   * Lucide re-render pattern as syncBasemapButtons.
   */
  function syncThemeButtons() {
    const effective = Store.getEffectiveTheme();
    const icon = effective === 'dark' ? 'moon' : 'sun';
    const label = effective === 'dark' ? 'Dark theme (tap for light)' : 'Light theme (tap for dark)';

    [document.getElementById('btn-theme-toggle'), document.getElementById('btn-theme-toggle-m')].forEach(function (btn) {
      if (!btn) return;
      btn.title = label;
      btn.setAttribute('aria-label', label);
      if (btn.dataset.themeIcon === icon) return;

      btn.dataset.themeIcon = icon;
      btn.innerHTML = '<i data-lucide="' + icon + '" class="w-4 h-4 text-ink-300"></i>';
      UI.refreshIcons(btn);
    });
  }

  /**
   * Render the 3-way basemap segmented control inside the Settings modal
   * (#basemap-selector). Re-renders on every open so the active selection
   * reflects the persisted setting, and on every selection so the active
   * state updates immediately.
   */
  function renderBasemapSelector() {
    const container = document.getElementById('basemap-selector');
    if (!container) return;

    const order = window.BoxRecall.Map.BASEMAP_ORDER;
    const current = window.BoxRecall.Map.getBasemap();

    container.innerHTML = order.map(function (key) {
      const meta = window.BoxRecall.Map.BASEMAPS[key];
      const active = key === current;
      const activeCls = active
        ? 'border-alert-cyan/50 bg-alert-cyan/10 text-alert-cyan'
        : 'border-base-600 text-ink-300 hover:border-base-500';
      return '<button type="button" data-action="select-basemap" data-basemap="' + key + '" role="radio" aria-checked="' + (active ? 'true' : 'false') + '" ' +
        'class="flex flex-col items-center gap-1 py-2 rounded border ' + activeCls + ' transition-colors text-[10px] font-display font-600 uppercase tracking-wide">' +
        '<i data-lucide="' + meta.icon + '" class="w-4 h-4"></i>' + esc(meta.label) +
        '</button>';
    }).join('');

    UI.refreshIcons(container);

    container.querySelectorAll('[data-action="select-basemap"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const key = btn.dataset.basemap;
        window.BoxRecall.Map.setBasemap(key);
        UI.syncBasemapButtons();
        renderBasemapSelector(); // re-render to update active highlight
      });
    });
  }

  function showDrawBanner(kind) {
    const banner = document.getElementById('draw-banner');
    if (!banner) return;
    banner.hidden = false;
    const finishBtn = document.getElementById('btn-finish-draw');
    const cancelBtn = document.getElementById('btn-cancel-draw');

    // Re-bind (clone to drop prior listeners cleanly)
    const newFinish = finishBtn.cloneNode(true);
    const newCancel = cancelBtn.cloneNode(true);
    finishBtn.parentNode.replaceChild(newFinish, finishBtn);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);

    newFinish.addEventListener('click', function () {
      if (kind === 'box') {
        // Trigger same logic as sidebar "Finish Shape" button: require number entry.
        // Since the banner doesn't have inputs, prompt inline.
        const verts = Store.state.drawingVertices;
        if (verts.length < 3) {
          Toast.show('A box needs at least 3 points.', 'warn');
          return;
        }
        const boxNumber = window.prompt('Enter Box Number for this shape (e.g. 2401):');
        if (!boxNumber || !boxNumber.trim()) {
          Toast.show('Box Number is required.', 'warn');
          return;
        }
        if (window.BoxRecall.Map.findBoxByNumber(boxNumber.trim())) {
          Toast.show('Box ' + boxNumber.trim() + ' already exists.', 'error');
          return;
        }
        const label = window.prompt('Optional label for this box (or leave blank):') || '';
        const v = window.BoxRecall.Map.finishDrawing();
        if (!v) return;
        const trimmedBoxNumber = boxNumber.trim();
        saveNewBoxWithStreetLookup(v, trimmedBoxNumber, label.trim()).catch(function (err) {
          console.error('[BoxRecall] saveNewBoxWithStreetLookup failed:', err);
          Toast.show('Box ' + trimmedBoxNumber + ' saved, but street lookup failed unexpectedly. Add streets manually below.', 'warn', { duration: 7000 });
        });
      } else {
        if (Store.state.drawingVertices.length < 2) {
          // streetDrawVertices tracked in map module; check via global flag length is not exposed here,
          // so just attempt finish and rely on its own validation.
        }
        const name = window.prompt('Enter the street name:');
        if (!name || !name.trim()) {
          Toast.show('Street name is required.', 'warn');
          return;
        }
        const feature = window.BoxRecall.Map.finishStreetDrawing(name.trim());
        if (!feature) return;
        Store.addStreet(feature);
        window.BoxRecall._streetDrawActive = false;
        hideDrawBanner();
        syncTopBarDrawButtons();
        renderActiveTab();
        Toast.show('Street "' + name.trim() + '" saved.', 'success');
      }
    });

    newCancel.addEventListener('click', function () {
      if (kind === 'box') {
        window.BoxRecall.Map.cancelDrawing();
      } else {
        window.BoxRecall.Map.cancelStreetDrawing();
        window.BoxRecall._streetDrawActive = false;
      }
      hideDrawBanner();
      syncTopBarDrawButtons();
      renderActiveTab();
    });

    updateDrawBannerFinishState();
  }

  function hideDrawBanner() {
    const banner = document.getElementById('draw-banner');
    if (banner) banner.hidden = true;
  }

  function updateDrawBannerFinishState() {
    const finishBtn = document.getElementById('btn-finish-draw');
    if (!finishBtn) return;
    if (window.BoxRecall._streetDrawActive) {
      finishBtn.disabled = window.BoxRecall.Map.getStreetDrawVertexCount() < 2;
    } else {
      finishBtn.disabled = Store.state.drawingVertices.length < 3;
    }
  }

  function onDrawVertexAdded() {
    renderActiveTab();
    updateDrawBannerFinishState();
  }

  function onStreetDrawVertexAdded() {
    updateDrawBannerFinishState();
  }

  function collapseSheetIfNeeded() {
    // On mobile, collapse the bottom sheet so the user can see the map after focusing a box.
    const sheet = document.getElementById('mobile-sheet');
    if (!sheet) return;
    if (window.innerWidth >= 768) return;
    sheet.classList.remove('sheet-expanded');
    sheet.classList.add('sheet-collapsed');
    const chevron = document.getElementById('sheet-chevron');
    if (chevron) chevron.style.transform = '';
    const handle = document.getElementById('sheet-handle');
    if (handle) handle.setAttribute('aria-expanded', 'false');
  }

  // ---------------------------------------------------------------------
  // EXPORTS
  // ---------------------------------------------------------------------
  window.BoxRecall = window.BoxRecall || {};
  window.BoxRecall.UI = window.BoxRecall.UI || {};
  Object.assign(window.BoxRecall.UI, {
    renderQuizOverlay: renderQuizOverlay,
    flashFeedback: flashFeedback,
    bindDynamicHandlers: bindDynamicHandlers,
    syncTopBarLabelButtons: syncTopBarLabelButtons,
    syncTopBarDrawButtons: syncTopBarDrawButtons,
    syncBasemapButtons: syncBasemapButtons,
    syncThemeButtons: syncThemeButtons,
    renderBasemapSelector: renderBasemapSelector,
    showDrawBanner: showDrawBanner,
    hideDrawBanner: hideDrawBanner,
    onDrawVertexAdded: onDrawVertexAdded,
    onStreetDrawVertexAdded: onStreetDrawVertexAdded,
    collapseSheetIfNeeded: collapseSheetIfNeeded,
    saveNewBoxWithStreetLookup: saveNewBoxWithStreetLookup,
    persistBoxWithStreetLookup: persistBoxWithStreetLookup,
    runFairfaxImport: runFairfaxImport,
  });

  // Override renderActiveTab to also re-render the quiz overlay (overlay is
  // outside the tab content containers, so it needs explicit refresh too).
  const originalRenderActiveTab = window.BoxRecall.UI.renderActiveTab;
  window.BoxRecall.UI.renderActiveTab = function () {
    originalRenderActiveTab();
    renderQuizOverlay();
    syncTopBarLabelButtons();
    syncTopBarDrawButtons();
  };

})();
