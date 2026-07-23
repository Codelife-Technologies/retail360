import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { employeeWorkLogsAPI } from '../services/employeeDashboardApi';
import EmployeeContextGate, { EmployeeWelcome } from '../components/EmployeeContextGate';
import HrStatusBadge from '../../hr/components/HrStatusBadge';
import {
  extractList,
  formatDate,
  formatDuration,
  minutesFromHoursAndMinutes,
  toInputDate,
  todayInputDate,
  getCurrentWeekRange,
} from '../../hr/utils/hrUtils';

const emptyEntry = () => ({ description: '', details: '', hours: '', minutes: '' });

function entriesFromLog(log) {
  if (!log?.entries?.length) return [];
  return log.entries.map((entry) => ({
    description: entry.description || '',
    details: entry.details || '',
    hours: String(Math.floor((entry.timeSpentMinutes || 0) / 60) || ''),
    minutes: String((entry.timeSpentMinutes || 0) % 60 || ''),
  }));
}

function buildPayload(date, entries, notes, status) {
  const validEntries = entries
    .map((entry) => ({
      description: entry.description.trim(),
      details: String(entry.details || '').trim(),
      timeSpentMinutes: minutesFromHoursAndMinutes(entry.hours, entry.minutes),
    }))
    .filter((entry) => entry.description && entry.timeSpentMinutes > 0);

  return {
    date,
    notes,
    status,
    entries: validEntries,
  };
}

function isValidEntry(entry) {
  return entry.description.trim() && minutesFromHoursAndMinutes(entry.hours, entry.minutes) > 0;
}

