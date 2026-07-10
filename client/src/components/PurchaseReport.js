import React, { useState, useEffect } from 'react';
import { reportsAPI, suppliersAPI, locationsAPI } from '../services/api';
import logger from '../utils/logger';
import './PurchaseReport.css';

function PurchaseReport() {
  const [view, setView] = useState('summary'); // 'summary' or 'detailed'
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [summaryData, setSummaryData] = useState(null);
  const [detailedData, setDetailedData] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [locations, setLocations] = useState([]);
  
  const [filters, setFilters] = useState({
    startDate: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    supplier: '',
    location: '',
    paymentStatus: '',
    groupBy: 'date'
  });

  useEffect(() => {
    fetchSuppliers();
    fetchLocations();
    fetchData();
  }, []);

  useEffect(() => {
    fetchData();
  }, [view, filters]);

  const fetchSuppliers = async () => {
    try {
      const response = await suppliersAPI.getAll();
      setSuppliers(response.data);
    } catch (error) {
      console.error('Error fetching suppliers:', error);
      logger.error('Error fetching suppliers', error);
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

  const fetchData = async () => {
    try {
      setLoading(true);
      if (view === 'summary') {
        const response = await reportsAPI.getPurchasesSummary(filters);
        setSummaryData(response.data);
      } else {
        const response = await reportsAPI.getPurchasesDetailed(filters);
        setDetailedData(response.data);
      }
    } catch (error) {
      console.error('Error fetching report data:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack
      });
      logger.error('Error fetching report data', error);
      alert('Failed to fetch report data');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleExport = async () => {
    const hasData = view === 'summary' ? Boolean(summaryData) : detailedData.length > 0;
    if (!hasData) {
      alert('No data to export for the selected filters');
      return;
    }

    try {
      setExporting(true);
      const response = await reportsAPI.exportPurchases({
        ...filters,
        view,
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute(
        'download',
        `purchase_report_${view}_${filters.endDate || new Date().toISOString().slice(0, 10)}.xlsx`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting report:', error);
      alert(error.response?.data?.error || 'Failed to export report');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="purchase-report">
      <div className="report-filters">
        <h3>Filters</h3>
        <div className="filters-grid">
          <div className="filter-group">
            <label>Start Date</label>
            <input
              type="date"
              name="startDate"
              value={filters.startDate}
              onChange={handleFilterChange}
            />
          </div>
          <div className="filter-group">
            <label>End Date</label>
            <input
              type="date"
              name="endDate"
              value={filters.endDate}
              onChange={handleFilterChange}
            />
          </div>
          <div className="filter-group">
            <label>Supplier</label>
            <select
              name="supplier"
              value={filters.supplier}
              onChange={handleFilterChange}
            >
              <option value="">All Suppliers</option>
              {suppliers.map(supplier => (
                <option key={supplier._id} value={supplier._id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Location</label>
            <select
              name="location"
              value={filters.location}
              onChange={handleFilterChange}
            >
              <option value="">All Locations</option>
              {locations.map(location => (
                <option key={location._id} value={location._id}>
                  {location.name} ({location.code})
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Payment Status</label>
            <select
              name="paymentStatus"
              value={filters.paymentStatus}
              onChange={handleFilterChange}
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="partial">Partial</option>
            </select>
          </div>
          {view === 'summary' && (
            <div className="filter-group">
              <label>Group By</label>
              <select
                name="groupBy"
                value={filters.groupBy}
                onChange={handleFilterChange}
              >
                <option value="date">Date</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
                <option value="product">Product</option>
                <option value="supplier">Supplier</option>
                <option value="location">Location</option>
              </select>
            </div>
          )}
        </div>
        <div className="filter-actions">
          <button className="btn-primary" onClick={fetchData}>
            Apply Filters
          </button>
        </div>
      </div>

      <div className="report-actions">
        <div className="view-toggle">
          <button
            className={view === 'summary' ? 'active' : ''}
            onClick={() => setView('summary')}
          >
            Summary
          </button>
          <button
            className={view === 'detailed' ? 'active' : ''}
            onClick={() => setView('detailed')}
          >
            Detailed
          </button>
        </div>
        <div className="export-buttons">
          <button
            className="btn-export"
            onClick={handleExport}
            disabled={loading || exporting}
          >
            {exporting ? 'Exporting…' : 'Export Excel'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading report data...</div>
      ) : view === 'summary' && summaryData ? (
        <div className="summary-view">
          <div className="stats-cards">
            <div className="stat-card">
              <h3>Total Purchases</h3>
              <p className="stat-value">{summaryData.totalPurchases}</p>
            </div>
            <div className="stat-card">
              <h3>Total Expenditure</h3>
              <p className="stat-value">₹{summaryData.totalExpenditure.toFixed(2)}</p>
            </div>
            <div className="stat-card">
              <h3>Average Purchase Value</h3>
              <p className="stat-value">₹{summaryData.averagePurchaseValue.toFixed(2)}</p>
            </div>
            <div className="stat-card">
              <h3>Total Items Purchased</h3>
              <p className="stat-value">{summaryData.totalItemsPurchased}</p>
            </div>
          </div>

          {summaryData.groupedData && summaryData.groupedData.length > 0 && (
            <div className="grouped-data-section">
              <h3>Grouped Data</h3>
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Group</th>
                    <th>Count</th>
                    <th>Expenditure</th>
                    <th>Items Purchased</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryData.groupedData.map((group, idx) => (
                    <tr key={idx}>
                      <td>{group.group}</td>
                      <td>{group.count}</td>
                      <td>₹{group.revenue.toFixed(2)}</td>
                      <td>{group.itemsSold}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {summaryData.statistics && (
            <div className="statistics-section">
              <div className="stats-grid">
                <div className="stat-box">
                  <h4>Top Products</h4>
                  <ul>
                    {summaryData.statistics.topProducts.slice(0, 5).map((item, idx) => (
                      <li key={idx}>
                        {item.product?.name || 'Unknown'}: ₹{item.expenditure.toFixed(2)} ({item.quantity} units)
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="stat-box">
                  <h4>Top Suppliers</h4>
                  <ul>
                    {summaryData.statistics.topSuppliers.slice(0, 5).map((item, idx) => (
                      <li key={idx}>
                        {item.supplier?.name || 'Unknown'}: ₹{item.expenditure.toFixed(2)} ({item.count} orders)
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="stat-box">
                  <h4>Payment Status</h4>
                  <ul>
                    <li>Pending: {summaryData.statistics.paymentStatusBreakdown.pending}</li>
                    <li>Paid: {summaryData.statistics.paymentStatusBreakdown.paid}</li>
                    <li>Partial: {summaryData.statistics.paymentStatusBreakdown.partial}</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : view === 'detailed' && detailedData.length > 0 ? (
        <div className="detailed-view">
          <h3>Detailed Purchase Report</h3>
          <table className="report-table">
            <thead>
              <tr>
                <th>Purchase Number</th>
                <th>Date</th>
                <th>Supplier</th>
                <th>Location</th>
                <th>Items</th>
                <th>Subtotal</th>
                <th>Tax</th>
                <th>Total</th>
                <th>Payment Status</th>
              </tr>
            </thead>
            <tbody>
              {detailedData.map((purchase) => (
                <tr key={purchase._id}>
                  <td>{purchase.purchaseNumber}</td>
                  <td>{new Date(purchase.purchaseDate).toLocaleDateString()}</td>
                  <td>{purchase.supplier?.name || '-'}</td>
                  <td>{purchase.location?.name || '-'}</td>
                  <td>{purchase.items.length} items</td>
                  <td>₹{purchase.subtotal.toFixed(2)}</td>
                  <td>₹{purchase.tax.toFixed(2)}</td>
                  <td>₹{purchase.total.toFixed(2)}</td>
                  <td>
                    <span className={`status-badge status-${purchase.paymentStatus}`}>
                      {purchase.paymentStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="no-data">No data available</div>
      )}
    </div>
  );
}

export default PurchaseReport;

