import React, { useState, useEffect } from 'react';
import { rolesAPI, permissionsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import DetailModal from './DetailModal';
import { getShortRoleLabel } from '../utils/roleLabels';
import './UserManagement.css';
import './DetailModal.css';

function truncateText(text, maxLength = 50) {
  if (!text) return '—';
  const trimmed = String(text).trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}…`;
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

function permissionSummary(role) {
  const perms = getRolePermissions(role);
  if (perms.length === 0) return '—';
  if (perms.length === 1) return truncateText(perms[0].name, 28);
  return `${perms.length} permissions`;
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
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    permissions: [],
  });

  useEffect(() => {
    fetchRoles();
  }, []);

  useEffect(() => {
    if (showModal) fetchPermissions();
  }, [showModal]);

  const fetchRoles = async () => {
    try {
      setLoading(true);
      const response = await rolesAPI.getAll({ search: searchTerm });
      const data = Array.isArray(response.data) ? response.data : response.data?.data || [];
      setRoles(data);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to fetch roles');
    } finally {
      setLoading(false);
    }
  };

  const fetchPermissions = async () => {
    try {
      const response = await permissionsAPI.getAll();
      const data = Array.isArray(response.data) ? response.data : response.data?.data || [];
      setPermissions(data);
    } catch (error) {
      console.error('Failed to fetch permissions:', error);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => fetchRoles(), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handlePermissionToggle = (permId) => {
    setFormData((prev) => {
      const arr = prev.permissions || [];
      const next = arr.includes(permId) ? arr.filter((id) => id !== permId) : [...arr, permId];
      return { ...prev, permissions: next };
    });
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
      fetchRoles();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to save role');
    }
  };

  const handleEdit = (item) => {
    setViewingRole(null);
    setEditingRole(item);
    const permIds = (item.permissions || []).map((p) => (typeof p === 'object' ? p._id : p));
    setFormData({
      name: item.name || '',
      code: item.code || '',
      description: item.description || '',
      permissions: permIds,
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this role?')) return;
    try {
      await rolesAPI.delete(id);
      fetchRoles();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to delete role');
    }
  };

  const resetForm = () => {
    setFormData({ name: '', code: '', description: '', permissions: [] });
  };

  const openAddModal = () => {
    setViewingRole(null);
    setEditingRole(null);
    resetForm();
    setShowModal(true);
  };

  const openViewRole = (role) => {
    setViewingRole(role);
  };

  const closeViewRole = () => {
    setViewingRole(null);
  };

  const handleViewEdit = () => {
    if (!viewingRole) return;
    handleEdit(viewingRole);
  };

  const handleViewDelete = () => {
    if (!viewingRole) return;
    handleDelete(viewingRole._id);
    setViewingRole(null);
  };

  const stopRowClick = (event) => {
    event.stopPropagation();
  };

  return (
    <div className="um-container">
      <div className="um-header">
        <h1>Roles</h1>
        {hasPermission('roles.create') && (
          <button className="btn-primary" onClick={openAddModal}>+ Add Role</button>
        )}
      </div>
      <div className="search-bar">
        <input
          type="text"
          placeholder="Search by name or code..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>
      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <div className="um-table-container">
          <table className="um-table um-table-roles">
            <thead>
              <tr>
                <th>Name</th>
                <th>Code</th>
                <th className="col-description">Description</th>
                <th className="col-permissions">Permissions</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {roles.length === 0 ? (
                <tr><td colSpan="5" className="no-data">No roles found</td></tr>
              ) : (
                roles.map((r) => (
                  <tr
                    key={r._id}
                    className="clickable-row"
                    onClick={() => openViewRole(r)}
                    title="Click to view role details"
                  >
                    <td>
                      <span className="um-cell-ellipsis" title={r.name || ''}>
                        {truncateText(r.name, 14)}
                      </span>
                    </td>
                    <td>
                      <span className="um-cell-ellipsis" title={r.code || ''}>
                        {getShortRoleLabel(r, 8)}
                      </span>
                    </td>
                    <td className="col-description">
                      <span className="um-cell-ellipsis" title={r.description || ''}>
                        {truncateText(r.description, 28)}
                      </span>
                    </td>
                    <td className="col-permissions">
                      <span className="um-cell-ellipsis" title={getRolePermissions(r).map((p) => p.name).join(', ')}>
                        {permissionSummary(r)}
                      </span>
                    </td>
                    <td onClick={stopRowClick}>
                      {hasPermission('roles.update') && (
                        <button type="button" className="btn-edit" onClick={() => handleEdit(r)}>Edit</button>
                      )}
                      {hasPermission('roles.delete') && (
                        <button type="button" className="btn-delete" onClick={() => handleDelete(r._id)}>Delete</button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      {viewingRole && (
        <DetailModal
          title={viewingRole.name}
          fields={[
            { label: 'Code', value: viewingRole.code },
            { label: 'Description', value: viewingRole.description || '—', full: true },
          ]}
          onClose={closeViewRole}
          onEdit={hasPermission('roles.update') ? handleViewEdit : undefined}
          onDelete={hasPermission('roles.delete') ? handleViewDelete : undefined}
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
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content modal-content-roles" onClick={(e) => e.stopPropagation()}>
            <h2>{editingRole ? 'Edit Role' : 'Add Role'}</h2>
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
              <div className="form-group">
                <label>Permissions</label>
                <div className="multiselect-box">
                  {permissions.map((p) => (
                    <label key={p._id}>
                      <input
                        type="checkbox"
                        checked={(formData.permissions || []).includes(p._id)}
                        onChange={() => handlePermissionToggle(p._id)}
                      />
                      {getShortRoleLabel(p, 10)}
                    </label>
                  ))}
                  {permissions.length === 0 && <span>No permissions defined</span>}
                </div>
              </div>
              <div className="form-actions">
                <button type="button" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">{editingRole ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Roles;
