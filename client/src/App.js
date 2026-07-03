import React, { useState, useEffect, useCallback } from 'react';
import Dashboard from './components/Dashboard';
import MIS from './components/MIS';
import MasterModule from './master/MasterModule';
import ProcurementModule from './procurement/ProcurementModule';
import SalesModule from './sales/SalesModule';
import HrModule from './hr/HrModule';
import { MASTER_GROUPS, isMasterTab, resolveMasterSubTab } from './master/masterTabs';
import {
  PROCUREMENT_TABS,
  isProcurementTab,
  resolveProcurementSubTab,
} from './procurement/procurementTabs';
import { SALES_TABS, isSalesModuleTab, resolveSalesSubTab } from './sales/salesTabs';
import { HR_TABS, isHrTab, resolveHrSubTab } from './hr/hrTabs';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [masterOpen, setMasterOpen] = useState(false);
  const [procurementOpen, setProcurementOpen] = useState(false);
  const [salesOpen, setSalesOpen] = useState(false);
  const [hrOpen, setHrOpen] = useState(false);

  const isMasterActive = activeTab === 'master' || activeTab.startsWith('master:');
  const isProcurementActive =
    activeTab === 'procurement' || activeTab.startsWith('procurement:');
  const isSalesActive =
    activeTab === 'sales-module' || activeTab.startsWith('sales-module:');
  const isHrActive = activeTab === 'hr' || activeTab.startsWith('hr:');
  const activeMasterSubTab = resolveMasterSubTab(activeTab);
  const activeProcurementSubTab = resolveProcurementSubTab(activeTab);
  const activeSalesSubTab = resolveSalesSubTab(activeTab);
  const activeHrSubTab = resolveHrSubTab(activeTab);

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

  const closeModuleDropdowns = useCallback(() => {
    setMasterOpen(false);
    setProcurementOpen(false);
    setSalesOpen(false);
    setHrOpen(false);
  }, []);

  const handleNavigate = useCallback(
    (tab) => {
      if (tab.startsWith('master:')) {
        setActiveTab(tab);
        setMasterOpen(true);
        setProcurementOpen(false);
        setSalesOpen(false);
        setHrOpen(false);
        return;
      }
      if (tab.startsWith('procurement:')) {
        setActiveTab(tab);
        setProcurementOpen(true);
        setMasterOpen(false);
        setSalesOpen(false);
        setHrOpen(false);
        return;
      }
      if (tab.startsWith('sales-module:')) {
        setActiveTab(tab);
        setSalesOpen(true);
        setMasterOpen(false);
        setProcurementOpen(false);
        setHrOpen(false);
        return;
      }
      if (tab.startsWith('hr:')) {
        setActiveTab(tab);
        setHrOpen(true);
        setMasterOpen(false);
        setProcurementOpen(false);
        setSalesOpen(false);
        return;
      }
      if (isMasterTab(tab)) {
        setActiveTab(`master:${tab}`);
        setMasterOpen(true);
        setProcurementOpen(false);
        setSalesOpen(false);
        setHrOpen(false);
        return;
      }
      if (isProcurementTab(tab)) {
        setActiveTab(`procurement:${tab}`);
        setProcurementOpen(true);
        setMasterOpen(false);
        setSalesOpen(false);
        setHrOpen(false);
        return;
      }
      if (isSalesModuleTab(tab)) {
        setActiveTab(`sales-module:${tab}`);
        setSalesOpen(true);
        setMasterOpen(false);
        setProcurementOpen(false);
        setHrOpen(false);
        return;
      }
      if (isHrTab(tab)) {
        setActiveTab(`hr:${tab}`);
        setHrOpen(true);
        setMasterOpen(false);
        setProcurementOpen(false);
        setSalesOpen(false);
        return;
      }
      if (tab === 'master') {
        setActiveTab('master:products');
        setMasterOpen(true);
        setProcurementOpen(false);
        setSalesOpen(false);
        setHrOpen(false);
        return;
      }
      if (tab === 'procurement') {
        setActiveTab('procurement:purchase-requisite');
        setProcurementOpen(true);
        setMasterOpen(false);
        setSalesOpen(false);
        setHrOpen(false);
        return;
      }
      if (tab === 'sales-module') {
        setActiveTab('sales-module:sales');
        setSalesOpen(true);
        setMasterOpen(false);
        setProcurementOpen(false);
        setHrOpen(false);
        return;
      }
      if (tab === 'dashboard' || tab === 'mis') {
        setActiveTab(tab);
        closeModuleDropdowns();
        return;
      }
      if (tab === 'hr') {
        setActiveTab('hr:hr-dashboard');
        setHrOpen(true);
        setMasterOpen(false);
        setProcurementOpen(false);
        setSalesOpen(false);
        return;
      }
      setActiveTab(tab);
      closeModuleDropdowns();
    },
    [closeModuleDropdowns]
  );

  const renderContent = () => {
    if (isMasterActive) {
      return <MasterModule subTab={activeMasterSubTab} />;
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

    switch (activeTab) {
      case 'dashboard':
        return <Dashboard onNavigate={handleNavigate} />;
      case 'mis':
        return <MIS />;
      default:
        return <Dashboard onNavigate={handleNavigate} />;
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
                {PROCUREMENT_TABS.map((tab) => (
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
                {SALES_TABS.map((tab) => (
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
                {HR_TABS.map((tab) => (
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
        </nav>
      </div>
      <div className="main-content">{renderContent()}</div>
    </div>
  );
}

export default App;