function EmployeeWorkLogContent({ employeeId }) {
  const [selectedDate, setSelectedDate] = useState(() => todayInputDate());
  const [tasks, setTasks] = useState([]);
  const [newTask, setNewTask] = useState(emptyEntry());
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('Draft');
  const [logId, setLogId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [recentLogs, setRecentLogs] = useState([]);
  const loadRequestIdRef = useRef(0);
  const logIdRef = useRef(null);

  const totalMinutes = useMemo(
    () => tasks.reduce((sum, entry) => sum + minutesFromHoursAndMinutes(entry.hours, entry.minutes), 0),
    [tasks]
  );

  const isSubmitted = status === 'Submitted';
  const isToday = selectedDate === todayInputDate();

  useEffect(() => {
    logIdRef.current = logId;
  }, [logId]);

  const loadLogForDate = useCallback(async (date) => {
    const requestId = ++loadRequestIdRef.current;

    if (!employeeId) {
      if (requestId !== loadRequestIdRef.current) return;
      setLogId(null);
      setTasks([]);
      setNewTask(emptyEntry());
      setNotes('');
      setStatus('Draft');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const response = await employeeWorkLogsAPI.getByDate(date);
      // Ignore stale responses so a slow getByDate cannot wipe a just-saved logId/tasks.
      if (requestId !== loadRequestIdRef.current) return;

      const log = response.data;
      if (log) {
        setLogId(log._id);
        setTasks(entriesFromLog(log));
        setNotes(log.notes || '');
        setStatus(log.status || 'Draft');
      } else {
        setLogId(null);
        setTasks([]);
        setNotes('');
        setStatus('Draft');
      }
      setNewTask(emptyEntry());
    } catch (error) {
      if (requestId !== loadRequestIdRef.current) return;
      console.error('Error loading work log:', error);
      setLogId(null);
      setTasks([]);
      setNewTask(emptyEntry());
      setNotes('');
      setStatus('Draft');
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [employeeId]);

  const loadRecentLogs = useCallback(async () => {
    if (!employeeId) {
      setRecentLogs([]);
      return;
    }

    try {
      const week = getCurrentWeekRange();
      const response = await employeeWorkLogsAPI.getAll({
        employee: employeeId,
        fromDate: week.fromDate,
        toDate: week.toDate,
        limit: 20,
      });
      setRecentLogs(extractList(response));
    } catch (error) {
      setRecentLogs([]);
    }
  }, [employeeId]);

  // Default to current calendar day when the employee context becomes available.
  useEffect(() => {
    setSelectedDate(todayInputDate());
  }, [employeeId]);

  useEffect(() => {
    loadLogForDate(selectedDate);
  }, [selectedDate, loadLogForDate]);

  useEffect(() => {
    loadRecentLogs();
  }, [loadRecentLogs]);

  const persistLog = async (nextTasks, nextNotes, nextStatus) => {
    // Bump request id so any in-flight getByDate cannot overwrite this save.
    loadRequestIdRef.current += 1;

    const payload = {
      ...buildPayload(selectedDate, nextTasks, nextNotes, nextStatus),
      employee: employeeId,
    };

    const existingId = logIdRef.current;
    let response;
    try {
      response = existingId
        ? await employeeWorkLogsAPI.update(existingId, payload)
        : await employeeWorkLogsAPI.save(payload);
    } catch (error) {
      // Stale id after refresh/race — create/upsert via POST instead.
      if (existingId && error.response?.status === 404) {
        response = await employeeWorkLogsAPI.save(payload);
      } else {
        throw error;
      }
    }

    setLogId(response.data._id);
    setStatus(response.data.status);
    setTasks(entriesFromLog(response.data));
    setNotes(response.data.notes || '');
    await loadRecentLogs();
    return response.data;
  };

  const handleAddTask = async () => {
    if (!employeeId) {
      alert('Employee profile not linked. Ask HR to link your user account.');
      return;
    }

    if (!isValidEntry(newTask)) {
      alert('Enter the task name and time taken before adding.');
      return;
    }

    const nextTasks = [...tasks, { ...newTask }];

    try {
      setAddingTask(true);
      const wasSubmitted = status === 'Submitted';
      await persistLog(nextTasks, notes, 'Draft');
      setNewTask(emptyEntry());
      setShowAddModal(false);
      if (wasSubmitted) {
        alert('Task added. Submit again when you are done for the day.');
      }
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to add task');
    } finally {
      setAddingTask(false);
    }
  };

  const openAddModal = () => {
    setNewTask(emptyEntry());
    setShowAddModal(true);
  };

  const closeAddModal = () => {
    if (addingTask) return;
    setShowAddModal(false);
    setNewTask(emptyEntry());
  };

  const handleRemoveTask = async (index) => {
    if (!window.confirm('Remove this task from today\'s log?')) return;

    const nextTasks = tasks.filter((_, i) => i !== index);

    try {
      setSaving(true);
      if (nextTasks.length === 0) {
        if (logId) {
          await employeeWorkLogsAPI.delete(logId);
        }
        setLogId(null);
        setTasks([]);
        setStatus('Draft');
        setNewTask(emptyEntry());
        await loadRecentLogs();
      } else {
        await persistLog(nextTasks, notes, 'Draft');
      }
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to remove task');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!employeeId) {
      alert('Employee profile not linked. Ask HR to link your user account.');
      return;
    }

    if (tasks.length === 0) {
      alert('Use + Add Task Done to add at least one task before saving.');
      return;
    }

    try {
      setSaving(true);
      await persistLog(tasks, notes, 'Draft');
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to save work log');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!employeeId) {
      alert('Employee profile not linked. Ask HR to link your user account.');
      return;
    }

    if (tasks.length === 0) {
      alert('Use + Add Task Done to add at least one task before submitting.');
      return;
    }

    try {
      setSaving(true);
      await persistLog(tasks, notes, 'Submitted');
      alert('Daily work log submitted successfully.');
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to submit work log');
    } finally {
      setSaving(false);
    }
  };

  const updateNewTask = (field, value) => {
    setNewTask((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <>
      <header className="ed-section-header">
        <div>
          <h2>Daily Work Log</h2>
          <p>Log the work you completed today — add each task with details and time taken.</p>
        </div>
        <button
          type="button"
          className="ed-btn ed-btn-primary"
          disabled={loading}
          onClick={openAddModal}
        >
          + Add Task Done
        </button>
      </header>

      <div className="ed-worklog-toolbar">
        <label className="ed-worklog-date-field">
          <span>Date</span>
          <input
            type="date"
            value={selectedDate}
            max={todayInputDate()}
            onChange={(e) => setSelectedDate(e.target.value || todayInputDate())}
          />
        </label>
        <div className="ed-worklog-summary">
          <span className="ed-card-label">Tasks</span>
          <strong className="ed-worklog-total">{tasks.length}</strong>
          <span className="ed-card-label">Total time</span>
          <strong className="ed-worklog-total">{formatDuration(totalMinutes)}</strong>
          <HrStatusBadge status={status} />
        </div>
      </div>

      {loading ? (
        <div className="ed-loading">Loading work log...</div>
      ) : (
        <div className="ed-card ed-worklog-form-card">
          <div className="ed-worklog-form-header">
            <h2>{isToday ? "Today's tasks" : `Tasks for ${formatDate(selectedDate)}`}</h2>
            {isSubmitted && (
              <p className="ed-worklog-locked-note">
                Submitted tasks are locked. Use <strong>Add Task Done</strong> to log more work, then submit again.
              </p>
            )}
          </div>

          <section className="ed-worklog-task-list-section">
            <div className="ed-worklog-task-list-header">
              <h3>Tasks logged</h3>
              <span>{tasks.length} task{tasks.length === 1 ? '' : 's'}</span>
            </div>

            {tasks.length === 0 ? (
              <div className="ed-worklog-empty-cta">
                <p className="ed-empty ed-worklog-no-tasks">
                  No tasks yet. Click <strong>+ Add Task Done</strong> above to log work.
                </p>
              </div>
            ) : (
              <ul className="ed-worklog-task-list">
                {tasks.map((task, index) => (
                  <li key={`task-${index}-${task.description}`} className="ed-worklog-task-item">
                    <span className="ed-worklog-task-number">#{index + 1}</span>
                    <div className="ed-worklog-task-content">
                      <strong>{task.description}</strong>
                      {task.details ? (
                        <small className="ed-worklog-task-details">{task.details}</small>
                      ) : null}
                      <span>{formatDuration(minutesFromHoursAndMinutes(task.hours, task.minutes))}</span>
                    </div>
                    {!isSubmitted && (
                      <button
                        type="button"
                        className="ed-btn ed-btn-danger-outline ed-worklog-remove"
                        onClick={() => handleRemoveTask(index)}
                        disabled={saving}
                      >
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {!isSubmitted && (
            <div className="ed-worklog-actions">
              <button
                type="button"
                className="ed-btn ed-btn-secondary"
                disabled={saving || addingTask}
                onClick={handleSaveDraft}
              >
                {saving ? 'Saving…' : 'Save Draft'}
              </button>
              <button
                type="button"
                className="ed-btn ed-btn-primary"
                disabled={saving || addingTask || tasks.length === 0}
                onClick={handleSubmit}
              >
                {saving ? 'Submitting…' : 'Submit for the day'}
              </button>
            </div>
          )}
          {isSubmitted && (
            <div className="ed-worklog-actions">
              <button
                type="button"
                className="ed-btn ed-btn-primary"
                disabled={saving || addingTask || tasks.length === 0}
                onClick={handleSubmit}
              >
                {saving ? 'Submitting…' : 'Submit again'}
              </button>
            </div>
          )}
        </div>
      )}

      {showAddModal && (
        <div className="hr-modal-overlay" onClick={closeAddModal}>
          <div className="hr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="hr-modal-header">
              <h2>Add Task Done</h2>
              <button type="button" className="hr-modal-close" onClick={closeAddModal}>×</button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAddTask();
              }}
            >
              <div className="hr-modal-body">
                <p className="hr-page-subtitle" style={{ marginBottom: '0.85rem' }}>
                  {isToday ? 'Logging work for today' : `Logging work for ${formatDate(selectedDate)}`}
                </p>
                <div className="hr-form-grid">
                  <div className="hr-form-group hr-form-group-full">
                    <label>Task <span className="required">*</span></label>
                    <input
                      type="text"
                      value={newTask.description}
                      onChange={(e) => updateNewTask('description', e.target.value)}
                      placeholder="What did you complete?"
                      autoFocus
                      required
                    />
                  </div>
                  <div className="hr-form-group hr-form-group-full">
                    <label>Details (optional)</label>
                    <textarea
                      rows={3}
                      value={newTask.details}
                      onChange={(e) => updateNewTask('details', e.target.value)}
                      placeholder="Add more context if needed"
                    />
                  </div>
                  <div className="hr-form-group">
                    <label>Hours</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={newTask.hours}
                      onChange={(e) => updateNewTask('hours', e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div className="hr-form-group">
                    <label>Minutes</label>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      step="1"
                      value={newTask.minutes}
                      onChange={(e) => updateNewTask('minutes', e.target.value)}
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>
              <div className="hr-modal-footer">
                <button
                  type="button"
                  className="hr-btn hr-btn-secondary"
                  disabled={addingTask}
                  onClick={closeAddModal}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="hr-btn hr-btn-primary"
                  disabled={addingTask || saving}
                >
                  {addingTask ? 'Adding…' : 'Add Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <section className="ed-worklog-history">
        <h2>This week&apos;s logs</h2>
        {recentLogs.length === 0 ? (
          <p className="ed-empty">No work logs for this week yet.</p>
        ) : (
          <div className="ed-worklog-history-list">
            {recentLogs.map((log) => (
              <button
                key={log._id}
                type="button"
                className={`ed-worklog-history-item${selectedDate === toInputDate(log.date) ? ' active' : ''}`}
                onClick={() => setSelectedDate(toInputDate(log.date))}
              >
                <div>
                  <strong>{formatDate(log.date)}</strong>
                  <span>{log.entries?.length || 0} tasks · {formatDuration(log.totalMinutes)}</span>
                </div>
                <HrStatusBadge status={log.status} />
              </button>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function EmployeeWorkLog() {
  return (
    <EmployeeContextGate>
      {(context) => (
        <div className="hr-page ed-page">
          <EmployeeWelcome employee={context.employee} />
          <EmployeeWorkLogContent employeeId={context.employeeId} />
        </div>
      )}
    </EmployeeContextGate>
  );
}

export default EmployeeWorkLog;
