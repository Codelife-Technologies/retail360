import React, { useState, useEffect, useMemo } from 'react';
import { purchaseOrdersAPI, suppliersAPI, productsAPI, pricesAPI, purchaseRequisitesAPI, companyProfileAPI } from '../services/api';
import DetailModal from './DetailModal';
import ExcelUpload from './ExcelUpload';
import PurchaseOrderExtendedFields from './PurchaseOrderExtendedFields';
import { getCategoryName, getTaxRateForCategory } from '../utils/taxRates';
import {
  computePurchaseOrderTotals,
  enrichLineItem,
  formatINR,
  resolveProduct,
  getProductHsn,
  getProductUom,
} from '../utils/purchaseOrderCalculations';
import {
  generatePurchaseOrderPrintHtml,
  openPurchaseOrderPrintWindow,
} from '../utils/generatePurchaseOrderPrintHtml';
import {
  createEmptyPurchaseOrderForm,
  purchaseOrderToFormData,
  supplierToPartyDetails,
  supplierToPaymentTerms,
  sanitizePurchaseOrderPayload,
} from '../utils/purchaseOrderFormState';
import { validateGSTIN, validatePAN, validateQuantity, validatePrice } from '../utils/indianGstValidation';
import {
  groupPoItemsBySupplier,
  sortItemsBySupplier,
  getDesignatedSupplierId,
  getVendorOptionsForProduct,
} from '../utils/purchaseOrderVendorSplit';
import { UOM_OPTIONS } from '../types/purchaseOrderTypes';
import { isPoEligibleForGrn } from '../goods-receipt-note/types/grn.types';
import PoProductVendorAssign from './PoProductVendorAssign';
import PoShareActions from './PoShareActions';
import ProductSearchPicker from './ProductSearchPicker';
import './PurchaseOrders.css';
import './PoShareActions.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const UPLOADS_BASE = API_BASE_URL.replace('/api', '');

