// ============================================================================
// FIRST DUE — Box Study & Active Recall App
// app-quiz.js — Active Recall Quiz Engine (Module 3)
//
// State machine: IDLE -> QUIZ_ONGOING -> ANSWER_SUBMITTED -> RESULTS_SCORE
// Modes: 'name-street' | 'locate-street' | 'box-identifier'
// ============================================================================

(function () {
  'use strict';

  const FD = window.FirstDue;
  const Store = FD.Store;
  const Toast = FD.Toast;
  const MapMod = function () { return window.FirstDue.Map; }; // lazy ref (loaded after this file)

  const DEFAULT_QUESTIONS_PER_SESSION = 8;

  // ---------------------------------------------------------------------
  // SHUFFLE / QUEUE BUILDING
  // ---------------------------------------------------------------------

  function shuffle(array) {
    const a = array.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function streetsForBox(boxNumber) {
    const fc = Store.state.streets;
    return fc.features.filter(function (f) {
      return f.properties && String(f.properties.boxNumber) === String(boxNumber)
        && f.geometry && f.geometry.type === 'LineString';
    });
  }

  function allBoxNumbers() {
    const fc = Store.state.boxes;
    return fc.features
      .map(function (f) { return f.properties && f.properties.boxNumber; })
      .filter(function (v) { return v !== undefined && v !== null && v !== ''; });
  }

  // ---------------------------------------------------------------------
  // VALIDATION (pre-flight checks before starting a quiz)
  // ---------------------------------------------------------------------

  /**
   * Returns { ok: boolean, reason?: string } describing whether a quiz of
   * the given mode can be started for the given box.
   */
  function validateQuizStart(mode, boxNumber) {
    if (!Store.state.mapReady) {
      return { ok: false, reason: 'Map is not ready yet. Please wait for the map to finish loading.' };
    }

    if (mode === 'box-identifier') {
      if (allBoxNumbers().length < 2) {
        return { ok: false, reason: 'Box Identifier mode needs at least 2 defined Response Boxes.' };
      }
      return { ok: true };
    }

    if (!boxNumber) {
      return { ok: false, reason: 'Select a Response Box to begin this quiz mode.' };
    }

    const box = MapMod().findBoxByNumber(boxNumber);
    if (!box) {
      return { ok: false, reason: 'Box ' + boxNumber + ' could not be found.' };
    }

    const streets = streetsForBox(boxNumber);
    if (streets.length === 0) {
      return { ok: false, reason: 'Box ' + boxNumber + ' has no streets assigned yet. Add streets in the Box Builder first.' };
    }

    if ((mode === 'name-street' || mode === 'locate-street') && streets.length < 1) {
      return { ok: false, reason: 'Need at least 1 street with a name in Box ' + boxNumber + '.' };
    }

    return { ok: true };
  }

  // ---------------------------------------------------------------------
  // STARTING A QUIZ
  // ---------------------------------------------------------------------

  function startQuiz(mode, boxNumber) {
    const validation = validateQuizStart(mode, boxNumber);
    if (!validation.ok) {
      Toast.show(validation.reason, 'warn');
      return false;
    }

    MapMod().clearQuizHighlights();

    let queue;
    if (mode === 'box-identifier') {
      const boxes = allBoxNumbers();
      const n = Math.min(DEFAULT_QUESTIONS_PER_SESSION, Math.max(boxes.length, 1));
      queue = shuffle(allBoxesAsFeatures()).slice(0, n);
      if (queue.length === 0) {
        Toast.show('No boxes available for Box Identifier mode.', 'warn');
        return false;
      }
    } else {
      const streets = streetsForBox(boxNumber);
      const n = Math.min(DEFAULT_QUESTIONS_PER_SESSION, streets.length);
      // Build a pool that repeats streets if there are very few, to reach a
      // reasonable session length, but never repeats the SAME street twice
      // in a row when more than one street exists.
      let pool = shuffle(streets);
      if (streets.length < DEFAULT_QUESTIONS_PER_SESSION) {
        while (pool.length < n + (streets.length > 1 ? 1 : 0) && pool.length < 12) {
          pool = pool.concat(shuffle(streets));
        }
      }
      queue = pool.slice(0, Math.max(n, Math.min(streets.length, DEFAULT_QUESTIONS_PER_SESSION)));
      // Avoid immediate repeats where possible
      queue = avoidAdjacentDuplicates(queue);
    }

    if (Store.state.activeBoxNumber !== boxNumber && boxNumber) {
      MapMod().focusBox(boxNumber);
    }

    Store.quizDispatch('START', { mode: mode, boxNumber: boxNumber, queue: queue });
    presentCurrentQuestion();
    return true;
  }

  function allBoxesAsFeatures() {
    return Store.state.boxes.features.filter(function (f) {
      return f.properties && f.properties.boxNumber !== undefined && f.properties.boxNumber !== null;
    });
  }

  function avoidAdjacentDuplicates(queue) {
    if (queue.length < 2) return queue;
    const out = queue.slice();
    for (let i = 1; i < out.length; i++) {
      if (out[i].id === out[i - 1].id) {
        // find a later non-matching element to swap with
        for (let j = i + 1; j < out.length; j++) {
          if (out[j].id !== out[i - 1].id) {
            const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
            break;
          }
        }
      }
    }
    return out;
  }

  // ---------------------------------------------------------------------
  // PRESENTING QUESTIONS (per-mode UI prep + map manipulation)
  // ---------------------------------------------------------------------

  function presentCurrentQuestion() {
    const quiz = Store.state.quiz;
    const target = quiz.currentTarget;
    if (!target) return;

    MapMod().clearQuizHighlights();

    if (quiz.mode === 'name-street') {
      const layer = MapMod().highlightStreetForQuiz(target.id, 'cyan');
      Store.setQuizTargetLayer(layer);
    } else if (quiz.mode === 'locate-street') {
      // Nothing highlighted yet — user must find it. Ensure box view is fit.
      if (quiz.boxNumber) MapMod().panToBoxQuiet(quiz.boxNumber);
    } else if (quiz.mode === 'box-identifier') {
      const centroidLatLng = randomPointInBox(target);
      if (centroidLatLng) {
        MapMod().dropQuizPin(centroidLatLng);
        // Zoom out a bit to give context across multiple boxes
        const map = MapMod().getMap();
        if (map) {
          const allBounds = boundsForAllBoxes();
          if (allBounds) map.fitBounds(allBounds, { padding: [30, 30], maxZoom: 16 });
          map.panTo(centroidLatLng, { animate: true });
        }
      }
    }

    window.FirstDue.UI && window.FirstDue.UI.renderQuizOverlay();
  }

  /** Pick a pseudo-random point inside a box polygon for the Box Identifier pin. */
  function randomPointInBox(boxFeature) {
    const geom = boxFeature.geometry;
    let ring;
    if (geom.type === 'Polygon') ring = geom.coordinates[0];
    else if (geom.type === 'MultiPolygon') ring = geom.coordinates[0][0];
    else return null;

    // Try random points within bounding box of the ring, keep first that's inside.
    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    ring.forEach(function (pt) {
      minLng = Math.min(minLng, pt[0]); maxLng = Math.max(maxLng, pt[0]);
      minLat = Math.min(minLat, pt[1]); maxLat = Math.max(maxLat, pt[1]);
    });

    for (let attempt = 0; attempt < 25; attempt++) {
      const lng = minLng + Math.random() * (maxLng - minLng);
      const lat = minLat + Math.random() * (maxLat - minLat);
      if (FD.pointInRing([lng, lat], ring)) {
        return L.latLng(lat, lng);
      }
    }
    // Fallback: centroid (may sit on an edge for concave shapes, acceptable fallback)
    const c = FD.ringCentroid(ring);
    return L.latLng(c[1], c[0]);
  }

  function boundsForAllBoxes() {
    const fc = Store.state.boxes;
    if (!fc.features.length) return null;
    let bounds = null;
    fc.features.forEach(function (f) {
      const layer = MapMod()._internal.boxLayerById[f.id];
      if (!layer) return;
      const b = layer.getBounds();
      bounds = bounds ? bounds.extend(b) : L.latLngBounds(b.getSouthWest(), b.getNorthEast());
    });
    return bounds;
  }

  // ---------------------------------------------------------------------
  // SUBMITTING ANSWERS
  // ---------------------------------------------------------------------

  /** Mode: "Name the Street" — text input fuzzy-matched against the target street's name. */
  function submitNameStreetAnswer(guessText) {
    const quiz = Store.state.quiz;
    if (quiz.phase !== 'QUIZ_ONGOING' || quiz.mode !== 'name-street') return;

    const target = quiz.currentTarget;
    const targetName = (target.properties && target.properties.name) || '';
    const tolerance = Store.state.settings.fuzzyTolerance;
    const match = FD.fuzzyMatchStreet(guessText, targetName, tolerance);

    const result = {
      correct: match.isMatch,
      message: match.isMatch
        ? 'Correct! ' + targetName
        : 'Incorrect. The street was: ' + targetName,
      distance: match.distance,
      guess: guessText,
      target: targetName,
    };

    Store.recordStreetAttempt(quiz.boxNumber, target.id, match.isMatch);
    Store.quizDispatch('SUBMIT_ANSWER', {
      result: result,
      resultRecord: { mode: 'name-street', targetId: target.id, correct: match.isMatch },
    });

    MapMod().flashStreetResult(target.id, match.isMatch);
    window.FirstDue.UI && window.FirstDue.UI.renderQuizOverlay();
    window.FirstDue.UI && window.FirstDue.UI.flashFeedback(match.isMatch);
  }

  /**
   * Mode: "Locate the Street" — user tapped the map; find nearest street
   * within the active box and compare to target.
   */
  function onMapTapLocate(latlng) {
    const quiz = Store.state.quiz;
    if (quiz.phase !== 'QUIZ_ONGOING' || quiz.mode !== 'locate-street') return;

    const target = quiz.currentTarget;
    const point = [latlng.lng, latlng.lat];

    const candidates = streetsForBox(quiz.boxNumber);
    if (candidates.length === 0) return;

    let nearest = null, nearestDist = Infinity;
    candidates.forEach(function (f) {
      const d = FD.pointToLineDistance(point, f.geometry.coordinates);
      if (d < nearestDist) { nearestDist = d; nearest = f; }
    });

    // Tap tolerance in degrees — roughly generous for touch on a study-zoom map.
    const TAP_TOLERANCE_DEG = 0.0009; // ~ tens of meters depending on latitude
    const tappedSomething = nearest && nearestDist <= TAP_TOLERANCE_DEG;

    const correct = !!(tappedSomething && nearest.id === target.id);
    const targetName = (target.properties && target.properties.name) || '';

    let message;
    if (correct) {
      message = 'Correct! That\'s ' + targetName + '.';
    } else if (tappedSomething) {
      const tappedName = (nearest.properties && nearest.properties.name) || 'an unnamed street';
      message = 'Not quite — that\'s ' + tappedName + '. ' + targetName + ' is highlighted below.';
    } else {
      message = 'No street found near that tap. ' + targetName + ' is highlighted below.';
    }

    Store.recordStreetAttempt(quiz.boxNumber, target.id, correct);
    Store.quizDispatch('SUBMIT_ANSWER', {
      result: { correct: correct, message: message, target: targetName },
      resultRecord: { mode: 'locate-street', targetId: target.id, correct: correct },
    });

    // Visual feedback
    if (!correct && tappedSomething) {
      MapMod().flashStreetResult(nearest.id, false);
    }
    // Always reveal the correct target afterward
    MapMod().highlightStreetForQuiz(target.id, correct ? 'green' : 'green');
    MapMod().flashStreetResult(target.id, true);

    window.FirstDue.UI && window.FirstDue.UI.renderQuizOverlay();
    window.FirstDue.UI && window.FirstDue.UI.flashFeedback(correct);
  }

  /**
   * Mode: "Box Identifier" — user selects a Box Number from a dropdown/list
   * (rather than tapping the map, which is reserved for the pin display).
   * onMapTapBoxIdentifier remains for users who tap inside the correct
   * polygon directly as an alternate input method.
   */
  function submitBoxIdentifierAnswer(guessedBoxNumber) {
    const quiz = Store.state.quiz;
    if (quiz.phase !== 'QUIZ_ONGOING' || quiz.mode !== 'box-identifier') return;

    const target = quiz.currentTarget;
    const targetBoxNumber = target.properties && target.properties.boxNumber;
    const correct = String(guessedBoxNumber) === String(targetBoxNumber);

    const result = {
      correct: correct,
      message: correct ? 'Correct! Box ' + targetBoxNumber : 'Incorrect. The correct box was: Box ' + targetBoxNumber,
      guess: guessedBoxNumber,
      target: targetBoxNumber,
    };

    Store.recordBoxIdentifierAttempt(targetBoxNumber, correct);
    Store.quizDispatch('SUBMIT_ANSWER', {
      result: result,
      resultRecord: { mode: 'box-identifier', targetId: target.id, correct: correct },
    });

    // Reveal the target box outline
    const layer = MapMod()._internal.boxLayerById[target.id];
    if (layer) {
      layer.setStyle({ color: correct ? '#5dffa3' : '#ff5d5d', weight: 4, opacity: 1, fillOpacity: 0.2 });
      if (layer.bringToFront) layer.bringToFront();
    }

    window.FirstDue.UI && window.FirstDue.UI.renderQuizOverlay();
    window.FirstDue.UI && window.FirstDue.UI.flashFeedback(correct);
  }

  /** Tapping the map directly during box-identifier mode (alternate input). */
  function onMapTapBoxIdentifier(latlng) {
    const quiz = Store.state.quiz;
    if (quiz.phase !== 'QUIZ_ONGOING' || quiz.mode !== 'box-identifier') return;

    const point = [latlng.lng, latlng.lat];
    const fc = Store.state.boxes;
    const hit = fc.features.find(function (f) {
      const geom = f.geometry;
      if (geom.type === 'Polygon') return FD.pointInRing(point, geom.coordinates[0]);
      if (geom.type === 'MultiPolygon') return geom.coordinates.some(function (poly) { return FD.pointInRing(point, poly[0]); });
      return false;
    });

    if (!hit) {
      Toast.show('That point isn\'t inside any defined box. Try selecting from the list instead.', 'info');
      return;
    }
    submitBoxIdentifierAnswer(hit.properties.boxNumber);
  }

  // ---------------------------------------------------------------------
  // ADVANCING / ENDING
  // ---------------------------------------------------------------------

  function nextQuestion() {
    const quiz = Store.state.quiz;
    if (quiz.phase !== 'ANSWER_SUBMITTED') return;
    MapMod().clearQuizHighlights();
    Store.quizDispatch('NEXT_QUESTION');
    if (Store.state.quiz.phase === 'QUIZ_ONGOING') {
      presentCurrentQuestion();
    } else {
      window.FirstDue.UI && window.FirstDue.UI.renderQuizOverlay();
    }
  }

  function endQuiz() {
    MapMod().clearQuizHighlights();
    Store.quizDispatch('END');
    window.FirstDue.UI && window.FirstDue.UI.renderQuizOverlay();
  }

  function getSessionSummary() {
    const quiz = Store.state.quiz;
    const total = quiz.sessionResults.length;
    const correct = quiz.sessionResults.filter(function (r) { return r.correct; }).length;
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;

    // Identify hardest street (lowest correct ratio, min 1 attempt) within this session
    const byTarget = {};
    quiz.sessionResults.forEach(function (r) {
      if (!byTarget[r.targetId]) byTarget[r.targetId] = { seen: 0, correct: 0 };
      byTarget[r.targetId].seen++;
      if (r.correct) byTarget[r.targetId].correct++;
    });

    let hardestId = null, hardestRatio = Infinity;
    Object.keys(byTarget).forEach(function (id) {
      const s = byTarget[id];
      const ratio = s.correct / s.seen;
      if (ratio < hardestRatio) { hardestRatio = ratio; hardestId = id; }
    });

    let hardestName = null;
    if (hardestId) {
      if (quiz.mode === 'box-identifier') {
        const f = Store.state.boxes.features.find(function (f) { return f.id === hardestId; });
        hardestName = f ? 'Box ' + f.properties.boxNumber : null;
      } else {
        const f = Store.state.streets.features.find(function (f) { return f.id === hardestId; });
        hardestName = f ? f.properties.name : null;
      }
    }

    return { total: total, correct: correct, pct: pct, hardestName: hardestName, mode: quiz.mode, boxNumber: quiz.boxNumber };
  }

  // ---------------------------------------------------------------------
  // EXPORTS
  // ---------------------------------------------------------------------
  window.FirstDue = window.FirstDue || {};
  window.FirstDue.Quiz = {
    DEFAULT_QUESTIONS_PER_SESSION: DEFAULT_QUESTIONS_PER_SESSION,
    validateQuizStart: validateQuizStart,
    startQuiz: startQuiz,
    presentCurrentQuestion: presentCurrentQuestion,
    submitNameStreetAnswer: submitNameStreetAnswer,
    onMapTapLocate: onMapTapLocate,
    submitBoxIdentifierAnswer: submitBoxIdentifierAnswer,
    onMapTapBoxIdentifier: onMapTapBoxIdentifier,
    nextQuestion: nextQuestion,
    endQuiz: endQuiz,
    getSessionSummary: getSessionSummary,
    streetsForBox: streetsForBox,
    allBoxNumbers: allBoxNumbers,
    // exposed for tests
    _internal: {
      shuffle: shuffle,
      avoidAdjacentDuplicates: avoidAdjacentDuplicates,
      randomPointInBox: randomPointInBox,
    },
  };

})();
