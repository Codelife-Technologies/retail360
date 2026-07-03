import React from 'react';
import { employeeName } from '../utils/hrUtils';

function HrEmployeeAvatar({ employee, size = 40 }) {
  const name = employeeName(employee);
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="hr-avatar" style={{ width: size, height: size }}>
      {employee?.photo ? (
        <img src={employee.photo} alt={name} />
      ) : (
        initials || '?'
      )}
    </div>
  );
}

export default HrEmployeeAvatar;
