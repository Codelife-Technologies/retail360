import React, { useState } from 'react';
import SalesDashboard from './SalesDashboard';
import Sales from './Sales';
import PurchaseReport from './PurchaseReport';
import Stock from './Stock';
import ReplenishReport from './ReplenishReport';
import './MIS.css';
import './SalesDashboard.css';
import './Sales.css';
import './SalesSkuReport.css';
import './PurchaseReport.css';
import './Stock.css';
import './ReplenishReport.css';

const BUSINESS_REPORT_TABS = [
  { id: 'sales-dashboard', label: 'Sales Dashboard' },
  { id: 'sales', label: 'Sales Report' },
  { id: 'purchases', label: 'Purchase Report' },
  { id: 'stock', label: 'Stock Report' },
  { id: 'replenish', label: 'Replenish Report' },
];

function MIS({ onNavigate }) {
  const [activeTab, setActiveTab] = useState('sales-dashboard');

  const renderReport = () => {
    switch (activeTab) {
      case 'sales-dashboard':
        return <SalesDashboard />;
      case 'sales':
        return <Sales />;
      case 'purchases':
        return <PurchaseReport />;
      case 'stock':
        return <Stock />;
      case 'replenish':
        return <ReplenishReport onNavigate={onNavigate} />;
      default:
        return <SalesDashboard />;
    }
  };

  return (
    <div className="mis-container">
      <div className="mis-header">
        <h1>Business Reports</h1>
      </div>

      <div className="mis-tabs">
        {BUSINESS_REPORT_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? 'mis-tab active' : 'mis-tab'}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mis-content">
        <div className="mis-report-panel">{renderReport()}</div>
      </div>
    </div>
  );
}

export default MIS;
