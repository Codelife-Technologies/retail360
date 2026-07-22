import React, { useState, useCallback, lazy, Suspense } from 'react';
import { useAuth } from './context/AuthContext';
import Dashboard from './components/Dashboard';
import MIS from './components/MIS';
import MasterModule from './master/MasterModule';
import ProcurementModule from './procurement/ProcurementModule';
import SalesModule from './sales/SalesModule';
import UserManagementModule from './userManagement/UserManagementModule';
import InventoryModule from './inventory/InventoryModule';
import Login from './components/Login';
import {
  MASTER_GROUPS,
  isMasterTab,
  resolveMasterSubTab,
  filterMasterGroups,
} from './master/masterTabs';
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
  COMPLIANCE_TABS,
  isComplianceTab,
  resolveComplianceSubTab,
  filterComplianceTabs,
} from './compliance/complianceTabs';
import {
  FINANCE_TABS,
  isFinanceTab,
  resolveFinanceSubTab,
  filterFinanceTabs,
} from './finance/financeTabs';
import {
  DOCUMENTS_TABS,
  isDocumentsTab,
  resolveDocumentsSubTab,
  filterDocumentsTabs,
} from './documents/documentsTabs';
import {
  UTILITIES_TABS,
  isUtilitiesTab,
  resolveUtilitiesSubTab,
  filterUtilitiesTabs,
} from './utilities/utilitiesTabs';
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

const HrModule = lazy(() => import('./hr/HrModule'));
const ComplianceModule = lazy(() => import('./compliance/ComplianceModule'));
const FinanceModule = lazy(() => import('./finance/FinanceModule'));
const DocumentsModule = lazy(() => import('./documents/DocumentsModule'));
const UtilitiesModule = lazy(() => import('./utilities/UtilitiesModule'));
const EmployeeDashboardModule = lazy(() => import('./employeeDashboard/EmployeeDashboardModule'));
const EmployeeChatNotifications = lazy(() => import('./employeeDashboard/components/EmployeeChatNotifications'));

