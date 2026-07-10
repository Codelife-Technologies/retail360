import React, { useCallback, useEffect, useState } from 'react';
import { hrTasksAPI, hrEmployeesAPI } from '../services/hrApi';
import HrStatusBadge from '../components/HrStatusBadge';
import { extractList, formatDate, employeeName, toInputDate } from '../utils/hrUtils';

const PRIORITY_OPTIONS = ['Low', 'Medium', 'High'];
const STATUS_OPTIONS = ['Pending', 'In Progress', 'Completed'];

const emptyForm = () => ({
  employee: '',
  title: '',
  description: '',
  startDate: toInputDate(new Date()),
  dueDate: toInputDate(new Date()),
  priority: 'Medium',
});

function EmployeeTasks() {
  const [tasks, setTasks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState(emptyForm());
  const [filters, setFilters] = useState({ employee: '', status: '', source: '' });

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (filters.employee) params.employee = filters.employee;
      if (filters.status) params.status = filters.status;
      if (filters.source) params.source = filters.source;
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.employee || !formData.title.trim()) {
      alert('Employee and title are required');
      return;
    }
    try {
      await hrTasksAPI.create(formData);
      setShowModal(false);
      setFormData(emptyForm());
      fetchTasks();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to assign task');
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
          <p className="hr-page-subtitle">Assign tasks to employees with a start and due timeline</p>
        </div>
        <button type="button" className="hr-btn hr-btn-primary" onClick={() => setShowModal(true)}>
          + Assign Task
        </button>
      </header>

      <div className="hr-filters-row">
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
        <select
          className="hr-filter-select"
          value={filters.source}
          onChange={(e) => setFilters((f) => ({ ...f, source: e.target.value }))}
        >
          <option value="">All Sources</option>
          <option value="HR">HR Assigned</option>
          <option value="Personal">Personal</option>
        </select>
      </div>

      {loading ? (
        <div className="hr-loading">Loading tasks...</div>
      ) : (
        <div className="hr-table-card">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Task</th>
                <th>Timeline</th>
                <th>Priority</th>
                <th>Source</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 ? (
                <tr><td colSpan={7} className="hr-empty">No tasks found</td></tr>
              ) : (
                tasks.map((task) => (
                  <tr key={task._id}>
                    <td>{employeeName(task.employee)}</td>
                    <td>
                      <strong>{task.title}</strong>
                      {task.description && (
                        <div className="hr-task-desc-inline">{task.description}</div>
                      )}
                    </td>
                    <td>
                      {formatDate(task.startDate || task.dueDate)}
                      {' → '}
                      {formatDate(task.dueDate)}
                    </td>
                    <td>{task.priority}</td>
                    <td>{task.source || 'HR'}</td>
                    <td><HrStatusBadge status={task.status} /></td>
                    <td>
                      <div className="hr-actions-cell">
                        <select
                          className="hr-filter-select hr-btn-sm"
                          value={task.status}
                          onChange={(e) => handleStatusChange(task._id, e.target.value)}
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
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="hr-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="hr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="hr-modal-header">
              <h2>Assign Task</h2>
              <button type="button" className="hr-modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="hr-modal-body">
                <div className="hr-form-grid">
                  <div className="hr-form-group">
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
                  <div className="hr-form-group">
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
                  <div className="hr-form-group hr-form-group-full">
                    <label>Title <span className="required">*</span></label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData((f) => ({ ...f, title: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="hr-form-group hr-form-group-full">
                    <label>Description</label>
                    <textarea
                      rows={3}
                      value={formData.description}
                      onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
                    />
                  </div>
                  <div className="hr-form-group">
                    <label>Start Date</label>
                    <input
                      type="date"
                      value={formData.startDate}
                      onChange={(e) => setFormData((f) => ({ ...f, startDate: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="hr-form-group">
                    <label>Due Date</label>
                    <input
                      type="date"
                      value={formData.dueDate}
                      min={formData.startDate}
                      onChange={(e) => setFormData((f) => ({ ...f, dueDate: e.target.value }))}
                      required
                    />
                  </div>
                </div>
              </div>
              <div className="hr-modal-footer">
                <button type="button" className="hr-btn hr-btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="hr-btn hr-btn-primary">Assign Task</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default EmployeeTasks;
