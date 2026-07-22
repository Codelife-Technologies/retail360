import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { rolesAPI, permissionsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import DetailModal from './DetailModal';
import { getShortRoleLabel } from '../utils/roleLabels';
import PermissionPicker from '../userManagement/PermissionPicker';
import './UserManagement.css';
import './DetailModal.css';

const PAGE_SIZE = 10;

function truncateText(text, maxLength = 50) {
  if (!text) return '—';
  const trimmed = String(text).trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}…`;
}

function getInitials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function getRolePermissions(role) {
  return (role.permissions || []).map((p) => {
    if (typeof p === 'object') {
      return {
        id: p._id,
        name: p.name || p.code || '—',
        code: p.code || '',
      };
    }
    return { id: p, name: String(p), code: '' };
  });
}

function Roles() {
  const { hasPermission } = useAuth();
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [viewingRole, setViewingRole] = useState(null);
  const [editingRole, setEditingRole] = useState(null);
  const [page, setPage] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    permissions: [],
  });

  const fetchRoles = useCallback(async (search = searchTerm) => {
    try {
      setLoading(true);
      const response = await rolesAPI.getAll({ search });
      const data = Array.isArray(response.data) ? response.data : response.data?.data || [];
      setRoles(data);
      setPage(1);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to fetch roles');
    } finally {
      setLoading(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    const timer = setTimeout(() => fetchRoles(searchTerm), searchTerm ? 300 : 0);
    return () => clearTimeout(timer);
  }, [searchTerm, fetchRoles]);

  useEffect(() => {
    if (!showModal) return undefined;
    let cancelled = false;
    permissionsAPI
      .getAll()
      .then((response) => {
        if (cancelled) return;
        const data = Array.isArray(response.data) ? response.data : response.data?.data || [];
        setPermissions(data);
      })
      .catch((error) => console.error('Failed to fetch permissions:', error));
    return () => {
      cancelled = true;
    };
  }, [showModal]);

  const totalPages = Math.max(1, Math.ceil(roles.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRoles = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return roles.slice(start, start + PAGE_SIZE);
  }, [roles, currentPage]);

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
    setFormData({ name: '', code: '', description: '', permissions: [] });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...formData, permissions: formData.permissions || [] };
      if (editingRole) {
        await rolesAPI.update(editingRole._id, payload);
      } else {
        await rolesAPI.create(payload);
      }
      setShowModal(false);
      setEditingRole(null);
      resetForm();
      fetchRoles(searchTerm);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to save role');
    }
  };

  const handleEdit = (item) => {
    setViewingRole(null);
    setEditingRole(item);
    setFormData({
      name: item.name || '',
      code: item.code || '',
      description: item.description || '',
      permissions: (item.permissions || []).map((p) => (typeof p === 'object' ? p._id : p)),
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this role?')) return;
    try {
      await rolesAPI.delete(id);
      fetchRoles(searchTerm);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to delete role');
    }
  };

  const openAddModal = () => {
    setViewingRole(null);
    setEditingRole(null);
    resetForm();
    setShowModal(true);
  };

  const stopRowClick = (event) => event.stopPropagation();

  return (
    <div className="um-mgmt-page">
      <div className="um-mgmt-card">
        <div className="um-mgmt-card-top">
          <div className="um-mgmt-heading">
            <h1>Roles &amp; Permissions</h1>
            <p className="um-mgmt-breadcrumb">
              Home <span>›</span> User Management <span>›</span> Roles
            </p>
            <p className="um-mgmt-hint">
              Permissions are granted through roles. Edit a role below, then assign that role to users under the Users tab.
            </p>
          </div>
          <div className="um-mgmt-toolbar">
            <label className="um-mgmt-search">
              <span className="um-mgmt-search-icon" aria-hidden="true">
                🔍
              </span>
              <input
                type="search"
                placeholder="Search Role"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </label>
            {hasPermission('roles.create') && (
              <button type="button" className="um-mgmt-add-btn" onClick={openAddModal}>
                Add Role
              </button>
            )}
          </div>
        </div>

        <div className="um-mgmt-status-row">
          Showing <strong>{pageRoles.length}</strong> of <strong>{roles.length}</strong> total Roles
        </div>

        {loading ? (
          <div className="um-mgmt-loading">Loading...</div>
        ) : (
          <>
            <div className="um-mgmt-list" role="table" aria-label="Roles">
              <div className="um-mgmt-row roles um-mgmt-row-head" role="row">
                <div className="um-mgmt-cell name" role="columnheader">Name</div>
                <div className="um-mgmt-cell desc" role="columnheader">Description</div>
                <div className="um-mgmt-cell meta" role="columnheader">Permissions</div>
                <div className="um-mgmt-cell actions" role="columnheader">Actions</div>
              </div>

              {roles.length === 0 ? (
                <div className="um-mgmt-empty">No roles found</div>
              ) : (
                pageRoles.map((r) => {
                  const perms = getRolePermissions(r);
                  return (
                    <div
                      key={r._id}
                      className="um-mgmt-row roles clickable"
                      role="row"
                      onClick={() => setViewingRole(r)}
                      title="Click to view role details"
                    >
                      <div className="um-mgmt-cell name" role="cell">
                        <div className="um-mgmt-entity">
                          <div className="um-mgmt-avatar tone-navy" aria-hidden="true">
                            {getInitials(r.name)}
                          </div>
                          <div className="um-mgmt-entity-meta">
                            <span className="um-mgmt-entity-name" title={r.name}>{r.name}</span>
                            <span className="um-mgmt-entity-sub">{getShortRoleLabel(r, 16)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="um-mgmt-cell desc" role="cell">
                        <span className="um-mgmt-text" title={r.description || ''}>
                          {truncateText(r.description, 48)}
                        </span>
                      </div>
                      <div className="um-mgmt-cell meta" role="cell">
                        {perms.length === 0 ? (
                          <span className="um-mgmt-muted">No permissions</span>
                        ) : (
                          <span className="um-mgmt-badge tone-green" title={perms.map((p) => p.name).join(', ')}>
                            {perms.length} permission{perms.length === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>
                      <div className="um-mgmt-cell actions" role="cell" onClick={stopRowClick}>
                        <div className="um-mgmt-actions">
                          {hasPermission('roles.update') && (
                            <button type="button" className="um-mgmt-action-link" onClick={() => handleEdit(r)}>
                              <span aria-hidden="true">⚙</span>
                              Edit permissions
                            </button>
                          )}
                          {hasPermission('roles.delete') && (
                            <button type="button" className="um-mgmt-action-link danger" onClick={() => handleDelete(r._id)}>
                              <span aria-hidden="true">⊘</span>
                              Remove Role
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {roles.length > PAGE_SIZE && (
              <div className="um-mgmt-pagination">
                <span className="um-mgmt-page-label">
                  displaying page <strong>{currentPage}</strong>
                </span>
                <div className="um-mgmt-page-controls">
                  <button type="button" disabled={currentPage <= 1} onClick={() => setPage(1)}>First</button>
                  <button type="button" disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>‹</button>
                  {pageNumbers.map((num) => (
                    <button key={num} type="button" className={num === currentPage ? 'active' : ''} onClick={() => setPage(num)}>
                      {num}
                    </button>
                  ))}
                  <button type="button" disabled={currentPage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>›</button>
                  <button type="button" disabled={currentPage >= totalPages} onClick={() => setPage(totalPages)}>Last</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {viewingRole && (
        <DetailModal
          title={viewingRole.name}
          fields={[
            { label: 'Code', value: viewingRole.code },
            { label: 'Description', value: viewingRole.description || '—', full: true },
          ]}
          onClose={() => setViewingRole(null)}
          onEdit={hasPermission('roles.update') ? () => handleEdit(viewingRole) : undefined}
          onDelete={
            hasPermission('roles.delete')
              ? () => {
                  handleDelete(viewingRole._id);
                  setViewingRole(null);
                }
              : undefined
          }
        >
          <div className="detail-view-section">
            <h3>Permissions ({getRolePermissions(viewingRole).length})</h3>
            {getRolePermissions(viewingRole).length === 0 ? (
              <p className="um-role-perm-empty">No permissions assigned to this role.</p>
            ) : (
              <ul className="um-role-perm-list">
                {getRolePermissions(viewingRole).map((perm) => (
                  <li key={perm.id}>
                    <strong>{perm.name}</strong>
                    {perm.code ? <span className="um-role-perm-code">{perm.code}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DetailModal>
      )}

      {showModal && createPortal(
        <div className="um-mgmt-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="um-mgmt-modal wide um-mgmt-modal-perms" onClick={(e) => e.stopPropagation()}>
            <h2>{editingRole ? 'Edit role permissions' : 'Add Role'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Name *</label>
                <input type="text" name="name" value={formData.name} onChange={handleInputChange} required />
              </div>
              <div className="form-group">
                <label>Code *</label>
                <input type="text" name="code" value={formData.code} onChange={handleInputChange} required placeholder="e.g. manager" />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea name="description" value={formData.description} onChange={handleInputChange} rows="2" />
              </div>
              <div className="um-perm-section">
                <div className="um-perm-section-title">Permissions</div>
                <PermissionPicker
                  permissions={permissions}
                  selectedIds={formData.permissions}
                  onChange={(ids) => setFormData((prev) => ({ ...prev, permissions: ids }))}
                />
              </div>
              <div className="form-actions">
                <button type="button" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="um-mgmt-modal-submit">
                  {editingRole ? 'Save permissions' : 'Create role'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default Roles;
