import React from 'react';

export default function DriveToolbar({ filters, onChange, open, sourceScope }) {
  if (!open) return null;
  return (
    <div className="drive-filters">
      <label>
        <span>SKU</span>
        <input
          value={filters.sku || ''}
          onChange={(e) => onChange({ ...filters, sku: e.target.value })}
          placeholder="SKU"
        />
      </label>
      <label>
        <span>Category</span>
        <input
          value={filters.category || ''}
          onChange={(e) => onChange({ ...filters, category: e.target.value })}
          placeholder="Category"
        />
      </label>
      <label>
        <span>Brand</span>
        <input
          value={filters.brand || ''}
          onChange={(e) => onChange({ ...filters, brand: e.target.value })}
          placeholder="Brand"
        />
      </label>
      {sourceScope === 'Manual Upload' ? (
        <>
          <label>
            <span>Department</span>
            <input
              value={filters.department || ''}
              onChange={(e) => onChange({ ...filters, department: e.target.value })}
              placeholder="Department"
            />
          </label>
          <label>
            <span>Employee</span>
            <input
              value={filters.employee || ''}
              onChange={(e) => onChange({ ...filters, employee: e.target.value })}
              placeholder="Uploader"
            />
          </label>
        </>
      ) : null}
      <label>
        <span>From</span>
        <input
          type="date"
          value={filters.dateFrom || ''}
          onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
        />
      </label>
      <label>
        <span>To</span>
        <input
          type="date"
          value={filters.dateTo || ''}
          onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
        />
      </label>
      <label>
        <span>Status</span>
        <select
          value={filters.status || 'Active'}
          onChange={(e) => onChange({ ...filters, status: e.target.value })}
        >
          <option value="Active">Active</option>
          <option value="Archived">Archived</option>
        </select>
      </label>
      <button
        type="button"
        className="drive-btn"
        onClick={() =>
          onChange({
            category: '',
            department: '',
            employee: '',
            dateFrom: '',
            dateTo: '',
            brand: '',
            sku: '',
            status: 'Active',
          })
        }
      >
        Clear
      </button>
    </div>
  );
}
