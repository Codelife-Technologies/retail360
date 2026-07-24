import React from 'react';

export default function EmptyState({ title, subtitle, action }) {
  return (
    <div className="drive-empty">
      <div className="drive-empty-icon" aria-hidden="true">📂</div>
      <h3>{title}</h3>
      {subtitle ? <p>{subtitle}</p> : null}
      {action || null}
    </div>
  );
}
