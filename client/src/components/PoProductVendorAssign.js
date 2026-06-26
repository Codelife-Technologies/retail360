import React, { useEffect, useMemo, useState } from 'react';
import { purchaseOrdersAPI, suppliersAPI } from '../services/api';
import './PoProductVendorAssign.css';

function normalizeItemRow(item) {
  const productId = item.product?._id || item.product || item.productId;
  if (!productId) return null;
  const product = item.product;
  return {
    productId: String(productId),
    productTitle: product?.title || product?.name || item.productTitle || 'Product',
    sku: item.sku || product?.sku || '—',
    quantity: item.quantity,
  };
}

function rowsFromItems(rawItems = []) {
  return rawItems.map(normalizeItemRow).filter(Boolean);
}

function PoProductVendorAssign({
  poId,
  poNumber,
  suppliers: suppliersProp = [],
  onComplete,
  onCancel,
  compact = false,
}) {
  const [items, setItems] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [suppliers, setSuppliers] = useState(suppliersProp);
  const [bulkVendorId, setBulkVendorId] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSuppliers(suppliersProp);
  }, [suppliersProp]);

  useEffect(() => {
    if (suppliersProp.length > 0) return undefined;

    let cancelled = false;
    suppliersAPI
      .getAll()
      .then((response) => {
        if (cancelled) return;
        const list = Array.isArray(response.data) ? response.data : response.data?.data || [];
        setSuppliers(list);
      })
      .catch((error) => {
        console.error('Failed to load suppliers:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [suppliersProp.length]);

  useEffect(() => {
    if (!poId) {
      setItems([]);
      setAssignments({});
      setLoading(false);
      setLoadError('Purchase order not found');
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError('');

    purchaseOrdersAPI
      .getById(poId)
      .then((response) => {
        if (cancelled) return;
        const rows = rowsFromItems(response.data?.items || []);
        setItems(rows);
        setAssignments(Object.fromEntries(rows.map((row) => [row.productId, ''])));
        if (rows.length === 0) {
          setLoadError('No products on this purchase order.');
        }
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Failed to load PO items:', error);
        setLoadError(error.response?.data?.error || 'Failed to load purchase order items');
        setItems([]);
        setAssignments({});
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [poId]);

  const allAssigned = useMemo(
    () => items.length > 0 && items.every((row) => assignments[row.productId]),
    [items, assignments]
  );

  const applyBulkVendor = () => {
    if (!bulkVendorId) return;
    setAssignments((prev) => {
      const next = { ...prev };
      items.forEach((row) => {
        next[row.productId] = bulkVendorId;
      });
      return next;
    });
  };

  const handleSave = async () => {
    if (!allAssigned) {
      alert('Please assign a vendor to every product');
      return;
    }

    const payload = {
      assignments: items.map((row) => ({
        productId: row.productId,
        supplierId: assignments[row.productId],
      })),
    };

    const uniqueVendors = new Set(payload.assignments.map((a) => a.supplierId));
    const vendorNames = [...uniqueVendors]
      .map((id) => suppliers.find((s) => String(s._id) === String(id))?.name || id)
      .join(', ');

    if (
      uniqueVendors.size > 1 &&
      !window.confirm(
        `Products will be split into ${uniqueVendors.size} purchase orders by vendor:\n${vendorNames}\n\nContinue?`
      )
    ) {
      return;
    }

    try {
      setSaving(true);
      const response = await purchaseOrdersAPI.assignVendor(poId, payload);
      onComplete?.(response.data.purchaseOrders || []);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to assign vendors');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="po-vendor-assign-loading">Loading products…</p>;
  }

  if (loadError || items.length === 0) {
    return <p className="po-vendor-assign-empty">{loadError || 'No products on this purchase order.'}</p>;
  }

  return (
    <div className={`po-product-vendor-assign ${compact ? 'compact' : ''}`}>
      {!compact && (
        <>
          <h3>Assign vendor per product</h3>
          <p className="po-vendor-assign-hint">
            {poNumber ? (
              <>
                PO <strong>{poNumber}</strong> — choose a vendor for each product. Products with the
                same vendor stay on one PO; different vendors create separate POs.
              </>
            ) : (
              <>Choose a vendor for each product. Different vendors will create separate purchase orders.</>
            )}
          </p>
        </>
      )}

      <div className="po-vendor-bulk-row">
        <label>Apply same vendor to all</label>
        <select value={bulkVendorId} onChange={(e) => setBulkVendorId(e.target.value)}>
          <option value="">Select vendor</option>
          {suppliers.map((supplier) => (
            <option key={supplier._id} value={String(supplier._id)}>
              {supplier.name}
            </option>
          ))}
        </select>
        <button type="button" className="btn-secondary" disabled={!bulkVendorId} onClick={applyBulkVendor}>
          Apply to all
        </button>
      </div>

      <div className="po-vendor-assign-table-wrap">
        <table className="po-vendor-assign-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>SKU</th>
              <th>Qty</th>
              <th>Vendor</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.productId}>
                <td>{row.productTitle}</td>
                <td className="mono">{row.sku}</td>
                <td className="text-center">{row.quantity}</td>
                <td>
                  <select
                    value={assignments[row.productId] || ''}
                    onChange={(e) =>
                      setAssignments((prev) => ({
                        ...prev,
                        [row.productId]: e.target.value,
                      }))
                    }
                  >
                    <option value="">Select vendor</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier._id} value={String(supplier._id)}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="po-vendor-assign-actions">
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        )}
        <button
          type="button"
          className="btn-primary"
          disabled={saving || !allAssigned}
          onClick={handleSave}
        >
          {saving ? 'Saving…' : 'Save vendor assignments'}
        </button>
      </div>
    </div>
  );
}

export default PoProductVendorAssign;
