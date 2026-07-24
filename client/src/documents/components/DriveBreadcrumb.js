import React from 'react';

export default function DriveBreadcrumb({ parts = [], onNavigate }) {
  return (
    <nav className="drive-breadcrumb" aria-label="Folder path">
      {parts.map((part, index) => {
        const isLast = index === parts.length - 1;
        return (
          <React.Fragment key={`${part.id}-${index}`}>
            {index > 0 ? <span className="drive-bc-sep" aria-hidden="true">›</span> : null}
            {isLast ? (
              <span className="drive-bc-current">{part.name}</span>
            ) : (
              <button
                type="button"
                className="drive-bc-link"
                onClick={() => onNavigate(part.id)}
              >
                {part.name}
              </button>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
