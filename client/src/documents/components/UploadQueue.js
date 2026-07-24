import React from 'react';
import { formatBytes } from '../utils/documentsUtils';

export default function UploadQueue({ items, onCancel, onRetry, onDismiss, onClearDone }) {
  if (!items?.length) return null;

  return (
    <div className="drive-upload-queue" role="status" aria-live="polite">
      <div className="drive-upload-queue-header">
        <strong>Uploads</strong>
        <div>
          <button type="button" className="drive-link" onClick={onClearDone}>Clear finished</button>
        </div>
      </div>
      <ul className="drive-upload-list">
        {items.map((it) => (
          <li key={it.id} className={`drive-upload-item status-${it.status}`}>
            <div className="drive-upload-thumb">
              {it.previewUrl ? <img src={it.previewUrl} alt="" /> : <span>📄</span>}
            </div>
            <div className="drive-upload-info">
              <div className="drive-upload-name" title={it.name}>{it.name}</div>
              <div className="drive-upload-sub">
                {formatBytes(it.size)}
                {it.status === 'uploading' ? ` · ${it.progress}%` : null}
                {it.error ? ` · ${it.error}` : null}
              </div>
              {(it.status === 'uploading' || it.status === 'queued') ? (
                <div className="drive-upload-bar">
                  <div style={{ width: `${it.progress || 0}%` }} />
                </div>
              ) : null}
            </div>
            <div className="drive-upload-actions">
              {(it.status === 'uploading' || it.status === 'queued') ? (
                <button type="button" className="drive-link" onClick={() => onCancel(it.id)}>Cancel</button>
              ) : null}
              {it.status === 'error' || it.status === 'cancelled' ? (
                <button type="button" className="drive-link" onClick={() => onRetry(it.id)}>Retry</button>
              ) : null}
              {it.status === 'done' || it.status === 'error' || it.status === 'cancelled' ? (
                <button type="button" className="drive-link" onClick={() => onDismiss(it.id)}>×</button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <p className="drive-coming-soon tiny">Pause / resume requires chunked upload (coming later)</p>
    </div>
  );
}
