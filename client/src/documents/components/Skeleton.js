import React from 'react';

export default function Skeleton({ variant = 'grid', count = 6 }) {
  if (variant === 'list') {
    return (
      <div className="drive-skeleton-list">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="drive-skeleton-row" />
        ))}
      </div>
    );
  }
  return (
    <div className="drive-skeleton-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="drive-skeleton-card">
          <div className="drive-skeleton-thumb" />
          <div className="drive-skeleton-line" />
          <div className="drive-skeleton-line short" />
        </div>
      ))}
    </div>
  );
}
