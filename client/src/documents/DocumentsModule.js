import React from 'react';
import DocumentsDriveShell from './DocumentsDriveShell';
import './DocumentsModule.css';

/**
 * Document Management entry — Google Drive–style shell.
 * Legacy page components remain available for settings embed / reference.
 */
function DocumentsModule({ subTab = 'documents-dashboard', onNavigate }) {
  return (
    <div className="documents-module documents-module-drive">
      <DocumentsDriveShell subTab={subTab} onNavigate={onNavigate} />
    </div>
  );
}

export default DocumentsModule;
