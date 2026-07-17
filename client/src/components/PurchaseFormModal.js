import React, { useEffect, useState } from 'react';
import { purchasesAPI, suppliersAPI, productsAPI, locationsAPI, pricesAPI } from '../services/api';
import { computeCategoryTax } from '../utils/taxRates';
import './Purchases.css';

const emptyForm = () => ({
  supplier: '',
  location: '',
  purchaseDate: new Date().toISOString().split('T')[0],
  items: [],
  tax: 0,
  defaultTaxRate: 0,
  paymentStatus: 'pending',
  notes: '',
});

function PurchaseFormModal({ onClose, onSaved }) {
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [productPrices, setProductPrices] = useState({});
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [newItem, setNewItem] = useState({ product: '', quantity: 1, unitPrice: 0 });

  useEffect(() => {
    suppliersAPI.getAll().then((res) => setSuppliers(res.data || [])).catch(console.error);
    locationsAPI.getAll({ isActive: 'true' }).then((res) => setLocations(res.data || [])).catch(console.error);
    productsAPI.getAll().then(async (res) => {
      const productsData = res.data || [];
      setProducts(productsData);
      if (productsData.length > 0) {
        try {
          const pricesResponse = await pricesAPI.getBulkCurrent(productsData.map((p) => p._id));
          const pricesMap = {};
          (pricesResponse.data || []).forEach((price) => {
            pricesMap[price.product._id || price.product] = price;
          });
          setProductPrices(pricesMap);
        } catch (error) {
          console.error('Error fetching prices:', error);
        }
      }
    }).catch(console.error);
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'tax' || name === 'defaultTaxRate' ? parseFloat(value) || 0 : value,
    }));
  };

  const handleAddItem = () => {
    if (!newItem.product || newItem.quantity <= 0 || newItem.unitPrice < 0) {
      alert('Please fill in all item fields');
      return;
    }
    const item = {
      product: newItem.product,
      quantity: parseFloat(newItem.quantity),
      unitPrice: parseFloat(newItem.unitPrice),
      total: parseFloat(newItem.quantity) * parseFloat(newItem.unitPrice),
    };
    setFormData((prev) => ({ ...prev, items: [...prev.items, item] }));
    setNewItem({ product: '', quantity: 1, unitPrice: 0 });
  };

  const handleRemoveItem = (index) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const calculateSubtotal = () => formData.items.reduce((sum, item) => sum + item.total, 0);
  const calculateTax = () => computeCategoryTax(formData.items, products, formData.defaultTaxRate);
  const calculateTotal = () => calculateSubtotal() + calculateTax();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.items.length === 0) {
      alert('Please add at least one item');
      return;
    }
    try {
      setSaving(true);
      await purchasesAPI.create({
        ...formData,
        subtotal: calculateSubtotal(),
        tax: calculateTax(),
        total: calculateTotal(),
      });
      onSaved?.();
      onClose?.();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to save purchase');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
        <h2>Add Purchase</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Supplier *</label>
              <select name="supplier" value={formData.supplier} onChange={handleInputChange} required>
                <option value="">Select Supplier</option>
                {suppliers.map((supplier) => (
                  <option key={supplier._id} value={supplier._id}>{supplier.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Location/Warehouse *</label>
              <select name="location" value={formData.location} onChange={handleInputChange} required>
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
              <select name="paymentStatus" value={formData.paymentStatus} onChange={handleInputChange}>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="partial">Partial</option>
              </select>
            </div>
          </div>

          <div className="items-section">
            <h3>Items</h3>
            <div className="add-item-form">
              <select
                value={newItem.product}
                onChange={(e) => {
                  const productId = e.target.value;
                  const price = productPrices[productId];
                  setNewItem({
                    ...newItem,
                    product: productId,
                    unitPrice: price ? price.purchasePrice : 0,
                  });
                }}
              >
                <option value="">Select Product</option>
                {products.map((product) => {
                  const price = productPrices[product._id];
                  const purchasePrice = price ? price.purchasePrice : 0;
                  return (
                    <option key={product._id} value={product._id}>
                      {product.title || product.name} - ₹{purchasePrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </option>
                  );
                })}
              </select>
              <input
                type="number"
                placeholder="Quantity"
                value={newItem.quantity}
                onChange={(e) => setNewItem({ ...newItem, quantity: parseFloat(e.target.value) || 0 })}
                min="1"
              />
              <input
                type="number"
                step="0.01"
                placeholder="Unit Price (₹)"
                value={newItem.unitPrice}
                onChange={(e) => setNewItem({ ...newItem, unitPrice: parseFloat(e.target.value) || 0 })}
                min="0"
              />
              <button type="button" onClick={handleAddItem} className="btn-add-item">Add Item</button>
            </div>

            <div className="items-list">
              {formData.items.map((item, index) => {
                const product = products.find((p) => p._id === item.product);
                return (
                  <div key={index} className="item-row">
                    <span>{product?.title || product?.name || 'Unknown'}</span>
                    <span>Qty: {item.quantity}</span>
                    <span>₹{item.unitPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span>₹{item.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <button type="button" onClick={() => handleRemoveItem(index)} className="btn-remove-item">Remove</button>
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
            <textarea name="notes" value={formData.notes} onChange={handleInputChange} rows="3" />
          </div>

          <div className="form-actions">
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save Purchase'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default PurchaseFormModal;
