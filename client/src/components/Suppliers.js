import React, { useState, useEffect } from 'react';
import { suppliersAPI } from '../services/api';
import DetailModal from './DetailModal';
import ExcelUpload from './ExcelUpload';
import './Suppliers.css';

const emptyForm = () => ({
  supplierId: '',
  name: '',
  supplierCode: '',
  phone: '',
  contactPerson: '',
  gstin: '',
  bankDetails: '',
  ifscCode: '',
  bankPinCode: '',
  email: '',
  address: '',
  pan: '',
  state: '',
  advancePercent: 0,
  creditDays: 0,
  deliveryMode: '',
  incoterms: '',
  paymentTermsNotes: '',
});

function Suppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showExcelUpload, setShowExcelUpload] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [viewingSupplier, setViewingSupplier] = useState(null);
  const [supplierProducts, setSupplierProducts] = useState([]);
  const [loadingSupplierProducts, setLoadingSupplierProducts] = useState(false);
  const [formData, setFormData] = useState(emptyForm());

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    try {
      setLoading(true);
      const response = await suppliersAPI.getAll({ search: searchTerm });
      setSuppliers(response.data);
    } catch (error) {
      console.error('Error fetching suppliers:', error);
      alert('Failed to fetch suppliers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      fetchSuppliers();
    }, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchTerm]);

  useEffect(() => {
    if (!viewingSupplier?._id) {
      setSupplierProducts([]);
      return;
    }

    if (viewingSupplier.linkedProducts?.length) {
      setSupplierProducts(viewingSupplier.linkedProducts);
    }

    const loadProducts = async () => {
      setLoadingSupplierProducts(true);
      try {
        const response = await suppliersAPI.getProducts(viewingSupplier._id);
        setSupplierProducts(response.data || []);
      } catch (error) {
        console.error('Error fetching supplier products:', error);
        if (!viewingSupplier.linkedProducts?.length) {
          setSupplierProducts([]);
        }
      } finally {
        setLoadingSupplierProducts(false);
      }
    };

    loadProducts();
  }, [viewingSupplier?._id]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    const numericFields = new Set(['advancePercent', 'creditDays']);
    setFormData((prev) => ({
      ...prev,
      [name]: numericFields.has(name) ? parseFloat(value) || 0 : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...formData };
      if (!editingSupplier && !payload.supplierId?.trim()) {
        delete payload.supplierId;
      }
      if (payload.supplierId) {
        payload.supplierId = payload.supplierId.trim().toUpperCase();
      }
      if (payload.gstin) payload.gstin = payload.gstin.trim().toUpperCase();
      if (payload.ifscCode) payload.ifscCode = payload.ifscCode.trim().toUpperCase();
      if (payload.pan) payload.pan = payload.pan.trim().toUpperCase();

      if (editingSupplier) {
        await suppliersAPI.update(editingSupplier._id, payload);
      } else {
        await suppliersAPI.create(payload);
      }
      setShowModal(false);
      setEditingSupplier(null);
      resetForm();
      fetchSuppliers();
    } catch (error) {
      console.error('Error saving supplier:', error);
      alert(error.response?.data?.error || 'Failed to save supplier');
    }
  };

  const supplierToForm = (supplier) => ({
    supplierId: supplier.supplierId || '',
    name: supplier.name || '',
    supplierCode: supplier.supplierCode || '',
    phone: supplier.phone || '',
    contactPerson: supplier.contactPerson || '',
    gstin: supplier.gstin || '',
    bankDetails: supplier.bankDetails || '',
    ifscCode: supplier.ifscCode || '',
    bankPinCode: supplier.bankPinCode || '',
    email: supplier.email || '',
    address: supplier.address || '',
    pan: supplier.pan || '',
    state: supplier.state || '',
    advancePercent: supplier.advancePercent ?? 0,
    creditDays: supplier.creditDays ?? 0,
    deliveryMode: supplier.deliveryMode || '',
    incoterms: supplier.incoterms || '',
    paymentTermsNotes: supplier.paymentTermsNotes || '',
  });

  const handleEdit = (supplier) => {
    setEditingSupplier(supplier);
    setFormData(supplierToForm(supplier));
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this supplier?')) {
      return;
    }
    try {
      await suppliersAPI.delete(id);
      fetchSuppliers();
    } catch (error) {
      console.error('Error deleting supplier:', error);
      alert('Failed to delete supplier');
    }
  };

  const resetForm = () => {
    setFormData(emptyForm());
  };

  const openAddModal = () => {
    setEditingSupplier(null);
    resetForm();
    setShowModal(true);
  };

  const formatLinkedProductsPreview = (supplier, maxItems = 4) => {
    const products = supplier.linkedProducts || [];
    if (products.length === 0) return null;
    const shown = products.slice(0, maxItems);
    const remaining = products.length - shown.length;
    return { shown, remaining, total: products.length };
  };

  const detailFields = (supplier) => [
    { label: 'Supplier ID', value: supplier.supplierId },
    { label: 'Supplier Name', value: supplier.name },
    { label: 'Supplier Code', value: supplier.supplierCode },
    { label: 'Supplier Contact', value: supplier.phone },
    { label: 'Contact Person', value: supplier.contactPerson },
    { label: 'GST No.', value: supplier.gstin },
    { label: 'Bank Detail', value: supplier.bankDetails, full: true },
    { label: 'IFSC Code', value: supplier.ifscCode },
    { label: 'Bank Pin Code', value: supplier.bankPinCode },
    { label: 'Email', value: supplier.email },
    { label: 'Address', value: supplier.address, full: true },
    { label: 'PAN Number', value: supplier.pan },
    { label: 'State', value: supplier.state },
    { label: 'Advance %', value: supplier.advancePercent != null ? `${supplier.advancePercent}%` : null },
    { label: 'Credit Days', value: supplier.creditDays },
    { label: 'Delivery Mode', value: supplier.deliveryMode },
    { label: 'Incoterms', value: supplier.incoterms },
    { label: 'Payment Terms Notes', value: supplier.paymentTermsNotes, full: true },
  ];

  return (
    <div className="suppliers-container">
      <div className="suppliers-header">
        <div>
          <h1>Suppliers</h1>
          <p className="suppliers-subtitle">
            Supplier details and payment terms auto-fill when you select a vendor on purchase orders.
          </p>
        </div>
        <div className="page-header-actions">
          <button className="btn-secondary" onClick={() => setShowExcelUpload(true)}>
            ⬆ Upload Excel
          </button>
          <button className="btn-primary" onClick={openAddModal}>
            + Add Supplier
          </button>
        </div>
      </div>

      <div className="search-bar">
        <input
          type="text"
          placeholder="Search by supplier ID, name, code, contact, GST, IFSC..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="loading">Loading suppliers...</div>
      ) : (
        <div className="suppliers-table-container">
          <table className="suppliers-table">
            <thead>
              <tr>
                <th>Supplier ID</th>
                <th>Supplier Name</th>
                <th>Supplier Code</th>
                <th>Supplier Contact</th>
                <th>Contact Person</th>
                <th>Linked Products</th>
                <th>GST No.</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.length === 0 ? (
                <tr>
                  <td colSpan="8" className="no-data">
                    No suppliers found
                  </td>
                </tr>
              ) : (
                suppliers.map((supplier) => (
                  <tr
                    key={supplier._id}
                    className="clickable-row"
                    onClick={() => setViewingSupplier(supplier)}
                  >
                    <td className="supplier-id-cell">{supplier.supplierId || '—'}</td>
                    <td>{supplier.name}</td>
                    <td className="supplier-id-cell">{supplier.supplierCode || '—'}</td>
                    <td>{supplier.phone || '—'}</td>
                    <td>{supplier.contactPerson || '—'}</td>
                    <td className="supplier-products-cell">
                      {(() => {
                        const preview = formatLinkedProductsPreview(supplier);
                        if (!preview) {
                          return <span className="supplier-products-none">—</span>;
                        }
                        return (
                          <div className="supplier-products-preview">
                            <span className="supplier-products-count">
                              {preview.total} product{preview.total !== 1 ? 's' : ''}
                            </span>
                            <div className="supplier-products-skus">
                              {preview.shown.map((p) => (
                                <span
                                  key={p._id}
                                  className="supplier-product-tag"
                                  title={`${p.title || p.sku} · ${p.unit || 'pcs'}`}
                                >
                                  {p.sku || '—'}
                                  {p.unit ? ` (${p.unit})` : ''}
                                </span>
                              ))}
                              {preview.remaining > 0 && (
                                <span className="supplier-product-more">
                                  +{preview.remaining} more
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="supplier-id-cell">{supplier.gstin || '—'}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button
                        className="btn-edit"
                        onClick={() => handleEdit(supplier)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn-delete"
                        onClick={() => handleDelete(supplier._id)}
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

      {showExcelUpload && (
        <ExcelUpload
          moduleName="suppliers"
          templateEndpoint="/suppliers/template"
          onUploadComplete={() => fetchSuppliers()}
          onClose={() => setShowExcelUpload(false)}
        />
      )}

      {viewingSupplier && (
        <DetailModal
          title={viewingSupplier.name || 'Supplier Details'}
          fields={detailFields(viewingSupplier)}
          onClose={() => setViewingSupplier(null)}
          onEdit={() => {
            const supplier = viewingSupplier;
            setViewingSupplier(null);
            handleEdit(supplier);
          }}
          onDelete={() => {
            const id = viewingSupplier._id;
            setViewingSupplier(null);
            handleDelete(id);
          }}
        >
          <div className="detail-view-section supplier-products-section">
            <h3>Products Supplied ({supplierProducts.length})</h3>
            {loadingSupplierProducts ? (
              <p className="supplier-products-loading">Loading products…</p>
            ) : supplierProducts.length === 0 ? (
              <p className="supplier-products-empty">
                No products linked to this supplier. Link suppliers from the Products page.
              </p>
            ) : (
              <div className="supplier-products-table-wrap">
                <table className="supplier-products-table">
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Product</th>
                      <th>Category</th>
                      <th>Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplierProducts.map((product) => (
                      <tr key={product._id}>
                        <td className="supplier-product-sku">{product.sku || '—'}</td>
                        <td>{product.title || '—'}</td>
                        <td>{product.category || '—'}</td>
                        <td>{product.unit || 'pcs'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </DetailModal>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content supplier-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editingSupplier ? 'Edit Supplier' : 'Add Supplier'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-section">
                <h3>Supplier Information</h3>
                <div className="form-row">
                  <div className="form-group">
                    <label>Supplier ID {editingSupplier ? '' : '(auto if blank)'}</label>
                    <input
                      type="text"
                      name="supplierId"
                      value={formData.supplierId}
                      onChange={handleInputChange}
                      placeholder="e.g. SUP-0001"
                      disabled={Boolean(editingSupplier?.supplierId)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Supplier Code</label>
                    <input
                      type="text"
                      name="supplierCode"
                      value={formData.supplierCode}
                      onChange={handleInputChange}
                      placeholder="Internal supplier code"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Supplier Name *</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Supplier Contact</label>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleInputChange}
                      placeholder="Phone / mobile"
                    />
                  </div>
                  <div className="form-group">
                    <label>Contact Person</label>
                    <input
                      type="text"
                      name="contactPerson"
                      value={formData.contactPerson}
                      onChange={handleInputChange}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>GST No.</label>
                  <input
                    type="text"
                    name="gstin"
                    value={formData.gstin}
                    onChange={handleInputChange}
                    placeholder="e.g. 22AAAAA0000A1Z5"
                    maxLength={15}
                  />
                </div>
              </div>

              <div className="form-section">
                <h3>Bank Details</h3>
                <div className="form-group">
                  <label>Bank Detail</label>
                  <textarea
                    name="bankDetails"
                    value={formData.bankDetails}
                    onChange={handleInputChange}
                    rows="2"
                    placeholder="Bank name, branch, account number"
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>IFSC Code</label>
                    <input
                      type="text"
                      name="ifscCode"
                      value={formData.ifscCode}
                      onChange={handleInputChange}
                      placeholder="e.g. HDFC0001234"
                      maxLength={11}
                    />
                  </div>
                  <div className="form-group">
                    <label>Bank Pin Code</label>
                    <input
                      type="text"
                      name="bankPinCode"
                      value={formData.bankPinCode}
                      onChange={handleInputChange}
                      placeholder="e.g. 201301"
                      maxLength={6}
                    />
                  </div>
                </div>
              </div>

              <div className="form-section">
                <h3>Payment &amp; Delivery Terms</h3>
                <p className="form-section-hint">
                  These terms apply automatically when this supplier is selected on a purchase order.
                </p>
                <div className="form-row">
                  <div className="form-group">
                    <label>Advance %</label>
                    <input
                      type="number"
                      name="advancePercent"
                      value={formData.advancePercent}
                      onChange={handleInputChange}
                      min="0"
                      max="100"
                    />
                  </div>
                  <div className="form-group">
                    <label>Credit Days</label>
                    <input
                      type="number"
                      name="creditDays"
                      value={formData.creditDays}
                      onChange={handleInputChange}
                      min="0"
                    />
                  </div>
                  <div className="form-group">
                    <label>Delivery Mode</label>
                    <input
                      type="text"
                      name="deliveryMode"
                      value={formData.deliveryMode}
                      onChange={handleInputChange}
                      placeholder="Road / Air / Courier"
                    />
                  </div>
                  <div className="form-group">
                    <label>Incoterms</label>
                    <input
                      type="text"
                      name="incoterms"
                      value={formData.incoterms}
                      onChange={handleInputChange}
                      placeholder="EXW / FOB / CIF"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Payment Terms Notes</label>
                  <textarea
                    name="paymentTermsNotes"
                    value={formData.paymentTermsNotes}
                    onChange={handleInputChange}
                    rows="2"
                    placeholder="e.g. 30% advance, balance on delivery"
                  />
                </div>
              </div>

              <div className="form-section">
                <h3>Additional (optional)</h3>
                <div className="form-row">
                  <div className="form-group">
                    <label>Email</label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div className="form-group">
                    <label>PAN Number</label>
                    <input
                      type="text"
                      name="pan"
                      value={formData.pan}
                      onChange={handleInputChange}
                      placeholder="e.g. ABCDE1234F"
                      maxLength={10}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>State</label>
                  <input
                    type="text"
                    name="state"
                    value={formData.state}
                    onChange={handleInputChange}
                    placeholder="For CGST/SGST vs IGST"
                  />
                </div>
                <div className="form-group">
                  <label>Address</label>
                  <textarea
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                    rows="2"
                  />
                </div>
              </div>

              <div className="form-actions">
                <button type="button" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  {editingSupplier ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Suppliers;
