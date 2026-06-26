import React, { useState, useEffect } from 'react';
import logger from './utils/logger';
import Dashboard from './components/Dashboard';
import Products from './components/Products';
import Suppliers from './components/Suppliers';
import PurchaseOrders from './components/PurchaseOrders';
import PurchaseRequisite from './components/PurchaseRequisite';
import GoodsReceiptNoteModule from './goods-receipt-note/GoodsReceiptNoteModule';
import Purchases from './components/Purchases';
import Locations from './components/Locations';
import Stock from './components/Stock';
import Prices from './components/Prices';
import SalesChannels from './components/SalesChannels';
import SalesLocations from './components/SalesLocations';
import Sales from './components/Sales';
import ShipmentVendors from './components/ShipmentVendors';
import ShippingCharges from './components/ShippingCharges';
import Shipments from './components/Shipments';
import MIS from './components/MIS';
import Categories from './components/Categories';
import Subcategories from './components/Subcategories';
import GeminiImageGenerator from './components/GeminiImageGenerator';
import ReplenishReport from './components/ReplenishReport';
import CompanyProfile from './components/CompanyProfile';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard onNavigate={setActiveTab} />;
      case 'products':
        return <Products />;
      case 'suppliers':
        return <Suppliers />;
      case 'locations':
        return <Locations />;
      case 'stock':
        return <Stock />;
      case 'prices':
        return <Prices />;
      case 'sales-channels':
        return <SalesChannels />;
      case 'sales-locations':
        return <SalesLocations />;
      case 'sales':
        return <Sales />;
      case 'purchase-orders':
        return <PurchaseOrders onNavigate={setActiveTab} />;
      case 'purchase-requisite':
        return <PurchaseRequisite onNavigate={setActiveTab} />;
      case 'grn':
        return <GoodsReceiptNoteModule onNavigate={setActiveTab} />;
      case 'purchases':
        return <Purchases />;
      case 'shipment-vendors':
        return <ShipmentVendors />;
      case 'shipping-charges':
        return <ShippingCharges />;
      case 'shipments':
        return <Shipments />;
      case 'mis':
        return <MIS />;
      case 'categories':
        return <Categories />;
      case 'subcategories':
        return <Subcategories />;
      case 'gemini-image-generator':
        return <GeminiImageGenerator />;
      case 'replenish-report':
        return <ReplenishReport onNavigate={setActiveTab} />;
      case 'company-master':
        return <CompanyProfile />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="App">
      <div className="sidebar">
        <div className="sidebar-header">
          <h1>RetailOS</h1>
        </div>
        <nav className="sidebar-nav">
          <button
            className={activeTab === 'dashboard' ? 'nav-item active' : 'nav-item'}
            onClick={() => setActiveTab('dashboard')}
          >
            📊 Dashboard
          </button>
          <button
            className={activeTab === 'products' ? 'nav-item active' : 'nav-item'}
            onClick={() => setActiveTab('products')}
          >
            📦 Products
          </button>
          <button
            className={activeTab === 'suppliers' ? 'nav-item active' : 'nav-item'}
            onClick={() => setActiveTab('suppliers')}
          >
            🏢 Suppliers
          </button>
          <button
            className={activeTab === 'company-master' ? 'nav-item active' : 'nav-item'}
            onClick={() => setActiveTab('company-master')}
          >
            🏛️ Company Master
          </button>
          <button
            className={activeTab === 'locations' ? 'nav-item active' : 'nav-item'}
            onClick={() => setActiveTab('locations')}
          >
            🏭 Locations
          </button>
          <button
            className={activeTab === 'stock' ? 'nav-item active' : 'nav-item'}
            onClick={() => setActiveTab('stock')}
          >
            📊 Stock
          </button>
          <button
            className={activeTab === 'prices' ? 'nav-item active' : 'nav-item'}
            onClick={() => setActiveTab('prices')}
          >
            💵 Prices
          </button>
          <button
            className={activeTab === 'sales-channels' ? 'nav-item active' : 'nav-item'}
            onClick={() => setActiveTab('sales-channels')}
          >
            📡 Sales Channels
          </button>
          <button
            className={activeTab === 'sales-locations' ? 'nav-item active' : 'nav-item'}
            onClick={() => setActiveTab('sales-locations')}
          >
            📍 Sales Locations
          </button>
          <button
            className={activeTab === 'sales' ? 'nav-item active' : 'nav-item'}
            onClick={() => setActiveTab('sales')}
          >
            🛒 Sales
          </button>
          <button
            className={activeTab === 'grn' ? 'nav-item active' : 'nav-item'}
            onClick={() => setActiveTab('grn')}
          >
            📥 Goods Receipt Note
          </button>
          <button
            className={activeTab === 'purchase-requisite' ? 'nav-item active' : 'nav-item'}
            onClick={() => setActiveTab('purchase-requisite')}
          >
            📝 Purchase Requisition
          </button>
          <button
            className={activeTab === 'purchase-orders' ? 'nav-item active' : 'nav-item'}
            onClick={() => setActiveTab('purchase-orders')}
          >
            📋 Purchase Orders
          </button>
          <button
            className={activeTab === 'purchases' ? 'nav-item active' : 'nav-item'}
            onClick={() => setActiveTab('purchases')}
          >
            💰 Purchases
          </button>
          <button
            className={activeTab === 'shipment-vendors' ? 'nav-item active' : 'nav-item'}
            onClick={() => setActiveTab('shipment-vendors')}
          >
            🚚 Shipment Vendors
          </button>
          <button
            className={activeTab === 'shipping-charges' ? 'nav-item active' : 'nav-item'}
            onClick={() => setActiveTab('shipping-charges')}
          >
            💳 Shipping Charges
          </button>
          <button
            className={activeTab === 'shipments' ? 'nav-item active' : 'nav-item'}
            onClick={() => setActiveTab('shipments')}
          >
            📦 Shipments
          </button>
          <button
            className={activeTab === 'mis' ? 'nav-item active' : 'nav-item'}
            onClick={() => setActiveTab('mis')}
          >
            📊 MIS Reports
          </button>
          <button
            className={activeTab === 'categories' ? 'nav-item active' : 'nav-item'}
            onClick={() => setActiveTab('categories')}
          >
            📁 Categories
          </button>
          <button
            className={activeTab === 'subcategories' ? 'nav-item active' : 'nav-item'}
            onClick={() => setActiveTab('subcategories')}
          >
            📂 Subcategories
          </button>
          <button
            className={activeTab === 'gemini-image-generator' ? 'nav-item active' : 'nav-item'}
            onClick={() => setActiveTab('gemini-image-generator')}
          >
            🎨 Image Generator
          </button>
          <button
            className={activeTab === 'replenish-report' ? 'nav-item active' : 'nav-item'}
            onClick={() => setActiveTab('replenish-report')}
          >
            🔄 Replenish Report
          </button>
        </nav>
      </div>
      <button
        className="theme-toggle-floating"
        onClick={toggleTheme}
        title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      >
        {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
      </button>
      <div className="main-content">
        {renderContent()}
      </div>
    </div>
  );
}

export default App;

