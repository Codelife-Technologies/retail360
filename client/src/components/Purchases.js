import React, { useState, useEffect, useMemo } from 'react';
import { purchasesAPI, suppliersAPI, productsAPI, purchaseOrdersAPI, locationsAPI, pricesAPI } from '../services/api';
import DetailModal from './DetailModal';
import PurchaseFormModal from './PurchaseFormModal';
import ProductSearchPicker from './ProductSearchPicker';
import { computeCategoryTax, getCategoryName, getTaxRateForCategory } from '../utils/taxRates';
import { getCurrentMonthDateRange } from '../utils/monthDateRange';
import './Purchases.css';
import './ProductSearchPicker.css';

function resolvePurchaseItemSku(item, products = []) {
  if (item?.product?.sku) return String(item.product.sku).trim();
  if (item?.sku) return String(item.sku).trim();
  const productId = item?.product?._id || item?.product;
  if (!productId) return '';
  const product = (products || []).find((p) => String(p._id) === String(productId));
  return product?.sku ? String(product.sku).trim() : '';
}

function resolvePurchaseItemName(item, products = []) {
  if (item?.product?.title || item?.product?.name) {
    return item.product.title || item.product.name;
  }
  const productId = item?.product?._id || item?.product;
  const product = (products || []).find((p) => String(p._id) === String(productId));
  return product?.title || product?.name || 'Unknown';
}

