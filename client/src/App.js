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
import './App.css';

function App() {
  const { user, login, logout, isAuthenticated, loading, hasPermission } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [masterOpen, setMasterOpen] = useState(false);
  const [procurementOpen, setProcurementOpen] = useState(false);
  const [salesOpen, setSalesOpen] = useState(false);
  const [hrOpen, setHrOpen] = useState(false);
  const [userManagementOpen, setUserManagementOpen] = useState(false);
  const [employeeDashboardOpen, setEmployeeDashboardOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);

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
    if (isInventoryActive) setInventoryOpen(true);
  }, [isInventoryActive]);

  useEffect(() => {
    if (isMasterActive) setMasterOpen(true);
  }, [isMasterActive]);

  useEffect(() => {
    if (isProcurementActive) setProcurementOpen(true);
  }, [isProcurementActive]);

  useEffect(() => {
    if (isSalesActive) setSalesOpen(true);
  }, [isSalesActive]);

  useEffect(() => {
    if (isHrActive) setHrOpen(true);
  }, [isHrActive]);

  useEffect(() => {
    if (isUserManagementActive) setUserManagementOpen(true);
  }, [isUserManagementActive]);

  useEffect(() => {
    if (isEmployeeDashboardActive) setEmployeeDashboardOpen(true);
  }, [isEmployeeDashboardActive]);

  const closeModuleDropdowns = useCallback(() => {
    setMasterOpen(false);
    setInventoryOpen(false);
    setProcurementOpen(false);
    setSalesOpen(false);
    setHrOpen(false);
    setUserManagementOpen(false);
    setEmployeeDashboardOpen(false);
  }, []);

  const handleNavigate = useCallback(
    (tab) => {
      if (tab.startsWith('inventory:')) {
        setActiveTab(tab);
        setInventoryOpen(true);
        setMasterOpen(false);
        setProcurementOpen(false);
        setSalesOpen(false);
        setHrOpen(false);
        setUserManagementOpen(false);
        setEmployeeDashboardOpen(false);
        return;
      }
      if (tab.startsWith('master:')) {
        setActiveTab(tab);
        setMasterOpen(true);
        setProcurementOpen(false);
        setSalesOpen(false);
        setHrOpen(false);
        setUserManagementOpen(false);
        setEmployeeDashboardOpen(false);
        return;
      }
      if (tab.startsWith('procurement:')) {
        setActiveTab(tab);
        setProcurementOpen(true);
        setMasterOpen(false);
        setSalesOpen(false);
        setHrOpen(false);
        setUserManagementOpen(false);
        setEmployeeDashboardOpen(false);
        return;
      }
      if (tab.startsWith('sales-module:')) {
        setActiveTab(tab);
        setSalesOpen(true);
        setMasterOpen(false);
        setProcurementOpen(false);
        setHrOpen(false);
        setUserManagementOpen(false);
        setEmployeeDashboardOpen(false);
        return;
      }
      if (tab.startsWith('hr:')) {
        setActiveTab(tab);
        setHrOpen(true);
        setMasterOpen(false);
        setProcurementOpen(false);
        setSalesOpen(false);
        setUserManagementOpen(false);
        setEmployeeDashboardOpen(false);
        return;
      }
      if (tab.startsWith('user-management:')) {
        setActiveTab(tab);
        setUserManagementOpen(true);
        setMasterOpen(false);
        setProcurementOpen(false);
        setSalesOpen(false);
        setHrOpen(false);
        setEmployeeDashboardOpen(false);
        return;
      }
      if (tab.startsWith('employee-dashboard:')) {
        setActiveTab(tab);
        setEmployeeDashboardOpen(true);
        setMasterOpen(false);
        setProcurementOpen(false);
        setSalesOpen(false);
        setHrOpen(false);
        setUserManagementOpen(false);
        return;
      }
      if (isInventoryTab(tab)) {
        setActiveTab(`inventory:${tab}`);
        setInventoryOpen(true);
        setMasterOpen(false);
        setProcurementOpen(false);
        setSalesOpen(false);
        setHrOpen(false);
        setUserManagementOpen(false);
        setEmployeeDashboardOpen(false);
        return;
      }
      if (isMasterTab(tab)) {
        setActiveTab(`master:${tab}`);
        setMasterOpen(true);
        setProcurementOpen(false);
        setSalesOpen(false);
        setHrOpen(false);
        setUserManagementOpen(false);
        setEmployeeDashboardOpen(false);
        return;
      }
      if (isProcurementTab(tab)) {
        setActiveTab(`procurement:${tab}`);
        setProcurementOpen(true);
        setMasterOpen(false);
        setSalesOpen(false);
        setHrOpen(false);
        setUserManagementOpen(false);
        setEmployeeDashboardOpen(false);
        return;
      }
      if (isSalesModuleTab(tab)) {
        setActiveTab(`sales-module:${tab}`);
        setSalesOpen(true);
        setMasterOpen(false);
        setProcurementOpen(false);
        setHrOpen(false);
        setUserManagementOpen(false);
        setEmployeeDashboardOpen(false);
        return;
      }
      if (isHrTab(tab)) {
        setActiveTab(`hr:${tab}`);
        setHrOpen(true);
        setMasterOpen(false);
        setProcurementOpen(false);
        setSalesOpen(false);
        setUserManagementOpen(false);
        setEmployeeDashboardOpen(false);
        return;
      }
      if (isUserManagementTab(tab)) {
        setActiveTab(`user-management:${tab}`);
        setUserManagementOpen(true);
        setMasterOpen(false);
        setProcurementOpen(false);
        setSalesOpen(false);
        setHrOpen(false);
        setEmployeeDashboardOpen(false);
        return;
      }
      if (isEmployeeDashboardTab(tab)) {
        setActiveTab(`employee-dashboard:${tab}`);
        setEmployeeDashboardOpen(true);
        setMasterOpen(false);
        setProcurementOpen(false);
        setSalesOpen(false);
        setHrOpen(false);
        setUserManagementOpen(false);
        return;
      }
      if (tab === 'inventory') {
        const firstTab = visibleInventoryGroups[0]?.tabs[0]?.id || 'stock';
        setActiveTab(`inventory:${firstTab}`);
        setInventoryOpen(true);
        setMasterOpen(false);
        setProcurementOpen(false);
        setSalesOpen(false);
        setHrOpen(false);
        setUserManagementOpen(false);
        setEmployeeDashboardOpen(false);
        return;
      }
      if (tab === 'master') {
        setActiveTab('master:products');
        setMasterOpen(true);
        setProcurementOpen(false);
        setSalesOpen(false);
        setHrOpen(false);
        setUserManagementOpen(false);
        setEmployeeDashboardOpen(false);
        return;
      }
      if (tab === 'procurement') {
        const firstTab = visibleProcurementTabs[0]?.id || 'purchase-requisite';
        setActiveTab(`procurement:${firstTab}`);
        setProcurementOpen(true);
        setMasterOpen(false);
        setSalesOpen(false);
        setHrOpen(false);
        setUserManagementOpen(false);
        setEmployeeDashboardOpen(false);
        return;
      }
      if (tab === 'sales-module') {
        const firstTab = visibleSalesTabs[0]?.id || 'sales';
        setActiveTab(`sales-module:${firstTab}`);
        setSalesOpen(true);
        setMasterOpen(false);
        setProcurementOpen(false);
        setHrOpen(false);
        setUserManagementOpen(false);
        setEmployeeDashboardOpen(false);
        return;
      }
      if (tab === 'dashboard' || tab === 'mis') {
        setActiveTab(tab);
        closeModuleDropdowns();
        return;
      }
      if (tab === 'hr') {
        const firstTab = visibleHrTabs[0]?.id || 'hr-dashboard';
        setActiveTab(`hr:${firstTab}`);
        setHrOpen(true);
        setMasterOpen(false);
        setProcurementOpen(false);
        setSalesOpen(false);
        setUserManagementOpen(false);
        setEmployeeDashboardOpen(false);
        return;
      }
      if (tab === 'user-management') {
        const firstTab = visibleUserManagementTabs[0]?.id || 'users';
        setActiveTab(`user-management:${firstTab}`);
        setUserManagementOpen(true);
        setMasterOpen(false);
        setProcurementOpen(false);
        setSalesOpen(false);
        setHrOpen(false);
        setEmployeeDashboardOpen(false);
        return;
      }
      if (tab === 'employee-dashboard') {
        setActiveTab('employee-dashboard:home');
        setEmployeeDashboardOpen(true);
        setMasterOpen(false);
        setProcurementOpen(false);
        setSalesOpen(false);
        setHrOpen(false);
        setUserManagementOpen(false);
        return;
      }
      setActiveTab(tab);
      closeModuleDropdowns();
    },
    [closeModuleDropdowns, visibleUserManagementTabs, visibleInventoryGroups, visibleProcurementTabs, visibleSalesTabs, visibleHrTabs]
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
        return canViewReports ? <MIS /> : (
          <div className="app-access-denied">You do not have access to this section.</div>
        );
      default:
        return canViewReports ? <Dashboard onNavigate={handleNavigate} /> : (
          <div className="app-access-denied">Select a module from the sidebar for your role.</div>
        );
    }
  };

  return (
    <div className="App">
      <div className="sidebar">
        <div className="sidebar-header">
          <h1>RetailOS</h1>
          <div className="sidebar-user">
            <span>{user?.username || user?.email}</span>
            <button type="button" className="btn-logout" onClick={logout}>
              Logout
            </button>
          </div>
        </div>
        <nav className="sidebar-nav">
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
                📊 MIS Reports
              </button>
            </>
          )}
          {showMasterNav && (
          <div className="nav-dropdown">
            <button
              type="button"
              className={`nav-item nav-dropdown-toggle${isMasterActive ? ' active' : ''}`}
              onClick={() => setMasterOpen((open) => !open)}
              aria-expanded={masterOpen}
            >
              <span>🗂️ Master</span>
              <span className={`nav-chevron${masterOpen ? ' open' : ''}`}>▾</span>
            </button>
            {masterOpen && (
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
              onClick={() => setInventoryOpen((open) => !open)}
              aria-expanded={inventoryOpen}
            >
              <span>📦 Inventory</span>
              <span className={`nav-chevron${inventoryOpen ? ' open' : ''}`}>▾</span>
            </button>
            {inventoryOpen && (
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
              onClick={() => setProcurementOpen((open) => !open)}
              aria-expanded={procurementOpen}
            >
              <span>📑 Procurement</span>
              <span className={`nav-chevron${procurementOpen ? ' open' : ''}`}>▾</span>
            </button>
            {procurementOpen && (
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
              onClick={() => setSalesOpen((open) => !open)}
              aria-expanded={salesOpen}
            >
              <span>🛒 Sales</span>
              <span className={`nav-chevron${salesOpen ? ' open' : ''}`}>▾</span>
            </button>
            {salesOpen && (
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
              onClick={() => setHrOpen((open) => !open)}
              aria-expanded={hrOpen}
            >
              <span>👔 HR</span>
              <span className={`nav-chevron${hrOpen ? ' open' : ''}`}>▾</span>
            </button>
            {hrOpen && (
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
              onClick={() => setEmployeeDashboardOpen((open) => !open)}
              aria-expanded={employeeDashboardOpen}
            >
              <span>👤 Employee Dashboard</span>
              <span className={`nav-chevron${employeeDashboardOpen ? ' open' : ''}`}>▾</span>
            </button>
            {employeeDashboardOpen && (
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
                onClick={() => setUserManagementOpen((open) => !open)}
                aria-expanded={userManagementOpen}
              >
                <span>🔐 User Management</span>
                <span className={`nav-chevron${userManagementOpen ? ' open' : ''}`}>▾</span>
              </button>
              {userManagementOpen && (
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
      <div className="main-content">
        <PageZoomShell contentKey={activeTab}>{renderContent()}</PageZoomShell>
      </div>
    </div>
  );
}

export default App;
