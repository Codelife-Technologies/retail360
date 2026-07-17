import React, { useEffect, useState } from 'react';
import './PageZoomShell.css';

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;

function clampZoom(value) {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(value * 100) / 100));
}

function formatZoomLabel(zoom) {
  return `${Math.round(zoom * 100)}%`;
}

function PageZoomShell({ contentKey, children }) {
  const [zoom, setZoom] = useState(1);

  const handleZoomIn = () => {
    setZoom((current) => clampZoom(current + ZOOM_STEP));
  };

  const handleZoomOut = () => {
    setZoom((current) => clampZoom(current - ZOOM_STEP));
  };

  const handleZoomReset = () => {
    setZoom(1);
  };

  useEffect(() => {
    setZoom(1);
  }, [contentKey]);

  return (
    <div
      className="page-zoom-shell"
      style={zoom === 1 ? undefined : { zIndex: 150 }}
    >
      <div className="page-zoom-toolbar" aria-label="Page zoom controls">
        <div className="page-zoom-controls">
          <button
            type="button"
            className="page-zoom-btn-icon"
            onClick={handleZoomOut}
            disabled={zoom <= ZOOM_MIN}
            title="Zoom out"
            aria-label="Zoom out"
          >
            −
          </button>
          <button
            type="button"
            className="page-zoom-label"
            onClick={handleZoomReset}
            title="Reset zoom to 100%"
          >
            {formatZoomLabel(zoom)}
          </button>
          <button
            type="button"
            className="page-zoom-btn-icon"
            onClick={handleZoomIn}
            disabled={zoom >= ZOOM_MAX}
            title="Zoom in"
            aria-label="Zoom in"
          >
            +
          </button>
        </div>
      </div>

      <div className="page-zoom-viewport">
        {/* Avoid applying `zoom` at 100% — it creates a containing block that
            traps position:fixed modals under the app header. */}
        <div
          className="page-zoom-scaler"
          style={zoom === 1 ? undefined : { zoom }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export default PageZoomShell;
