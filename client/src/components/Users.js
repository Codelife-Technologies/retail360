import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { usersAPI, rolesAPI, groupsAPI, permissionsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  getShortRoleLabel,
  getShortGroupLabel,
  getRoleTitle,
  getGroupTitle,
} from '../utils/roleLabels';
import { ACCESS_PACKS, permissionIdsForCodes } from '../userManagement/accessPacks';
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
  docs_employee: 'teal',
  ai_images_user: 'amber',
  ai_images_creator: 'navy',
  docs_admin: 'green',
};

function getRoleBadgeTone(role) {
  const code = String(role?.code || role?.name || role || '').toLowerCase();
  if (ROLE_BADGE_TONES[code]) return ROLE_BADGE_TONES[code];
  const tones = ['amber', 'navy', 'green', 'teal', 'slate'];
  let hash = 0;
  for (let i = 0; i < code.length; i += 1) hash = (hash + code.charCodeAt(i)) % tones.length;
  return tones[hash];
}

function getInitials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function Users({ onOpenRoles } = {}) {
  const { hasPermission } = useAuth();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [groups, setGroups] = useState([]);
  const [allPermissions, setAllPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [page, setPage] = useState(1);
  const [packBusy, setPackBusy] = useState('');
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    roles: [],
    groups: [],
    isActive: true,
  });

  const fetchUsers = useCallback(async (search = searchTerm) => {
    try {
      setLoading(true);
      const response = await usersAPI.getAll({ search });
      const data = Array.isArray(response.data) ? response.data : response.data?.data || [];
      setUsers(data);
      setPage(1);
      setSelectedIds([]);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUsers(searchTerm);
    }, searchTerm ? 300 : 0);
    return () => clearTimeout(timer);
  }, [searchTerm, fetchUsers]);

  useEffect(() => {
    if (!showModal) return undefined;
    let cancelled = false;
    Promise.all([rolesAPI.getAll(), groupsAPI.getAll(), permissionsAPI.getAll()])
      .then(([rolesRes, groupsRes, permsRes]) => {
        if (cancelled) return;
        setRoles(Array.isArray(rolesRes.data) ? rolesRes.data : rolesRes.data?.data || []);
        setGroups(Array.isArray(groupsRes.data) ? groupsRes.data : groupsRes.data?.data || []);
        setAllPermissions(Array.isArray(permsRes.data) ? permsRes.data : permsRes.data?.data || []);
      })
      .catch((error) => console.error('Failed to load roles/groups:', error));
    return () => {
      cancelled = true;
    };
  }, [showModal]);

  const totalPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageUsers = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return users.slice(start, start + PAGE_SIZE);
  }, [users, currentPage]);

  const allPageSelected =
    pageUsers.length > 0 && pageUsers.every((u) => selectedIds.includes(u._id));

  const selectedRolesPreview = useMemo(() => {
    const selected = new Set((formData.roles || []).map(String));
    return roles.filter((r) => selected.has(String(r._id)));
  }, [roles, formData.roles]);

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
      const id = String(roleId);
      const next = arr.map(String).includes(id)
        ? arr.filter((x) => String(x) !== id)
        : [...arr, roleId];
      return { ...prev, roles: next };
    });
  };

  const handleGroupToggle = (groupId) => {
    setFormData((prev) => {
      const arr = prev.groups || [];
      const id = String(groupId);
      const next = arr.map(String).includes(id)
        ? arr.filter((x) => String(x) !== id)
        : [...arr, groupId];
      return { ...prev, groups: next };
    });
  };

  const ensurePackRole = async (pack) => {
    let role = roles.find((r) => String(r.code).toLowerCase() === String(pack.roleCode).toLowerCase());
    if (role) return role;

    if (!hasPermission('roles.create') && !hasPermission('admin.all')) {
      throw new Error(
        `Role "${pack.roleName}" is not set up yet. Open Roles & Permissions (as admin) once to seed it, or create it manually.`
      );
    }

    const permissionIds = permissionIdsForCodes(allPermissions, pack.permissionCodes);
    if (!permissionIds.length) {
      throw new Error('Permission catalog is incomplete. Restart the server to seed permissions.');
    }

    const created = await rolesAPI.create({
      name: pack.roleName,
      code: pack.roleCode,
      description: pack.description,
      permissions: permissionIds,
    });
    role = created.data;
    setRoles((prev) => [...prev, role]);
    return role;
  };

  const applyAccessPack = async (pack) => {
    try {
      setPackBusy(pack.id);
      const role = await ensurePackRole(pack);
      setFormData((prev) => {
        const ids = (prev.roles || []).map(String);
        if (ids.includes(String(role._id))) return prev;
        return { ...prev, roles: [...(prev.roles || []), role._id] };
      });
    } catch (error) {
      alert(error.response?.data?.error || error.message || 'Failed to apply access pack');
    } finally {
      setPackBusy('');
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
      fetchUsers(searchTerm);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to save user');
    }
  };

  const handleEdit = (item) => {
    setEditingUser(item);
    setFormData({
      username: item.username || '',
      email: item.email || '',
      password: '',
      roles: (item.roles || []).map((r) => (typeof r === 'object' ? r._id : r)),
      groups: (item.groups || []).map((g) => (typeof g === 'object' ? g._id : g)),
      isActive: item.isActive !== false,
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to remove this user?')) return;
    try {
      await usersAPI.delete(id);
      fetchUsers(searchTerm);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to delete user');
    }
  };

  const openAddModal = () => {
    setEditingUser(null);
    resetForm();
    setShowModal(true);
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAllPage = () => {
    if (allPageSelected) {
      setSelectedIds((prev) => prev.filter((id) => !pageUsers.some((u) => u._id === id)));
      return;
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      pageUsers.forEach((u) => next.add(u._id));
      return [...next];
    });
  };

  const renderRoleBadges = (user) => {
    const badges = [
      ...(user.roles || []).map((role) => ({
        key: `role-${role._id || role}`,
        label: getShortRoleLabel(role, 14),
        title: getRoleTitle(role),
        tone: getRoleBadgeTone(role),
      })),
      ...(user.groups || []).map((group) => ({
        key: `group-${group._id || group}`,
        label: getShortGroupLabel(group, 14),
        title: getGroupTitle(group),
        tone: getRoleBadgeTone(group),
      })),
    ];

    if (badges.length === 0) {
      return <span className="um-users-empty-role">No access</span>;
    }

    return (
      <div className="um-users-role-badges">
        {badges.map((badge) => (
          <span
            key={badge.key}
            className={`um-users-role-badge tone-${badge.tone}`}
            title={badge.title}
          >
            {badge.label}
          </span>
        ))}
      </div>
    );
  };

  const pageNumbers = useMemo(() => {
    const maxButtons = 5;
    let start = Math.max(1, currentPage - Math.floor(maxButtons / 2));
    let end = Math.min(totalPages, start + maxButtons - 1);
    start = Math.max(1, end - maxButtons + 1);
    const nums = [];
    for (let i = start; i <= end; i += 1) nums.push(i);
    return nums;
  }, [currentPage, totalPages]);

  return (
    <div className="um-users-page">
      <div className="um-users-card">
        <div className="um-users-card-top">
          <div className="um-users-heading">
            <h1>Users &amp; Access</h1>
            <p className="um-users-breadcrumb">
              Home <span>›</span> User Management <span>›</span> Users
            </p>
            <p className="um-mgmt-hint">
              Assign access with roles. Use <strong>Manage access</strong> for quick packs (Employee Documents, AI Images, etc.).
              {typeof onOpenRoles === 'function' ? (
                <>
                  {' '}
                  <button type="button" className="um-inline-link" onClick={onOpenRoles}>
                    Customize role permissions →
                  </button>
                </>
              ) : null}
            </p>
          </div>
          <div className="um-users-toolbar">
            <label className="um-users-search">
              <span className="um-users-search-icon" aria-hidden="true">
                🔍
              </span>
              <input
                type="search"
                placeholder="Search User"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </label>
            {hasPermission('users.create') && (
              <button type="button" className="um-users-add-btn" onClick={openAddModal}>
                Add User
              </button>
            )}
          </div>
        </div>

        <div className="um-users-status-row">
          Showing <strong>{pageUsers.length}</strong> of <strong>{users.length}</strong> total Users
        </div>

        {loading ? (
          <div className="um-users-loading">Loading...</div>
        ) : (
          <>
            <div className="um-users-list" role="table" aria-label="Users">
              <div className="um-users-row um-users-row-head" role="row">
                <div className="um-users-cell check" role="columnheader">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={toggleSelectAllPage}
                    aria-label="Select all users on this page"
                  />
                </div>
                <div className="um-users-cell name" role="columnheader">
                  Name
                </div>
                <div className="um-users-cell roles" role="columnheader">
                  Access
                </div>
                <div className="um-users-cell actions" role="columnheader">
                  Actions
                </div>
              </div>

              {users.length === 0 ? (
                <div className="um-users-empty">No users found</div>
              ) : (
                pageUsers.map((u) => (
                  <div className="um-users-row" role="row" key={u._id}>
                    <div className="um-users-cell check" role="cell">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(u._id)}
                        onChange={() => toggleSelect(u._id)}
                        aria-label={`Select ${u.username}`}
                      />
                    </div>
                    <div className="um-users-cell name" role="cell">
                      <div className="um-users-person">
                        <div className="um-users-avatar" aria-hidden="true">
                          {getInitials(u.username)}
                        </div>
                        <div className="um-users-person-meta">
                          <div className="um-users-person-name-row">
                            <span className="um-users-person-name" title={u.username}>
                              {u.username}
                            </span>
                            {!u.lastLoginAt && (
                              <span className="um-users-login-status">Not Logged in</span>
                            )}
                            {u.isActive === false && (
                              <span className="um-users-inactive-status">Inactive</span>
                            )}
                          </div>
                          <span className="um-users-person-email" title={u.email}>
                            {u.email}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="um-users-cell roles" role="cell">
                      {renderRoleBadges(u)}
                    </div>
                    <div className="um-users-cell actions" role="cell">
                      <div className="um-users-actions">
                        {hasPermission('users.update') && (
                          <button
                            type="button"
                            className="um-users-action-link"
                            onClick={() => handleEdit(u)}
                          >
                            <span aria-hidden="true">⚙</span>
                            Manage access
                          </button>
                        )}
                        {hasPermission('users.delete') && (
                          <button
                            type="button"
                            className="um-users-action-link danger"
                            onClick={() => handleDelete(u._id)}
                          >
                            <span aria-hidden="true">⊘</span>
                            Remove User
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {users.length > PAGE_SIZE && (
              <div className="um-users-pagination">
                <span className="um-users-page-label">
                  displaying page <strong>{currentPage}</strong>
                </span>
                <div className="um-users-page-controls">
                  <button type="button" disabled={currentPage <= 1} onClick={() => setPage(1)}>
                    First
                  </button>
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    aria-label="Previous page"
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
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    aria-label="Next page"
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

      {showModal && createPortal(
        <div className="modal-overlay um-users-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content um-users-modal um-users-modal-wide" onClick={(e) => e.stopPropagation()}>
            <h2>{editingUser ? 'Manage user access' : 'Add User'}</h2>
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
                  placeholder="Employee first name or full name"
                />
                {!editingUser && (
                  <small className="um-form-hint">
                    Use the employee name so they can sign in with their name.
                  </small>
                )}
                {editingUser && <small className="um-form-hint">Username cannot be changed</small>}
              </div>
              <div className="form-group">
                <label>Email *</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                />
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
                <label>Quick access packs</label>
                <p className="um-form-hint" style={{ marginTop: 0 }}>
                  One click adds the right role for documents / AI images / generator.
                </p>
                <div className="um-access-packs-row">
                  {ACCESS_PACKS.map((pack) => {
                    const existing = roles.find(
                      (r) => String(r.code).toLowerCase() === String(pack.roleCode).toLowerCase()
                    );
                    const alreadyOn = existing
                      && (formData.roles || []).map(String).includes(String(existing._id));
                    return (
                      <button
                        key={pack.id}
                        type="button"
                        className={`um-access-pack-btn${alreadyOn ? ' active' : ''}`}
                        title={pack.description}
                        disabled={!!packBusy}
                        onClick={() => applyAccessPack(pack)}
                      >
                        {packBusy === pack.id ? '…' : alreadyOn ? '✓ ' : '+ '}
                        {pack.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="form-group">
                <label>Roles</label>
                <div className="um-role-card-list">
                  {roles.map((r) => {
                    const checked = (formData.roles || []).map(String).includes(String(r._id));
                    const permCount = Array.isArray(r.permissions) ? r.permissions.length : 0;
                    return (
                      <label key={r._id} className={`um-role-card${checked ? ' selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleRoleToggle(r._id)}
                        />
                        <span className="um-role-card-body">
                          <span className="um-role-card-name">{r.name}</span>
                          <span className="um-role-card-desc">{r.description || r.code}</span>
                          <span className="um-role-card-meta">{permCount} permissions · {r.code}</span>
                        </span>
                      </label>
                    );
                  })}
                  {roles.length === 0 && <span>No roles defined</span>}
                </div>
                {selectedRolesPreview.length > 0 ? (
                  <p className="um-form-hint">
                    Selected: {selectedRolesPreview.map((r) => r.name).join(', ')}
                  </p>
                ) : (
                  <p className="um-form-hint">No roles selected — user will have no module access.</p>
                )}
              </div>

              <div className="form-group">
                <label>Groups (optional)</label>
                <div className="multiselect-box um-multiselect-groups">
                  {groups.map((g) => (
                    <label key={g._id}>
                      <input
                        type="checkbox"
                        checked={(formData.groups || []).map(String).includes(String(g._id))}
                        onChange={() => handleGroupToggle(g._id)}
                      />
                      {getShortGroupLabel(g, 20)}
                    </label>
                  ))}
                  {groups.length === 0 && <span>No groups defined</span>}
                </div>
              </div>
              <div className="form-group">
                <label className="um-active-check">
                  <input
                    type="checkbox"
                    name="isActive"
                    checked={formData.isActive}
                    onChange={handleInputChange}
                  />
                  Active
                </label>
              </div>
              <div className="form-actions">
                <button type="button" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                {typeof onOpenRoles === 'function' ? (
                  <button
                    type="button"
                    className="um-secondary-btn"
                    onClick={() => {
                      setShowModal(false);
                      onOpenRoles();
                    }}
                  >
                    Edit role permissions
                  </button>
                ) : null}
                <button type="submit" className="btn-primary um-users-modal-submit">
                  {editingUser ? 'Save access' : 'Create user'}
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

export default Users;
