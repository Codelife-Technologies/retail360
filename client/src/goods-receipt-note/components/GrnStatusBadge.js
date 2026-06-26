import React from 'react';
import { GRN_STATUS_LABELS } from '../types/grn.types';

function GrnStatusBadge({ status }) {
  return (
    <span className={`grn-status-badge status-${status || 'draft'}`}>
      {GRN_STATUS_LABELS[status] || status || '—'}
    </span>
  );
}

export default GrnStatusBadge;
