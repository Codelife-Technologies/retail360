import React from 'react';
import FinanceDashboard from './pages/FinanceDashboard';
import IncomeReport from './pages/IncomeReport';
import ExpenseReport from './pages/ExpenseReport';
import ProfitLoss from './pages/ProfitLoss';
import FinanceSales from './pages/FinanceSales';
import './FinanceModule.css';

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
    default:
      return (
        <div className="finance-module">
          <FinanceDashboard onNavigate={onNavigate} />
        </div>
      );
  }
}

export default FinanceModule;
