import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { complianceCompanyAPI } from '../services/complianceApi';

const FIELDS = [
  { name: 'companyName', label: 'Company Name' },
  { name: 'cin', label: 'CIN' },
  { name: 'gstin', label: 'GSTIN' },
  { name: 'pan', label: 'PAN' },
  { name: 'tan', label: 'TAN' },
  { name: 'address', label: 'Address', fullWidth: true, type: 'textarea' },
  { name: 'state', label: 'State' },
  { name: 'contactPerson', label: 'Contact Person' },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'phone', label: 'Phone' },
];

const empty = Object.fromEntries(FIELDS.map((f) => [f.name, '']));

function CompanyInformation() {
  const { hasPermission } = useAuth();
  const canUpdate =
    hasPermission('admin.all') ||
    hasPermission('compliance.full') ||
    hasPermission('compliance.company.update');

  const [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const response = await complianceCompanyAPI.get();
        setForm({ ...empty, ...response.data });
      } catch (error) {
        setToast(error.response?.data?.error || 'Failed to load company information');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!canUpdate) return;
    try {
      setSaving(true);
      const response = await complianceCompanyAPI.update(form);
      setForm({ ...empty, ...response.data });
      setToast('Company information saved');
      window.setTimeout(() => setToast(''), 2500);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cmp-page">
      <div className="cmp-page-header cmp-sticky-header">
        <div>
          <h1>Company Information</h1>
          <p className="cmp-page-subtitle">Statutory identifiers used across GST, TDS, and labour filings.</p>
        </div>
      </div>

      {toast ? <div className="cmp-toast">{toast}</div> : null}

      <div className="cmp-card">
        {loading ? (
          <div className="cmp-skeleton-list">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="cmp-skeleton-row" />
            ))}
          </div>
        ) : (
          <form className="cmp-form" onSubmit={handleSave}>
            <div className="cmp-form-grid">
              {FIELDS.map((field) => (
                <label key={field.name} className={`cmp-field${field.fullWidth ? ' full' : ''}`}>
                  <span>{field.label}</span>
                  {field.type === 'textarea' ? (
                    <textarea
                      className="cmp-input"
                      rows={3}
                      disabled={!canUpdate}
                      value={form[field.name] || ''}
                      onChange={(e) => setForm((prev) => ({ ...prev, [field.name]: e.target.value }))}
                    />
                  ) : (
                    <input
                      className="cmp-input"
                      type={field.type || 'text'}
                      disabled={!canUpdate}
                      value={form[field.name] || ''}
                      onChange={(e) => setForm((prev) => ({ ...prev, [field.name]: e.target.value }))}
                    />
                  )}
                </label>
              ))}
            </div>
            {canUpdate ? (
              <div className="cmp-modal-actions">
                <button type="submit" className="cmp-btn cmp-btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            ) : (
              <p className="cmp-page-subtitle">Read-only access for your role.</p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

export default CompanyInformation;
