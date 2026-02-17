import React, { useState, useEffect } from 'react';
import { salesAPI, salesChannelsAPI, salesLocationsAPI, productsAPI, pricesAPI } from '../services/api';
import './Sales.css';

function Sales() {
  const [sales, setSales] = useState([]);
  const [salesChannels, setSalesChannels] = useState([]);
  const [salesLocations, setSalesLocations] = useState([]);
  const [products, setProducts] = useState([]);
  const [productPrices, setProductPrices] = useState({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingSale, setEditingSale] = useState(null);
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
    paymentStatus: 'pending',
    orderStatus: 'pending',
    notes: '',
  });
  const [newItem, setNewItem] = useState({
    product: '',
    quantity: 1,
    unitPrice: 0,
  });

  useEffect(() => {
    fetchSales();
    fetchSalesChannels();
    fetchProducts();
  }, []);

  useEffect(() => {
    if (formData.salesChannel) {
      fetchSalesLocations(formData.salesChannel);
    } else {
      setSalesLocations([]);
    }
  }, [formData.salesChannel]);

  useEffect(() => {
    if (showModal && products.length > 0) {
      fetchPricesForChannel(formData.salesChannel);
    }
  }, [showModal, formData.salesChannel, products]);

  const fetchPricesForChannel = async (channelId) => {
    try {
      const productIds = products.map(p => p._id);
      const salesChannel = channelId || null;
      const response = await pricesAPI.getBulkCurrent(productIds, salesChannel);
      const pricesMap = {};
      const pricesData = Array.isArray(response.data) ? response.data : [];
      pricesData.forEach(price => {
        const prodId = price.product?._id || price.product;
        pricesMap[prodId] = price;
      });
      setProductPrices(pricesMap);
    } catch (error) {
      console.error('Error fetching prices:', error);
      setProductPrices({});
    }
  };

  const fetchSales = async () => {
    try {
      setLoading(true);
      const response = await salesAPI.getAll();
      setSales(response.data);
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
      const productsData = Array.isArray(response.data) ? response.data : response.data?.data || [];
      setProducts(productsData);
    } catch (error) {
      console.error('Error fetching products:', error);
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
        [name]: name === 'discount' || name === 'tax' ? parseFloat(value) || 0 : value,
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

  const calculateTotal = () => {
    return calculateSubtotal() - (formData.discount || 0) + (formData.tax || 0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const saleData = {
        ...formData,
        subtotal: calculateSubtotal(),
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
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack,
        formData: formData
      });
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
      paymentStatus: sale.paymentStatus || 'pending',
      orderStatus: sale.orderStatus || 'pending',
      notes: sale.notes || '',
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this sale?')) {
      return;
    }
    try {
      await salesAPI.delete(id);
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
      paymentStatus: 'pending',
      orderStatus: 'pending',
      notes: '',
    });
    setNewItem({ product: '', quantity: 1, unitPrice: 0 });
  };

  const openAddModal = () => {
    setEditingSale(null);
    resetForm();
    setShowModal(true);
  };

  const formatCurrency = (amount) => {
    return `₹${parseFloat(amount || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  return (
    <div className="sales-container">
      <div className="sales-header">
        <h1>Sales</h1>
        <button className="btn-primary" onClick={openAddModal}>
          + Add Sale
        </button>
      </div>

      {loading ? (
        <div className="loading">Loading sales...</div>
      ) : (
        <div className="sales-table-container">
          <table className="sales-table">
            <thead>
              <tr>
                <th>Sales Number</th>
                <th>Date</th>
                <th>Channel</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Total</th>
                <th>Payment Status</th>
                <th>Order Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sales.length === 0 ? (
                <tr>
                  <td colSpan="9" className="no-data">
                    No sales found
                  </td>
                </tr>
              ) : (
                sales.map((sale) => (
                  <tr key={sale._id}>
                    <td>{sale.salesNumber}</td>
                    <td>{new Date(sale.salesDate).toLocaleDateString()}</td>
                    <td>{sale.salesChannel?.name || '-'}</td>
                    <td>{sale.customer?.name || '-'}</td>
                    <td>{sale.items?.length || 0}</td>
                    <td>{formatCurrency(sale.total)}</td>
                    <td>
                      <span className={`status-badge status-${sale.paymentStatus}`}>
                        {sale.paymentStatus}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge status-${sale.orderStatus}`}>
                        {sale.orderStatus}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn-edit"
                        onClick={() => handleEdit(sale)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn-delete"
                        onClick={() => handleDelete(sale._id)}
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
          <div className="modal-content-large" onClick={(e) => e.stopPropagation()}>
            <h2>{editingSale ? 'Edit Sale' : 'Add Sale'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
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
                    return (
                      <div key={index} className="item-row">
                        <span>{product?.title || product?.name || 'Unknown'}</span>
                        <span>Qty: {item.quantity}</span>
                        <span>{formatCurrency(item.unitPrice)}</span>
                        <span>{formatCurrency(item.total)}</span>
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
                  <label>Discount (₹)</label>
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
                  <label>Tax (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    name="tax"
                    value={formData.tax}
                    onChange={handleInputChange}
                    min="0"
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

              <div className="form-row">
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

