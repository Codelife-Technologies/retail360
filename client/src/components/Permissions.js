import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { permissionsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import './UserManagement.css';

const PAGE_SIZE = 10;

function truncateText(text, maxLength = 50) {
  if (!text) return '—';
  const trimmed = String(text).trim();
  if (!trimmed) return '—';
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}…`;
}

function getInitials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function Permissions() {
  const { hasPermission } = useAuth();
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingPermission, setEditingPermission] = useState(null);
  const [page, setPage] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    module: '',
    description: '',
  });

  const fetchPermissions = useCallback(async (search = searchTerm) => {
    try {
      setLoading(true);
      const response = await permissionsAPI.getAll({ search });
      const data = Array.isArray(response.data) ? response.data : response.data?.data || [];
      setPermissions(data);
      setPage(1);
    } catch (error) {
      console.error('Error fetching permissions:', error);
      alert(error.response?.data?.error || 'Failed to fetch permissions');
    } finally {
      setLoading(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    const timer = setTimeout(() => fetchPermissions(searchTerm), searchTerm ? 300 : 0);
    return () => clearTimeout(timer);
  }, [searchTerm, fetchPermissions]);

  const totalPages = Math.max(1, Math.ceil(permissions.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagePermissions = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return permissions.slice(start, start + PAGE_SIZE);
  }, [permissions, currentPage]);

  const pageNumbers = useMemo(() => {
    const maxButtons = 5;
    let start = Math.max(1, currentPage - Math.floor(maxButtons / 2));
    let end = Math.min(totalPages, start + maxButtons - 1);
    start = Math.max(1, end - maxButtons + 1);
    const nums = [];
    for (let i = start; i <= end; i += 1) nums.push(i);
    return nums;
  }, [currentPage, totalPages]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setFormData({ name: '', code: '', module: '', description: '' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingPermission) {
        await permissionsAPI.update(editingPermission._id, formData);
      } else {
        await permissionsAPI.create(formData);
      }
      setShowModal(false);
      setEditingPermission(null);
      resetForm();
      fetchPermissions(searchTerm);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to save permission');
    }
  };

  const handleEdit = (item) => {
    setEditingPermission(item);
    setFormData({
      name: item.name || '',
      code: item.code || '',
      module: item.module || '',
      description: item.description || '',
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this permission?')) return;
    try {
      await permissionsAPI.delete(id);
      fetchPermissions(searchTerm);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to delete permission');
    }
  };

  const openAddModal = () => {
    setEditingPermission(null);
    resetForm();
    setShowModal(true);
  };

  return (
    <div className="um-mgmt-page">
      <div className="um-mgmt-card">
        <div className="um-mgmt-card-top">
          <div className="um-mgmt-heading">
            <h1>Permission Management</h1>
            <p className="um-mgmt-breadcrumb">
              Home <span>›</span> Permissions &amp; Accounts <span>›</span> Permissions
            </p>
          </div>
          <div className="um-mgmt-toolbar">
            <label className="um-mgmt-search">
              <span className="um-mgmt-search-icon" aria-hidden="true">
                🔍
              </span>
              <input
                type="search"
                placeholder="Search Permission"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </label>
            {hasPermission('permissions.create') && (
              <button type="button" className="um-mgmt-add-btn" onClick={openAddModal}>
                Add Permission
              </button>
            )}
          </div>
        </div>

        <div className="um-mgmt-status-row">
          Showing <strong>{pagePermissions.length}</strong> of <strong>{permissions.length}</strong>{' '}
          total Permissions
        </div>

        {loading ? (
          <div className="um-mgmt-loading">Loading...</div>
        ) : (
          <>
            <div className="um-mgmt-list" role="table" aria-label="Permissions">
              <div className="um-mgmt-row permissions um-mgmt-row-head" role="row">
                <div className="um-mgmt-cell name" role="columnheader">
                  Name
                </div>
                <div className="um-mgmt-cell code" role="columnheader">
                  Code
                </div>
                <div className="um-mgmt-cell module" role="columnheader">
                  Module
                </div>
                <div className="um-mgmt-cell desc" role="columnheader">
                  Description
                </div>
                <div className="um-mgmt-cell actions" role="columnheader">
                  Actions
                </div>
              </div>

              {permissions.length === 0 ? (
                <div className="um-mgmt-empty">No permissions found</div>
              ) : (
                pagePermissions.map((p) => (
                  <div className="um-mgmt-row permissions" role="row" key={p._id}>
                    <div className="um-mgmt-cell name" role="cell">
                      <div className="um-mgmt-entity">
                        <div className="um-mgmt-avatar" aria-hidden="true">
                          {getInitials(p.name || p.code)}
                        </div>
                        <div className="um-mgmt-entity-meta">
                          <span className="um-mgmt-entity-name" title={p.name}>
                            {p.name}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="um-mgmt-cell code" role="cell">
                      <span className="um-mgmt-code" title={p.code}>
                        {p.code}
                      </span>
                    </div>
                    <div className="um-mgmt-cell module" role="cell">
                      {p.module ? (
                        <span className="um-mgmt-module-badge">{p.module}</span>
                      ) : (
                        <span className="um-mgmt-muted">—</span>
                      )}
                    </div>
                    <div className="um-mgmt-cell desc" role="cell">
                      <span className="um-mgmt-text" title={p.description || ''}>
                        {truncateText(p.description, 42)}
                      </span>
                    </div>
                    <div className="um-mgmt-cell actions" role="cell">
                      <div className="um-mgmt-actions">
                        {hasPermission('permissions.update') && (
                          <button
                            type="button"
                            className="um-mgmt-action-link"
                            onClick={() => handleEdit(p)}
                          >
                            <span aria-hidden="true">⚙</span>
                            Modify
                          </button>
                        )}
                        {hasPermission('permissions.delete') && (
                          <button
                            type="button"
                            className="um-mgmt-action-link danger"
                            onClick={() => handleDelete(p._id)}
                          >
                            <span aria-hidden="true">⊘</span>
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {permissions.length > PAGE_SIZE && (
              <div className="um-mgmt-pagination">
                <span className="um-mgmt-page-label">
                  displaying page <strong>{currentPage}</strong>
                </span>
                <div className="um-mgmt-page-controls">
                  <button type="button" disabled={currentPage <= 1} onClick={() => setPage(1)}>
                    First
                  </button>
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((pg) => Math.max(1, pg - 1))}
                  >
                    ‹
                  </button>
                  {pageNumbers.map((num) => (
                    <button
                      key={num}
                      type="button"
                      className={num === currentPage ? 'active' : ''}
                      onClick={() => setPage(num)}
                    >
                      {num}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage((pg) => Math.min(totalPages, pg + 1))}
                  >
                    ›
                  </button>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage(totalPages)}
                  >
                    Last
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showModal && (
        <div className="um-mgmt-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="um-mgmt-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editingPermission ? 'Modify Permission' : 'Add Permission'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Name *</label>
                <input type="text" name="name" value={formData.name} onChange={handleInputChange} required />
              </div>
              <div className="form-group">
                <label>Code *</label>
                <input
                  type="text"
                  name="code"
                  value={formData.code}
                  onChange={handleInputChange}
                  required
                  placeholder="e.g. products.create"
                />
              </div>
              <div className="form-group">
                <label>Module</label>
                <input
                  type="text"
                  name="module"
                  value={formData.module}
                  onChange={handleInputChange}
                  placeholder="e.g. products"
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  rows="2"
                />
              </div>
              <div className="form-actions">
                <button type="button" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="um-mgmt-modal-submit">
                  {editingPermission ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Permissions;
