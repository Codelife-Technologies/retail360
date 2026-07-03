import React from 'react';
import SalesDashboard from '../components/SalesDashboard';
import Sales from '../components/Sales';
import Shipments from '../components/Shipments';
import ShippingCharges from '../components/ShippingCharges';
import './SalesModule.css';

function SalesModule({ subTab = 'sales' }) {
  const renderPanel = () => {
    switch (subTab) {
      case 'sales-dashboard':
        return <SalesDashboard />;
      case 'sales':
        return <Sales />;
      case 'shipments':
        return <Shipments />;
      case 'shipping-charges':
        return <ShippingCharges />;
      default:
        return <Sales />;
    }
  };

  return <div className="sales-module">{renderPanel()}</div>;
}

export default SalesModule;
