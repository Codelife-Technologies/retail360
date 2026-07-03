import React, { useState, useEffect } from 'react';
import { rolesAPI, permissionsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import './UserManagement.css';

function Roles() {
  const { hasPermission } = useAuth();
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
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
    setEditingRole(null);
    resetForm();
    setShowModal(true);
  };

  const permNames = (role) => {
    const perms = role.permissions || [];
    return perms.map((p) => (typeof p === 'object' ? p.name || p.code : '-')).join(', ') || '-';
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
          <table className="um-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Code</th>
                <th>Description</th>
                <th>Permissions</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {roles.length === 0 ? (
                <tr><td colSpan="5" className="no-data">No roles found</td></tr>
              ) : (
                roles.map((r) => (
                  <tr key={r._id}>
                    <td>{r.name}</td>
                    <td>{r.code}</td>
                    <td>{r.description || '-'}</td>
                    <td>{permNames(r)}</td>
                    <td>
                      {hasPermission('roles.update') && (
                        <button className="btn-edit" onClick={() => handleEdit(r)}>Edit</button>
                      )}
                      {hasPermission('roles.delete') && (
                        <button className="btn-delete" onClick={() => handleDelete(r._id)}>Delete</button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
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
                      {p.name} ({p.code})
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
