import React, { useState, useEffect } from 'react';
import { salesAPI, salesChannelsAPI, salesLocationsAPI, productsAPI, pricesAPI, stockAPI } from '../services/api';
import DetailModal from './DetailModal';
import ExcelUpload from './ExcelUpload';
import SalesSkuReport from './SalesSkuReport';
import { computeCategoryTax, getCategoryName, getTaxRateForCategory, splitTaxAsCgstSgst } from '../utils/taxRates';
import { formatMoney } from '../utils/locationCurrency';
import './Sales.css';
import './SalesSkuReport.css';

const SALES_CURRENCY = 'AED';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const UPLOADS_BASE = API_BASE_URL.replace('/api', '');

const PRODUCT_IMAGE_PLACEHOLDER =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 50 50">
      <rect width="50" height="50" fill="#e5e7eb" rx="8"/>
      <path d="M16 32l6-8 5 6 4-5 9 11H16z" fill="#9ca3af"/>
      <circle cx="20" cy="19" r="3" fill="#9ca3af"/>
    </svg>`
  );

function resolveProductImageUrl(image) {
  if (!image) return null;
  if (image.startsWith('http://') || image.startsWith('https://')) {
    return image;
  }
  if (image.startsWith('products/')) {
    return `${UPLOADS_BASE}/uploads/${image}`;
  }
  return image;
}

function getProductThumbnail(product) {
  if (!product) return null;
  const images = product.images || [];
  const first = images.find((img) => img && img.trim() !== '');
  return first ? resolveProductImageUrl(first) : null;
}

const SALES_SORT_OPTIONS = [
  { value: 'salesDate', label: 'Sale Date' },
  { value: 'channel', label: 'Channel' },
  { value: 'amazonOrderId', label: 'Amazon Order ID' },
  { value: 'customer', label: 'Customer' },
  { value: 'total', label: 'Total Amount' },
];

function getSaleDisplayTitle(sale) {
  if (sale?.amazonOrderId) return `Sale · ${sale.amazonOrderId}`;
  if (sale?.salesDate) {
    return `Sale · ${new Date(sale.salesDate).toLocaleDateString()}`;
  }
  return 'Sale';
}

function Sales() {
  const [sales, setSales] = useState([]);
  const [salesChannels, setSalesChannels] = useState([]);
  const [salesLocations, setSalesLocations] = useState([]);
  const [products, setProducts] = useState([]);
  const [productPrices, setProductPrices] = useState({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showExcelUpload, setShowExcelUpload] = useState(false);
  const [showSalesReport, setShowSalesReport] = useState(false);
  const [editingSale, setEditingSale] = useState(null);
  const [viewingSale, setViewingSale] = useState(null);
  const [formData, setFormData] = useState({
    salesChannel: '',
    salesLocation: '',
    customer: {
      name: '',
      email: '',
      phone: '',
      address: '',
    },
    salesDate: new Date().toISOString().split('T')[0],
    items: [],
    discount: 0,
    tax: 0,
    defaultTaxRate: 0,
    paymentStatus: 'pending',
    orderStatus: 'pending',
    notes: '',
    amazonOrderId: '',
  });
  const [newItem, setNewItem] = useState({
    product: '',
    quantity: 1,
    unitPrice: 0,
  });
  const [availableStock, setAvailableStock] = useState({});
  const [sortBy, setSortBy] = useState('salesDate');
  const [sortDir, setSortDir] = useState('desc');
  const [removingDuplicates, setRemovingDuplicates] = useState(false);

  useEffect(() => {
    fetchSalesChannels();
    fetchProducts();
  }, []);

  useEffect(() => {
    fetchSales();
  }, [sortBy, sortDir]);

  useEffect(() => {
    if (formData.salesChannel) {
      fetchSalesLocations(formData.salesChannel);
    } else {
      setSalesLocations([]);
    }
  }, [formData.salesChannel]);

  useEffect(() => {
    if (products.length > 0) {
      fetchProductPrices(SALES_CURRENCY);
    }
  }, [products.length]);

  useEffect(() => {
    fetchStockForSalesLocation(formData.salesLocation);
  }, [formData.salesLocation, salesLocations]);

  const getWarehouseLocationId = (salesLocationId) => {
    const loc = salesLocations.find((l) => l._id === salesLocationId);
    return loc?.location?._id || loc?.location || null;
  };

  const fetchStockForSalesLocation = async (salesLocationId) => {
    const warehouseId = getWarehouseLocationId(salesLocationId);
    if (!warehouseId) {
      setAvailableStock({});
      return;
    }
    try {
      const response = await stockAPI.getByLocation(warehouseId);
      const stockMap = {};
      (response.data || []).forEach((record) => {
        const productId = record.product?._id || record.product;
        const available =
          record.availableQuantity ??
          Math.max(0, (record.quantity || 0) - (record.reservedQuantity || 0));
        stockMap[productId] = available;
      });
      setAvailableStock(stockMap);
    } catch (error) {
      console.error('Error fetching stock for sales location:', error);
      setAvailableStock({});
    }
  };

  const getExistingQtyForProduct = (productId) => {
    if (!editingSale?.items) return 0;
    return editingSale.items
      .filter((item) => (item.product?._id || item.product) === productId)
      .reduce((sum, item) => sum + (item.quantity || 0), 0);
  };

  const getEffectiveAvailable = (productId) => {
    const onHand = availableStock[productId] ?? 0;
    return onHand + getExistingQtyForProduct(productId);
  };

  const resolveSaleCurrency = () => SALES_CURRENCY;

  const getFormCurrency = () => SALES_CURRENCY;

  const formatCurrency = (amount) => formatMoney(amount, SALES_CURRENCY);

  const fetchSales = async () => {
    try {
      setLoading(true);
      const response = await salesAPI.getAll({ sortBy, sortDir });
      const data = Array.isArray(response.data) ? response.data : response.data?.data || [];
      setSales(data);
    } catch (error) {
      console.error('Error fetching sales:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack
      });
      alert('Failed to fetch sales');
    } finally {
      setLoading(false);
    }
  };

  const fetchSalesChannels = async () => {
    try {
      const response = await salesChannelsAPI.getAll({ isActive: 'true' });
      setSalesChannels(response.data);
    } catch (error) {
      console.error('Error fetching sales channels:', error);
    }
  };

  const fetchSalesLocations = async (channelId) => {
    try {
      const response = await salesLocationsAPI.getByChannel(channelId);
      setSalesLocations(response.data);
    } catch (error) {
      console.error('Error fetching sales locations:', error);
    }
  };

  const fetchProducts = async () => {
    try {
      const response = await productsAPI.getAll();
      const productsData = response.data;
      setProducts(productsData);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const fetchProductPrices = async (currency = SALES_CURRENCY) => {
    if (products.length === 0) return;
    try {
      const productIds = products.map((p) => p._id);
      const pricesResponse = await pricesAPI.getBulkCurrent(productIds, currency);
      const pricesMap = {};
      pricesResponse.data.forEach((price) => {
        pricesMap[price.product._id || price.product] = price;
      });
      setProductPrices(pricesMap);
    } catch (error) {
      console.error('Error fetching prices:', error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name.startsWith('customer.')) {
      const field = name.split('.')[1];
      setFormData((prev) => ({
        ...prev,
        customer: {
          ...prev.customer,
          [field]: value,
        },
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]:
          name === 'discount' || name === 'tax' || name === 'defaultTaxRate'
            ? parseFloat(value) || 0
            : value,
      }));
    }
  };

  const handleAddItem = () => {
    if (!newItem.product || newItem.quantity <= 0 || newItem.unitPrice <= 0) {
      alert('Please fill all item fields');
      return;
    }
    
    setFormData((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          product: newItem.product,
          quantity: parseFloat(newItem.quantity),
          unitPrice: parseFloat(newItem.unitPrice),
          total: parseFloat(newItem.quantity) * parseFloat(newItem.unitPrice),
        },
      ],
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
    return calculateSubtotal() - (formData.discount || 0) + calculateTax();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const saleData = {
        ...formData,
        currency: getFormCurrency(),
        subtotal: calculateSubtotal(),
        tax: calculateTax(),
        total: calculateTotal(),
      };
      
      if (editingSale) {
        await salesAPI.update(editingSale._id, saleData);
      } else {
        await salesAPI.create(saleData);
      }
      setShowModal(false);
      setEditingSale(null);
      resetForm();
      fetchSales();
    } catch (error) {
      console.error('Error saving sale:', error);
      alert(error.response?.data?.error || 'Failed to save sale');
    }
  };

  const handleEdit = (sale) => {
    setEditingSale(sale);
    setFormData({
      salesChannel: sale.salesChannel._id || sale.salesChannel,
      salesLocation: sale.salesLocation._id || sale.salesLocation,
      customer: sale.customer || { name: '', email: '', phone: '', address: '' },
      salesDate: sale.salesDate ? new Date(sale.salesDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      items: sale.items || [],
      discount: sale.discount || 0,
      tax: sale.tax || 0,
      defaultTaxRate: sale.defaultTaxRate || 0,
      paymentStatus: sale.paymentStatus || 'pending',
      orderStatus: sale.orderStatus || 'pending',
      notes: sale.notes || '',
      amazonOrderId: sale.amazonOrderId || '',
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this sale?')) {
      return;
    }
    try {
      await salesAPI.delete(id);
      setViewingSale(null);
      fetchSales();
    } catch (error) {
      console.error('Error deleting sale:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack,
        saleId: id
      });
      alert('Failed to delete sale');
    }
  };

  const handleRemoveAmazonOrderDuplicates = async () => {
    if (
      !window.confirm(
        'Remove duplicate sales that share the same Amazon Order ID?\n\nThe earliest sale for each Amazon Order ID will be kept; newer duplicates will be deleted.'
      )
    ) {
      return;
    }
    try {
      setRemovingDuplicates(true);
      const response = await salesAPI.removeAmazonOrderDuplicates();
      const { duplicateAmazonOrderIds = 0, deleted = 0, kept = 0 } = response.data || {};
      if (deleted === 0) {
        alert('No duplicate Amazon Order ID sales found.');
      } else {
        alert(
          `Removed ${deleted} duplicate sale(s) across ${duplicateAmazonOrderIds} Amazon Order ID(s).\nKept ${kept} original record(s).`
        );
      }
      fetchSales();
    } catch (error) {
      console.error('Error removing duplicate sales:', error);
      alert(error.response?.data?.error || 'Failed to remove duplicate sales');
    } finally {
      setRemovingDuplicates(false);
    }
  };

  const resetForm = () => {
    setFormData({
      salesChannel: '',
      salesLocation: '',
      customer: {
        name: '',
        email: '',
        phone: '',
        address: '',
      },
      salesDate: new Date().toISOString().split('T')[0],
      items: [],
      discount: 0,
      tax: 0,
      defaultTaxRate: 0,
      paymentStatus: 'pending',
      orderStatus: 'pending',
      notes: '',
      amazonOrderId: '',
    });
    setNewItem({ product: '', quantity: 1, unitPrice: 0 });
    setAvailableStock({});
  };

  const openAddModal = () => {
    setEditingSale(null);
    resetForm();
    setShowModal(true);
  };

  const handleExcelUploadComplete = () => {
    fetchSales();
  };

  const handlePrintSale = (sale) => {
    if (!sale) return;

    const fmt = (amount) => formatMoney(amount, resolveSaleCurrency(sale));
    const saleCurrency = resolveSaleCurrency(sale);

    const itemRows = (sale.items || [])
      .map((item) => {
        const fullProduct =
          products.find((p) => p._id === (item.product?._id || item.product)) ||
          item.product ||
          {};
        const productName = fullProduct.title || fullProduct.name || 'Unknown';
        const sku = fullProduct.sku ? ` (${fullProduct.sku})` : '';
        const imageUrl = getProductThumbnail(fullProduct) || PRODUCT_IMAGE_PLACEHOLDER;
        return `
          <tr>
            <td><img class="sale-thumb" src="${imageUrl}" alt="${productName}" /></td>
            <td>${productName}${sku}</td>
            <td style="text-align:center;">${item.quantity}</td>
            <td style="text-align:right;">${fmt(item.unitPrice)}</td>
            <td style="text-align:right;">${fmt(item.total)}</td>
          </tr>`;
      })
      .join('');

    const saleDate = sale.salesDate
      ? new Date(sale.salesDate).toLocaleDateString()
      : '-';

    const { cgst, sgst } = splitTaxAsCgstSgst(sale.tax);

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${getSaleDisplayTitle(sale)}</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: Arial, Helvetica, sans-serif; color: #1f2937; padding: 32px; }
            h1 { margin: 0 0 4px; color: #6B3894; }
            .sale-meta { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin: 24px 0; }
            .sale-meta div { font-size: 14px; line-height: 1.6; }
            .label { color: #6b7280; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            th, td { padding: 8px 10px; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
            th { text-align: left; background: #f8f5fb; color: #4b5563; }
            .totals { margin-top: 16px; margin-left: auto; width: 280px; }
            .totals tr td { border: none; padding: 4px 10px; }
            .notes { margin-top: 24px; font-size: 13px; }
            .status { display: inline-block; padding: 2px 10px; border-radius: 999px; background: #ede7f3; color: #6B3894; font-size: 12px; text-transform: capitalize; }
            .sale-thumb { width: 44px; height: 44px; object-fit: cover; border-radius: 6px; border: 1px solid #e5e7eb; background: #f3f4f6; display: block; }
            @media print { .sale-thumb { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
          </style>
        </head>
        <body>
          <h1>Sales Invoice</h1>
          ${sale.amazonOrderId ? `<div style="font-size:14px;">Amazon Order: ${sale.amazonOrderId}</div>` : ''}
          ${sale.salesDate ? `<div style="font-size:13px;color:#4b5563;margin-top:4px;">Date: ${new Date(sale.salesDate).toLocaleDateString()}</div>` : ''}

          <div class="sale-meta">
            <div>
              <div class="label">Customer</div>
              <div>${sale.customer?.name || '-'}</div>
              ${sale.customer?.email ? `<div>${sale.customer.email}</div>` : ''}
              ${sale.customer?.phone ? `<div>${sale.customer.phone}</div>` : ''}
              ${sale.customer?.address ? `<div>${sale.customer.address}</div>` : ''}
            </div>
            <div>
              <div class="label">Sale Date</div>
              <div>${saleDate}</div>
              <div class="label" style="margin-top:8px;">Channel</div>
              <div>${sale.salesChannel?.name || '-'}</div>
              <div class="label" style="margin-top:8px;">Location</div>
              <div>${sale.salesLocation?.name || '-'}</div>
              <div class="label" style="margin-top:8px;">Currency</div>
              <div>${saleCurrency}</div>
            </div>
            <div>
              <div class="label">Payment Status</div>
              <div><span class="status">${sale.paymentStatus || '-'}</span></div>
              <div class="label" style="margin-top:8px;">Order Status</div>
              <div><span class="status">${sale.orderStatus || '-'}</span></div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Image</th>
                <th>Product</th>
                <th style="text-align:center;">Qty</th>
                <th style="text-align:right;">Unit Price</th>
                <th style="text-align:right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemRows || '<tr><td colspan="5" style="text-align:center;color:#9ca3af;">No items</td></tr>'}
            </tbody>
          </table>

          <table class="totals">
            <tr><td>Subtotal</td><td style="text-align:right;">${fmt(sale.subtotal)}</td></tr>
            <tr><td>Discount</td><td style="text-align:right;">${fmt(sale.discount)}</td></tr>
            <tr><td>CGST</td><td style="text-align:right;">${fmt(cgst)}</td></tr>
            <tr><td>SGST</td><td style="text-align:right;">${fmt(sgst)}</td></tr>
            <tr><td><strong>Total</strong></td><td style="text-align:right;"><strong>${fmt(sale.total)}</strong></td></tr>
          </table>

          ${sale.notes ? `<div class="notes"><div class="label">Notes</div>${sale.notes}</div>` : ''}
        </body>
      </html>`;

    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      alert('Please allow pop-ups to print or download the sale.');
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();

    const triggerPrint = () => {
      let hasPrinted = false;
      const doPrint = () => {
        if (hasPrinted) return;
        hasPrinted = true;
        printWindow.print();
      };
      const images = Array.from(printWindow.document.images || []);
      const pending = images.filter((img) => !img.complete);
      if (pending.length === 0) {
        doPrint();
        return;
      }
      let remaining = pending.length;
      const done = () => {
        remaining -= 1;
        if (remaining <= 0) doPrint();
      };
      pending.forEach((img) => {
        img.addEventListener('load', done);
        img.addEventListener('error', done);
      });
      setTimeout(doPrint, 2000);
    };

    setTimeout(triggerPrint, 300);
  };

  return (
    <div className="sales-container">
      <div className="sales-header">
        <h1>Sales</h1>
        <div className="sales-header-actions">
          <button className="btn-secondary" onClick={() => setShowSalesReport(true)}>
            Sales Report
          </button>
          <button className="btn-secondary" onClick={() => setShowExcelUpload(true)}>
            ⬆ Upload Excel
          </button>
          <button
            className="btn-secondary"
            disabled={removingDuplicates}
            onClick={handleRemoveAmazonOrderDuplicates}
          >
            {removingDuplicates ? 'Removing…' : 'Remove Amazon Duplicates'}
          </button>
          <button className="btn-primary" onClick={openAddModal}>
            + Add Sale
          </button>
        </div>
      </div>

      <div className="sales-list-toolbar">
        <div className="sales-sort-controls">
          <label htmlFor="sales-sort-by">Sort by</label>
          <select
            id="sales-sort-by"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            {SALES_SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <select
            id="sales-sort-dir"
            value={sortDir}
            onChange={(e) => setSortDir(e.target.value)}
            aria-label="Sort order"
          >
            <option value="desc">
              {sortBy === 'salesDate'
                ? 'Newest first'
                : sortBy === 'channel' || sortBy === 'customer'
                  ? 'Z → A'
                  : 'Descending'}
            </option>
            <option value="asc">
              {sortBy === 'salesDate'
                ? 'Oldest first'
                : sortBy === 'channel' || sortBy === 'customer'
                  ? 'A → Z'
                  : 'Ascending'}
            </option>
          </select>
        </div>
        <span className="sales-sort-hint">
          {sales.length} record{sales.length === 1 ? '' : 's'} · sorted by{' '}
          {SALES_SORT_OPTIONS.find((o) => o.value === sortBy)?.label}
        </span>
      </div>

      {loading ? (
        <div className="loading">Loading sales...</div>
      ) : (
        <div className="sales-table-container">
          <table className="sales-table">
            <thead>
              <tr>
                <th>Amazon Order ID</th>
                <th>Date</th>
                <th>Channel</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {sales.length === 0 ? (
                <tr>
                  <td colSpan="6" className="no-data">
                    No sales found
                  </td>
                </tr>
              ) : (
                sales.map((sale) => (
                  <tr
                    key={sale._id}
                    className="clickable-row"
                    onClick={() => setViewingSale(sale)}
                  >
                    <td className="amazon-order-id-cell">{sale.amazonOrderId || '—'}</td>
                    <td>{new Date(sale.salesDate).toLocaleDateString()}</td>
                    <td>{sale.salesChannel?.name || '-'}</td>
                    <td>{sale.customer?.name || '-'}</td>
                    <td>{sale.items?.length || 0}</td>
                    <td>{formatCurrency(sale.total, resolveSaleCurrency(sale))}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showExcelUpload && (
        <ExcelUpload
          moduleName="sales"
          templateEndpoint="/sales/template"
          onUploadComplete={handleExcelUploadComplete}
          onClose={() => setShowExcelUpload(false)}
        />
      )}

      {showSalesReport && (
        <div className="modal-overlay" onClick={() => setShowSalesReport(false)}>
          <div
            className="modal-content-large sales-report-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <SalesSkuReport onClose={() => setShowSalesReport(false)} />
          </div>
        </div>
      )}

      {viewingSale && (
        <DetailModal
          headerActions={
            <button
              className="btn-secondary"
              onClick={() => handlePrintSale(viewingSale)}
            >
              🖨 Print / Download
            </button>
          }
          title={getSaleDisplayTitle(viewingSale)}
          fields={[
            { label: 'Amazon Order ID', value: viewingSale.amazonOrderId },
            { label: 'Date', value: viewingSale.salesDate ? new Date(viewingSale.salesDate).toLocaleDateString() : '' },
            { label: 'Sales Channel', value: viewingSale.salesChannel?.name },
            { label: 'Sales Location', value: viewingSale.salesLocation?.name },
            {
              label: 'Currency',
              value: resolveSaleCurrency(viewingSale),
            },
            { label: 'Customer', value: viewingSale.customer?.name },
            { label: 'Customer Email', value: viewingSale.customer?.email },
            { label: 'Customer Phone', value: viewingSale.customer?.phone },
            { label: 'Customer Address', value: viewingSale.customer?.address, full: true },
            { label: 'Subtotal', value: formatCurrency(viewingSale.subtotal, resolveSaleCurrency(viewingSale)) },
            { label: 'Discount', value: formatCurrency(viewingSale.discount, resolveSaleCurrency(viewingSale)) },
            {
              label: 'CGST',
              value: formatCurrency(
                splitTaxAsCgstSgst(viewingSale.tax).cgst,
                resolveSaleCurrency(viewingSale)
              ),
            },
            {
              label: 'SGST',
              value: formatCurrency(
                splitTaxAsCgstSgst(viewingSale.tax).sgst,
                resolveSaleCurrency(viewingSale)
              ),
            },
            { label: 'Total', value: formatCurrency(viewingSale.total, resolveSaleCurrency(viewingSale)) },
            { label: 'Notes', value: viewingSale.notes, full: true },
          ]}
          onClose={() => setViewingSale(null)}
          onEdit={() => {
            const sale = viewingSale;
            setViewingSale(null);
            handleEdit(sale);
          }}
          onDelete={() => handleDelete(viewingSale._id)}
        >
          {viewingSale.items?.length > 0 && (
            <div className="detail-view-section">
              <h3>Items</h3>
              <table className="detail-view-items-table">
                <thead>
                  <tr>
                    <th>Image</th>
                    <th>Product</th>
                    <th>Quantity</th>
                    <th>Unit Price</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {viewingSale.items.map((item, idx) => {
                    const fullProduct =
                      products.find((p) => p._id === (item.product?._id || item.product)) ||
                      item.product ||
                      {};
                    const productName =
                      fullProduct.title || fullProduct.name || 'Unknown';
                    const thumbnail = getProductThumbnail(fullProduct);
                    return (
                      <tr key={idx}>
                        <td>
                          <img
                            className="sale-item-thumbnail"
                            src={thumbnail || PRODUCT_IMAGE_PLACEHOLDER}
                            alt={productName}
                            loading="lazy"
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.src = PRODUCT_IMAGE_PLACEHOLDER;
                            }}
                          />
                        </td>
                        <td>{productName}</td>
                        <td>{item.quantity}</td>
                        <td>{formatCurrency(item.unitPrice, resolveSaleCurrency(viewingSale))}</td>
                        <td>{formatCurrency(item.total, resolveSaleCurrency(viewingSale))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </DetailModal>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content-large" onClick={(e) => e.stopPropagation()}>
            <h2>{editingSale ? 'Edit Sale' : 'Add Sale'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-row sales-header-row">
                <div className="form-group">
                  <label>Sales Channel *</label>
                  <select
                    name="salesChannel"
                    value={formData.salesChannel}
                    onChange={handleInputChange}
                    required
                    disabled={!!editingSale}
                  >
                    <option value="">Select Sales Channel</option>
                    {salesChannels.map((channel) => (
                      <option key={channel._id} value={channel._id}>
                        {channel.name} ({channel.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Sales Location *</label>
                  <select
                    name="salesLocation"
                    value={formData.salesLocation}
                    onChange={handleInputChange}
                    required
                    disabled={!!editingSale || !formData.salesChannel}
                  >
                    <option value="">Select Sales Location</option>
                    {salesLocations.map((loc) => (
                      <option key={loc._id} value={loc._id}>
                        {loc.name} ({loc.code})
                      </option>
                    ))}
                  </select>
                  {formData.salesLocation && (
                    <small className="form-hint">
                      Billing currency: {getFormCurrency()}
                    </small>
                  )}
                </div>
                <div className="form-group">
                  <label>Sales Date *</label>
                  <input
                    type="date"
                    name="salesDate"
                    value={formData.salesDate}
                    onChange={handleInputChange}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Amazon Order ID</label>
                <input
                  type="text"
                  name="amazonOrderId"
                  value={formData.amazonOrderId}
                  onChange={handleInputChange}
                  placeholder="e.g. 123-1234567-1234567"
                />
                <small className="form-hint">
                  Optional — paste the order ID from Amazon after you receive the order.
                </small>
              </div>

              <div className="form-section">
                <h3>Customer Information</h3>
                <div className="form-row">
                  <div className="form-group">
                    <label>Customer Name</label>
                    <input
                      type="text"
                      name="customer.name"
                      value={formData.customer.name}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div className="form-group">
                    <label>Email</label>
                    <input
                      type="email"
                      name="customer.email"
                      value={formData.customer.email}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div className="form-group">
                    <label>Phone</label>
                    <input
                      type="text"
                      name="customer.phone"
                      value={formData.customer.phone}
                      onChange={handleInputChange}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Address</label>
                  <textarea
                    name="customer.address"
                    value={formData.customer.address}
                    onChange={handleInputChange}
                    rows="2"
                  />
                </div>
              </div>

              <div className="items-section form-section">
                <h3>Items</h3>
                <div className="add-item-form">
                  <div className="add-item-field">
                    <label>Product</label>
                    <select
                      value={newItem.product}
                      onChange={(e) => {
                        const productId = e.target.value;
                        const price = productPrices[productId];
                        setNewItem({
                          ...newItem,
                          product: productId,
                          unitPrice: price ? price.salesPrice : 0,
                        });
                      }}
                    >
                      <option value="">Select Product</option>
                      {products.map((product) => {
                        const price = productPrices[product._id];
                        const salesPrice = price ? price.salesPrice : 0;
                        return (
                          <option key={product._id} value={product._id}>
                            {product.title || product.name} - {formatCurrency(salesPrice)}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div className="add-item-field add-item-field-sm">
                    <label>Quantity</label>
                    <input
                      type="number"
                      placeholder="Qty"
                      value={newItem.quantity}
                      onChange={(e) =>
                        setNewItem({
                          ...newItem,
                          quantity: parseFloat(e.target.value) || 0,
                        })
                      }
                      min="1"
                    />
                    {newItem.product && formData.salesLocation && (
                      <small className="stock-hint">
                        Available: {getEffectiveAvailable(newItem.product)}
                      </small>
                    )}
                  </div>
                  <div className="add-item-field add-item-field-sm">
                    <label>Unit Price</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Amount"
                      value={newItem.unitPrice}
                      onChange={(e) =>
                        setNewItem({
                          ...newItem,
                          unitPrice: parseFloat(e.target.value) || 0,
                        })
                      }
                      min="0"
                    />
                  </div>
                  <div className="add-item-field add-item-field-sm">
                    <label>Total</label>
                    <input
                      type="text"
                      value={formatCurrency((newItem.quantity || 0) * (newItem.unitPrice || 0))}
                      disabled
                    />
                  </div>
                  <button type="button" onClick={handleAddItem} className="btn-add-item">
                    Add Item
                  </button>
                </div>

                <div className="items-list">
                  {formData.items.length === 0 && (
                    <p className="items-empty-hint">Add products to this sale.</p>
                  )}
                  {formData.items.map((item, index) => {
                    const product = products.find((p) => p._id === item.product);
                    const itemRate = getTaxRateForCategory(
                      getCategoryName(product),
                      formData.defaultTaxRate
                    );
                    return (
                      <div key={index} className="item-row">
                        <span className="item-product-cell">
                          {product?.title || product?.name || 'Unknown'}
                          {formData.salesLocation && (
                            <small className="stock-hint">
                              Available: {getEffectiveAvailable(item.product)}
                            </small>
                          )}
                        </span>
                        <span>Qty: {item.quantity}</span>
                        <span>{formatCurrency(item.unitPrice)}</span>
                        <span>{formatCurrency(item.total)}</span>
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

              <div className="form-section sales-summary-section">
                <h3>Order Summary</h3>
                <div className="form-row sales-summary-row">
                  <div className="form-group">
                    <label>Discount ({getFormCurrency()})</label>
                    <input
                      type="number"
                      step="0.01"
                      name="discount"
                      value={formData.discount}
                      onChange={handleInputChange}
                      min="0"
                    />
                  </div>
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
                      Brass/Copper 12%, Gemstone 5% auto-applied. Used for other
                      categories.
                    </small>
                  </div>
                </div>
                <div className="form-row sales-summary-row">
                  <div className="form-group">
                    <label>Tax (auto)</label>
                    <input
                      type="text"
                      value={formatCurrency(calculateTax())}
                      disabled
                    />
                  </div>
                  <div className="form-group">
                    <label>Subtotal</label>
                    <input
                      type="text"
                      value={formatCurrency(calculateSubtotal())}
                      disabled
                    />
                  </div>
                  <div className="form-group">
                    <label>Total</label>
                    <input
                      type="text"
                      value={formatCurrency(calculateTotal())}
                      disabled
                      className="total-input"
                    />
                  </div>
                </div>
              </div>

              <div className="form-row sales-status-row">
                <div className="form-group">
                  <label>Payment Status</label>
                  <select
                    name="paymentStatus"
                    value={formData.paymentStatus}
                    onChange={handleInputChange}
                  >
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                    <option value="partial">Partial</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Order Status</label>
                  <select
                    name="orderStatus"
                    value={formData.orderStatus}
                    onChange={handleInputChange}
                  >
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="shipped">Shipped</option>
                    <option value="delivered">Delivered</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
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
                  {editingSale ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Sales;

