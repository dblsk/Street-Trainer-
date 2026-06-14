// ============================================================================
// FIRST DUE — Box Study & Active Recall App
// app-ui-part2.js — Study tab, Quiz tab, Quiz overlay, dynamic action dispatch
// ============================================================================

(function () {
  'use strict';

  const FD = window.FirstDue;
  const Store = FD.Store;
  const Toast = FD.Toast;
  const esc = FD.escapeHtml;
  const UI = window.FirstDue.UI;

  // ---------------------------------------------------------------------
  // STUDY TAB (Module 2: Box-by-Box Study Mode)
  // ---------------------------------------------------------------------

  function renderStudyTab() {
    const boxes = Store.state.boxes.features || [];
    const activeBoxNumber = Store.state.activeBoxNumber;

    let body = '';
    body += UI.sectionHeader('Filter Mode', 'filter');

    if (boxes.length === 0) {
      body += UI.emptyState('Define at least one Response Box in Box Builder to start a focused study session.', 'map-pin');
      return UI.wrapTabPanel(body);
    }

    body += '<label class="block mb-3">' +
      '<span class="text-[11px] text-ink-500 font-mono">Select Response Box</span>' +
      '<select id="study-box-select" class="mt-1 w-full bg-base-800 border border-base-600 rounded px-2.5 py-2 font-mono text-sm focus:border-alert-cyan/60">' +
      '<option value="">— Choose a box —</option>' +
      UI.boxOptionsHtml(boxes, activeBoxNumber, false) +
      '</select>' +
      '</label>';

    body += '<div class="flex items-center justify-between bg-base-800 border border-base-700 rounded-md p-2.5 mb-4">' +
      '<div class="flex items-center gap-2">' +
      '<i data-lucide="tag" class="w-4 h-4 text-alert-cyan"></i>' +
      '<span class="text-xs text-ink-100">Street Label Overlay</span>' +
      '</div>' +
      '<button data-action="toggle-labels" role="switch" aria-checked="' + (Store.state.labelsVisible ? 'true' : 'false') + '" ' +
      'class="w-11 h-6 rounded-full transition-colors relative ' + (Store.state.labelsVisible ? 'bg-alert-cyan/40' : 'bg-base-600') + '">' +
      '<span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-ink-100 transition-transform ' + (Store.state.labelsVisible ? 'translate-x-5' : '') + '"></span>' +
      '</button>' +
      '</div>';

    if (activeBoxNumber) {
      const mastery = window.FirstDue.Map._internal.masteryForBox(activeBoxNumber);
      const stats = Store.getBoxStats(activeBoxNumber);
      const streets = window.FirstDue.Quiz.streetsForBox(activeBoxNumber);

      body += UI.sectionHeader('Box ' + activeBoxNumber + ' Overview', 'crosshair');
      body += '<div class="bg-base-800 border border-base-700 rounded-md p-3 mb-4">' +
        '<div class="flex items-center justify-between mb-2">' +
        '<span class="font-mono font-700 text-lg">Box ' + esc(activeBoxNumber) + '</span>' +
        UI.masteryBadge(mastery.level, mastery.ratio) +
        '</div>' +
        '<div class="text-[11px] text-ink-500 font-mono mb-3">' +
        streets.length + ' street' + (streets.length === 1 ? '' : 's') + ' in this box' +
        '</div>' +
        '<div class="grid grid-cols-3 gap-1.5">' +
        '<button data-action="go-quiz-mode" data-box="' + esc(activeBoxNumber) + '" data-mode="name-street" class="text-[10px] font-display font-600 uppercase tracking-wide py-2 rounded border border-alert-cyan/40 hover:bg-alert-cyan/10 text-alert-cyan transition-colors flex flex-col items-center gap-1"><i data-lucide="type" class="w-3.5 h-3.5"></i>Name It</button>' +
        '<button data-action="go-quiz-mode" data-box="' + esc(activeBoxNumber) + '" data-mode="locate-street" class="text-[10px] font-display font-600 uppercase tracking-wide py-2 rounded border border-alert-green/40 hover:bg-alert-green/10 text-alert-green transition-colors flex flex-col items-center gap-1"><i data-lucide="map-pin" class="w-3.5 h-3.5"></i>Locate It</button>' +
        '<button data-action="go-quiz-mode" data-box="' + esc(activeBoxNumber) + '" data-mode="box-identifier" class="text-[10px] font-display font-600 uppercase tracking-wide py-2 rounded border border-alert-amber/40 hover:bg-alert-amber/10 text-alert-amber transition-colors flex flex-col items-center gap-1"><i data-lucide="locate" class="w-3.5 h-3.5"></i>ID Box</button>' +
        '</div>' +
        '</div>';

      // Per-street stats
      if (streets.length > 0) {
        body += UI.sectionHeader('Street Roster', 'list-checks');
        body += '<div class="space-y-1.5">';
        streets
          .slice()
          .sort(function (a, b) { return (a.properties.name || '').localeCompare(b.properties.name || ''); })
          .forEach(function (f) {
            const ss = stats.streetStats[f.id];
            const ratio = ss && ss.seen > 0 ? ss.correct / ss.seen : null;
            let lvl = 'unstudied';
            if (ratio !== null) {
              const T = FD.MASTERY_THRESHOLDS;
              lvl = ratio >= T.MASTERED ? 'mastered' : (ratio >= T.REVIEW ? 'review' : 'failing');
            }
            body += '<div class="bg-base-800 border border-base-700 rounded-md px-2.5 py-1.5 flex items-center justify-between gap-2">' +
              '<span class="font-mono text-xs truncate">' + esc(f.properties.name || 'Unnamed') + '</span>' +
              UI.masteryBadge(lvl, ratio) +
              '</div>';
          });
        body += '</div>';
      }
    } else {
      body += UI.emptyState('Select a box above (or tap one on the map / dashboard) to pan, zoom, and dim the map to that territory.', 'crosshair');
    }

    return UI.wrapTabPanel(body);
  }

  // ---------------------------------------------------------------------
  // QUIZ TAB (Module 3 entry point)
  // ---------------------------------------------------------------------

  const QUIZ_MODE_META = {
    'name-street': { label: 'Name the Street', icon: 'type', color: 'cyan', desc: 'A street segment is highlighted on the map. Type its name.' },
    'locate-street': { label: 'Locate the Street', icon: 'map-pin', color: 'green', desc: 'You\'ll be told a street name. Tap it on the map.' },
    'box-identifier': { label: 'Box Identifier', icon: 'locate', color: 'amber', desc: 'A pin drops somewhere on the map. Identify which Response Box it\'s in.' },
  };

  function renderQuizTab() {
    const quiz = Store.state.quiz;

    if (quiz.phase === 'IDLE') {
      return UI.wrapTabPanel(renderQuizSetup());
    }
    if (quiz.phase === 'RESULTS_SCORE') {
      return UI.wrapTabPanel(renderQuizResults());
    }
    return UI.wrapTabPanel(renderQuizActiveSidebar());
  }

  function renderQuizSetup() {
    const boxes = Store.state.boxes.features || [];
    let body = '';
    body += UI.sectionHeader('Start a Quiz', 'brain-circuit');

    if (boxes.length === 0) {
      body += UI.emptyState('Define at least one Response Box with streets before starting a quiz.', 'brain-circuit');
      return body;
    }

    body += '<label class="block mb-3">' +
      '<span class="text-[11px] text-ink-500 font-mono">Response Box</span>' +
      '<select id="quiz-box-select" class="mt-1 w-full bg-base-800 border border-base-600 rounded px-2.5 py-2 font-mono text-sm focus:border-alert-cyan/60">' +
      '<option value="">— Choose a box —</option>' +
      UI.boxOptionsHtml(boxes, Store.state.activeBoxNumber, false) +
      '</select>' +
      '<span class="text-[10px] text-ink-500 font-mono mt-1 block">Not required for Box Identifier mode.</span>' +
      '</label>';

    body += '<div class="space-y-2">';
    Object.keys(QUIZ_MODE_META).forEach(function (mode) {
      const m = QUIZ_MODE_META[mode];
      const colorCls = {
        cyan: 'border-alert-cyan/40 hover:bg-alert-cyan/10 text-alert-cyan',
        green: 'border-alert-green/40 hover:bg-alert-green/10 text-alert-green',
        amber: 'border-alert-amber/40 hover:bg-alert-amber/10 text-alert-amber',
      }[m.color];
      body += '<button data-action="start-quiz" data-mode="' + mode + '" class="w-full text-left p-3 rounded-md border ' + colorCls + ' transition-colors flex items-start gap-3">' +
        '<i data-lucide="' + m.icon + '" class="w-5 h-5 shrink-0 mt-0.5"></i>' +
        '<div>' +
        '<div class="font-display font-700 text-sm uppercase tracking-wide">' + esc(m.label) + '</div>' +
        '<div class="text-[11px] text-ink-300 mt-0.5 leading-relaxed">' + esc(m.desc) + '</div>' +
        '</div>' +
        '</button>';
    });
    body += '</div>';

    return body;
  }

  function renderQuizActiveSidebar() {
    const quiz = Store.state.quiz;
    const meta = QUIZ_MODE_META[quiz.mode] || { label: quiz.mode, icon: 'brain-circuit' };

    let body = '';
    body += '<div class="flex items-center justify-between mb-3">' +
      '<div class="flex items-center gap-2">' +
      '<i data-lucide="' + meta.icon + '" class="w-4 h-4 text-alert-cyan"></i>' +
      '<span class="font-display font-700 text-sm uppercase tracking-wide">' + esc(meta.label) + '</span>' +
      '</div>' +
      '<button data-action="end-quiz" class="text-[10px] font-display font-600 uppercase tracking-wide px-2 py-1 rounded border border-base-600 hover:border-alert-red/50 text-ink-500 hover:text-alert-red transition-colors">End Quiz</button>' +
      '</div>';

    if (quiz.boxNumber) {
      body += '<div class="text-[11px] text-ink-500 font-mono mb-3">Box ' + esc(quiz.boxNumber) + '</div>';
    }

    const progress = quiz.totalQuestions > 0 ? (quiz.questionIndex / quiz.totalQuestions) : 0;
    const progressShown = quiz.phase === 'ANSWER_SUBMITTED' ? (quiz.questionIndex + 1) / quiz.totalQuestions : progress;
    body += '<div class="mb-4">' +
      '<div class="flex justify-between text-[10px] font-mono text-ink-500 mb-1">' +
      '<span>Question ' + Math.min(quiz.questionIndex + 1, quiz.totalQuestions) + ' / ' + quiz.totalQuestions + '</span>' +
      '<span>' + Math.round(progressShown * 100) + '%</span>' +
      '</div>' +
      '<div class="h-1.5 bg-base-700 rounded-full overflow-hidden">' +
      '<div class="h-full bg-alert-cyan transition-all duration-300" style="width:' + Math.round(progressShown * 100) + '%"></div>' +
      '</div>' +
      '</div>';

    body += '<p class="text-[11px] text-ink-500 leading-relaxed bg-base-800 border border-base-700 rounded-md p-2.5">The active question and answer controls appear at the bottom of the map. On mobile, swipe the panel down to see the full map.</p>';

    return body;
  }

  function renderQuizResults() {
    const summary = window.FirstDue.Quiz.getSessionSummary();
    const meta = QUIZ_MODE_META[summary.mode] || { label: summary.mode };

    let scoreColor = 'text-alert-red';
    if (summary.pct >= 80) scoreColor = 'text-alert-green';
    else if (summary.pct >= 50) scoreColor = 'text-alert-amber';

    let body = '';
    body += '<div class="text-center py-4">' +
      '<div class="text-[11px] font-mono uppercase tracking-wider text-ink-500 mb-1">' + esc(meta.label) + (summary.boxNumber ? ' · Box ' + esc(summary.boxNumber) : '') + '</div>' +
      '<div class="font-display font-700 text-5xl ' + scoreColor + '">' + summary.pct + '%</div>' +
      '<div class="text-sm text-ink-300 mt-1 font-mono">' + summary.correct + ' / ' + summary.total + ' correct</div>' +
      '</div>';

    if (summary.hardestName) {
      body += '<div class="bg-base-800 border border-alert-amber/30 rounded-md p-2.5 mb-4 flex items-center gap-2">' +
        '<i data-lucide="alert-triangle" class="w-4 h-4 text-alert-amber shrink-0"></i>' +
        '<span class="text-xs text-ink-100">Toughest this round: <span class="font-mono font-700">' + esc(summary.hardestName) + '</span></span>' +
        '</div>';
    }

    body += '<div class="grid grid-cols-2 gap-2">' +
      '<button data-action="retry-quiz" data-mode="' + esc(summary.mode) + '" data-box="' + esc(summary.boxNumber || '') + '" class="text-xs font-display font-600 uppercase tracking-wide py-2.5 rounded border border-alert-cyan/40 hover:bg-alert-cyan/10 text-alert-cyan transition-colors flex items-center justify-center gap-1.5"><i data-lucide="rotate-cw" class="w-3.5 h-3.5"></i>Retry</button>' +
      '<button data-action="quiz-new-session" class="text-xs font-display font-600 uppercase tracking-wide py-2.5 rounded border border-base-600 hover:border-base-500 text-ink-300 transition-colors flex items-center justify-center gap-1.5"><i data-lucide="list" class="w-3.5 h-3.5"></i>New Session</button>' +
      '</div>';

    if (summary.boxNumber) {
      body += '<button data-action="focus-box" data-box="' + esc(summary.boxNumber) + '" class="w-full mt-2 text-xs font-display font-600 uppercase tracking-wide py-2.5 rounded border border-base-600 hover:border-base-500 text-ink-300 transition-colors flex items-center justify-center gap-1.5"><i data-lucide="map" class="w-3.5 h-3.5"></i>Back to Box on Map</button>';
    }

    return body;
  }

  // ---------------------------------------------------------------------
  // QUIZ MAP OVERLAY (bottom bar over the map — question + answer input)
  // ---------------------------------------------------------------------

  function renderQuizOverlay() {
    const overlay = document.getElementById('quiz-overlay');
    if (!overlay) return;
    const quiz = Store.state.quiz;

    if (quiz.phase === 'IDLE' || quiz.phase === 'RESULTS_SCORE') {
      overlay.classList.add('hidden');
      overlay.innerHTML = '';
      return;
    }

    overlay.classList.remove('hidden');

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
            window.FirstDue.Quiz.submitNameStreetAnswer(input.value);
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

  /**
   * Persist a newly-drawn box, then asynchronously query Overpass for named
   * streets inside it and add any that aren't already present. Always saves
   * the box immediately (independent of the street lookup outcome) so a
   * slow/failed network call never blocks box creation — per spec, the user
   * can add missing streets manually afterward.
   *
   * @param {Array<[number,number]>} verts - drawing vertices, [lat,lng] pairs
   * @param {string} boxNumber
   * @param {string} label
   */
  async function saveNewBoxWithStreetLookup(verts, boxNumber, label) {
    const feature = window.FirstDue.Map.buildPolygonFeatureFromVertices(verts, { boxNumber: boxNumber, label: label });
    Store.addBox(feature);
    window.FirstDue.Map.cancelDrawing();
    hideDrawBanner();
    syncTopBarDrawButtons();
    renderActiveTab();

    const loadingToastId = Toast.show('Box ' + boxNumber + ' saved. Looking up streets…', 'info', { sticky: true });

    let result;
    try {
      result = await window.FirstDue.Map.fetchStreetsForPolygon(verts, boxNumber);
    } catch (err) {
      console.error('[FirstDue] Unexpected error during street lookup:', err);
      result = { features: [], rawWayCount: 0, error: 'Street lookup failed unexpectedly. You can add streets manually below.' };
    }

    if (loadingToastId) Toast.dismiss(loadingToastId);

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

    result.features.forEach(function (sf) {
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
      existingNames.push({ normName: normName, midpoint: midpoint });
      addedCount++;
    });

    renderActiveTab();

    if (result.error) {
      Toast.show('Box ' + boxNumber + ': ' + result.error, 'warn', { duration: 7000 });
    } else if (addedCount === 0) {
      Toast.show('Box ' + boxNumber + ': no named streets found in OpenStreetMap for this area. Add streets manually below.', 'warn', { duration: 7000 });
    } else {
      let msg = 'Box ' + boxNumber + ': added ' + addedCount + ' street' + (addedCount === 1 ? '' : 's') + ' from OpenStreetMap.';
      if (skippedDupeCount > 0) msg += ' (' + skippedDupeCount + ' already present)';
      msg += ' Review the list and add anything missing.';
      Toast.show(msg, 'success', { duration: 8000 });
    }
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
            window.FirstDue.Map.focusBox(el.dataset.box);
            Store.setActiveTab('study');
            renderActiveTab();
            collapseSheetIfNeeded();
          });
          break;

        case 'go-quiz':
          el.addEventListener('click', function () {
            window.FirstDue.Map.focusBox(el.dataset.box);
            Store.setActiveTab('quiz');
            renderActiveTab();
          });
          break;

        case 'go-quiz-mode':
          el.addEventListener('click', function () {
            const mode = el.dataset.mode;
            const box = el.dataset.box;
            Store.setActiveTab('quiz');
            window.FirstDue.Quiz.startQuiz(mode, box);
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
            window.FirstDue.Map.setLabelsVisible(newVal);
            renderActiveTab();
            syncTopBarLabelButtons();
          });
          break;

        case 'start-draw-box':
          el.addEventListener('click', function () {
            window.FirstDue.Map.startDrawing();
            renderActiveTab();
            syncTopBarDrawButtons();
            showDrawBanner('box');
          });
          break;

        case 'cancel-draw-box':
          el.addEventListener('click', function () {
            window.FirstDue.Map.cancelDrawing();
            renderActiveTab();
            syncTopBarDrawButtons();
            hideDrawBanner();
          });
          break;

        case 'finish-draw-box':
          el.addEventListener('click', function () {
            const verts = window.FirstDue.Map.finishDrawing();
            if (!verts) return;
            const numberInput = document.getElementById('new-box-number');
            const labelInput = document.getElementById('new-box-label');
            const boxNumber = (numberInput && numberInput.value.trim()) || '';
            const label = (labelInput && labelInput.value.trim()) || '';

            if (!boxNumber) {
              Toast.show('Enter a Box Number before saving.', 'warn');
              return;
            }
            const existing = window.FirstDue.Map.findBoxByNumber(boxNumber);
            if (existing) {
              Toast.show('Box ' + boxNumber + ' already exists. Choose a different number.', 'error');
              return;
            }

            saveNewBoxWithStreetLookup(verts, boxNumber, label);
          });
          break;

        case 'delete-box':
          el.addEventListener('click', function () {
            const boxId = el.dataset.boxId;
            const boxNumber = el.dataset.box;
            const ok = window.confirm('Delete Box ' + boxNumber + '? Streets assigned to it will become unassigned. This cannot be undone.');
            if (!ok) return;
            Store.removeBox(boxId);
            Store.state.streets.features.forEach(function (f) {
              if (f.properties && String(f.properties.boxNumber) === String(boxNumber)) {
                Store.updateStreet(f.id, function (ff) { ff.properties.boxNumber = null; return ff; });
              }
            });
            Store.resetBoxStats(boxNumber);
            if (Store.state.activeBoxNumber === boxNumber) window.FirstDue.Map.clearFocus();
            renderActiveTab();
            Toast.show('Box ' + boxNumber + ' deleted.', 'success');
          });
          break;

        case 'start-draw-street':
          el.addEventListener('click', function () {
            window.FirstDue.Map.startStreetDrawing();
            window.FirstDue._streetDrawActive = true;
            renderActiveTab();
            syncTopBarDrawButtons();
            showDrawBanner('street');
          });
          break;

        case 'cancel-draw-street':
          el.addEventListener('click', function () {
            window.FirstDue.Map.cancelStreetDrawing();
            window.FirstDue._streetDrawActive = false;
            renderActiveTab();
            syncTopBarDrawButtons();
            hideDrawBanner();
          });
          break;

        case 'finish-draw-street':
          el.addEventListener('click', function () {
            const nameInput = document.getElementById('new-street-name');
            const boxSelect = document.getElementById('new-street-box');
            const name = (nameInput && nameInput.value.trim()) || '';
            const boxNumber = (boxSelect && boxSelect.value) || null;

            if (!name) {
              Toast.show('Enter a street name before saving.', 'warn');
              return;
            }

            const feature = window.FirstDue.Map.finishStreetDrawing(name);
            if (!feature) return;
            feature.properties.boxNumber = boxNumber || null;
            Store.addStreet(feature);
            window.FirstDue._streetDrawActive = false;
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

        case 'submit-name-street':
          el.addEventListener('click', function () {
            const input = document.getElementById('quiz-answer-input');
            window.FirstDue.Quiz.submitNameStreetAnswer(input ? input.value : '');
          });
          break;

        case 'submit-box-identifier':
          el.addEventListener('click', function () {
            window.FirstDue.Quiz.submitBoxIdentifierAnswer(el.dataset.box);
          });
          break;

        case 'next-question':
          el.addEventListener('click', function () {
            window.FirstDue.Quiz.nextQuestion();
            renderActiveTab();
          });
          break;

        case 'end-quiz':
          el.addEventListener('click', function () {
            window.FirstDue.Quiz.endQuiz();
            renderActiveTab();
          });
          break;

        case 'start-quiz':
          el.addEventListener('click', function () {
            const mode = el.dataset.mode;
            const select = document.getElementById('quiz-box-select');
            const box = select ? select.value : '';
            window.FirstDue.Quiz.startQuiz(mode, box || null);
            renderActiveTab();
          });
          break;

        case 'retry-quiz':
          el.addEventListener('click', function () {
            const mode = el.dataset.mode;
            const box = el.dataset.box || null;
            window.FirstDue.Quiz.startQuiz(mode, box);
            renderActiveTab();
          });
          break;

        case 'quiz-new-session':
          el.addEventListener('click', function () {
            Store.quizDispatch('RESET');
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
          window.FirstDue.Map.focusBox(studySelect.value);
        } else {
          Store.setActiveBoxNumber(null);
          window.FirstDue.Map.clearFocus();
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
    const active = Store.state.drawingActive || !!window.FirstDue._streetDrawActive;
    [document.getElementById('btn-draw-mode'), document.getElementById('btn-draw-mode-m')].forEach(function (btn) {
      if (!btn) return;
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      const icon = btn.querySelector('i');
      if (!icon) return;
      icon.classList.toggle('text-alert-amber', active);
      icon.classList.toggle('text-ink-300', !active);
    });
  }

  function showDrawBanner(kind) {
    const banner = document.getElementById('draw-banner');
    if (!banner) return;
    banner.classList.remove('hidden');
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
        if (window.FirstDue.Map.findBoxByNumber(boxNumber.trim())) {
          Toast.show('Box ' + boxNumber.trim() + ' already exists.', 'error');
          return;
        }
        const label = window.prompt('Optional label for this box (or leave blank):') || '';
        const v = window.FirstDue.Map.finishDrawing();
        if (!v) return;
        saveNewBoxWithStreetLookup(v, boxNumber.trim(), label.trim());
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
        const feature = window.FirstDue.Map.finishStreetDrawing(name.trim());
        if (!feature) return;
        Store.addStreet(feature);
        window.FirstDue._streetDrawActive = false;
        hideDrawBanner();
        syncTopBarDrawButtons();
        renderActiveTab();
        Toast.show('Street "' + name.trim() + '" saved.', 'success');
      }
    });

    newCancel.addEventListener('click', function () {
      if (kind === 'box') {
        window.FirstDue.Map.cancelDrawing();
      } else {
        window.FirstDue.Map.cancelStreetDrawing();
        window.FirstDue._streetDrawActive = false;
      }
      hideDrawBanner();
      syncTopBarDrawButtons();
      renderActiveTab();
    });

    updateDrawBannerFinishState();
  }

  function hideDrawBanner() {
    const banner = document.getElementById('draw-banner');
    if (banner) banner.classList.add('hidden');
  }

  function updateDrawBannerFinishState() {
    const finishBtn = document.getElementById('btn-finish-draw');
    if (!finishBtn) return;
    if (window.FirstDue._streetDrawActive) {
      finishBtn.disabled = window.FirstDue.Map.getStreetDrawVertexCount() < 2;
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
  window.FirstDue = window.FirstDue || {};
  window.FirstDue.UI = window.FirstDue.UI || {};
  Object.assign(window.FirstDue.UI, {
    renderStudyTab: renderStudyTab,
    renderQuizTab: renderQuizTab,
    renderQuizOverlay: renderQuizOverlay,
    flashFeedback: flashFeedback,
    bindDynamicHandlers: bindDynamicHandlers,
    syncTopBarLabelButtons: syncTopBarLabelButtons,
    syncTopBarDrawButtons: syncTopBarDrawButtons,
    showDrawBanner: showDrawBanner,
    hideDrawBanner: hideDrawBanner,
    onDrawVertexAdded: onDrawVertexAdded,
    onStreetDrawVertexAdded: onStreetDrawVertexAdded,
    collapseSheetIfNeeded: collapseSheetIfNeeded,
    saveNewBoxWithStreetLookup: saveNewBoxWithStreetLookup,
  });

  // Override renderActiveTab to also re-render the quiz overlay (overlay is
  // outside the tab content containers, so it needs explicit refresh too).
  const originalRenderActiveTab = window.FirstDue.UI.renderActiveTab;
  window.FirstDue.UI.renderActiveTab = function () {
    originalRenderActiveTab();
    renderQuizOverlay();
    syncTopBarLabelButtons();
    syncTopBarDrawButtons();
  };

})();
