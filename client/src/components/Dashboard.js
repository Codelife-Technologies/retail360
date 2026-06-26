import React, { useState, useEffect } from 'react';
import {
  productsAPI,
  purchaseOrdersAPI,
  purchasesAPI,
  stockAPI,
  shipmentsAPI,
  salesAPI,
  purchaseRequisitesAPI,
  grnAPI,
} from '../services/api';
import './Dashboard.css';

function extractList(response) {
  if (!response?.data) return [];
  const data = response.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.data)) return data.data;
  return [];
}

function Dashboard({ onNavigate }) {
  const [stats, setStats] = useState({
    totalProducts: 0,
    lowStockCount: 0,
    pendingPOs: 0,
    totalPurchases: 0,
    totalShipments: 0,
    pendingShipments: 0,
    totalSales: 0,
    pendingSales: 0,
    totalRequisitions: 0,
    totalGrns: 0,
    pendingGrns: 0,
    approvedGrns: 0,
  });
  const [loading, setLoading] = useState(true);
  const [lowStockItems, setLowStockItems] = useState([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      const [
        productsResult,
        poResult,
        purchasesResult,
        lowStockResult,
        shipmentsResult,
        pendingShipmentsResult,
        salesResult,
        pendingSalesResult,
        requisitionsResult,
        grnStatsResult,
      ] = await Promise.allSettled([
        productsAPI.getCount(),
        purchaseOrdersAPI.getAll({ status: 'pending' }),
        purchasesAPI.getAll(),
        stockAPI.getLowStock(),
        shipmentsAPI.getAll(),
        shipmentsAPI.getAll({ status: 'pending' }),
        salesAPI.getAll(),
        salesAPI.getAll({ orderStatus: 'pending' }),
        purchaseRequisitesAPI.getAll(),
        grnAPI.getDashboard(),
      ]);

      const productsRes = productsResult.status === 'fulfilled' ? productsResult.value : null;
      const lowStockRes = lowStockResult.status === 'fulfilled' ? lowStockResult.value : null;
      const grnStats =
        grnStatsResult.status === 'fulfilled' ? grnStatsResult.value.data || {} : {};

      let productCount = 0;
      if (productsRes?.data?.count != null) {
        productCount = productsRes.data.count;
      } else if (productsRes) {
        productCount = extractList(productsRes).length;
      }

      const lowStock = extractList(lowStockRes);
      const pendingPOs = extractList(poResult.status === 'fulfilled' ? poResult.value : null);
      const purchases = extractList(purchasesResult.status === 'fulfilled' ? purchasesResult.value : null);
      const shipments = extractList(shipmentsResult.status === 'fulfilled' ? shipmentsResult.value : null);
      const pendingShipments = extractList(
        pendingShipmentsResult.status === 'fulfilled' ? pendingShipmentsResult.value : null
      );
      const sales = extractList(salesResult.status === 'fulfilled' ? salesResult.value : null);
      const pendingSales = extractList(
        pendingSalesResult.status === 'fulfilled' ? pendingSalesResult.value : null
      );
      const requisitions = extractList(
        requisitionsResult.status === 'fulfilled' ? requisitionsResult.value : null
      );

      setStats({
        totalProducts: productCount,
        lowStockCount: lowStock.length,
        pendingPOs: pendingPOs.length,
        totalPurchases: purchases.length,
        totalShipments: shipments.length,
        pendingShipments: pendingShipments.length,
        totalSales: sales.length,
        pendingSales: pendingSales.length,
        totalRequisitions: requisitions.length,
        totalGrns: grnStats.totalGrns || 0,
        pendingGrns: grnStats.pendingReceipt || 0,
        approvedGrns: grnStats.completedReceipts || 0,
      });

      setLowStockItems(lowStock.slice(0, 5));
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setStats({
        totalProducts: 0,
        lowStockCount: 0,
        pendingPOs: 0,
        totalPurchases: 0,
        totalShipments: 0,
        pendingShipments: 0,
        totalSales: 0,
        pendingSales: 0,
        totalRequisitions: 0,
        totalGrns: 0,
        pendingGrns: 0,
        approvedGrns: 0,
      });
      setLowStockItems([]);
    } finally {
      setLoading(false);
    }
  };

  const handleNavigate = (tab) => {
    if (onNavigate) onNavigate(tab);
  };

  const handleCardKeyDown = (e, tab) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleNavigate(tab);
    }
  };

  if (loading) {
    return <div className="dashboard-loading">Loading dashboard...</div>;
  }

  const statCards = [
    { tab: 'products', className: 'stat-card', icon: '📦', value: stats.totalProducts, label: 'Total Products' },
    { tab: 'stock', className: 'stat-card warning', icon: '⚠️', value: stats.lowStockCount, label: 'Low Stock Items' },
    { tab: 'purchase-requisite', className: 'stat-card info', icon: '📝', value: stats.totalRequisitions, label: 'PR' },
    { tab: 'purchase-orders', className: 'stat-card info', icon: '📋', value: stats.pendingPOs, label: 'Pending POs' },
    { tab: 'grn', className: 'stat-card', icon: '📥', value: stats.totalGrns, label: 'GRN', style: { borderLeft: '4px solid #6B3894' } },
    { tab: 'grn', className: 'stat-card warning', icon: '⏳', value: stats.pendingGrns, label: 'GRN Pending Receipt' },
    { tab: 'grn', className: 'stat-card success', icon: '✅', value: stats.approvedGrns, label: 'GRN Completed' },
    { tab: 'purchases', className: 'stat-card success', icon: '💰', value: stats.totalPurchases, label: 'Total Purchases' },
    { tab: 'shipments', className: 'stat-card', icon: '🚚', value: stats.totalShipments, label: 'Total Shipments', style: { borderLeft: '4px solid #8b5cf6' } },
    { tab: 'shipments', className: 'stat-card warning', icon: '📤', value: stats.pendingShipments, label: 'Pending Shipments' },
    { tab: 'sales', className: 'stat-card success', icon: '🛒', value: stats.totalSales, label: 'Total Sales' },
    { tab: 'sales', className: 'stat-card info', icon: '⏳', value: stats.pendingSales, label: 'Pending Sales' },
  ];

  return (
    <div className="dashboard">
      <h1>Dashboard</h1>

      <div className="stats-grid">
        {statCards.map((card) => (
          <div
            key={card.label}
            className={`${card.className} stat-card-clickable`}
            style={card.style}
            onClick={() => handleNavigate(card.tab)}
            onKeyDown={(e) => handleCardKeyDown(e, card.tab)}
            role="button"
            tabIndex={0}
            title={`Go to ${card.label}`}
          >
            <div className="stat-icon">{card.icon}</div>
            <div className="stat-info">
              <h3>{card.value}</h3>
              <p>{card.label}</p>
            </div>
          </div>
        ))}
      </div>

      {lowStockItems.length > 0 && (
        <div className="low-stock-section">
          <h2>Low Stock Alerts</h2>
          <div className="low-stock-list">
            {lowStockItems.map((stockItem) => (
              <div key={stockItem._id} className="low-stock-item">
                <span className="product-name">
                  {stockItem.product?.title || stockItem.product?.name || 'Unknown'} —{' '}
                  {stockItem.location?.name || 'Unknown'}
                </span>
                <span className="stock-info">
                  Stock: {stockItem.quantity} / Min: {stockItem.minStockLevel}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
