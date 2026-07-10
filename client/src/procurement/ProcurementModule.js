import React from 'react';
import PurchaseRequisite from '../components/PurchaseRequisite';
import PurchaseOrders from '../components/PurchaseOrders';
import GoodsReceiptNoteModule from '../goods-receipt-note/GoodsReceiptNoteModule';
import Purchases from '../components/Purchases';
import './ProcurementModule.css';

function ProcurementModule({ subTab = 'purchase-requisite', onNavigate }) {
  const renderPanel = () => {
    switch (subTab) {
      case 'purchase-requisite':
        return <PurchaseRequisite onNavigate={onNavigate} />;
      case 'purchase-orders':
        return <PurchaseOrders onNavigate={onNavigate} />;
      case 'grn':
        return <GoodsReceiptNoteModule onNavigate={onNavigate} />;
      case 'purchases':
        return <Purchases />;
      default:
        return <PurchaseRequisite onNavigate={onNavigate} />;
    }
  };

  return <div className="procurement-module">{renderPanel()}</div>;
}

export default ProcurementModule;
