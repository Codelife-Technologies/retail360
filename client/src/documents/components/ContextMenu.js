import React, { useEffect, useRef } from 'react';

export default function ContextMenu({ x, y, open, items = [], onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose?.();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const maxX = typeof window !== 'undefined' ? window.innerWidth - 220 : x;
  const maxY = typeof window !== 'undefined' ? window.innerHeight - 40 : y;
  const left = Math.min(x, maxX);
  const top = Math.min(y, maxY);

  return (
    <div
      ref={ref}
      className="drive-context-menu"
      style={{ left, top }}
      role="menu"
    >
      {items.map((item, index) => {
        if (item.separator) {
          return <div key={`sep-${index}`} className="drive-context-sep" />;
        }
        return (
          <button
            key={item.id || item.label}
            type="button"
            className={`drive-context-item${item.danger ? ' danger' : ''}${item.disabled ? ' disabled' : ''}`}
            disabled={item.disabled}
            title={item.disabledReason || ''}
            onClick={() => {
              if (item.disabled) return;
              item.onClick?.();
              onClose?.();
            }}
            role="menuitem"
          >
            {item.label}
            {item.hint ? <span className="drive-context-hint">{item.hint}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
