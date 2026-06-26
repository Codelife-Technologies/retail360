import React, { useEffect, useState } from 'react';
import { grnAPI } from '../services/grnApi';
import { formatINR } from '../types/grn.types';

function GrnReports() {
  const [data, setData] = useState(null);

  useEffect(() => {
    grnAPI.getReports().then((res) => setData(res.data));
  }, []);

  const exportCsv = () => {
    if (!data?.grns?.length) return;
    const headers = ['GRN Number', 'Date', 'Status', 'PO', 'Supplier', 'Grand Total'];
    const rows = data.grns.map((g) => [
      g.grnNumber,
      g.grnDate,
      g.receiptStatus,
      g.purchaseOrderNumber,
      g.supplierDetails?.name,
      g.grandTotal,
    ]);
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'grn-summary.csv';
    a.click();
  };

  return (
    <div className="grn-section">
      <h3>GRN Reports</h3>
      <button type="button" className="btn-secondary" onClick={exportCsv}>Export CSV</button>
      <p>{data?.grns?.length || 0} GRNs in summary · Monthly value {formatINR(data?.stats?.monthlyReceivedValue)}</p>
    </div>
  );
}

export default GrnReports;
