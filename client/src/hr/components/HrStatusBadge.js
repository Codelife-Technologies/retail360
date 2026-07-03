import React from 'react';
import { statusClass } from '../utils/hrUtils';

function HrStatusBadge({ status }) {
  if (!status) return null;
  return <span className={`hr-status-badge ${statusClass(status)}`}>{status}</span>;
}

export default HrStatusBadge;
