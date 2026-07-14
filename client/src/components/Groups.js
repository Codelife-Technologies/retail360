import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { groupsAPI, rolesAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { getShortRoleLabel, getRoleTitle } from '../utils/roleLabels';
import './UserManagement.css';

const PAGE_SIZE = 10;

const ROLE_BADGE_TONES = {
  admin: 'navy',
  super_admin: 'navy',
  hr: 'green',
  accounts: 'teal',
  warehouse: 'slate',
  employee: 'amber',
  manager: 'amber',
  auditor: 'green',
};

function getRoleBadgeTone(role) {
  const code = String(role?.code || role?.name || role || '').toLowerCase();
  if (ROLE_BADGE_TONES[code]) return ROLE_BADGE_TONES[code];
  const tones = ['amber', 'navy', 'green', 'teal', 'slate'];
  let hash = 0;
  for (let i = 0; i < code.length; i += 1) hash = (hash + code.charCodeAt(i)) % tones.length;
  return tones[hash];
}

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

function Groups() {
  const { hasPermission } = useAuth();
  const [groups, setGroups] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [page, setPage] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    roles: [],
  });

  const fetchGroups = useCallback(async (search = searchTerm) => {
    try {
      setLoading(true);
      const response = await groupsAPI.getAll({ search });
      const data = Array.isArray(response.data) ? response.data : response.data?.data || [];
      setGroups(data);
      setPage(1);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to fetch groups');
    } finally {
      setLoading(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    const timer = setTimeout(() => fetchGroups(searchTerm), searchTerm ? 300 : 0);
    return () => clearTimeout(timer);
  }, [searchTerm, fetchGroups]);

  useEffect(() => {
    if (!showModal) return undefined;
    let cancelled = false;
    rolesAPI
      .getAll()
      .then((response) => {
        if (cancelled) return;
        const data = Array.isArray(response.data) ? response.data : response.data?.data || [];
        setRoles(data);
      })
      .catch((error) => console.error('Failed to fetch roles:', error));
    return () => {
      cancelled = true;
    };
  }, [showModal]);

  const totalPages = Math.max(1, Math.ceil(groups.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageGroups = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return groups.slice(start, start + PAGE_SIZE);
  }, [groups, currentPage]);

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

  const handleRoleToggle = (roleId) => {
    setFormData((prev) => {
      const arr = prev.roles || [];
      const next = arr.includes(roleId) ? arr.filter((id) => id !== roleId) : [...arr, roleId];
      return { ...prev, roles: next };
    });
  };

  const resetForm = () => {
    setFormData({ name: '', code: '', description: '', roles: [] });
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
      fetchGroups(searchTerm);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to save group');
    }
  };

  const handleEdit = (item) => {
    setEditingGroup(item);
    setFormData({
      name: item.name || '',
      code: item.code || '',
      description: item.description || '',
      roles: (item.roles || []).map((r) => (typeof r === 'object' ? r._id : r)),
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this group?')) return;
    try {
      await groupsAPI.delete(id);
      fetchGroups(searchTerm);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to delete group');
    }
  };

  const openAddModal = () => {
    setEditingGroup(null);
    resetForm();
    setShowModal(true);
  };

  const renderRoleBadges = (group) => {
    const list = group.roles || [];
    if (list.length === 0) return <span className="um-mgmt-muted">No roles</span>;
    return (
      <div className="um-mgmt-badges">
        {list.map((role) => (
          <span
            key={role._id || role}
            className={`um-mgmt-badge tone-${getRoleBadgeTone(role)}`}
            title={getRoleTitle(role)}
          >
            {getShortRoleLabel(role, 14)}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="um-mgmt-page">
      <div className="um-mgmt-card">
        <div className="um-mgmt-card-top">
          <div className="um-mgmt-heading">
            <h1>Group Management</h1>
            <p className="um-mgmt-breadcrumb">
              Home <span>›</span> Permissions &amp; Accounts <span>›</span> Groups
            </p>
          </div>
          <div className="um-mgmt-toolbar">
            <label className="um-mgmt-search">
              <span className="um-mgmt-search-icon" aria-hidden="true">
                🔍
              </span>
              <input
                type="search"
                placeholder="Search Group"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </label>
            {hasPermission('groups.create') && (
              <button type="button" className="um-mgmt-add-btn" onClick={openAddModal}>
                Add Group
              </button>
            )}
          </div>
        </div>

        <div className="um-mgmt-status-row">
          Showing <strong>{pageGroups.length}</strong> of <strong>{groups.length}</strong> total Groups
        </div>

        {loading ? (
          <div className="um-mgmt-loading">Loading...</div>
        ) : (
          <>
            <div className="um-mgmt-list" role="table" aria-label="Groups">
              <div className="um-mgmt-row groups um-mgmt-row-head" role="row">
                <div className="um-mgmt-cell name" role="columnheader">
                  Name
                </div>
                <div className="um-mgmt-cell desc" role="columnheader">
                  Description
                </div>
                <div className="um-mgmt-cell meta" role="columnheader">
                  Roles
                </div>
                <div className="um-mgmt-cell actions" role="columnheader">
                  Actions
                </div>
              </div>

              {groups.length === 0 ? (
                <div className="um-mgmt-empty">No groups found</div>
              ) : (
                pageGroups.map((g) => (
                  <div className="um-mgmt-row groups" role="row" key={g._id}>
                    <div className="um-mgmt-cell name" role="cell">
                      <div className="um-mgmt-entity">
                        <div className="um-mgmt-avatar tone-slate" aria-hidden="true">
                          {getInitials(g.name)}
                        </div>
                        <div className="um-mgmt-entity-meta">
                          <span className="um-mgmt-entity-name" title={g.name}>
                            {g.name}
                          </span>
                          <span className="um-mgmt-entity-sub">{g.code}</span>
                        </div>
                      </div>
                    </div>
                    <div className="um-mgmt-cell desc" role="cell">
                      <span className="um-mgmt-text" title={g.description || ''}>
                        {truncateText(g.description, 48)}
                      </span>
                    </div>
                    <div className="um-mgmt-cell meta" role="cell">
                      {renderRoleBadges(g)}
                    </div>
                    <div className="um-mgmt-cell actions" role="cell">
                      <div className="um-mgmt-actions">
                        {hasPermission('groups.update') && (
                          <button
                            type="button"
                            className="um-mgmt-action-link"
                            onClick={() => handleEdit(g)}
                          >
                            <span aria-hidden="true">⚙</span>
                            Modify Group
                          </button>
                        )}
                        {hasPermission('groups.delete') && (
                          <button
                            type="button"
                            className="um-mgmt-action-link danger"
                            onClick={() => handleDelete(g._id)}
                          >
                            <span aria-hidden="true">⊘</span>
                            Remove Group
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {groups.length > PAGE_SIZE && (
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
          <div className="um-mgmt-modal wide" onClick={(e) => e.stopPropagation()}>
            <h2>{editingGroup ? 'Modify Group' : 'Add Group'}</h2>
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
                  placeholder="e.g. sales_team"
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
                <button type="button" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="um-mgmt-modal-submit">
                  {editingGroup ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Groups;
