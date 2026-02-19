import React, { useState, useEffect } from 'react';
import { shipmentsAPI, shipmentVendorsAPI, shippingChargesAPI, locationsAPI, productsAPI, stockAPI } from '../services/api';
import logger from '../utils/logger';
import './Shipments.css';

function Shipments() {
  const [shipments, setShipments] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [shippingCharges, setShippingCharges] = useState([]);
  const [locations, setLocations] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingShipment, setEditingShipment] = useState(null);
  const [formData, setFormData] = useState({
    shipmentVendor: '',
    shippingCharge: '',
    fromLocation: '',
    toLocation: '',
    shipmentDate: new Date().toISOString().split('T')[0],
    expectedDeliveryDate: '',
    items: [],
    status: 'pending',
    trackingNumber: '',
    notes: ''
  });
  const [newItem, setNewItem] = useState({
    product: '',
    quantity: 1,
    weight: ''
  });
  const [calculatedCharges, setCalculatedCharges] = useState({ cost: 0, totalWeight: 0 });
  const [availableStock, setAvailableStock] = useState({});

  useEffect(() => {
    fetchShipments();
    fetchVendors();
    fetchLocations();
    fetchProducts();
  }, []);

  useEffect(() => {
    if (formData.shipmentVendor) {
      fetchShippingCharges(formData.shipmentVendor);
    }
  }, [formData.shipmentVendor]);

  useEffect(() => {
    if (formData.fromLocation && formData.items.length > 0) {
      fetchStockForLocation();
    }
  }, [formData.fromLocation, formData.items]);

  useEffect(() => {
    if (formData.shippingCharge && formData.items.length > 0) {
      calculateCharges();
    }
  }, [formData.shippingCharge, formData.items]);

  const fetchShipments = async () => {
    try {
      setLoading(true);
      const response = await shipmentsAPI.getAll();
      setShipments(response.data);
    } catch (error) {
      console.error('Error fetching shipments:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack
      });
      logger.error('Error fetching shipments', error);
      alert('Failed to fetch shipments');
    } finally {
      setLoading(false);
    }
  };

  const fetchVendors = async () => {
    try {
      const response = await shipmentVendorsAPI.getAll({ isActive: 'true' });
      setVendors(response.data);
    } catch (error) {
      console.error('Error fetching vendors:', error);
      logger.error('Error fetching vendors', error);
    }
  };

  const fetchShippingCharges = async (vendorId) => {
    try {
      const response = await shippingChargesAPI.getByVendor(vendorId);
      setShippingCharges(response.data);
      if (response.data.length > 0 && !formData.shippingCharge) {
        setFormData(prev => ({ ...prev, shippingCharge: response.data[0]._id }));
      }
    } catch (error) {
      console.error('Error fetching shipping charges:', error);
      logger.error('Error fetching shipping charges', error);
    }
  };

  const fetchLocations = async () => {
    try {
      const response = await locationsAPI.getAll({ isActive: 'true' });
      setLocations(response.data);
    } catch (error) {
      console.error('Error fetching locations:', error);
      logger.error('Error fetching locations', error);
    }
  };

  const fetchProducts = async () => {
    try {
      const response = await productsAPI.getAll();
      setProducts(response.data);
    } catch (error) {
      console.error('Error fetching products:', error);
      logger.error('Error fetching products', error);
    }
  };

  const fetchStockForLocation = async () => {
    try {
      const stockMap = {};
      for (const item of formData.items) {
        if (item.product) {
          const response = await stockAPI.getSpecific(item.product, formData.fromLocation);
          if (response.data) {
            stockMap[item.product] = response.data.quantity || 0;
          }
        }
      }
      setAvailableStock(stockMap);
    } catch (error) {
      console.error('Error fetching stock:', error);
    }
  };

  const calculateCharges = async () => {
    if (!formData.shippingCharge || formData.items.length === 0) {
      setCalculatedCharges({ cost: 0, totalWeight: 0 });
      return;
    }

    try {
      // Get product weights if not provided
      const itemsWithWeights = await Promise.all(formData.items.map(async (item) => {
        if (!item.weight && item.product) {
          const product = products.find(p => p._id === item.product);
          if (product && product.weight) {
            return { ...item, weight: product.weight };
          }
        }
        return item;
      }));

      const response = await shipmentsAPI.calculateCharges({
        shippingChargeId: formData.shippingCharge,
        items: itemsWithWeights
      });
      setCalculatedCharges(response.data);
    } catch (error) {
      console.error('Error calculating charges:', error);
      logger.error('Error calculating charges', error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleItemInputChange = (e) => {
    const { name, value } = e.target;
    setNewItem((prev) => ({
      ...prev,
      [name]: name === 'quantity' ? parseInt(value) || 1 : name === 'weight' ? parseFloat(value) || '' : value,
    }));
  };

  const handleAddItem = async () => {
    if (!newItem.product || !newItem.quantity) {
      alert('Please select a product and enter quantity');
      return;
    }

    // Get product weight if not provided
    let weight = newItem.weight;
    if (!weight) {
      const product = products.find(p => p._id === newItem.product);
      if (product && product.weight) {
        weight = product.weight;
      } else {
        weight = 0;
      }
    }

    const item = {
      product: newItem.product,
      quantity: newItem.quantity,
      weight: weight
    };

    setFormData((prev) => ({
      ...prev,
      items: [...prev.items, item]
    }));

    // Fetch stock for this product
    if (formData.fromLocation) {
      try {
        const response = await stockAPI.getSpecific(newItem.product, formData.fromLocation);
        if (response.data) {
          setAvailableStock(prev => ({
            ...prev,
            [newItem.product]: response.data.quantity || 0
          }));
        }
      } catch (error) {
        console.error('Error fetching stock:', error);
      }
    }

    setNewItem({ product: '', quantity: 1, weight: '' });
  };

  const handleRemoveItem = (index) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (formData.items.length === 0) {
        alert('Please add at least one item');
        return;
      }

      if (editingShipment) {
        await shipmentsAPI.update(editingShipment._id, formData);
      } else {
        await shipmentsAPI.create(formData);
      }
      setShowModal(false);
      setEditingShipment(null);
      resetForm();
      fetchShipments();
    } catch (error) {
      console.error('Error saving shipment:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack,
        formData: formData
      });
      logger.error('Error saving shipment', error);
      alert(error.response?.data?.error || 'Failed to save shipment');
    }
  };

  const handleEdit = (shipment) => {
    setEditingShipment(shipment);
    setFormData({
      shipmentVendor: shipment.shipmentVendor?._id || shipment.shipmentVendor || '',
      shippingCharge: shipment.shippingCharge?._id || shipment.shippingCharge || '',
      fromLocation: shipment.fromLocation?._id || shipment.fromLocation || '',
      toLocation: shipment.toLocation?._id || shipment.toLocation || '',
      shipmentDate: shipment.shipmentDate ? new Date(shipment.shipmentDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      expectedDeliveryDate: shipment.expectedDeliveryDate ? new Date(shipment.expectedDeliveryDate).toISOString().split('T')[0] : '',
      items: shipment.items || [],
      status: shipment.status || 'pending',
      trackingNumber: shipment.trackingNumber || '',
      notes: shipment.notes || ''
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this shipment? This will reverse stock movements.')) {
      return;
    }
    try {
      await shipmentsAPI.delete(id);
      fetchShipments();
    } catch (error) {
      console.error('Error deleting shipment:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack
      });
      logger.error('Error deleting shipment', error);
      alert('Failed to delete shipment');
    }
  };

  const resetForm = () => {
    setFormData({
      shipmentVendor: '',
      shippingCharge: '',
      fromLocation: '',
      toLocation: '',
      shipmentDate: new Date().toISOString().split('T')[0],
      expectedDeliveryDate: '',
      items: [],
      status: 'pending',
      trackingNumber: '',
      notes: ''
    });
    setNewItem({ product: '', quantity: 1, weight: '' });
    setCalculatedCharges({ cost: 0, totalWeight: 0 });
    setAvailableStock({});
  };

  const openAddModal = () => {
    setEditingShipment(null);
    resetForm();
    setShowModal(true);
  };

  const getProductName = (productId) => {
    const product = products.find(p => p._id === productId);
    return product ? product.name : productId;
  };

  return (
    <div className="shipments-container">
      <div className="shipments-header">
        <h1>Shipments</h1>
        <button className="btn-primary" onClick={openAddModal}>
          + Create Shipment
        </button>
      </div>

      {loading ? (
        <div className="loading">Loading shipments...</div>
      ) : (
        <div className="shipments-table-container">
          <table className="shipments-table">
            <thead>
              <tr>
                <th>Shipment Number</th>
                <th>Vendor</th>
                <th>Direction</th>
                <th>From Location</th>
                <th>To Location</th>
                <th>Items</th>
                <th>Total Weight</th>
                <th>Shipping Charges</th>
                <th>Status</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {shipments.length === 0 ? (
                <tr>
                  <td colSpan="11" className="no-data">
                    No shipments found
                  </td>
                </tr>
              ) : (
                shipments.map((shipment) => (
                  <tr key={shipment._id}>
                    <td>{shipment.shipmentNumber}</td>
                    <td>{shipment.shipmentVendor?.name || '-'}</td>
                    <td>
                      <span className={`type-badge type-${shipment.shippingCharge?.type || 'outward'}`}>
                        {shipment.shippingCharge?.type === 'inward' ? 'Inward' : 'Outward'}
                      </span>
                    </td>
                    <td>{shipment.fromLocation?.name || '-'}</td>
                    <td>{shipment.toLocation?.name || '-'}</td>
                    <td>{shipment.items?.length || 0} items</td>
                    <td>{shipment.totalWeight?.toFixed(2) || 0} kg</td>
                    <td>₹{shipment.shippingCharges?.toFixed(2) || 0}</td>
                    <td>
                      <span className={`status-badge status-${shipment.status}`}>
                        {shipment.status}
                      </span>
                    </td>
                    <td>{new Date(shipment.shipmentDate).toLocaleDateString()}</td>
                    <td>
                      <button
                        className="btn-edit"
                        onClick={() => handleEdit(shipment)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn-delete"
                        onClick={() => handleDelete(shipment._id)}
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

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{editingShipment ? 'Edit Shipment' : 'Create Shipment'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label>Shipment Vendor *</label>
                  <select
                    name="shipmentVendor"
                    value={formData.shipmentVendor}
                    onChange={handleInputChange}
                    required
                  >
                    <option value="">Select Vendor</option>
                    {vendors.map((vendor) => (
                      <option key={vendor._id} value={vendor._id}>
                        {vendor.name} ({vendor.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Shipping Charge *</label>
                  <select
                    name="shippingCharge"
                    value={formData.shippingCharge}
                    onChange={handleInputChange}
                    required
                    disabled={!formData.shipmentVendor}
                  >
                    <option value="">Select Charge Structure</option>
                    {shippingCharges.map((charge) => (
                      <option key={charge._id} value={charge._id}>
                        {charge.name} ({charge.type === 'inward' ? 'Inward' : 'Outward'})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>From Location *</label>
                  <select
                    name="fromLocation"
                    value={formData.fromLocation}
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
                  <label>To Location *</label>
                  <select
                    name="toLocation"
                    value={formData.toLocation}
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
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Shipment Date *</label>
                  <input
                    type="date"
                    name="shipmentDate"
                    value={formData.shipmentDate}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Expected Delivery Date</label>
                  <input
                    type="date"
                    name="expectedDeliveryDate"
                    value={formData.expectedDeliveryDate}
                    onChange={handleInputChange}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Items *</label>
                <div className="items-section">
                  <div className="add-item-form">
                    <select
                      name="product"
                      value={newItem.product}
                      onChange={handleItemInputChange}
                    >
                      <option value="">Select Product</option>
                      {products.map((product) => (
                        <option key={product._id} value={product._id}>
                          {product.name} {product.sku ? `(${product.sku})` : ''}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      name="quantity"
                      placeholder="Quantity"
                      min="1"
                      value={newItem.quantity}
                      onChange={handleItemInputChange}
                    />
                    <input
                      type="number"
                      name="weight"
                      step="0.01"
                      min="0"
                      placeholder="Weight per unit (kg)"
                      value={newItem.weight}
                      onChange={handleItemInputChange}
                    />
                    <button type="button" onClick={handleAddItem} className="btn-add-item">
                      Add Item
                    </button>
                  </div>
                  {formData.items.length > 0 && (
                    <div className="items-list">
                      <table className="items-table">
                        <thead>
                          <tr>
                            <th>Product</th>
                            <th>Quantity</th>
                            <th>Weight/Unit</th>
                            <th>Total Weight</th>
                            <th>Stock Available</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {formData.items.map((item, idx) => (
                            <tr key={idx}>
                              <td>{getProductName(item.product)}</td>
                              <td>{item.quantity}</td>
                              <td>{item.weight || 0} kg</td>
                              <td>{(item.weight * item.quantity).toFixed(2)} kg</td>
                              <td>
                                <span className={availableStock[item.product] >= item.quantity ? 'stock-ok' : 'stock-low'}>
                                  {availableStock[item.product] !== undefined ? availableStock[item.product] : 'Checking...'}
                                </span>
                              </td>
                              <td>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveItem(idx)}
                                  className="btn-remove-item"
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
                </div>
              </div>

              {calculatedCharges.totalWeight > 0 && (
                <div className="charges-summary">
                  <div className="summary-row">
                    <span>Total Weight:</span>
                    <strong>{calculatedCharges.totalWeight.toFixed(2)} kg</strong>
                  </div>
                  <div className="summary-row">
                    <span>Shipping Charges:</span>
                    <strong>₹{calculatedCharges.cost.toFixed(2)}</strong>
                  </div>
                </div>
              )}

              <div className="form-row">
                <div className="form-group">
                  <label>Status</label>
                  <select
                    name="status"
                    value={formData.status}
                    onChange={handleInputChange}
                  >
                    <option value="pending">Pending</option>
                    <option value="preparing">Preparing</option>
                    <option value="shipped">Shipped</option>
                    <option value="in-transit">In Transit</option>
                    <option value="delivered">Delivered</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Tracking Number</label>
                  <input
                    type="text"
                    name="trackingNumber"
                    value={formData.trackingNumber}
                    onChange={handleInputChange}
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
                  {editingShipment ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Shipments;

