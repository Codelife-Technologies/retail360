import React, { useEffect, useRef } from 'react';
import { documentsAPI } from '../services/documentsApi';
import { documentIcon, formatBytes, formatDateTime } from '../utils/documentsUtils';
import Skeleton from './Skeleton';
import EmptyState from './EmptyState';

export default function ContentList({
  items,
  loading,
  loadingMore,
  hasMore,
  onLoadMore,
  isSelected,
  isStarred,
  onSelect,
  onOpen,
  onContextMenu,
  onDragStart,
  dropFolderId,
  onFolderDragOver,
  onFolderDragLeave,
  onFolderDrop,
  onRename,
  onShare,
}) {
  const sentinelRef = useRef(null);

  useEffect(() => {
    if (!hasMore || !onLoadMore) return undefined;
    const el = sentinelRef.current;
    if (!el) return undefined;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { rootMargin: '200px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, onLoadMore, items.length]);

  if (loading && !items.length) return <Skeleton variant="list" count={6} />;
  if (!loading && !items.length) {
    return <EmptyState title="No files here" subtitle="Try another folder or clear filters." />;
  }

  return (
    <div className="drive-content-list-wrap">
      <table className="drive-content-list">
        <thead>
          <tr>
            <th aria-label="Type" />
            <th>Name</th>
            <th>SKU</th>
            <th>Owner</th>
            <th>Department</th>
            <th>Modified</th>
            <th>Created</th>
            <th>Size</th>
            <th>Source</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const isFolder = item._driveKind === 'folder';
            const id = String(item._id);
            const kind = isFolder ? 'folder' : 'document';
            const thumb = !isFolder
              ? documentsAPI.fileUrl(item.thumbnailUrl || item.fileUrl)
              : '';
            return (
              <tr
                key={`${kind}-${id}`}
                className={`${isSelected(id) ? 'selected' : ''}${dropFolderId === id ? ' drop-target' : ''}${isStarred(kind, id) ? ' starred' : ''}`}
                draggable
                onDragStart={(e) => onDragStart?.(e, item)}
                onDragOver={isFolder ? (e) => onFolderDragOver?.(e, item) : undefined}
                onDragLeave={isFolder ? onFolderDragLeave : undefined}
                onDrop={isFolder ? (e) => onFolderDrop?.(e, item) : undefined}
                onClick={(e) => onSelect?.(e, item)}
                onDoubleClick={() => onOpen?.(item)}
                onContextMenu={(e) => onContextMenu?.(e, { kind, item })}
              >
                <td className="drive-list-icon">
                  {thumb ? <img src={thumb} alt="" loading="lazy" /> : <span>{isFolder ? '📁' : documentIcon(item)}</span>}
                </td>
                <td>
                  {isStarred(kind, id) ? <span className="drive-star-inline">★ </span> : null}
                  {isFolder ? item.name : item.title || item.fileName || 'Untitled'}
                </td>
                <td>{isFolder ? item.linkedSku || '—' : item.sku || '—'}</td>
                <td>{isFolder ? item.createdBy || '—' : item.uploadedBy || '—'}</td>
                <td>{item.department || '—'}</td>
                <td>{formatDateTime(item.updatedAt || item.createdAt)}</td>
                <td>{formatDateTime(item.createdAt)}</td>
                <td>{isFolder ? '—' : formatBytes(item.fileSize)}</td>
                <td>{isFolder ? (item.visibility || 'Shared') : item.source || item.kind || '—'}</td>
                <td>{isFolder ? (item.status || 'Active') : item.status || 'Active'}</td>
                <td className="drive-list-actions" onClick={(e) => e.stopPropagation()}>
                  {item.kind !== 'product' && item.canManage !== false ? (
                    <>
                      <button
                        type="button"
                        className="drive-link"
                        onClick={() => onRename?.(item)}
                      >
                        Rename
                      </button>
                      {' · '}
                      <button
                        type="button"
                        className="drive-link"
                        onClick={() => onShare?.(item)}
                      >
                        Share
                      </button>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {hasMore ? <div ref={sentinelRef} className="drive-scroll-sentinel" /> : null}
      {loadingMore ? <div className="drive-loading-more">Loading more…</div> : null}
    </div>
  );
}
