import React, { useState, useEffect } from 'react';
import { grnAPI } from '../services/grnApi';
import { purchaseOrdersAPI, locationsAPI } from '../../services/api';
import { isPoEligibleForGrn, emptyDeliveryInfo } from '../types/grn.types';
import GrnPoDetailPanel, { buildDraftLinesFromPo } from '../components/GrnPoDetailPanel';

function CreateGrn({ onCreated, onCancel, preselectedPoId }) {
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [locations, setLocations] = useState([]);
  const [poId, setPoId] = useState(preselectedPoId || '');
  const [selectedPo, setSelectedPo] = useState(null);
  const [lineItems, setLineItems] = useState([]);
  const [deliveryInfo, setDeliveryInfo] = useState(emptyDeliveryInfo());
  const [warehouse, setWarehouse] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [poLoading, setPoLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    loadPoList();
  }, []);

  useEffect(() => {
    if (preselectedPoId) setPoId(preselectedPoId);
  }, [preselectedPoId]);

  useEffect(() => {
    if (!poId) {
      setSelectedPo(null);
      setLineItems([]);
      setDeliveryInfo(emptyDeliveryInfo());
      return;
    }
    loadSelectedPo(poId);
  }, [poId]);

  const loadPoList = async () => {
    try {
      setLoadError('');
      const [dashRes, locRes] = await Promise.all([
        grnAPI.getDashboard(),
        locationsAPI.getAll({ isActive: 'true' }),
      ]);
      let eligible = dashRes.data?.upcomingPos || [];

      if (preselectedPoId && !eligible.some((p) => String(p._id) === String(preselectedPoId))) {
        try {
          const single = await purchaseOrdersAPI.getById(preselectedPoId);
          if (single.data && isPoEligibleForGrn(single.data)) {
            eligible = [
              {
                _id: single.data._id,
                poNumber: single.data.poNumber,
                supplier: single.data.supplier,
                supplierName: single.data.supplier?.name,
                status: single.data.status,
              },
              ...eligible,
            ];
          }
        } catch {
          /* ignore */
        }
      }

      setPurchaseOrders(eligible);
      setLocations(locRes.data || []);
    } catch (err) {
      console.error(err);
      setLoadError('Failed to load purchase orders. Check that the server is running.');
    }
  };

  const loadSelectedPo = async (id) => {
    try {
      setPoLoading(true);
      const res = await purchaseOrdersAPI.getById(id);
      const po = res.data;
      setSelectedPo(po);
      setLineItems(buildDraftLinesFromPo(po));
      setDeliveryInfo(emptyDeliveryInfo());
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to load purchase order details');
      setSelectedPo(null);
      setLineItems([]);
    } finally {
      setPoLoading(false);
    }
  };

  const updateLineItem = (index, field, value) => {
    setLineItems((prev) => {
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

  const buildPayload = () => {
    const payloadItems = lineItems.map((line) => ({
      product: line.product,
      sku: line.sku,
      productName: line.productName,
      category: line.category,
      hsnCode: line.hsnCode,
      unitOfMeasure: line.unitOfMeasure,
      orderedQty: line.orderedQty,
      receivedQty: line.receivedQty,
      acceptedQty: line.acceptedQty,
      rejectedQty: line.rejectedQty,
      unitCost: line.unitCost,
      taxPercent: line.taxPercent,
      inspectionStatus: (Number(line.rejectedQty) || 0) > 0 ? 'fail' : 'pass',
      defects: (Number(line.rejectedQty) || 0) > 0 ? 'Defective product' : '',
    }));

    const delivery = {
      ...deliveryInfo,
      receivedDate: deliveryDate || deliveryInfo.receivedDate || '',
    };

    return {
      warehouse: warehouse || undefined,
      deliveryDate: deliveryDate || undefined,
      deliveryInfo: delivery,
      items: payloadItems,
      costCenter: selectedPo?.costCenter,
    };
  };

  const createGrn = async () => {
    if (!poId || !selectedPo) {
      alert('Select a Purchase Order');
      return null;
    }
    const res = await grnAPI.createFromPO(poId, buildPayload());
    return res.data;
  };

  const handleSaveDraft = async (e) => {
    e.preventDefault();
    try {
      setLoading('draft');
      const grn = await createGrn();
      if (grn?._id) onCreated(grn._id, { confirmed: false });
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save GRN draft');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmReceipt = async () => {
    if (!poId || !selectedPo) {
      alert('Select a Purchase Order');
      return;
    }
    if (!window.confirm('Confirm receipt? This will create the GRN and update inventory, the PO, and create a purchase record.')) {
      return;
    }
    try {
      setLoading('confirm');
      const grn = await createGrn();
      if (!grn?._id) return;
      await grnAPI.submitInspection(grn._id, {
        performedBy: 'User',
      });
      onCreated(grn._id, { confirmed: true });
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to confirm receipt');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grn-form-page">
      <div className="grn-page-header">
        <div>
          <h2>Create Goods Receipt Note</h2>
        </div>
        <button type="button" className="btn-secondary" onClick={onCancel}>Back</button>
      </div>

      <form onSubmit={handleSaveDraft}>
        <div className="grn-form-card">
          {loadError && <p className="grn-alert">{loadError}</p>}

          <div className="grn-form-grid">
            <div className="form-group">
              <label>Purchase Order *</label>
              <select value={poId} onChange={(e) => setPoId(e.target.value)} required>
                <option value="">Select PO</option>
                {purchaseOrders.map((po) => (
                  <option key={po._id} value={po._id}>
                    {po.poNumber} — {po.supplierName || po.supplier?.name || 'Supplier'}
                    {po.receiptStage === 'partially_received'
                      ? ' (Partially received)'
                      : po.receiptStage === 'defective'
                        ? ' (Defective)'
                        : ''}
                  </option>
                ))}
              </select>
              {purchaseOrders.length === 0 && !loadError && (
                <p className="grn-field-hint">
                  No open POs found. Upcoming and partially received POs with pending items are listed here.
                </p>
              )}
            </div>
            <div className="form-group">
              <label>Warehouse</label>
              <select value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
                <option value="">Default / from PO</option>
                {locations.map((loc) => (
                  <option key={loc._id} value={loc._id}>
                    {loc.name} ({loc.code})
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Delivery Date</label>
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => {
                  const value = e.target.value;
                  setDeliveryDate(value);
                  setDeliveryInfo((prev) => ({ ...prev, receivedDate: value }));
                }}
              />
            </div>
          </div>
        </div>

        {poLoading && <div className="grn-skeleton">Loading PO details…</div>}

        {!poLoading && selectedPo && (
          <GrnPoDetailPanel
            po={selectedPo}
            lineItems={lineItems}
            onLineChange={updateLineItem}
            editable
          />
        )}

        {selectedPo && (
          <div className="form-actions grn-create-actions">
            <button type="button" onClick={onCancel} disabled={!!loading}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn-secondary"
              disabled={!!loading}
            >
              {loading === 'draft' ? 'Saving…' : 'Save Draft'}
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!!loading}
              onClick={handleConfirmReceipt}
            >
              {loading === 'confirm' ? 'Confirming…' : 'Confirm Receipt'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}

export default CreateGrn;
