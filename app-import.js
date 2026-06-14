// ============================================================================
// FIRST DUE — Box Study & Active Recall App
// app-import.js — Import response box boundaries from Fairfax County's
// public Fire & Rescue GIS data (ArcGIS REST), so users don't have to
// hand-draw boxes that already exist in the county's official dataset.
// ============================================================================

(function () {
  'use strict';

  const FD = window.FirstDue;
  const Store = FD.Store;
  const Toast = FD.Toast;

  // Fairfax County's public "Fire Box" layer (FRD_Base_Data, layer id 2).
  // No API key required. Source data is in Virginia Lambert state-plane
  // (wkid 102746/2283); outSR=4326 requests WGS84 lat/lng, which the service
  // supports via "Supports Datum Transformation: true".
  const FAIRFAX_FIRE_BOX_QUERY_URL = 'https://www.fairfaxcounty.gov/mercator/rest/services/Fire/FRD_Base_Data/MapServer/2/query';

  // FIRE_BOX_NUM = 99999 marks "non-valid" boxes used internally to connect
  // elevated/disconnected road segments (GOMAPS) — not real response areas,
  // so excluded by default per the layer's own documentation.
  const GOMAPS_BOX_NUM = 99999;

  const FAIRFAX_FETCH_TIMEOUT_MS = 25000;
  const FAIRFAX_PAGE_SIZE = 1000; // matches the service's documented MaxRecordCount

  /**
   * Validate and normalize the raw text the user typed into the
   * "Box numbers" field: comma/space/newline separated list of integers.
   * Returns { numbers: number[], invalidTokens: string[] }.
   */
  function parseBoxNumberList(text) {
    if (!text) return { numbers: [], invalidTokens: [] };
    const tokens = text.split(/[,\s]+/).map(function (t) { return t.trim(); }).filter(Boolean);
    const numbers = [];
    const invalidTokens = [];
    tokens.forEach(function (t) {
      if (/^\d+$/.test(t)) {
        numbers.push(parseInt(t, 10));
      } else {
        invalidTokens.push(t);
      }
    });
    return { numbers: numbers, invalidTokens: invalidTokens };
  }

  /**
   * Validate a station number: positive integer. Fairfax stations are
   * typically 1-46 (plus a few 3-digit temp/special stations), but we don't
   * hard-cap here — an out-of-range station simply returns zero results,
   * which is handled gracefully downstream.
   */
  function parseStationNumber(text) {
    if (!text) return null;
    const trimmed = String(text).trim();
    if (!/^\d+$/.test(trimmed)) return null;
    return parseInt(trimmed, 10);
  }

  /**
   * Build the ArcGIS "where" clause from a station number and/or explicit
   * box number list. At least one must be provided. Returns null if neither
   * yields any criteria.
   */
  function buildWhereClause(stationNumber, boxNumbers) {
    const clauses = [];
    if (stationNumber !== null && stationNumber !== undefined) {
      clauses.push('FIRST_DUE = ' + stationNumber);
    }
    if (boxNumbers && boxNumbers.length > 0) {
      clauses.push('FIRE_BOX_NUM IN (' + boxNumbers.join(',') + ')');
    }
    if (clauses.length === 0) return null;

    // Always exclude GOMAPS/non-valid boxes, combined with the user's criteria.
    const criteria = clauses.length === 1 ? clauses[0] : '(' + clauses.join(' OR ') + ')';
    return criteria + ' AND FIRE_BOX_NUM <> ' + GOMAPS_BOX_NUM;
  }

  /**
   * Fetch fire box features from Fairfax County's public GIS for the given
   * station number and/or box number list. Handles pagination via
   * exceededTransferLimit/resultOffset.
   *
   * Returns a Promise resolving to:
   *   { features: GeoJSON.Feature[], rawCount: number, error: string|null }
   *
   * `features` are GeoJSON Polygon/MultiPolygon features with properties
   * already mapped to this app's box-feature shape ({ layerType: 'box',
   * boxNumber, label, source: 'fairfax-frd', fairfax: {...raw attrs} }),
   * but WITHOUT an `id` — callers should assign one (FD.genId('box')) when
   * persisting, matching the pattern used for hand-drawn boxes.
   *
   * On any failure, `features` is [] and `error` is a human-readable string;
   * this never throws.
   */
  async function fetchFairfaxFireBoxes(stationNumber, boxNumbers) {
    const where = buildWhereClause(stationNumber, boxNumbers);
    if (!where) {
      return { features: [], rawCount: 0, error: 'Enter a station number and/or at least one box number.' };
    }

    const outFields = ['FIRE_BOX_NUM', 'FIRE_BOX_TEXT', 'FIRST_DUE', 'BATTALION', 'DIVISION', 'JURISDICTION', 'BOX_TYPE'].join(',');

    let allFeatures = [];
    let offset = 0;
    let safetyPages = 0;
    const MAX_PAGES = 10; // 10 * 1000 = 10,000 features hard ceiling, far beyond any realistic request

    while (safetyPages < MAX_PAGES) {
      safetyPages++;

      const params = new URLSearchParams({
        where: where,
        outFields: outFields,
        outSR: '4326',
        f: 'geojson',
        returnGeometry: 'true',
        resultRecordCount: String(FAIRFAX_PAGE_SIZE),
        resultOffset: String(offset),
      });
      const requestUrl = FAIRFAX_FIRE_BOX_QUERY_URL + '?' + params.toString();

      const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(function () { controller.abort(); }, FAIRFAX_FETCH_TIMEOUT_MS) : null;

      let response;
      try {
        response = await fetch(requestUrl, { method: 'GET', signal: controller ? controller.signal : undefined });
      } catch (err) {
        if (timeoutId) clearTimeout(timeoutId);
        const msg = (err && err.name === 'AbortError')
          ? 'Fairfax County GIS lookup timed out. Try again, or draw the box manually.'
          : 'Fairfax County GIS lookup failed (network error). Try again, or draw the box manually.';
        console.error('[FirstDue] Fairfax FRD fetch failed:', err);
        return { features: allFeatures, rawCount: allFeatures.length, error: msg };
      }
      if (timeoutId) clearTimeout(timeoutId);

      if (!response.ok) {
        console.error('[FirstDue] Fairfax FRD query returned HTTP ' + response.status);
        return { features: allFeatures, rawCount: allFeatures.length, error: 'Fairfax County GIS lookup failed (server returned ' + response.status + '). Try again, or draw the box manually.' };
      }

      let data;
      try {
        data = await response.json();
      } catch (err) {
        console.error('[FirstDue] Fairfax FRD response was not valid JSON:', err);
        return { features: allFeatures, rawCount: allFeatures.length, error: 'Fairfax County GIS returned an unreadable response. Try again, or draw the box manually.' };
      }

      // ArcGIS returns an "error" object (not an HTTP error) for bad queries
      // (e.g. malformed where-clause) — surface this distinctly.
      if (data && data.error) {
        const detail = (data.error.message || 'Unknown error') + (data.error.details ? ' (' + [].concat(data.error.details).join('; ') + ')' : '');
        console.error('[FirstDue] Fairfax FRD query error:', detail);
        return { features: allFeatures, rawCount: allFeatures.length, error: 'Fairfax County GIS rejected the query: ' + detail };
      }

      const pageFeatures = (data && Array.isArray(data.features)) ? data.features : [];
      allFeatures = allFeatures.concat(pageFeatures);

      const exceeded = !!(data && (data.exceededTransferLimit === true || (data.properties && data.properties.exceededTransferLimit === true)));
      if (exceeded && pageFeatures.length > 0) {
        offset += pageFeatures.length;
        continue;
      }
      break;
    }

    const converted = allFeatures
      .map(convertFairfaxFeatureToBoxFeature)
      .filter(function (f) { return f !== null; });

    return { features: converted, rawCount: allFeatures.length, error: null };
  }

  /**
   * Convert a single ArcGIS-GeoJSON Fire Box feature into this app's box
   * feature shape. Returns null (and logs a warning) for features missing
   * usable geometry or a box number, so callers can filter them out without
   * crashing the whole batch on one bad record.
   */
  function convertFairfaxFeatureToBoxFeature(feature) {
    if (!feature || !feature.geometry || (feature.geometry.type !== 'Polygon' && feature.geometry.type !== 'MultiPolygon')) {
      console.warn('[FirstDue] Skipping Fairfax FRD feature with unusable geometry:', feature && feature.geometry && feature.geometry.type);
      return null;
    }

    const props = feature.properties || {};
    const rawBoxNum = props.FIRE_BOX_NUM;
    if (rawBoxNum === null || rawBoxNum === undefined) {
      console.warn('[FirstDue] Skipping Fairfax FRD feature with no FIRE_BOX_NUM:', props);
      return null;
    }

    // FIRE_BOX_NUM is typed as Double in the source (e.g. 3801.0) — normalize
    // to a clean integer string to match the app's string-based boxNumber
    // comparisons (findBoxByNumber does String(...) comparison).
    const boxNumber = String(Math.trunc(Number(rawBoxNum)));

    const label = (props.FIRE_BOX_TEXT && String(props.FIRE_BOX_TEXT).trim())
      || (props.FIRST_DUE !== null && props.FIRST_DUE !== undefined ? 'First Due ' + props.FIRST_DUE : '')
      || '';

    return {
      type: 'Feature',
      // id intentionally omitted — assigned by the caller at persist time
      properties: {
        layerType: 'box',
        boxNumber: boxNumber,
        label: label,
        source: 'fairfax-frd',
        fairfax: {
          firstDue: props.FIRST_DUE !== undefined ? props.FIRST_DUE : null,
          battalion: props.BATTALION || null,
          division: props.DIVISION || null,
          jurisdiction: props.JURISDICTION || null,
          boxType: props.BOX_TYPE || null,
        },
      },
      geometry: feature.geometry,
    };
  }

  // ---------------------------------------------------------------------
  // EXPORTS
  // ---------------------------------------------------------------------
  window.FirstDue = window.FirstDue || {};
  window.FirstDue.Import = {
    parseBoxNumberList: parseBoxNumberList,
    parseStationNumber: parseStationNumber,
    buildWhereClause: buildWhereClause,
    fetchFairfaxFireBoxes: fetchFairfaxFireBoxes,
    _internal: {
      convertFairfaxFeatureToBoxFeature: convertFairfaxFeatureToBoxFeature,
      GOMAPS_BOX_NUM: GOMAPS_BOX_NUM,
      FAIRFAX_FIRE_BOX_QUERY_URL: FAIRFAX_FIRE_BOX_QUERY_URL,
    },
  };

})();
