import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { hrTasksAPI, hrEmployeesAPI } from '../services/hrApi';
import HrStatusBadge from '../components/HrStatusBadge';
import {
  extractList,
  formatDate,
  employeeName,
  toInputDate,
  taskRowClass,
  getCurrentWeekRange,
  groupTasksByIssueDate,
  HR_PERIOD_OPTIONS,
  getHrPeriodRange,
  formatHrPeriodLabel,
} from '../utils/hrUtils';

const PRIORITY_OPTIONS = ['Low', 'Medium', 'High'];
const STATUS_OPTIONS = ['Pending', 'In Progress', 'On Hold', 'Backlog', 'Completed', 'Cancelled'];

let taskLineSeq = 0;
const emptyTaskLine = () => ({
  key: `task-${Date.now()}-${taskLineSeq++}`,
  title: '',
  description: '',
  priority: 'Medium',
});

const emptyForm = () => ({
  employee: '',
  startDate: toInputDate(new Date()),
  dueDate: toInputDate(new Date()),
  items: [emptyTaskLine()],
});

function EmployeeTasks() {
  const [tasks, setTasks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState(emptyForm());
  const [assigning, setAssigning] = useState(false);
  const [filters, setFilters] = useState(() => {
    const week = getCurrentWeekRange();
    return {
      period: 'week',
      employee: '',
      status: '',
      fromDate: week.fromDate,
      toDate: week.toDate,
    };
  });
  const [viewTask, setViewTask] = useState(null);

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (filters.employee) params.employee = filters.employee;
      if (filters.status) params.status = filters.status;
      if (filters.fromDate) params.fromDate = filters.fromDate;
      if (filters.toDate) params.toDate = filters.toDate;
      const response = await hrTasksAPI.getAll(params);
      setTasks(extractList(response));
    } catch (error) {
      console.error('Error fetching tasks:', error);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    hrEmployeesAPI.getAll({ status: 'Active' }).then((res) => {
      setEmployees(extractList(res));
    }).catch(() => setEmployees([]));
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const taskGroups = useMemo(() => groupTasksByIssueDate(tasks), [tasks]);

  const handlePeriodChange = (period) => {
    const range = getHrPeriodRange(period);
    setFilters((f) => ({
      ...f,
      period,
      ...(range || {}),
    }));
  };

  const periodLabel = formatHrPeriodLabel(filters.period, filters.fromDate, filters.toDate);

  const updateTaskItem = (index, field, value) => {
    setFormData((f) => {
      const items = [...f.items];
      items[index] = { ...items[index], [field]: value };
      return { ...f, items };
    });
  };

  const addTaskItem = () => {
    setFormData((f) => ({ ...f, items: [...f.items, emptyTaskLine()] }));
  };

  const removeTaskItem = (index) => {
    setFormData((f) => {
      if (f.items.length <= 1) return f;
      return { ...f, items: f.items.filter((_, i) => i !== index) };
    });
  };

  const openAssignModal = () => {
    setFormData(emptyForm());
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.employee) {
      alert('Select an employee');
      return;
    }
    if (!formData.startDate || !formData.dueDate) {
      alert('Date of issue and deadline are required');
      return;
    }
    if (formData.dueDate < formData.startDate) {
      alert('Deadline must be on or after the date of issue');
      return;
    }

    const validItems = formData.items
      .map((item) => ({
        title: String(item.title || '').trim(),
        description: String(item.description || '').trim(),
        priority: item.priority || 'Medium',
      }))
      .filter((item) => item.title);

    if (validItems.length === 0) {
      alert('Add at least one task with a heading');
      return;
    }

    try {
      setAssigning(true);
      await Promise.all(
        validItems.map((item) =>
          hrTasksAPI.create({
            employee: formData.employee,
            startDate: formData.startDate,
            dueDate: formData.dueDate,
            title: item.title,
            description: item.description,
            priority: item.priority,
          })
        )
      );
      setShowModal(false);
      setFormData(emptyForm());
      fetchTasks();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to assign task(s)');
    } finally {
      setAssigning(false);
    }
  };

  const handleDelete = async (task) => {
    if (!window.confirm(`Delete task "${task.title}"?`)) return;
    try {
      await hrTasksAPI.delete(task._id);
      fetchTasks();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to delete task');
    }
  };

  const handleStatusChange = async (taskId, status) => {
    try {
      await hrTasksAPI.updateStatus(taskId, status);
      fetchTasks();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to update status');
    }
  };

  return (
    <div className="hr-page">
      <header className="hr-page-header">
        <div>
          <h1>Assign Task</h1>
          <p className="hr-page-subtitle">Assign tasks to employees with a deadline</p>
        </div>
        <button type="button" className="hr-btn hr-btn-primary" onClick={openAssignModal}>
          + Assign Task
        </button>
      </header>

      <div className="hr-worklog-filters">
        <div className="hr-period-toggle">
          {HR_PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={filters.period === opt.id ? 'active' : ''}
              onClick={() => handlePeriodChange(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="hr-filters-row hr-worklog-filter-row">
          {filters.period === 'custom' && (
            <>
              <input
                type="date"
                className="hr-filter-select"
                value={filters.fromDate}
                max={filters.toDate || undefined}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, period: 'custom', fromDate: e.target.value }))
                }
                title="From date"
              />
              <input
                type="date"
                className="hr-filter-select"
                value={filters.toDate}
                min={filters.fromDate || undefined}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, period: 'custom', toDate: e.target.value }))
                }
                title="To date"
              />
            </>
          )}
          <select
            className="hr-filter-select"
            value={filters.employee}
            onChange={(e) => setFilters((f) => ({ ...f, employee: e.target.value }))}
          >
            <option value="">All Employees</option>
            {employees.map((emp) => (
              <option key={emp._id} value={emp._id}>
                {employeeName(emp)} ({emp.employeeId})
              </option>
            ))}
          </select>
          <select
            className="hr-filter-select"
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          >
            <option value="">All Status</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <p className="hr-worklog-period-hint">
          Showing: <strong>{periodLabel}</strong>
        </p>
      </div>

      {loading ? (
        <div className="hr-loading">Loading tasks...</div>
      ) : (
        <div className="hr-table-card">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Date of Issue</th>
                <th>Deadline</th>
                <th>Employee</th>
                <th>Task</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Task Update</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {taskGroups.length === 0 ? (
                <tr><td colSpan={8} className="hr-empty">No tasks found for the selected period</td></tr>
              ) : (
                taskGroups.flatMap((group) =>
                  group.tasks.map((task, index) => (
                    <tr
                      key={task._id}
                      className={taskRowClass(task.status)}
                    >
                      {index === 0 ? (
                        <td
                          className="hr-task-issue-date"
                          rowSpan={group.tasks.length}
                        >
                          {group.dateLabel}
                        </td>
                      ) : null}
                      <td>{formatDate(task.dueDate)}</td>
                      <td>{employeeName(task.employee)}</td>
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
                            onClick={() => setViewTask(task)}
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
                        <div className="hr-actions-cell" onClick={(e) => e.stopPropagation()}>
                          <select
                            className="hr-filter-select hr-btn-sm"
                            value={task.status}
                            onChange={(e) => handleStatusChange(task._id, e.target.value)}
                            aria-label="Change status"
                          >
                            {STATUS_OPTIONS.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="hr-btn hr-btn-danger hr-btn-sm"
                            onClick={() => handleDelete(task)}
                          >
                            Delete
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
                  <span className="hr-muted">Employee</span>
                  <strong>{employeeName(viewTask.employee)}</strong>
                </div>
                <div>
                  <span className="hr-muted">Status</span>
                  <HrStatusBadge status={viewTask.status} />
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
                  <span className="hr-muted">Priority</span>
                  <strong>{viewTask.priority}</strong>
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
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="hr-modal-overlay" onClick={() => !assigning && setShowModal(false)}>
          <div className="hr-modal hr-modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="hr-modal-header">
              <h2>Assign Tasks</h2>
              <button
                type="button"
                className="hr-modal-close"
                onClick={() => !assigning && setShowModal(false)}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="hr-modal-body">
                <p className="hr-page-subtitle" style={{ marginBottom: '1rem' }}>
                  Set employee and dates once, then add multiple task headings for the same day.
                </p>
                <div className="hr-form-grid">
                  <div className="hr-form-group">
                    <label>Date of Issue</label>
                    <input
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => {
                        const startDate = e.target.value;
                        setFormData((f) => ({
                          ...f,
                          startDate,
                          dueDate: f.dueDate < startDate ? startDate : f.dueDate,
                        }));
                      }}
                      required
                    />
                  </div>
                  <div className="hr-form-group">
                    <label>Deadline</label>
                    <input
                      type="date"
                      value={formData.dueDate}
                      min={formData.startDate}
                      onChange={(e) => setFormData((f) => ({ ...f, dueDate: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="hr-form-group hr-form-group-full">
                    <label>Employee <span className="required">*</span></label>
                    <select
                      value={formData.employee}
                      onChange={(e) => setFormData((f) => ({ ...f, employee: e.target.value }))}
                      required
                    >
                      <option value="">Select employee</option>
                      {employees.map((emp) => (
                        <option key={emp._id} value={emp._id}>
                          {employeeName(emp)} ({emp.employeeId})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="hr-assign-tasks-block">
                  <div className="hr-assign-tasks-header">
                    <h3>Tasks for this day</h3>
                    <button type="button" className="hr-btn hr-btn-secondary hr-btn-sm" onClick={addTaskItem}>
                      + Add another task
                    </button>
                  </div>

                  {formData.items.map((item, index) => (
                    <div key={item.key} className="hr-assign-task-card">
                      <div className="hr-assign-task-card-top">
                        <span className="hr-assign-task-num">Task {index + 1}</span>
                        {formData.items.length > 1 && (
                          <button
                            type="button"
                            className="hr-link danger"
                            onClick={() => removeTaskItem(index)}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <div className="hr-form-grid">
                        <div className="hr-form-group hr-form-group-full">
                          <label>Heading <span className="required">*</span></label>
                          <input
                            type="text"
                            value={item.title}
                            onChange={(e) => updateTaskItem(index, 'title', e.target.value)}
                            placeholder="Task heading / title"
                            required={index === 0}
                          />
                        </div>
                        <div className="hr-form-group hr-form-group-full">
                          <label>Details (optional)</label>
                          <textarea
                            rows={2}
                            value={item.description}
                            onChange={(e) => updateTaskItem(index, 'description', e.target.value)}
                            placeholder="Add details if needed"
                          />
                        </div>
                        <div className="hr-form-group">
                          <label>Priority</label>
                          <select
                            value={item.priority}
                            onChange={(e) => updateTaskItem(index, 'priority', e.target.value)}
                          >
                            {PRIORITY_OPTIONS.map((p) => (
                              <option key={p} value={p}>{p}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="hr-modal-footer">
                <button
                  type="button"
                  className="hr-btn hr-btn-secondary"
                  disabled={assigning}
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="hr-btn hr-btn-primary" disabled={assigning}>
                  {assigning
                    ? 'Assigning…'
                    : formData.items.filter((i) => i.title.trim()).length > 1
                      ? `Assign ${formData.items.filter((i) => i.title.trim()).length} Tasks`
                      : 'Assign Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default EmployeeTasks;
