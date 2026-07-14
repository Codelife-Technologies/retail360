import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from './context/AuthContext';
import Dashboard from './components/Dashboard';
import MIS from './components/MIS';
import MasterModule from './master/MasterModule';
import ProcurementModule from './procurement/ProcurementModule';
import SalesModule from './sales/SalesModule';
import HrModule from './hr/HrModule';
import UserManagementModule from './userManagement/UserManagementModule';
import EmployeeDashboardModule from './employeeDashboard/EmployeeDashboardModule';
import EmployeeChatNotifications from './employeeDashboard/components/EmployeeChatNotifications';
import InventoryModule from './inventory/InventoryModule';
import Login from './components/Login';
import { MASTER_GROUPS, isMasterTab, resolveMasterSubTab } from './master/masterTabs';
import {
  INVENTORY_GROUPS,
  isInventoryTab,
  resolveInventorySubTab,
} from './inventory/inventoryTabs';
import {
  canViewMaster,
  filterTabGroups,
  filterTabs,
} from './utils/accessControl';
import {
  PROCUREMENT_TABS,
  isProcurementTab,
  resolveProcurementSubTab,
} from './procurement/procurementTabs';
import { SALES_TABS, isSalesModuleTab, resolveSalesSubTab } from './sales/salesTabs';
import { HR_TABS, isHrTab, resolveHrSubTab } from './hr/hrTabs';
import {
  USER_MANAGEMENT_TABS,
  isUserManagementTab,
  resolveUserManagementSubTab,
} from './userManagement/userManagementTabs';
import {
  EMPLOYEE_DASHBOARD_TABS,
  isEmployeeDashboardTab,
  resolveEmployeeDashboardSubTab,
} from './employeeDashboard/employeeDashboardTabs';
import PageZoomShell from './components/PageZoomShell';
import BirthdayCelebration from './components/BirthdayCelebration';
import './App.css';

