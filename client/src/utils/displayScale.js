/** Design baselines for consistent RetailOSA layout across monitors. */
export const DESIGN_WIDTH = 1920;
export const DESIGN_HEIGHT = 1080;
export const MIN_WIDTH = 1366;
export const MIN_HEIGHT = 768;

/** Scale at minimum supported resolution (1366 / 1920). */
export const MIN_AUTO_SCALE = MIN_WIDTH / DESIGN_WIDTH;

const STORAGE_KEY = 'retailos.displayUserZoom';

/**
 * Auto fit scale vs Full HD design width.
 * - ≥ 1920px → 100% (recommended baseline)
 * - 1366px → ~71% (minimum supported)
 * - Between → linear
 * Height is not used so header chrome does not shrink Full HD views.
 */
export function computeAutoScale(viewportWidth) {
  const width = Number(viewportWidth) || DESIGN_WIDTH;
  if (width >= DESIGN_WIDTH) return 1;
  if (width <= MIN_WIDTH) return MIN_AUTO_SCALE;
  return width / DESIGN_WIDTH;
}

export function clampUserZoom(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(0.75, Math.min(1.5, Math.round(n * 100) / 100));
}

export function readStoredUserZoom() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw == null) return 1;
    return clampUserZoom(parseFloat(raw));
  } catch (_e) {
    return 1;
  }
}

export function writeStoredUserZoom(value) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(clampUserZoom(value)));
  } catch (_e) {
    // ignore quota / private mode
  }
}

export function formatScalePercent(scale) {
  return `${Math.round(Number(scale) * 100)}%`;
}
