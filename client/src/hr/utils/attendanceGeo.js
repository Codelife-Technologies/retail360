/**
 * Browser geolocation helpers for attendance.
 */

function getBrowserInfo() {
  if (typeof navigator === 'undefined') return '';
  return navigator.userAgent || '';
}

function getDeviceInfo() {
  if (typeof navigator === 'undefined') return '';
  const parts = [
    navigator.platform || '',
    navigator.vendor || '',
    navigator.maxTouchPoints ? `touch:${navigator.maxTouchPoints}` : '',
  ].filter(Boolean);
  return parts.join(' | ');
}

function formatDistanceMeters(meters) {
  const value = Number(meters);
  if (!Number.isFinite(value)) return '—';
  if (value < 1000) return `${Math.round(value)} m`;
  return `${(value / 1000).toFixed(2)} km`;
}

function googleMapsUrl(latitude, longitude) {
  if (latitude == null || longitude == null) return null;
  return `https://www.google.com/maps?q=${encodeURIComponent(`${latitude},${longitude}`)}`;
}

/**
 * Request current GPS coordinates via HTML5 Geolocation API.
 * @returns {Promise<{ latitude: number, longitude: number, accuracy?: number }>}
 */
function getCurrentPosition(options = {}) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('GPS location is unavailable on this device or browser.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        if (error?.code === 1) {
          reject(new Error('Location permission is denied. Enable location access to mark office attendance.'));
        } else if (error?.code === 2) {
          reject(new Error('GPS location is unavailable. Please try again near an open area.'));
        } else if (error?.code === 3) {
          reject(new Error('Location request timed out. Please try again.'));
        } else {
          reject(new Error(error?.message || 'Unable to fetch your location.'));
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
        ...options,
      }
    );
  });
}

async function buildAttendanceLocationPayload({ requireGps = true } = {}) {
  const deviceInfo = getDeviceInfo();
  const browserInfo = getBrowserInfo();

  if (!requireGps) {
    return { deviceInfo, browserInfo };
  }

  const coords = await getCurrentPosition();
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    deviceInfo,
    browserInfo,
  };
}

function formatLocationAttendanceError(error) {
  const data = error?.response?.data || {};
  const message = data.error || error?.message || 'Failed to mark attendance';
  const parts = [message];

  if (data.code === 'OUTSIDE_RADIUS' || data.currentDistanceMeters != null) {
    if (data.currentDistanceMeters != null) {
      parts.push(`Current Distance: ${formatDistanceMeters(data.currentDistanceMeters)}`);
    }
    if (data.allowedRadiusMeters != null) {
      parts.push(`Allowed Radius: ${formatDistanceMeters(data.allowedRadiusMeters)}`);
    }
    if (data.officeName) {
      parts.push(`Office: ${data.officeName}`);
    }
  }

  return parts.join('\n');
}

export {
  getBrowserInfo,
  getDeviceInfo,
  formatDistanceMeters,
  googleMapsUrl,
  getCurrentPosition,
  buildAttendanceLocationPayload,
  formatLocationAttendanceError,
};
