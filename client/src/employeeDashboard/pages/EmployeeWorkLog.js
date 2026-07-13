import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { employeeWorkLogsAPI } from '../services/employeeDashboardApi';
import EmployeeContextGate, { EmployeeWelcome } from '../components/EmployeeContextGate';
import HrStatusBadge from '../../hr/components/HrStatusBadge';
import {
  extractList,
  formatDate,
  formatDuration,
  minutesFromHoursAndMinutes,
  toInputDate,
} from '../../hr/utils/hrUtils';

const emptyEntry = () => ({ description: '', hours: '', minutes: '' });

function entriesFromLog(log) {
  if (!log?.entries?.length) return [];
  return log.entries.map((entry) => ({
    description: entry.description || '',
    hours: String(Math.floor((entry.timeSpentMinutes || 0) / 60) || ''),
    minutes: String((entry.timeSpentMinutes || 0) % 60 || ''),
  }));
}

function buildPayload(date, entries, notes, status) {
  const validEntries = entries
    .map((entry) => ({
      description: entry.description.trim(),
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
  const [selectedDate, setSelectedDate] = useState(toInputDate(new Date()));
  const [tasks, setTasks] = useState([]);
  const [newTask, setNewTask] = useState(emptyEntry());
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('Draft');
  const [logId, setLogId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [recentLogs, setRecentLogs] = useState([]);

  const totalMinutes = useMemo(
    () => tasks.reduce((sum, entry) => sum + minutesFromHoursAndMinutes(entry.hours, entry.minutes), 0),
    [tasks]
  );

  const isSubmitted = status === 'Submitted';
  const isToday = selectedDate === toInputDate(new Date());

  const loadLogForDate = useCallback(async (date) => {
    if (!employeeId) {
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
      const response = await employeeWorkLogsAPI.getByDate(date, employeeId);
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
      console.error('Error loading work log:', error);
      setLogId(null);
      setTasks([]);
      setNewTask(emptyEntry());
      setNotes('');
      setStatus('Draft');
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  const loadRecentLogs = useCallback(async () => {
    if (!employeeId) {
      setRecentLogs([]);
      return;
    }

    try {
      const response = await employeeWorkLogsAPI.getAll({ employee: employeeId, limit: 10 });
      setRecentLogs(extractList(response));
    } catch (error) {
      setRecentLogs([]);
    }
  }, [employeeId]);

  useEffect(() => {
    loadLogForDate(selectedDate);
  }, [selectedDate, loadLogForDate]);

  useEffect(() => {
    loadRecentLogs();
  }, [loadRecentLogs]);

  const persistLog = async (nextTasks, nextNotes, nextStatus) => {
    const payload = {
      ...buildPayload(selectedDate, nextTasks, nextNotes, nextStatus),
      employee: employeeId,
    };

    const response = await employeeWorkLogsAPI.save(payload);
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
      alert('Enter the task description and time spent before adding.');
      return;
    }

    const nextTasks = [...tasks, { ...newTask }];

    try {
      setAddingTask(true);
      const wasSubmitted = status === 'Submitted';
      await persistLog(nextTasks, notes, 'Draft');
      setNewTask(emptyEntry());
      if (wasSubmitted) {
        alert('Task added. Submit again when you are done for the day.');
      }
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to add task');
    } finally {
      setAddingTask(false);
    }
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

    if (tasks.length === 0 && !isValidEntry(newTask)) {
      alert('Add at least one task before saving.');
      return;
    }

    const nextTasks = isValidEntry(newTask) ? [...tasks, { ...newTask }] : tasks;

    try {
      setSaving(true);
      await persistLog(nextTasks, notes, 'Draft');
      setNewTask(emptyEntry());
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

    const pendingTask = isValidEntry(newTask);
    const allTasks = pendingTask ? [...tasks, { ...newTask }] : tasks;

    if (allTasks.length === 0) {
      alert('Add at least one task before submitting for the day.');
      return;
    }

    if (pendingTask) {
      const confirmed = window.confirm(
        'You have an unsaved task in the form. It will be included when you submit.'
      );
      if (!confirmed) return;
    }

    try {
      setSaving(true);
      await persistLog(allTasks, notes, 'Submitted');
      setNewTask(emptyEntry());
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
          <p>Add multiple tasks for the same day. You can add more tasks even after submitting.</p>
        </div>
      </header>

      <div className="ed-worklog-toolbar">
        <label className="ed-worklog-date-field">
          <span>Date</span>
          <input
            type="date"
            value={selectedDate}
            max={toInputDate(new Date())}
            onChange={(e) => setSelectedDate(e.target.value)}
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
                Submitted tasks are locked. Add more tasks below, then submit again when you are done for the day.
              </p>
            )}
          </div>

          <section className="ed-worklog-task-list-section">
            <div className="ed-worklog-task-list-header">
              <h3>Tasks logged</h3>
              <span>{tasks.length} task{tasks.length === 1 ? '' : 's'}</span>
            </div>

            {tasks.length === 0 ? (
              <p className="ed-empty ed-worklog-no-tasks">No tasks added yet for this day.</p>
            ) : (
              <ul className="ed-worklog-task-list">
                {tasks.map((task, index) => (
                  <li key={`task-${index}-${task.description}`} className="ed-worklog-task-item">
                    <span className="ed-worklog-task-number">#{index + 1}</span>
                    <div className="ed-worklog-task-content">
                      <strong>{task.description}</strong>
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

          <section className="ed-worklog-add-section">
            <h3>{isSubmitted ? 'Add another task for this day' : 'Add another task'}</h3>
            <div className="ed-worklog-entry-row ed-worklog-new-task-row">
              <div className="ed-worklog-entry-main">
                <label>
                  <span>Task description</span>
                  <input
                    type="text"
                    value={newTask.description}
                    placeholder="What did you work on?"
                    onChange={(e) => updateNewTask('description', e.target.value)}
                  />
                </label>
              </div>
              <div className="ed-worklog-entry-time">
                <label>
                  <span>Hours</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={newTask.hours}
                    onChange={(e) => updateNewTask('hours', e.target.value)}
                  />
                </label>
                <label>
                  <span>Minutes</span>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    step="1"
                    value={newTask.minutes}
                    onChange={(e) => updateNewTask('minutes', e.target.value)}
                  />
                </label>
              </div>
              <button
                type="button"
                className="ed-btn ed-btn-primary ed-worklog-add-task-btn"
                disabled={addingTask || saving}
                onClick={handleAddTask}
              >
                {addingTask ? 'Adding…' : '+ Add Task'}
              </button>
            </div>
          </section>

          <label className="ed-worklog-notes">
            <span>Additional notes (optional)</span>
            <textarea
              rows={3}
              value={notes}
              disabled={isSubmitted}
              placeholder="Any extra context for HR"
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>

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
        </div>
      )}

      <section className="ed-worklog-history">
        <h2>Recent logs</h2>
        {recentLogs.length === 0 ? (
          <p className="ed-empty">No work logs yet.</p>
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
