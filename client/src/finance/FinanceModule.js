import React, { lazy, Suspense } from 'react';
import FinanceDashboard from './pages/FinanceDashboard';
import IncomeReport from './pages/IncomeReport';
import ExpenseReport from './pages/ExpenseReport';
import ProfitLoss from './pages/ProfitLoss';
import FinanceRecords from './pages/FinanceRecords';
import './FinanceModule.css';
import '../components/Sales.css';
import '../components/SalesSkuReport.css';
import '../components/PurchaseReport.css';

const SalesSkuReport = lazy(() => import('../components/SalesSkuReport'));
const PurchaseReport = lazy(() => import('../components/PurchaseReport'));

function FinanceModule({ subTab = 'finance-dashboard' }) {
  switch (subTab) {
    case 'finance-dashboard':
      return (
        <div className="finance-module">
          <FinanceDashboard />
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
        <div className="finance-module finance-report-shell">
          <div className="finance-report-panel">
            <div className="sales-container sales-report-page">
              <Suspense fallback={<div className="sales-sku-loading">Loading sales report…</div>}>
                <SalesSkuReport />
              </Suspense>
            </div>
          </div>
        </div>
      );
    case 'purchase-report':
      return (
        <div className="finance-module finance-report-shell">
          <div className="finance-report-panel">
            <Suspense fallback={<div className="sales-sku-loading">Loading purchase report…</div>}>
              <PurchaseReport />
            </Suspense>
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
          <FinanceDashboard />
        </div>
      );
  }
}

export default FinanceModule;
