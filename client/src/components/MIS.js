import React, { useState } from 'react';
import Sales from './Sales';
import PurchaseReport from './PurchaseReport';
import Stock from './Stock';
import ReplenishReport from './ReplenishReport';
import './MIS.css';
import './Sales.css';
import './SalesSkuReport.css';
import './PurchaseReport.css';
import './Stock.css';
import './ReplenishReport.css';

const MIS_TABS = [
  { id: 'sales', label: 'Sales Report' },
  { id: 'purchases', label: 'Purchase Report' },
  { id: 'stock', label: 'Stock Report' },
  { id: 'replenish', label: 'Replenish Report' },
];

function MIS() {
  const [activeTab, setActiveTab] = useState('sales');

  const renderReport = () => {
    switch (activeTab) {
      case 'sales':
        return <Sales />;
      case 'purchases':
        return <PurchaseReport />;
      case 'stock':
        return <Stock />;
      case 'replenish':
        return <ReplenishReport />;
      default:
        return <Sales />;
    }
  };

  return (
    <div className="mis-container">
      <div className="mis-header">
        <h1>Management Information System (MIS)</h1>
      </div>

      <div className="mis-tabs">
        {MIS_TABS.map((tab) => (
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
