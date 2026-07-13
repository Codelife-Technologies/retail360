import React, { useCallback, useEffect, useRef, useState } from 'react';
import { employeeChatAPI } from '../services/employeeChatApi';
import EmployeeContextGate, { EmployeeWelcome } from '../components/EmployeeContextGate';
import HrEmployeeAvatar from '../../hr/components/HrEmployeeAvatar';
import './EmployeeChat.css';

const POLL_MS = 8000;
const CHAT_TTL_MS = 2 * 60 * 60 * 1000;

function formatMessageTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function getExpiryLabel(createdAt) {
  const expiresAt = new Date(createdAt).getTime() + CHAT_TTL_MS;
  const remainingMs = expiresAt - Date.now();
  if (remainingMs <= 0) return 'Expiring soon';
  const mins = Math.ceil(remainingMs / 60000);
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return remMins > 0 ? `Deletes in ${hours}h ${remMins}m` : `Deletes in ${hours}h`;
  }
  return `Deletes in ${mins}m`;
}

function renderMessageBody(body, mentions = []) {
  if (!body) return null;
  const mentionNames = mentions.map((m) => m.name).filter(Boolean);
  if (mentionNames.length === 0) return body;

  const pattern = new RegExp(
    `@(${mentionNames.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
    'g'
  );

  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(body)) !== null) {
    if (match.index > lastIndex) {
      parts.push(body.slice(lastIndex, match.index));
    }
    parts.push(
      <span key={`${match.index}-${match[1]}`} className="ed-chat-mention">
        @{match[1]}
      </span>
    );
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < body.length) {
    parts.push(body.slice(lastIndex));
  }

  return parts.length > 0 ? parts : body;
}

function EmployeeChatPanel({ currentEmployeeId }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionCandidates, setMentionCandidates] = useState([]);
  const [selectedMentions, setSelectedMentions] = useState([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const loadMessages = useCallback(async () => {
    try {
      const response = await employeeChatAPI.getMessages();
      const cutoff = Date.now() - CHAT_TTL_MS;
      const fresh = (response.data || []).filter(
        (message) => new Date(message.createdAt).getTime() >= cutoff
      );
      setMessages(fresh);
    } catch (error) {
      console.error('Error loading chat messages:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMessages();
    const timer = setInterval(loadMessages, POLL_MS);
    return () => clearInterval(timer);
  }, [loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!mentionOpen) return undefined;

    const timer = setTimeout(async () => {
      try {
        setMentionLoading(true);
        const response = await employeeChatAPI.getMentionCandidates(mentionQuery);
        setMentionCandidates(
          (response.data || []).filter(
            (candidate) =>
              String(candidate._id) !== String(currentEmployeeId) &&
              !selectedMentions.some((m) => String(m._id) === String(candidate._id))
          )
        );
      } catch (error) {
        console.error('Error loading mention candidates:', error);
        setMentionCandidates([]);
      } finally {
        setMentionLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [mentionOpen, mentionQuery, currentEmployeeId, selectedMentions]);

  const handleDraftChange = (event) => {
    const value = event.target.value;
    setDraft(value);

    const caretPos = event.target.selectionStart ?? value.length;
    const textBeforeCaret = value.slice(0, caretPos);
    const mentionMatch = textBeforeCaret.match(/@([^\s@]*)$/);

    if (mentionMatch) {
      setMentionOpen(true);
      setMentionQuery(mentionMatch[1] || '');
    } else {
      setMentionOpen(false);
      setMentionQuery('');
    }
  };

  const insertMention = (candidate) => {
    const input = inputRef.current;
    const caretPos = input?.selectionStart ?? draft.length;
    const textBeforeCaret = draft.slice(0, caretPos);
    const textAfterCaret = draft.slice(caretPos);
    const mentionMatch = textBeforeCaret.match(/@([^\s@]*)$/);

    if (!mentionMatch) return;

    const beforeMention = textBeforeCaret.slice(0, mentionMatch.index);
    const mentionText = `@${candidate.name} `;
    const nextDraft = `${beforeMention}${mentionText}${textAfterCaret}`;

    setDraft(nextDraft);
    setSelectedMentions((prev) =>
      prev.some((m) => String(m._id) === String(candidate._id)) ? prev : [...prev, candidate]
    );
    setMentionOpen(false);
    setMentionQuery('');

    requestAnimationFrame(() => {
      if (input) {
        input.focus();
        const nextPos = beforeMention.length + mentionText.length;
        input.setSelectionRange(nextPos, nextPos);
      }
    });
  };

  const handleSend = async (event) => {
    event.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || sending) return;

    const mentionedEmployeeIds = selectedMentions.map((m) => m._id);

    try {
      setSending(true);
      await employeeChatAPI.sendMessage(trimmed, mentionedEmployeeIds);
      setDraft('');
      setSelectedMentions([]);
      setMentionOpen(false);
      await loadMessages();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="ed-chat-layout">
      <div className="ed-chat-info-banner">
        Team chat messages auto-delete after <strong>2 hours</strong>. Use <strong>@name</strong> to mention a colleague — they will get an on-screen notification.
      </div>

      <div className="ed-chat-messages">
        {loading ? (
          <div className="ed-loading">Loading chat...</div>
        ) : messages.length === 0 ? (
          <div className="ed-empty">No messages yet. Start the conversation.</div>
        ) : (
          messages.map((message) => {
            const isOwn = String(message.senderEmployee) === String(currentEmployeeId);
            return (
              <article
                key={message._id}
                className={`ed-chat-message${isOwn ? ' own' : ''}`}
              >
                <div className="ed-chat-message-header">
                  <strong>{message.senderName}</strong>
                  <span>{formatMessageTime(message.createdAt)}</span>
                </div>
                <p className="ed-chat-message-body">
                  {renderMessageBody(message.body, message.mentions)}
                </p>
                <span className="ed-chat-message-expiry">{getExpiryLabel(message.createdAt)}</span>
              </article>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="ed-chat-composer" onSubmit={handleSend}>
        {selectedMentions.length > 0 && (
          <div className="ed-chat-selected-mentions">
            {selectedMentions.map((mention) => (
              <span key={mention._id} className="ed-chat-mention-chip">
                @{mention.name}
              </span>
            ))}
          </div>
        )}

        <div className="ed-chat-input-wrap">
          <textarea
            ref={inputRef}
            rows={2}
            value={draft}
            onChange={handleDraftChange}
            placeholder="Type a message… Use @ to mention someone"
            disabled={sending}
          />

          {mentionOpen && (
            <div className="ed-chat-mention-menu">
              {mentionLoading ? (
                <div className="ed-chat-mention-empty">Searching…</div>
              ) : mentionCandidates.length === 0 ? (
                <div className="ed-chat-mention-empty">No employees found</div>
              ) : (
                mentionCandidates.map((candidate) => (
                  <button
                    key={candidate._id}
                    type="button"
                    className="ed-chat-mention-option"
                    onClick={() => insertMention(candidate)}
                  >
                    <HrEmployeeAvatar employee={candidate} size={28} />
                    <span>
                      <strong>{candidate.name}</strong>
                      <small>{candidate.department}</small>
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="ed-chat-composer-actions">
          <button type="submit" className="ed-btn ed-btn-primary" disabled={sending || !draft.trim()}>
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}

function EmployeeChat() {
  return (
    <EmployeeContextGate>
      {(context) => (
        <div className="hr-page ed-page ed-chat-page">
          <EmployeeWelcome employee={context.employee} />
          <EmployeeChatPanel currentEmployeeId={context.employeeId} />
        </div>
      )}
    </EmployeeContextGate>
  );
}

export default EmployeeChat;
