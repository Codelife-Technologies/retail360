import React from 'react';
import { ATTACHMENT_CATEGORIES } from '../types/grn.types';

const UPLOADS_BASE = (process.env.REACT_APP_API_URL || 'http://localhost:5000/api').replace('/api', '');

function GrnAttachments({
  attachments = [],
  canEdit,
  attachmentCategory,
  setAttachmentCategory,
  attachmentFile,
  setAttachmentFile,
  onUpload,
}) {
  const categoryLabel = (value) =>
    ATTACHMENT_CATEGORIES.find((c) => c.value === value)?.label || value;

  return (
    <section className="grn-section">
      <h3>Attachments</h3>
      <ul className="grn-attachments-list">
        {attachments.length === 0 && <li className="grn-empty-inline">No attachments yet</li>}
        {attachments.map((a) => (
          <li key={a._id}>
            <a
              href={`${UPLOADS_BASE}/uploads/${a.filePath.replace(/\\/g, '/')}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {a.originalName}
            </a>
            <span className="grn-attachment-meta">
              {categoryLabel(a.category)} · {a.uploadedBy || 'User'}
            </span>
          </li>
        ))}
      </ul>
      {canEdit && (
        <div className="grn-upload-row">
          <select value={attachmentCategory} onChange={(e) => setAttachmentCategory(e.target.value)}>
            {ATTACHMENT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <input type="file" onChange={(e) => setAttachmentFile(e.target.files?.[0])} />
          <button type="button" className="btn-secondary" onClick={onUpload} disabled={!attachmentFile}>
            Upload
          </button>
        </div>
      )}
    </section>
  );
}

export default GrnAttachments;