const PRODUCT_IMAGE_PLACEHOLDER =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 50 50">
      <rect width="50" height="50" fill="#e5e7eb" rx="8"/>
      <path d="M16 32l6-8 5 6 4-5 9 11H16z" fill="#9ca3af"/>
      <circle cx="20" cy="19" r="3" fill="#9ca3af"/>
    </svg>`
  );

function resolveProductImageUrl(image) {
  if (!image) return null;
  if (image.startsWith('http://') || image.startsWith('https://')) {
    return image;
  }
  if (image.startsWith('products/')) {
    return `${UPLOADS_BASE}/uploads/${image}`;
  }
  return image;
}

function getProductThumbnail(product) {
  if (!product) return null;
  const images = product.images || [];
  const first = images.find((img) => img && img.trim() !== '');
  return first ? resolveProductImageUrl(first) : null;
}

function getPurchaseRequisitionNumber(po) {
  if (!po) return '—';
  return po.purchaseRequisite?.prNumber || po.purchaseRequisitionNumber || '—';
}

function PurchaseOrders({ onNavigate }) {
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [productPrices, setProductPrices] = useState({}); // Map of productId -> price
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showExcelUpload, setShowExcelUpload] = useState(false);
  const [editingPO, setEditingPO] = useState(null);
  const [viewingPO, setViewingPO] = useState(null);
  const [createdPosShareModal, setCreatedPosShareModal] = useState(null);
  const [pendingPrLinkId, setPendingPrLinkId] = useState(null);
  const [showCreateChoice, setShowCreateChoice] = useState(false);
  const [createStep, setCreateStep] = useState('choice');
  const [approvedPRs, setApprovedPRs] = useState([]);
  const [selectedPrId, setSelectedPrId] = useState('');
  const [loadingPrs, setLoadingPrs] = useState(false);
  const [createSource, setCreateSource] = useState('new');
  const [companyProfile, setCompanyProfile] = useState(null);
  const [bulkVendorId, setBulkVendorId] = useState('');
  const [formData, setFormData] = useState(() => createEmptyPurchaseOrderForm());
  const [newItem, setNewItem] = useState({
    product: '',
    quantity: 1,
    unitPrice: 0,
    discountPercent: 0,
    unitOfMeasure: 'PCS',
    taxRate: '',
  });

  useEffect(() => {
    fetchSuppliers();
    fetchProducts();
    fetchCompanyProfile();
  }, []);

  useEffect(() => {
    const timer = setTimeout(fetchPurchaseOrders, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchCompanyProfile = async () => {
    try {
      const response = await companyProfileAPI.get();
      setCompanyProfile(response.data);
    } catch (error) {
      console.error('Error fetching company profile:', error);
    }
  };

  useEffect(() => {
    if (products.length === 0) return;
    const raw = sessionStorage.getItem('retail360_po_from_pr');
    if (!raw) return;

    try {
      const draft = JSON.parse(raw);
      sessionStorage.removeItem('retail360_po_from_pr');

      const enrichedItems = sortItemsBySupplier(
        (draft.items || []).map((item) => {
          const productId = item.product;
          const product = products.find((p) => p._id === productId);
          const price = productPrices[productId];
          const unitPrice =
            item.unitPrice || price?.purchasePrice || price?.salesPrice || 0;
          const taxRate =
            item.taxRate !== '' && item.taxRate != null
              ? item.taxRate
              : getTaxRateForCategory(getCategoryName(product), 0);

          return enrichLineItem(
            {
              product: productId,
              quantity: item.quantity,
              unitPrice,
              discountPercent: item.discountPercent || 0,
              unitOfMeasure: getProductUom(product),
              taxRate,
              supplierId:
                item.supplierId ||
                item.supplier ||
                getDesignatedSupplierId(product) ||
                '',
            },
            product
          );
        }),
        products,
        suppliers
      );

      setFormData({
        ...createEmptyPurchaseOrderForm(companyProfile),
        purchaseRequisitionNumber: draft.purchaseRequisitionNumber || '',
        notes: draft.notes || '',
        deliveryLocation: draft.deliveryLocation || '',
        status: draft.status || 'draft',
        items: enrichedItems,
        supplier: '',
      });
      setPendingPrLinkId(draft.purchaseRequisiteId || null);
      setCreateSource('from_pr');
      setShowModal(true);
    } catch (error) {
      console.error('Error loading PO draft from purchase requisite:', error);
    }
  }, [products, productPrices, suppliers, companyProfile]);

  const fetchPurchaseOrders = async () => {
    try {
      setLoading(true);
      const params = {};
      if (searchTerm.trim()) params.search = searchTerm.trim();
      const response = await purchaseOrdersAPI.getAll(params);
      const data = Array.isArray(response.data)
        ? response.data
        : response.data?.data || [];
      setPurchaseOrders(data);
    } catch (error) {
      console.error('Error fetching purchase orders:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack
      });
      alert('Failed to fetch purchase orders');
    } finally {
      setLoading(false);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const response = await suppliersAPI.getAll();
      setSuppliers(response.data);
    } catch (error) {
      console.error('Error fetching suppliers:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack
      });
    }
  };

  const fetchProducts = async () => {
    try {
      const response = await productsAPI.getAll();
      const productsData = Array.isArray(response.data)
        ? response.data
        : response.data?.data || [];
      setProducts(productsData);

      if (productsData.length > 0) {
        const productIds = productsData.map((p) => p._id);
        try {
          const pricesResponse = await pricesAPI.getBulkCurrent(productIds);
          const pricesMap = {};
          pricesResponse.data.forEach((price) => {
            pricesMap[price.product._id || price.product] = price;
          });
          setProductPrices(pricesMap);
        } catch (error) {
          console.error('Error fetching prices:', error);
        }
      }
    } catch (error) {
      console.error('Error fetching products:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack
      });
    }
  };

  const poTotals = useMemo(
    () => computePurchaseOrderTotals(formData, products),
    [formData, products]
  );

  const autoVendorSplit = !editingPO;

  const vendorDisplayGroups = useMemo(() => {
    if (editingPO || formData.items.length === 0) return null;
    const { bySupplier, unassigned } = groupPoItemsBySupplier(
      formData.items,
      products,
      suppliers
    );

    const groups = [...bySupplier.values()]
      .map((group) => ({
        ...group,
        entries: group.items.map((item) => {
          const index = formData.items.indexOf(item);
          const productId = item.product?._id || item.product;
          const product = products.find((p) => p._id === productId);
          return { item, index, product };
        }),
      }))
      .sort((a, b) => a.supplierName.localeCompare(b.supplierName));

    return {
      groups,
      unassigned: unassigned.map(({ item, product }) => ({
        item,
        product,
        index: formData.items.indexOf(item),
      })),
      vendorCount: bySupplier.size,
    };
  }, [formData.items, products, suppliers, editingPO]);

  const applyBulkVendorToItems = () => {
    if (!bulkVendorId) return;
    setFormData((prev) => ({
      ...prev,
      items: sortItemsBySupplier(
        prev.items.map((item) => ({
          ...item,
          supplierId: bulkVendorId,
        })),
        products,
        suppliers
      ),
    }));
  };

  const handleItemVendorChange = (index, supplierId) => {
    setFormData((prev) => {
      const items = prev.items.map((item, i) =>
        i === index ? { ...item, supplierId: supplierId || '' } : item
      );
      return {
        ...prev,
        items: sortItemsBySupplier(items, products, suppliers),
      };
    });
  };

  const buildPoPayload = (baseForm, items, supplierId, applyCharges = false) => {
    const supplier = suppliers.find((s) => s._id === supplierId);
    const paymentTerms = supplierToPaymentTerms(supplier);
    const groupForm = {
      ...baseForm,
      supplier: supplierId,
      supplierDetails: supplierToPartyDetails(supplier),
      ...paymentTerms,
      items,
      freightCharges: applyCharges ? baseForm.freightCharges || 0 : 0,
      packingCharges: applyCharges ? baseForm.packingCharges || 0 : 0,
    };
    const totals = computePurchaseOrderTotals(groupForm, products);
    return sanitizePurchaseOrderPayload({
      ...groupForm,
      subtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      taxableValue: totals.taxableValue,
      cgst: totals.cgst,
      sgst: totals.sgst,
      igst: totals.igst,
      tax: totals.tax,
      roundOff: totals.roundOff,
      total: totals.total,
      items: totals.items,
    });
  };

  const enrichDraftItems = (draftItems) =>
    (draftItems || []).map((item) => {
      const productId = item.product;
      const product = products.find((p) => p._id === productId);
      const price = productPrices[productId];
      const unitPrice =
        item.unitPrice || price?.purchasePrice || price?.salesPrice || 0;
      const taxRate =
        item.taxRate !== '' && item.taxRate != null
          ? item.taxRate
          : getTaxRateForCategory(getCategoryName(product), 0);

      return enrichLineItem(
        {
          product: productId,
          quantity: item.quantity,
          unitPrice,
          discountPercent: item.discountPercent || 0,
          unitOfMeasure: getProductUom(product),
          taxRate,
          supplierId:
            item.supplierId ||
            item.supplier ||
            getDesignatedSupplierId(product) ||
            '',
        },
        product
      );
    });

  const fetchApprovedPRs = async () => {
    setLoadingPrs(true);
    try {
      const response = await purchaseRequisitesAPI.getAll({ status: 'approved' });
      setApprovedPRs(response.data || []);
    } catch (error) {
      console.error('Error fetching purchase requisitions:', error);
      setApprovedPRs([]);
    } finally {
      setLoadingPrs(false);
    }
  };

  const loadPurchaseRequisitionDraft = async (prId) => {
    if (!prId) {
      alert('Please select a purchase requisition');
      return;
    }
    try {
      const response = await purchaseRequisitesAPI.getPoDraft(prId);
      const draft = response.data;
      const enrichedItems = sortItemsBySupplier(
        enrichDraftItems(draft.items),
        products,
        suppliers
      );

      setFormData({
        ...createEmptyPurchaseOrderForm(companyProfile),
        purchaseRequisitionNumber: draft.purchaseRequisitionNumber || '',
        notes: draft.notes || '',
        deliveryLocation: draft.deliveryLocation || '',
        status: draft.status || 'draft',
        items: enrichedItems,
        supplier: '',
      });
      setPendingPrLinkId(draft.purchaseRequisiteId || prId);
      setCreateSource('from_pr');
      setShowCreateChoice(false);
      setCreateStep('choice');
      setShowModal(true);
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to load purchase requisition');
    }
  };

  const closeCreateFlow = () => {
    setShowCreateChoice(false);
    setCreateStep('choice');
    setSelectedPrId('');
    setCreateSource('new');
    setPendingPrLinkId(null);
  };

  const openNewPoForm = () => {
    setEditingPO(null);
    resetForm();
    setBulkVendorId('');
    setCreateSource('new');
    setPendingPrLinkId(null);
    setShowCreateChoice(false);
    setCreateStep('choice');
    setShowModal(true);
  };

  const numericFields = new Set([
    'tax', 'defaultTaxRate', 'freightCharges', 'packingCharges',
    'advancePercent', 'creditDays', 'discountTotal', 'taxableValue',
    'cgst', 'sgst', 'igst', 'roundOff', 'total',
  ]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: numericFields.has(name) ? parseFloat(value) || 0 : value,
    }));
  };

  const handleNestedChange = (e) => {
    const { name, value } = e.target;
    const [section, field] = name.split('.');
    setFormData((prev) => ({
      ...prev,
      [section]: { ...(prev[section] || {}), [field]: value },
    }));
  };

  const handleSupplierChange = (e) => {
    const supplierId = e.target.value;
    const supplier = suppliers.find((s) => s._id === supplierId);
    setFormData((prev) => ({
      ...prev,
      supplier: supplierId,
      supplierDetails: supplierToPartyDetails(supplier),
      ...supplierToPaymentTerms(supplier),
    }));
  };

  const handleAddItem = () => {
    if (!newItem.product) {
      alert('Please select a product');
      return;
    }
    if (!validateQuantity(newItem.quantity).valid) {
      alert('Quantity must be greater than zero');
      return;
    }
    if (!validatePrice(newItem.unitPrice).valid) {
      alert('Unit price cannot be negative');
      return;
    }
    const product = products.find((p) => p._id === newItem.product);
    const taxRate =
      newItem.taxRate !== '' && newItem.taxRate != null
        ? parseFloat(newItem.taxRate)
        : getTaxRateForCategory(getCategoryName(product), formData.defaultTaxRate);

    const rawItem = {
      product: newItem.product,
      quantity: parseFloat(newItem.quantity),
      unitPrice: parseFloat(newItem.unitPrice),
      discountPercent: parseFloat(newItem.discountPercent) || 0,
      unitOfMeasure: newItem.unitOfMeasure || getProductUom(product),
      taxRate,
      sku: product?.sku || '',
      hsnCode: getProductHsn(product),
      receivedQuantity: 0,
      supplierId: getDesignatedSupplierId(product) || '',
    };
    rawItem.total = rawItem.quantity * rawItem.unitPrice;
    const enriched = enrichLineItem(rawItem, product, formData.defaultTaxRate);

    setFormData((prev) => ({
      ...prev,
      items: sortItemsBySupplier([...prev.items, enriched], products, suppliers),
    }));
    setNewItem({
      product: '',
      quantity: 1,
      unitPrice: 0,
      discountPercent: 0,
      unitOfMeasure: 'PCS',
      taxRate: '',
    });
  };

  const handleRemoveItem = (index) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };


  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.items.length === 0) {
      alert('Please add at least one item');
      return;
    }
    const buyerGst = validateGSTIN(formData.buyer?.gstin);
    const buyerPan = validatePAN(formData.buyer?.pan);
    if (!buyerGst.valid) {
      alert(buyerGst.message);
      return;
    }
    if (!buyerPan.valid) {
      alert(buyerPan.message);
      return;
    }
    if (editingPO?.needsVendorAssignment) {
      return;
    }
    try {
      if (editingPO) {
        const data = sanitizePurchaseOrderPayload({
          ...formData,
          needsVendorAssignment: editingPO.needsVendorAssignment && !formData.supplier,
          subtotal: poTotals.subtotal,
          discountTotal: poTotals.discountTotal,
          taxableValue: poTotals.taxableValue,
          cgst: poTotals.cgst,
          sgst: poTotals.sgst,
          igst: poTotals.igst,
          tax: poTotals.tax,
          roundOff: poTotals.roundOff,
          total: poTotals.total,
          items: poTotals.items,
        });
        await purchaseOrdersAPI.update(editingPO._id, data);
      } else {
        const { bySupplier, unassigned } = groupPoItemsBySupplier(
          formData.items,
          products,
          suppliers
        );

        if (unassigned.length > 0) {
          const names = unassigned
            .map(({ product, item }) => {
              const productId = item.product?._id || item.product;
              const p =
                product || products.find((prod) => prod._id === productId);
              return p?.title || p?.name || 'Unknown product';
            })
            .join('\n• ');
          alert(
            `These products have no vendor assigned. Select a vendor for each product (or apply one vendor to all):\n\n• ${names}`
          );
          return;
        }

        const groups = [...bySupplier.values()].sort((a, b) =>
          a.supplierName.localeCompare(b.supplierName)
        );

        if (groups.length === 0) {
          alert('No items with assigned suppliers');
          return;
        }

        const createdPos = [];
        for (let i = 0; i < groups.length; i += 1) {
          const group = groups[i];
          const groupTotals = computePurchaseOrderTotals(
            {
              ...formData,
              supplier: group.supplierId,
              supplierDetails: supplierToPartyDetails(
                suppliers.find((s) => s._id === group.supplierId)
              ),
              items: group.items,
              freightCharges: i === 0 ? formData.freightCharges || 0 : 0,
              packingCharges: i === 0 ? formData.packingCharges || 0 : 0,
            },
            products
          );
          const payload = buildPoPayload(
            formData,
            groupTotals.items,
            group.supplierId,
            i === 0
          );
          const response = await purchaseOrdersAPI.create(payload);
          createdPos.push(response.data);
        }

        if (pendingPrLinkId && createdPos.length > 0) {
          try {
            const poNumbers = createdPos.map((po) => po.poNumber).join(', ');
            await purchaseRequisitesAPI.linkPo(pendingPrLinkId, {
              purchaseOrderId: createdPos[0]._id,
              purchaseOrderNumber: poNumbers,
            });
          } catch (linkError) {
            console.error('Failed to link purchase requisite to PO:', linkError);
          }
        }

        if (createdPos.length > 1) {
          alert(
            `Created ${createdPos.length} purchase orders (one per vendor):\n${createdPos
              .map((po) => po.poNumber)
              .join('\n')}`
          );
        }

        closePoModal();
        fetchPurchaseOrders();
        setCreatedPosShareModal(createdPos);
        return;
      }
      closePoModal();
      fetchPurchaseOrders();
    } catch (error) {
      console.error('Error saving purchase order:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack,
        formData: formData
      });
      alert(error.response?.data?.error || 'Failed to save purchase order');
    }
  };

  const handleEdit = (po) => {
    setEditingPO(po);
    setFormData(purchaseOrderToFormData(po));
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this purchase order?')) {
      return;
    }
    try {
      await purchaseOrdersAPI.delete(id);
      fetchPurchaseOrders();
    } catch (error) {
      console.error('Error deleting purchase order:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack,
        purchaseOrderId: id
      });
      alert('Failed to delete purchase order');
    }
  };

  const resetForm = () => {
    setFormData(createEmptyPurchaseOrderForm(companyProfile));
    setNewItem({
      product: '',
      quantity: 1,
      unitPrice: 0,
      discountPercent: 0,
      unitOfMeasure: 'PCS',
      taxRate: '',
    });
  };

  const closePoModal = () => {
    setShowModal(false);
    setEditingPO(null);
    setBulkVendorId('');
    closeCreateFlow();
    resetForm();
  };

  const openAddModal = () => {
    setEditingPO(null);
    resetForm();
    setBulkVendorId('');
    setCreateStep('choice');
    setSelectedPrId('');
    setCreateSource('new');
    setPendingPrLinkId(null);
    setShowCreateChoice(true);
  };

  const renderItemRow = (item, index) => {
    const productId = item.product?._id || item.product;
    const product = products.find((p) => p._id === productId);
    const enriched = enrichLineItem(item, product, formData.defaultTaxRate);
    const vendorOptions = getVendorOptionsForProduct(product, suppliers);
    return (
      <div key={`${productId}-${index}`} className="item-row po-item-row-extended">
        <span>{product?.title || product?.name || 'Unknown'}</span>
        <span>{enriched.sku || '-'}</span>
        {autoVendorSplit && (
          <span className="po-item-vendor-cell">
            <select
              value={item.supplierId || ''}
              onChange={(e) => handleItemVendorChange(index, e.target.value)}
              aria-label={`Vendor for ${product?.title || product?.name || 'product'}`}
            >
              <option value="">Select vendor</option>
              {vendorOptions.map((vendor) => (
                <option key={vendor._id} value={vendor._id}>
                  {vendor.name}
                </option>
              ))}
              {/* Keep current value visible even if not in product-linked list */}
              {item.supplierId &&
                !vendorOptions.some((v) => String(v._id) === String(item.supplierId)) && (
                  <option value={item.supplierId}>
                    {suppliers.find((s) => String(s._id) === String(item.supplierId))?.name ||
                      'Selected vendor'}
                  </option>
                )}
            </select>
          </span>
        )}
        <span>{item.quantity}</span>
        <span>{enriched.unitOfMeasure}</span>
        <span>{formatINR(item.unitPrice)}</span>
        <span>{enriched.discountPercent || 0}%</span>
        <span>{enriched.taxRate || 0}%</span>
        <span>{formatINR(enriched.lineTotal)}</span>
        <button
          type="button"
          onClick={() => handleRemoveItem(index)}
          className="btn-remove-item"
        >
          Remove
        </button>
      </div>
    );
  };

  const handlePrintPO = (po) => {
    if (!po) return;
    const html = generatePurchaseOrderPrintHtml(po, products, {
      getProductThumbnail,
      productImagePlaceholder: PRODUCT_IMAGE_PLACEHOLDER,
      uploadsBase: UPLOADS_BASE,
    });
    openPurchaseOrderPrintWindow(html);
  };

  const handleCreateGrn = (po) => {
    if (!po?._id) return;
    if (!isPoEligibleForGrn(po)) {
      alert('This PO cannot receive a GRN (fully received, closed, cancelled, or no pending items)');
      return;
    }
    sessionStorage.setItem('retail360_grn_from_po', JSON.stringify({ purchaseOrderId: po._id }));
    setViewingPO(null);
    if (onNavigate) onNavigate('grn');
    else alert('Open Goods Receipt Note from the sidebar to continue.');
  };

  return (
    <div className="purchase-orders-container">
      <div className="purchase-orders-header">
        <h1>Purchase Orders</h1>
        <div className="page-header-actions">
          <button className="btn-secondary" onClick={() => setShowExcelUpload(true)}>
            ⬆ Upload Excel
          </button>
          <button className="btn-primary" onClick={openAddModal}>
            + Create Purchase Order
          </button>
        </div>
      </div>

      <div className="po-filters">
        <input
          type="text"
          placeholder="Search PO number, PR number, supplier, department…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="loading">Loading purchase orders...</div>
      ) : (
        <div className="purchase-orders-table-container">
          <table className="purchase-orders-table">
            <thead>
              <tr>
                <th>PO Number</th>
                <th>PR Number</th>
                <th>Supplier</th>
                <th>Order Date</th>
                <th>Status</th>
                <th>Items</th>
                <th>Total</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {purchaseOrders.length === 0 ? (
                <tr>
                  <td colSpan="8" className="no-data">
                    No purchase orders found
                  </td>
                </tr>
              ) : (
                purchaseOrders.map((po) => (
                  <tr
                    key={po._id}
                    className="clickable-row"
                    onClick={() => setViewingPO(po)}
                  >
                    <td>{po.poNumber}</td>
                    <td>{getPurchaseRequisitionNumber(po)}</td>
                    <td>
                      {po.needsVendorAssignment ? (
                        <span className="po-vendor-pending-badge">Assign vendor</span>
                      ) : (
                        po.supplier?.name || '—'
                      )}
                    </td>
                    <td>{new Date(po.orderDate).toLocaleDateString()}</td>
                    <td>
                      <span className={`status-badge status-${po.status}`}>
                        {po.status}
                      </span>
                    </td>
                    <td>{po.items?.length || 0}</td>
                    <td>₹{po.total?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button
                        className="btn-edit"
                        onClick={() => handleEdit(po)}
                      >
                        {po.needsVendorAssignment ? 'Assign Vendor' : 'Edit'}
                      </button>
                      <button
                        className="btn-delete"
                        onClick={() => handleDelete(po._id)}
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
          moduleName="purchase-orders"
          templateEndpoint="/purchase-orders/template"
          onUploadComplete={() => fetchPurchaseOrders()}
          onClose={() => setShowExcelUpload(false)}
        />
      )}

      {viewingPO && (
        <DetailModal
          headerActions={
            <>
              {isPoEligibleForGrn(viewingPO) && (
                <button
                  className="btn-primary"
                  type="button"
                  onClick={() => handleCreateGrn(viewingPO)}
                >
                  📥 Create GRN
                </button>
              )}
              <button
                className="btn-secondary"
                type="button"
                onClick={() => handlePrintPO(viewingPO)}
              >
                🖨 Print / Download
              </button>
              <PoShareActions po={viewingPO} products={products} compact />
            </>
          }
          title={`Purchase Order ${viewingPO.poNumber || ''}`}
          fields={[
            { label: 'PO Number', value: viewingPO.poNumber },
            { label: 'PR Number', value: getPurchaseRequisitionNumber(viewingPO) },
            { label: 'Revision', value: viewingPO.revisionNumber || '0' },
            { label: 'Currency', value: viewingPO.currency || 'INR' },
            { label: 'Supplier', value: viewingPO.supplier?.name },
            { label: 'Buyer GSTIN', value: viewingPO.buyer?.gstin },
            { label: 'Supplier GSTIN', value: viewingPO.supplierDetails?.gstin },
            { label: 'Order Date', value: viewingPO.orderDate ? new Date(viewingPO.orderDate).toLocaleDateString() : '' },
            { label: 'Expected Delivery', value: viewingPO.expectedDeliveryDate ? new Date(viewingPO.expectedDeliveryDate).toLocaleDateString() : '' },
            { label: 'Department', value: viewingPO.department },
            { label: 'Cost Center', value: viewingPO.costCenter },
            { label: 'Status', value: viewingPO.status },
            { label: 'Subtotal', value: formatINR(viewingPO.subtotal) },
            { label: 'Discount', value: formatINR(viewingPO.discountTotal) },
            { label: 'Taxable Value', value: formatINR(viewingPO.taxableValue) },
            { label: 'CGST', value: formatINR(viewingPO.cgst) },
            { label: 'SGST', value: formatINR(viewingPO.sgst) },
            { label: 'IGST', value: formatINR(viewingPO.igst) },
            { label: 'Grand Total', value: formatINR(viewingPO.total) },
            { label: 'Notes', value: viewingPO.notes, full: true },
          ]}
          onClose={() => setViewingPO(null)}
          onEdit={() => {
            const po = viewingPO;
            setViewingPO(null);
            handleEdit(po);
          }}
          onDelete={() => {
            const id = viewingPO._id;
            setViewingPO(null);
            handleDelete(id);
          }}
        >
          {viewingPO.items?.length > 0 && (
            <div className="detail-view-section">
              <h3>Items</h3>
              <table className="detail-view-items-table po-detail-items-table">
                <thead>
                  <tr>
                    <th>Image</th>
                    <th>SKU</th>
                    <th>Product</th>
                    <th>HSN</th>
                    <th>Qty</th>
                    <th>UOM</th>
                    <th>Unit Price</th>
                    <th>Disc %</th>
                    <th>Tax %</th>
                    <th>Tax Amt</th>
                    <th>Line Total</th>
                    <th>Received</th>
                    <th>Pending</th>
                  </tr>
                </thead>
                <tbody>
                  {viewingPO.items.map((item, idx) => {
                    const fullProduct = resolveProduct(item, products);
                    const productName = fullProduct.title || fullProduct.name || 'Unknown';
                    const thumbnail = getProductThumbnail(fullProduct);
                    const enriched = enrichLineItem(item, fullProduct, viewingPO.defaultTaxRate || 0);
                    const productUrl = fullProduct.productUrl;
                    return (
                      <tr key={idx}>
                        <td>
                          <img
                            className="po-item-thumbnail"
                            src={thumbnail || PRODUCT_IMAGE_PLACEHOLDER}
                            alt={productName}
                            loading="lazy"
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.src = PRODUCT_IMAGE_PLACEHOLDER;
                            }}
                          />
                        </td>
                        <td>{enriched.sku || '-'}</td>
                        <td>
                          {productUrl ? (
                            <a href={productUrl} target="_blank" rel="noopener noreferrer">{productName}</a>
                          ) : (
                            productName
                          )}
                        </td>
                        <td>{enriched.hsnCode || '-'}</td>
                        <td>{item.quantity}</td>
                        <td>{enriched.unitOfMeasure}</td>
                        <td>{formatINR(item.unitPrice)}</td>
                        <td>{enriched.discountPercent || 0}%</td>
                        <td>{enriched.taxRate || 0}%</td>
                        <td>{formatINR(enriched.taxAmount)}</td>
                        <td>{formatINR(enriched.lineTotal)}</td>
                        <td>{enriched.receivedQuantity || 0}</td>
                        <td>{enriched.pendingQuantity ?? item.quantity}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </DetailModal>
      )}

      {showCreateChoice && (
        <div className="modal-overlay" onClick={closeCreateFlow}>
          <div
            className="modal-content po-create-choice-modal"
            onClick={(e) => e.stopPropagation()}
          >
            {createStep === 'choice' ? (
              <>
                <h2>Create Purchase Order</h2>
                <p className="po-create-choice-subtitle">
                  Choose how you want to create purchase orders. You can assign vendors per product
                  or apply one vendor to all items — one PO is created per vendor on save.
                </p>
                <div className="po-create-choice-cards">
                  <button
                    type="button"
                    className="po-create-choice-card"
                    onClick={() => {
                      setCreateStep('select_pr');
                      fetchApprovedPRs();
                    }}
                  >
                    <strong>From Purchase Requisition</strong>
                    <span>
                      Load an approved PR and generate vendor-wise purchase orders automatically.
                    </span>
                  </button>
                  <button
                    type="button"
                    className="po-create-choice-card"
                    onClick={openNewPoForm}
                  >
                    <strong>New Purchase Order</strong>
                    <span>
                      Add products and pick vendors product-wise, or choose one vendor for all.
                    </span>
                  </button>
                </div>
                <div className="form-actions">
                  <button type="button" onClick={closeCreateFlow}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2>Select Purchase Requisition</h2>
                <p className="po-create-choice-subtitle">
                  Choose an approved purchase requisition to generate vendor-wise POs.
                </p>
                {loadingPrs ? (
                  <p className="loading">Loading purchase requisitions…</p>
                ) : approvedPRs.length === 0 ? (
                  <p className="po-create-choice-empty">
                    No approved purchase requisitions available.
                  </p>
                ) : (
                  <div className="form-group">
                    <label>Purchase Requisition</label>
                    <select
                      value={selectedPrId}
                      onChange={(e) => setSelectedPrId(e.target.value)}
                    >
                      <option value="">Select a PR</option>
                      {approvedPRs.map((pr) => (
                        <option key={pr._id} value={pr._id}>
                          {pr.prNumber}
                          {pr.items?.length ? ` (${pr.items.length} line items)` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="form-actions">
                  <button type="button" onClick={() => setCreateStep('choice')}>
                    Back
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={!selectedPrId || loadingPrs}
                    onClick={() => loadPurchaseRequisitionDraft(selectedPrId)}
                  >
                    Continue
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={closePoModal}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            {editingPO?.needsVendorAssignment ? (
              <>
                <h2>
                  Assign Vendors
                  <span className="po-source-badge">{editingPO.poNumber}</span>
                </h2>
                <PoProductVendorAssign
                  poId={editingPO._id}
                  poNumber={editingPO.poNumber}
                  suppliers={suppliers}
                  onComplete={(updatedPos) => {
                    const originalId = editingPO._id;
                    closePoModal();
                    fetchPurchaseOrders();
                    const poNumbers = updatedPos.map((po) => po.poNumber).join('\n');
                    const mergedIntoExisting =
                      updatedPos.length > 0 && !updatedPos.some((po) => po._id === originalId);
                    if (mergedIntoExisting) {
                      alert(`Vendor assigned. Items added to existing PO(s):\n${poNumbers}`);
                    } else if (updatedPos.length > 1) {
                      alert(`Split into ${updatedPos.length} purchase orders:\n${poNumbers}`);
                    }
                  }}
                  onCancel={closePoModal}
                />
              </>
            ) : (
              <>
            <h2>
              {editingPO ? 'Edit Purchase Order' : 'Create Purchase Order'}
              {createSource === 'from_pr' && !editingPO && formData.purchaseRequisitionNumber && (
                <span className="po-source-badge">
                  From PR: {formData.purchaseRequisitionNumber}
                </span>
              )}
            </h2>
            <form onSubmit={handleSubmit}>
              <PurchaseOrderExtendedFields
                formData={formData}
                onChange={handleInputChange}
                onNestedChange={handleNestedChange}
                onSupplierChange={handleSupplierChange}
                suppliers={suppliers}
                autoVendorSplit={autoVendorSplit}
              />

              <div className="items-section">
                <h3>Items</h3>
                {autoVendorSplit && formData.items.length > 0 && (
                  <div className="po-vendor-bulk-panel">
                    <div className="po-vendor-bulk-row">
                      <label htmlFor="po-bulk-vendor">One vendor for all products</label>
                      <select
                        id="po-bulk-vendor"
                        value={bulkVendorId}
                        onChange={(e) => setBulkVendorId(e.target.value)}
                      >
                        <option value="">Select vendor</option>
                        {suppliers.map((supplier) => (
                          <option key={supplier._id} value={String(supplier._id)}>
                            {supplier.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={!bulkVendorId}
                        onClick={applyBulkVendorToItems}
                      >
                        Apply to all
                      </button>
                    </div>
                    <p className="po-vendor-bulk-hint">
                      Or choose a different vendor for each product in the list below. Same-vendor
                      items share one PO on save.
                    </p>
                  </div>
                )}
                {autoVendorSplit && vendorDisplayGroups && formData.items.length > 0 && (
                  <div className="po-vendor-split-summary">
                    {vendorDisplayGroups.unassigned.length > 0 ? (
                      <p className="po-vendor-warning">
                        {vendorDisplayGroups.unassigned.length} item(s) need a vendor before saving.
                      </p>
                    ) : (
                      <p className="po-vendor-info">
                        {vendorDisplayGroups.vendorCount} vendor PO
                        {vendorDisplayGroups.vendorCount === 1 ? '' : 's'} will be created on save.
                      </p>
                    )}
                  </div>
                )}
                <div className="add-item-form">
                  <div className="add-item-field add-item-field-product">
                    <label>Product</label>
                    <ProductSearchPicker
                      products={products}
                      value={newItem.product}
                      onChange={(productId, product) => {
                        const price = productPrices[productId];
                        setNewItem({
                          ...newItem,
                          product: productId,
                          unitPrice: price ? price.salesPrice : 0,
                          unitOfMeasure: getProductUom(product),
                          taxRate: getTaxRateForCategory(
                            getCategoryName(product),
                            formData.defaultTaxRate
                          ),
                        });
                      }}
                      placeholder="Type product name or SKU…"
                    />
                  </div>
                  <div className="add-item-field add-item-field-sm">
                    <label>Quantity</label>
                    <input
                      type="number"
                      placeholder="Qty"
                      value={newItem.quantity}
                      onChange={(e) =>
                        setNewItem({
                          ...newItem,
                          quantity: parseFloat(e.target.value) || 0,
                        })
                      }
                      min="1"
                    />
                  </div>
                  <div className="add-item-field add-item-field-sm">
                    <label>Unit Price (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Price"
                      value={newItem.unitPrice}
                      onChange={(e) =>
                        setNewItem({
                          ...newItem,
                          unitPrice: parseFloat(e.target.value) || 0,
                        })
                      }
                      min="0"
                    />
                  </div>
                  <div className="add-item-field add-item-field-sm">
                    <label>Discount %</label>
                    <input
                      type="number"
                      step="0.01"
                      value={newItem.discountPercent}
                      onChange={(e) =>
                        setNewItem({ ...newItem, discountPercent: parseFloat(e.target.value) || 0 })
                      }
                      min="0"
                      max="100"
                    />
                  </div>
                  <div className="add-item-field add-item-field-sm">
                    <label>Tax %</label>
                    <input
                      type="number"
                      step="0.01"
                      value={newItem.taxRate}
                      onChange={(e) => setNewItem({ ...newItem, taxRate: e.target.value })}
                      min="0"
                      max="100"
                    />
                  </div>
                  <div className="add-item-field add-item-field-sm">
                    <label>UOM</label>
                    <select
                      value={newItem.unitOfMeasure}
                      onChange={(e) => setNewItem({ ...newItem, unitOfMeasure: e.target.value })}
                    >
                      {UOM_OPTIONS.map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                  <div className="add-item-field add-item-field-sm">
                    <label>Line Total</label>
                    <input
                      type="text"
                      disabled
                      value={formatINR(
                        enrichLineItem(
                          {
                            quantity: newItem.quantity,
                            unitPrice: newItem.unitPrice,
                            discountPercent: newItem.discountPercent,
                            taxRate: newItem.taxRate !== '' ? newItem.taxRate : undefined,
                          },
                          products.find((p) => p._id === newItem.product) || null,
                          formData.defaultTaxRate
                        ).lineTotal
                      )}
                    />
                  </div>
                  <button type="button" onClick={handleAddItem} className="btn-add-item">
                    Add Item
                  </button>
                </div>

                {formData.items.length > 0 && (
                  <div
                    className={`items-list-header po-items-header-extended${
                      autoVendorSplit ? ' has-vendor-col' : ''
                    }`}
                  >
                    <span>Product</span>
                    <span>SKU</span>
                    {autoVendorSplit && <span>Vendor</span>}
                    <span>Qty</span>
                    <span>UOM</span>
                    <span>Price</span>
                    <span>Disc%</span>
                    <span>Tax%</span>
                    <span>Line Total</span>
                    <span></span>
                  </div>
                )}
                <div className={`items-list${autoVendorSplit ? ' has-vendor-col' : ''}`}>
                  {autoVendorSplit && vendorDisplayGroups ? (
                    <>
                      {vendorDisplayGroups.groups.map((group) => (
                        <div key={group.supplierId} className="po-vendor-group">
                          <div className="po-vendor-group-header">
                            <span className="po-vendor-group-name">{group.supplierName}</span>
                            <span className="po-vendor-group-count">
                              {group.entries.length} item{group.entries.length === 1 ? '' : 's'}
                            </span>
                          </div>
                          {group.entries.map(({ item, index }) => renderItemRow(item, index))}
                        </div>
                      ))}
                      {vendorDisplayGroups.unassigned.length > 0 && (
                        <div className="po-vendor-group po-vendor-group-unassigned">
                          <div className="po-vendor-group-header">
                            <span className="po-vendor-group-name">No supplier assigned</span>
                            <span className="po-vendor-group-count">
                              {vendorDisplayGroups.unassigned.length} item
                              {vendorDisplayGroups.unassigned.length === 1 ? '' : 's'}
                            </span>
                          </div>
                          {vendorDisplayGroups.unassigned.map(({ item, index }) =>
                            renderItemRow(item, index)
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    formData.items.map((item, index) => renderItemRow(item, index))
                  )}
                </div>
              </div>

              <div className="form-row po-tax-summary">
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
                  <small className="form-hint">
                    Brass/Copper 12%, Gemstone 5%. Other categories use this default.
                    {poTotals.isIntraState ? ' CGST + SGST (same state).' : ' IGST (inter-state).'}
                  </small>
                </div>
                <div className="form-group">
                  <label>Freight (₹)</label>
                  <input type="number" step="0.01" name="freightCharges" value={formData.freightCharges || 0} onChange={handleInputChange} min="0" />
                </div>
                <div className="form-group">
                  <label>Packing (₹)</label>
                  <input type="number" step="0.01" name="packingCharges" value={formData.packingCharges || 0} onChange={handleInputChange} min="0" />
                </div>
              </div>
              <div className="form-row po-tax-summary-grid">
                <div className="form-group"><label>Subtotal</label><input type="text" value={formatINR(poTotals.subtotal)} disabled /></div>
                <div className="form-group"><label>Discount</label><input type="text" value={formatINR(poTotals.discountTotal)} disabled /></div>
                <div className="form-group"><label>Taxable Value</label><input type="text" value={formatINR(poTotals.taxableValue)} disabled /></div>
                {poTotals.isIntraState ? (
                  <>
                    <div className="form-group"><label>CGST</label><input type="text" value={formatINR(poTotals.cgst)} disabled /></div>
                    <div className="form-group"><label>SGST</label><input type="text" value={formatINR(poTotals.sgst)} disabled /></div>
                  </>
                ) : (
                  <div className="form-group"><label>IGST</label><input type="text" value={formatINR(poTotals.igst)} disabled /></div>
                )}
                <div className="form-group"><label>Round Off</label><input type="text" value={formatINR(poTotals.roundOff)} disabled /></div>
                <div className="form-group">
                  <label>Grand Total</label>
                  <input type="text" value={formatINR(poTotals.total)} disabled className="total-input" />
                </div>
              </div>

              <div className="form-group">
                <label>Terms &amp; Conditions</label>
                <textarea
                  name="termsText"
                  value={(formData.termsAndConditions || []).join('\n')}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      termsAndConditions: e.target.value.split('\n').filter(Boolean),
                    }))
                  }
                  rows="4"
                />
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
                <button type="button" onClick={closePoModal}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  {editingPO
                    ? 'Update'
                    : autoVendorSplit && vendorDisplayGroups?.vendorCount > 1
                      ? `Create ${vendorDisplayGroups.vendorCount} POs`
                      : 'Create'}
                </button>
              </div>
            </form>
              </>
            )}
          </div>
        </div>
      )}

      {createdPosShareModal && createdPosShareModal.length > 0 && (
        <div className="modal-overlay" onClick={() => setCreatedPosShareModal(null)}>
          <div
            className="modal-content po-created-share-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Purchase Order{createdPosShareModal.length > 1 ? 's' : ''} Created</h2>
            <p className="po-created-share-subtitle">
              Share with your vendor via WhatsApp, Email, or Download
            </p>
            <ul className="po-created-share-list">
              {createdPosShareModal.map((po) => (
                <li key={po._id} className="po-created-share-item">
                  <div className="po-created-share-row">
                    <strong>{po.poNumber}</strong>
                    <span className="po-created-share-vendor">
                      {po.supplier?.name || po.supplierDetails?.companyName || '—'}
                    </span>
                  </div>
                  <PoShareActions
                    po={po}
                    products={products}
                    compact
                    onPrint={handlePrintPO}
                  />
                </li>
              ))}
            </ul>
            <div className="form-actions">
              <button type="button" onClick={() => setCreatedPosShareModal(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PurchaseOrders;

