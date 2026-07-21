import React, { useEffect, useState } from 'react';
import { documentsAPI } from '../services/documentsApi';
import { formatBytes, formatDate } from '../utils/documentsUtils';

function StorageAnalytics() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const res = await documentsAPI.getAnalytics();
        if (alive) setAnalytics(res.data);
      } catch (e) {
        if (alive) setToast(e.response?.data?.error || 'Failed to load analytics');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div className="dm-page">
      <div className="dm-page-header">
        <div>
          <h1>Storage Analytics</h1>
          <p className="dm-subtitle">Usage overview across AI images and employee documents</p>
        </div>
      </div>

      {toast ? <div className="dm-toast">{toast}</div> : null}

      <div className="dm-kpi-grid">
        <div className="dm-kpi-card info">
          <h3>{loading ? '…' : analytics?.totalFiles ?? 0}</h3>
          <p>Total Files</p>
        </div>
        <div className="dm-kpi-card success">
          <h3>{loading ? '…' : analytics?.aiGeneratedImages ?? 0}</h3>
          <p>AI Generated Images</p>
        </div>
        <div className="dm-kpi-card warning">
          <h3>{loading ? '…' : analytics?.manualDocuments ?? 0}</h3>
          <p>Manual Documents</p>
        </div>
        <div className="dm-kpi-card">
          <h3>{loading ? '…' : formatBytes(analytics?.storageUsedBytes)}</h3>
          <p>Storage Used</p>
        </div>
        <div className="dm-kpi-card">
          <h3>{loading ? '…' : analytics?.todaysUploads ?? 0}</h3>
          <p>Today&apos;s Uploads</p>
        </div>
        <div className="dm-kpi-card">
          <h3>{loading ? '…' : analytics?.thisMonthUploads ?? 0}</h3>
          <p>This Month Uploads</p>
        </div>
      </div>

      <div className="dm-card">
        <h3>Largest Files</h3>
        {!analytics?.largestFiles?.length ? (
          <div className="dm-empty"><p>No files yet.</p></div>
        ) : (
          <div className="dm-table-wrap">
            <table className="dm-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Source</th>
                  <th>SKU</th>
                  <th>Size</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {(analytics.largestFiles || []).map((doc) => (
                  <tr key={doc._id}>
                    <td>{doc.title || doc.fileName}</td>
                    <td>
                      <span className={`dm-badge ${doc.source === 'AI Generator' ? 'ai' : 'manual'}`}>
                        {doc.source}
                      </span>
                    </td>
                    <td>{doc.sku || '—'}</td>
                    <td>{formatBytes(doc.fileSize)}</td>
                    <td>{formatDate(doc.createdAt)}</td>
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

export default StorageAnalytics;
