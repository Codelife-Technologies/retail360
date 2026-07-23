import React, { useState, useEffect } from 'react';
import { purchaseRequisitesAPI, productsAPI, locationsAPI, suppliersAPI } from '../services/api';
import { getDesignatedSupplierName } from '../utils/purchaseOrderVendorSplit';
import DetailModal from './DetailModal';
import PoProductVendorAssign from './PoProductVendorAssign';
import PoShareActions from './PoShareActions';
import ProductSearchPicker from './ProductSearchPicker';
import { truncateProductName } from '../utils/productDisplayUtils';
import { getCurrentMonthDateRange } from '../utils/monthDateRange';
import './PurchaseRequisite.css';
import './PoShareActions.css';

const STATUS_LABELS = {
  draft: 'Draft',
  pending: 'Pending',
  approved: 'Approved',
  po_created: 'PO Created',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

const isEditablePR = (pr) => ['draft', 'pending'].includes(pr?.status);
const isReadOnlyPR = (pr) => ['po_created', 'closed'].includes(pr?.status);
const canApprovePR = (pr) => isEditablePR(pr);

const emptyAddItemForm = () => ({
  product: '',
  location: '',
  requestedQty: 1,
});

function PurchaseRequisite({ onNavigate }) {
  const [requisites, setRequisites] = useState([]);
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState(() => getCurrentMonthDateRange().fromDate);
  const [dateTo, setDateTo] = useState(() => getCurrentMonthDateRange().toDate);
  const [viewingPR, setViewingPR] = useState(null);
  const [editingPR, setEditingPR] = useState(null);
  const [editItems, setEditItems] = useState([]);
  const [addingToPR, setAddingToPR] = useState(null);
  const [addItemForm, setAddItemForm] = useState(emptyAddItemForm());
  const [addingItems, setAddingItems] = useState(false);
  const [poGeneratedModal, setPoGeneratedModal] = useState(null);
  const [assigningVendorForPo, setAssigningVendorForPo] = useState(null);
  const [showLinkedPos, setShowLinkedPos] = useState(false);

  useEffect(() => {
    fetchRequisites();
    fetchProductsAndLocations();
    fetchSuppliers();
  }, []);

  useEffect(() => {
    const timer = setTimeout(fetchRequisites, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, statusFilter, dateFrom, dateTo]);

  useEffect(() => {
    setShowLinkedPos(false);
  }, [viewingPR?._id]);

  const fetchRequisites = async () => {
    try {
      setLoading(true);
      const params = {};
      if (searchTerm.trim()) params.search = searchTerm.trim();
      if (statusFilter) params.status = statusFilter;
      if (dateFrom) params.fromDate = dateFrom;
      if (dateTo) params.toDate = dateTo;
      const response = await purchaseRequisitesAPI.getAll(params);
      setRequisites(response.data || []);
    } catch (error) {
      console.error('Error fetching purchase requisites:', error);
      alert('Failed to load pur chase requisitions');
    } finally {
      setLoading(false);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const response = await suppliersAPI.getAll();
      setSuppliers(response.data || []);
    } catch (error) {
      console.error('Error loading suppliers:', error);
    }
  };

  const fetchProductsAndLocations = async () => {
    try {
      const [productsRes, locationsRes] = await Promise.all([
        productsAPI.getAll(),
        locationsAPI.getAll({ isActive: 'true' }),
      ]);
      setProducts(productsRes.data?.data || productsRes.data || []);
      setLocations(locationsRes.data || []);
    } catch (error) {
      console.error('Error loading products/locations:', error);
    }
  };

  const isPendingPR = (pr) => pr?.status === 'pending';

  const refreshViewingPR = (updated) => {
    if (viewingPR?._id === updated._id) {
      setViewingPR(updated);
    }
  };

  const totalRequestedQty = (pr) =>
    (pr.items || []).reduce((sum, line) => sum + (line.requestedQty || 0), 0);

  const getLineVendorName = (line) => {
    if (line.supplierName) return line.supplierName;
    if (line.supplier?.name) return line.supplier.name;
    const productId = line.product?._id || line.product;
    const product =
      line.product?.suppliers
        ? line.product
        : products.find((p) => p._id === productId);
    return getDesignatedSupplierName(product, []) || '—';
  };

  const uniqueVendors = (pr) => {
    const names = (pr.items || [])
      .map(getLineVendorName)
      .filter((name) => name && name !== '—');
    return [...new Set(names)];
  };

  const openAddItemsModal = (pr) => {
    setAddingToPR(pr);
    setAddItemForm(emptyAddItemForm());
  };

  const handleAddProductToPR = async (e) => {
    e.preventDefault();
    if (!addingToPR) return;
    if (!addItemForm.product || !addItemForm.location) {
      alert('Select both product and location');
      return;
    }

    try {
      setAddingItems(true);
      const response = await purchaseRequisitesAPI.addItems(addingToPR._id, {
        manualItems: [
          {
            productId: addItemForm.product,
            locationId: addItemForm.location,
            requestedQty: addItemForm.requestedQty,
          },
        ],
      });
      setAddingToPR(null);
      setAddItemForm(emptyAddItemForm());
      fetchRequisites();
      refreshViewingPR(response.data);
      alert(`Product added to ${response.data.prNumber}`);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to add product');
    } finally {
      setAddingItems(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this purchase requisition?')) return;
    try {
      await purchaseRequisitesAPI.delete(id);
      fetchRequisites();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to delete purchase requisition');
    }
  };

  const handleApprove = async (pr) => {
    const pendingVendorNote =
      (pr.items || []).some((line) => !getLineVendorName(line) || getLineVendorName(line) === '—')
        ? '\n\nProducts without a vendor will get a separate PO — you can assign the vendor manually after approval.'
        : '';

    if (
      !window.confirm(
        `Confirm and approve ${pr.prNumber}?\n\nVendor-wise purchase orders will be created automatically.${pendingVendorNote}\n\nEditing and deleting will be locked after approval.`
      )
    ) {
      return;
    }
    try {
      const response = await purchaseRequisitesAPI.approve(pr._id, {});
      const generated = response.data.generatedPurchaseOrders || [];
      fetchRequisites();
      refreshViewingPR(response.data);
      setPoGeneratedModal({
        prNumber: response.data.prNumber,
        purchaseOrders: generated,
      });
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to approve purchase requisition');
    }
  };

  const mapAssignedPo = (po) => ({
    _id: po._id,
    poNumber: po.poNumber,
    supplierName: po.supplierName || po.supplier?.name || '',
    needsVendorAssignment: false,
    status: po.status,
    items: (po.items || []).map((item) => ({
      productId: item.product?._id || item.product || item.productId,
      productTitle: item.product?.title || item.product?.name || item.productTitle || 'Product',
      sku: item.sku || item.product?.sku || '',
      quantity: item.quantity,
    })),
  });

  const handleVendorAssignComplete = (originalPoId, updatedPos) => {
    const mapped = updatedPos.map(mapAssignedPo);
    const updatedById = new Map(mapped.map((po) => [String(po._id), po]));

    setPoGeneratedModal((prev) => {
      if (!prev) return prev;
      const remaining = prev.purchaseOrders.filter(
        (po) => po._id !== originalPoId && !updatedById.has(String(po._id))
      );
      return {
        ...prev,
        purchaseOrders: [...remaining, ...mapped],
      };
    });
    setAssigningVendorForPo(null);
    fetchRequisites();

    const poNumbers = mapped.map((po) => po.poNumber).join('\n');
    const mergedIntoExisting = mapped.length > 0 && !mapped.some((po) => po._id === originalPoId);
    if (mergedIntoExisting) {
      alert(`Vendor assigned. Items added to existing PO(s):\n${poNumbers}`);
    } else if (mapped.length > 1) {
      alert(`Split into ${mapped.length} purchase orders:\n${poNumbers}`);
    }
  };

  const openPurchaseOrders = () => {
    setPoGeneratedModal(null);
    if (onNavigate) onNavigate('purchase-orders');
  };

  const openEditModal = (pr) => {
    setEditingPR(pr);
    setEditItems(
      (pr.items || []).map((line) => ({
        _id: line._id,
        sku: line.sku,
        productTitle: line.productTitle,
        locationName: line.locationName,
        requestedQty: line.requestedQty,
        supplierName: getLineVendorName(line),
      }))
    );
  };

  const handleSaveEdit = async () => {
    try {
      await purchaseRequisitesAPI.update(editingPR._id, {
        items: editingPR.items.map((line) => {
          const edited = editItems.find((e) => e._id === line._id);
          return {
            product: line.product?._id || line.product,
            location: line.location?._id || line.location,
            sku: line.sku,
            productTitle: line.productTitle,
            locationName: line.locationName,
            requestedQty: edited
              ? Math.max(1, Number(edited.requestedQty) || 1)
              : line.requestedQty,
            supplier: line.supplier?._id || line.supplier,
            supplierName: line.supplierName || getLineVendorName(line),
            unitPrice: line.unitPrice,
            notes: line.notes,
          };
        }),
        status: editingPR.status === 'draft' ? 'pending' : editingPR.status,
      });
      setEditingPR(null);
      setEditItems([]);
      await fetchRequisites();
      if (viewingPR?._id === editingPR._id) {
        const refreshed = await purchaseRequisitesAPI.getById(editingPR._id);
        setViewingPR(refreshed.data);
      }
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to update purchase requisition');
    }
  };

  const detailFields = (pr) => [
    { label: 'PR Number', value: pr.prNumber },
    { label: 'PR Name', value: pr.name },
    { label: 'Status', value: STATUS_LABELS[pr.status] || pr.status },
    { label: 'Generated By', value: pr.requestedBy || '—' },
    { label: 'Department', value: pr.department },
    { label: 'Line Items', value: pr.items?.length || 0 },
    { label: 'Vendors', value: uniqueVendors(pr).join(', ') || '—' },
    { label: 'Total Requested Qty', value: totalRequestedQty(pr) },
    { label: 'Approved By', value: pr.approvedBy },
    {
      label: 'Approved At',
      value: pr.approvedAt ? new Date(pr.approvedAt).toLocaleString() : '',
    },
    { label: 'Notes', value: pr.notes, full: true },
    {
      label: 'Created',
      value: pr.createdAt ? new Date(pr.createdAt).toLocaleString() : '',
    },
  ];

  const getLinkedPoNumbers = (pr) => {
    if (!pr?.purchaseOrderNumber) return [];
    return String(pr.purchaseOrderNumber)
      .split(',')
      .map((po) => po.trim())
      .filter(Boolean);
  };

  return (
    <div className="purchase-requisite-container">
      <div className="pr-header">
        <div>
          <h1>Purchase Requisition</h1>
          <p className="pr-subtitle">
            Internal stock requests — on approval, purchase orders are created automatically per vendor.
          </p>
        </div>
        <div className="page-header-actions">
          <button className="btn-secondary" onClick={fetchRequisites} disabled={loading}>
            {loading ? 'Refreshing…' : '🔄 Refresh'}
          </button>
        </div>
      </div>

      <div className="pr-filters">
        <input
          type="text"
          placeholder="Search PR number, notes, PO…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="po_created">PO Created</option>
          <option value="closed">Closed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <label className="pr-date-filter">
          <span>From</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </label>
        <label className="pr-date-filter">
          <span>To</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </label>
        {(dateFrom || dateTo) ? (
          <button
            type="button"
            className="btn-clear-sku-search"
            onClick={() => {
              setDateFrom('');
              setDateTo('');
            }}
          >
            All dates
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="pr-loading">Loading purchase requisitions…</div>
      ) : (
        <div className="pr-table-container">
          <table className="pr-table">
            <thead>
              <tr>
                <th>PR Number</th>
                <th>Status</th>
                <th>Generated By</th>
                <th>Items</th>
                <th>Vendors</th>
                <th>Total Qty</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {requisites.length === 0 ? (
                <tr>
                  <td colSpan="8" className="pr-no-data">
                    No purchase requisitions yet. Create one from the Replenish Report when stock needs reordering.
                  </td>
                </tr>
              ) : (
                requisites.map((pr) => {
                  const vendors = uniqueVendors(pr);
                  return (
                  <tr
                    key={pr._id}
                    className="clickable-row"
                    onClick={() => setViewingPR(pr)}
                  >
                    <td className="pr-number-cell">
                      {pr.prNumber}
                      {pr.name && <div className="pr-name-sub">{pr.name}</div>}
                    </td>
                    <td>
                      <span className={`pr-status-badge status-${pr.status}`}>
                        {STATUS_LABELS[pr.status] || pr.status}
                      </span>
                    </td>
                    <td>{pr.requestedBy || '—'}</td>
                    <td className="text-center">{pr.items?.length || 0}</td>
                    <td className="pr-vendors-cell">
                      {vendors.length > 0 ? vendors.join(', ') : '—'}
                    </td>
                    <td className="text-center font-semibold">{totalRequestedQty(pr)}</td>
                    <td>{pr.createdAt ? new Date(pr.createdAt).toLocaleDateString() : '—'}</td>
                    <td onClick={(e) => e.stopPropagation()} className="pr-actions-cell">
                      {isPendingPR(pr) && (
                        <button className="btn-add" onClick={() => openAddItemsModal(pr)}>
                          + Add
                        </button>
                      )}
                      {canApprovePR(pr) && (
                        <>
                          <button className="btn-edit" onClick={() => openEditModal(pr)}>
                            Edit
                          </button>
                          <button className="btn-approve" onClick={() => handleApprove(pr)}>
                            Approve &amp; Create POs
                          </button>
                          <button className="btn-delete" onClick={() => handleDelete(pr._id)}>
                            Delete
                          </button>
                        </>
                      )}
                      {isReadOnlyPR(pr) && pr.purchaseOrderNumber && (
                        <button
                          className="btn-po"
                          onClick={() => onNavigate && onNavigate('purchase-orders')}
                        >
                          View POs
                        </button>
                      )}
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {viewingPR && (
        <DetailModal
          title={`Purchase Requisition ${viewingPR.prNumber}`}
          fields={detailFields(viewingPR)}
          onClose={() => {
            setViewingPR(null);
            setShowLinkedPos(false);
          }}
          onEdit={
            isEditablePR(viewingPR)
              ? () => {
                  const pr = viewingPR;
                  setViewingPR(null);
                  openEditModal(pr);
                }
              : undefined
          }
          onDelete={
            isEditablePR(viewingPR)
              ? () => {
                  const id = viewingPR._id;
                  setViewingPR(null);
                  handleDelete(id);
                }
              : undefined
          }
        >
          <div className="pr-detail-items">
            <h4>Line Items</h4>
            <table className="pr-items-table">
              <thead>
                <tr>
                  <th>Location</th>
                  <th>SKU</th>
                  <th>Product</th>
                  <th>Vendor</th>
                  <th>Requested</th>
                </tr>
              </thead>
              <tbody>
                {(viewingPR.items || []).map((line) => (
                  <tr key={line._id}>
                    <td>{line.locationName || line.location?.name || '—'}</td>
                    <td className="pr-number-cell">{line.sku || '—'}</td>
                    <td
                      className="pr-product-name"
                      title={line.productTitle || line.product?.title || undefined}
                    >
                      {truncateProductName(line.productTitle || line.product?.title)}
                    </td>
                    <td>{getLineVendorName(line)}</td>
                    <td className="text-center font-semibold">{line.requestedQty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {getLinkedPoNumbers(viewingPR).length > 0 && (
              <div className="pr-linked-pos-section">
                <button
                  type="button"
                  className="btn-secondary pr-linked-pos-toggle"
                  onClick={() => setShowLinkedPos((prev) => !prev)}
                >
                  {showLinkedPos ? 'Hide linked POs' : `Show linked POs (${getLinkedPoNumbers(viewingPR).length})`}
                </button>
                {showLinkedPos && (
                  <ul className="pr-linked-pos-list">
                    {getLinkedPoNumbers(viewingPR).map((poNumber) => (
                      <li key={poNumber}>{poNumber}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {isEditablePR(viewingPR) && (
              <div className="pr-detail-actions">
                {isPendingPR(viewingPR) && (
                  <button
                    className="btn-add"
                    onClick={() => {
                      const pr = viewingPR;
                      setViewingPR(null);
                      openAddItemsModal(pr);
                    }}
                  >
                    + Add Products
                  </button>
                )}
                {canApprovePR(viewingPR) && (
                  <button className="btn-approve" onClick={() => handleApprove(viewingPR)}>
                    Approve &amp; Create POs
                  </button>
                )}
              </div>
            )}
            {isReadOnlyPR(viewingPR) && viewingPR.purchaseOrderNumber && (
              <div className="pr-detail-actions">
                <button type="button" className="btn-primary" onClick={openPurchaseOrders}>
                  View Purchase Orders
                </button>
              </div>
            )}
          </div>
        </DetailModal>
      )}

      {editingPR && (
        <div className="modal-overlay" onClick={() => setEditingPR(null)}>
          <div className="modal-content pr-edit-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Edit {editingPR.prNumber}</h2>
            {isPendingPR(editingPR) && (
              <p className="pr-edit-hint">
                This request is pending — use <strong>+ Add</strong> to add more products to the same PR.
              </p>
            )}
            <table className="pr-items-table">
              <thead>
                <tr>
                  <th>Location</th>
                  <th>SKU</th>
                  <th>Product</th>
                  <th>Vendor</th>
                  <th>Requested Qty</th>
                </tr>
              </thead>
              <tbody>
                {editItems.map((line, index) => (
                  <tr key={line._id}>
                    <td>{line.locationName}</td>
                    <td className="pr-number-cell">{line.sku}</td>
                    <td className="pr-product-name" title={line.productTitle || undefined}>
                      {truncateProductName(line.productTitle)}
                    </td>
                    <td>{line.supplierName || '—'}</td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        value={line.requestedQty}
                        onChange={(e) => {
                          const next = [...editItems];
                          next[index] = {
                            ...next[index],
                            requestedQty: parseInt(e.target.value, 10) || 1,
                          };
                          setEditItems(next);
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="form-actions">
              {isPendingPR(editingPR) && (
                <button
                  type="button"
                  className="btn-add"
                  onClick={() => {
                    const pr = editingPR;
                    setEditingPR(null);
                    openAddItemsModal(pr);
                  }}
                >
                  + Add Products
                </button>
              )}
              <button type="button" onClick={() => setEditingPR(null)}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={handleSaveEdit}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {addingToPR && (
        <div className="modal-overlay" onClick={() => setAddingToPR(null)}>
          <div className="modal-content pr-add-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add Product to {addingToPR.prNumber}</h2>
            <p className="pr-edit-hint">
              Same product + location already on this PR will have quantities combined.
            </p>
            <form onSubmit={handleAddProductToPR}>
              <div className="form-group">
                <label>Product *</label>
                <ProductSearchPicker
                  products={products}
                  value={addItemForm.product}
                  onChange={(productId) =>
                    setAddItemForm((prev) => ({ ...prev, product: productId }))
                  }
                  placeholder="Type title or SKU…"
                  required
                />
              </div>
              <div className="form-group">
                <label>Location *</label>
                <select
                  value={addItemForm.location}
                  onChange={(e) =>
                    setAddItemForm((prev) => ({ ...prev, location: e.target.value }))
                  }
                  required
                >
                  <option value="">Select location</option>
                  {locations.map((location) => (
                    <option key={location._id} value={location._id}>
                      {location.name} ({location.code})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Requested Quantity *</label>
                <input
                  type="number"
                  min="1"
                  value={addItemForm.requestedQty}
                  onChange={(e) =>
                    setAddItemForm((prev) => ({
                      ...prev,
                      requestedQty: parseInt(e.target.value, 10) || 1,
                    }))
                  }
                  required
                />
              </div>
              <div className="form-actions">
                <button type="button" onClick={() => setAddingToPR(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={addingItems}>
                  {addingItems ? 'Adding…' : 'Add to Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {poGeneratedModal && (
        <div className="modal-overlay" onClick={() => setPoGeneratedModal(null)}>
          <div className="modal-content pr-po-generated-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Purchase Orders Created</h2>
            <p className="pr-po-generated-subtitle">
              {poGeneratedModal.purchaseOrders.length} PO
              {poGeneratedModal.purchaseOrders.length === 1 ? '' : 's'} created from{' '}
              {poGeneratedModal.prNumber} (one per vendor). Share via WhatsApp, Email, or
              Download.
            </p>
            <ul className="pr-po-generated-list">
              {poGeneratedModal.purchaseOrders.map((po) => (
                <li key={po._id} className="pr-po-generated-item">
                  <div className="pr-po-generated-row">
                    <strong>{po.poNumber}</strong>
                    <span>
                      {po.needsVendorAssignment ? (
                        <span className="pr-vendor-pending-label">Vendor not assigned</span>
                      ) : (
                        po.supplierName || 'Vendor assigned'
                      )}
                    </span>
                  </div>
                  {!po.needsVendorAssignment && (
                    <PoShareActions po={po} products={products} compact />
                  )}
                  {po.needsVendorAssignment && (
                    <div className="pr-assign-vendor-section">
                      {assigningVendorForPo === po._id ? (
                        <PoProductVendorAssign
                          poId={po._id}
                          poNumber={po.poNumber}
                          suppliers={suppliers}
                          compact
                          onComplete={(updatedPos) => handleVendorAssignComplete(po._id, updatedPos)}
                          onCancel={() => setAssigningVendorForPo(null)}
                        />
                      ) : (
                        <button
                          type="button"
                          className="btn-assign-vendor"
                          onClick={() => setAssigningVendorForPo(po._id)}
                        >
                          Assign Vendors
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <div className="form-actions">
              <button type="button" onClick={() => setPoGeneratedModal(null)}>
                Close
              </button>
              <button type="button" className="btn-primary" onClick={openPurchaseOrders}>
                Open Purchase Orders
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PurchaseRequisite;
