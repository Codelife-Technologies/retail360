import React, { useState, useEffect } from 'react';
import { grnAPI } from '../services/grnApi';
import { purchaseOrdersAPI, locationsAPI } from '../../services/api';
import { isPoEligibleForGrn, emptyDeliveryInfo } from '../types/grn.types';
import GrnPoDetailPanel, { buildDraftLinesFromPo } from '../components/GrnPoDetailPanel';

function normalizePoList(responseData) {
  if (Array.isArray(responseData)) return responseData;
  if (Array.isArray(responseData?.data)) return responseData.data;
  return [];
}

function CreateGrn({ onCreated, onCancel, preselectedPoId }) {
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [locations, setLocations] = useState([]);
  const [poId, setPoId] = useState(preselectedPoId || '');
  const [selectedPo, setSelectedPo] = useState(null);
  const [lineItems, setLineItems] = useState([]);
  const [deliveryInfo, setDeliveryInfo] = useState(emptyDeliveryInfo());
  const [warehouse, setWarehouse] = useState('');
  const [receivingOfficer, setReceivingOfficer] = useState('');
  const [createdByName, setCreatedByName] = useState('');
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
      const [poRes, locRes] = await Promise.all([
        purchaseOrdersAPI.getAll(),
        locationsAPI.getAll({ isActive: 'true' }),
      ]);
      const allPos = normalizePoList(poRes.data);
      let eligible = allPos.filter(isPoEligibleForGrn);

      if (preselectedPoId && !eligible.some((p) => p._id === preselectedPoId)) {
        try {
          const single = await purchaseOrdersAPI.getById(preselectedPoId);
          if (single.data && isPoEligibleForGrn(single.data)) {
            eligible = [single.data, ...eligible];
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
      next[index] = { ...next[index], [field]: parseFloat(value) || 0 };
      return next;
    });
  };

  const updateDelivery = (field, value) => {
    setDeliveryInfo((prev) => ({ ...prev, [field]: value }));
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
      inspectionStatus: 'pending',
    }));

    return {
      warehouse: warehouse || undefined,
      receivingOfficer,
      createdByName,
      deliveryInfo,
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
        performedBy: receivingOfficer || createdByName || 'User',
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
          <p>Select a PO to load full order details — edit receipt quantities, then save as draft or confirm receipt</p>
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
                    {po.poNumber} — {po.supplier?.name || 'Supplier'} ({po.status})
                  </option>
                ))}
              </select>
              {purchaseOrders.length === 0 && !loadError && (
                <p className="grn-field-hint">
                  No eligible POs found. Create a PO with pending items (draft, pending, or approved).
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
              <label>Receiving Officer</label>
              <input value={receivingOfficer} onChange={(e) => setReceivingOfficer(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Created By</label>
              <input value={createdByName} onChange={(e) => setCreatedByName(e.target.value)} />
            </div>
          </div>
        </div>

        {poLoading && <div className="grn-skeleton">Loading PO details…</div>}

        {!poLoading && selectedPo && (
          <GrnPoDetailPanel
            po={selectedPo}
            lineItems={lineItems}
            onLineChange={updateLineItem}
            deliveryInfo={deliveryInfo}
            onDeliveryChange={updateDelivery}
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