function ModuleLoadingFallback() {
  return <div className="app-loading">Loading module…</div>;
}

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

  const showMasterNav = canViewMaster(hasPermission);
  const visibleMasterGroups = filterMasterGroups(hasPermission, MASTER_GROUPS);
  const visibleMasterTabs = visibleMasterGroups.flatMap((group) => group.tabs);
  const defaultMasterTabId = visibleMasterTabs[0]?.id || 'products';
  const showInventoryNav = !showMasterNav && filterTabGroups(hasPermission, user, INVENTORY_GROUPS).length > 0;
  const visibleInventoryGroups = filterTabGroups(hasPermission, user, INVENTORY_GROUPS);
  const visibleProcurementTabs = filterTabs(hasPermission, user, PROCUREMENT_TABS);
  const visibleSalesTabs = filterTabs(hasPermission, user, SALES_TABS);
  const visibleHrTabs = filterTabs(hasPermission, user, HR_TABS);
  const visibleComplianceTabs = filterComplianceTabs(hasPermission, COMPLIANCE_TABS);
  const visibleFinanceTabs = filterFinanceTabs(hasPermission, FINANCE_TABS);
  const visibleDocumentsTabs = filterDocumentsTabs(hasPermission, DOCUMENTS_TABS);
  const visibleUtilitiesTabs = filterUtilitiesTabs(hasPermission, UTILITIES_TABS);
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
  const isComplianceActive = activeTab === 'compliance' || activeTab.startsWith('compliance:');
  const isFinanceActive = activeTab === 'finance' || activeTab.startsWith('finance:');
  const isDocumentsActive = activeTab === 'documents' || activeTab.startsWith('documents:');
  const isUtilitiesActive = activeTab === 'utilities' || activeTab.startsWith('utilities:');
  const isUserManagementActive =
    activeTab === 'user-management' || activeTab.startsWith('user-management:');
  const isEmployeeDashboardActive =
    activeTab === 'employee-dashboard' || activeTab.startsWith('employee-dashboard:');
  const resolvedMasterSubTab = resolveMasterSubTab(activeTab, defaultMasterTabId);
  const activeMasterSubTab = visibleMasterTabs.some((t) => t.id === resolvedMasterSubTab)
    ? resolvedMasterSubTab
    : defaultMasterTabId;
  const activeProcurementSubTab = resolveProcurementSubTab(activeTab);
  const activeSalesSubTab = resolveSalesSubTab(activeTab);
  const activeHrSubTab = resolveHrSubTab(activeTab);
  const activeComplianceSubTab = resolveComplianceSubTab(activeTab);
  const activeFinanceSubTab = resolveFinanceSubTab(activeTab);
  const activeDocumentsSubTab = resolveDocumentsSubTab(activeTab);
  const activeUtilitiesSubTab = resolveUtilitiesSubTab(activeTab);
  const activeUserManagementSubTab = resolveUserManagementSubTab(activeTab);
  const activeEmployeeDashboardSubTab = resolveEmployeeDashboardSubTab(activeTab);
  const activeInventorySubTab = resolveInventorySubTab(activeTab);
  const visibleInventoryTabs = visibleInventoryGroups.flatMap((group) => group.tabs);
  const showEmployeeDashboardNav = !hasPermission('admin.all');

  /** Secondary sub-header: only when an active folder has multiple pages. */
  let moduleSubNav = null;
  if (isMasterActive && showMasterNav) {
    if (visibleMasterTabs.length > 1) {
      moduleSubNav = {
        label: 'Master',
        items: visibleMasterTabs,
        groups: visibleMasterGroups,
        activeId: activeMasterSubTab,
        prefix: 'master',
        grouped: true,
      };
    }
  } else if (isInventoryActive && showInventoryNav) {
    if (visibleInventoryTabs.length > 1) {
      moduleSubNav = {
        label: 'Inventory',
        items: visibleInventoryTabs,
        activeId: activeInventorySubTab,
        prefix: 'inventory',
      };
    }
  } else if (isProcurementActive && visibleProcurementTabs.length > 1) {
    moduleSubNav = {
      label: 'Procurement',
      items: visibleProcurementTabs,
      activeId: activeProcurementSubTab,
      prefix: 'procurement',
    };
  } else if (isSalesActive && visibleSalesTabs.length > 1) {
    moduleSubNav = {
      label: 'Shipments',
      items: visibleSalesTabs,
      activeId: activeSalesSubTab,
      prefix: 'sales-module',
    };
  } else if (isHrActive && visibleHrTabs.length > 1) {
    moduleSubNav = {
      label: 'HR',
      items: visibleHrTabs,
      activeId: activeHrSubTab,
      prefix: 'hr',
    };
  } else if (isComplianceActive && visibleComplianceTabs.length > 1) {
    moduleSubNav = {
      label: 'Compliance',
      items: visibleComplianceTabs,
      activeId: activeComplianceSubTab,
      prefix: 'compliance',
    };
  } else if (isFinanceActive && visibleFinanceTabs.length > 1) {
    moduleSubNav = {
      label: 'Finance',
      items: visibleFinanceTabs,
      activeId: activeFinanceSubTab,
      prefix: 'finance',
    };
  } else if (isDocumentsActive && visibleDocumentsTabs.length > 1) {
    moduleSubNav = {
      label: 'Document Management',
      items: visibleDocumentsTabs,
      activeId: activeDocumentsSubTab,
      prefix: 'documents',
    };
  } else if (isUtilitiesActive && visibleUtilitiesTabs.length > 1) {
    moduleSubNav = {
      label: 'Utilities',
      items: visibleUtilitiesTabs,
      activeId: activeUtilitiesSubTab,
      prefix: 'utilities',
    };
  } else if (isEmployeeDashboardActive && showEmployeeDashboardNav && EMPLOYEE_DASHBOARD_TABS.length > 1) {
    moduleSubNav = {
      label: 'Employee Dashboard',
      items: EMPLOYEE_DASHBOARD_TABS,
      activeId: activeEmployeeDashboardSubTab,
      prefix: 'employee-dashboard',
    };
  } else if (isUserManagementActive && visibleUserManagementTabs.length > 1) {
    moduleSubNav = {
      label: 'User Management',
      items: visibleUserManagementTabs,
      activeId: activeUserManagementSubTab,
      prefix: 'user-management',
    };
  }

  const handleNavigate = useCallback(
    (tab) => {
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
      if (tab.startsWith('compliance:')) {
        setActiveTab(tab);
        return;
      }
      if (tab.startsWith('finance:')) {
        setActiveTab(tab);
        return;
      }
      if (tab.startsWith('documents:')) {
        setActiveTab(tab);
        return;
      }
      if (tab.startsWith('utilities:')) {
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
      if (isComplianceTab(tab)) {
        setActiveTab(`compliance:${tab}`);
        return;
      }
      if (isFinanceTab(tab)) {
        setActiveTab(`finance:${tab}`);
        return;
      }
      if (isDocumentsTab(tab)) {
        setActiveTab(`documents:${tab}`);
        return;
      }
      if (isUtilitiesTab(tab)) {
        setActiveTab(`utilities:${tab}`);
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
        setActiveTab(`master:${defaultMasterTabId}`);
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
      if (tab === 'compliance') {
        const firstTab = visibleComplianceTabs[0]?.id || 'compliance-dashboard';
        setActiveTab(`compliance:${firstTab}`);
        return;
      }
      if (tab === 'finance') {
        const firstTab = visibleFinanceTabs[0]?.id || 'finance-dashboard';
        setActiveTab(`finance:${firstTab}`);
        return;
      }
      if (tab === 'documents' || tab === 'document-management') {
        const firstTab = visibleDocumentsTabs[0]?.id || 'documents-dashboard';
        setActiveTab(`documents:${firstTab}`);
        return;
      }
      if (tab === 'utilities') {
        const firstTab = visibleUtilitiesTabs[0]?.id || 'image-generator';
        setActiveTab(`utilities:${firstTab}`);
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
    [visibleUserManagementTabs, visibleInventoryGroups, visibleProcurementTabs, visibleSalesTabs, visibleHrTabs, visibleComplianceTabs, visibleFinanceTabs, visibleDocumentsTabs, visibleUtilitiesTabs, defaultMasterTabId]
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
      return (
        <Suspense fallback={<ModuleLoadingFallback />}>
          <HrModule subTab={activeHrSubTab} onNavigate={handleNavigate} />
        </Suspense>
      );
    }
    if (isComplianceActive) {
      return (
        <Suspense fallback={<ModuleLoadingFallback />}>
          <ComplianceModule subTab={activeComplianceSubTab} />
        </Suspense>
      );
    }
    if (isFinanceActive) {
      return (
        <Suspense fallback={<ModuleLoadingFallback />}>
          <FinanceModule subTab={activeFinanceSubTab} onNavigate={handleNavigate} />
        </Suspense>
      );
    }
    if (isDocumentsActive) {
      return (
        <Suspense fallback={<ModuleLoadingFallback />}>
          <DocumentsModule subTab={activeDocumentsSubTab} onNavigate={handleNavigate} />
        </Suspense>
      );
    }
    if (isUtilitiesActive) {
      return (
        <Suspense fallback={<ModuleLoadingFallback />}>
          <UtilitiesModule subTab={activeUtilitiesSubTab} />
        </Suspense>
      );
    }
    if (isUserManagementActive) {
      return (
        <UserManagementModule
          subTab={activeUserManagementSubTab}
          onNavigateSubTab={(tabId) => setActiveTab(`user-management:${tabId}`)}
        />
      );
    }
    if (isEmployeeDashboardActive) {
      return (
        <Suspense fallback={<ModuleLoadingFallback />}>
          <EmployeeDashboardModule subTab={activeEmployeeDashboardSubTab} onNavigate={handleNavigate} />
        </Suspense>
      );
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
                type="button"
                className={activeTab === 'dashboard' ? 'nav-item active' : 'nav-item'}
                onClick={() => handleNavigate('dashboard')}
              >
                📊 Dashboard
              </button>
              <button
                type="button"
                className={activeTab === 'mis' ? 'nav-item active' : 'nav-item'}
                onClick={() => handleNavigate('mis')}
              >
                📊 Business Reports
              </button>
            </>
          )}
          {showMasterNav && (
            <button
              type="button"
              className={`nav-item${isMasterActive ? ' active' : ''}`}
              onClick={() => handleNavigate('master')}
            >
              🗂️ Master
            </button>
          )}
          {showInventoryNav && (
            <button
              type="button"
              className={`nav-item${isInventoryActive ? ' active' : ''}`}
              onClick={() => handleNavigate('inventory')}
            >
              📦 Inventory
            </button>
          )}
          {visibleProcurementTabs.length > 0 && (
            <button
              type="button"
              className={`nav-item${isProcurementActive ? ' active' : ''}`}
              onClick={() => handleNavigate('procurement')}
            >
              📑 Procurement
            </button>
          )}
          {visibleSalesTabs.length > 0 && (
            <button
              type="button"
              className={`nav-item${isSalesActive ? ' active' : ''}`}
              onClick={() => handleNavigate('sales-module')}
            >
              📦 Shipments
            </button>
          )}
          {visibleHrTabs.length > 0 && (
            <button
              type="button"
              className={`nav-item${isHrActive ? ' active' : ''}`}
              onClick={() => handleNavigate('hr')}
            >
              👔 HR
            </button>
          )}
          {visibleComplianceTabs.length > 0 && (
            <button
              type="button"
              className={`nav-item${isComplianceActive ? ' active' : ''}`}
              onClick={() => handleNavigate('compliance')}
            >
              ✅ Compliance
            </button>
          )}
          {visibleFinanceTabs.length > 0 && (
            <button
              type="button"
              className={`nav-item${isFinanceActive ? ' active' : ''}`}
              onClick={() => handleNavigate('finance')}
            >
              💼 Finance
            </button>
          )}
          {visibleDocumentsTabs.length > 0 && (
            <button
              type="button"
              className={`nav-item${isDocumentsActive ? ' active' : ''}`}
              onClick={() => handleNavigate('documents')}
            >
              📂 Document Management
            </button>
          )}
          {visibleUtilitiesTabs.length > 0 && (
            <button
              type="button"
              className={`nav-item${isUtilitiesActive ? ' active' : ''}`}
              onClick={() => handleNavigate('utilities')}
            >
              🛠️ Utilities
            </button>
          )}
          {showEmployeeDashboardNav && (
            <button
              type="button"
              className={`nav-item${isEmployeeDashboardActive ? ' active' : ''}`}
              onClick={() => handleNavigate('employee-dashboard')}
            >
              👤 Employee Dashboard
            </button>
          )}
          {visibleUserManagementTabs.length > 0 && (
            <button
              type="button"
              className={`nav-item${isUserManagementActive ? ' active' : ''}`}
              onClick={() => handleNavigate('user-management')}
            >
              🔐 User Management
            </button>
          )}
        </nav>

        {moduleSubNav && (
          <nav className="app-subnav" aria-label={`${moduleSubNav.label} sub navigation`}>
            <span className="app-subnav-module">{moduleSubNav.label}</span>
            <div className="app-subnav-items">
              {moduleSubNav.grouped
                ? (moduleSubNav.groups || []).map((group) => (
                    <div key={group.label} className="app-subnav-group">
                      <span className="app-subnav-group-label">{group.label}</span>
                      {group.tabs.map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          className={`app-subnav-item${moduleSubNav.activeId === tab.id ? ' active' : ''}`}
                          onClick={() => handleNavigate(`${moduleSubNav.prefix}:${tab.id}`)}
                        >
                          {tab.icon ? <span className="app-subnav-icon">{tab.icon}</span> : null}
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  ))
                : moduleSubNav.items.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      className={`app-subnav-item${moduleSubNav.activeId === tab.id ? ' active' : ''}`}
                      onClick={() => handleNavigate(`${moduleSubNav.prefix}:${tab.id}`)}
                    >
                      {tab.icon ? <span className="app-subnav-icon">{tab.icon}</span> : null}
                      {tab.label}
                    </button>
                  ))}
            </div>
          </nav>
        )}
      </div>

      <main className="main-content">
        <PageZoomShell contentKey={activeTab}>{renderContent()}</PageZoomShell>
      </main>
      <Suspense fallback={null}>
        <EmployeeChatNotifications />
      </Suspense>
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