function App() {
  const {
    user,
    login,
    logout,
    isAuthenticated,
    loading,
    hasPermission,
    birthdayGreeting,
    dismissBirthdayGreeting,
  } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [openNavDropdown, setOpenNavDropdown] = useState(null);

  const showMasterNav = canViewMaster(hasPermission);
  const showInventoryNav = !showMasterNav && filterTabGroups(hasPermission, user, INVENTORY_GROUPS).length > 0;
  const visibleInventoryGroups = filterTabGroups(hasPermission, user, INVENTORY_GROUPS);
  const visibleProcurementTabs = filterTabs(hasPermission, user, PROCUREMENT_TABS);
  const visibleSalesTabs = filterTabs(hasPermission, user, SALES_TABS);
  const visibleHrTabs = filterTabs(hasPermission, user, HR_TABS);
  const canViewReports = hasPermission('admin.all') || hasPermission('reports.view');

  const visibleUserManagementTabs = USER_MANAGEMENT_TABS.filter(
    (tab) => hasPermission('admin.all') || hasPermission(tab.permission)
  );

  const isInventoryActive = activeTab === 'inventory' || activeTab.startsWith('inventory:');
  const isMasterActive = showMasterNav && (activeTab === 'master' || activeTab.startsWith('master:'));
  const isProcurementActive =
    activeTab === 'procurement' || activeTab.startsWith('procurement:');
  const isSalesActive =
    activeTab === 'sales-module' || activeTab.startsWith('sales-module:');
  const isHrActive = activeTab === 'hr' || activeTab.startsWith('hr:');
  const isUserManagementActive =
    activeTab === 'user-management' || activeTab.startsWith('user-management:');
  const isEmployeeDashboardActive =
    activeTab === 'employee-dashboard' || activeTab.startsWith('employee-dashboard:');
  const activeMasterSubTab = resolveMasterSubTab(activeTab);
  const activeProcurementSubTab = resolveProcurementSubTab(activeTab);
  const activeSalesSubTab = resolveSalesSubTab(activeTab);
  const activeHrSubTab = resolveHrSubTab(activeTab);
  const activeUserManagementSubTab = resolveUserManagementSubTab(activeTab);
  const activeEmployeeDashboardSubTab = resolveEmployeeDashboardSubTab(activeTab);
  const activeInventorySubTab = resolveInventorySubTab(activeTab);

  useEffect(() => {
    if (!openNavDropdown) return undefined;

    const handlePointerDown = (event) => {
      if (!event.target.closest('.nav-dropdown')) {
        setOpenNavDropdown(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [openNavDropdown]);

  const toggleNavDropdown = useCallback((id) => {
    setOpenNavDropdown((current) => (current === id ? null : id));
  }, []);

  const handleNavigate = useCallback(
    (tab) => {
      setOpenNavDropdown(null);

      if (tab.startsWith('inventory:')) {
        setActiveTab(tab);
        return;
      }
      if (tab.startsWith('master:')) {
        setActiveTab(tab);
        return;
      }
      if (tab.startsWith('procurement:')) {
        setActiveTab(tab);
        return;
      }
      if (tab.startsWith('sales-module:')) {
        setActiveTab(tab);
        return;
      }
      if (tab.startsWith('hr:')) {
        setActiveTab(tab);
        return;
      }
      if (tab.startsWith('user-management:')) {
        setActiveTab(tab);
        return;
      }
      if (tab.startsWith('employee-dashboard:')) {
        setActiveTab(tab);
        return;
      }
      if (isInventoryTab(tab)) {
        setActiveTab(`inventory:${tab}`);
        return;
      }
      if (isMasterTab(tab)) {
        setActiveTab(`master:${tab}`);
        return;
      }
      if (isProcurementTab(tab)) {
        setActiveTab(`procurement:${tab}`);
        return;
      }
      if (isSalesModuleTab(tab)) {
        setActiveTab(`sales-module:${tab}`);
        return;
      }
      if (isHrTab(tab)) {
        setActiveTab(`hr:${tab}`);
        return;
      }
      if (isUserManagementTab(tab)) {
        setActiveTab(`user-management:${tab}`);
        return;
      }
      if (isEmployeeDashboardTab(tab)) {
        setActiveTab(`employee-dashboard:${tab}`);
        return;
      }
      if (tab === 'inventory') {
        const firstTab = visibleInventoryGroups[0]?.tabs[0]?.id || 'stock';
        setActiveTab(`inventory:${firstTab}`);
        return;
      }
      if (tab === 'master') {
        setActiveTab('master:products');
        return;
      }
      if (tab === 'procurement') {
        const firstTab = visibleProcurementTabs[0]?.id || 'purchase-requisite';
        setActiveTab(`procurement:${firstTab}`);
        return;
      }
      if (tab === 'sales-module') {
        const firstTab = visibleSalesTabs[0]?.id || 'shipments';
        setActiveTab(`sales-module:${firstTab}`);
        return;
      }
      if (tab === 'dashboard' || tab === 'mis' || tab === 'business-reports') {
        setActiveTab(tab === 'business-reports' ? 'mis' : tab);
        return;
      }
      if (tab === 'hr') {
        const firstTab = visibleHrTabs[0]?.id || 'hr-dashboard';
        setActiveTab(`hr:${firstTab}`);
        return;
      }
      if (tab === 'user-management') {
        const firstTab = visibleUserManagementTabs[0]?.id || 'users';
        setActiveTab(`user-management:${firstTab}`);
        return;
      }
      if (tab === 'employee-dashboard') {
        setActiveTab('employee-dashboard:home');
        return;
      }
      setActiveTab(tab);
    },
    [visibleUserManagementTabs, visibleInventoryGroups, visibleProcurementTabs, visibleSalesTabs, visibleHrTabs]
  );

  if (loading) {
    return <div className="app-loading">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Login onLogin={login} />;
  }

  const renderContent = () => {
    if (isMasterActive && showMasterNav) {
      return <MasterModule subTab={activeMasterSubTab} />;
    }
    if (isInventoryActive && showInventoryNav) {
      return <InventoryModule subTab={activeInventorySubTab} />;
    }
    if (isProcurementActive) {
      return (
        <ProcurementModule subTab={activeProcurementSubTab} onNavigate={handleNavigate} />
      );
    }
    if (isSalesActive) {
      return <SalesModule subTab={activeSalesSubTab} />;
    }
    if (isHrActive) {
      return <HrModule subTab={activeHrSubTab} />;
    }
    if (isUserManagementActive) {
      return <UserManagementModule subTab={activeUserManagementSubTab} />;
    }
    if (isEmployeeDashboardActive) {
      return <EmployeeDashboardModule subTab={activeEmployeeDashboardSubTab} />;
    }

    switch (activeTab) {
      case 'dashboard':
        return canViewReports ? <Dashboard onNavigate={handleNavigate} /> : (
          <div className="app-access-denied">You do not have access to this section.</div>
        );
      case 'mis':
        return canViewReports ? <MIS onNavigate={handleNavigate} /> : (
          <div className="app-access-denied">You do not have access to this section.</div>
        );
      default:
        return canViewReports ? <Dashboard onNavigate={handleNavigate} /> : (
          <div className="app-access-denied">Select a module from the navigation menu for your role.</div>
        );
    }
  };

  return (
    <div className="App">
      <div className="app-header-shell">
      <header className="app-topbar">
        <div className="app-topbar-brand">
          <h1>RetailOSA</h1>
          <p className="app-brand-powered-by">Powered by CodeLife Technologies Pvt. Ltd.</p>
        </div>
        <div className="app-topbar-user">
          <span>{user?.username || user?.email}</span>
          <button type="button" className="btn-logout" onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      <nav className="app-navbar" aria-label="Main navigation">
          {canViewReports && (
            <>
              <button
                className={activeTab === 'dashboard' ? 'nav-item active' : 'nav-item'}
                onClick={() => handleNavigate('dashboard')}
              >
                📊 Dashboard
              </button>
              <button
                className={activeTab === 'mis' ? 'nav-item active' : 'nav-item'}
                onClick={() => handleNavigate('mis')}
              >
                📊 Business Reports
              </button>
            </>
          )}
          {showMasterNav && (
          <div className="nav-dropdown">
            <button
              type="button"
              className={`nav-item nav-dropdown-toggle${isMasterActive ? ' active' : ''}`}
              onClick={() => toggleNavDropdown('master')}
              aria-expanded={openNavDropdown === 'master'}
            >
              <span>🗂️ Master</span>
              <span className={`nav-chevron${openNavDropdown === 'master' ? ' open' : ''}`}>▾</span>
            </button>
            {openNavDropdown === 'master' && (
              <div className="nav-dropdown-menu">
                {MASTER_GROUPS.map((group) => (
                  <div key={group.label} className="nav-subgroup">
                    <span className="nav-subgroup-label">{group.label}</span>
                    {group.tabs.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        className={`nav-subitem${activeMasterSubTab === tab.id && isMasterActive ? ' active' : ''}`}
                        onClick={() => handleNavigate(`master:${tab.id}`)}
                      >
                        <span>{tab.icon}</span>
                        {tab.label}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
          )}
          {showInventoryNav && (
          <div className="nav-dropdown">
            <button
              type="button"
              className={`nav-item nav-dropdown-toggle${isInventoryActive ? ' active' : ''}`}
              onClick={() => toggleNavDropdown('inventory')}
              aria-expanded={openNavDropdown === 'inventory'}
            >
              <span>📦 Inventory</span>
              <span className={`nav-chevron${openNavDropdown === 'inventory' ? ' open' : ''}`}>▾</span>
            </button>
            {openNavDropdown === 'inventory' && (
              <div className="nav-dropdown-menu">
                {visibleInventoryGroups.map((group) => (
                  <div key={group.label} className="nav-subgroup">
                    <span className="nav-subgroup-label">{group.label}</span>
                    {group.tabs.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        className={`nav-subitem${activeInventorySubTab === tab.id && isInventoryActive ? ' active' : ''}`}
                        onClick={() => handleNavigate(`inventory:${tab.id}`)}
                      >
                        <span>{tab.icon}</span>
                        {tab.label}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
          )}
          {visibleProcurementTabs.length > 0 && (
          <div className="nav-dropdown">
            <button
              type="button"
              className={`nav-item nav-dropdown-toggle${isProcurementActive ? ' active' : ''}`}
              onClick={() => toggleNavDropdown('procurement')}
              aria-expanded={openNavDropdown === 'procurement'}
            >
              <span>📑 Procurement</span>
              <span className={`nav-chevron${openNavDropdown === 'procurement' ? ' open' : ''}`}>▾</span>
            </button>
            {openNavDropdown === 'procurement' && (
              <div className="nav-dropdown-menu">
                {visibleProcurementTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`nav-subitem${activeProcurementSubTab === tab.id && isProcurementActive ? ' active' : ''}`}
                    onClick={() => handleNavigate(`procurement:${tab.id}`)}
                  >
                    <span>{tab.icon}</span>
                    {tab.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          )}
          {visibleSalesTabs.length > 0 && (
          <div className="nav-dropdown">
            <button
              type="button"
              className={`nav-item nav-dropdown-toggle${isSalesActive ? ' active' : ''}`}
              onClick={() => toggleNavDropdown('sales')}
              aria-expanded={openNavDropdown === 'sales'}
            >
              <span>📦 Shipments</span>
              <span className={`nav-chevron${openNavDropdown === 'sales' ? ' open' : ''}`}>▾</span>
            </button>
            {openNavDropdown === 'sales' && (
              <div className="nav-dropdown-menu">
                {visibleSalesTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`nav-subitem${activeSalesSubTab === tab.id && isSalesActive ? ' active' : ''}`}
                    onClick={() => handleNavigate(`sales-module:${tab.id}`)}
                  >
                    <span>{tab.icon}</span>
                    {tab.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          )}
          {visibleHrTabs.length > 0 && (
          <div className="nav-dropdown">
            <button
              type="button"
              className={`nav-item nav-dropdown-toggle${isHrActive ? ' active' : ''}`}
              onClick={() => toggleNavDropdown('hr')}
              aria-expanded={openNavDropdown === 'hr'}
            >
              <span>👔 HR</span>
              <span className={`nav-chevron${openNavDropdown === 'hr' ? ' open' : ''}`}>▾</span>
            </button>
            {openNavDropdown === 'hr' && (
              <div className="nav-dropdown-menu">
                {visibleHrTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`nav-subitem${activeHrSubTab === tab.id && isHrActive ? ' active' : ''}`}
                    onClick={() => handleNavigate(`hr:${tab.id}`)}
                  >
                    <span>{tab.icon}</span>
                    {tab.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          )}
          {!hasPermission('admin.all') && (
          <div className="nav-dropdown">
            <button
              type="button"
              className={`nav-item nav-dropdown-toggle${isEmployeeDashboardActive ? ' active' : ''}`}
              onClick={() => toggleNavDropdown('employee')}
              aria-expanded={openNavDropdown === 'employee'}
            >
              <span>👤 Employee Dashboard</span>
              <span className={`nav-chevron${openNavDropdown === 'employee' ? ' open' : ''}`}>▾</span>
            </button>
            {openNavDropdown === 'employee' && (
              <div className="nav-dropdown-menu">
                {EMPLOYEE_DASHBOARD_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`nav-subitem${activeEmployeeDashboardSubTab === tab.id && isEmployeeDashboardActive ? ' active' : ''}`}
                    onClick={() => handleNavigate(`employee-dashboard:${tab.id}`)}
                  >
                    <span>{tab.icon}</span>
                    {tab.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          )}
          {visibleUserManagementTabs.length > 0 && (
            <div className="nav-dropdown">
              <button
                type="button"
                className={`nav-item nav-dropdown-toggle${isUserManagementActive ? ' active' : ''}`}
                onClick={() => toggleNavDropdown('user-management')}
                aria-expanded={openNavDropdown === 'user-management'}
              >
                <span>🔐 User Management</span>
                <span className={`nav-chevron${openNavDropdown === 'user-management' ? ' open' : ''}`}>▾</span>
              </button>
              {openNavDropdown === 'user-management' && (
                <div className="nav-dropdown-menu">
                  {visibleUserManagementTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      className={`nav-subitem${activeUserManagementSubTab === tab.id && isUserManagementActive ? ' active' : ''}`}
                      onClick={() => handleNavigate(`user-management:${tab.id}`)}
                    >
                      <span>{tab.icon}</span>
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </nav>
      </div>

      <main className="main-content">
        <PageZoomShell contentKey={activeTab}>{renderContent()}</PageZoomShell>
      </main>
      <EmployeeChatNotifications />
      {birthdayGreeting && (
        <BirthdayCelebration
          greeting={birthdayGreeting}
          onClose={dismissBirthdayGreeting}
        />
      )}
    </div>
  );
}

export default App;
