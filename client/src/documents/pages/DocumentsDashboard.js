import React, { useEffect, useState } from 'react';
import { documentsAPI } from '../services/documentsApi';
import { formatBytes, formatDate } from '../utils/documentsUtils';

function DocumentsDashboard({ onNavigate }) {
  const [analytics, setAnalytics] = useState(null);
  const [recentAi, setRecentAi] = useState([]);
  const [recentManual, setRecentManual] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const [a, ai, manual] = await Promise.all([
          documentsAPI.getAnalytics(),
          documentsAPI.list({ source: 'AI Generator', status: 'Active', page: 1, limit: 6 }),
          documentsAPI.list({ source: 'Manual Upload', status: 'Active', page: 1, limit: 6 }),
        ]);
        if (!alive) return;
        setAnalytics(a.data);
        setRecentAi(ai.data?.data || []);
        setRecentManual(manual.data?.data || []);
      } catch (e) {
        if (alive) setToast(e.response?.data?.error || 'Failed to load dashboard');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const go = (tab) => onNavigate && onNavigate(`documents:${tab}`);

  return (
    <div className="dm-page">
      <div className="dm-page-header">
        <div>
          <h1>Document Management</h1>
          <p className="dm-subtitle">Central repository for product images and employee uploads</p>
        </div>
      </div>

      {toast ? <div className="dm-toast">{toast}</div> : null}

      <div className="dm-kpi-grid">
        <div className="dm-kpi-card info clickable" onClick={() => go('storage-analytics')} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && go('storage-analytics')}>
          <h3>{loading ? '…' : analytics?.totalFiles ?? 0}</h3>
          <p>Total Files</p>
        </div>
        <div className="dm-kpi-card success clickable" onClick={() => go('ai-generated-images')} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && go('ai-generated-images')}>
          <h3>{loading ? '…' : analytics?.aiGeneratedImages ?? 0}</h3>
          <p>Product images</p>
        </div>
        <div className="dm-kpi-card warning clickable" onClick={() => go('employee-documents')} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && go('employee-documents')}>
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
          <p>This Month</p>
        </div>
      </div>

      <div className="dm-card">
        <h3>Recent Product images</h3>
        {recentAi.length === 0 ? (
          <div className="dm-empty"><p>No product images yet. Upload from desktop, or generate in Utilities → Image Generator and Save.</p></div>
        ) : (
          <div className="dm-grid">
            {recentAi.map((doc) => (
              <div key={doc._id} className="dm-image-card">
                <div className="dm-image-preview">
                  <img src={documentsAPI.fileUrl(doc.thumbnailUrl || doc.fileUrl)} alt={doc.title} />
                </div>
                <div className="dm-image-body">
                  <strong>{doc.sku || '—'}</strong>
                  <span className="dm-meta">{doc.productName || doc.title}</span>
                  <span className="dm-meta">{formatDate(doc.createdAt)} · v{doc.version}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="dm-card">
        <h3>Recent Employee Documents</h3>
        {recentManual.length === 0 ? (
          <div className="dm-empty"><p>No employee documents uploaded yet.</p></div>
        ) : (
          <div className="dm-table-wrap">
            <table className="dm-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Department</th>
                  <th>Uploaded By</th>
                  <th>Date</th>
                  <th>Size</th>
                </tr>
              </thead>
              <tbody>
                {recentManual.map((doc) => (
                  <tr key={doc._id}>
                    <td>{doc.title || doc.fileName}</td>
                    <td>{doc.department || '—'}</td>
                    <td>{doc.uploadedBy || '—'}</td>
                    <td>{formatDate(doc.createdAt)}</td>
                    <td>{formatBytes(doc.fileSize)}</td>
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

export default DocumentsDashboard;
