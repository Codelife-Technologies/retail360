import React from 'react';
import FinanceDashboard from './pages/FinanceDashboard';
import IncomeReport from './pages/IncomeReport';
import ExpenseReport from './pages/ExpenseReport';
import ProfitLoss from './pages/ProfitLoss';
import FinanceRecords from './pages/FinanceRecords';
import FinanceSales from './pages/FinanceSales';
import './FinanceModule.css';
import '../components/PurchaseReport.css';

const PurchaseReport = React.lazy(() => import('../components/PurchaseReport'));

function FinanceModule({ subTab = 'finance-dashboard', onNavigate }) {
  switch (subTab) {
    case 'finance-dashboard':
      return (
        <div className="finance-module">
          <FinanceDashboard onNavigate={onNavigate} />
        </div>
      );
    case 'income-report':
      return (
        <div className="finance-module">
          <IncomeReport />
        </div>
      );
    case 'expense-report':
      return (
        <div className="finance-module">
          <ExpenseReport />
        </div>
      );
    case 'profit-loss':
      return (
        <div className="finance-module">
          <ProfitLoss />
        </div>
      );
    case 'sales-report':
      return (
        <div className="finance-module">
          <FinanceSales />
        </div>
      );
    case 'purchase-report':
      return (
        <div className="finance-module finance-report-shell">
          <div className="finance-report-panel">
            <React.Suspense fallback={<div className="fin-skeleton-list"><div className="fin-skeleton-row" /></div>}>
              <PurchaseReport />
            </React.Suspense>
          </div>
        </div>
      );
    case 'finance-reports':
    case 'finance-records':
      return (
        <div className="finance-module">
          <FinanceRecords />
        </div>
      );
    default:
      return (
        <div className="finance-module">
          <FinanceDashboard onNavigate={onNavigate} />
        </div>
      );
  }
}

export default FinanceModule;
