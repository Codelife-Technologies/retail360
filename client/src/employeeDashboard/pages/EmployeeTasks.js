import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { employeeTasksAPI } from '../services/employeeDashboardApi';
import EmployeeContextGate, { EmployeeWelcome } from '../components/EmployeeContextGate';
import HrStatusBadge from '../../hr/components/HrStatusBadge';
import { formatDate, toInputDate, groupTasksByIssueDate, groupTasksForTodayView } from '../../hr/utils/hrUtils';

const STATUS_OPTIONS = ['Pending', 'In Progress', 'On Hold', 'Backlog', 'Completed', 'Cancelled'];
const PRIORITY_OPTIONS = ['Low', 'Medium', 'High'];

const emptyPersonalTask = () => ({
  title: '',
  description: '',
  startDate: toInputDate(new Date()),
  dueDate: toInputDate(new Date()),
  priority: 'Medium',
});

function taskOverlapsTimeline(task, fromDate, toDate) {
  if (!fromDate && !toDate) return true;

  const start = new Date(task.startDate || task.dueDate || task.createdAt);
  const end = new Date(task.dueDate || task.startDate || task.createdAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;

  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  if (fromDate) {
    const from = new Date(fromDate);
    from.setHours(0, 0, 0, 0);
    if (end < from) return false;
  }
  if (toDate) {
    const to = new Date(toDate);
    to.setHours(0, 0, 0, 0);
    if (start > to) return false;
  }
  return true;
}

function EmployeeTasksContent() {
  const [viewMode, setViewMode] = useState('today');
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(emptyPersonalTask());
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [timelineFrom, setTimelineFrom] = useState('');
  const [timelineTo, setTimelineTo] = useState('');
  const [delayTask, setDelayTask] = useState(null);
  const [delayReasonDraft, setDelayReasonDraft] = useState('');
  const [savingDelay, setSavingDelay] = useState(false);
  const [viewTask, setViewTask] = useState(null);

  const hasTimelineFilter = Boolean(timelineFrom || timelineTo);

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);

      // Timeline filter uses the range API; otherwise keep Today/All/Upcoming behavior.
      if (hasTimelineFilter || viewMode !== 'today') {
        const params = {};
        if (timelineFrom && timelineTo) {
          params.fromDate = timelineFrom;
          params.toDate = timelineTo;
        }
        const response = await employeeTasksAPI.getAll(params);
        const list = Array.isArray(response.data)
          ? response.data
          : response.data?.data || [];
        setTasks(list);
        return;
      }

      const response = await employeeTasksAPI.getToday();
      setTasks(response.data || []);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [viewMode, timelineFrom, timelineTo, hasTimelineFilter]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleStatusChange = async (taskId, status) => {
    try {
      setUpdatingId(taskId);
      await employeeTasksAPI.updateStatus(taskId, status);
      fetchTasks();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to update task');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleCreatePersonalTask = async (e) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      alert('Task title is required');
      return;
    }
    if (!formData.startDate) {
      alert('Date of issue is required');
      return;
    }
    if (!formData.dueDate) {
      alert('Deadline is required');
      return;
    }
    try {
      setSaving(true);
      await employeeTasksAPI.create({
        ...formData,
        startDate: formData.startDate,
        dueDate: formData.dueDate,
        source: 'Personal',
        assignedBy: 'Self',
      });
      setFormData(emptyPersonalTask());
      setShowForm(false);
      if (viewMode === 'today') {
        setViewMode('upcoming');
      } else {
        fetchTasks();
      }
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to create task');
    } finally {
      setSaving(false);
    }
  };

  const openDelayReason = (task) => {
    setDelayTask(task);
    setDelayReasonDraft(task.delayReason || '');
  };

  const handleSaveDelayReason = async (e) => {
    e.preventDefault();
    if (!delayTask) return;
    try {
      setSavingDelay(true);
      await employeeTasksAPI.update(delayTask._id, {
        delayReason: delayReasonDraft.trim(),
      });
      setDelayTask(null);
      setDelayReasonDraft('');
      fetchTasks();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to save task update');
    } finally {
      setSavingDelay(false);
    }
  };

  const sortedTasks = useMemo(() => {
    let list = [...tasks];

    if (viewMode === 'upcoming' && !hasTimelineFilter) {
      list = list.filter(
        (task) =>
          !['Completed', 'Cancelled', 'On Hold'].includes(task.status)
          || new Date(task.dueDate) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      );
    }

    // Client-side overlap when only one timeline date is set (API needs both).
    if (hasTimelineFilter && !(timelineFrom && timelineTo)) {
      list = list.filter((task) => taskOverlapsTimeline(task, timelineFrom, timelineTo));
    }

    if (statusFilter) {
      list = list.filter((task) => task.status === statusFilter);
    }

    return list;
  }, [tasks, viewMode, statusFilter, timelineFrom, timelineTo, hasTimelineFilter]);

  const taskGroups = useMemo(
    () => (viewMode === 'today' && !hasTimelineFilter
      ? groupTasksForTodayView(sortedTasks)
      : groupTasksByIssueDate(sortedTasks)),
    [sortedTasks, viewMode, hasTimelineFilter]
  );

  const clearTimelineFilter = () => {
    setTimelineFrom('');
    setTimelineTo('');
  };

  return (
    <>
      <header className="ed-section-header">
        <div>
          <h2>My Tasks</h2>
          <p>HR-assigned tasks and your personal tasks with deadlines.</p>
        </div>
        <button type="button" className="ed-btn ed-btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancel' : '+ Personal Task'}
        </button>
      </header>

      <div className="ed-view-tabs">
        <button
          type="button"
          className={`ed-view-tab${viewMode === 'today' && !hasTimelineFilter ? ' active' : ''}`}
          onClick={() => {
            clearTimelineFilter();
            setViewMode('today');
          }}
        >
          Today
        </button>
        <button
          type="button"
          className={`ed-view-tab${viewMode === 'upcoming' && !hasTimelineFilter ? ' active' : ''}`}
          onClick={() => {
            clearTimelineFilter();
            setViewMode('upcoming');
          }}
        >
          By Deadline
        </button>
        <button
          type="button"
          className={`ed-view-tab${viewMode === 'all' && !hasTimelineFilter ? ' active' : ''}`}
          onClick={() => {
            clearTimelineFilter();
            setViewMode('all');
          }}
        >
          All Tasks
        </button>
      </div>

      <div className="hr-filters-row">
        <label className="hr-filter-label">
          Timeline from
          <input
            type="date"
            className="hr-filter-select"
            value={timelineFrom}
            max={timelineTo || undefined}
            onChange={(e) => {
              setTimelineFrom(e.target.value);
              if (viewMode === 'today') setViewMode('all');
            }}
          />
        </label>
        <label className="hr-filter-label">
          Timeline to
          <input
            type="date"
            className="hr-filter-select"
            value={timelineTo}
            min={timelineFrom || undefined}
            onChange={(e) => {
              setTimelineTo(e.target.value);
              if (viewMode === 'today') setViewMode('all');
            }}
          />
        </label>
        <select
          className="hr-filter-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All Status</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        {hasTimelineFilter ? (
          <button type="button" className="hr-btn hr-btn-secondary hr-btn-sm" onClick={clearTimelineFilter}>
            Clear timeline
          </button>
        ) : null}
      </div>

      {showForm && (
        <form className="ed-personal-task-form ed-table-card" onSubmit={handleCreatePersonalTask}>
          <h3>Add Personal Task</h3>
          <div className="ed-form-row">
            <div className="ed-form-group ed-form-group-full">
              <label>Title</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData((f) => ({ ...f, title: e.target.value }))}
                required
              />
            </div>
          </div>
          <div className="ed-form-group">
            <label>Description</label>
            <textarea
              rows={2}
              value={formData.description}
              onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="ed-form-row">
            <div className="ed-form-group">
              <label>Date of Issue</label>
              <input
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData((f) => ({ ...f, startDate: e.target.value }))}
                required
              />
            </div>
            <div className="ed-form-group">
              <label>Deadline</label>
              <input
                type="date"
                value={formData.dueDate}
                min={formData.startDate}
                onChange={(e) => setFormData((f) => ({ ...f, dueDate: e.target.value }))}
                required
              />
            </div>
            <div className="ed-form-group">
              <label>Priority</label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData((f) => ({ ...f, priority: e.target.value }))}
              >
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>
          <button type="submit" className="ed-btn ed-btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save Personal Task'}
          </button>
        </form>
      )}

      {loading ? (
        <div className="hr-loading">Loading tasks...</div>
      ) : (
        <div className="hr-table-card">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Date of Issue</th>
                <th>Deadline</th>
                <th>Task</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Task Update</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {taskGroups.length === 0 ? (
                <tr>
                  <td colSpan={7} className="hr-empty">
                    {hasTimelineFilter
                      ? 'No tasks found in this timeline.'
                      : viewMode === 'today'
                        ? 'No tasks due today and no backlog items.'
                        : 'No tasks in this view yet.'}
                  </td>
                </tr>
              ) : (
                taskGroups.flatMap((group) =>
                  group.tasks.map((task, index) => (
                    <tr key={task._id}>
                      {index === 0 ? (
                        <td
                          className={`hr-task-issue-date${group.dateKey === 'backlog' ? ' hr-task-issue-backlog' : ''}`}
                          rowSpan={group.tasks.length}
                        >
                          {group.dateLabel}
                        </td>
                      ) : null}
                      <td>{formatDate(task.dueDate)}</td>
                      <td>
                        <button
                          type="button"
                          className="hr-task-title-btn"
                          onClick={() => setViewTask(task)}
                          title="View task details"
                        >
                          <strong>{task.title}</strong>
                          {task.description && (
                            <div className="hr-task-desc-inline">{task.description}</div>
                          )}
                        </button>
                      </td>
                      <td>{task.priority}</td>
                      <td><HrStatusBadge status={task.status} /></td>
                      <td>
                        {task.delayReason ? (
                          <button
                            type="button"
                            className="hr-link hr-task-delay-preview"
                            onClick={() => openDelayReason(task)}
                            title={task.delayReason}
                          >
                            {task.delayReason.length > 60
                              ? `${task.delayReason.slice(0, 60)}…`
                              : task.delayReason}
                          </button>
                        ) : (
                          <span className="hr-muted">—</span>
                        )}
                      </td>
                      <td>
                        <div className="hr-actions-cell">
                          <select
                            className="hr-filter-select hr-btn-sm"
                            value={task.status}
                            disabled={updatingId === task._id}
                            onChange={(e) => handleStatusChange(task._id, e.target.value)}
                            aria-label="Change status"
                          >
                            {STATUS_OPTIONS.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="hr-btn hr-btn-secondary hr-btn-sm"
                            onClick={() => openDelayReason(task)}
                          >
                            {task.delayReason ? 'Edit Update' : 'Add Update'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )
              )}
            </tbody>
          </table>
        </div>
      )}

      {viewTask && (
        <div className="hr-modal-overlay" onClick={() => setViewTask(null)}>
          <div className="hr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="hr-modal-header">
              <h2>Task Details</h2>
              <button type="button" className="hr-modal-close" onClick={() => setViewTask(null)}>×</button>
            </div>
            <div className="hr-modal-body">
              <div className="hr-task-detail-grid">
                <div>
                  <span className="hr-muted">Status</span>
                  <HrStatusBadge status={viewTask.status} />
                </div>
                <div>
                  <span className="hr-muted">Priority</span>
                  <strong>{viewTask.priority}</strong>
                </div>
                <div>
                  <span className="hr-muted">Date of Issue</span>
                  <strong>{formatDate(viewTask.startDate || viewTask.createdAt)}</strong>
                </div>
                <div>
                  <span className="hr-muted">Deadline</span>
                  <strong>{formatDate(viewTask.dueDate)}</strong>
                </div>
                <div>
                  <span className="hr-muted">Source</span>
                  <strong>{viewTask.source === 'Personal' ? 'Personal' : 'HR Assigned'}</strong>
                </div>
              </div>
              <div className="hr-form-group hr-form-group-full" style={{ marginTop: '1rem' }}>
                <label>Task</label>
                <p><strong>{viewTask.title}</strong></p>
                {viewTask.description ? <p className="hr-task-desc-inline">{viewTask.description}</p> : null}
              </div>
              <div className="hr-form-group hr-form-group-full">
                <label>Task update</label>
                {viewTask.delayReason ? (
                  <div className="hr-task-delay-box">
                    <p>{viewTask.delayReason}</p>
                    {viewTask.delayReasonUpdatedAt ? (
                      <small className="hr-muted">
                        Updated {formatDate(viewTask.delayReasonUpdatedAt)}
                      </small>
                    ) : null}
                  </div>
                ) : (
                  <p className="hr-muted">No task update provided yet.</p>
                )}
              </div>
            </div>
            <div className="hr-modal-footer">
              <button type="button" className="hr-btn hr-btn-secondary" onClick={() => setViewTask(null)}>
                Close
              </button>
              <button
                type="button"
                className="hr-btn hr-btn-primary"
                onClick={() => {
                  openDelayReason(viewTask);
                  setViewTask(null);
                }}
              >
                {viewTask.delayReason ? 'Edit Update' : 'Add Update'}
              </button>
            </div>
          </div>
        </div>
      )}

      {delayTask && (
        <div className="hr-modal-overlay" onClick={() => setDelayTask(null)}>
          <div className="hr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="hr-modal-header">
              <h2>Task Update</h2>
              <button type="button" className="hr-modal-close" onClick={() => setDelayTask(null)}>×</button>
            </div>
            <form onSubmit={handleSaveDelayReason}>
              <div className="hr-modal-body">
                <p className="hr-page-subtitle" style={{ marginBottom: '0.75rem' }}>
                  Task: <strong>{delayTask.title}</strong>
                  {delayTask.status === 'Backlog' ? ' (Backlog)' : ''}
                </p>
                <div className="hr-form-group hr-form-group-full">
                  <label>Update / progress note</label>
                  <textarea
                    rows={4}
                    value={delayReasonDraft}
                    onChange={(e) => setDelayReasonDraft(e.target.value)}
                    placeholder="Add a progress update or note about this task…"
                    required
                  />
                </div>
              </div>
              <div className="hr-modal-footer">
                <button type="button" className="hr-btn hr-btn-secondary" onClick={() => setDelayTask(null)}>
                  Cancel
                </button>
                <button type="submit" className="hr-btn hr-btn-primary" disabled={savingDelay}>
                  {savingDelay ? 'Saving…' : 'Save Update'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function EmployeeTasks() {
  return (
    <EmployeeContextGate>
      {(context) => (
        <div className="hr-page ed-page">
          <EmployeeWelcome employee={context.employee} />
          <EmployeeTasksContent />
        </div>
      )}
    </EmployeeContextGate>
  );
}

export default EmployeeTasks;
