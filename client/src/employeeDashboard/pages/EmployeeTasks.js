import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { employeeTasksAPI } from '../services/employeeDashboardApi';
import EmployeeContextGate, { EmployeeWelcome } from '../components/EmployeeContextGate';
import { formatDate, toInputDate } from '../../hr/utils/hrUtils';

const STATUS_OPTIONS = ['Pending', 'In Progress', 'Completed'];
const PRIORITY_OPTIONS = ['Low', 'Medium', 'High'];

const emptyPersonalTask = () => ({
  title: '',
  description: '',
  startDate: toInputDate(new Date()),
  dueDate: toInputDate(new Date()),
  priority: 'Medium',
});

function getTimelineRange() {
  const from = new Date();
  from.setDate(from.getDate() - 7);
  const to = new Date();
  to.setDate(to.getDate() + 28);
  return { fromDate: toInputDate(from), toDate: toInputDate(to) };
}

function getTimelineProgress(task) {
  const start = new Date(task.startDate || task.dueDate).getTime();
  const end = new Date(task.dueDate).getTime();
  const today = Date.now();
  if (end <= start) return task.status === 'Completed' ? 100 : 0;
  if (today <= start) return 0;
  if (today >= end) return 100;
  return Math.round(((today - start) / (end - start)) * 100);
}

function TaskTimelineBar({ task }) {
  const progress = getTimelineProgress(task);
  const overdue = task.status !== 'Completed' && new Date(task.dueDate) < new Date();

  return (
    <div className="ed-task-timeline">
      <div className="ed-task-timeline-labels">
        <span>{formatDate(task.startDate || task.dueDate)}</span>
        <span>{formatDate(task.dueDate)}</span>
      </div>
      <div className="ed-task-timeline-track">
        <div
          className={`ed-task-timeline-fill${overdue ? ' overdue' : ''}${task.status === 'Completed' ? ' completed' : ''}`}
          style={{ width: `${task.status === 'Completed' ? 100 : progress}%` }}
        />
      </div>
      {overdue && <span className="ed-task-overdue">Overdue</span>}
    </div>
  );
}

function TaskCard({ task, updatingId, onStatusChange, onDelete, showDelete }) {
  return (
    <article
      key={task._id}
      className={`ed-task-card priority-${task.priority?.toLowerCase()} source-${(task.source || 'HR').toLowerCase()}`}
    >
      <div className="ed-task-card-header">
        <h3>{task.title}</h3>
        <span className="ed-task-priority">{task.priority}</span>
      </div>
      {task.description && <p className="ed-task-desc">{task.description}</p>}
      <TaskTimelineBar task={task} />
      <p className="ed-task-meta">
        {task.source === 'Personal' ? 'Personal task' : `Assigned by ${task.assignedBy || 'HR'}`}
      </p>
      <div className="ed-task-actions">
        <select
          value={task.status}
          disabled={updatingId === task._id}
          onChange={(e) => onStatusChange(task._id, e.target.value)}
        >
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
        {showDelete && (
          <button
            type="button"
            className="ed-btn ed-btn-danger-outline"
            onClick={() => onDelete(task)}
          >
            Delete
          </button>
        )}
      </div>
    </article>
  );
}

function EmployeeTasksContent() {
  const [viewMode, setViewMode] = useState('today');
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(emptyPersonalTask());
  const [saving, setSaving] = useState(false);
  const timelineRange = useMemo(() => getTimelineRange(), []);

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);
      if (viewMode === 'today') {
        const response = await employeeTasksAPI.getToday();
        setTasks(response.data || []);
        return;
      }

      const params =
        viewMode === 'timeline'
          ? { ...timelineRange }
          : {};

      const response = await employeeTasksAPI.getAll(params);
      const list = Array.isArray(response.data)
        ? response.data
        : response.data?.data || [];
      setTasks(list);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [viewMode, timelineRange]);

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
    try {
      setSaving(true);
      await employeeTasksAPI.create(formData);
      setFormData(emptyPersonalTask());
      setShowForm(false);
      if (viewMode === 'today') {
        setViewMode('timeline');
      } else {
        fetchTasks();
      }
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to create task');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (task) => {
    if (!window.confirm(`Delete personal task "${task.title}"?`)) return;
    try {
      await employeeTasksAPI.delete(task._id);
      fetchTasks();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to delete task');
    }
  };

  const sortedTimelineTasks = useMemo(
    () =>
      [...tasks].sort(
        (a, b) =>
          new Date(a.startDate || a.dueDate) - new Date(b.startDate || b.dueDate)
      ),
    [tasks]
  );

  return (
    <>
      <header className="ed-section-header">
        <div>
          <h2>My Tasks</h2>
          <p>HR-assigned tasks and your personal tasks with a timeline.</p>
        </div>
        <button type="button" className="ed-btn ed-btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancel' : '+ Personal Task'}
        </button>
      </header>

      <div className="ed-view-tabs">
        <button
          type="button"
          className={`ed-view-tab${viewMode === 'today' ? ' active' : ''}`}
          onClick={() => setViewMode('today')}
        >
          Today
        </button>
        <button
          type="button"
          className={`ed-view-tab${viewMode === 'timeline' ? ' active' : ''}`}
          onClick={() => setViewMode('timeline')}
        >
          Timeline
        </button>
        <button
          type="button"
          className={`ed-view-tab${viewMode === 'all' ? ' active' : ''}`}
          onClick={() => setViewMode('all')}
        >
          All Tasks
        </button>
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
              <label>Start Date</label>
              <input
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData((f) => ({ ...f, startDate: e.target.value }))}
                required
              />
            </div>
            <div className="ed-form-group">
              <label>Due Date</label>
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
        <div className="ed-loading">Loading tasks...</div>
      ) : sortedTimelineTasks.length === 0 ? (
        <div className="ed-empty-panel">
          {viewMode === 'today'
            ? 'No tasks due today. Add a personal task or check the timeline.'
            : 'No tasks in this view yet.'}
        </div>
      ) : viewMode === 'timeline' ? (
        <div className="ed-timeline-list">
          {sortedTimelineTasks.map((task) => (
            <TaskCard
              key={task._id}
              task={task}
              updatingId={updatingId}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
              showDelete={task.source === 'Personal'}
            />
          ))}
        </div>
      ) : (
        <div className="ed-task-cards">
          {sortedTimelineTasks.map((task) => (
            <TaskCard
              key={task._id}
              task={task}
              updatingId={updatingId}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
              showDelete={task.source === 'Personal'}
            />
          ))}
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
