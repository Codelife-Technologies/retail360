import React, { useState, useEffect, useMemo } from 'react';
import { pricesAPI, productsAPI, suppliersAPI } from '../services/api';
import DetailModal from './DetailModal';
import ExcelUpload from './ExcelUpload';
import {
  PRODUCT_IMAGE_PLACEHOLDER,
  getProductThumbnail,
  resolveProductImageUrl,
} from '../utils/productDisplayUtils';
import './Prices.css';

function VendorPriceImage({ product, size = 'table', alt }) {
  const displayName = product?.title || product?.name || alt || 'Product';
  const thumbnail = getProductThumbnail(product);
  const className =
    size === 'hero'
      ? 'prices-product-image prices-product-image-hero'
      : size === 'form'
        ? 'prices-product-image prices-product-image-form'
        : 'prices-product-image';

  return (
    <img
      className={className}
      src={thumbnail || PRODUCT_IMAGE_PLACEHOLDER}
      alt={displayName}
      loading="lazy"
      onError={(e) => {
        e.target.onerror = null;
        e.target.src = PRODUCT_IMAGE_PLACEHOLDER;
      }}
    />
  );
}

function VendorPriceImageGallery({ product }) {
  const images = (product?.images || []).filter((img) => img && img.trim() !== '');
  if (images.length === 0) {
    return (
      <div className="prices-image-section">
        <h3>Product Images</h3>
        <div className="prices-image-gallery">
          <VendorPriceImage product={product} size="hero" />
        </div>
      </div>
    );
  }

  return (
    <div className="prices-image-section">
      <h3>Product Images</h3>
      <div className="prices-image-gallery">
        {images.map((image, index) => (
          <img
            key={`${image}-${index}`}
            className="prices-gallery-thumb"
            src={resolveProductImageUrl(image)}
            alt={`${product?.title || product?.name || 'Product'} ${index + 1}`}
            loading="lazy"
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = PRODUCT_IMAGE_PLACEHOLDER;
            }}
          />
        ))}
      </div>
    </div>
  );
}

