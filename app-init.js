// ============================================================================
// FIRST DUE — Box Study & Active Recall App
// app-init.js — Bootstrap: static event wiring, mobile sheet drag, app init
// ============================================================================

(function () {
  'use strict';

  const FD = window.FirstDue;
  const Store = FD.Store;
  const Toast = FD.Toast;
  const UI = window.FirstDue.UI;

  // ---------------------------------------------------------------------
  // TAB SWITCHING
  // ---------------------------------------------------------------------

  function bindTabSwitching() {
    document.querySelectorAll('.tab-btn, .tab-btn-m').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const tab = btn.dataset.tab;
        Store.setActiveTab(tab);
        UI.renderActiveTab();
        const sheet = document.getElementById('mobile-sheet');
        if (sheet && window.innerWidth < 768) {
          expandSheet();
        }
      });
    });
  }

  // ---------------------------------------------------------------------
  // SETTINGS MODAL WIRING
  // ---------------------------------------------------------------------

  function bindSettingsModal() {
    const openBtns = [document.getElementById('btn-settings'), document.getElementById('btn-settings-m')];
    openBtns.forEach(function (btn) {
      if (btn) btn.addEventListener('click', UI.openSettingsModal);
    });

    document.getElementById('btn-close-settings').addEventListener('click', UI.closeSettingsModal);

    document.getElementById('settings-modal').addEventListener('click', function (e) {
      if (e.target.id === 'settings-modal') UI.closeSettingsModal();
    });

    // Live-save on change for coordinate/zoom/fuzzy fields
    ['setting-lat', 'setting-lng', 'setting-zoom'].forEach(function (id) {
      document.getElementById(id).addEventListener('change', UI.saveSettingsFromModal);
    });

    const fuzzyInput = document.getElementById('setting-fuzzy');
    fuzzyInput.addEventListener('input', function () {
      document.getElementById('fuzzy-val').textContent = fuzzyInput.value;
    });
    fuzzyInput.addEventListener('change', UI.saveSettingsFromModal);

    document.getElementById('btn-use-current-center').addEventListener('click', UI.useCurrentMapCenter);

    document.getElementById('btn-export-geojson').addEventListener('click', UI.exportGeoJSONFile);
    document.getElementById('btn-export-stats').addEventListener('click', UI.exportStatsFile);

    document.getElementById('input-import-geojson').addEventListener('change', function (e) {
      const file = e.target.files && e.target.files[0];
      UI.handleImportFile(file);
      e.target.value = ''; // allow re-selecting the same file later
    });

    document.getElementById('btn-reset-all').addEventListener('click', UI.confirmResetAllData);

    document.getElementById('btn-open-diagnostics').addEventListener('click', function () {
      UI.closeSettingsModal();
      openDiagnosticsModal();
    });
  }

  // ---------------------------------------------------------------------
  // DIAGNOSTICS MODAL WIRING
  // ---------------------------------------------------------------------

  function openDiagnosticsModal() {
    document.getElementById('diagnostics-modal').classList.remove('hidden');
    UI.refreshIcons(document.getElementById('diagnostics-modal'));
  }

  function closeDiagnosticsModal() {
    document.getElementById('diagnostics-modal').classList.add('hidden');
  }

  function bindDiagnosticsModal() {
    document.getElementById('btn-close-diagnostics').addEventListener('click', closeDiagnosticsModal);

    document.getElementById('diagnostics-modal').addEventListener('click', function (e) {
      if (e.target.id === 'diagnostics-modal') closeDiagnosticsModal();
    });

    document.getElementById('btn-run-diagnostics').addEventListener('click', function () {
      const output = document.getElementById('diagnostic-output');
      output.innerHTML = '<div class="diag-info">Running…</div>';
      // Defer slightly so the "Running…" message paints before tests run
      setTimeout(async function () {
        const summary = await window.FirstDue.Diagnostics.runAll();
        window.FirstDue.Diagnostics.renderToElement(output);
        if (summary.failed === 0) {
          Toast.show('Diagnostics: all ' + summary.passed + ' checks passed.', 'success');
        } else {
          Toast.show('Diagnostics: ' + summary.failed + ' check(s) failed — see console/output.', 'error');
        }
      }, 30);
    });

    document.getElementById('btn-clear-diagnostics').addEventListener('click', function () {
      document.getElementById('diagnostic-output').innerHTML = 'Press "Run All Tests" to begin vetting…';
      document.getElementById('diagnostic-output').className = 'diag-info';
    });
  }

  // ---------------------------------------------------------------------
  // MAP TOP-BAR CONTROLS
  // ---------------------------------------------------------------------

  function bindMapTopBar() {
    // Label toggle (desktop + mobile)
    [document.getElementById('btn-toggle-labels'), document.getElementById('btn-toggle-labels-m')].forEach(function (btn) {
      if (!btn) return;
      btn.addEventListener('click', function () {
        const newVal = !Store.state.labelsVisible;
        window.FirstDue.Map.setLabelsVisible(newVal);
        UI.syncTopBarLabelButtons();
        UI.renderActiveTab(); // refresh the study tab's toggle switch if visible
      });
    });

    // Draw mode toggle (desktop + mobile) — toggles BOX drawing
    [document.getElementById('btn-draw-mode'), document.getElementById('btn-draw-mode-m')].forEach(function (btn) {
      if (!btn) return;
      btn.addEventListener('click', function () {
        if (Store.state.drawingActive || window.FirstDue._streetDrawActive) {
          // Cancel whichever drawing mode is active
          if (Store.state.drawingActive) window.FirstDue.Map.cancelDrawing();
          if (window.FirstDue._streetDrawActive) {
            window.FirstDue.Map.cancelStreetDrawing();
            window.FirstDue._streetDrawActive = false;
          }
          UI.hideDrawBanner();
        } else {
          Store.setActiveTab('builder');
          window.FirstDue.Map.startDrawing();
          UI.showDrawBanner('box');
          expandSheet();
        }
        UI.renderActiveTab();
        UI.syncTopBarDrawButtons();
      });
    });

    [document.getElementById('btn-recenter'), document.getElementById('btn-recenter-m')].forEach(function (btn) {
      if (!btn) return;
      btn.addEventListener('click', function () {
        window.FirstDue.Map.recenterHome();
        UI.renderActiveTab();
      });
    });

    // Basemap switcher (desktop + mobile) — cycles satellite -> light -> dark -> satellite...
    [document.getElementById('btn-basemap'), document.getElementById('btn-basemap-m')].forEach(function (btn) {
      if (!btn) return;
      btn.addEventListener('click', function () {
        const order = window.FirstDue.Map.BASEMAP_ORDER;
        const current = window.FirstDue.Map.getBasemap();
        const next = order[(order.indexOf(current) + 1) % order.length];
        window.FirstDue.Map.setBasemap(next);
        UI.syncBasemapButtons();
        const label = window.FirstDue.Map.BASEMAPS[next].label;
        Toast.show('Basemap: ' + label, 'info', { duration: 1800 });
      });
    });

    document.getElementById('btn-clear-focus').addEventListener('click', function () {
      window.FirstDue.Map.clearFocus();
      Store.setActiveTab('dashboard');
      UI.renderActiveTab();
      syncActiveBoxPill();
    });

    document.getElementById('btn-retry-map').addEventListener('click', function () {
      window.FirstDue.Map.retryMapLoad();
    });
  }

  function syncActiveBoxPill() {
    const pill = document.getElementById('active-box-pill');
    const label = document.getElementById('active-box-label');
    const boxNumber = Store.state.activeBoxNumber;
    if (boxNumber) {
      label.textContent = 'BOX ' + boxNumber;
      pill.classList.remove('hidden');
      pill.classList.add('flex');
    } else {
      pill.classList.add('hidden');
      pill.classList.remove('flex');
    }
  }

  // ---------------------------------------------------------------------
  // MOBILE BOTTOM SHEET (drag handle + swipe gestures)
  // ---------------------------------------------------------------------

  function bindMobileSheet() {
    const sheet = document.getElementById('mobile-sheet');
    const handle = document.getElementById('sheet-handle');
    const chevron = document.getElementById('sheet-chevron');

    let startY = 0;
    let currentY = 0;
    let dragging = false;
    let sheetStartTranslate = 0;

    handle.addEventListener('click', function (e) {
      // Only toggle on tap (not after a drag, which is handled separately)
      if (dragging) return;
      toggleSheet();
    });

    function getSheetTranslateY() {
      const rect = sheet.getBoundingClientRect();
      const parentRect = sheet.parentElement.getBoundingClientRect();
      return rect.top - parentRect.top;
    }

    handle.addEventListener('touchstart', function (e) {
      dragging = false;
      startY = e.touches[0].clientY;
      sheet.style.transition = 'none';
    }, { passive: true });

    handle.addEventListener('touchmove', function (e) {
      currentY = e.touches[0].clientY;
      const delta = currentY - startY;
      if (Math.abs(delta) > 5) dragging = true;

      const isExpanded = sheet.classList.contains('sheet-expanded');
      const baseTranslate = isExpanded ? 0 : (sheet.offsetHeight - 64);
      let next = baseTranslate + delta;
      next = Math.max(0, Math.min(sheet.offsetHeight - 64, next));
      sheet.style.transform = 'translateY(' + next + 'px)';
    }, { passive: true });

    handle.addEventListener('touchend', function (e) {
      sheet.style.transition = '';
      sheet.style.transform = '';
      if (!dragging) return;

      const delta = currentY - startY;
      const isExpanded = sheet.classList.contains('sheet-expanded');

      if (isExpanded && delta > 60) {
        collapseSheet();
      } else if (!isExpanded && delta < -60) {
        expandSheet();
      } else {
        // Snap back to current state
        sheet.classList.toggle('sheet-expanded', isExpanded);
        sheet.classList.toggle('sheet-collapsed', !isExpanded);
      }
      setTimeout(function () { dragging = false; }, 50);
    });
  }

  function toggleSheet() {
    const sheet = document.getElementById('mobile-sheet');
    if (sheet.classList.contains('sheet-expanded')) collapseSheet();
    else expandSheet();
  }

  function expandSheet() {
    const sheet = document.getElementById('mobile-sheet');
    const chevron = document.getElementById('sheet-chevron');
    const handle = document.getElementById('sheet-handle');
    sheet.classList.remove('sheet-collapsed');
    sheet.classList.add('sheet-expanded');
    if (chevron) chevron.style.transform = 'rotate(180deg)';
    if (handle) handle.setAttribute('aria-expanded', 'true');
  }

  function collapseSheet() {
    const sheet = document.getElementById('mobile-sheet');
    const chevron = document.getElementById('sheet-chevron');
    const handle = document.getElementById('sheet-handle');
    sheet.classList.remove('sheet-expanded');
    sheet.classList.add('sheet-collapsed');
    if (chevron) chevron.style.transform = '';
    if (handle) handle.setAttribute('aria-expanded', 'false');
  }

  // ---------------------------------------------------------------------
  // RESPONSIVE: invalidate map size on resize / orientation change
  // ---------------------------------------------------------------------

  function bindResizeHandling() {
    let resizeTimer = null;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        window.FirstDue.Map.invalidateSize();
      }, 150);
    });

    window.addEventListener('orientationchange', function () {
      setTimeout(function () { window.FirstDue.Map.invalidateSize(); }, 300);
    });
  }

  // ---------------------------------------------------------------------
  // STORE SUBSCRIPTIONS FOR UI-LEVEL CONCERNS
  // ---------------------------------------------------------------------

  function bindUISubscriptions() {
    Store.on('ui:activeBox', function () {
      syncActiveBoxPill();
    });

    Store.on('ui:tab', function () {
      UI.renderActiveTab();
    });

    Store.on('ui:drawing', function (active) {
      if (!active) UI.hideDrawBanner();
      UI.syncTopBarDrawButtons();
    });

    // Persist labelsVisible -> reflect in settings already handled in Store.setLabelsVisible
    Store.on('settings:changed', function (settings) {
      // If home coordinates changed while no box is focused, nothing to re-render on map directly;
      // settings modal reads from state.settings each time it's opened.
    });
  }

  // ---------------------------------------------------------------------
  // KEYBOARD SHORTCUTS (accessibility nicety: Escape closes modals/drawing)
  // ---------------------------------------------------------------------

  function bindKeyboardShortcuts() {
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;

      const settingsModal = document.getElementById('settings-modal');
      const diagModal = document.getElementById('diagnostics-modal');

      if (!settingsModal.classList.contains('hidden')) { UI.closeSettingsModal(); return; }
      if (!diagModal.classList.contains('hidden')) { closeDiagnosticsModal(); return; }

      if (Store.state.drawingActive) {
        window.FirstDue.Map.cancelDrawing();
        UI.hideDrawBanner();
        UI.renderActiveTab();
        UI.syncTopBarDrawButtons();
        return;
      }
      if (window.FirstDue._streetDrawActive) {
        window.FirstDue.Map.cancelStreetDrawing();
        window.FirstDue._streetDrawActive = false;
        UI.hideDrawBanner();
        UI.renderActiveTab();
        UI.syncTopBarDrawButtons();
        return;
      }
    });
  }

  /**
   * Safety net: if any Promise rejects without a .catch() anywhere in the
   * app, log it and surface a toast instead of failing silently. This is
   * especially relevant for async UI actions (e.g. the Overpass street
   * lookup) where a thrown error before the first `await` could otherwise
   * produce an unhandled rejection with no visible feedback to the user.
   */
  function bindGlobalErrorHandlers() {
    window.addEventListener('unhandledrejection', function (e) {
      console.error('[FirstDue] Unhandled promise rejection:', e.reason);
      try {
        Toast.show('Something went wrong with a background task. Check the console for details.', 'error', { duration: 6000 });
      } catch (toastErr) {
        // Toast itself unavailable — nothing more we can do.
      }
      // Prevent the default "Uncaught (in promise)" console noise on top of our own log.
      e.preventDefault();
    });
  }

  // ---------------------------------------------------------------------
  // APP INITIALIZATION
  // ---------------------------------------------------------------------

  function init() {
    try {
      // 1. Initialize the Leaflet map first (other modules read Store.state.mapReady)
      window.FirstDue.Map.initMap();
      window.FirstDue.Map.bindStoreSubscriptions();

      // initMap() may have already set mapError=true before the ui:mapError
      // listener (registered above) existed to react to it — sync the
      // banner to the current state now so it isn't missed on first load.
      const errorBanner = document.getElementById('map-error-banner');
      if (errorBanner) errorBanner.classList.toggle('hidden', !Store.state.mapError);

      // 2. Render initial UI
      UI.renderActiveTab();
      syncActiveBoxPill();
      UI.syncTopBarLabelButtons();
      UI.syncTopBarDrawButtons();
      UI.syncBasemapButtons();

      // 3. Wire up all static controls
      bindTabSwitching();
      bindSettingsModal();
      bindDiagnosticsModal();
      bindMapTopBar();
      bindMobileSheet();
      bindResizeHandling();
      bindUISubscriptions();
      bindKeyboardShortcuts();
      bindGlobalErrorHandlers();

      // 4. Render Lucide icons across the static shell
      UI.refreshIcons();

      // 5. Welcome toast on first run (no boxes defined yet)
      if (!Store.state.boxes.features || Store.state.boxes.features.length === 0) {
        setTimeout(function () {
          Toast.show('Welcome! Start in Box Builder to draw your first Response Box.', 'info');
        }, 600);
      }

      console.log('[FirstDue] App initialized successfully.');
    } catch (err) {
      console.error('[FirstDue] Fatal initialization error:', err);
      try {
        Toast.show('App failed to initialize: ' + err.message, 'error');
      } catch (e2) {
        // Toast itself unavailable — last resort
        alert('First Due failed to start: ' + err.message);
      }
    }
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
