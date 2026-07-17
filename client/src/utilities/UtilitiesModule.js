import React, { lazy, Suspense } from 'react';
import './UtilitiesModule.css';

const GeminiImageGenerator = lazy(() => import('../components/GeminiImageGenerator'));

function UtilitiesModule({ subTab = 'image-generator' }) {
  switch (subTab) {
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
