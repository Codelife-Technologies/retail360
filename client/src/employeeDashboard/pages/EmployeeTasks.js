import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { employeeTasksAPI } from '../services/employeeDashboardApi';
import EmployeeContextGate, { EmployeeWelcome } from '../components/EmployeeContextGate';
import { formatDate, toInputDate } from '../../hr/utils/hrUtils';

const STATUS_OPTIONS = ['Pending', 'In Progress', 'Completed'];
const PRIORITY_OPTIONS = ['Low', 'Medium', 'High'];

const emptyPersonalTask = () => ({
  title: '',
  description: '',
  dueDate: toInputDate(new Date()),
  priority: 'Medium',
});

function getDeadlineMeta(task) {
  if (!task?.dueDate) {
    return { label: 'No deadline', overdue: false, dueSoon: false };
  }

  const due = new Date(task.dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDay = new Date(due);
  dueDay.setHours(0, 0, 0, 0);

  const diffDays = Math.round((dueDay - today) / (1000 * 60 * 60 * 24));
  const overdue = task.status !== 'Completed' && diffDays < 0;
  const dueSoon = task.status !== 'Completed' && diffDays >= 0 && diffDays <= 2;

  let label = formatDate(task.dueDate);
  if (task.status === 'Completed') {
    label = `Completed · ${formatDate(task.dueDate)}`;
  } else if (diffDays === 0) {
    label = 'Due today';
  } else if (diffDays === 1) {
    label = 'Due tomorrow';
  } else if (diffDays > 1) {
    label = `Due in ${diffDays} days · ${formatDate(task.dueDate)}`;
  } else {
    label = `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'} · ${formatDate(task.dueDate)}`;
  }

  return { label, overdue, dueSoon, dateLabel: formatDate(task.dueDate) };
}

function TaskDeadline({ task }) {
  const meta = getDeadlineMeta(task);

  return (
    <div
      className={`ed-task-deadline${meta.overdue ? ' overdue' : ''}${meta.dueSoon ? ' due-soon' : ''}${
        task.status === 'Completed' ? ' completed' : ''
      }`}
    >
      <span className="ed-task-deadline-label">Deadline</span>
      <strong>{meta.label}</strong>
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
      <TaskDeadline task={task} />
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

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);
      if (viewMode === 'today') {
        const response = await employeeTasksAPI.getToday();
        setTasks(response.data || []);
        return;
      }

      const response = await employeeTasksAPI.getAll();
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
  }, [viewMode]);

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
    if (!formData.dueDate) {
      alert('Deadline is required');
      return;
    }
    try {
      setSaving(true);
      await employeeTasksAPI.create({
        ...formData,
        startDate: formData.dueDate,
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

  const handleDelete = async (task) => {
    if (!window.confirm(`Delete personal task "${task.title}"?`)) return;
    try {
      await employeeTasksAPI.delete(task._id);
      fetchTasks();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to delete task');
    }
  };

  const sortedTasks = useMemo(() => {
    const list = [...tasks].sort(
      (a, b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0)
    );
    if (viewMode !== 'upcoming') return list;

    return list.filter(
      (task) => task.status !== 'Completed' || new Date(task.dueDate) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    );
  }, [tasks, viewMode]);

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
          className={`ed-view-tab${viewMode === 'today' ? ' active' : ''}`}
          onClick={() => setViewMode('today')}
        >
          Today
        </button>
        <button
          type="button"
          className={`ed-view-tab${viewMode === 'upcoming' ? ' active' : ''}`}
          onClick={() => setViewMode('upcoming')}
        >
          By Deadline
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
              <label>Deadline</label>
              <input
                type="date"
                value={formData.dueDate}
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
      ) : sortedTasks.length === 0 ? (
        <div className="ed-empty-panel">
          {viewMode === 'today'
            ? 'No tasks due today. Add a personal task or check By Deadline.'
            : 'No tasks in this view yet.'}
        </div>
      ) : (
        <div className="ed-task-cards">
          {sortedTasks.map((task) => (
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
