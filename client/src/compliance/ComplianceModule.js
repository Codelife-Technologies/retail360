import React from 'react';
import ComplianceDashboard from './pages/ComplianceDashboard';
import CompanyInformation from './pages/CompanyInformation';
import FilingMasterPage from './pages/FilingMasterPage';
import FilingsPage from './pages/FilingsPage';
import ComplianceCalendar from './pages/ComplianceCalendar';
import DocumentRepository from './pages/DocumentRepository';
import ComplianceReports from './pages/ComplianceReports';
import './ComplianceModule.css';

function ComplianceModule({ subTab = 'compliance-dashboard' }) {
  const renderPanel = () => {
    switch (subTab) {
      case 'compliance-dashboard':
        return <ComplianceDashboard />;
      case 'company-information':
        return <CompanyInformation />;
      case 'filing-master':
        return <FilingMasterPage />;
      case 'filings':
        return <FilingsPage />;
      case 'compliance-calendar':
        return <ComplianceCalendar />;
      case 'document-repository':
        return <DocumentRepository />;
      case 'compliance-reports':
        return <ComplianceReports />;
      default:
        return <ComplianceDashboard />;
    }
  };

  return <div className="compliance-module">{renderPanel()}</div>;
}

export default ComplianceModule;
