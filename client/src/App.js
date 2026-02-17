import React, { useState, useCallback } from 'react';
import { useAuth } from './context/AuthContext';
import Dashboard from './components/Dashboard';
import Products from './components/Products';
import Suppliers from './components/Suppliers';
import PurchaseOrders from './components/PurchaseOrders';
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
import Units from './components/Units';
import GeminiImageGenerator from './components/GeminiImageGenerator';
import Users from './components/Users';
import Roles from './components/Roles';
import Permissions from './components/Permissions';
import Groups from './components/Groups';
import Login from './components/Login';
import './App.css';

const MENU_CONFIG = [
  {
    id: 'masters',
    label: 'Masters',
    items: [
      { tab: 'products', label: 'Products', icon: '📦', permission: 'products.view' },
      { tab: 'categories', label: 'Categories', icon: '📁', permission: 'categories.view' },
      { tab: 'subcategories', label: 'Subcategories', icon: '📂', permission: 'subcategories.view' },
      { tab: 'units', label: 'Unit Master', icon: '📏', permission: 'units.view' },
      { tab: 'suppliers', label: 'Suppliers', icon: '🏢', permission: 'suppliers.view' },
      { tab: 'locations', label: 'Locations', icon: '🏭', permission: 'locations.view' },
      { tab: 'prices', label: 'Prices', icon: '💵', permission: 'prices.view' },
      { tab: 'sales-channels', label: 'Sales Channels', icon: '📡', permission: 'salesChannels.view' },
      { tab: 'sales-locations', label: 'Sales Locations', icon: '📍', permission: 'salesLocations.view' },
      { tab: 'shipment-vendors', label: 'Shipment Vendors', icon: '🚚', permission: 'shipmentVendors.view' },
      { tab: 'gemini-image-generator', label: 'Image Generator', icon: '🎨', permission: 'gemini.view' },
    ],
  },
  {
    id: 'sales',
    label: 'Sales',
    items: [
      { tab: 'sales', label: 'Sales', icon: '🛒', permission: 'sales.view' },
      { tab: 'shipments', label: 'Shipments', icon: '📦', permission: 'shipments.view' },
      { tab: 'shipping-charges', label: 'Shipping Charges', icon: '💳', permission: 'shippingCharges.view' },
    ],
  },
  {
    id: 'purchase',
    label: 'Purchase',
    items: [
      { tab: 'purchase-orders', label: 'Purchase Orders', icon: '📋', permission: 'purchaseOrders.view' },
      { tab: 'purchases', label: 'Purchases', icon: '💰', permission: 'purchases.view' },
    ],
  },
  {
    id: 'stock',
    label: 'Stock',
    items: [
      { tab: 'stock', label: 'Stock', icon: '📊', permission: 'stock.view' },
    ],
  },
  {
    id: 'user-management',
    label: 'User Management',
    items: [
      { tab: 'users', label: 'User', icon: '👤', permission: 'users.view' },
      { tab: 'roles', label: 'Role', icon: '🔐', permission: 'roles.view' },
      { tab: 'permissions', label: 'Permission', icon: '✅', permission: 'permissions.view' },
      { tab: 'groups', label: 'Group', icon: '👥', permission: 'groups.view' },
    ],
  },
];

const DEFAULT_EXPANDED = new Set(['masters', 'sales', 'purchase', 'stock', 'user-management']);

function App() {
  const { user, login, logout, isAuthenticated, loading, hasPermission } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [expandedGroups, setExpandedGroups] = useState(DEFAULT_EXPANDED);

  const toggleGroup = useCallback((groupId) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  if (loading) {
    return <div className="app-loading">Loading...</div>;
  }
  if (!isAuthenticated) {
    return <Login onLogin={login} />;
  }

  const renderContent = () => {
    const tabPermissions = {
      mis: 'reports.view',
      products: 'products.view',
      suppliers: 'suppliers.view',
      locations: 'locations.view',
      stock: 'stock.view',
      prices: 'prices.view',
      'sales-channels': 'salesChannels.view',
      'sales-locations': 'salesLocations.view',
      sales: 'sales.view',
      'purchase-orders': 'purchaseOrders.view',
      purchases: 'purchases.view',
      'shipment-vendors': 'shipmentVendors.view',
      'shipping-charges': 'shippingCharges.view',
      shipments: 'shipments.view',
      categories: 'categories.view',
      subcategories: 'subcategories.view',
      units: 'units.view',
      'gemini-image-generator': 'gemini.view',
      users: 'users.view',
      roles: 'roles.view',
      permissions: 'permissions.view',
      groups: 'groups.view',
    };
    const requiredPerm = tabPermissions[activeTab];
    if (requiredPerm && !hasPermission(requiredPerm)) {
      return <Dashboard />;
    }
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
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
        return <PurchaseOrders />;
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
      case 'units':
        return <Units />;
      case 'gemini-image-generator':
        return <GeminiImageGenerator />;
      case 'users':
        return <Users />;
      case 'roles':
        return <Roles />;
      case 'permissions':
        return <Permissions />;
      case 'groups':
        return <Groups />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="App">
      <div className="sidebar">
        <div className="sidebar-header">
          <h1>RetailOS</h1>
          <div className="sidebar-user">
            <span>{user?.username || user?.email}</span>
            <button type="button" className="btn-logout" onClick={logout}>Logout</button>
          </div>
        </div>
        <nav className="sidebar-nav">
          <button
            className={activeTab === 'dashboard' ? 'nav-item active' : 'nav-item'}
            onClick={() => setActiveTab('dashboard')}
          >
            📊 Dashboard
          </button>
          {hasPermission('reports.view') && (
            <button
              className={activeTab === 'mis' ? 'nav-item active' : 'nav-item'}
              onClick={() => setActiveTab('mis')}
            >
              📊 MIS Reports
            </button>
          )}
          {MENU_CONFIG.map((group) => {
            const visibleItems = group.items.filter((item) => !item.permission || hasPermission(item.permission));
            if (visibleItems.length === 0) return null;
            const isExpanded = expandedGroups.has(group.id);
            return (
              <div key={group.id} className="nav-group">
                <button
                  type="button"
                  className="nav-group-header"
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={isExpanded}
                >
                  <span className={`nav-group-chevron ${isExpanded ? 'expanded' : ''}`}>›</span>
                  {group.label}
                </button>
                {isExpanded && (
                  <div className="nav-group-items">
                    {visibleItems.map((item) => (
                      <button
                        key={item.tab}
                        type="button"
                        className={activeTab === item.tab ? 'nav-item nav-group-item active' : 'nav-item nav-group-item'}
                        onClick={() => setActiveTab(item.tab)}
                      >
                        {item.icon} {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>
      <div className="main-content">
        {renderContent()}
      </div>
    </div>
  );
}

export default App;
