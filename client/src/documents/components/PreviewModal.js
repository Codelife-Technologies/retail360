import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import { documentsAPI } from '../services/documentsApi';

function isImage(doc) {
  const ext = String(doc?.fileExtension || '').toLowerCase();
  return (
    doc?.documentType === 'Image' ||
    ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext) ||
    String(doc?.mimeType || '').startsWith('image/')
  );
}

function isPdf(doc) {
  return String(doc?.fileExtension || '').toLowerCase() === '.pdf' || doc?.mimeType === 'application/pdf';
}

function isText(doc) {
  const ext = String(doc?.fileExtension || '').toLowerCase();
  return ['.txt', '.csv', '.md', '.json'].includes(ext) || String(doc?.mimeType || '').startsWith('text/');
}

export default function PreviewModal({ doc, onClose }) {
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [text, setText] = useState('');
  const [textError, setTextError] = useState('');

  useEffect(() => {
    setRotation(0);
    setZoom(1);
    setText('');
    setTextError('');
  }, [doc?._id]);

  useEffect(() => {
    if (!doc || !isText(doc) || doc.kind === 'product') return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/documents/${doc._id}/download`, { responseType: 'text' });
        if (!cancelled) setText(typeof res.data === 'string' ? res.data : String(res.data || ''));
      } catch (_e) {
        if (!cancelled) setTextError('Preview not available for this file. Use Download.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc]);

  if (!doc) return null;

  const url = documentsAPI.fileUrl(doc.fileUrl || doc.thumbnailUrl);
  const image = isImage(doc);
  const pdf = isPdf(doc);
  const texty = isText(doc);

  return (
    <div className="drive-preview-overlay" onClick={onClose} role="presentation">
      <div className="drive-preview-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="drive-preview-toolbar">
          <strong>{doc.title || doc.fileName || 'Preview'}</strong>
          <div className="drive-preview-tools">
            {image ? (
              <>
                <button type="button" className="drive-btn" onClick={() => setZoom((z) => Math.min(3, z + 0.25))}>Zoom +</button>
                <button type="button" className="drive-btn" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}>Zoom −</button>
                <button type="button" className="drive-btn" onClick={() => setRotation((r) => r + 90)}>Rotate</button>
              </>
            ) : null}
            {doc.kind !== 'product' && doc._id && !String(doc._id).startsWith('product-') ? (
              <button
                type="button"
                className="drive-btn"
                onClick={() => documentsAPI.download(doc._id, doc.fileName || doc.title || 'document')}
              >
                Download
              </button>
            ) : null}
            <button type="button" className="drive-btn" onClick={onClose}>Close</button>
          </div>
        </div>
        <div className="drive-preview-body">
          {image ? (
            <img
              src={url}
              alt={doc.title || doc.fileName || ''}
              style={{ transform: `rotate(${rotation}deg) scale(${zoom})` }}
            />
          ) : pdf ? (
            <iframe title="PDF preview" src={url} className="drive-preview-frame" />
          ) : texty ? (
            textError ? <p>{textError}</p> : <pre className="drive-preview-text">{text || 'Loading…'}</pre>
          ) : (
            <div className="drive-preview-fallback">
              <p>Inline preview is not available for this file type.</p>
              <p>Office documents open best after download.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
