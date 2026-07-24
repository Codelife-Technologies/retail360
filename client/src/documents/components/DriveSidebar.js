import React from 'react';

const NAV = [
  { id: 'my-drive', label: 'My Drive', icon: '📁', view: 'browse', scopeMode: 'pick' },
  { id: 'ai', label: 'AI Generated Images', icon: '🖼️', view: 'browse', scope: 'AI Generator', permission: 'documents.ai.view' },
  { id: 'employee', label: 'Employee Documents', icon: '📂', view: 'browse', scope: 'Manual Upload', permission: 'documents.manual.view' },
  { id: 'shared', label: 'Shared With Me', icon: '👥', view: 'shared' },
  { id: 'recent', label: 'Recent', icon: '🕒', view: 'recent' },
  { id: 'starred', label: 'Starred', icon: '⭐', view: 'starred' },
  { id: 'trash', label: 'Trash', icon: '🗑️', view: 'trash', permission: 'documents.trash.view' },
  { id: 'storage', label: 'Storage', icon: '💾', view: 'storage', permission: 'documents.analytics.view' },
  { id: 'settings', label: 'Settings', icon: '⚙️', view: 'settings', permission: 'documents.settings.view' },
];

function canSee(item, hasPermission) {
  if (!item.permission) return true;
  if (!hasPermission) return true;
  if (hasPermission('admin.all') || hasPermission('documents.full')) return true;
  if (hasPermission(item.permission)) return true;
  if (hasPermission('documents.view')) return true;
  return false;
}

export default function DriveSidebar({
  activeNav,
  onNavigate,
  scope,
  onScopeChange,
  storageUsedLabel,
  hasPermission,
  starredCount = 0,
}) {
  const items = NAV.filter((item) => canSee(item, hasPermission));

  return (
    <aside className="drive-sidebar" aria-label="Document Management">
      <div className="drive-sidebar-brand">
        <h2>Document Management</h2>
        <p>Digital Asset Library</p>
      </div>

      <nav className="drive-sidebar-nav">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`drive-nav-item${activeNav === item.id ? ' active' : ''}`}
            onClick={() => onNavigate(item)}
          >
            <span className="drive-nav-icon" aria-hidden="true">{item.icon}</span>
            <span className="drive-nav-label">{item.label}</span>
            {item.id === 'starred' && starredCount > 0 ? (
              <span className="drive-nav-badge">{starredCount}</span>
            ) : null}
          </button>
        ))}
      </nav>

      {(activeNav === 'my-drive' || activeNav === 'ai' || activeNav === 'employee') ? (
        <div className="drive-scope-chips">
          <span className="drive-scope-label">Library</span>
          <button
            type="button"
            className={`drive-chip${scope === 'Manual Upload' ? ' active' : ''}`}
            onClick={() => onScopeChange('Manual Upload')}
          >
            Employee
          </button>
          <button
            type="button"
            className={`drive-chip${scope === 'AI Generator' ? ' active' : ''}`}
            onClick={() => onScopeChange('AI Generator')}
          >
            Product images
          </button>
        </div>
      ) : null}

      {storageUsedLabel ? (
        <div className="drive-storage-mini">
          <div className="drive-storage-mini-label">Storage</div>
          <div className="drive-storage-mini-value">{storageUsedLabel}</div>
        </div>
      ) : null}
    </aside>
  );
}
