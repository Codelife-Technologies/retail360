import React, { useRef, useEffect } from 'react';
import FileCard from './FileCard';
import Skeleton from './Skeleton';
import EmptyState from './EmptyState';

export default function ContentGrid({
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
  onBackgroundDrop,
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

  if (loading && !items.length) {
    return <Skeleton variant="grid" count={8} />;
  }

  if (!loading && !items.length) {
    return <EmptyState title="This folder is empty" subtitle="Upload files or create a folder to get started." />;
  }

  return (
    <div
      className="drive-content-grid"
      onDragOver={(e) => {
        e.preventDefault();
      }}
      onDrop={onBackgroundDrop}
    >
      {items.map((item) => {
        const id = String(item._id);
        const kind = item._driveKind === 'folder' ? 'folder' : 'document';
        return (
          <FileCard
            key={`${kind}-${id}`}
            item={item}
            selected={isSelected(id)}
            starred={isStarred(kind, id)}
            onOpen={onOpen}
            onSelect={onSelect}
            onContextMenu={onContextMenu}
            onDragStart={onDragStart}
            dropTarget={dropFolderId === id}
            onDragOver={(e) => onFolderDragOver?.(e, item)}
            onDragLeave={onFolderDragLeave}
            onDrop={onFolderDrop}
            onRename={onRename}
            onShare={onShare}
          />
        );
      })}
      {hasMore ? <div ref={sentinelRef} className="drive-scroll-sentinel" /> : null}
      {loadingMore ? <div className="drive-loading-more">Loading more…</div> : null}
    </div>
  );
}
