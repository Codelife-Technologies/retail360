import React, { useCallback, useEffect, useState } from 'react';
import { employeeTasksAPI } from '../services/employeeDashboardApi';
import EmployeeContextGate, { EmployeeWelcome } from '../components/EmployeeContextGate';

const STATUS_OPTIONS = ['Pending', 'In Progress', 'Completed'];

function EmployeeTasksContent() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);
      const response = await employeeTasksAPI.getToday();
      setTasks(response.data || []);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

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

  return (
    <>
      <header className="ed-section-header">
        <div>
          <h2>Task of the Day</h2>
          <p>Complete your assigned tasks for today.</p>
        </div>
      </header>

      {loading ? (
        <div className="ed-loading">Loading tasks...</div>
      ) : tasks.length === 0 ? (
        <div className="ed-empty-panel">No tasks due today. You&apos;re all caught up!</div>
      ) : (
        <div className="ed-task-cards">
          {tasks.map((task) => (
            <article key={task._id} className={`ed-task-card priority-${task.priority?.toLowerCase()}`}>
              <div className="ed-task-card-header">
                <h3>{task.title}</h3>
                <span className="ed-task-priority">{task.priority}</span>
              </div>
              {task.description && <p className="ed-task-desc">{task.description}</p>}
              <p className="ed-task-meta">Assigned by {task.assignedBy || 'HR'}</p>
              <div className="ed-task-actions">
                <select
                  value={task.status}
                  disabled={updatingId === task._id}
                  onChange={(e) => handleStatusChange(task._id, e.target.value)}
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
            </article>
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
        <div className="ed-page">
          <EmployeeWelcome employee={context.employee} />
          <EmployeeTasksContent />
        </div>
      )}
    </EmployeeContextGate>
  );
}

export default EmployeeTasks;
