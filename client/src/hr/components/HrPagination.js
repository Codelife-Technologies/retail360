import React from 'react';

function HrPagination({ pagination, onPageChange }) {
  if (!pagination || pagination.totalPages <= 1) return null;

  const { page, totalPages, total, limit } = pagination;
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  return (
    <div className="hr-pagination">
      <span className="hr-pagination-info">
        Showing {start}–{end} of {total}
      </span>
      <div className="hr-pagination-controls">
        <button
          type="button"
          className="hr-btn hr-btn-secondary hr-btn-sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </button>
        <span className="hr-pagination-info">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          className="hr-btn hr-btn-secondary hr-btn-sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

export default HrPagination;
