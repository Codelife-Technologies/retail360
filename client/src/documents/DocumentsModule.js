import React from 'react';
import DocumentsDashboard from './pages/DocumentsDashboard';
import AiGeneratedImages from './pages/AiGeneratedImages';
import EmployeeDocuments from './pages/EmployeeDocuments';
import StorageAnalytics from './pages/StorageAnalytics';
import DocumentsTrash from './pages/DocumentsTrash';
import DocumentsSettings from './pages/DocumentsSettings';
import './DocumentsModule.css';

function DocumentsModule({ subTab = 'documents-dashboard', onNavigate }) {
  switch (subTab) {
    case 'documents-dashboard':
      return (
        <div className="documents-module">
          <DocumentsDashboard onNavigate={onNavigate} />
        </div>
      );
    case 'ai-generated-images':
      return (
        <div className="documents-module">
          <AiGeneratedImages />
        </div>
      );
    case 'employee-documents':
      return (
        <div className="documents-module">
          <EmployeeDocuments />
        </div>
      );
    case 'storage-analytics':
      return (
        <div className="documents-module">
          <StorageAnalytics />
        </div>
      );
    case 'documents-trash':
      return (
        <div className="documents-module">
          <DocumentsTrash />
        </div>
      );
    case 'documents-settings':
      return (
        <div className="documents-module">
          <DocumentsSettings />
        </div>
      );
    default:
      return (
        <div className="documents-module">
          <DocumentsDashboard onNavigate={onNavigate} />
        </div>
      );
  }
}

export default DocumentsModule;
