import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { activityLogsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import './UserManagement.css';

const PAGE_SIZE = 15;

const MODULE_OPTIONS = [
  { value: '', label: 'All modules' },
  { value: 'auth', label: 'Login / Logout' },
  { value: 'users', label: 'Users' },
  { value: 'roles', label: 'Roles' },
  { value: 'groups', label: 'Groups' },
  { value: 'permissions', label: 'Permissions' },
];

function formatWhen(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function actionBadgeClass(action = '') {
  if (action.includes('delete')) return 'um-log-badge um-log-badge-danger';
  if (action.includes('create')) return 'um-log-badge um-log-badge-success';
  if (action.includes('update')) return 'um-log-badge um-log-badge-warn';
  if (action === 'login') return 'um-log-badge um-log-badge-info';
  if (action === 'logout') return 'um-log-badge um-log-badge-muted';
  return 'um-log-badge';
}

function ActivityLogs() {
  const { hasPermission } = useAuth();
  const canView = hasPermission('admin.all') || hasPermission('logs.view');

  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState(null);

  const fetchLogs = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError('');
      const response = await activityLogsAPI.getAll({
        page,
        limit: PAGE_SIZE,
        search: searchTerm.trim() || undefined,
        module: moduleFilter || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      setLogs(response.data?.data || []);
      setPagination(response.data?.pagination || { page: 1, limit: PAGE_SIZE, total: 0, pages: 1 });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load activity logs');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [canView, page, searchTerm, moduleFilter, startDate, endDate]);

  useEffect(() => {
    const timer = setTimeout(() => fetchLogs(), searchTerm ? 300 : 0);
    return () => clearTimeout(timer);
  }, [fetchLogs, searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, moduleFilter, startDate, endDate]);

  const pageNumbers = useMemo(() => {
    const totalPages = pagination.pages || 1;
    const currentPage = Math.min(page, totalPages);
    const maxButtons = 5;
    let start = Math.max(1, currentPage - Math.floor(maxButtons / 2));
    let end = Math.min(totalPages, start + maxButtons - 1);
    start = Math.max(1, end - maxButtons + 1);
    const nums = [];
    for (let i = start; i <= end; i += 1) nums.push(i);
    return nums;
  }, [page, pagination.pages]);

  if (!canView) {
    return (
      <div className="um-mgmt-page">
        <div className="um-mgmt-card">
          <div className="um-mgmt-heading">
            <h1>Activity Logs</h1>
            <p className="um-mgmt-breadcrumb">User Management / Logs</p>
          </div>
          <p className="um-mgmt-empty">You do not have permission to view activity logs.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="um-mgmt-page">
      <div className="um-mgmt-card">
        <div className="um-mgmt-card-top">
          <div className="um-mgmt-heading">
            <h1>Activity Logs</h1>
            <p className="um-mgmt-breadcrumb">User Management / Logs</p>
          </div>
          <div className="um-mgmt-toolbar um-log-toolbar">
            <input
              type="search"
              className="um-mgmt-search"
              placeholder="Search user, action, or summary…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <select
              className="um-log-select"
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
              aria-label="Filter by module"
            >
              {MODULE_OPTIONS.map((opt) => (
                <option key={opt.value || 'all'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <input
              type="date"
              className="um-log-date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              aria-label="Start date"
            />
            <input
              type="date"
              className="um-log-date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              aria-label="End date"
            />
          </div>
        </div>

        <p className="um-mgmt-status-row">
          Showing <strong>{logs.length}</strong> of <strong>{pagination.total || 0}</strong> log
          {(pagination.total || 0) === 1 ? '' : 's'}
        </p>

        {error && <p className="um-mgmt-error">{error}</p>}

        {loading ? (
          <p className="um-mgmt-empty">Loading activity logs…</p>
        ) : logs.length === 0 ? (
          <p className="um-mgmt-empty">
            No activity recorded yet. Login, logout, and user-management changes will appear here.
          </p>
        ) : (
          <div className="um-log-list">
            {logs.map((log) => {
              const isOpen = expandedId === log._id;
              return (
                <div key={log._id} className={`um-log-row${isOpen ? ' open' : ''}`}>
                  <button
                    type="button"
                    className="um-log-row-main"
                    onClick={() => setExpandedId(isOpen ? null : log._id)}
                  >
                    <div className="um-log-row-left">
                      <span className={actionBadgeClass(log.action)}>{log.action}</span>
                      <div className="um-log-text">
                        <strong>{log.summary}</strong>
                        <span>
                          by {log.actorUsername || log.actor?.username || 'System'}
                          {log.targetLabel ? ` · ${log.targetLabel}` : ''}
                        </span>
                      </div>
                    </div>
                    <div className="um-log-row-right">
                      <span className="um-log-module">{log.module}</span>
                      <time dateTime={log.performedAt}>{formatWhen(log.performedAt)}</time>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="um-log-details">
                      <div className="um-log-detail-grid">
                        <div>
                          <span>Actor</span>
                          <strong>{log.actorUsername || log.actor?.username || 'System'}</strong>
                        </div>
                        <div>
                          <span>Module</span>
                          <strong>{log.module}</strong>
                        </div>
                        <div>
                          <span>Target</span>
                          <strong>{log.targetLabel || log.targetType || '—'}</strong>
                        </div>
                        <div>
                          <span>IP</span>
                          <strong>{log.ipAddress || '—'}</strong>
                        </div>
                      </div>
                      {log.changes != null && (
                        <pre className="um-log-changes">{JSON.stringify(log.changes, null, 2)}</pre>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {(pagination.pages || 1) > 1 && (
          <div className="um-mgmt-pagination">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Prev
            </button>
            {pageNumbers.map((num) => (
              <button
                key={num}
                type="button"
                className={num === page ? 'active' : ''}
                onClick={() => setPage(num)}
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              disabled={page >= (pagination.pages || 1)}
              onClick={() => setPage((p) => Math.min(pagination.pages || 1, p + 1))}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default ActivityLogs;
