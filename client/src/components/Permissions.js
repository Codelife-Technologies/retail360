import React, { useState, useEffect } from 'react';
import { permissionsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import './UserManagement.css';

function Permissions() {
  const { hasPermission } = useAuth();
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingPermission, setEditingPermission] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    module: '',
    description: '',
  });

  useEffect(() => {
    fetchPermissions();
  }, []);

  const fetchPermissions = async () => {
    try {
      setLoading(true);
      const response = await permissionsAPI.getAll({ search: searchTerm });
      const data = Array.isArray(response.data) ? response.data : response.data?.data || [];
      setPermissions(data);
    } catch (error) {
      console.error('Error fetching permissions:', error);
      alert(error.response?.data?.error || 'Failed to fetch permissions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const debounceTimer = setTimeout(() => fetchPermissions(), 300);
    return () => clearTimeout(debounceTimer);
  }, [searchTerm]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
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
      fetchPermissions();
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
      fetchPermissions();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to delete permission');
    }
  };

  const resetForm = () => {
    setFormData({ name: '', code: '', module: '', description: '' });
  };

  const openAddModal = () => {
    setEditingPermission(null);
    resetForm();
    setShowModal(true);
  };

  return (
    <div className="um-container">
      <div className="um-header">
        <h1>Permissions</h1>
        {hasPermission('permissions.create') && (
          <button className="btn-primary" onClick={openAddModal}>+ Add Permission</button>
        )}
      </div>
      <div className="search-bar">
        <input
          type="text"
          placeholder="Search by name, code or module..."
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
                <th>Module</th>
                <th>Description</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {permissions.length === 0 ? (
                <tr><td colSpan="5" className="no-data">No permissions found</td></tr>
              ) : (
                permissions.map((p) => (
                  <tr key={p._id}>
                    <td>{p.name}</td>
                    <td>{p.code}</td>
                    <td>{p.module || '-'}</td>
                    <td>{p.description || '-'}</td>
                    <td>
                      {hasPermission('permissions.update') && (
                        <button className="btn-edit" onClick={() => handleEdit(p)}>Edit</button>
                      )}
                      {hasPermission('permissions.delete') && (
                        <button className="btn-delete" onClick={() => handleDelete(p._id)}>Delete</button>
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
            <h2>{editingPermission ? 'Edit Permission' : 'Add Permission'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Name *</label>
                <input type="text" name="name" value={formData.name} onChange={handleInputChange} required />
              </div>
              <div className="form-group">
                <label>Code *</label>
                <input type="text" name="code" value={formData.code} onChange={handleInputChange} required placeholder="e.g. products.create" />
              </div>
              <div className="form-group">
                <label>Module</label>
                <input type="text" name="module" value={formData.module} onChange={handleInputChange} placeholder="e.g. products" />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea name="description" value={formData.description} onChange={handleInputChange} rows="2" />
              </div>
              <div className="form-actions">
                <button type="button" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">{editingPermission ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Permissions;
