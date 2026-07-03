import React, { useState, useEffect } from 'react';
import { usersAPI, rolesAPI, groupsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import './UserManagement.css';

function Users() {
  const { hasPermission } = useAuth();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    roles: [],
    groups: [],
    isActive: true,
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (showModal) {
      fetchRoles();
      fetchGroups();
    }
  }, [showModal]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await usersAPI.getAll({ search: searchTerm });
      const data = Array.isArray(response.data) ? response.data : response.data?.data || [];
      setUsers(data);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to fetch users');
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

  const fetchGroups = async () => {
    try {
      const response = await groupsAPI.getAll();
      const data = Array.isArray(response.data) ? response.data : response.data?.data || [];
      setGroups(data);
    } catch (error) {
      console.error('Failed to fetch groups:', error);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => fetchUsers(), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleRoleToggle = (roleId) => {
    setFormData((prev) => {
      const arr = prev.roles || [];
      const next = arr.includes(roleId) ? arr.filter((id) => id !== roleId) : [...arr, roleId];
      return { ...prev, roles: next };
    });
  };

  const handleGroupToggle = (groupId) => {
    setFormData((prev) => {
      const arr = prev.groups || [];
      const next = arr.includes(groupId) ? arr.filter((id) => id !== groupId) : [...arr, groupId];
      return { ...prev, groups: next };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        username: formData.username,
        email: formData.email,
        roles: formData.roles || [],
        groups: formData.groups || [],
        isActive: formData.isActive,
      };
      if (formData.password && formData.password.trim()) {
        payload.password = formData.password;
      }
      if (editingUser) {
        await usersAPI.update(editingUser._id, payload);
      } else {
        if (!payload.password) {
          alert('Password is required for new user');
          return;
        }
        await usersAPI.create(payload);
      }
      setShowModal(false);
      setEditingUser(null);
      resetForm();
      fetchUsers();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to save user');
    }
  };

  const handleEdit = (item) => {
    setEditingUser(item);
    const roleIds = (item.roles || []).map((r) => (typeof r === 'object' ? r._id : r));
    const groupIds = (item.groups || []).map((g) => (typeof g === 'object' ? g._id : g));
    setFormData({
      username: item.username || '',
      email: item.email || '',
      password: '',
      roles: roleIds,
      groups: groupIds,
      isActive: item.isActive !== false,
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    try {
      await usersAPI.delete(id);
      fetchUsers();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to delete user');
    }
  };

  const resetForm = () => {
    setFormData({
      username: '',
      email: '',
      password: '',
      roles: [],
      groups: [],
      isActive: true,
    });
  };

  const openAddModal = () => {
    setEditingUser(null);
    resetForm();
    setShowModal(true);
  };

  const roleNames = (user) => {
    const r = user.roles || [];
    return r.map((x) => (typeof x === 'object' ? x.name || x.code : '-')).join(', ') || '-';
  };

  const groupNames = (user) => {
    const g = user.groups || [];
    return g.map((x) => (typeof x === 'object' ? x.name || x.code : '-')).join(', ') || '-';
  };

  return (
    <div className="um-container">
      <div className="um-header">
        <h1>Users</h1>
        {hasPermission('users.create') && (
          <button className="btn-primary" onClick={openAddModal}>+ Add User</button>
        )}
      </div>
      <div className="search-bar">
        <input
          type="text"
          placeholder="Search by username or email..."
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
                <th>Username</th>
                <th>Email</th>
                <th>Roles</th>
                <th>Groups</th>
                <th>Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr><td colSpan="6" className="no-data">No users found</td></tr>
              ) : (
                users.map((u) => (
                  <tr key={u._id}>
                    <td>{u.username}</td>
                    <td>{u.email}</td>
                    <td>{roleNames(u)}</td>
                    <td>{groupNames(u)}</td>
                    <td>{u.isActive ? 'Yes' : 'No'}</td>
                    <td>
                      {hasPermission('users.update') && (
                        <button className="btn-edit" onClick={() => handleEdit(u)}>Edit</button>
                      )}
                      {hasPermission('users.delete') && (
                        <button className="btn-delete" onClick={() => handleDelete(u._id)}>Delete</button>
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
            <h2>{editingUser ? 'Edit User' : 'Add User'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Username *</label>
                <input
                  type="text"
                  name="username"
                  value={formData.username}
                  onChange={handleInputChange}
                  required
                  disabled={!!editingUser}
                />
                {editingUser && <small style={{ color: '#666' }}>Username cannot be changed</small>}
              </div>
              <div className="form-group">
                <label>Email *</label>
                <input type="email" name="email" value={formData.email} onChange={handleInputChange} required />
              </div>
              <div className="form-group">
                <label>Password {editingUser ? '(leave blank to keep current)' : '*'}</label>
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder={editingUser ? 'Leave blank to keep' : 'Required for new user'}
                />
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
              <div className="form-group">
                <label>Groups</label>
                <div className="multiselect-box">
                  {groups.map((g) => (
                    <label key={g._id}>
                      <input
                        type="checkbox"
                        checked={(formData.groups || []).includes(g._id)}
                        onChange={() => handleGroupToggle(g._id)}
                      />
                      {g.name} ({g.code})
                    </label>
                  ))}
                  {groups.length === 0 && <span>No groups defined</span>}
                </div>
              </div>
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    name="isActive"
                    checked={formData.isActive}
                    onChange={handleInputChange}
                  />
                  {' '}Active
                </label>
              </div>
              <div className="form-actions">
                <button type="button" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">{editingUser ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Users;
