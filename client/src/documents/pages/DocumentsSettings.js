import React, { useEffect, useState } from 'react';
import { documentsAPI } from '../services/documentsApi';
import { formatBytes } from '../utils/documentsUtils';

function DocumentsSettings() {
  const [settings, setSettings] = useState(null);
  const [maxMb, setMaxMb] = useState(25);
  const [extensions, setExtensions] = useState('');
  const [retention, setRetention] = useState(30);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    documentsAPI.getSettings()
      .then((res) => {
        setSettings(res.data);
        setMaxMb(Math.round((res.data.maxUploadBytes || 0) / (1024 * 1024)) || 25);
        setExtensions((res.data.allowedExtensions || []).join(', '));
        setRetention(res.data.retentionDaysInTrash || 30);
      })
      .catch((e) => setToast(e.response?.data?.error || 'Failed to load settings'));
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      const res = await documentsAPI.updateSettings({
        maxUploadBytes: Number(maxMb) * 1024 * 1024,
        allowedExtensions: extensions.split(',').map((e) => e.trim()).filter(Boolean),
        retentionDaysInTrash: Number(retention),
      });
      setSettings(res.data);
      setToast('Settings saved');
      setTimeout(() => setToast(''), 2000);
    } catch (e) {
      setToast(e.response?.data?.error || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dm-page">
      <div className="dm-page-header">
        <div>
          <h1>Document Settings</h1>
          <p className="dm-subtitle">Configure upload limits and allowed file types</p>
        </div>
        <div className="dm-actions">
          <button type="button" className="dm-btn dm-btn-primary" onClick={handleSave} disabled={saving || !settings}>
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </div>

      {toast ? <div className="dm-toast">{toast}</div> : null}

      <div className="dm-card">
        <h3>Storage Rules</h3>
        <div className="dm-toolbar">
          <label className="dm-field">
            <span>Max upload size (MB)</span>
            <input
              type="number"
              min="1"
              className="dm-input"
              value={maxMb}
              onChange={(e) => setMaxMb(e.target.value)}
            />
          </label>
          <label className="dm-field">
            <span>Trash retention (days)</span>
            <input
              type="number"
              min="1"
              className="dm-input"
              value={retention}
              onChange={(e) => setRetention(e.target.value)}
            />
          </label>
        </div>
        <label className="dm-field" style={{ maxWidth: '100%' }}>
          <span>Allowed extensions (comma separated)</span>
          <input
            className="dm-input"
            value={extensions}
            onChange={(e) => setExtensions(e.target.value)}
            placeholder=".pdf, .docx, .xlsx, .png"
          />
        </label>
        {settings ? (
          <p className="dm-subtitle" style={{ marginTop: '1rem' }}>
            Current max: {formatBytes(settings.maxUploadBytes)} · Folders:
            {' '}
            <code>uploads/document-management/ai-generated</code>
            {' · '}
            <code>uploads/document-management/employee-documents</code>
          </p>
        ) : null}
      </div>

      <div className="dm-card">
        <h3>Sources</h3>
        <p className="dm-subtitle">
          This module only accepts files from <strong>AI Generator</strong> and <strong>Manual Upload</strong>.
          Employee documents never overwrite product images. Regenerated AI images are stored as new versions.
        </p>
      </div>
    </div>
  );
}

export default DocumentsSettings;
