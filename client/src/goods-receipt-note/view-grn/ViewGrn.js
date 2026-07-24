import React, { useState, useEffect, useCallback } from 'react';
import { grnAPI } from '../services/grnApi';
import { purchaseOrdersAPI } from '../../services/api';
import { formatINR } from '../types/grn.types';
import GrnStatusBadge from '../components/GrnStatusBadge';
import GrnVarianceTable from '../components/GrnVarianceTable';
import GrnAttachments from '../attachments/GrnAttachments';

function ViewGrn({ grnId, onBack, onNavigatePO }) {
  const [grn, setGrn] = useState(null);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingPayment, setUpdatingPayment] = useState(false);
  const [items, setItems] = useState([]);
  const [deliveryInfo, setDeliveryInfo] = useState({});
  const [followUp, setFollowUp] = useState({});
  const [receivingOfficer, setReceivingOfficer] = useState('');
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [attachmentCategory, setAttachmentCategory] = useState('supplier_invoice');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [grnRes, auditRes] = await Promise.all([
        grnAPI.getById(grnId),
        grnAPI.getAudit(grnId),
      ]);
      setGrn(grnRes.data);
      setItems(grnRes.data.items || []);
      setDeliveryInfo(grnRes.data.deliveryInfo || {});
      setFollowUp(grnRes.data.followUp || {});
      setReceivingOfficer(grnRes.data.receivingOfficer || '');
      setAudit(auditRes.data || []);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to load GRN');
    } finally {
      setLoading(false);
    }
  }, [grnId]);

  useEffect(() => {
    load();
  }, [load]);

  const canEdit = grn && !grn.inventoryUpdated && !['closed', 'cancelled'].includes(grn.receiptStatus);

  const paymentStatus =
    grn?.paymentStatus === 'paid' || grn?.purchaseOrder?.paymentStatus === 'paid'
      ? 'paid'
      : 'unpaid';

  const handlePaymentStatusChange = async (nextStatus) => {
    const next = nextStatus === 'paid' ? 'paid' : 'unpaid';
    if (paymentStatus === next) return;
    const poId = grn?.purchaseOrder?._id || grn?.purchaseOrder;
    if (!poId) {
      alert('No linked purchase order found for this GRN');
      return;
    }
    try {
      setUpdatingPayment(true);
      await purchaseOrdersAPI.update(poId, { paymentStatus: next });
      setGrn((prev) => ({
        ...prev,
        paymentStatus: next,
        purchaseOrder: prev.purchaseOrder && typeof prev.purchaseOrder === 'object'
          ? { ...prev.purchaseOrder, paymentStatus: next }
          : prev.purchaseOrder,
      }));
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update payment status');
    } finally {
      setUpdatingPayment(false);
    }
  };

  const updateItem = (index, field, value) => {
    setItems((prev) => {
      const next = [...prev];
      const current = { ...next[index] };
      const numeric = Math.max(0, parseFloat(value) || 0);

      if (field === 'receivedQty') {
        current.receivedQty = numeric;
        const defective = Math.min(Number(current.rejectedQty) || 0, numeric);
        current.rejectedQty = defective;
        current.acceptedQty = Math.max(0, numeric - defective);
      } else if (field === 'rejectedQty') {
        const received = Number(current.receivedQty) || 0;
        const defective = Math.min(numeric, received);
        current.rejectedQty = defective;
        current.acceptedQty = Math.max(0, received - defective);
      } else if (field === 'acceptedQty') {
        const received = Number(current.receivedQty) || 0;
        const accepted = Math.min(numeric, received);
        current.acceptedQty = accepted;
        current.rejectedQty = Math.max(0, received - accepted);
      } else {
        current[field] = numeric;
      }

      next[index] = current;
      return next;
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const res = await grnAPI.update(grnId, {
        items,
        deliveryInfo,
        followUp,
        receivingOfficer,
        deliveryDate: deliveryInfo.receivedDate || null,
      });
      setGrn(res.data);
      setItems(res.data.items);
      setReceivingOfficer(res.data.receivingOfficer || '');
    } catch (err) {
      alert(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmReceipt = async () => {
    if (!window.confirm('Confirm receipt? This will update inventory, the PO, and create a purchase record.')) {
      return;
    }
    try {
      setSaving(true);
      const res = await grnAPI.submitInspection(grnId, { performedBy: 'User' });
      setGrn(res.data);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to confirm receipt');
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = async () => {
    const res = await grnAPI.getPdf(grnId);
    const w = window.open('', '_blank');
    w.document.write(res.data);
    w.document.close();
  };

  const handleUpload = async () => {
    if (!attachmentFile) return;
    const fd = new FormData();
    fd.append('file', attachmentFile);
    fd.append('category', attachmentCategory);
    fd.append('uploadedBy', 'User');
    try {
      await grnAPI.uploadAttachment(grnId, fd);
      setAttachmentFile(null);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Upload failed');
    }
  };

  if (loading || !grn) {
    return <div className="grn-skeleton">Loading GRN…</div>;
  }

  return (
    <div className="grn-view-page">
      <div className="grn-page-header sticky-header">
        <div>
          <h2>{grn.grnNumber}</h2>
          <GrnStatusBadge status={grn.receiptStatus} />
        </div>
        <div className="grn-header-actions">
          <button type="button" className="btn-secondary" onClick={onBack}>Back</button>
          <button type="button" className="btn-secondary" onClick={handlePrint}>Print PDF</button>
          {canEdit && (
            <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          )}
          {canEdit && (
            <button type="button" className="btn-primary" onClick={handleConfirmReceipt} disabled={saving}>
              {saving ? 'Processing…' : 'Confirm Receipt'}
            </button>
          )}
        </div>
      </div>

      <div className="grn-sections">
        <section className="grn-section">
          <h3>GRN Header</h3>
          <div className="grn-detail-grid">
            <div><label>GRN Date</label><span>{new Date(grn.grnDate).toLocaleDateString('en-IN')}</span></div>
            <div>
              <label>Delivery Date</label>
              <span>
                {(grn.deliveryDate || grn.deliveryInfo?.receivedDate)
                  ? new Date(grn.deliveryDate || grn.deliveryInfo.receivedDate).toLocaleDateString('en-IN')
                  : '—'}
              </span>
            </div>
            <div><label>Time</label><span>{grn.grnTime || '—'}</span></div>
            <div><label>Warehouse</label><span>{grn.warehouse?.name} ({grn.locationCode})</span></div>
            <div>
              <label>Payment Status</label>
              <select
                className={`grn-payment-select status-${paymentStatus}`}
                value={paymentStatus}
                disabled={updatingPayment || !(grn?.purchaseOrder?._id || grn?.purchaseOrder)}
                onChange={(e) => handlePaymentStatusChange(e.target.value)}
                aria-label="Payment status"
              >
                <option value="unpaid">Unpaid</option>
                <option value="paid">Paid</option>
              </select>
            </div>
            <div><label>Receiving Officer</label>
              {canEdit ? (
                <input
                  className="grn-inline-field"
                  value={receivingOfficer}
                  onChange={(e) => setReceivingOfficer(e.target.value)}
                />
              ) : (
                <span>{grn.receivingOfficer || '—'}</span>
              )}
            </div>
          </div>
        </section>

        <section className="grn-section">
          <h3>Reference Documents</h3>
          <div className="grn-ref-links">
            <button type="button" className="grn-link-btn" onClick={() => onNavigatePO?.('purchase-requisite')}>
              PR: {grn.purchaseRequisitionNumber || '—'}
            </button>
            <button type="button" className="grn-link-btn" onClick={() => onNavigatePO?.('purchase-orders')}>
              PO: {grn.purchaseOrderNumber || '—'}
            </button>
            <span className="grn-link-btn static">GIS: {grn.gisNumber || '—'}</span>
            <span>Cost Center: {grn.costCenter || '—'}</span>
          </div>
        </section>

        <section className="grn-section">
          <h3>Supplier</h3>
          <div className="grn-detail-grid">
            <div><label>Name</label><span>{grn.supplierDetails?.name || '—'}</span></div>
            <div><label>Code</label><span>{grn.supplierDetails?.supplierCode || '—'}</span></div>
            <div><label>GSTIN</label><span>{grn.supplierDetails?.gstin || '—'}</span></div>
            <div><label>Contact</label><span>{grn.supplierDetails?.contactPerson || '—'} · {grn.supplierDetails?.phone || ''}</span></div>
          </div>
        </section>

        <section className="grn-section">
          <h3>Delivery Information</h3>
          <div className="grn-detail-grid">
            {[
              ['Invoice Number', 'invoiceNumber', 'text'],
              ['Invoice Date', 'invoiceDate', 'date'],
              ['Delivery Challan', 'deliveryChallanNumber', 'text'],
              ['Challan Date', 'deliveryChallanDate', 'date'],
              ['Transporter', 'transporterName', 'text'],
              ['Vehicle Number', 'vehicleNumber', 'text'],
              ['LR Number', 'lrNumber', 'text'],
              ['E-Way Bill', 'ewayBillNumber', 'text'],
              ['Received By', 'receivedBy', 'text'],
              ['Delivery Date', 'receivedDate', 'date'],
            ].map(([label, field, type]) => (
              <div key={field}>
                <label>{label}</label>
                {canEdit ? (
                  <input
                    type={type}
                    className="grn-inline-field"
                    value={
                      deliveryInfo[field]
                        ? type === 'date'
                          ? new Date(deliveryInfo[field]).toISOString().slice(0, 10)
                          : deliveryInfo[field]
                        : ''
                    }
                    onChange={(e) =>
                      setDeliveryInfo((d) => ({ ...d, [field]: e.target.value }))
                    }
                  />
                ) : (
                  <span>
                    {deliveryInfo[field]
                      ? type === 'date'
                        ? new Date(deliveryInfo[field]).toLocaleDateString('en-IN')
                        : deliveryInfo[field]
                      : '—'}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="grn-section grn-lines-section">
          <h3>Goods Receipt Lines</h3>
          {canEdit && (
            <p className="grn-field-hint">Edit quantities directly in the table, then click Save Changes.</p>
          )}
          <div className="grn-table-wrap sticky-table">
            <table className="grn-table grn-lines-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product</th>
                  <th>HSN</th>
                  <th>Ordered</th>
                  <th>Received</th>
                  <th>Accepted</th>
                  <th>Defective</th>
                  <th>Pending</th>
                  <th>Unit Cost</th>
                  <th>Tax %</th>
                  <th>Line Amt</th>
                  <th>Inspection</th>
                  <th>Stock Before</th>
                  <th>Stock After</th>
                </tr>
              </thead>
              <tbody>
                {items.map((line, idx) => (
                  <tr key={line._id || idx} className={line.varianceQty ? 'variance-row' : ''}>
                    <td className="mono">{line.sku}</td>
                    <td>{line.productName || line.product?.title}</td>
                    <td>{line.hsnCode || '—'}</td>
                    <td>{line.orderedQty}</td>
                    <td>
                      {canEdit ? (
                        <input type="number" min="0" className="grn-inline-input" value={line.receivedQty} onChange={(e) => updateItem(idx, 'receivedQty', e.target.value)} />
                      ) : line.receivedQty}
                    </td>
                    <td>
                      {canEdit ? (
                        <input type="number" min="0" className="grn-inline-input" value={line.acceptedQty} onChange={(e) => updateItem(idx, 'acceptedQty', e.target.value)} />
                      ) : line.acceptedQty}
                    </td>
                    <td>
                      {canEdit ? (
                        <input type="number" min="0" className="grn-inline-input" value={line.rejectedQty} onChange={(e) => updateItem(idx, 'rejectedQty', e.target.value)} />
                      ) : line.rejectedQty}
                    </td>
                    <td>{line.pendingQty}</td>
                    <td>{formatINR(line.unitCost)}</td>
                    <td>{line.taxPercent}%</td>
                    <td>{formatINR(line.lineAmount)}</td>
                    <td>{line.inspectionStatus}</td>
                    <td>{line.stockBefore ?? '—'}</td>
                    <td>{grn.inventoryUpdated ? line.stockAfter : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <GrnVarianceTable items={items} />

        <section className="grn-section">
          <h3>Follow-Up Actions</h3>
          <div className="grn-detail-grid grn-follow-up">
            {[
              ['Replacement Required', 'replacementRequired'],
              ['Return To Vendor (RTV)', 'returnToVendor'],
              ['Credit Note Required', 'creditNoteRequired'],
              ['Reinspection Required', 'reinspectionRequired'],
            ].map(([label, field]) => (
              <label key={field} className="grn-checkbox-label">
                <input
                  type="checkbox"
                  checked={!!followUp[field]}
                  disabled={!canEdit}
                  onChange={(e) =>
                    setFollowUp((f) => ({ ...f, [field]: e.target.checked }))
                  }
                />
                {label}
              </label>
            ))}
            <div className="full-width">
              <label>Remarks</label>
              {canEdit ? (
                <textarea
                  className="grn-inline-field"
                  value={followUp.remarks || ''}
                  onChange={(e) => setFollowUp((f) => ({ ...f, remarks: e.target.value }))}
                />
              ) : (
                <span>{followUp.remarks || '—'}</span>
              )}
            </div>
          </div>
        </section>

        <section className="grn-section">
          <h3>Financial Summary (INR)</h3>
          <div className="grn-financial-summary">
            <div><span>Subtotal</span><strong>{formatINR(grn.subtotal)}</strong></div>
            <div><span>Taxable Value</span><strong>{formatINR(grn.taxableValue)}</strong></div>
            <div><span>CGST</span><strong>{formatINR(grn.cgst)}</strong></div>
            <div><span>SGST</span><strong>{formatINR(grn.sgst)}</strong></div>
            <div><span>Freight</span><strong>{formatINR(grn.freightCharges)}</strong></div>
            <div className="grand"><span>Grand Total</span><strong>{formatINR(grn.grandTotal)}</strong></div>
          </div>
        </section>

        {grn.threeWayMatch && (
          <section className="grn-section">
            <h3>Three-Way Matching</h3>
            <div className={`grn-match status-${grn.threeWayMatch.matchStatus}`}>
              <span>Status: {grn.threeWayMatch.matchStatus}</span>
              {(grn.threeWayMatch.alerts || []).map((a) => (
                <div key={a} className="grn-alert">{a}</div>
              ))}
            </div>
          </section>
        )}

        <GrnAttachments
          attachments={grn.attachments}
          canEdit={canEdit}
          attachmentCategory={attachmentCategory}
          setAttachmentCategory={setAttachmentCategory}
          attachmentFile={attachmentFile}
          setAttachmentFile={setAttachmentFile}
          onUpload={handleUpload}
        />

        <section className="grn-section">
          <h3>Audit Trail</h3>
          <div className="grn-audit-list">
            {audit.map((a) => (
              <div key={a._id} className="grn-audit-item">
                <strong>{a.action}</strong>
                <span>{a.performedBy} · {new Date(a.performedAt).toLocaleString('en-IN')}</span>
                {a.comments && <em>{a.comments}</em>}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export default ViewGrn;
