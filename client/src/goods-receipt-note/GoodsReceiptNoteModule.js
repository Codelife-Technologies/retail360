import React, { useState, useEffect } from 'react';
import GrnDashboard from './dashboard/GrnDashboard';
import CreateGrn from './create-grn/CreateGrn';
import ViewGrn from './view-grn/ViewGrn';
import GrnReports from './reports/GrnReports';
import './GoodsReceiptNote.css';

function GoodsReceiptNoteModule({ onNavigate: appNavigate }) {
  const [view, setView] = useState('dashboard');
  const [selectedGrnId, setSelectedGrnId] = useState(null);
  const [preselectedPoId, setPreselectedPoId] = useState('');

  useEffect(() => {
    const raw = sessionStorage.getItem('retail360_grn_from_po');
    if (!raw) return;
    try {
      const { purchaseOrderId } = JSON.parse(raw);
      sessionStorage.removeItem('retail360_grn_from_po');
      if (purchaseOrderId) {
        setPreselectedPoId(purchaseOrderId);
        setView('create');
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const goDashboard = () => {
    setView('dashboard');
    setSelectedGrnId(null);
    setPreselectedPoId('');
  };

  return (
    <div className="grn-module">
      <div className="grn-module-title">
        <h1>Goods Receipt Note</h1>
        <p className="grn-module-subtitle">
          PR → PO → GIS → GRN → Invoice → 3-Way Match → Payment
        </p>
      </div>

      <nav className="grn-module-nav">
        <button type="button" className={view === 'dashboard' ? 'active' : ''} onClick={goDashboard}>
          GRNs
        </button>
        <button
          type="button"
          className={view === 'create' ? 'active' : ''}
          onClick={() => setView('create')}
        >
          Create GRN
        </button>
        <button
          type="button"
          className={view === 'reports' ? 'active' : ''}
          onClick={() => setView('reports')}
        >
          Reports
        </button>
      </nav>

      {view === 'dashboard' && (
        <GrnDashboard
          onNavigate={setView}
          onCreateFromPo={(poId) => {
            setPreselectedPoId(poId);
            setView('create');
          }}
        />
      )}

      {view === 'create' && (
        <CreateGrn
          preselectedPoId={preselectedPoId}
          onCancel={goDashboard}
          onCreated={(id, options = {}) => {
            if (options.confirmed) {
              goDashboard();
              return;
            }
            setSelectedGrnId(id);
            setView('view');
          }}
        />
      )}

      {view === 'reports' && <GrnReports />}

      {view === 'view' && selectedGrnId && (
        <ViewGrn
          grnId={selectedGrnId}
          onBack={goDashboard}
          onNavigatePO={appNavigate}
        />
      )}
    </div>
  );
}

export default GoodsReceiptNoteModule;
