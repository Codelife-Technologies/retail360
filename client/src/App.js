import React, { useState, useCallback, useMemo, lazy, Suspense } from 'react';
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
import BirthdayCelebration from './components/BirthdayCelebration';
import './App.css';

/** Split multi-word nav labels onto two lines (first word on top). */
function NavHeadingLabel({ label }) {
  const parts = String(label || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return <span className="nav-item-label">{parts[0] || label}</span>;
  }
  return (
    <span className="nav-item-label is-stacked">
      <span className="nav-item-line">{parts[0]}</span>
      <span className="nav-item-line">{parts.slice(1).join(' ')}</span>
    </span>
  );
}

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

  const mainNavItems = useMemo(() => {
    const items = [];
    if (canViewReports) {
      items.push({
        id: 'dashboard',
        icon: '📊',
        label: 'Dashboard',
        active: activeTab === 'dashboard',
        target: 'dashboard',
      });
      items.push({
        id: 'mis',
        icon: '📈',
        label: 'Business Reports',
        active: activeTab === 'mis',
        target: 'mis',
      });
    }
    if (showMasterNav) {
      items.push({
        id: 'master',
        icon: '🗂️',
        label: 'Master',
        active: isMasterActive,
        target: 'master',
      });
    }
    if (showInventoryNav) {
      items.push({
        id: 'inventory',
        icon: '📦',
        label: 'Inventory',
        active: isInventoryActive,
        target: 'inventory',
      });
    }
    if (visibleProcurementTabs.length > 0) {
      items.push({
        id: 'procurement',
        icon: '📑',
        label: 'Procurement',
        active: isProcurementActive,
        target: 'procurement',
      });
    }
    if (visibleSalesTabs.length > 0) {
      items.push({
        id: 'sales-module',
        icon: '🚚',
        label: 'Shipments',
        active: isSalesActive,
        target: 'sales-module',
      });
    }
    if (visibleHrTabs.length > 0) {
      items.push({
        id: 'hr',
        icon: '👔',
        label: 'HR',
        active: isHrActive,
        target: 'hr',
      });
    }
    if (visibleComplianceTabs.length > 0) {
      items.push({
        id: 'compliance',
        icon: '✅',
        label: 'Compliance',
        active: isComplianceActive,
        target: 'compliance',
      });
    }
    if (visibleFinanceTabs.length > 0) {
      items.push({
        id: 'finance',
        icon: '💼',
        label: 'Finance',
        active: isFinanceActive,
        target: 'finance',
      });
    }
    if (visibleDocumentsTabs.length > 0) {
      items.push({
        id: 'documents',
        icon: '📂',
        label: 'Document Management',
        active: isDocumentsActive,
        target: 'documents',
      });
    }
    if (visibleUtilitiesTabs.length > 0) {
      items.push({
        id: 'utilities',
        icon: '🛠️',
        label: 'Utilities',
        active: isUtilitiesActive,
        target: 'utilities',
      });
    }
    if (showEmployeeDashboardNav) {
      items.push({
        id: 'employee-dashboard',
        icon: '👤',
        label: 'Employee Dashboard',
        active: isEmployeeDashboardActive,
        target: 'employee-dashboard',
      });
    }
    if (visibleUserManagementTabs.length > 0) {
      items.push({
        id: 'user-management',
        icon: '🔐',
        label: 'User Management',
        active: isUserManagementActive,
        target: 'user-management',
      });
    }
    return items;
  }, [
    canViewReports,
    showMasterNav,
    showInventoryNav,
    visibleProcurementTabs.length,
    visibleSalesTabs.length,
    visibleHrTabs.length,
    visibleComplianceTabs.length,
    visibleFinanceTabs.length,
    visibleDocumentsTabs.length,
    visibleUtilitiesTabs.length,
    showEmployeeDashboardNav,
    visibleUserManagementTabs.length,
    activeTab,
    isMasterActive,
    isInventoryActive,
    isProcurementActive,
    isSalesActive,
    isHrActive,
    isComplianceActive,
    isFinanceActive,
    isDocumentsActive,
    isUtilitiesActive,
    isEmployeeDashboardActive,
    isUserManagementActive,
  ]);

  /** Module page list — shown in the left sidebar (main folders stay in the top header). */
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
      <header className="app-topbar app-topbar-unified" aria-label="Main navigation">
        <div className="app-topbar-brand">
          <div className="app-brand-logo" aria-hidden="true">
            <span>R</span>
          </div>
          <div className="app-brand-text">
            <h1>RetailOSA</h1>
          </div>
        </div>

        <nav
          className="app-navbar-dual"
          aria-label="Modules"
          style={{ '--nav-count': String(Math.max(mainNavItems.length, 1)) }}
        >
          <div className="app-nav-logo-bar" role="presentation">
            {mainNavItems.map((item) => (
              <button
                key={`logo-${item.id}`}
                type="button"
                className={`nav-logo-cell${item.active ? ' active' : ''}`}
                onClick={() => handleNavigate(item.target)}
                aria-label={item.label}
                title={item.label}
              >
                <span className="nav-item-logo" aria-hidden="true">{item.icon}</span>
              </button>
            ))}
          </div>
          <div className="app-nav-label-bar" role="presentation">
            {mainNavItems.map((item) => (
              <button
                key={`label-${item.id}`}
                type="button"
                className={`nav-label-cell${item.active ? ' active' : ''}`}
                onClick={() => handleNavigate(item.target)}
              >
                <NavHeadingLabel label={item.label} />
              </button>
            ))}
          </div>
        </nav>

        <div className="app-topbar-user">
          <span>{user?.username || user?.email}</span>
          <button type="button" className="btn-logout" onClick={logout}>
            Logout
          </button>
        </div>
      </header>
      </div>

      <div className={`app-body${moduleSubNav ? ' has-module-sidebar' : ''}`}>
        {moduleSubNav && (
          <aside className="app-module-sidebar" aria-label={`${moduleSubNav.label} pages`}>
            <div className="app-module-sidebar-title">{moduleSubNav.label}</div>
            <nav className="app-module-sidebar-nav">
              {moduleSubNav.grouped
                ? (moduleSubNav.groups || []).map((group) => (
                    <div key={group.label} className="app-module-sidebar-group">
                      <div className="app-module-sidebar-group-label">{group.label}</div>
                      {group.tabs.map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          className={`app-module-sidebar-item${moduleSubNav.activeId === tab.id ? ' active' : ''}`}
                          onClick={() => handleNavigate(`${moduleSubNav.prefix}:${tab.id}`)}
                        >
                          {tab.icon ? <span className="app-module-sidebar-icon">{tab.icon}</span> : null}
                          <span>{tab.label}</span>
                        </button>
                      ))}
                    </div>
                  ))
                : moduleSubNav.items.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      className={`app-module-sidebar-item${moduleSubNav.activeId === tab.id ? ' active' : ''}`}
                      onClick={() => handleNavigate(`${moduleSubNav.prefix}:${tab.id}`)}
                    >
                      {tab.icon ? <span className="app-module-sidebar-icon">{tab.icon}</span> : null}
                      <span>{tab.label}</span>
                    </button>
                  ))}
            </nav>
          </aside>
        )}

        <main className="main-content">
          {renderContent()}
        </main>
      </div>
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
