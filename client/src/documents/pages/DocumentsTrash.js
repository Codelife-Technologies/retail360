import React, { useCallback, useEffect, useState } from 'react';
import { documentsAPI } from '../services/documentsApi';
import { documentIcon, extractList, formatBytes, formatDate } from '../utils/documentsUtils';

function DocumentsTrash() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await documentsAPI.list({
        status: 'Deleted',
        search: search || undefined,
        page: 1,
        limit: 100,
      });
      const { data } = extractList(res);
      setDocs(data);
    } catch (e) {
      setToast(e.response?.data?.error || 'Failed to load trash');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const handleRestore = async (doc) => {
    try {
      await documentsAPI.restore(doc._id);
      setToast('Restored');
      load();
    } catch (e) {
      setToast(e.response?.data?.error || 'Restore failed');
    }
  };

  const handlePermanent = async (doc) => {
    if (!window.confirm(`Permanently delete "${doc.title || doc.fileName}"? This cannot be undone.`)) return;
    try {
      await documentsAPI.permanentDelete(doc._id);
      setToast('Permanently deleted');
      load();
    } catch (e) {
      setToast(e.response?.data?.error || 'Permanent delete failed');
    }
  };

  return (
    <div className="dm-page">
      <div className="dm-page-header">
        <div>
          <h1>Trash</h1>
          <p className="dm-subtitle">Soft-deleted documents — restore or permanently remove</p>
        </div>
      </div>

      {toast ? <div className="dm-toast">{toast}</div> : null}

      <div className="dm-toolbar">
        <label className="dm-field dm-search">
          <span>Search</span>
          <input className="dm-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search trash…" />
        </label>
      </div>

      <div className="dm-card">
        {loading ? (
          <div className="dm-empty">Loading…</div>
        ) : docs.length === 0 ? (
          <div className="dm-empty"><h3>Trash is empty</h3></div>
        ) : (
          <div className="dm-table-wrap">
            <table className="dm-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Name</th>
                  <th>Source</th>
                  <th>Deleted</th>
                  <th>Size</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((doc) => (
                  <tr key={doc._id}>
                    <td>{documentIcon(doc)}</td>
                    <td>{doc.title || doc.fileName}</td>
                    <td>
                      <span className={`dm-badge ${doc.source === 'AI Generator' ? 'ai' : 'manual'}`}>
                        {doc.source}
                      </span>
                    </td>
                    <td>{formatDate(doc.deletedAt || doc.updatedAt)}</td>
                    <td>{formatBytes(doc.fileSize)}</td>
                    <td>
                      <button type="button" className="dm-link" onClick={() => handleRestore(doc)}>Restore</button>
                      {' · '}
                      <button type="button" className="dm-link" onClick={() => handlePermanent(doc)}>Permanent Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default DocumentsTrash;
