import { useEffect } from 'react';

/**
 * Drive keyboard shortcuts.
 * Ctrl+U upload, Ctrl+Shift+N new folder, Delete trash, F2 rename, Ctrl+F search
 */
export function useDriveShortcuts({
  enabled = true,
  onUpload,
  onNewFolder,
  onDelete,
  onRename,
  onFocusSearch,
  onEscape,
} = {}) {
  useEffect(() => {
    if (!enabled) return undefined;

    const handler = (e) => {
      const tag = String(e.target?.tagName || '').toLowerCase();
      const typing =
        tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable;

      if (e.key === 'Escape') {
        onEscape?.();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        onFocusSearch?.();
        return;
      }

      if (typing) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u') {
        e.preventDefault();
        onUpload?.();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        onNewFolder?.();
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (e.key === 'Backspace' && typing) return;
        e.preventDefault();
        onDelete?.();
        return;
      }

      if (e.key === 'F2') {
        e.preventDefault();
        onRename?.();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, onUpload, onNewFolder, onDelete, onRename, onFocusSearch, onEscape]);
}
