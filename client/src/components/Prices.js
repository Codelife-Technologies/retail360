import React, { useState, useEffect, useMemo } from 'react';
import { pricesAPI, productsAPI, suppliersAPI } from '../services/api';
import ExcelUpload from './ExcelUpload';
import {
  PRODUCT_IMAGE_PLACEHOLDER,
  getProductThumbnail,
  resolveProductImageUrl,
  getParentSku,
  getChildSku,
  getCatalogSku,
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

function RecentAcquisitions({ acquisitions, formatPrice }) {
  if (!acquisitions?.length) {
    return <span className="recent-acq-empty">—</span>;
  }

  return (
    <div className="recent-acquisitions">
      {acquisitions.map((acq, index) => (
        <div key={`${acq.purchaseNumber || index}-${acq.purchaseDate || index}`} className="recent-acq-item">
          <span className="recent-acq-label">{index + 1}</span>
          <span className="recent-acq-price">{formatPrice(acq.unitPrice)}</span>
          {acq.purchaseDate && (
            <span className="recent-acq-date">
              {new Date(acq.purchaseDate).toLocaleDateString('en-IN')}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function getVendorChildSku(product, vendorSku) {
  const linked = (vendorSku || '').trim();
  if (linked) return linked;
  return getChildSku(product) || getCatalogSku(product) || '';
}

function formatProductSkuHeader(product) {
  const parent = getParentSku(product);
  const child = getChildSku(product);
  if (child) {
    return `Parent SKU: ${parent || '—'} · Child SKU: ${child}`;
  }
  return parent ? `Parent SKU: ${parent}` : 'No SKU';
}

function buildVendorRowsForProduct(productId, catalog) {
  return catalog
    .filter((row) => row.product?._id === productId)
    .map((row) => ({
      rowKey: row.rowKey,
      supplierId: row.supplier._id,
      supplierName: row.supplier?.name || 'Unknown vendor',
      vendorSku: row.vendorSku || '',
      childSku: getVendorChildSku(row.product, row.vendorSku),
      purchasePrice: row.purchasePrice ?? '',
      effectiveDate: row.effectiveDate
        ? new Date(row.effectiveDate).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
      priceId: row.priceId || null,
      isActive: row.isActive,
      hasPriceRecord: row.hasPriceRecord,
      recentAcquisitions: row.recentAcquisitions || [],
      notes: row.notes || '',
    }));
}

function buildEditVendorRows(productId, catalog, products, suppliers) {
  const product = products.find((p) => p._id === productId);
  const catalogRows = buildVendorRowsForProduct(productId, catalog);
  const catalogBySupplier = new Map(
    catalogRows.map((row) => [String(row.supplierId), row])
  );

  if (product?.suppliers?.length) {
    return product.suppliers.map((link) => {
      const supplierId = link.supplier?._id || link.supplier;
      const supplierDoc =
        link.supplier?.name != null
          ? link.supplier
          : suppliers.find((s) => s._id === supplierId);
      const catalogRow = catalogBySupplier.get(String(supplierId));

      return {
        rowKey: catalogRow?.rowKey || `vendor-${supplierId}`,
        supplierId,
        supplierName: supplierDoc?.name || catalogRow?.supplierName || 'Unknown vendor',
        vendorSku: link.sku || catalogRow?.vendorSku || '',
        childSku: getVendorChildSku(product, link.sku || catalogRow?.vendorSku),
        purchasePrice: catalogRow?.purchasePrice ?? '',
        effectiveDate: catalogRow?.effectiveDate
          ? new Date(catalogRow.effectiveDate).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0],
        priceId: catalogRow?.priceId || null,
        isActive: catalogRow?.isActive ?? false,
        hasPriceRecord: catalogRow?.hasPriceRecord ?? false,
        recentAcquisitions: catalogRow?.recentAcquisitions || [],
        notes: catalogRow?.notes || '',
        isNewVendor: false,
      };
    });
  }

  return catalogRows.map((row) => ({ ...row, isNewVendor: false }));
}

function getDefaultChildSkuForProduct(product) {
  return getChildSku(product) || getCatalogSku(product) || '';
}

function Prices() {
  const [vendorCatalog, setVendorCatalog] = useState([]);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [vendorFilter, setVendorFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showExcelUpload, setShowExcelUpload] = useState(false);
  const [viewingProductId, setViewingProductId] = useState(null);
  const [editingProductId, setEditingProductId] = useState(null);
  const [productVendorRows, setProductVendorRows] = useState([]);
  const [newVendorPick, setNewVendorPick] = useState('');
  const [newVendorSku, setNewVendorSku] = useState('');
  const [savingPrices, setSavingPrices] = useState(false);

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

  const viewingProduct = useMemo(() => {
    const productId = viewingProductId || editingProductId;
    if (!productId) return null;
    const fromProducts = products.find((p) => p._id === productId);
    if (fromProducts) return fromProducts;
    const catalogRow = vendorCatalog.find((row) => row.product?._id === productId);
    return catalogRow?.product || null;
  }, [viewingProductId, editingProductId, products, vendorCatalog]);

  const viewVendorRows = useMemo(() => {
    if (!viewingProductId) return [];
    return buildVendorRowsForProduct(viewingProductId, vendorCatalog);
  }, [viewingProductId, vendorCatalog]);

  const availableSuppliersToAdd = useMemo(() => {
    const linkedIds = new Set(productVendorRows.map((row) => String(row.supplierId)));
    return suppliers.filter((supplier) => !linkedIds.has(String(supplier._id)));
  }, [suppliers, productVendorRows]);

  const openProductView = (productId) => {
    setEditingProductId(null);
    setProductVendorRows([]);
    setViewingProductId(productId);
  };

  const openProductEdit = (productId) => {
    setViewingProductId(null);
    setProductVendorRows(buildEditVendorRows(productId, vendorCatalog, products, suppliers));
    setNewVendorPick('');
    setNewVendorSku('');
    setEditingProductId(productId);
  };

  const switchViewToEdit = () => {
    if (!viewingProductId) return;
    openProductEdit(viewingProductId);
  };

  const closeProductView = () => {
    setViewingProductId(null);
  };

  const closeProductEdit = () => {
    setEditingProductId(null);
    setProductVendorRows([]);
    setNewVendorPick('');
    setNewVendorSku('');
  };

  const handleProductVendorRowChange = (supplierId, field, value) => {
    setProductVendorRows((prev) =>
      prev.map((row) => {
        if (row.supplierId !== supplierId) return row;
        if (field === 'purchasePrice') {
          return {
            ...row,
            purchasePrice: value === '' ? '' : parseFloat(value) || '',
          };
        }
        return { ...row, [field]: value };
      })
    );
  };

  const handleAddVendorToEdit = () => {
    if (!newVendorPick) {
      alert('Select a vendor to add.');
      return;
    }
    if (productVendorRows.some((row) => String(row.supplierId) === String(newVendorPick))) {
      alert('This vendor is already linked to the product.');
      return;
    }

    const supplier = suppliers.find((s) => s._id === newVendorPick);
    const product = products.find((p) => p._id === editingProductId);

    setProductVendorRows((prev) => [
      ...prev,
      {
        rowKey: `new-${newVendorPick}`,
        supplierId: newVendorPick,
        supplierName: supplier?.name || 'Unknown vendor',
        vendorSku: newVendorSku || getDefaultChildSkuForProduct(product),
        purchasePrice: '',
        effectiveDate: new Date().toISOString().split('T')[0],
        priceId: null,
        isActive: false,
        hasPriceRecord: false,
        recentAcquisitions: [],
        notes: '',
        isNewVendor: true,
      },
    ]);
    setNewVendorPick('');
    setNewVendorSku('');
  };

  const handleRemoveVendorRow = (supplierId) => {
    if (!window.confirm('Remove this vendor from the product?')) return;
    setProductVendorRows((prev) => prev.filter((row) => row.supplierId !== supplierId));
  };

  const handleSaveProductPrices = async (e) => {
    e.preventDefault();

    if (!editingProductId) return;
    if (productVendorRows.length === 0) {
      alert('Add at least one vendor for this product.');
      return;
    }

    const rowsToSave = productVendorRows.filter(
      (row) => row.purchasePrice !== '' && row.purchasePrice != null && !Number.isNaN(row.purchasePrice)
    );

    const product = products.find((p) => p._id === editingProductId);

    try {
      setSavingPrices(true);

      await productsAPI.updateSuppliers(
        editingProductId,
        productVendorRows.map((row) => ({
          supplier: row.supplierId,
          sku: row.vendorSku || getDefaultChildSkuForProduct(product) || '',
          unit: product?.unit || 'pcs',
        }))
      );

      for (const row of rowsToSave) {
        const payload = {
          product: editingProductId,
          supplier: row.supplierId,
          purchasePrice: row.purchasePrice,
          salesPrice: row.purchasePrice,
          effectiveDate: row.effectiveDate,
          isActive: true,
          notes: row.notes,
        };
        if (row.priceId) {
          await pricesAPI.update(row.priceId, payload);
        } else {
          await pricesAPI.create(payload);
        }
      }

      await fetchProducts();
      await fetchVendorCatalog();
      closeProductEdit();
    } catch (error) {
      console.error('Error saving vendor prices:', error);
      alert(error.response?.data?.error || 'Failed to save vendor prices');
    } finally {
      setSavingPrices(false);
    }
  };

  const handleDeactivate = async (priceId) => {
    if (!window.confirm('Deactivate this vendor price?')) return;
    try {
      await pricesAPI.delete(priceId);
      const response = await pricesAPI.getVendorCatalog({
        ...(vendorFilter ? { supplier: vendorFilter } : {}),
        ...(searchTerm.trim() ? { search: searchTerm.trim() } : {}),
      });
      const updatedCatalog = response.data || [];
      setVendorCatalog(updatedCatalog);
      setProductVendorRows(buildEditVendorRows(editingProductId, updatedCatalog, products, suppliers));
    } catch (error) {
      console.error('Error deactivating price:', error);
      alert('Failed to deactivate price');
    }
  };

  const formatPrice = (amount) => {
    if (amount == null || amount === '') return '—';
    return `₹${parseFloat(amount).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const groupedProducts = useMemo(() => {
    const map = new Map();

    for (const row of vendorCatalog) {
      const productId = row.product?._id;
      if (!productId) continue;

      if (!map.has(productId)) {
        map.set(productId, {
          productId,
          product: row.product,
          vendors: [],
        });
      }
      map.get(productId).vendors.push(row);
    }

    return Array.from(map.values()).sort((a, b) =>
      (a.product?.title || a.product?.name || '').localeCompare(
        b.product?.title || b.product?.name || ''
      )
    );
  }, [vendorCatalog]);

  return (
    <div className="prices-container">
      <div className="prices-header">
        <div>
          <h1>Vendor Prices</h1>
          <p className="prices-subtitle">
            Click a product row to view details and edit vendor prices.
          </p>
        </div>
        <div className="prices-header-actions">
          <button className="btn-secondary" onClick={() => setShowExcelUpload(true)}>
            ⬆ Upload Excel
          </button>
        </div>
      </div>

      <div className="prices-filters">
        <input
          type="text"
          placeholder="Search product, Parent SKU, Child SKU, vendor…"
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
                <th>Parent SKU</th>
                <th>Vendor</th>
                <th>Child SKU</th>
                <th>Vendor Price</th>
                <th>Last 3 Acquisitions</th>
              </tr>
            </thead>
            <tbody>
              {groupedProducts.length === 0 ? (
                <tr>
                  <td colSpan="7" className="no-data">
                    No vendor-linked products found. Link suppliers to products in the Products
                    page, then click a row here to set vendor prices.
                  </td>
                </tr>
              ) : (
                groupedProducts.flatMap((group) => {
                  const vendorCount = group.vendors.length;

                  return group.vendors.map((row, vendorIndex) => (
                    <tr
                      key={row.rowKey}
                      className={[
                        'clickable-row',
                        vendorIndex === 0 ? 'product-group-first-row' : 'product-vendor-sub-row',
                        row.purchasePrice == null ? 'no-vendor-price' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => openProductView(group.productId)}
                      title="Click to view product vendor prices"
                    >
                      {vendorIndex === 0 && (
                        <>
                          <td rowSpan={vendorCount} className="prices-image-cell product-group-cell">
                            <VendorPriceImage product={group.product} />
                          </td>
                          <td rowSpan={vendorCount} className="product-group-cell product-group-name">
                            <span>{group.product?.title || group.product?.name || 'Unknown'}</span>
                            {vendorCount > 1 && (
                              <span className="product-vendor-count">{vendorCount} vendors</span>
                            )}
                          </td>
                          <td rowSpan={vendorCount} className="sku product-group-cell">
                            {getParentSku(group.product) || '—'}
                          </td>
                        </>
                      )}
                      <td className="vendor-name">
                        {vendorIndex > 0 && <span className="vendor-sub-indicator">↳</span>}
                        {row.supplier?.name || '—'}
                      </td>
                      <td className="sku child-sku-cell">
                        {getVendorChildSku(group.product, row.vendorSku) || '—'}
                      </td>
                      <td className="font-semibold">{formatPrice(row.purchasePrice)}</td>
                      <td className="recent-acq-cell">
                        <RecentAcquisitions
                          acquisitions={row.recentAcquisitions}
                          formatPrice={formatPrice}
                        />
                      </td>
                    </tr>
                  ));
                })
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

      {viewingProductId && viewingProduct && (
        <div className="modal-overlay" onClick={closeProductView}>
          <div
            className="modal-content modal-content-wide product-vendor-prices-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="product-vendor-prices-header product-vendor-prices-header-with-image">
              <VendorPriceImage product={viewingProduct} size="form" />
              <div className="product-vendor-prices-header-main">
                <h2>{viewingProduct.title || viewingProduct.name}</h2>
                <p className="product-vendor-prices-sku">{formatProductSkuHeader(viewingProduct)}</p>
              </div>
              <div className="product-vendor-prices-header-actions">
                <button type="button" className="btn-primary" onClick={switchViewToEdit}>
                  Edit
                </button>
                <button type="button" className="detail-view-close-btn" onClick={closeProductView}>
                  Close
                </button>
              </div>
            </div>

            {(viewingProduct.images || []).filter((img) => img && img.trim() !== '').length > 1 && (
              <VendorPriceImageGallery product={viewingProduct} />
            )}

            <h3 className="product-vendor-prices-section-title">Vendor Prices</h3>
            {viewVendorRows.length === 0 ? (
              <p className="prices-modal-hint">No vendors linked to this product yet.</p>
            ) : (
              <div className="multi-vendor-table-wrap">
                <table className="multi-vendor-table">
                  <thead>
                    <tr>
                      <th>Vendor</th>
                      <th>Child SKU</th>
                      <th>Vendor Price</th>
                      <th>Last 3 Acquisitions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewVendorRows.map((row) => (
                      <tr key={row.supplierId}>
                        <td className="vendor-name">{row.supplierName}</td>
                        <td className="sku child-sku-cell">{row.childSku || '—'}</td>
                        <td className="font-semibold">{formatPrice(row.purchasePrice)}</td>
                        <td className="recent-acq-cell">
                          <RecentAcquisitions
                            acquisitions={row.recentAcquisitions}
                            formatPrice={formatPrice}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {editingProductId && viewingProduct && (
        <div className="modal-overlay" onClick={closeProductEdit}>
          <div
            className="modal-content modal-content-wide product-vendor-prices-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="product-vendor-prices-header product-vendor-prices-header-with-image">
              <VendorPriceImage product={viewingProduct} size="form" />
              <div className="product-vendor-prices-header-main">
                <h2>Edit Vendor Prices</h2>
                <p className="product-vendor-prices-sku">{formatProductSkuHeader(viewingProduct)}</p>
              </div>
              <button type="button" className="detail-view-close-btn" onClick={closeProductEdit}>
                Close
              </button>
            </div>

            <form onSubmit={handleSaveProductPrices}>
              <h3 className="product-vendor-prices-section-title">Vendor Prices</h3>
              <p className="prices-modal-hint">
                Update prices, edit child SKUs per vendor, or add a new vendor below.
              </p>

              {productVendorRows.length === 0 ? (
                <p className="prices-modal-hint">
                  No vendors yet. Add a vendor using the form below.
                </p>
              ) : (
                <div className="multi-vendor-table-wrap">
                  <table className="multi-vendor-table">
                    <thead>
                      <tr>
                        <th>Vendor</th>
                        <th>Child SKU</th>
                        <th>Vendor Price</th>
                        <th>Effective Date</th>
                        <th>Last 3 Acquisitions</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {productVendorRows.map((row) => (
                        <tr key={row.supplierId} className={row.isNewVendor ? 'vendor-row-new' : ''}>
                          <td className="vendor-name">
                            {row.supplierName}
                            {row.isNewVendor && <span className="vendor-new-badge">New</span>}
                          </td>
                          <td>
                            <input
                              type="text"
                              value={row.vendorSku}
                              onChange={(e) =>
                                handleProductVendorRowChange(row.supplierId, 'vendorSku', e.target.value)
                              }
                              placeholder="Child SKU"
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={row.purchasePrice}
                              onChange={(e) =>
                                handleProductVendorRowChange(
                                  row.supplierId,
                                  'purchasePrice',
                                  e.target.value
                                )
                              }
                              placeholder="Enter price"
                            />
                          </td>
                          <td>
                            <input
                              type="date"
                              value={row.effectiveDate}
                              onChange={(e) =>
                                handleProductVendorRowChange(
                                  row.supplierId,
                                  'effectiveDate',
                                  e.target.value
                                )
                              }
                            />
                          </td>
                          <td className="recent-acq-cell">
                            <RecentAcquisitions
                              acquisitions={row.recentAcquisitions}
                              formatPrice={formatPrice}
                            />
                          </td>
                          <td className="vendor-row-actions">
                            {row.priceId && row.isActive && (
                              <button
                                type="button"
                                className="btn-delete"
                                onClick={() => handleDeactivate(row.priceId)}
                              >
                                Deactivate
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn-remove-vendor"
                              onClick={() => handleRemoveVendorRow(row.supplierId)}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="add-vendor-section">
                <h4>Add Vendor</h4>
                <div className="add-vendor-row">
                  <select
                    value={newVendorPick}
                    onChange={(e) => setNewVendorPick(e.target.value)}
                  >
                    <option value="">Select vendor to add</option>
                    {availableSuppliersToAdd.map((supplier) => (
                      <option key={supplier._id} value={supplier._id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={newVendorSku}
                    onChange={(e) => setNewVendorSku(e.target.value)}
                    placeholder="Child SKU (optional)"
                  />
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleAddVendorToEdit}
                    disabled={!newVendorPick}
                  >
                    + Add Vendor
                  </button>
                </div>
                {availableSuppliersToAdd.length === 0 && productVendorRows.length > 0 && (
                  <p className="prices-modal-hint">All available vendors are already linked.</p>
                )}
              </div>

              <div className="form-actions">
                <button type="button" onClick={closeProductEdit}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={savingPrices || productVendorRows.length === 0}
                >
                  {savingPrices ? 'Saving…' : 'Save Changes'}
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
