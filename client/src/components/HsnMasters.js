import React, { useCallback, useEffect, useState } from 'react';
import { hsnMastersAPI } from '../services/api';
import DetailModal from './DetailModal';
import './HsnMasters.css';

const emptyForm = () => ({
  hsnCode: '',
  description: '',
  gstRate: 18,
  cgstRate: '',
  sgstRate: '',
  igstRate: '',
  cessRate: 0,
  defaultUom: 'PCS',
  chapter: '',
  isActive: true,
  effectiveFrom: '',
  effectiveTo: '',
  notes: '',
});

function toDateInput(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function HsnMasters() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [formData, setFormData] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const fetchRows = useCallback(async () => {
    try {
      setLoading(true);
      const response = await hsnMastersAPI.getAll({ search: searchTerm || undefined });
      const data = Array.isArray(response.data) ? response.data : response.data?.data || [];
      setRows(data);
    } catch (error) {
      console.error('Error fetching HSN masters:', error);
      alert(error.response?.data?.error || 'Failed to fetch HSN masters');
    } finally {
      setLoading(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    fetchRows();
  }, []);

  useEffect(() => {
    const timer = setTimeout(fetchRows, 300);
    return () => clearTimeout(timer);
  }, [fetchRows]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => {
      const next = {
        ...prev,
        [name]: type === 'checkbox' ? checked : value,
      };
      if (name === 'gstRate') {
        const gst = parseFloat(value) || 0;
        const half = Math.round((gst / 2) * 100) / 100;
        if (prev.cgstRate === '' || prev.cgstRate == null || Number(prev.cgstRate) === Math.round(((parseFloat(prev.gstRate) || 0) / 2) * 100) / 100) {
          next.cgstRate = half;
        }
        if (prev.sgstRate === '' || prev.sgstRate == null || Number(prev.sgstRate) === Math.round(((parseFloat(prev.gstRate) || 0) / 2) * 100) / 100) {
          next.sgstRate = half;
        }
        if (prev.igstRate === '' || prev.igstRate == null || Number(prev.igstRate) === Number(prev.gstRate)) {
          next.igstRate = gst;
        }
      }
      return next;
    });
  };

  const openCreate = () => {
    setEditing(null);
    setFormData(emptyForm());
    setShowModal(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setFormData({
      hsnCode: row.hsnCode || '',
      description: row.description || '',
      gstRate: row.gstRate ?? 0,
      cgstRate: row.cgstRate ?? '',
      sgstRate: row.sgstRate ?? '',
      igstRate: row.igstRate ?? '',
      cessRate: row.cessRate ?? 0,
      defaultUom: row.defaultUom || 'PCS',
      chapter: row.chapter || '',
      isActive: row.isActive !== false,
      effectiveFrom: toDateInput(row.effectiveFrom),
      effectiveTo: toDateInput(row.effectiveTo),
      notes: row.notes || '',
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
    setFormData(emptyForm());
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!String(formData.hsnCode || '').trim()) {
      alert('HSN code is required');
      return;
    }
    try {
      setSaving(true);
      const payload = {
        ...formData,
        gstRate: parseFloat(formData.gstRate) || 0,
        cgstRate: formData.cgstRate === '' ? null : parseFloat(formData.cgstRate),
        sgstRate: formData.sgstRate === '' ? null : parseFloat(formData.sgstRate),
        igstRate: formData.igstRate === '' ? null : parseFloat(formData.igstRate),
        cessRate: parseFloat(formData.cessRate) || 0,
        effectiveFrom: formData.effectiveFrom || null,
        effectiveTo: formData.effectiveTo || null,
      };
      if (editing) {
        await hsnMastersAPI.update(editing._id, payload);
      } else {
        await hsnMastersAPI.create(payload);
      }
      closeModal();
      fetchRows();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to save HSN master');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this HSN code? Purchase orders will fall back to category tax if linked.')) {
      return;
    }
    try {
      await hsnMastersAPI.delete(id);
      fetchRows();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to delete HSN master');
    }
  };

  return (
    <div className="hsn-masters-page">
      <div className="hsn-masters-header">
        <div>
          <h1>HSN Tax Master</h1>
          <p className="hsn-masters-subtitle">
            GST rates and PO details by HSN / SAC code. Purchase Orders use this master for tax %.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={openCreate}>
          + Add HSN
        </button>
      </div>

      <div className="hsn-masters-toolbar">
        <input
          type="search"
          className="hsn-masters-search"
          placeholder="Search HSN, description, chapter…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="hsn-masters-empty">Loading…</div>
      ) : (
        <div className="table-container">
          <table className="hsn-masters-table">
            <thead>
              <tr>
                <th>HSN Code</th>
                <th>Description</th>
                <th>GST %</th>
                <th>CGST</th>
                <th>SGST</th>
                <th>IGST</th>
                <th>Cess</th>
                <th>UOM</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="no-data">
                    No HSN codes yet. Add one to drive PO tax by HSN.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row._id}
                    className="clickable-row"
                    onClick={() => setViewing(row)}
                  >
                    <td><strong>{row.hsnCode}</strong></td>
                    <td>{row.description || '—'}</td>
                    <td>{row.gstRate ?? 0}%</td>
                    <td>{row.cgstRate ?? '—'}%</td>
                    <td>{row.sgstRate ?? '—'}%</td>
                    <td>{row.igstRate ?? row.gstRate ?? '—'}%</td>
                    <td>{row.cessRate ?? 0}%</td>
                    <td>{row.defaultUom || 'PCS'}</td>
                    <td>
                      <span className={`hsn-status ${row.isActive !== false ? 'active' : 'inactive'}`}>
                        {row.isActive !== false ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="btn-edit" onClick={() => openEdit(row)}>Edit</button>
                      <button type="button" className="btn-delete" onClick={() => handleDelete(row._id)}>Delete</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {viewing ? (
        <DetailModal
          title={`HSN ${viewing.hsnCode}`}
          fields={[
            { label: 'HSN Code', value: viewing.hsnCode },
            { label: 'Description', value: viewing.description, full: true },
            { label: 'GST %', value: `${viewing.gstRate ?? 0}%` },
            { label: 'CGST %', value: `${viewing.cgstRate ?? '—'}%` },
            { label: 'SGST %', value: `${viewing.sgstRate ?? '—'}%` },
            { label: 'IGST %', value: `${viewing.igstRate ?? viewing.gstRate ?? '—'}%` },
            { label: 'Cess %', value: `${viewing.cessRate ?? 0}%` },
            { label: 'Default UOM', value: viewing.defaultUom || 'PCS' },
            { label: 'Chapter', value: viewing.chapter || '—' },
            { label: 'Status', value: viewing.isActive !== false ? 'Active' : 'Inactive' },
            { label: 'Effective From', value: toDateInput(viewing.effectiveFrom) || '—' },
            { label: 'Effective To', value: toDateInput(viewing.effectiveTo) || '—' },
            { label: 'Notes', value: viewing.notes, full: true },
          ]}
          onClose={() => setViewing(null)}
          onEdit={() => {
            const row = viewing;
            setViewing(null);
            openEdit(row);
          }}
          onDelete={() => {
            const id = viewing._id;
            setViewing(null);
            handleDelete(id);
          }}
        />
      ) : null}

      {showModal ? (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content hsn-masters-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editing ? 'Edit HSN' : 'Add HSN'}</h2>
            <form onSubmit={handleSubmit} className="hsn-masters-form">
              <div className="form-row">
                <div className="form-group">
                  <label>HSN / SAC Code *</label>
                  <input
                    name="hsnCode"
                    value={formData.hsnCode}
                    onChange={handleInputChange}
                    required
                    placeholder="e.g. 741980"
                  />
                </div>
                <div className="form-group">
                  <label>Chapter</label>
                  <input name="chapter" value={formData.chapter} onChange={handleInputChange} placeholder="Optional" />
                </div>
                <div className="form-group">
                  <label>Default UOM</label>
                  <input name="defaultUom" value={formData.defaultUom} onChange={handleInputChange} />
                </div>
              </div>

              <div className="form-group">
                <label>Description</label>
                <input
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  placeholder="Goods / service description"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>GST % *</label>
                  <input
                    type="number"
                    name="gstRate"
                    value={formData.gstRate}
                    onChange={handleInputChange}
                    min="0"
                    max="100"
                    step="0.01"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>CGST %</label>
                  <input type="number" name="cgstRate" value={formData.cgstRate} onChange={handleInputChange} min="0" max="100" step="0.01" />
                </div>
                <div className="form-group">
                  <label>SGST %</label>
                  <input type="number" name="sgstRate" value={formData.sgstRate} onChange={handleInputChange} min="0" max="100" step="0.01" />
                </div>
                <div className="form-group">
                  <label>IGST %</label>
                  <input type="number" name="igstRate" value={formData.igstRate} onChange={handleInputChange} min="0" max="100" step="0.01" />
                </div>
                <div className="form-group">
                  <label>Cess %</label>
                  <input type="number" name="cessRate" value={formData.cessRate} onChange={handleInputChange} min="0" max="100" step="0.01" />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Effective From</label>
                  <input type="date" name="effectiveFrom" value={formData.effectiveFrom} onChange={handleInputChange} />
                </div>
                <div className="form-group">
                  <label>Effective To</label>
                  <input type="date" name="effectiveTo" value={formData.effectiveTo} onChange={handleInputChange} />
                </div>
                <div className="form-group hsn-active-check">
                  <label>
                    <input type="checkbox" name="isActive" checked={formData.isActive} onChange={handleInputChange} />
                    {' '}Active
                  </label>
                </div>
              </div>

              <div className="form-group">
                <label>Notes</label>
                <textarea name="notes" value={formData.notes} onChange={handleInputChange} rows={2} />
              </div>

              <div className="form-actions">
                <button type="button" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : editing ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default HsnMasters;
