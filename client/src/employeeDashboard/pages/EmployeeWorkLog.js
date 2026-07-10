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
  if (!log?.entries?.length) return [emptyEntry()];
  return log.entries.map((entry) => ({
    description: entry.description || '',
    hours: String(Math.floor((entry.timeSpentMinutes || 0) / 60) || ''),
    minutes: String((entry.timeSpentMinutes || 0) % 60 || ''),
  }));
}

function buildPayload(date, entries, notes, status) {
  return {
    date,
    notes,
    status,
    entries: entries.map((entry) => ({
      description: entry.description.trim(),
      timeSpentMinutes: minutesFromHoursAndMinutes(entry.hours, entry.minutes),
    })),
  };
}

function EmployeeWorkLogContent() {
  const [selectedDate, setSelectedDate] = useState(toInputDate(new Date()));
  const [entries, setEntries] = useState([emptyEntry()]);
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('Draft');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recentLogs, setRecentLogs] = useState([]);

  const totalMinutes = useMemo(
    () => entries.reduce((sum, entry) => sum + minutesFromHoursAndMinutes(entry.hours, entry.minutes), 0),
    [entries]
  );

  const isSubmitted = status === 'Submitted';
  const isToday = selectedDate === toInputDate(new Date());

  const loadLogForDate = useCallback(async (date) => {
    try {
      setLoading(true);
      const response = await employeeWorkLogsAPI.getByDate(date);
      const log = response.data;
      if (log) {
        setEntries(entriesFromLog(log));
        setNotes(log.notes || '');
        setStatus(log.status || 'Draft');
      } else {
        setEntries([emptyEntry()]);
        setNotes('');
        setStatus('Draft');
      }
    } catch (error) {
      console.error('Error loading work log:', error);
      setEntries([emptyEntry()]);
      setNotes('');
      setStatus('Draft');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRecentLogs = useCallback(async () => {
    try {
      const response = await employeeWorkLogsAPI.getAll({ limit: 10 });
      setRecentLogs(extractList(response));
    } catch (error) {
      setRecentLogs([]);
    }
  }, []);

  useEffect(() => {
    loadLogForDate(selectedDate);
  }, [selectedDate, loadLogForDate]);

  useEffect(() => {
    loadRecentLogs();
  }, [loadRecentLogs]);

  const updateEntry = (index, field, value) => {
    setEntries((prev) => prev.map((entry, i) => (i === index ? { ...entry, [field]: value } : entry)));
  };

  const addEntry = () => {
    setEntries((prev) => [...prev, emptyEntry()]);
  };

  const removeEntry = (index) => {
    setEntries((prev) => (prev.length === 1 ? [emptyEntry()] : prev.filter((_, i) => i !== index)));
  };

  const handleSave = async (nextStatus) => {
    const payload = buildPayload(selectedDate, entries, notes, nextStatus);
    if (payload.entries.length === 0) {
      alert('Add at least one work item with description and time spent.');
      return;
    }

    try {
      setSaving(true);
      const response = await employeeWorkLogsAPI.save(payload);
      setStatus(response.data.status);
      setEntries(entriesFromLog(response.data));
      setNotes(response.data.notes || '');
      await loadRecentLogs();
      if (nextStatus === 'Submitted') {
        alert('Daily work log submitted successfully.');
      }
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to save work log');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <header className="ed-section-header">
        <div>
          <h2>Daily Work Log</h2>
          <p>Record what you completed and how long each item took.</p>
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
            <h2>{isToday ? "Today's work" : `Work for ${formatDate(selectedDate)}`}</h2>
            {isSubmitted && (
              <p className="ed-worklog-locked-note">This log is submitted and locked for editing.</p>
            )}
          </div>

          <div className="ed-worklog-entries">
            {entries.map((entry, index) => (
              <div key={`entry-${index}`} className="ed-worklog-entry-row">
                <div className="ed-worklog-entry-main">
                  <label>
                    <span>Work done</span>
                    <input
                      type="text"
                      value={entry.description}
                      disabled={isSubmitted}
                      placeholder="Describe the task or work completed"
                      onChange={(e) => updateEntry(index, 'description', e.target.value)}
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
                      disabled={isSubmitted}
                      value={entry.hours}
                      onChange={(e) => updateEntry(index, 'hours', e.target.value)}
                    />
                  </label>
                  <label>
                    <span>Minutes</span>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      step="1"
                      disabled={isSubmitted}
                      value={entry.minutes}
                      onChange={(e) => updateEntry(index, 'minutes', e.target.value)}
                    />
                  </label>
                </div>
                {!isSubmitted && (
                  <button
                    type="button"
                    className="ed-btn ed-btn-danger-outline ed-worklog-remove"
                    onClick={() => removeEntry(index)}
                    aria-label="Remove entry"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>

          {!isSubmitted && (
            <button type="button" className="ed-btn ed-btn-secondary ed-worklog-add" onClick={addEntry}>
              + Add another task
            </button>
          )}

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
                disabled={saving}
                onClick={() => handleSave('Draft')}
              >
                {saving ? 'Saving…' : 'Save Draft'}
              </button>
              <button
                type="button"
                className="ed-btn ed-btn-primary"
                disabled={saving}
                onClick={() => handleSave('Submitted')}
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
        <div className="ed-page">
          <EmployeeWelcome employee={context.employee} />
          <EmployeeWorkLogContent />
        </div>
      )}
    </EmployeeContextGate>
  );
}

export default EmployeeWorkLog;
