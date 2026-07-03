import React, { useState, useEffect } from 'react';
import { reportsAPI, salesChannelsAPI, salesLocationsAPI } from '../services/api';
import { formatMoney } from '../utils/locationCurrency';
import logger from '../utils/logger';
import SalesMonthlyTrendCharts from './SalesMonthlyTrendCharts';
import './SalesReport.css';

const formatAed = (amount) => formatMoney(amount, 'AED');

function SalesReport() {
  const [view, setView] = useState('summary'); // 'summary' or 'detailed'
  const [loading, setLoading] = useState(false);
  const [summaryData, setSummaryData] = useState(null);
  const [detailedData, setDetailedData] = useState([]);
  const [monthlyTrend, setMonthlyTrend] = useState([]);
  const [salesChannels, setSalesChannels] = useState([]);
  const [salesLocations, setSalesLocations] = useState([]);
  
  const [filters, setFilters] = useState({
    startDate: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    salesChannel: '',
    salesLocation: '',
    paymentStatus: '',
    orderStatus: '',
    groupBy: 'date'
  });

  useEffect(() => {
    fetchSalesChannels();
    fetchData();
  }, []);

  useEffect(() => {
    if (filters.salesChannel) {
      fetchSalesLocations(filters.salesChannel);
    } else {
      setSalesLocations([]);
    }
  }, [filters.salesChannel]);

  useEffect(() => {
    fetchData();
  }, [view, filters]);

  const fetchSalesChannels = async () => {
    try {
      const response = await salesChannelsAPI.getAll({ isActive: 'true' });
      setSalesChannels(response.data);
    } catch (error) {
      console.error('Error fetching sales channels:', error);
      logger.error('Error fetching sales channels', error);
    }
  };

  const fetchSalesLocations = async (channelId) => {
    try {
      const response = await salesLocationsAPI.getByChannel(channelId);
      setSalesLocations(response.data);
    } catch (error) {
      console.error('Error fetching sales locations:', error);
      logger.error('Error fetching sales locations', error);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const trendParams = { ...filters, groupBy: 'month' };
      if (view === 'summary') {
        const [response, trendRes] = await Promise.all([
          reportsAPI.getSalesSummary(filters),
          reportsAPI.getSalesSummary(trendParams),
        ]);
        setSummaryData(response.data);
        setMonthlyTrend(trendRes.data?.groupedData || []);
      } else {
        const [response, trendRes] = await Promise.all([
          reportsAPI.getSalesDetailed(filters),
          reportsAPI.getSalesSummary(trendParams),
        ]);
        setDetailedData(response.data);
        setMonthlyTrend(trendRes.data?.groupedData || []);
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

  const handleExport = async (format) => {
    try {
      const response = await reportsAPI.exportSales({
        format,
        filters,
        view
      });
      alert(`Export ${format.toUpperCase()} functionality will be implemented`);
    } catch (error) {
      console.error('Error exporting report:', error);
      alert('Failed to export report');
    }
  };

  return (
    <div className="sales-report">
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
            <label>Sales Channel</label>
            <select
              name="salesChannel"
              value={filters.salesChannel}
              onChange={handleFilterChange}
            >
              <option value="">All Channels</option>
              {salesChannels.map(channel => (
                <option key={channel._id} value={channel._id}>
                  {channel.name}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Sales Location</label>
            <select
              name="salesLocation"
              value={filters.salesLocation}
              onChange={handleFilterChange}
              disabled={!filters.salesChannel}
            >
              <option value="">All Locations</option>
              {salesLocations.map(location => (
                <option key={location._id} value={location._id}>
                  {location.name}
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
          <div className="filter-group">
            <label>Order Status</label>
            <select
              name="orderStatus"
              value={filters.orderStatus}
              onChange={handleFilterChange}
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="shipped">Shipped</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
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
                <option value="channel">Channel</option>
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
          <button className="btn-export" onClick={() => handleExport('pdf')}>
            Export PDF
          </button>
          <button className="btn-export" onClick={() => handleExport('excel')}>
            Export Excel
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading report data...</div>
      ) : (
        <>
          <SalesMonthlyTrendCharts groupedData={monthlyTrend} formatCurrency={formatAed} />

          {view === 'summary' && summaryData ? (
        <div className="summary-view">
          <div className="stats-cards">
            <div className="stat-card">
              <h3>Total Sales</h3>
              <p className="stat-value">{summaryData.totalSales}</p>
            </div>
            <div className="stat-card">
              <h3>Total Revenue</h3>
              <p className="stat-value">{formatAed(summaryData.totalRevenue)}</p>
            </div>
            <div className="stat-card">
              <h3>Average Order Value</h3>
              <p className="stat-value">{formatAed(summaryData.averageOrderValue)}</p>
            </div>
            <div className="stat-card">
              <h3>Total Items Sold</h3>
              <p className="stat-value">{summaryData.totalItemsSold}</p>
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
                    <th>Revenue</th>
                    <th>Items Sold</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryData.groupedData.map((group, idx) => (
                    <tr key={idx}>
                      <td>{group.group}</td>
                      <td>{group.count}</td>
                      <td>{formatAed(group.revenue)}</td>
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
                        {item.product?.name || 'Unknown'}: {formatAed(item.revenue)} ({item.quantity} units)
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="stat-box">
                  <h4>Top Channels</h4>
                  <ul>
                    {summaryData.statistics.topChannels.slice(0, 5).map((item, idx) => (
                      <li key={idx}>
                        {item.channel?.name || 'Unknown'}: {formatAed(item.revenue)} ({item.count} orders)
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
                <div className="stat-box">
                  <h4>Order Status</h4>
                  <ul>
                    <li>Pending: {summaryData.statistics.orderStatusBreakdown.pending}</li>
                    <li>Confirmed: {summaryData.statistics.orderStatusBreakdown.confirmed}</li>
                    <li>Shipped: {summaryData.statistics.orderStatusBreakdown.shipped}</li>
                    <li>Delivered: {summaryData.statistics.orderStatusBreakdown.delivered}</li>
                    <li>Cancelled: {summaryData.statistics.orderStatusBreakdown.cancelled}</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : view === 'detailed' && detailedData.length > 0 ? (
        <div className="detailed-view">
          <h3>Detailed Sales Report</h3>
          <table className="report-table">
            <thead>
              <tr>
                <th>Sales Number</th>
                <th>Date</th>
                <th>Channel</th>
                <th>Location</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Subtotal</th>
                <th>Discount</th>
                <th>Tax</th>
                <th>Total</th>
                <th>Payment Status</th>
                <th>Order Status</th>
              </tr>
            </thead>
            <tbody>
              {detailedData.map((sale) => (
                <tr key={sale._id}>
                  <td>{sale.salesNumber}</td>
                  <td>{new Date(sale.salesDate).toLocaleDateString()}</td>
                  <td>{sale.salesChannel?.name || '-'}</td>
                  <td>{sale.salesLocation?.name || '-'}</td>
                  <td>{sale.customer?.name || '-'}</td>
                  <td>{sale.items.length} items</td>
                  <td>{formatAed(sale.subtotal)}</td>
                  <td>{formatAed(sale.discount)}</td>
                  <td>{formatAed(sale.tax)}</td>
                  <td>{formatAed(sale.total)}</td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="no-data">No data available</div>
      )}
        </>
      )}
    </div>
  );
}

export default SalesReport;

