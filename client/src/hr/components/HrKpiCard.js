import React from 'react';

function HrKpiCard({ icon, label, value, variant = '', onClick, title }) {
  const clickable = typeof onClick === 'function';
  return (
    <div
      className={`hr-kpi-card ${variant}${clickable ? ' clickable' : ''}`}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      title={title || (clickable ? `Go to ${label}` : undefined)}
      onClick={clickable ? onClick : undefined}
      onKeyDown={clickable ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      } : undefined}
    >
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
