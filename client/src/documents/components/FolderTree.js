import React from 'react';

function TreeNode({
  node,
  depth,
  selectedFolder,
  expandedIds,
  onSelect,
  onToggle,
  onContextMenu,
  onRename,
  onShare,
}) {
  const id = String(node.folder._id);
  const hasChildren = node.children?.length > 0;
  const expanded = expandedIds.has(id);
  const isPersonal = (node.folder.visibility || 'Shared') === 'Personal';
  const viewable = Boolean(node.folder.employeeVisible);
  const canManage = node.folder.canManage !== false;

  return (
    <div className="drive-tree-node">
      <div
        className={`drive-tree-row${selectedFolder === id ? ' active' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onContextMenu={(e) => onContextMenu?.(e, { kind: 'folder', item: node.folder })}
      >
        <div className="drive-tree-row-main">
          <button
            type="button"
            className="drive-tree-twist"
            disabled={!hasChildren}
            onClick={() => hasChildren && onToggle(id)}
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {hasChildren ? (expanded ? '▾' : '▸') : '·'}
          </button>
          <button type="button" className="drive-tree-label" onClick={() => onSelect(id, node.folder)}>
            <span aria-hidden="true">{isPersonal ? (viewable ? '👁' : '🔒') : '📁'}</span>
            <span className="drive-tree-name" title={node.folder.name}>{node.folder.name}</span>
          </button>
        </div>
        {canManage ? (
          <div className="drive-tree-item-actions">
            <button
              type="button"
              className="drive-tree-action"
              title="Rename folder"
              onClick={(e) => {
                e.stopPropagation();
                onRename?.(node.folder);
              }}
            >
              Rename
            </button>
            <button
              type="button"
              className="drive-tree-action"
              title="Share with employees"
              onClick={(e) => {
                e.stopPropagation();
                onShare?.(node.folder);
              }}
            >
              Share
            </button>
          </div>
        ) : null}
      </div>
      {expanded
        ? node.children.map((child) => (
            <TreeNode
              key={child.folder._id}
              node={child}
              depth={depth + 1}
              selectedFolder={selectedFolder}
              expandedIds={expandedIds}
              onSelect={onSelect}
              onToggle={onToggle}
              onContextMenu={onContextMenu}
              onRename={onRename}
              onShare={onShare}
            />
          ))
        : null}
    </div>
  );
}

export default function FolderTree({
  tree,
  selectedFolder,
  expandedIds,
  onSelect,
  onToggle,
  onSelectRoot,
  onSelectUnfiled,
  unfiledCount = 0,
  onContextMenu,
  onRename,
  onShare,
}) {
  return (
    <div className="drive-folder-tree">
      <button
        type="button"
        className={`drive-tree-root${selectedFolder === 'all' ? ' active' : ''}`}
        onClick={onSelectRoot}
      >
        My Drive
      </button>
      <button
        type="button"
        className={`drive-tree-root${selectedFolder === 'unfiled' ? ' active' : ''}`}
        onClick={onSelectUnfiled}
      >
        Unfiled <span className="drive-nav-badge">{unfiledCount}</span>
      </button>
      {tree.map((node) => (
        <TreeNode
          key={node.folder._id}
          node={node}
          depth={0}
          selectedFolder={selectedFolder}
          expandedIds={expandedIds}
          onSelect={onSelect}
          onToggle={onToggle}
          onContextMenu={onContextMenu}
          onRename={onRename}
          onShare={onShare}
        />
      ))}
    </div>
  );
}
