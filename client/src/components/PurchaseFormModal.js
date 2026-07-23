import React, { useEffect, useMemo, useRef, useState } from 'react';
import { purchasesAPI, suppliersAPI, productsAPI, locationsAPI, pricesAPI } from '../services/api';
import { computeCategoryTax } from '../utils/taxRates';
import { getCatalogSku, getProductDisplayName } from '../utils/productDisplayUtils';
import './Purchases.css';

const emptyForm = () => ({
  supplier: '',
  location: '',
  purchaseDate: new Date().toISOString().split('T')[0],
  items: [emptyLine()],
  tax: 0,
  defaultTaxRate: 0,
    paymentStatus: 'unpaid',
  notes: '',
});

function emptyLine() {
  return {
    query: '',
    productId: '',
    quantity: 1,
    unitPrice: 0,
  };
}

function extractProducts(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function productLabel(product) {
  const name = getProductDisplayName(product) || 'Untitled';
  const sku = getCatalogSku(product) || product?.sku || '';
  return sku ? `${name} (${sku})` : name;
}

function formatMoney(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function PurchaseFormModal({ onClose, onSaved }) {
  const [suppliers, setSuppliers] = useState([]);
  const [productsById, setProductsById] = useState({});
  const [locations, setLocations] = useState([]);
  const [productPrices, setProductPrices] = useState({});
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [activeSuggestRow, setActiveSuggestRow] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const searchTimers = useRef({});

  const products = useMemo(() => Object.values(productsById), [productsById]);

  const mergeProducts = (list) => {
    if (!list?.length) return;
    setProductsById((prev) => {
      const next = { ...prev };
      list.forEach((p) => {
        if (p?._id) next[p._id] = p;
      });
      return next;
    });
  };

  const loadPricesFor = async (list) => {
    const ids = (list || []).map((p) => p._id).filter(Boolean);
    if (!ids.length) return;
    try {
      const pricesResponse = await pricesAPI.getBulkCurrent(ids);
      setProductPrices((prev) => {
        const next = { ...prev };
        (pricesResponse.data || []).forEach((price) => {
          const id = price.product?._id || price.product;
          if (id) next[id] = price;
        });
        return next;
      });
    } catch (error) {
      console.error('Error fetching prices:', error);
    }
  };

  useEffect(() => {
    suppliersAPI.getAll().then((res) => {
      const list = extractProducts(res.data);
      setSuppliers(list.length ? list : (Array.isArray(res.data) ? res.data : []));
    }).catch(console.error);
    locationsAPI.getAll({ isActive: 'true' }).then((res) => {
      const list = extractProducts(res.data);
      setLocations(list.length ? list : (Array.isArray(res.data) ? res.data : []));
    }).catch(console.error);

    // Prefetch a first page so suggestions work immediately on focus
    productsAPI.getAll({ page: 1, limit: 50 }).then(async (res) => {
      const list = extractProducts(res.data);
      mergeProducts(list);
      await loadPricesFor(list);
    }).catch(console.error);

    return () => {
      Object.values(searchTimers.current).forEach((t) => window.clearTimeout(t));
    };
  }, []);

  const searchProducts = (index, query) => {
    const q = String(query || '').trim();
    if (searchTimers.current[index]) {
      window.clearTimeout(searchTimers.current[index]);
    }

    if (!q) {
      setSuggestions([]);
      setSuggestLoading(false);
      return;
    }

    setSuggestLoading(true);
    searchTimers.current[index] = window.setTimeout(async () => {
      try {
        const res = await productsAPI.getAll({ search: q, page: 1, limit: 20 });
        const list = extractProducts(res.data);
        mergeProducts(list);
        await loadPricesFor(list);
        setSuggestions(list);
        setActiveSuggestRow(index);
      } catch (error) {
        console.error('Product search failed:', error);
        setSuggestions([]);
      } finally {
        setSuggestLoading(false);
      }
    }, 250);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'tax' || name === 'defaultTaxRate' ? parseFloat(value) || 0 : value,
    }));
  };

  const updateLine = (index, patch) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    }));
  };

  const applyProductToLine = (index, product) => {
    if (!product) return;
    const price = productPrices[product._id];
    mergeProducts([product]);
    updateLine(index, {
      query: productLabel(product),
      productId: product._id,
      unitPrice: price ? Number(price.purchasePrice) || 0 : 0,
    });
    setSuggestions([]);
    setActiveSuggestRow(null);
  };

  const handleProductQueryChange = (index, value) => {
    updateLine(index, { query: value, productId: '' });
    setActiveSuggestRow(index);
    searchProducts(index, value);
  };

  const handleProductFocus = (index) => {
    setActiveSuggestRow(index);
    const query = formData.items[index]?.query || '';
    if (String(query).trim()) {
      searchProducts(index, query);
      return;
    }
    productsAPI.getAll({ page: 1, limit: 20 }).then(async (res) => {
      const list = extractProducts(res.data);
      mergeProducts(list);
      await loadPricesFor(list);
      setSuggestions(list);
      setActiveSuggestRow(index);
    }).catch(console.error);
  };

  const handleProductBlur = (index) => {
    window.setTimeout(() => {
      setActiveSuggestRow((current) => (current === index ? null : current));
      setSuggestions((prev) => (activeSuggestRow === index ? [] : prev));
    }, 180);
  };

  const addLine = () => {
    setFormData((prev) => ({ ...prev, items: [...prev.items, emptyLine()] }));
  };

  const removeLine = (index) => {
    setFormData((prev) => {
      const next = prev.items.filter((_, i) => i !== index);
      return { ...prev, items: next.length ? next : [emptyLine()] };
    });
  };

  const resolvedItems = useMemo(
    () =>
      formData.items
        .map((line) => {
          const product = productsById[line.productId];
          if (!product) return null;
          const quantity = Number(line.quantity) || 0;
          const unitPrice = Number(line.unitPrice) || 0;
          if (quantity <= 0 || unitPrice < 0) return null;
          return {
            product: product._id,
            quantity,
            unitPrice,
            total: quantity * unitPrice,
          };
        })
        .filter(Boolean),
    [formData.items, productsById]
  );

  const calculateSubtotal = () => resolvedItems.reduce((sum, item) => sum + item.total, 0);
  const calculateTax = () => computeCategoryTax(resolvedItems, products, formData.defaultTaxRate);
  const calculateTotal = () => calculateSubtotal() + calculateTax();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (resolvedItems.length === 0) {
      alert('Add at least one item: pick a product from suggestions, then set quantity and price.');
      return;
    }

    const missing = formData.items.find((line) => String(line.query || '').trim() && !line.productId);
    if (missing) {
      alert(`Select a product from the suggestions for "${missing.query}".`);
      return;
    }

    try {
      setSaving(true);
      await purchasesAPI.create({
        ...formData,
        items: resolvedItems,
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

  const showSuggestionsFor = (index) => activeSuggestRow === index;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content large purchase-form-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Add Purchase</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Vendor *</label>
              <select name="supplier" value={formData.supplier} onChange={handleInputChange} required>
                <option value="">Select Vendor</option>
                {suppliers.map((supplier) => (
                  <option key={supplier._id} value={supplier._id}>{supplier.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Vendor Location *</label>
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
                <option value="unpaid">Unpaid</option>
                <option value="paid">Paid</option>
              </select>
            </div>
          </div>

          <div className="items-section">
            <div className="items-section-header">
              <h3>Items</h3>
              <button type="button" className="btn-add-item" onClick={addLine}>
                + Add Line
              </button>
            </div>
            <p className="form-hint">Type a title or SKU — pick from the suggestions list.</p>

            <div className="purchase-items-table-wrap">
              <table className="purchase-items-table">
                <thead>
                  <tr>
                    <th>Product (Name / SKU)</th>
                    <th>Quantity</th>
                    <th>Price</th>
                    <th>Line Total</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {formData.items.map((line, index) => {
                    const lineTotal = (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0);
                    const open = showSuggestionsFor(index);
                    return (
                      <tr key={`line-${index}`}>
                        <td className="purchase-item-product-cell">
                          <input
                            type="text"
                            className="purchase-item-product-input"
                            value={line.query}
                            placeholder="Type title or SKU"
                            autoComplete="off"
                            onChange={(e) => handleProductQueryChange(index, e.target.value)}
                            onFocus={() => handleProductFocus(index)}
                            onBlur={() => handleProductBlur(index)}
                          />
                          {open ? (
                            <ul className="purchase-item-suggestions">
                              {suggestLoading ? (
                                <li className="purchase-item-suggest-status">Searching…</li>
                              ) : suggestions.length === 0 ? (
                                <li className="purchase-item-suggest-status">
                                  {String(line.query || '').trim()
                                    ? 'No products found'
                                    : 'Start typing to search'}
                                </li>
                              ) : (
                                suggestions.map((product) => {
                                  const name = getProductDisplayName(product);
                                  const sku = getCatalogSku(product) || product.sku || '';
                                  return (
                                    <li key={product._id}>
                                      <button
                                        type="button"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => applyProductToLine(index, product)}
                                      >
                                        <strong>{name || 'Untitled'}</strong>
                                        {sku ? <span className="mono">{sku}</span> : null}
                                      </button>
                                    </li>
                                  );
                                })
                              )}
                            </ul>
                          ) : null}
                        </td>
                        <td>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={line.quantity}
                            onChange={(e) =>
                              updateLine(index, { quantity: parseFloat(e.target.value) || 0 })
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.unitPrice}
                            onChange={(e) =>
                              updateLine(index, { unitPrice: parseFloat(e.target.value) || 0 })
                            }
                          />
                        </td>
                        <td>{formatMoney(lineTotal)}</td>
                        <td>
                          <button
                            type="button"
                            className="btn-remove-item"
                            onClick={() => removeLine(index)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
              <input type="text" value={formatMoney(calculateTax())} disabled />
            </div>
            <div className="form-group">
              <label>Subtotal</label>
              <input type="text" value={formatMoney(calculateSubtotal())} disabled />
            </div>
            <div className="form-group">
              <label>Total</label>
              <input type="text" value={formatMoney(calculateTotal())} disabled className="total-input" />
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