function Prices() {
  const [vendorCatalog, setVendorCatalog] = useState([]);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [vendorFilter, setVendorFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showExcelUpload, setShowExcelUpload] = useState(false);
  const [editingPrice, setEditingPrice] = useState(null);
  const [viewingRow, setViewingRow] = useState(null);
  const [formData, setFormData] = useState({
    product: '',
    supplier: '',
    purchasePrice: '',
    effectiveDate: new Date().toISOString().split('T')[0],
    isActive: true,
    notes: '',
  });

  useEffect(() => {
    fetchProducts();
    fetchSuppliers();
  }, []);

  useEffect(() => {
    const timer = setTimeout(fetchVendorCatalog, 300);
    return () => clearTimeout(timer);
  }, [vendorFilter, searchTerm]);

  const fetchVendorCatalog = async () => {
    try {
      setLoading(true);
      const params = {};
      if (vendorFilter) params.supplier = vendorFilter;
      if (searchTerm.trim()) params.search = searchTerm.trim();
      const response = await pricesAPI.getVendorCatalog(params);
      setVendorCatalog(response.data || []);
    } catch (error) {
      console.error('Error fetching vendor catalog:', error);
      alert('Failed to fetch vendor prices');
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const response = await productsAPI.getAll();
      const data = Array.isArray(response.data)
        ? response.data
        : response.data?.data || [];
      setProducts(data);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const response = await suppliersAPI.getAll();
      setSuppliers(response.data || []);
    } catch (error) {
      console.error('Error fetching suppliers:', error);
    }
  };

  const selectedProduct = useMemo(
    () => products.find((p) => p._id === formData.product),
    [products, formData.product]
  );

  const productSuppliers = useMemo(() => {
    if (!selectedProduct?.suppliers?.length) return [];
    return selectedProduct.suppliers
      .map((link) => {
        const supplierId = link.supplier?._id || link.supplier;
        const supplierDoc =
          link.supplier?.name != null
            ? link.supplier
            : suppliers.find((s) => s._id === supplierId);
        if (!supplierId || !supplierDoc) return null;
        return { _id: supplierId, name: supplierDoc.name, link };
      })
      .filter(Boolean);
  }, [selectedProduct, suppliers]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => {
      const next = {
        ...prev,
        [name]:
          type === 'checkbox'
            ? checked
            : name === 'purchasePrice'
              ? value === '' ? '' : parseFloat(value) || ''
              : value,
      };
      if (name === 'product') {
        next.supplier = '';
      }
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.supplier) {
      alert('Select a vendor for this product.');
      return;
    }
    try {
      const payload = {
        ...formData,
        salesPrice: formData.purchasePrice,
      };
      if (editingPrice?.priceId) {
        await pricesAPI.update(editingPrice.priceId, payload);
      } else {
        await pricesAPI.create(payload);
      }
      setShowModal(false);
      setEditingPrice(null);
      resetForm();
      fetchVendorCatalog();
    } catch (error) {
      console.error('Error saving price:', error);
      alert(error.response?.data?.error || 'Failed to save price');
    }
  };

  const openRowForm = (row) => {
    setEditingPrice(row);
    setFormData({
      product: row.product._id,
      supplier: row.supplier._id,
      purchasePrice: row.purchasePrice ?? '',
      effectiveDate: row.effectiveDate
        ? new Date(row.effectiveDate).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
      isActive: true,
      notes: row.notes || '',
    });
    setShowModal(true);
  };

  const handleDeactivate = async (priceId) => {
    if (!window.confirm('Deactivate this vendor price?')) return;
    try {
      await pricesAPI.delete(priceId);
      fetchVendorCatalog();
    } catch (error) {
      console.error('Error deactivating price:', error);
      alert('Failed to deactivate price');
    }
  };

  const resetForm = () => {
    setFormData({
      product: '',
      supplier: '',
      purchasePrice: '',
      effectiveDate: new Date().toISOString().split('T')[0],
      isActive: true,
      notes: '',
    });
  };

  const openAddModal = () => {
    setEditingPrice(null);
    resetForm();
    setShowModal(true);
  };

  const formatPrice = (amount) => {
    if (amount == null || amount === '') return '—';
    return `₹${parseFloat(amount).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  return (
    <div className="prices-container">
      <div className="prices-header">
        <div>
          <h1>Vendor Prices</h1>
          <p className="prices-subtitle">
            Every product linked to a vendor, with the price quoted by that vendor.
          </p>
        </div>
        <div className="prices-header-actions">
          <button className="btn-secondary" onClick={() => setShowExcelUpload(true)}>
            ⬆ Upload Excel
          </button>
          <button className="btn-primary" onClick={openAddModal}>
            + Set Vendor Price
          </button>
        </div>
      </div>

      <div className="prices-filters">
        <input
          type="text"
          placeholder="Search product, SKU, vendor…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <select value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)}>
          <option value="">All vendors</option>
          {suppliers.map((supplier) => (
            <option key={supplier._id} value={supplier._id}>
              {supplier.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="loading">Loading vendor prices...</div>
      ) : (
        <div className="prices-table-container">
          <table className="prices-table">
            <thead>
              <tr>
                <th>Image</th>
                <th>Product</th>
                <th>SKU</th>
                <th>Vendor</th>
                <th>Vendor SKU</th>
                <th>Vendor Price</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {vendorCatalog.length === 0 ? (
                <tr>
                  <td colSpan="7" className="no-data">
                    No vendor-linked products found. Link suppliers to products in the Products
                    page, then set vendor prices here.
                  </td>
                </tr>
              ) : (
                vendorCatalog.map((row) => (
                  <tr
                    key={row.rowKey}
                    className={`clickable-row${row.purchasePrice == null ? ' no-vendor-price' : ''}`}
                    onClick={() => setViewingRow(row)}
                  >
                    <td className="prices-image-cell">
                      <VendorPriceImage product={row.product} />
                    </td>
                    <td>{row.product?.title || row.product?.name || 'Unknown'}</td>
                    <td className="sku">{row.product?.sku || '—'}</td>
                    <td className="vendor-name">{row.supplier?.name || '—'}</td>
                    <td className="sku">{row.vendorSku || '—'}</td>
                    <td className="font-semibold">{formatPrice(row.purchasePrice)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button className="btn-edit" onClick={() => openRowForm(row)}>
                        {row.hasPriceRecord ? 'Edit' : 'Set price'}
                      </button>
                      {row.priceId && row.isActive && (
                        <button
                          className="btn-delete"
                          onClick={() => handleDeactivate(row.priceId)}
                        >
                          Deactivate
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showExcelUpload && (
        <ExcelUpload
          moduleName="prices"
          templateEndpoint="/prices/template"
          onUploadComplete={fetchVendorCatalog}
          onClose={() => setShowExcelUpload(false)}
        />
      )}

      {viewingRow && (
        <DetailModal
          title={viewingRow.product?.title || viewingRow.product?.name || 'Vendor Price'}
          fields={[
            { label: 'Product', value: viewingRow.product?.title || viewingRow.product?.name },
            { label: 'SKU', value: viewingRow.product?.sku },
            { label: 'Vendor', value: viewingRow.supplier?.name },
            { label: 'Vendor SKU', value: viewingRow.vendorSku },
            {
              label: 'Vendor Price',
              value: formatPrice(viewingRow.purchasePrice),
            },
            {
              label: 'PO Reference',
              value: viewingRow.poNumber,
            },
            {
              label: 'Effective Date',
              value: viewingRow.effectiveDate
                ? new Date(viewingRow.effectiveDate).toLocaleDateString()
                : '',
            },
            { label: 'Notes', value: viewingRow.notes, full: true },
          ]}
          onClose={() => setViewingRow(null)}
          onEdit={() => {
            const row = viewingRow;
            setViewingRow(null);
            openRowForm(row);
          }}
        >
          <VendorPriceImageGallery product={viewingRow.product} />
        </DetailModal>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{editingPrice?.priceId ? 'Edit Vendor Price' : 'Set Vendor Price'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Product *</label>
                <select
                  name="product"
                  value={formData.product}
                  onChange={handleInputChange}
                  required
                  disabled={Boolean(editingPrice?.priceId)}
                >
                  <option value="">Select product</option>
                  {products.map((product) => (
                    <option key={product._id} value={product._id}>
                      {product.title || product.name} ({product.sku || 'No SKU'})
                    </option>
                  ))}
                </select>
              </div>
              {selectedProduct && (
                <div className="prices-form-product-preview">
                  <VendorPriceImage product={selectedProduct} size="form" />
                  <div>
                    <strong>{selectedProduct.title || selectedProduct.name}</strong>
                    <span className="sku">{selectedProduct.sku || 'No SKU'}</span>
                  </div>
                </div>
              )}
              <div className="form-group">
                <label>Vendor *</label>
                <select
                  name="supplier"
                  value={formData.supplier}
                  onChange={handleInputChange}
                  required
                  disabled={Boolean(editingPrice?.priceId) || !formData.product}
                >
                  <option value="">
                    {formData.product
                      ? productSuppliers.length
                        ? 'Select vendor'
                        : 'No vendors linked — add in Products'
                      : 'Select product first'}
                  </option>
                  {productSuppliers.map((supplier) => (
                    <option key={supplier._id} value={supplier._id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Vendor Price *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  name="purchasePrice"
                  value={formData.purchasePrice}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="form-group">
                <label>Effective Date</label>
                <input
                  type="date"
                  name="effectiveDate"
                  value={formData.effectiveDate}
                  onChange={handleInputChange}
                />
              </div>
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    name="isActive"
                    checked={formData.isActive}
                    onChange={handleInputChange}
                  />
                  Active for this product and vendor
                </label>
              </div>
              <div className="form-group">
                <label>Notes</label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleInputChange}
                  rows="3"
                  placeholder="Optional notes about this vendor quote…"
                />
              </div>
              <div className="form-actions">
                <button type="button" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  {editingPrice?.priceId ? 'Update' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Prices;
