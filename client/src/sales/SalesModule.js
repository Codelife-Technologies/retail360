import React from 'react';
import Shipments from '../components/Shipments';
import ShippingCharges from '../components/ShippingCharges';
import './SalesModule.css';

function SalesModule({ subTab = 'shipments' }) {
  const renderPanel = () => {
    switch (subTab) {
      case 'shipments':
        return <Shipments />;
      case 'shipping-charges':
        return <ShippingCharges />;
      default:
        return <Shipments />;
    }
  };

  return <div className="sales-module">{renderPanel()}</div>;
}

export default SalesModule;
