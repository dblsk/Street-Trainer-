// ============================================================================
// BOX RECALL — Box Study & Active Recall App
// app-ui.js — Tab rendering, sidebar/mobile sheet wiring, modals
// (Part 1: Home tab + detail sheet, Manage tab (Box Builder), shared helpers, modals)
// ============================================================================

(function () {
  'use strict';

  const FD = window.BoxRecall;
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
    home: 'HOME',
    builder: 'MANAGE',
  };

  function renderActiveTab() {
    const tab = Store.state.activeTab;
    const desktopRoot = document.getElementById('tab-content-desktop');
    const mobileRoot = document.getElementById('tab-content-mobile');
    const sheetTitle = document.getElementById('sheet-title');

    let html = '';
    switch (tab) {
      case 'home': html = renderHomeTab(); break;
      case 'builder': html = renderBuilderTab(); break;
      default: html = renderHomeTab();
    }

    desktopRoot.innerHTML = html;
    mobileRoot.innerHTML = html;
    if (sheetTitle) sheetTitle.textContent = TAB_TITLES[tab] || 'BOX RECALL';

    refreshIcons(desktopRoot);
    refreshIcons(mobileRoot);

    bindDynamicHandlers(desktopRoot);
    bindDynamicHandlers(mobileRoot);

    syncTabIndicators();
  }

  /**
   * bindDynamicHandlers is implemented in app-ui-part2.js and attached to
   * window.BoxRecall.UI after that file loads. This thin wrapper lets
   * functions defined in this file (part1) call it without a hard
   * compile-time dependency on load order.
   */
  function bindDynamicHandlers(root) {
    if (window.BoxRecall.UI.bindDynamicHandlers) {
      window.BoxRecall.UI.bindDynamicHandlers(root);
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
  // HOME TAB — box list ranked by what needs attention; tap a box to open
  // its detail sheet (study/quiz). Replaces Dashboard + Study + Quiz tabs.
  // ---------------------------------------------------------------------

  // Sort priority for "what needs attention first": failing -> review ->
  // unstudied -> mastered. Within a tier, lower ratio (worse performance)
  // sorts first; ties break by box number for a stable order.
  const MASTERY_SORT_RANK = { failing: 0, review: 1, unstudied: 2, mastered: 3 };

  // Shared across the Home tab's detail sheet (part1) and the legacy Quiz
  // tab renderers (part2, pending removal once Home fully replaces it).
  // Exported via UI.QUIZ_MODE_META for part2's cross-file reference.
  const QUIZ_MODE_META = {
    'name-street': { label: 'Name the Street', icon: 'type', color: 'cyan', desc: 'A street segment is highlighted on the map. Type its name.' },
    'locate-street': { label: 'Locate the Street', icon: 'map-pin', color: 'green', desc: 'You\'ll be told a street name. Tap it on the map.' },
    'box-identifier': { label: 'Box Identifier', icon: 'locate', color: 'amber', desc: 'A pin drops somewhere on the map. Identify which Response Box it\'s in.' },
  };

  function sortBoxesByAttention(boxes) {
    const MapMod = window.BoxRecall.Map;
    return boxes.slice().sort(function (a, b) {
      const ma = MapMod._internal.masteryForBox(a.properties.boxNumber);
      const mb = MapMod._internal.masteryForBox(b.properties.boxNumber);
      const ra = MASTERY_SORT_RANK[ma.level] !== undefined ? MASTERY_SORT_RANK[ma.level] : 99;
      const rb = MASTERY_SORT_RANK[mb.level] !== undefined ? MASTERY_SORT_RANK[mb.level] : 99;
      if (ra !== rb) return ra - rb;
      if (ma.ratio !== null && mb.ratio !== null && ma.ratio !== mb.ratio) return ma.ratio - mb.ratio;
      return String(a.properties.boxNumber).localeCompare(String(b.properties.boxNumber), undefined, { numeric: true });
    });
  }

  function renderHomeTab() {
    const boxes = Store.state.boxes.features || [];
    const quiz = Store.state.quiz;

    let body = '';

    if (boxes.length === 0) {
      body += emptyState('No Response Boxes defined yet. Head to Manage to import or draw your first box.', 'map');
      return wrapTabPanel(body);
    }

    // Summary tiles
    const summary = computeOverallSummary(boxes);
    body += '<div class="grid grid-cols-3 gap-2 mb-4">' +
      statTile('Mastered', summary.mastered, 'text-alert-green') +
      statTile('Review', summary.review, 'text-alert-amber') +
      statTile('Failing/New', summary.failing + summary.unstudied, 'text-alert-red') +
      '</div>';

    // If a quiz is active or showing results, surface that box's sheet
    // immediately — the user is mid-session and shouldn't have to find it
    // in the list again.
    const quizBoxNumber = (quiz.phase !== 'IDLE' && quiz.boxNumber) ? quiz.boxNumber : null;
    const openBoxNumber = quizBoxNumber || Store.state.activeBoxNumber;

    if (openBoxNumber) {
      body += renderBoxDetailSheet(openBoxNumber);
    }

    // Box list, ranked by what needs attention first.
    body += sectionHeader('Your Boxes', 'list');
    body += '<div class="space-y-2 mb-4">';
    sortBoxesByAttention(boxes).forEach(function (f) {
      body += renderBoxCard(f, f.properties.boxNumber === openBoxNumber);
    });
    body += '</div>';

    return wrapTabPanel(body);
  }

  /**
   * The detail sheet for a single box — shown above the box list when a box
   * is "open" (either explicitly tapped, or because a quiz is in progress
   * for it). Content depends on Store.state.quiz.phase:
   *   - IDLE: street roster + Study/Quiz mode buttons (start a session)
   *   - QUIZ_ONGOING / ANSWER_SUBMITTED: progress bar + End Quiz (the actual
   *     question/answer UI lives in the map's quiz overlay, unchanged)
   *   - RESULTS_SCORE: score summary + retry/new-session actions
   *
   * Only IDLE shows a "close" button — once a quiz starts, End Quiz is the
   * way out (matches the existing quiz state machine, which doesn't support
   * abandoning mid-quiz except via endQuiz()).
   */
  function renderBoxDetailSheet(boxNumber) {
    const quiz = Store.state.quiz;
    const isThisBoxQuizzing = quiz.phase !== 'IDLE' && quiz.boxNumber === boxNumber;

    let inner = '';

    if (isThisBoxQuizzing) {
      inner += quiz.phase === 'RESULTS_SCORE' ? renderQuizResultsForSheet() : renderQuizProgressForSheet();
    } else {
      inner += renderBoxStudyOverview(boxNumber);
    }

    const closeButton = isThisBoxQuizzing
      ? ''
      : '<button data-action="close-box-sheet" title="Close" class="w-7 h-7 rounded border border-base-600 hover:border-base-500 flex items-center justify-center text-ink-500 hover:text-ink-300 transition-colors"><i data-lucide="x" class="w-4 h-4"></i></button>';

    return '<div class="bg-base-800 border border-alert-cyan/30 rounded-md p-3 mb-4">' +
      '<div class="flex items-center justify-between mb-2.5">' +
      '<span class="font-mono font-700 text-base text-ink-100 flex items-center gap-1.5"><i data-lucide="map-pin" class="w-4 h-4 text-alert-cyan"></i> Box ' + esc(boxNumber) + '</span>' +
      closeButton +
      '</div>' +
      inner +
      '</div>';
  }

  /**
   * IDLE-state content: mastery badge, street roster, and the three
   * Study/Quiz mode buttons. Equivalent to the old Study tab's "Box
   * Overview" + "Street Roster" sections, for one box.
   */
  function renderBoxStudyOverview(boxNumber) {
    const mastery = window.BoxRecall.Map._internal.masteryForBox(boxNumber);
    const stats = Store.getBoxStats(boxNumber);
    const streets = window.BoxRecall.Quiz.streetsForBox(boxNumber);

    let body = '';
    body += '<div class="flex items-center justify-between mb-3">' +
      masteryBadge(mastery.level, mastery.ratio) +
      '<div class="flex items-center gap-2">' +
      '<span class="text-[11px] text-ink-500 font-mono">' + streets.length + ' street' + (streets.length === 1 ? '' : 's') + '</span>' +
      (mastery.ratio !== null
        ? '<button data-action="reset-box-stats" data-box="' + esc(boxNumber) + '" title="Reset stats for this box" class="w-6 h-6 rounded border border-base-600 hover:border-alert-red/50 text-ink-500 hover:text-alert-red transition-colors flex items-center justify-center"><i data-lucide="rotate-ccw" class="w-3 h-3"></i></button>'
        : '') +
      '</div>' +
      '</div>';

    body += '<div class="grid grid-cols-3 gap-1.5 mb-3">' +
      '<button data-action="go-quiz-mode" data-box="' + esc(boxNumber) + '" data-mode="name-street" class="text-[10px] font-display font-600 uppercase tracking-wide py-2 rounded border border-alert-cyan/40 hover:bg-alert-cyan/10 text-alert-cyan transition-colors flex flex-col items-center gap-1"><i data-lucide="type" class="w-3.5 h-3.5"></i>Name It</button>' +
      '<button data-action="go-quiz-mode" data-box="' + esc(boxNumber) + '" data-mode="locate-street" class="text-[10px] font-display font-600 uppercase tracking-wide py-2 rounded border border-alert-green/40 hover:bg-alert-green/10 text-alert-green transition-colors flex flex-col items-center gap-1"><i data-lucide="map-pin" class="w-3.5 h-3.5"></i>Locate It</button>' +
      '<button data-action="go-quiz-mode" data-box="' + esc(boxNumber) + '" data-mode="box-identifier" class="text-[10px] font-display font-600 uppercase tracking-wide py-2 rounded border border-alert-amber/40 hover:bg-alert-amber/10 text-alert-amber transition-colors flex flex-col items-center gap-1"><i data-lucide="locate" class="w-3.5 h-3.5"></i>ID Box</button>' +
      '</div>';

    if (streets.length > 0) {
      body += '<div class="space-y-1 max-h-[180px] overflow-y-auto pr-0.5">';
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
          body += '<div class="bg-base-900 border border-base-700 rounded px-2 py-1 flex items-center justify-between gap-2">' +
            '<span class="font-mono text-xs truncate">' + esc(f.properties.name || 'Unnamed') + '</span>' +
            masteryBadge(lvl, ratio) +
            '</div>';
        });
      body += '</div>';
    }

    return body;
  }

  /**
   * QUIZ_ONGOING / ANSWER_SUBMITTED content for the sheet: progress bar +
   * End Quiz. The actual question/answer controls remain in the map's quiz
   * overlay (renderQuizOverlay), unchanged — this is just the sheet-side
   * progress indicator + escape hatch, matching the old Quiz tab's
   * "active sidebar".
   */
  function renderQuizProgressForSheet() {
    const quiz = Store.state.quiz;
    const meta = QUIZ_MODE_META[quiz.mode] || { label: quiz.mode, icon: 'brain-circuit' };

    const progress = quiz.totalQuestions > 0 ? (quiz.questionIndex / quiz.totalQuestions) : 0;
    const progressShown = quiz.phase === 'ANSWER_SUBMITTED' ? (quiz.questionIndex + 1) / quiz.totalQuestions : progress;

    let body = '';
    body += '<div class="flex items-center justify-between mb-3">' +
      '<span class="text-xs font-display font-700 uppercase tracking-wide text-ink-100 flex items-center gap-1.5"><i data-lucide="' + meta.icon + '" class="w-3.5 h-3.5 text-alert-cyan"></i>' + esc(meta.label) + '</span>' +
      '<button data-action="end-quiz" class="text-[10px] font-display font-600 uppercase tracking-wide px-2 py-1 rounded border border-base-600 hover:border-alert-red/50 text-ink-500 hover:text-alert-red transition-colors">End Quiz</button>' +
      '</div>';

    body += '<div class="mb-2">' +
      '<div class="flex justify-between text-[10px] font-mono text-ink-500 mb-1">' +
      '<span>Question ' + Math.min(quiz.questionIndex + 1, quiz.totalQuestions) + ' / ' + quiz.totalQuestions + '</span>' +
      '<span>' + Math.round(progressShown * 100) + '%</span>' +
      '</div>' +
      '<div class="h-1.5 bg-base-700 rounded-full overflow-hidden">' +
      '<div class="h-full bg-alert-cyan transition-all duration-300" style="width:' + Math.round(progressShown * 100) + '%"></div>' +
      '</div>' +
      '</div>';

    body += '<p class="text-[11px] text-ink-500 leading-relaxed">The active question and answer controls appear at the bottom of the map. On mobile, swipe the panel down to see the full map.</p>';

    return body;
  }

  /**
   * RESULTS_SCORE content for the sheet: score, hardest street, retry/new
   * session — equivalent to the old Quiz tab's results screen.
   */
  function renderQuizResultsForSheet() {
    const summary = window.BoxRecall.Quiz.getSessionSummary();
    const meta = QUIZ_MODE_META[summary.mode] || { label: summary.mode };

    let scoreColor = 'text-alert-red';
    if (summary.pct >= 80) scoreColor = 'text-alert-green';
    else if (summary.pct >= 50) scoreColor = 'text-alert-amber';

    let body = '';
    body += '<div class="text-center py-2">' +
      '<div class="text-[11px] font-mono uppercase tracking-wider text-ink-500 mb-1">' + esc(meta.label) + '</div>' +
      '<div class="font-display font-700 text-5xl ' + scoreColor + '">' + summary.pct + '%</div>' +
      '<div class="text-sm text-ink-300 mt-1 font-mono">' + summary.correct + ' / ' + summary.total + ' correct</div>' +
      '</div>';

    if (summary.hardestName) {
      body += '<div class="bg-base-900 border border-alert-amber/30 rounded-md p-2.5 mb-3 flex items-center gap-2">' +
        '<i data-lucide="alert-triangle" class="w-4 h-4 text-alert-amber shrink-0"></i>' +
        '<span class="text-xs text-ink-100">Toughest this round: <span class="font-mono font-700">' + esc(summary.hardestName) + '</span></span>' +
        '</div>';
    }

    body += '<div class="grid grid-cols-2 gap-2">' +
      '<button data-action="retry-quiz" data-mode="' + esc(summary.mode) + '" data-box="' + esc(summary.boxNumber || '') + '" class="text-xs font-display font-600 uppercase tracking-wide py-2.5 rounded border border-alert-cyan/40 hover:bg-alert-cyan/10 text-alert-cyan transition-colors flex items-center justify-center gap-1.5"><i data-lucide="rotate-cw" class="w-3.5 h-3.5"></i>Retry</button>' +
      '<button data-action="quiz-new-session" class="text-xs font-display font-600 uppercase tracking-wide py-2.5 rounded border border-base-600 hover:border-base-500 text-ink-300 transition-colors flex items-center justify-center gap-1.5"><i data-lucide="list" class="w-3.5 h-3.5"></i>Done</button>' +
      '</div>';

    return body;
  }

  /**
   * A single box's row in the Home list: tappable to open its detail sheet.
   * Shows mastery badge, street count, and the "hardest street" hint (same
   * data boxDetailRow used to show). The currently-open box is highlighted.
   */
  function renderBoxCard(feature, isOpen) {
    const boxNumber = feature.properties.boxNumber;
    const MapMod = window.BoxRecall.Map;
    const mastery = MapMod._internal.masteryForBox(boxNumber);
    const stats = Store.getBoxStats(boxNumber);
    const streetCount = window.BoxRecall.Quiz.streetsForBox(boxNumber).length;

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

    const openCls = isOpen ? ' ring-2 ring-alert-cyan/50' : '';

    return '<button data-action="open-box-sheet" data-box="' + esc(boxNumber) + '" ' +
      'class="w-full text-left bg-base-800 border border-base-700 rounded-md p-2.5 hover:border-alert-cyan/40 transition-colors' + openCls + '">' +
      '<div class="flex items-center justify-between mb-1.5">' +
      '<span class="font-mono font-700 text-sm text-ink-100 flex items-center gap-1.5"><i data-lucide="map-pin" class="w-3.5 h-3.5"></i> Box ' + esc(boxNumber) + '</span>' +
      masteryBadge(mastery.level, mastery.ratio) +
      '</div>' +
      '<div class="flex items-center justify-between text-[11px] text-ink-500 font-mono">' +
      '<span>' + streetCount + ' street' + (streetCount === 1 ? '' : 's') + '</span>' +
      '<span class="truncate max-w-[140px]" title="' + esc(hardest || '') + '">' + (hardest ? 'Hardest: ' + esc(hardest) : 'No attempts yet') + '</span>' +
      '</div>' +
      '</button>';
  }

  function statTile(label, value, colorCls) {
    return '<div class="bg-base-800 border border-base-700 rounded-md p-2.5 text-center">' +
      '<div class="font-display font-700 text-xl ' + colorCls + '">' + value + '</div>' +
      '<div class="text-[10px] font-mono uppercase tracking-wider text-ink-500 mt-0.5">' + esc(label) + '</div>' +
      '</div>';
  }

  function computeOverallSummary(boxes) {
    const MapMod = window.BoxRecall.Map;
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
    const streetDrawing = window.BoxRecall._streetDrawActive || false;

    let body = '';

    // -- Define Response Box: Fairfax County GIS import (primary) + manual drawing (collapsed) --
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
      // Primary: Fairfax County GIS import
      body += '<div class="bg-base-800 border border-base-700 rounded-md p-3 mb-3">' +
        '<div class="flex items-center gap-2 mb-2">' +
        '<i data-lucide="cloud-download" class="w-4 h-4 text-alert-green"></i>' +
        '<span class="text-xs font-display font-700 uppercase tracking-wide text-ink-100">Pull from Fairfax County GIS</span>' +
        '</div>' +
        '<p class="text-[10px] text-ink-500 leading-relaxed mb-2.5">Loads official Fire Box boundaries from Fairfax County\'s public GIS — no manual drawing needed. Fill in either or both fields.</p>' +
        '<div class="grid grid-cols-2 gap-2 mb-2">' +
        '<label class="block"><span class="text-[10px] text-ink-500 font-mono">Station Number</span>' +
        '<input id="ffx-station-number" type="text" inputmode="numeric" placeholder="e.g. 41" class="mt-1 w-full bg-base-900 border border-base-600 rounded px-2 py-1.5 font-mono text-xs focus:border-alert-green/60" />' +
        '<span class="text-[9px] text-ink-500 font-mono mt-0.5 block">Pulls that station\'s entire first-due</span>' +
        '</label>' +
        '<label class="block"><span class="text-[10px] text-ink-500 font-mono">Box Number(s)</span>' +
        '<input id="ffx-box-numbers" type="text" placeholder="e.g. 3801, 3802" class="mt-1 w-full bg-base-900 border border-base-600 rounded px-2 py-1.5 font-mono text-xs focus:border-alert-green/60" />' +
        '<span class="text-[9px] text-ink-500 font-mono mt-0.5 block">Comma or space separated</span>' +
        '</label>' +
        '</div>' +
        '<button data-action="import-fairfax-boxes" class="w-full text-xs font-display font-600 uppercase tracking-wide py-2 rounded bg-alert-green/15 border border-alert-green/40 text-alert-green hover:bg-alert-green/25 transition-colors flex items-center justify-center gap-1.5">' +
        '<i data-lucide="download" class="w-3.5 h-3.5"></i> Import Boxes</button>' +
        '<p class="text-[9px] text-ink-500 leading-relaxed mt-2">Each imported box automatically gets its streets pulled from OpenStreetMap, same as a hand-drawn box. Boxes already in your list (by number) are skipped.</p>' +
        '</div>';

      // Secondary: manual drawing, collapsed by default
      body += '<details class="mb-3 group">' +
        '<summary class="cursor-pointer text-[11px] font-display font-600 uppercase tracking-wide text-ink-500 hover:text-ink-300 transition-colors flex items-center gap-1.5 select-none">' +
        '<i data-lucide="chevron-right" class="w-3.5 h-3.5 transition-transform group-open:rotate-90"></i> Or draw a box manually</summary>' +
        '<div class="mt-2">' +
        '<button data-action="start-draw-box" class="w-full text-xs font-display font-600 uppercase tracking-wide py-2.5 rounded border border-alert-cyan/40 hover:bg-alert-cyan/10 text-alert-cyan transition-colors flex items-center justify-center gap-2">' +
        '<i data-lucide="pencil" class="w-3.5 h-3.5"></i> Draw New Box on Map</button>' +
        '</div>' +
        '</details>';
    }

    // -- Existing Boxes List (with bulk select/delete) --
    const selectedCount = Store.state.selectedBoxIds.size;
    const allSelected = boxes.length > 0 && boxes.every(function (f) { return Store.state.selectedBoxIds.has(f.id); });

    body += '<div class="flex items-center justify-between gap-2 mb-2 mt-5">' +
      '<h2 class="text-xs font-display font-700 uppercase tracking-wider text-ink-500 flex items-center gap-1.5"><i data-lucide="database" class="w-3.5 h-3.5"></i> Defined Boxes (' + boxes.length + ')</h2>' +
      (selectedCount > 0
        ? '<button data-action="bulk-delete-boxes" class="text-xs font-display font-600 uppercase tracking-wide px-2.5 py-1 rounded bg-alert-red/15 border border-alert-red/40 text-alert-red hover:bg-alert-red/25 transition-colors flex items-center gap-1.5">' +
          '<i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Delete Selected (' + selectedCount + ')</button>'
        : '') +
      '</div>';

    if (boxes.length === 0) {
      body += emptyState('Import boxes above, or draw your first one manually.', 'shapes');
    } else {
      // Select-all row
      body += '<label class="flex items-center gap-2 px-1 mb-1.5 cursor-pointer select-none">' +
        '<input type="checkbox" data-action="select-all-boxes" class="w-4 h-4 rounded border-base-600 accent-alert-cyan cursor-pointer"' + (allSelected ? ' checked' : '') + ' />' +
        '<span class="text-[10px] font-mono uppercase tracking-wider text-ink-500">' +
        (selectedCount > 0 ? selectedCount + ' selected' : 'Select all') +
        '</span>' +
        '</label>';

      body += '<div class="space-y-2 mb-5">';
      boxes
        .slice()
        .sort(function (a, b) { return String(a.properties.boxNumber).localeCompare(String(b.properties.boxNumber), undefined, { numeric: true }); })
        .forEach(function (f) {
          const streetCount = window.BoxRecall.Quiz.streetsForBox(f.properties.boxNumber).length;
          const isSelected = Store.state.selectedBoxIds.has(f.id);
          const sourceBadge = f.properties.source === 'fairfax-frd'
            ? '<span title="Imported from Fairfax County GIS" class="shrink-0 text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-alert-green/30 text-alert-green/80">GIS</span>'
            : '';
          body += '<div class="bg-base-800 border border-base-700 rounded-md p-2.5 flex items-center gap-2.5' + (isSelected ? ' ring-1 ring-alert-cyan/40' : '') + '">' +
            '<input type="checkbox" data-action="toggle-box-select" data-box-id="' + esc(f.id) + '" class="w-4 h-4 rounded border-base-600 accent-alert-cyan cursor-pointer shrink-0"' + (isSelected ? ' checked' : '') + ' />' +
            '<div class="min-w-0 flex-1">' +
            '<div class="font-mono font-700 text-sm flex items-center gap-1.5">Box ' + esc(f.properties.boxNumber) + ' ' + sourceBadge + '</div>' +
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
    window.BoxRecall.UI.renderBasemapSelector();
    document.getElementById('settings-modal').hidden = false;
    refreshIcons(document.getElementById('settings-modal'));
  }

  function closeSettingsModal() {
    document.getElementById('settings-modal').hidden = true;
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
    const map = window.BoxRecall.Map.getMap();
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
      console.error('[BoxRecall] Export failed:', err);
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
        // Accept both the current export-type strings and the pre-rename
        // ones ("FirstDue...") so files exported before the app was renamed
        // to Box Recall still import correctly.
        if ((data.type === 'BoxRecallExport' || data.type === 'FirstDueExport') && data.boxes && data.streets) {
          toImport = data;
        } else if (data.type === 'BoxRecallStatsExport' || data.type === 'FirstDueStatsExport') {
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
        console.error('[BoxRecall] Import failed:', err);
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
    window.BoxRecall.Map.clearFocus();
    window.BoxRecall.Map.recenterHome();
    renderActiveTab();
    Toast.show('All local data has been reset.', 'success');
  }

  // ---------------------------------------------------------------------
  // EXPORTS (this file is part 1 — more attached by app-ui-part2.js)
  // ---------------------------------------------------------------------
  window.BoxRecall = window.BoxRecall || {};
  window.BoxRecall.UI = window.BoxRecall.UI || {};
  Object.assign(window.BoxRecall.UI, {
    refreshIcons: refreshIcons,
    renderActiveTab: renderActiveTab,
    syncTabIndicators: syncTabIndicators,
    sectionHeader: sectionHeader,
    emptyState: emptyState,
    masteryBadge: masteryBadge,
    wrapTabPanel: wrapTabPanel,
    boxOptionsHtml: boxOptionsHtml,
    QUIZ_MODE_META: QUIZ_MODE_META,
    renderHomeTab: renderHomeTab,
    renderBoxDetailSheet: renderBoxDetailSheet,

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