function formatINR(value) {
  return `₹${(Number(value) || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function Purchases() {
  const [purchases, setPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [locations, setLocations] = useState([]);
  const [productPrices, setProductPrices] = useState({}); // Map of productId -> price
  const [loading, setLoading] = useState(true);
  const [skuSearch, setSkuSearch] = useState('');
  const [filters, setFilters] = useState(() => {
    const { fromDate, toDate } = getCurrentMonthDateRange();
    return {
      supplier: '',
      location: '',
      fromDate,
      toDate,
    };
  });
  const [showModal, setShowModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState(null);
  const [viewingPurchase, setViewingPurchase] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportingOne, setExportingOne] = useState(false);
  const [formData, setFormData] = useState({
    supplier: '',
    location: '',
    purchaseOrder: '',
    purchaseDate: new Date().toISOString().split('T')[0],
    items: [],
    tax: 0,
    defaultTaxRate: 0,
    paymentStatus: 'unpaid',
    notes: '',
  });
  const [newItem, setNewItem] = useState({
    product: '',
    quantity: 1,
    unitPrice: 0,
  });

  useEffect(() => {
    fetchSuppliers();
    fetchProducts();
    fetchPurchaseOrders();
    fetchLocations();
  }, []);

  useEffect(() => {
    fetchPurchases();
  }, [filters.supplier, filters.location, filters.fromDate, filters.toDate]);

  const skuQuery = skuSearch.trim().toLowerCase();

  const filteredPurchases = useMemo(() => {
    if (!skuQuery) return purchases;
    return purchases.filter((purchase) =>
      (purchase.items || []).some((item) => {
        const sku = resolvePurchaseItemSku(item, products).toLowerCase();
        const name = resolvePurchaseItemName(item, products).toLowerCase();
        return sku.includes(skuQuery) || name.includes(skuQuery);
      })
    );
  }, [purchases, products, skuQuery]);

  const skuPurchaseTotals = useMemo(() => {
    if (!skuQuery) return null;

    const bySku = new Map();
    let matchedPurchases = 0;

    filteredPurchases.forEach((purchase) => {
      let purchaseMatched = false;
      (purchase.items || []).forEach((item) => {
        const sku = resolvePurchaseItemSku(item, products);
        const name = resolvePurchaseItemName(item, products);
        const skuLower = sku.toLowerCase();
        const nameLower = name.toLowerCase();
        if (!skuLower.includes(skuQuery) && !nameLower.includes(skuQuery)) return;

        purchaseMatched = true;
        const key = sku || name || 'unknown';
        const existing = bySku.get(key) || {
          sku: sku || '—',
          name,
          quantity: 0,
          amount: 0,
          purchaseCount: 0,
          purchaseIds: new Set(),
        };
        existing.quantity += Number(item.quantity) || 0;
        existing.amount += Number(item.total) || 0;
        if (!existing.purchaseIds.has(purchase._id)) {
          existing.purchaseIds.add(purchase._id);
          existing.purchaseCount += 1;
        }
        bySku.set(key, existing);
      });
      if (purchaseMatched) matchedPurchases += 1;
    });

    const rows = [...bySku.values()]
      .map(({ purchaseIds, ...rest }) => rest)
      .sort((a, b) => a.sku.localeCompare(b.sku));

    return {
      rows,
      matchedPurchases,
      totalQuantity: rows.reduce((sum, row) => sum + row.quantity, 0),
      totalAmount: rows.reduce((sum, row) => sum + row.amount, 0),
    };
  }, [filteredPurchases, products, skuQuery]);

  const fetchPurchases = async () => {
    try {
      setLoading(true);
      const params = {};
      if (filters.supplier) params.supplier = filters.supplier;
      if (filters.location) params.location = filters.location;
      if (filters.fromDate) params.fromDate = filters.fromDate;
      if (filters.toDate) params.toDate = filters.toDate;
      const response = await purchasesAPI.getAll(params);
      const data = Array.isArray(response.data) ? response.data : response.data?.data || [];
      setPurchases(data);
    } catch (error) {
      console.error('Error fetching purchases:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack  
      });
      alert('Failed to fetch purchases');
    } finally {
      setLoading(false);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const response = await suppliersAPI.getAll();
      const data = Array.isArray(response.data) ? response.data : response.data?.data || [];
      setSuppliers(data);
    } catch (error) {
      console.error('Error fetching suppliers:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack
      });
    }
  };

  const fetchProducts = async () => {
    try {
      const response = await productsAPI.getAll();
      const productsData = response.data;
      setProducts(productsData);
      
      // Fetch prices for products
      if (productsData.length > 0) {
        const productIds = productsData.map(p => p._id);
        try {
          const pricesResponse = await pricesAPI.getBulkCurrent(productIds);
          const pricesMap = {};
          pricesResponse.data.forEach(price => {
            pricesMap[price.product._id || price.product] = price;
          });
          setProductPrices(pricesMap);
        } catch (error) {
          console.error('Error fetching prices:', error);
          // Don't fail if prices can't be fetched
        }
      }
    } catch (error) {
      console.error('Error fetching products:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack
      });
    }
  };

  const fetchPurchaseOrders = async () => {
    try {
      const response = await purchaseOrdersAPI.getAll({ status: 'approved' });
      setPurchaseOrders(response.data);
    } catch (error) {
      console.error('Error fetching purchase orders:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack
      });
    }
  };

  const fetchLocations = async () => {
    try {
      const response = await locationsAPI.getAll({ isActive: 'true' });
      const data = Array.isArray(response.data) ? response.data : response.data?.data || [];
      setLocations(data);
    } catch (error) {
      console.error('Error fetching locations:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack
      });
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        name === 'tax' || name === 'defaultTaxRate'
          ? parseFloat(value) || 0
          : value,
    }));
  };

  const handlePOChange = async (e) => {
    const poId = e.target.value;
    setFormData((prev) => ({ ...prev, purchaseOrder: poId }));
    
    if (poId) {
      try {
        const po = await purchaseOrdersAPI.getById(poId);
        const poData = po.data;
        setFormData((prev) => ({
          ...prev,
          supplier: poData.supplier._id || poData.supplier,
          items: poData.items.map((item) => ({
            product: item.product._id || item.product,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.total,
          })),
          defaultTaxRate: poData.defaultTaxRate || 0,
        }));
      } catch (error) {
        console.error('Error loading purchase order:', error);
        console.error('Error details:', {
          message: error.message,
          response: error.response?.data,
          status: error.response?.status,
          stack: error.stack,
          purchaseOrderId: poId
        });
      }
    }
  };

  const handleAddItem = () => {
    if (!newItem.product || newItem.quantity <= 0 || newItem.unitPrice <= 0) {
      alert('Please fill in all item fields');
      return;
    }
    const product = products.find((p) => p._id === newItem.product);
    const item = {
      product: newItem.product,
      quantity: parseFloat(newItem.quantity),
      unitPrice: parseFloat(newItem.unitPrice),
      total: parseFloat(newItem.quantity) * parseFloat(newItem.unitPrice),
    };
    setFormData((prev) => ({
      ...prev,
      items: [...prev.items, item],
    }));
    setNewItem({ product: '', quantity: 1, unitPrice: 0 });
  };

  const handleRemoveItem = (index) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const calculateSubtotal = () => {
    return formData.items.reduce((sum, item) => sum + item.total, 0);
  };

  const calculateTax = () => {
    return computeCategoryTax(formData.items, products, formData.defaultTaxRate);
  };

  const calculateTotal = () => {
    return calculateSubtotal() + calculateTax();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.items.length === 0) {
      alert('Please add at least one item');
      return;
    }
    try {
      const data = {
        ...formData,
        subtotal: calculateSubtotal(),
        tax: calculateTax(),
        total: calculateTotal(),
        purchaseOrder: formData.purchaseOrder || undefined,
      };
      if (editingPurchase) {
        await purchasesAPI.update(editingPurchase._id, data);
      } else {
        await purchasesAPI.create(data);
      }
      setShowModal(false);
      setEditingPurchase(null);
      resetForm();
      fetchPurchases();
    } catch (error) {
      console.error('Error saving purchase:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack,
        formData: formData
      });
      alert(error.response?.data?.error || 'Failed to save purchase');
    }
  };

  const handleEdit = (purchase) => {
    setEditingPurchase(purchase);
    setFormData({
      supplier: purchase.supplier._id || purchase.supplier,
      location: purchase.location._id || purchase.location || '',
      purchaseOrder: purchase.purchaseOrder?._id || purchase.purchaseOrder || '',
      purchaseDate: purchase.purchaseDate ? new Date(purchase.purchaseDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      items: purchase.items || [],
      tax: purchase.tax || 0,
      defaultTaxRate: purchase.defaultTaxRate || 0,
      paymentStatus: purchase.paymentStatus === 'paid' ? 'paid' : 'unpaid',
      notes: purchase.notes || '',
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this purchase? This will reverse stock updates.')) {
      return;
    }
    try {
      await purchasesAPI.delete(id);
      fetchPurchases();
    } catch (error) {
      console.error('Error deleting purchase:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack,
        purchaseId: id
      });
      alert('Failed to delete purchase');
    }
  };

  const resetForm = () => {
    setFormData({
      supplier: '',
      location: '',
      purchaseOrder: '',
      purchaseDate: new Date().toISOString().split('T')[0],
      items: [],
      tax: 0,
      defaultTaxRate: 0,
      paymentStatus: 'unpaid',
      notes: '',
    });
    setNewItem({ product: '', quantity: 1, unitPrice: 0 });
  };

  const openAddModal = () => {
    setEditingPurchase(null);
    resetForm();
    setShowAddModal(true);
  };

  const downloadBlob = (blobData, filename) => {
    const url = window.URL.createObjectURL(new Blob([blobData]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleExportExcel = async () => {
    try {
      setExporting(true);
      const params = {};
      if (filters.supplier) params.supplier = filters.supplier;
      if (filters.location) params.location = filters.location;
      if (filters.fromDate) params.fromDate = filters.fromDate;
      if (filters.toDate) params.toDate = filters.toDate;
      const response = await purchasesAPI.exportExcel(params);
      downloadBlob(
        response.data,
        `purchases_${new Date().toISOString().slice(0, 10)}.xlsx`
      );
    } catch (error) {
      console.error('Error exporting purchases:', error);
      alert(error.response?.data?.error || 'Failed to export purchases');
    } finally {
      setExporting(false);
    }
  };

  const handleExportOne = async (purchase) => {
    if (!purchase?._id) return;
    try {
      setExportingOne(true);
      const response = await purchasesAPI.exportOne(purchase._id);
      const safeName = String(purchase.purchaseNumber || purchase._id).replace(
        /[\\/:*?"<>|]/g,
        '_'
      );
      downloadBlob(response.data, `purchase_${safeName}.xlsx`);
    } catch (error) {
      console.error('Error exporting purchase:', error);
      alert(error.response?.data?.error || 'Failed to export purchase');
    } finally {
      setExportingOne(false);
    }
  };

  return (
    <div className="purchases-container">
      <div className="purchases-header">
        <h1>Purchases</h1>
        <div className="purchases-header-actions">
          <button
            type="button"
            className="btn-export"
            onClick={handleExportExcel}
            disabled={loading || exporting || purchases.length === 0}
          >
            {exporting ? 'Exporting…' : '📤 Download Excel'}
          </button>
          <button className="btn-primary" onClick={openAddModal}>
            + Create Purchase
          </button>
        </div>
      </div>

      <div className="purchases-sku-search-bar">
        <div className="purchases-filters-row">
          <div className="purchases-filter-group">
            <label htmlFor="purchases-vendor-filter">Vendor</label>
            <select
              id="purchases-vendor-filter"
              value={filters.supplier}
              onChange={(e) => setFilters((prev) => ({ ...prev, supplier: e.target.value }))}
            >
              <option value="">All Vendors</option>
              {suppliers.map((supplier) => (
                <option key={supplier._id} value={supplier._id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>
          <div className="purchases-filter-group">
            <label htmlFor="purchases-location-filter">Location</label>
            <select
              id="purchases-location-filter"
              value={filters.location}
              onChange={(e) => setFilters((prev) => ({ ...prev, location: e.target.value }))}
            >
              <option value="">All Locations</option>
              {locations.map((location) => (
                <option key={location._id} value={location._id}>
                  {location.name} ({location.code})
                </option>
              ))}
            </select>
          </div>
          <div className="purchases-filter-group">
            <label htmlFor="purchases-from-date">From</label>
            <input
              id="purchases-from-date"
              type="date"
              value={filters.fromDate}
              onChange={(e) => setFilters((prev) => ({ ...prev, fromDate: e.target.value }))}
            />
          </div>
          <div className="purchases-filter-group">
            <label htmlFor="purchases-to-date">To</label>
            <input
              id="purchases-to-date"
              type="date"
              value={filters.toDate}
              onChange={(e) => setFilters((prev) => ({ ...prev, toDate: e.target.value }))}
            />
          </div>
          <button
            type="button"
            className="btn-secondary purchases-filters-clear"
            onClick={() => {
              const { fromDate, toDate } = getCurrentMonthDateRange();
              setFilters((prev) => ({ ...prev, fromDate, toDate }));
            }}
          >
            This month
          </button>
          {(filters.supplier || filters.location || filters.fromDate || filters.toDate) ? (
            <button
              type="button"
              className="btn-clear-sku-search purchases-filters-clear"
              onClick={() => setFilters({ supplier: '', location: '', fromDate: '', toDate: '' })}
            >
              Clear filters
            </button>
          ) : null}
        </div>

        <label htmlFor="purchases-sku-search">Find SKU purchased</label>
        <div className="purchases-sku-search-row">
          <input
            id="purchases-sku-search"
            type="search"
            value={skuSearch}
            onChange={(e) => setSkuSearch(e.target.value)}
            placeholder="Search by SKU or product name…"
            autoComplete="off"
          />
          {skuSearch ? (
            <button type="button" className="btn-clear-sku-search" onClick={() => setSkuSearch('')}>
              Clear
            </button>
          ) : null}
        </div>
        {skuPurchaseTotals ? (
          <div className="purchases-sku-totals">
            <div className="purchases-sku-totals-summary">
              <span>
                <strong>{skuPurchaseTotals.matchedPurchases}</strong> purchase
                {skuPurchaseTotals.matchedPurchases === 1 ? '' : 's'}
              </span>
              <span>
                Total qty: <strong>{skuPurchaseTotals.totalQuantity.toLocaleString('en-IN')}</strong>
              </span>
              <span>
                Total amount: <strong>{formatINR(skuPurchaseTotals.totalAmount)}</strong>
              </span>
            </div>
            {skuPurchaseTotals.rows.length > 0 ? (
              <table className="purchases-sku-totals-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Product</th>
                    <th>Purchases</th>
                    <th>Total Qty</th>
                    <th>Total Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {skuPurchaseTotals.rows.map((row) => (
                    <tr key={row.sku + row.name}>
                      <td>{row.sku}</td>
                      <td>{row.name}</td>
                      <td>{row.purchaseCount}</td>
                      <td>{row.quantity.toLocaleString('en-IN')}</td>
                      <td>{formatINR(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="purchases-sku-empty">No purchased SKU matches “{skuSearch.trim()}”.</p>
            )}
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="loading">Loading purchases...</div>
      ) : (
        <div className="purchases-table-container">
          <table className="purchases-table">
            <thead>
              <tr>
                <th>Purchase #</th>
                <th>Vendor</th>
                <th>Location</th>
                <th>Purchase Date</th>
                <th>PO Number</th>
                <th>Payment Status</th>
                <th>Items</th>
                <th>Total</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPurchases.length === 0 ? (
                <tr>
                  <td colSpan="9" className="no-data">
                    {skuQuery ? 'No purchases found for this SKU' : 'No purchases found'}
                  </td>
                </tr>
              ) : (
                filteredPurchases.map((purchase) => (
                  <tr
                    key={purchase._id}
                    className="clickable-row"
                    onClick={() => setViewingPurchase(purchase)}
                  >
                    <td>{purchase.purchaseNumber}</td>
                    <td>{purchase.supplier?.name || '-'}</td>
                    <td>{purchase.location?.name || '-'}</td>
                    <td>{new Date(purchase.purchaseDate).toLocaleDateString()}</td>
                    <td>{purchase.purchaseOrder?.poNumber || '-'}</td>
                    <td>
                      <span className={`status-badge status-${purchase.paymentStatus === 'paid' ? 'paid' : 'unpaid'}`}>
                        {purchase.paymentStatus === 'paid' ? 'paid' : 'unpaid'}
                      </span>
                    </td>
                    <td>{purchase.items?.length || 0}</td>
                    <td>{formatINR(purchase.total)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button
                        className="btn-edit"
                        onClick={() => handleEdit(purchase)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn-delete"
                        onClick={() => handleDelete(purchase._id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {viewingPurchase && (
        <DetailModal
          title={`Purchase ${viewingPurchase.purchaseNumber || ''}`}
          headerActions={
            <button
              type="button"
              className="btn-secondary"
              onClick={() => handleExportOne(viewingPurchase)}
              disabled={exportingOne}
            >
              {exportingOne ? 'Downloading…' : '📤 Download Excel'}
            </button>
          }
          fields={[
            { label: 'Purchase #', value: viewingPurchase.purchaseNumber },
            { label: 'Vendor', value: viewingPurchase.supplier?.name },
            { label: 'Location', value: viewingPurchase.location?.name },
            { label: 'Purchase Date', value: viewingPurchase.purchaseDate ? new Date(viewingPurchase.purchaseDate).toLocaleDateString() : '' },
            { label: 'PO Number', value: viewingPurchase.purchaseOrder?.poNumber },
            { label: 'Payment Status', value: viewingPurchase.paymentStatus === 'paid' ? 'paid' : 'unpaid' },
            { label: 'Subtotal', value: `₹${(viewingPurchase.subtotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
            { label: 'Tax', value: `₹${(viewingPurchase.tax || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
            { label: 'Total', value: `₹${(viewingPurchase.total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
            { label: 'Notes', value: viewingPurchase.notes, full: true },
          ]}
          onClose={() => setViewingPurchase(null)}
          onEdit={() => {
            const purchase = viewingPurchase;
            setViewingPurchase(null);
            handleEdit(purchase);
          }}
          onDelete={() => {
            const id = viewingPurchase._id;
            setViewingPurchase(null);
            handleDelete(id);
          }}
        >
          {viewingPurchase.items?.length > 0 && (
            <div className="detail-view-section">
              <h3>Items</h3>
              <table className="detail-view-items-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Quantity</th>
                    <th>Unit Price</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {viewingPurchase.items.map((item, idx) => {
                    const product = resolvePurchaseItemName(item, products);
                    const sku = resolvePurchaseItemSku(item, products);
                    return (
                      <tr key={idx}>
                        <td>
                          {product}
                          {sku ? ` (${sku})` : ''}
                        </td>
                        <td>{item.quantity}</td>
                        <td>{formatINR(item.unitPrice)}</td>
                        <td>{formatINR(item.total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </DetailModal>
      )}

      {showAddModal ? (
        <PurchaseFormModal
          onClose={() => setShowAddModal(false)}
          onSaved={() => {
            setShowAddModal(false);
            fetchPurchases();
          }}
        />
      ) : null}

      {showModal && editingPurchase && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <h2>Edit Purchase</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>Purchase Order (Optional)</label>
                  <select
                    name="purchaseOrder"
                    value={formData.purchaseOrder}
                    onChange={handlePOChange}
                  >
                    <option value="">None</option>
                    {purchaseOrders.map((po) => (
                      <option key={po._id} value={po._id}>
                        {po.poNumber} - {po.supplier?.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Vendor *</label>
                  <select
                    name="supplier"
                    value={formData.supplier}
                    onChange={handleInputChange}
                    required
                  >
                    <option value="">Select Vendor</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier._id} value={supplier._id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Vendor Location *</label>
                  <select
                    name="location"
                    value={formData.location}
                    onChange={handleInputChange}
                    required
                  >
                    <option value="">Select Location</option>
                    {locations.map((location) => (
                      <option key={location._id} value={location._id}>
                        {location.name} ({location.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Purchase Date *</label>
                  <input
                    type="date"
                    name="purchaseDate"
                    value={formData.purchaseDate}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Payment Status</label>
                  <select
                    name="paymentStatus"
                    value={formData.paymentStatus}
                    onChange={handleInputChange}
                  >
                    <option value="unpaid">Unpaid</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>
              </div>

              <div className="items-section">
                <h3>Items</h3>
                <div className="add-item-form">
                  <ProductSearchPicker
                    products={products}
                    value={newItem.product}
                    onChange={(productId) => {
                      const price = productPrices[productId];
                      setNewItem({
                        ...newItem,
                        product: productId,
                        unitPrice: price ? price.purchasePrice : 0,
                      });
                    }}
                    placeholder="Type title or SKU…"
                  />
                  <input
                    type="number"
                    placeholder="Quantity"
                    value={newItem.quantity}
                    onChange={(e) =>
                      setNewItem({
                        ...newItem,
                        quantity: parseFloat(e.target.value) || 0,
                      })
                    }
                    min="1"
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Unit Price (₹)"
                    value={newItem.unitPrice}
                    onChange={(e) =>
                      setNewItem({
                        ...newItem,
                        unitPrice: parseFloat(e.target.value) || 0,
                      })
                    }
                    min="0"
                  />
                  <button type="button" onClick={handleAddItem} className="btn-add-item">
                    Add Item
                  </button>
                </div>

                <div className="items-list">
                  {formData.items.map((item, index) => {
                    const product = products.find((p) => p._id === item.product);
                    const itemRate = getTaxRateForCategory(
                      getCategoryName(product),
                      formData.defaultTaxRate
                    );
                    return (
                      <div key={index} className="item-row">
                        <span>{product?.title || product?.name || 'Unknown'}</span>
                        <span>Qty: {item.quantity}</span>
                        <span>₹{item.unitPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        <span>₹{item.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        <span className="item-tax-rate">Tax {itemRate}%</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(index)}
                          className="btn-remove-item"
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Default Tax Rate (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    name="defaultTaxRate"
                    value={formData.defaultTaxRate}
                    onChange={handleInputChange}
                    min="0"
                  />
                  <small className="form-hint">
                    Brass/Copper 12%, Gemstone 5% applied automatically. This
                    rate is used for other categories.
                  </small>
                </div>
                <div className="form-group">
                  <label>Tax (auto)</label>
                  <input
                    type="text"
                    value={`₹${calculateTax().toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    disabled
                  />
                </div>
                <div className="form-group">
                  <label>Subtotal</label>
                  <input
                    type="text"
                    value={`₹${calculateSubtotal().toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    disabled
                  />
                </div>
                <div className="form-group">
                  <label>Total</label>
                  <input
                    type="text"
                    value={`₹${calculateTotal().toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    disabled
                    className="total-input"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Notes</label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleInputChange}
                  rows="3"
                />
              </div>

              <div className="form-actions">
                <button type="button" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  {editingPurchase ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Purchases;

