import React, { useState, useEffect } from 'react';
import { groupsAPI, rolesAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import './UserManagement.css';

function Groups() {
  const { hasPermission } = useAuth();
  const [groups, setGroups] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    roles: [],
  });

  useEffect(() => {
    fetchGroups();
  }, []);

  useEffect(() => {
    if (showModal) fetchRoles();
  }, [showModal]);

  const fetchGroups = async () => {
    try {
      setLoading(true);
      const response = await groupsAPI.getAll({ search: searchTerm });
      const data = Array.isArray(response.data) ? response.data : response.data?.data || [];
      setGroups(data);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to fetch groups');
    } finally {
      setLoading(false);
    }
  };

  const fetchRoles = async () => {
    try {
      const response = await rolesAPI.getAll();
      const data = Array.isArray(response.data) ? response.data : response.data?.data || [];
      setRoles(data);
    } catch (error) {
      console.error('Failed to fetch roles:', error);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => fetchGroups(), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleRoleToggle = (roleId) => {
    setFormData((prev) => {
      const arr = prev.roles || [];
      const next = arr.includes(roleId) ? arr.filter((id) => id !== roleId) : [...arr, roleId];
      return { ...prev, roles: next };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...formData, roles: formData.roles || [] };
      if (editingGroup) {
        await groupsAPI.update(editingGroup._id, payload);
      } else {
        await groupsAPI.create(payload);
      }
      setShowModal(false);
      setEditingGroup(null);
      resetForm();
      fetchGroups();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to save group');
    }
  };

  const handleEdit = (item) => {
    setEditingGroup(item);
    const roleIds = (item.roles || []).map((r) => (typeof r === 'object' ? r._id : r));
    setFormData({
      name: item.name || '',
      code: item.code || '',
      description: item.description || '',
      roles: roleIds,
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this group?')) return;
    try {
      await groupsAPI.delete(id);
      fetchGroups();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to delete group');
    }
  };

  const resetForm = () => {
    setFormData({ name: '', code: '', description: '', roles: [] });
  };

  const openAddModal = () => {
    setEditingGroup(null);
    resetForm();
    setShowModal(true);
  };

  const roleNames = (group) => {
    const r = group.roles || [];
    return r.map((x) => (typeof x === 'object' ? x.name || x.code : '-')).join(', ') || '-';
  };

  return (
    <div className="um-container">
      <div className="um-header">
        <h1>Groups</h1>
        {hasPermission('groups.create') && (
          <button className="btn-primary" onClick={openAddModal}>+ Add Group</button>
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
                <th>Roles</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 ? (
                <tr><td colSpan="5" className="no-data">No groups found</td></tr>
              ) : (
                groups.map((g) => (
                  <tr key={g._id}>
                    <td>{g.name}</td>
                    <td>{g.code}</td>
                    <td>{g.description || '-'}</td>
                    <td>{roleNames(g)}</td>
                    <td>
                      {hasPermission('groups.update') && (
                        <button className="btn-edit" onClick={() => handleEdit(g)}>Edit</button>
                      )}
                      {hasPermission('groups.delete') && (
                        <button className="btn-delete" onClick={() => handleDelete(g._id)}>Delete</button>
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
            <h2>{editingGroup ? 'Edit Group' : 'Add Group'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Name *</label>
                <input type="text" name="name" value={formData.name} onChange={handleInputChange} required />
              </div>
              <div className="form-group">
                <label>Code *</label>
                <input type="text" name="code" value={formData.code} onChange={handleInputChange} required placeholder="e.g. sales_team" />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea name="description" value={formData.description} onChange={handleInputChange} rows="2" />
              </div>
              <div className="form-group">
                <label>Roles</label>
                <div className="multiselect-box">
                  {roles.map((r) => (
                    <label key={r._id}>
                      <input
                        type="checkbox"
                        checked={(formData.roles || []).includes(r._id)}
                        onChange={() => handleRoleToggle(r._id)}
                      />
                      {r.name} ({r.code})
                    </label>
                  ))}
                  {roles.length === 0 && <span>No roles defined</span>}
                </div>
              </div>
              <div className="form-actions">
                <button type="button" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">{editingGroup ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Groups;
