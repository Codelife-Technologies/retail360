import React, { useCallback, useEffect, useState } from 'react';
import { documentsAPI } from '../services/documentsApi';

/**
 * Google Drive–style share dialog: invite employees with Viewer or Editor role.
 */
export default function ShareDialog({ open, resourceType, resource, onClose, onToast }) {
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [recipients, setRecipients] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [role, setRole] = useState('viewer');
  const [expiresAt, setExpiresAt] = useState('');
  const [saving, setSaving] = useState(false);

  const resourceId = resource?._id;
  const title =
    resourceType === 'folder'
      ? resource?.name
      : resource?.title || resource?.fileName || 'Item';

  const loadShares = useCallback(async () => {
    if (!resourceType || !resourceId) return;
    try {
      setLoading(true);
      const res = await documentsAPI.listShares({ resourceType, resourceId });
      setShares(res.data?.shares || []);
    } catch (err) {
      onToast?.(err.response?.data?.error || 'Could not load shares');
      setShares([]);
    } finally {
      setLoading(false);
    }
  }, [resourceType, resourceId, onToast]);

  useEffect(() => {
    if (open) loadShares();
  }, [open, loadShares]);

  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(async () => {
      try {
        const res = await documentsAPI.listShareRecipients({ search, limit: 20 });
        setRecipients(res.data?.users || []);
      } catch (_e) {
        setRecipients([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [search, open]);

  if (!open) return null;

  const handleShare = async (e) => {
    e?.preventDefault?.();
    if (!selectedUser?._id) {
      onToast?.('Select an employee');
      return;
    }
    try {
      setSaving(true);
      await documentsAPI.createShare({
        resourceType,
        resourceId,
        userId: selectedUser._id,
        role,
        expiresAt: expiresAt || null,
      });
      setSelectedUser(null);
      setSearch('');
      setRole('viewer');
      setExpiresAt('');
      onToast?.(`Shared with ${selectedUser.username} (${role})`);
      await loadShares();
    } catch (err) {
      onToast?.(err.response?.data?.error || 'Share failed');
    } finally {
      setSaving(false);
    }
  };

  const handleRoleChange = async (shareId, nextRole) => {
    try {
      await documentsAPI.updateShare(shareId, { role: nextRole });
      onToast?.('Permission updated');
      await loadShares();
    } catch (err) {
      onToast?.(err.response?.data?.error || 'Update failed');
    }
  };

  const handleRevoke = async (shareId) => {
    if (!window.confirm('Remove access for this employee?')) return;
    try {
      await documentsAPI.revokeShare(shareId);
      onToast?.('Access removed');
      await loadShares();
    } catch (err) {
      onToast?.(err.response?.data?.error || 'Remove failed');
    }
  };

  return (
    <div className="drive-modal-overlay" onClick={onClose} role="presentation">
      <div className="drive-modal drive-share-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h3>Share “{title}”</h3>
        <p className="drive-muted">
          Private sharing with employees. <strong>Viewer</strong> can open and download.
          <strong> Editor</strong> can also upload, rename, move, and delete.
        </p>

        <form className="drive-share-form" onSubmit={handleShare}>
          <label>
            <span>Employee</span>
            <input
              className="drive-input"
              value={selectedUser ? `${selectedUser.username} (${selectedUser.email})` : search}
              onChange={(e) => {
                setSelectedUser(null);
                setSearch(e.target.value);
              }}
              placeholder="Search by name or email…"
              autoComplete="off"
            />
          </label>
          {!selectedUser && recipients.length > 0 && search ? (
            <ul className="drive-share-suggest">
              {recipients.map((u) => (
                <li key={u._id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedUser(u);
                      setSearch('');
                    }}
                  >
                    <strong>{u.username}</strong>
                    <span>{u.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="drive-share-row">
            <label>
              <span>Permission</span>
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="viewer">Viewer — view & download</option>
                <option value="editor">Editor — view, upload, edit, delete</option>
              </select>
            </label>
            <label>
              <span>Expires (optional)</span>
              <input
                type="date"
                className="drive-input"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </label>
          </div>

          <div className="drive-modal-actions">
            <button type="button" className="drive-btn" onClick={onClose}>Done</button>
            <button type="submit" className="drive-btn drive-btn-primary" disabled={saving || !selectedUser}>
              {saving ? 'Sharing…' : 'Share'}
            </button>
          </div>
        </form>

        <h4 className="drive-share-people-title">People with access</h4>
        {loading ? (
          <p className="drive-muted">Loading…</p>
        ) : shares.length === 0 ? (
          <p className="drive-muted">Not shared with anyone yet.</p>
        ) : (
          <ul className="drive-share-people">
            {shares.map((s) => {
              const person = s.sharedWith || s.sharedWithUserId || {};
              return (
                <li key={s._id}>
                  <div>
                    <strong>{person.username || 'User'}</strong>
                    <span className="drive-muted"> {person.email || ''}</span>
                    {s.isExpired ? <span className="drive-share-expired"> Expired</span> : null}
                  </div>
                  <div className="drive-share-people-actions">
                    <select
                      value={s.role}
                      onChange={(e) => handleRoleChange(s._id, e.target.value)}
                    >
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                    </select>
                    <button type="button" className="drive-link" onClick={() => handleRevoke(s._id)}>
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
