import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  computeAutoScale,
  clampUserZoom,
  readStoredUserZoom,
  writeStoredUserZoom,
  formatScalePercent,
  DESIGN_WIDTH,
  MIN_WIDTH,
} from '../utils/displayScale';
import './PageZoomShell.css';

const USER_ZOOM_STEP = 0.05;
/** Ignore tiny width noise (e.g. scrollbar appearing) to prevent zoom feedback shake. */
const SCALE_EPSILON = 0.008;

function PageZoomShell({ contentKey, children }) {
  const viewportRef = useRef(null);
  const [autoScale, setAutoScale] = useState(1);
  const [userZoom, setUserZoom] = useState(1);
  const lastScaleRef = useRef(1);
  const rafRef = useRef(0);

  const measure = useCallback(() => {
    // Prefer window width — never measure the zoomed scaler (that causes a resize loop / shake).
    const width = window.innerWidth || DESIGN_WIDTH;
    const next = computeAutoScale(width);
    if (Math.abs(next - lastScaleRef.current) < SCALE_EPSILON) return;
    lastScaleRef.current = next;
    setAutoScale(next);
  }, []);

  const scheduleMeasure = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      measure();
    });
  }, [measure]);

  useLayoutEffect(() => {
    setUserZoom(readStoredUserZoom());
    measure();
  }, [measure]);

  useEffect(() => {
    measure();
    window.addEventListener('resize', scheduleMeasure);
    return () => {
      window.removeEventListener('resize', scheduleMeasure);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [measure, scheduleMeasure]);

  useEffect(() => {
    measure();
  }, [contentKey, measure]);

  const setAndPersistUserZoom = (next) => {
    const clamped = clampUserZoom(next);
    setUserZoom(clamped);
    writeStoredUserZoom(clamped);
  };

  const effectiveZoom = Math.round(autoScale * userZoom * 1000) / 1000;
  // Avoid CSS zoom at exactly 1 — it traps position:fixed modals inside the scaler
  const applyZoom = Math.abs(effectiveZoom - 1) > 0.001;
  const scalerWidth = applyZoom ? `${100 / effectiveZoom}%` : '100%';

  const handleZoomIn = () => setAndPersistUserZoom(userZoom + USER_ZOOM_STEP);
  const handleZoomOut = () => setAndPersistUserZoom(userZoom - USER_ZOOM_STEP);
  const handleZoomReset = () => setAndPersistUserZoom(1);

  const autoLabel = formatScalePercent(autoScale);
  const effectiveLabel = formatScalePercent(effectiveZoom);

  return (
    <div
      className="page-zoom-shell"
      style={applyZoom ? { zIndex: 150 } : undefined}
      data-design-width={DESIGN_WIDTH}
      data-min-width={MIN_WIDTH}
    >
      <div className="page-zoom-toolbar" aria-label="Display size controls">
        <div
          className="page-zoom-hint"
          title={`Designed for ${DESIGN_WIDTH}×1080. Minimum supported ${MIN_WIDTH}×768.`}
        >
          <span className="page-zoom-hint-label">Display</span>
          <span className="page-zoom-hint-value">
            {autoScale < 1 ? `Auto ${autoLabel}` : 'Full HD'}
            {userZoom !== 1 ? ` · ${effectiveLabel}` : ''}
          </span>
        </div>
        <div className="page-zoom-controls">
          <button
            type="button"
            className="page-zoom-btn-icon"
            onClick={handleZoomOut}
            disabled={userZoom <= 0.75}
            title="Zoom out"
            aria-label="Zoom out"
          >
            −
          </button>
          <button
            type="button"
            className="page-zoom-label"
            onClick={handleZoomReset}
            title="Reset personal zoom to match screen size"
          >
            {effectiveLabel}
          </button>
          <button
            type="button"
            className="page-zoom-btn-icon"
            onClick={handleZoomIn}
            disabled={userZoom >= 1.5}
            title="Zoom in"
            aria-label="Zoom in"
          >
            +
          </button>
        </div>
      </div>

      <div className="page-zoom-viewport" ref={viewportRef}>
        <div
          className="page-zoom-scaler"
          style={
            applyZoom
              ? { zoom: effectiveZoom, width: scalerWidth, minWidth: scalerWidth }
              : undefined
          }
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export default PageZoomShell;
