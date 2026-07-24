import React from 'react';
import { documentsAPI } from '../services/documentsApi';
import { documentIcon, formatBytes, formatDate } from '../utils/documentsUtils';

export default function FileCard({
  item,
  selected,
  starred,
  onOpen,
  onSelect,
  onContextMenu,
  onDragStart,
  dropTarget,
  onDragOver,
  onDragLeave,
  onDrop,
  onRename,
  onShare,
}) {
  const isFolder = item._driveKind === 'folder';
  const thumb = !isFolder
    ? documentsAPI.fileUrl(item.thumbnailUrl || item.fileUrl)
    : item.previewUrl
      ? documentsAPI.fileUrl(item.previewUrl)
      : '';
  const showManage = item.kind !== 'product' && item.canManage !== false;

  return (
    <div
      className={`drive-file-card${selected ? ' selected' : ''}${dropTarget ? ' drop-target' : ''}${starred ? ' starred' : ''}`}
      draggable
      onDragStart={(e) => onDragStart?.(e, item)}
      onDragOver={isFolder ? onDragOver : undefined}
      onDragLeave={isFolder ? onDragLeave : undefined}
      onDrop={isFolder ? (e) => onDrop?.(e, item) : undefined}
      onClick={(e) => onSelect?.(e, item)}
      onDoubleClick={() => onOpen?.(item)}
      onContextMenu={(e) => onContextMenu?.(e, { kind: isFolder ? 'folder' : 'document', item })}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen?.(item);
      }}
    >
      <div className="drive-file-preview">
        {thumb ? (
          <img src={thumb} alt="" loading="lazy" />
        ) : (
          <span className="drive-file-icon">{isFolder ? '📁' : documentIcon(item)}</span>
        )}
        {starred ? <span className="drive-star-badge">★</span> : null}
        {item.isDefault ? <span className="drive-default-badge">Default</span> : null}
        {showManage ? (
          <div className="drive-card-actions">
            <button
              type="button"
              className="drive-card-action"
              title="Rename"
              onClick={(e) => {
                e.stopPropagation();
                onRename?.(item);
              }}
            >
              Rename
            </button>
            <button
              type="button"
              className="drive-card-action primary"
              title="Share with employees"
              onClick={(e) => {
                e.stopPropagation();
                onShare?.(item);
              }}
            >
              Share
            </button>
          </div>
        ) : null}
      </div>
      <div className="drive-file-meta">
        <strong className="drive-file-name" title={isFolder ? item.name : item.title || item.fileName}>
          {isFolder ? item.name : item.title || item.fileName || 'Untitled'}
        </strong>
        <span className="drive-file-sub">
          {isFolder
            ? `${(item.documentCount || 0) + (item.productImageCount || 0)} items`
            : [item.sku, item.uploadedBy || item.source, formatBytes(item.fileSize)]
                .filter(Boolean)
                .join(' · ')}
        </span>
        {!isFolder ? (
          <span className="drive-file-sub">{formatDate(item.createdAt || item.updatedAt)}</span>
        ) : null}
      </div>
    </div>
  );
}
