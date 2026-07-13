import React, { useCallback, useEffect, useRef, useState } from 'react';
import { employeeChatAPI } from '../services/employeeChatApi';
import '../pages/EmployeeChat.css';

const POLL_MS = 6000;

function EmployeeChatNotifications() {
  const [popups, setPopups] = useState([]);
  const seenIdsRef = useRef(new Set());

  const dismissPopup = useCallback(async (notification, markRead = true) => {
    setPopups((prev) => prev.filter((item) => item._id !== notification._id));
    if (markRead) {
      try {
        await employeeChatAPI.markNotificationRead(notification._id);
      } catch (error) {
        console.error('Error marking notification read:', error);
      }
    }
  }, []);

  const pollNotifications = useCallback(async () => {
    try {
      const response = await employeeChatAPI.getNotifications();
      const unread = response.data || [];
      const fresh = unread.filter((item) => !seenIdsRef.current.has(item._id));

      if (fresh.length === 0) return;

      fresh.forEach((item) => seenIdsRef.current.add(item._id));
      setPopups((prev) => {
        const existing = new Set(prev.map((item) => item._id));
        const merged = [...prev];
        fresh.forEach((item) => {
          if (!existing.has(item._id)) merged.push(item);
        });
        return merged.slice(-4);
      });
    } catch (error) {
      console.error('Error polling chat notifications:', error);
    }
  }, []);

  useEffect(() => {
    pollNotifications();
    const timer = setInterval(pollNotifications, POLL_MS);
    return () => clearInterval(timer);
  }, [pollNotifications]);

  useEffect(() => {
    if (popups.length === 0) return undefined;

    const timers = popups.map((popup) =>
      setTimeout(() => {
        dismissPopup(popup, true);
      }, 12000)
    );

    return () => timers.forEach(clearTimeout);
  }, [popups, dismissPopup]);

  if (popups.length === 0) return null;

  return (
    <div className="ed-chat-notification-stack" aria-live="polite">
      {popups.map((popup) => (
        <div key={popup._id} className="ed-chat-notification-popup">
          <div className="ed-chat-notification-header">
            <span className="ed-chat-notification-badge">Mention</span>
            <button
              type="button"
              className="ed-chat-notification-close"
              aria-label="Dismiss notification"
              onClick={() => dismissPopup(popup, true)}
            >
              ×
            </button>
          </div>
          <strong>{popup.senderName} mentioned you</strong>
          <p>{popup.bodyPreview}</p>
        </div>
      ))}
    </div>
  );
}

export default EmployeeChatNotifications;
