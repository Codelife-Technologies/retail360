import React from 'react';
import { documentsAPI } from '../services/documentsApi';
import { documentIcon, formatBytes, formatDateTime } from '../utils/documentsUtils';

export default function DetailsPanel({
  open,
  item,
  kind,
  onClose,
  starred,
  onToggleStar,
  onShare,
  onRename,
}) {
  if (!open) {
    return <aside className="drive-details drive-details-collapsed" aria-hidden="true" />;
  }

  if (!item) {
    return (
      <aside className="drive-details">
        <div className="drive-details-header">
          <h3>Properties</h3>
          <button type="button" className="drive-icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <p className="drive-details-empty">Select a file or folder to see details.</p>
      </aside>
    );
  }

  const isFolder = kind === 'folder' || item._driveKind === 'folder';
  const thumb = !isFolder
    ? documentsAPI.fileUrl(item.thumbnailUrl || item.fileUrl)
    : item.previewUrl
      ? documentsAPI.fileUrl(item.previewUrl)
      : '';

  const visibility = item.visibility || (isFolder ? 'Shared' : null);
  const permLines = [];
  if (isFolder) {
    if (visibility === 'Personal' && item.employeeVisible) {
      permLines.push('Personal · other employees can view');
      permLines.push('Only owner/admin can edit or upload');
    } else if (visibility === 'Personal') {
      permLines.push('Personal · owner and admins only');
    } else {
      permLines.push('Shared · visible to users with document access');
    }
    if (item.canManage === false) permLines.push('You have view access');
    else if (item.canManage) permLines.push('You can manage this folder');
  } else {
    permLines.push(`Source: ${item.source || item.kind || '—'}`);
    permLines.push('Access follows folder + document permissions');
  }

  return (
    <aside className="drive-details">
      <div className="drive-details-header">
        <h3>Properties</h3>
        <button type="button" className="drive-icon-btn" onClick={onClose} aria-label="Close">×</button>
      </div>

      <div className="drive-details-preview">
        {thumb ? (
          <img src={thumb} alt="" />
        ) : (
          <span className="drive-file-icon lg">{isFolder ? '📁' : documentIcon(item)}</span>
        )}
      </div>

      <h4 className="drive-details-title">
        {isFolder ? item.name : item.title || item.fileName || 'Untitled'}
      </h4>

      <dl className="drive-details-meta">
        {!isFolder ? (
          <>
            <div><dt>SKU</dt><dd>{item.sku || '—'}</dd></div>
            <div><dt>Owner</dt><dd>{item.uploadedBy || '—'}</dd></div>
            <div><dt>Department</dt><dd>{item.department || '—'}</dd></div>
            <div><dt>Size</dt><dd>{formatBytes(item.fileSize)}</dd></div>
            <div><dt>Type</dt><dd>{item.mimeType || item.documentType || '—'}</dd></div>
            <div><dt>Status</dt><dd>{item.status || 'Active'}</dd></div>
            <div><dt>Version</dt><dd>{item.version || 1}</dd></div>
            <div><dt>Created</dt><dd>{formatDateTime(item.createdAt)}</dd></div>
            <div><dt>Updated</dt><dd>{formatDateTime(item.updatedAt)}</dd></div>
            <div><dt>Tags</dt><dd>{(item.tags || []).join(', ') || '—'}</dd></div>
          </>
        ) : (
          <>
            <div><dt>Visibility</dt><dd>{visibility}{item.employeeVisible ? ' · Viewable' : ''}</dd></div>
            <div><dt>Owner</dt><dd>{item.createdBy || '—'}</dd></div>
            <div><dt>Items</dt><dd>{(item.documentCount || 0) + (item.productImageCount || 0)}</dd></div>
            <div><dt>SKU</dt><dd>{item.linkedSku || '—'}</dd></div>
            <div><dt>Created</dt><dd>{formatDateTime(item.createdAt)}</dd></div>
          </>
        )}
      </dl>

      <section className="drive-details-section">
        <h5>Permissions</h5>
        <ul>
          {permLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {item.shareRole ? (
          <p className="drive-share-role-chip">Shared with you as <strong>{item.shareRole}</strong></p>
        ) : null}
      </section>

      <section className="drive-details-section">
        <h5>Activity</h5>
        <p className="drive-coming-soon">Activity timeline — coming soon</p>
      </section>

      <section className="drive-details-section">
        <h5>Version history</h5>
        {!isFolder && item.version ? (
          <p>Current version: v{item.version}</p>
        ) : (
          <p className="drive-coming-soon">Version restore — coming soon</p>
        )}
      </section>

      <div className="drive-details-actions">
        {onRename ? (
          <button type="button" className="drive-btn" onClick={onRename}>
            Rename
          </button>
        ) : null}
        {onShare ? (
          <button type="button" className="drive-btn drive-btn-primary" onClick={onShare}>
            Share
          </button>
        ) : null}
        <button type="button" className="drive-btn" onClick={() => onToggleStar?.(kind === 'folder' ? 'folder' : 'document', item._id || item.id)}>
          {starred ? 'Unstar' : 'Star'}
        </button>
      </div>
    </aside>
  );
}
