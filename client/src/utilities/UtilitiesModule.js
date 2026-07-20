import React, { lazy, Suspense } from 'react';
import './UtilitiesModule.css';
import '../hr/styles/hrShared.css';

const GeminiImageGenerator = lazy(() => import('../components/GeminiImageGenerator'));
const LocationSettings = lazy(() => import('../hr/pages/LocationSettings'));

function UtilitiesModule({ subTab = 'image-generator' }) {
  switch (subTab) {
    case 'location-settings':
      return (
        <div className="utilities-module">
          <Suspense fallback={<div className="app-loading">Loading location settings…</div>}>
            <LocationSettings />
          </Suspense>
        </div>
      );
    case 'image-generator':
    case 'gemini-image-generator':
    default:
      return (
        <div className="utilities-module">
          <Suspense fallback={<div className="app-loading">Loading image generator…</div>}>
            <GeminiImageGenerator />
          </Suspense>
        </div>
      );
  }
}

export default UtilitiesModule;
