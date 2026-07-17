import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { complianceDocumentsAPI } from '../services/complianceApi';
import { extractList, extractPagination, formatDate } from '../utils/complianceUtils';
import api from '../../services/api';

const CATEGORIES = [
  'GST',
  'TDS',
  'Payroll',
  'EPF',
  'ESIC',
  'Licenses',
  'Employee Documents',
  'Audit Reports',
];

function DocumentRepository() {
  const { hasPermission } = useAuth();
  const canUpload =
    hasPermission('admin.all') ||
    hasPermission('compliance.full') ||
    hasPermission('compliance.documents.create');
  const canDelete =
    hasPermission('admin.all') ||
    hasPermission('compliance.full') ||
    hasPermission('compliance.documents.delete');

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [category, setCategory] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [file, setFile] = useState(null);
  const [uploadCategory, setUploadCategory] = useState('GST');
  const [toast, setToast] = useState('');
  const [preview, setPreview] = useState(null);

  const fetchRows = useCallback(async () => {
    try {
      setLoading(true);
      const response = await complianceDocumentsAPI.getAll({
        search: searchTerm,
        category,
        dateFrom,
        dateTo,
        page,
        limit: 15,
      });
      setRows(extractList(response));
      setPagination(extractPagination(response));
    } catch (error) {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, category, dateFrom, dateTo, page]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) {
      alert('Choose a file to upload');
      return;
    }
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', uploadCategory);
      await complianceDocumentsAPI.upload(formData);
      setFile(null);
      setToast('Document uploaded');
      window.setTimeout(() => setToast(''), 2500);
      fetchRows();
    } catch (error) {
      alert(error.response?.data?.error || 'Upload failed');
    }
  };

  const openPreview = async (doc) => {
    try {
      const response = await api.get(`/compliance/documents/${doc._id}/preview`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(response.data);
      setPreview({ url, mimeType: doc.mimeType, name: doc.originalName || doc.fileName });
    } catch (error) {
      alert('Preview failed');
    }
  };

  const closePreview = () => {
    if (preview?.url) window.URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  return (
    <div className="cmp-page">
      <div className="cmp-page-header cmp-sticky-header">
        <div>
          <h1>Document Repository</h1>
          <p className="cmp-page-subtitle">Upload, preview, and download compliance documents by category.</p>
        </div>
      </div>

      {toast ? <div className="cmp-toast">{toast}</div> : null}

      {canUpload ? (
        <form className="cmp-card cmp-upload-bar" onSubmit={handleUpload}>
          <select className="cmp-input" value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <input type="file" className="cmp-input" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <button type="submit" className="cmp-btn cmp-btn-primary">Upload</button>
        </form>
      ) : null}

      <div className="cmp-toolbar">
        <input
          type="search"
          className="cmp-input"
          placeholder="Search files…"
          value={searchTerm}
          onChange={(e) => {
            setPage(1);
            setSearchTerm(e.target.value);
          }}
        />
        <select
          className="cmp-input"
          value={category}
          onChange={(e) => {
            setPage(1);
            setCategory(e.target.value);
          }}
        >
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <input type="date" className="cmp-input" value={dateFrom} onChange={(e) => { setPage(1); setDateFrom(e.target.value); }} />
        <input type="date" className="cmp-input" value={dateTo} onChange={(e) => { setPage(1); setDateTo(e.target.value); }} />
      </div>

      <div className="cmp-card cmp-table-card">
        {loading ? (
          <div className="cmp-skeleton-list">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="cmp-skeleton-row" />)}</div>
        ) : rows.length === 0 ? (
          <div className="cmp-empty"><h3>No documents</h3><p>Upload files to build your compliance repository.</p></div>
        ) : (
          <div className="cmp-table-wrap">
            <table className="cmp-table">
              <thead>
                <tr>
                  <th>File Name</th>
                  <th>Category</th>
                  <th>Upload Date</th>
                  <th>Uploaded By</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((doc) => (
                  <tr key={doc._id}>
                    <td>{doc.originalName || doc.fileName}</td>
                    <td>{doc.category}</td>
                    <td>{formatDate(doc.uploadDate)}</td>
                    <td>{doc.uploadedBy || '—'}</td>
                    <td>
                      <div className="cmp-row-actions">
                        <button type="button" className="cmp-link-btn" onClick={() => openPreview(doc)}>Preview</button>
                        <button
                          type="button"
                          className="cmp-link-btn"
                          onClick={() => complianceDocumentsAPI.download(doc._id, doc.originalName || doc.fileName)}
                        >
                          Download
                        </button>
                        {canDelete ? (
                          <button
                            type="button"
                            className="cmp-link-btn danger"
                            onClick={async () => {
                              if (!window.confirm('Delete this document?')) return;
                              await complianceDocumentsAPI.delete(doc._id);
                              fetchRows();
                            }}
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pagination ? (
          <div className="cmp-pagination">
            <button type="button" className="cmp-btn" disabled={!pagination.hasPrevPage} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button>
            <span>Page {pagination.page} of {pagination.totalPages || 1}</span>
            <button type="button" className="cmp-btn" disabled={!pagination.hasNextPage} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        ) : null}
      </div>

      {preview ? (
        <div className="cmp-modal-backdrop" onClick={closePreview}>
          <div className="cmp-modal cmp-preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cmp-modal-header">
              <h2>{preview.name}</h2>
              <button type="button" className="cmp-link-btn" onClick={closePreview}>Close</button>
            </div>
            {String(preview.mimeType || '').startsWith('image/') ? (
              <img src={preview.url} alt={preview.name} className="cmp-preview-media" />
            ) : String(preview.mimeType || '').includes('pdf') ? (
              <iframe title={preview.name} src={preview.url} className="cmp-preview-media" />
            ) : (
              <p>Preview not available for this file type. Use Download instead.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default DocumentRepository;
