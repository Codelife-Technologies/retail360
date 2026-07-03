import React, { useState, useEffect } from 'react';
import { reportsAPI, categoriesAPI, subcategoriesAPI, locationsAPI, purchaseRequisitesAPI, productsAPI, pricesAPI } from '../services/api';
import { getCurrentUser } from '../utils/currentUser';
import logger from '../utils/logger';
import ProductDetailsModal from './ProductDetailsModal';
import './ReplenishReport.css';
import './Products.css';

function ReplenishReport({ onNavigate }) {
  const [activeTab, setActiveTab] = useState('locations');
  const [loading, setLoading] = useState(false);
  const [creatingPR, setCreatingPR] = useState(false);
  const [showPrModal, setShowPrModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [prModalSearch, setPrModalSearch] = useState('');
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [unapprovedPRs, setUnapprovedPRs] = useState([]);
  const [prTarget, setPrTarget] = useState('new');
  const [appendToPrId, setAppendToPrId] = useState('');
  const [prName, setPrName] = useState('');
  const [loggedInUser, setLoggedInUser] = useState(() => getCurrentUser());
  const [reportData, setReportData] = useState(null);
  const [locations, setLocations] = useState([]);
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);

  const [filters, setFilters] = useState({
    category: '',
    subCategory: '',
    location: '',
    status: 'ALL',
    specificDate: '',
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState('location.name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [viewingProduct, setViewingProduct] = useState(null);
  const [viewingProductPrice, setViewingProductPrice] = useState(null);
  const [viewingReplenishItem, setViewingReplenishItem] = useState(null);
  const [productDetailLoading, setProductDetailLoading] = useState(false);

  useEffect(() => {
    fetchCategories();
    fetchLocations();
    fetchReport();
    fetchUnapprovedPRs();
  }, []);

  useEffect(() => {
    fetchSubcategories();
  }, [filters.category]);

  useEffect(() => {
    fetchReport();
  }, [filters.category, filters.subCategory, filters.location, filters.specificDate]);

  const formatPrOptionLabel = (pr) => {
    const title = pr.name ? `${pr.name} (${pr.prNumber})` : pr.prNumber;
    const statusLabel = pr.status === 'draft' ? 'Draft' : 'Pending';
    return `${title} — ${statusLabel} — ${pr.items?.length || 0} items`;
  };

  const fetchUnapprovedPRs = async () => {
    try {
      const response = await purchaseRequisitesAPI.getAll({ unapproved: 'true' });
      setUnapprovedPRs(response.data || []);
    } catch (error) {
      console.error('Error fetching unapproved PRs:', error);
    }
  };

  const fetchLocations = async () => {
    try {
      const response = await locationsAPI.getAll();
      setLocations(response.data || []);
    } catch (error) {
      console.error('Error fetching locations:', error);
      logger.error('Error fetching locations in replenishment report', error);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await categoriesAPI.getAll();
      setCategories(response.data || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
      logger.error('Error fetching categories in replenishment report', error);
    }
  };

  const fetchSubcategories = async () => {
    try {
      if (!filters.category) {
        setSubcategories([]);
        setFilters((prev) => ({ ...prev, subCategory: '' }));
        return;
      }
      const response = await subcategoriesAPI.getAll({ category: filters.category });
      setSubcategories(response.data || []);
    } catch (error) {
      console.error('Error fetching subcategories:', error);
      logger.error('Error fetching subcategories in replenishment report', error);
    }
  };

  const fetchReport = async () => {
    try {
      setLoading(true);
      const params = {
        category: filters.category,
        subCategory: filters.subCategory,
        location: filters.location,
      };
      if (filters.specificDate) {
        params.specificDate = filters.specificDate;
      }
      const response = await reportsAPI.getReplenishReport(params);
      setReportData(response.data);
    } catch (error) {
      console.error('Error fetching replenishment report:', error);
      logger.error('Error fetching replenishment report', error);
      alert('Failed to load replenishment report');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getNestedValue = (obj, path) => {
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
  };

  const monthLabels = reportData?.monthLabels || {};
  const pastThreeMonthsLabel = monthLabels.pastThreeMonths || 'Past 3 Months';
  const specificDateInfo = reportData?.specificDate;
  const dateWindow = reportData?.dateWindow;
  const showDateColumn = Boolean(specificDateInfo?.value);
  const tableColSpan = showDateColumn ? 12 : 11;

  const getRowKey = (item) => `${item.location?._id}-${item.product?._id}`;

  const isSelectableItem = (item) =>
    (item.replenishStatus === 'REORDER' || item.replenishStatus === 'LOW') &&
    (item.reorderQty ?? item.suggestedReorder ?? 0) > 0;

  const getPrCandidateItems = () => {
    if (!reportData?.products) return [];

    let result = reportData.products.filter(isSelectableItem);

    if (filters.status === 'REORDER' || filters.status === 'LOW') {
      result = result.filter((item) => item.replenishStatus === filters.status);
    } else if (filters.status === 'OK') {
      return [];
    }

    if (prModalSearch.trim()) {
      const term = prModalSearch.toLowerCase();
      result = result.filter(
        (item) =>
          (item.product.title && item.product.title.toLowerCase().includes(term)) ||
          (item.product.sku && item.product.sku.toLowerCase().includes(term)) ||
          (item.location?.name && item.location.name.toLowerCase().includes(term))
      );
    }

    return result.sort((a, b) => {
      const locA = a.location?.name || '';
      const locB = b.location?.name || '';
      return locA.localeCompare(locB) || (a.product.sku || '').localeCompare(b.product.sku || '');
    });
  };

  const openPrModal = () => {
    setLoggedInUser(getCurrentUser());
    fetchUnapprovedPRs();
    setShowPrModal(true);
  };

  const closePrModal = () => {
    setShowPrModal(false);
    setSelectedKeys(new Set());
    setPrTarget('new');
    setAppendToPrId('');
    setPrName('');
    setPrModalSearch('');
  };

  const toggleRowSelection = (item) => {
    const key = getRowKey(item);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const clearSelection = () => setSelectedKeys(new Set());

  const getProcessedProducts = () => {
    if (!reportData?.products) return [];

    let result = [...reportData.products];

    if (filters.status !== 'ALL') {
      result = result.filter((item) => item.replenishStatus === filters.status);
    }

    if (searchTerm.trim() !== '') {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (item) =>
          (item.product.title && item.product.title.toLowerCase().includes(term)) ||
          (item.product.sku && item.product.sku.toLowerCase().includes(term)) ||
          (item.location?.name && item.location.name.toLowerCase().includes(term))
      );
    }

    result.sort((a, b) => {
      let valA = getNestedValue(a, sortField);
      let valB = getNestedValue(b, sortField);
      if (valA === undefined || valA === null) valA = '';
      if (valB === undefined || valB === null) valB = '';
      if (typeof valA === 'string') {
        return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortDirection === 'asc' ? valA - valB : valB - valA;
    });

    return result;
  };

  const processedProducts = getProcessedProducts();

  const getAllVisibleItems = () => {
    if (activeTab === 'products') return processedProducts;
    if (activeTab === 'locations') {
      return (reportData?.groupedByLocation || []).flatMap((group) =>
        group.products.filter((item) => {
          if (filters.status !== 'ALL' && item.replenishStatus !== filters.status) {
            return false;
          }
          if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            return (
              (item.product.title && item.product.title.toLowerCase().includes(term)) ||
              (item.product.sku && item.product.sku.toLowerCase().includes(term))
            );
          }
          return true;
        })
      );
    }
    return [];
  };

  const selectAllPrItems = () => {
    const keys = getPrCandidateItems().map(getRowKey);
    setSelectedKeys(new Set(keys));
  };

  const handleCreatePurchaseRequisite = async () => {
    const selectedItems = getPrCandidateItems().filter((item) =>
      selectedKeys.has(getRowKey(item))
    );
    if (selectedItems.length === 0) {
      alert('Select at least one Reorder or Low Stock row to create a Purchase Requisition.');
      return;
    }

    const creatorName = getCurrentUser().trim();
    if (prTarget === 'new' && !creatorName) {
      alert(
        'Your name is not set. Open Purchase Requisition and enter your name under "PR generated by (you)".'
      );
      return;
    }
    if (prTarget === 'existing' && !appendToPrId) {
      alert('Select an unapproved Purchase Requisition to add items to.');
      return;
    }

    try {
      setCreatingPR(true);
      const payload = {
        items: selectedItems,
        notes:
          prTarget === 'existing'
            ? `Added ${selectedItems.length} item(s) from Replenish Report`
            : prName.trim()
              ? `${prName.trim()} — ${selectedItems.length} item(s) from Replenish Report`
              : `Replenish request — ${selectedItems.length} item(s) from Replenish Report`,
      };
      if (prTarget === 'existing') {
        payload.appendToPrId = appendToPrId;
      } else {
        payload.requestedBy = creatorName;
        if (prName.trim()) {
          payload.name = prName.trim();
        }
      }

      const response = await purchaseRequisitesAPI.createFromReplenish(payload);
      fetchUnapprovedPRs();
      closePrModal();
      const prLabel = response.data?.name
        ? `${response.data.name} (${response.data.prNumber})`
        : response.data?.prNumber || 'Purchase Requisition';
      const action = prTarget === 'existing' ? 'Updated' : 'Created';
      if (window.confirm(`${action} ${prLabel}. Open Purchase Requisition page now?`)) {
        onNavigate?.('purchase-requisite');
      }
    } catch (error) {
      console.error('Error creating purchase requisition:', error);
      alert(error.response?.data?.error || 'Failed to create purchase requisition');
    } finally {
      setCreatingPR(false);
    }
  };

  const closeProductDetail = () => {
    setViewingProduct(null);
    setViewingProductPrice(null);
    setViewingReplenishItem(null);
  };

  const handleOpenProductDetail = async (item) => {
    const productId = item.product?._id;
    if (!productId) return;

    setViewingReplenishItem(item);
    setProductDetailLoading(true);
    setViewingProduct(null);
    setViewingProductPrice(null);

    try {
      const [productRes, pricesRes] = await Promise.all([
        productsAPI.getById(productId),
        pricesAPI.getBulkCurrent([productId], 'AED'),
      ]);
      setViewingProduct(productRes.data);
      const priceRow = (pricesRes.data || []).find(
        (row) => (row.product?._id || row.product) === productId
      );
      setViewingProductPrice(priceRow || null);
    } catch (error) {
      console.error('Error loading product details:', error);
      alert('Failed to load product details');
      closeProductDetail();
    } finally {
      setProductDetailLoading(false);
    }
  };

  const renderProductRows = (items) =>
    items.map((item) => {
      const rowKey = getRowKey(item);
      return (
      <tr key={rowKey}>
        <td className="font-semibold">{item.location?.name || '-'}</td>
        <td
          className="font-monospace font-semibold replenish-product-link"
          onClick={() => handleOpenProductDetail(item)}
          title="View product details"
        >
          {item.product.sku}
        </td>
        <td
          className="product-title-cell replenish-product-link"
          title={item.product.title}
          onClick={() => handleOpenProductDetail(item)}
        >
          {item.product.title}
        </td>
        <td>{item.product.category?.name || 'Uncategorized'}</td>
        <td className="text-center font-semibold">{item.inventory.currentStock}</td>
        <td className="text-center text-blue font-semibold">{item.salesCurrent ?? 0}</td>
        <td className="text-center text-blue font-semibold">
          {item.salesPastThreeMonths ?? 0}
        </td>
        {showDateColumn && (
          <td
            className={`text-center font-semibold ${
              (item.salesOnDate ?? 0) > 0 ? 'text-green' : 'text-muted'
            }`}
          >
            {item.salesOnDate ?? 0}
          </td>
        )}
        <td className="text-center">
          <span className={`replenish-badge status-${item.replenishStatus.toLowerCase()}`}>
            {item.replenishStatus}
          </span>
        </td>
        <td
          className="text-center font-bold refill-qty-cell"
          title={
            item.refillQty > 0
              ? `Transfer ${item.refillQty} unit(s) from Home`
              : 'No home stock available to refill'
          }
        >
          {item.refillQty > 0 ? item.refillQty : '-'}
        </td>
        <td
          className="text-center font-bold text-violet"
          title="Quantity still to purchase after home refill"
        >
          {(item.reorderQty ?? 0) > 0 ? item.reorderQty : '-'}
        </td>
      </tr>
      );
    });

  const productTableHeader = (
    <thead>
      <tr>
        <th onClick={() => handleSort('location.name')} className="sortable">
          Location {sortField === 'location.name' && (sortDirection === 'asc' ? '🔼' : '🔽')}
        </th>
        <th onClick={() => handleSort('product.sku')} className="sortable">
          SKU {sortField === 'product.sku' && (sortDirection === 'asc' ? '🔼' : '🔽')}
        </th>
        <th onClick={() => handleSort('product.title')} className="sortable">
          Product {sortField === 'product.title' && (sortDirection === 'asc' ? '🔼' : '🔽')}
        </th>
        <th onClick={() => handleSort('product.category.name')} className="sortable">
          Category {sortField === 'product.category.name' && (sortDirection === 'asc' ? '🔼' : '🔽')}
        </th>
        <th onClick={() => handleSort('inventory.currentStock')} className="sortable text-center">
          Stock {sortField === 'inventory.currentStock' && (sortDirection === 'asc' ? '🔼' : '🔽')}
        </th>
        <th
          onClick={() => handleSort('salesCurrent')}
          className="sortable text-center month-col"
        >
          Sold ({monthLabels.current || 'Previous'})
          {sortField === 'salesCurrent' && (sortDirection === 'asc' ? ' 🔼' : ' 🔽')}
        </th>
        <th
          onClick={() => handleSort('salesPastThreeMonths')}
          className="sortable text-center month-col"
        >
          Sold ({pastThreeMonthsLabel})
          {sortField === 'salesPastThreeMonths' && (sortDirection === 'asc' ? ' 🔼' : ' 🔽')}
        </th>
        {showDateColumn && (
          <th
            onClick={() => handleSort('salesOnDate')}
            className="sortable text-center month-col date-col"
          >
            Sold ({specificDateInfo.label})
            {sortField === 'salesOnDate' && (sortDirection === 'asc' ? ' 🔼' : ' 🔽')}
          </th>
        )}
        <th className="text-center">Status</th>
        <th
          onClick={() => handleSort('refillQty')}
          className="sortable text-center"
          title="Units that can be restocked from Home"
        >
          Refill
          {sortField === 'refillQty' && (sortDirection === 'asc' ? ' 🔼' : ' 🔽')}
        </th>
        <th
          onClick={() => handleSort('reorderQty')}
          className="sortable text-center"
          title="Units still needed to purchase after home refill"
        >
          Reorder
          {sortField === 'reorderQty' && (sortDirection === 'asc' ? ' 🔼' : ' 🔽')}
        </th>
      </tr>
    </thead>
  );

  const prCandidateItems = getPrCandidateItems();
  const prCandidatesSelectable = prCandidateItems.length;
  const allPrCandidatesSelected =
    prCandidatesSelectable > 0 &&
    prCandidateItems.every((item) => selectedKeys.has(getRowKey(item)));

  const activeFilterCount = [
    filters.location,
    filters.category,
    filters.subCategory,
    filters.status !== 'ALL' ? filters.status : '',
    filters.specificDate,
  ].filter(Boolean).length;

  return (
    <div className="replenish-report-container">
      <div className="replenish-header">
        <div className="title-area">
          <h1>Inventory Replenish Report</h1>
          <p>
            Location-wise stock with sales for the previous month and the past 3 months
            combined. Pick a specific date to see daily sold units.
          </p>
        </div>
        <div className="replenish-header-actions">
          <button
            type="button"
            className={`btn-filters${showFilters ? ' active' : ''}`}
            onClick={() => setShowFilters((prev) => !prev)}
          >
            🔍 Filters
            {activeFilterCount > 0 && (
              <span className="filter-count-badge">{activeFilterCount}</span>
            )}
          </button>
          <button
            type="button"
            className="btn-generate-pr"
            onClick={openPrModal}
            disabled={loading || !reportData}
          >
            📋 Generate Purchase Requisition
          </button>
          <button className="btn-refresh" onClick={fetchReport} disabled={loading}>
            {loading ? 'Refreshing...' : '🔄 Refresh Data'}
          </button>
        </div>
      </div>

      {showFilters && (
      <div className="report-filters">
        <h3>Filters</h3>
        <div className="filters-grid">
          <div className="filter-group">
            <label>Location</label>
            <select name="location" value={filters.location} onChange={handleFilterChange}>
              <option value="">All Locations</option>
              {locations.map((loc) => (
                <option key={loc._id} value={loc._id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Category</label>
            <select name="category" value={filters.category} onChange={handleFilterChange}>
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option key={cat._id} value={cat._id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Subcategory</label>
            <select
              name="subCategory"
              value={filters.subCategory}
              onChange={handleFilterChange}
              disabled={!filters.category}
            >
              <option value="">All Subcategories</option>
              {subcategories.map((sub) => (
                <option key={sub._id} value={sub._id}>
                  {sub.name}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Replenish Status</label>
            <select name="status" value={filters.status} onChange={handleFilterChange}>
              <option value="ALL">All Statuses</option>
              <option value="REORDER">Reorder Needed</option>
              <option value="LOW">Low Stock Warning</option>
              <option value="OK">In Stock</option>
            </select>
          </div>
          <div className="filter-group">
            <label>Specific Date</label>
            <div className="date-filter-row">
              <input
                type="date"
                name="specificDate"
                value={filters.specificDate}
                onChange={handleFilterChange}
                min={dateWindow?.min}
                max={dateWindow?.max}
              />
              {filters.specificDate && (
                <button
                  type="button"
                  className="btn-clear-date"
                  onClick={() => setFilters((prev) => ({ ...prev, specificDate: '' }))}
                  title="Clear date"
                >
                  Clear
                </button>
              )}
            </div>
            <small className="filter-hint">View units sold on a single day</small>
          </div>
        </div>
      </div>
      )}

      {reportData?.summary && (
        <div className="stats-cards">
          <div className="stat-card">
            <h3>Product-Location Rows</h3>
            <p className="stat-value">{reportData.summary.totalProducts}</p>
            <small>With stock or sales in window</small>
          </div>
          <div className="stat-card alert-card-reorder">
            <h3>Reorders Needed</h3>
            <p className="stat-value text-red">{reportData.summary.reorderCount}</p>
          </div>
          <div className="stat-card alert-card-low">
            <h3>Low Stock</h3>
            <p className="stat-value text-yellow">{reportData.summary.lowCount}</p>
          </div>
          <div className="stat-card">
            <h3>Sold ({monthLabels.current})</h3>
            <p className="stat-value text-blue">{reportData.summary.unitsSoldCurrentMonth}</p>
            <small>Previous month</small>
          </div>
          <div className="stat-card">
            <h3>Sold ({pastThreeMonthsLabel})</h3>
            <p className="stat-value text-blue">{reportData.summary.unitsSoldPastThreeMonths}</p>
            <small>Last 3 months (excl. current)</small>
          </div>
          {showDateColumn && (
            <div className="stat-card date-stat-card">
              <h3>Sold ({specificDateInfo.label})</h3>
              <p className="stat-value text-green">{reportData.summary.unitsSoldOnDate ?? 0}</p>
              <small>Selected date</small>
            </div>
          )}
        </div>
      )}

      <div className="report-actions-row">
        <div className="view-toggle">
          <button
            className={activeTab === 'locations' ? 'active' : ''}
            onClick={() => setActiveTab('locations')}
          >
            Location-wise
          </button>
          <button
            className={activeTab === 'products' ? 'active' : ''}
            onClick={() => setActiveTab('products')}
          >
            All Products
          </button>
          <button
            className={activeTab === 'categories' ? 'active' : ''}
            onClick={() => setActiveTab('categories')}
          >
            Category Summary
          </button>
        </div>

        {(activeTab === 'products' || activeTab === 'locations') && (
          <div className="search-bar">
            <input
              type="text"
              placeholder="Search SKU, product, location..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        )}
      </div>

      {loading ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Compiling report data...</p>
        </div>
      ) : reportData ? (
        <div className="report-content-body">
          {activeTab === 'locations' && (
            <div className="location-sections">
              {(reportData.groupedByLocation || []).length > 0 ? (
                reportData.groupedByLocation.map((group) => {
                  const filtered = group.products.filter((item) => {
                    if (filters.status !== 'ALL' && item.replenishStatus !== filters.status) {
                      return false;
                    }
                    if (searchTerm.trim()) {
                      const term = searchTerm.toLowerCase();
                      return (
                        (item.product.title && item.product.title.toLowerCase().includes(term)) ||
                        (item.product.sku && item.product.sku.toLowerCase().includes(term))
                      );
                    }
                    return true;
                  });
                  if (filtered.length === 0) return null;
                  return (
                    <div key={group.location._id} className="location-block">
                      <div className="location-block-header">
                        <h3>
                          {group.location.name}
                          <span className="location-code">{group.location.code}</span>
                        </h3>
                        <div className="location-block-stats">
                          <span>{group.summary.totalProducts} products</span>
                          <span className="text-red">{group.summary.reorderCount} reorder</span>
                          <span>
                            {monthLabels.current}: {group.summary.unitsSoldCurrentMonth} sold
                          </span>
                          <span>
                            {pastThreeMonthsLabel}: {group.summary.unitsSoldPastThreeMonths} sold
                          </span>
                          {showDateColumn && (
                            <span className="text-green">
                              {specificDateInfo.label}: {group.summary.unitsSoldOnDate ?? 0} sold
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="table-responsive">
                        <table className="report-table">
                          {productTableHeader}
                          <tbody>{renderProductRows(filtered)}</tbody>
                        </table>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-center text-muted py-4">No location data found.</p>
              )}
            </div>
          )}

          {activeTab === 'products' && (
            <div className="table-responsive">
              <table className="report-table">
                {productTableHeader}
                <tbody>
                  {processedProducts.length > 0 ? (
                    renderProductRows(processedProducts)
                  ) : (
                    <tr>
                      <td colSpan={tableColSpan} className="text-center text-muted py-4">
                        No matching products found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'categories' && (
            <div className="table-responsive">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th className="text-center">Products</th>
                    <th className="text-center">Need Reorder</th>
                    <th className="text-center">Stock</th>
                    <th className="text-center">Sold ({monthLabels.current})</th>
                    <th className="text-center">Sold ({pastThreeMonthsLabel})</th>
                    {showDateColumn && (
                      <th className="text-center">Sold ({specificDateInfo.label})</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {reportData.groupedByCategory?.length > 0 ? (
                    reportData.groupedByCategory.map((cat) => (
                      <tr key={cat.categoryId}>
                        <td className="font-semibold">{cat.categoryName}</td>
                        <td className="text-center">{cat.totalProducts}</td>
                        <td className="text-center text-red font-semibold">{cat.needsReorder}</td>
                        <td className="text-center">{cat.currentStock}</td>
                        <td className="text-center text-blue font-semibold">
                          {cat.unitsSoldCurrentMonth}
                        </td>
                        <td className="text-center text-blue font-semibold">
                          {cat.unitsSoldPastThreeMonths}
                        </td>
                        {showDateColumn && (
                          <td className="text-center text-green font-semibold">
                            {cat.unitsSoldOnDate ?? 0}
                          </td>
                        )}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={showDateColumn ? 7 : 6} className="text-center text-muted py-4">
                        No category data.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="empty-state">
          <p>No replenishment data. Adjust filters or add stock/sales records.</p>
        </div>
      )}

      {showPrModal && (
        <div className="modal-overlay replenish-pr-modal-overlay" onClick={closePrModal}>
          <div className="replenish-pr-modal" onClick={(e) => e.stopPropagation()}>
            <div className="replenish-pr-modal-header">
              <div>
                <h2>Generate Purchase Requisition</h2>
                <p>Select Reorder or Low Stock items from the current report filters.</p>
              </div>
              <button type="button" className="replenish-pr-modal-close" onClick={closePrModal}>
                ×
              </button>
            </div>

            <div className="replenish-pr-options">
              <div className="replenish-pr-target-toggle">
                <label className={prTarget === 'new' ? 'active' : ''}>
                  <input
                    type="radio"
                    name="prTarget"
                    value="new"
                    checked={prTarget === 'new'}
                    onChange={() => {
                      setPrTarget('new');
                      setAppendToPrId('');
                    }}
                  />
                  Create new PR
                </label>
                <label className={prTarget === 'existing' ? 'active' : ''}>
                  <input
                    type="radio"
                    name="prTarget"
                    value="existing"
                    checked={prTarget === 'existing'}
                    onChange={() => setPrTarget('existing')}
                  />
                  Add to existing unapproved PR
                </label>
              </div>

              {prTarget === 'new' ? (
                <div className="replenish-pr-new-fields">
                  <label className="pr-user-field">
                    PR name
                    <input
                      type="text"
                      value={prName}
                      onChange={(e) => setPrName(e.target.value)}
                      placeholder="e.g. March warehouse restock"
                    />
                  </label>
                  <div className="pr-user-field replenish-pr-logged-in-user">
                    <span>Generated by</span>
                    <strong>{loggedInUser || 'Not set'}</strong>
                    {!loggedInUser && (
                      <small className="pr-option-hint">
                        Set your name on the Purchase Requisition page under &quot;PR generated by
                        (you)&quot;.
                      </small>
                    )}
                  </div>
                </div>
              ) : (
                <label className="pr-user-field pr-existing-select">
                  Unapproved PR *
                  <select
                    value={appendToPrId}
                    onChange={(e) => setAppendToPrId(e.target.value)}
                  >
                    <option value="">Select draft or pending PR…</option>
                    {unapprovedPRs.map((pr) => (
                      <option key={pr._id} value={pr._id}>
                        {formatPrOptionLabel(pr)}
                      </option>
                    ))}
                  </select>
                  {unapprovedPRs.length === 0 && (
                    <small className="pr-option-hint">
                      No unapproved PRs yet. Create a new one or add items from the Purchase
                      Requisition page.
                    </small>
                  )}
                </label>
              )}
            </div>

            <div className="replenish-pr-modal-controls">
              <input
                type="text"
                className="replenish-pr-modal-search"
                placeholder="Search SKU, product, location…"
                value={prModalSearch}
                onChange={(e) => setPrModalSearch(e.target.value)}
              />
              <span className="selection-count">{selectedKeys.size} selected</span>
              <button
                type="button"
                className="btn-secondary-sm"
                onClick={selectAllPrItems}
                disabled={prCandidatesSelectable === 0}
              >
                Select all
              </button>
              <button
                type="button"
                className="btn-secondary-sm"
                onClick={clearSelection}
                disabled={selectedKeys.size === 0}
              >
                Clear
              </button>
            </div>

            <div className="replenish-pr-modal-table-wrap">
              <table className="report-table replenish-pr-modal-table">
                <thead>
                  <tr>
                    <th className="text-center select-col">
                      <input
                        type="checkbox"
                        title="Select all visible rows"
                        checked={allPrCandidatesSelected}
                        onChange={(e) => {
                          if (e.target.checked) selectAllPrItems();
                          else clearSelection();
                        }}
                        disabled={prCandidatesSelectable === 0}
                      />
                    </th>
                    <th>Location</th>
                    <th>SKU</th>
                    <th>Product</th>
                    <th className="text-center">Stock</th>
                    <th className="text-center">Status</th>
                    <th className="text-center">Reorder Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {prCandidateItems.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="text-center text-muted py-4">
                        No Reorder or Low Stock items match the current filters.
                      </td>
                    </tr>
                  ) : (
                    prCandidateItems.map((item) => {
                      const rowKey = getRowKey(item);
                      return (
                        <tr key={rowKey}>
                          <td className="text-center pr-select-cell">
                            <input
                              type="checkbox"
                              checked={selectedKeys.has(rowKey)}
                              onChange={() => toggleRowSelection(item)}
                              aria-label={`Select ${item.product.sku}`}
                            />
                          </td>
                          <td>{item.location?.name || '—'}</td>
                          <td className="font-monospace font-semibold">{item.product.sku}</td>
                          <td className="product-title-cell" title={item.product.title}>
                            {item.product.title}
                          </td>
                          <td className="text-center font-semibold">
                            {item.inventory.currentStock}
                          </td>
                          <td className="text-center">
                            <span
                              className={`replenish-badge status-${item.replenishStatus.toLowerCase()}`}
                            >
                              {item.replenishStatus}
                            </span>
                          </td>
                          <td className="text-center font-bold text-violet">
                            {(item.reorderQty ?? 0) > 0 ? item.reorderQty : '—'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="replenish-pr-modal-footer">
              <button type="button" className="btn-secondary-sm" onClick={closePrModal}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-create-pr"
                onClick={handleCreatePurchaseRequisite}
                disabled={
                  creatingPR ||
                  selectedKeys.size === 0 ||
                  (prTarget === 'new' && !loggedInUser.trim()) ||
                  (prTarget === 'existing' && !appendToPrId)
                }
              >
                {creatingPR
                  ? 'Saving…'
                  : prTarget === 'existing'
                    ? 'Add to Purchase Requisition'
                    : 'Create Purchase Requisition'}
              </button>
            </div>
          </div>
        </div>
      )}

      {productDetailLoading && (
        <div className="modal-overlay replenish-product-loading">
          <div className="replenish-product-loading-box">
            <div className="spinner"></div>
            <p>Loading product details…</p>
          </div>
        </div>
      )}

      {viewingProduct && viewingReplenishItem && (
        <ProductDetailsModal
          product={viewingProduct}
          price={viewingProductPrice}
          priceCurrency="AED"
          onClose={closeProductDetail}
          replenishContext={{
            locationName: viewingReplenishItem.location?.name,
            locationCode: viewingReplenishItem.location?.code,
            currentStock: viewingReplenishItem.inventory?.currentStock,
            minStock: viewingReplenishItem.inventory?.minStock,
            availableStock: viewingReplenishItem.inventory?.availableStock,
            homeLocationCode: viewingReplenishItem.homeInventory?.locationCode || reportData?.homeBranch?.code,
            salesCurrent: viewingReplenishItem.salesCurrent ?? 0,
            salesPastThreeMonths: viewingReplenishItem.salesPastThreeMonths ?? 0,
            salesOnDate: viewingReplenishItem.salesOnDate,
            replenishStatus: viewingReplenishItem.replenishStatus,
            refillQty: viewingReplenishItem.refillQty ?? 0,
            suggestedReorder:
              (viewingReplenishItem.reorderQty ?? 0) > 0
                ? viewingReplenishItem.reorderQty
                : '—',
            lastMonthLabel: monthLabels.current,
            pastThreeMonthsLabel,
            specificDateLabel: specificDateInfo?.label,
            showDateColumn,
          }}
        />
      )}
    </div>
  );
}

export default ReplenishReport;
