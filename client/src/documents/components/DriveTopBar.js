import React, { forwardRef } from 'react';

const DriveTopBar = forwardRef(function DriveTopBar({
  search,
  onSearchChange,
  viewMode,
  onViewModeChange,
  sortField,
  sortDir,
  onSortChange,
  onUpload,
  onNewFolder,
  showUpload = true,
  showNewFolder = true,
  filtersOpen,
  onToggleFilters,
}, searchRef) {
  return (
    <div className="drive-topbar">
      <div className="drive-search-wrap">
        <span className="drive-search-icon" aria-hidden="true">⌕</span>
        <input
          ref={searchRef}
          className="drive-search"
          type="search"
          placeholder="Search files, SKUs, tags, departments…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Search documents"
        />
      </div>

      <div className="drive-topbar-actions">
        {showUpload ? (
          <button type="button" className="drive-btn drive-btn-primary" onClick={onUpload}>
            Upload
          </button>
        ) : null}
        {showNewFolder ? (
          <button type="button" className="drive-btn" onClick={onNewFolder}>
            New folder
          </button>
        ) : null}
        <button
          type="button"
          className={`drive-btn${filtersOpen ? ' active' : ''}`}
          onClick={onToggleFilters}
        >
          Filter
        </button>
        <div className="drive-seg">
          <button
            type="button"
            className={viewMode === 'grid' ? 'active' : ''}
            onClick={() => onViewModeChange('grid')}
            title="Grid view"
          >
            ▦
          </button>
          <button
            type="button"
            className={viewMode === 'list' ? 'active' : ''}
            onClick={() => onViewModeChange('list')}
            title="List view"
          >
            ☰
          </button>
        </div>
        <label className="drive-sort">
          <span className="sr-only">Sort</span>
          <select
            value={`${sortField}:${sortDir}`}
            onChange={(e) => {
              const [field, dir] = e.target.value.split(':');
              onSortChange({ field, dir });
            }}
          >
            <option value="name:asc">Name A–Z</option>
            <option value="name:desc">Name Z–A</option>
            <option value="created:desc">Newest</option>
            <option value="created:asc">Oldest</option>
            <option value="updated:desc">Recently updated</option>
            <option value="size:desc">Size (large)</option>
            <option value="size:asc">Size (small)</option>
            <option value="sku:asc">SKU</option>
            <option value="owner:asc">Owner</option>
            <option value="department:asc">Department</option>
          </select>
        </label>
      </div>
    </div>
  );
});

export default DriveTopBar;
