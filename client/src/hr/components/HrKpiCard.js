import React from 'react';

function HrKpiCard({ icon, label, value, variant = '' }) {
  return (
    <div className={`hr-kpi-card ${variant}`}>
      <span className="hr-kpi-icon" aria-hidden="true">
        {icon}
      </span>
      <div className="hr-kpi-body">
        <h3>{value}</h3>
        <p>{label}</p>
      </div>
    </div>
  );
}

export default HrKpiCard;
