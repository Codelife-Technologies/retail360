import React, { useEffect, useState, useCallback } from 'react';
import { loadPayslipData } from './utils/payslipDataLoader';
import {
  generatePayslipPrintHtml,
  downloadPayslipHtml,
  openPayslipPrintWindow,
  buildPayslipEmailBody,
  buildPayslipFileName,
} from './utils/generatePayslipPrintHtml';
import {
  recordPayslipAction,
  getDownloadHistory,
  getLatestEmailStatus,
} from './utils/payslipHistory';
import PayslipActionBar from './components/PayslipActionBar';
import PayslipMetaPanel from './components/PayslipMetaPanel';
import PayrollSlipDocument from './PayrollSlipDocument';
import './PayrollSlip.css';

function PayrollSlip({ payrollRecord, month, year, onClose }) {
  const [payslipData, setPayslipData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [historyTick, setHistoryTick] = useState(0);

  const payrollId = payrollRecord?._id;

  const refreshHistory = useCallback(() => {
    setHistoryTick((v) => v + 1);
  }, []);

  useEffect(() => {
    let active = true;

    async function fetchData() {
      if (!payrollRecord?._id) return;
      try {
        setLoading(true);
        setError('');
        const data = await loadPayslipData(payrollRecord, month, year);
        if (active) setPayslipData(data);
      } catch (err) {
        console.error('Error loading payslip:', err);
        if (active) setError(err.response?.data?.error || 'Failed to load payslip data');
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchData();
    return () => {
      active = false;
    };
  }, [payrollRecord, month, year]);

  const getPrintHtml = () => (payslipData ? generatePayslipPrintHtml(payslipData) : '');

  const handleDownload = () => {
    if (!payslipData) return;
    const html = getPrintHtml();
    downloadPayslipHtml(html, buildPayslipFileName(payslipData));
    recordPayslipAction({
      payrollId,
      employeeId: payslipData.employeeDetails.employeeId,
      action: 'download',
    });
    refreshHistory();
  };

  const handlePrint = () => {
    if (!payslipData) return;
    openPayslipPrintWindow(getPrintHtml());
    recordPayslipAction({
      payrollId,
      employeeId: payslipData.employeeDetails.employeeId,
      action: 'print',
    });
    refreshHistory();
  };

  const handleEmail = () => {
    if (!payslipData) return;
    const subject = encodeURIComponent(`Salary Payslip — ${payslipData.payrollMonth}`);
    const body = encodeURIComponent(buildPayslipEmailBody(payslipData));
    const email = payslipData.employeeDetails.email !== '—' ? payslipData.employeeDetails.email : '';
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
    recordPayslipAction({
      payrollId,
      employeeId: payslipData.employeeDetails.employeeId,
      action: 'email',
      status: 'initiated',
    });
    refreshHistory();
  };

  const handleShare = async () => {
    if (!payslipData) return;
    const shareText = buildPayslipEmailBody(payslipData);
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Payslip — ${payslipData.payrollMonth}`,
          text: shareText,
        });
        recordPayslipAction({
          payrollId,
          employeeId: payslipData.employeeDetails.employeeId,
          action: 'share',
        });
        refreshHistory();
        return;
      } catch {
        /* fall through to clipboard */
      }
    }
    try {
      await navigator.clipboard.writeText(shareText);
      alert('Payslip summary copied to clipboard.');
      recordPayslipAction({
        payrollId,
        employeeId: payslipData.employeeDetails.employeeId,
        action: 'share',
        meta: { method: 'clipboard' },
      });
      refreshHistory();
    } catch {
      alert('Unable to share payslip on this device.');
    }
  };

  const downloadHistory = payrollId ? getDownloadHistory(payrollId) : [];
  const emailStatus = payrollId ? getLatestEmailStatus(payrollId) : null;
  void historyTick;

  return (
    <div className="payslip-overlay" onClick={onClose}>
      <div className="payslip-shell" onClick={(e) => e.stopPropagation()}>
        <header className="payslip-shell-header">
          <div>
            <h2>Indian Payroll Slip</h2>
            {payslipData && (
              <p>
                {payslipData.employeeDetails.name} · {payslipData.payrollMonth}
              </p>
            )}
          </div>
          <button type="button" className="hr-modal-close" onClick={onClose} aria-label="Close payslip">
            ×
          </button>
        </header>

        <PayslipActionBar
          onDownload={handleDownload}
          onPrint={handlePrint}
          onEmail={handleEmail}
          onShare={handleShare}
          disabled={loading || !payslipData}
        />

        <div className="payslip-body">
          {loading && <div className="hr-loading">Loading payslip...</div>}
          {!loading && error && <div className="payslip-error">{error}</div>}
          {!loading && payslipData && (
            <>
              <PayrollSlipDocument payslipData={payslipData} />
              <PayslipMetaPanel downloadHistory={downloadHistory} emailStatus={emailStatus} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default PayrollSlip;
