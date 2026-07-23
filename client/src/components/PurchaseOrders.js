import React, { useState, useEffect, useMemo } from 'react';
import { purchaseOrdersAPI, suppliersAPI, productsAPI, pricesAPI, purchaseRequisitesAPI, companyProfileAPI, locationsAPI, hsnMastersAPI } from '../services/api';
import DetailModal from './DetailModal';
import ExcelUpload from './ExcelUpload';
import PurchaseOrderExtendedFields from './PurchaseOrderExtendedFields';
import { getTaxRateForProduct } from '../utils/taxRates';
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
import { truncateProductName } from '../utils/productDisplayUtils';
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

function resolvePoLineSku(item) {
  if (!item) return '';
  return String(item.sku || item.product?.sku || '').trim();
}

function resolvePoLineTitle(item) {
  if (!item) return '';
  return String(
    item.itemName || item.product?.title || item.product?.name || ''
  ).trim();
}

function PurchaseOrders({ onNavigate }) {
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [productPrices, setProductPrices] = useState({}); // Map of productId -> price
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [skuSearch, setSkuSearch] = useState('');
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
  const [locations, setLocations] = useState([]);
  const [hsnMasters, setHsnMasters] = useState([]);
  const [shipToLocationId, setShipToLocationId] = useState('');
  const [formData, setFormData] = useState(() => createEmptyPurchaseOrderForm());
  const [newItem, setNewItem] = useState({
    product: '',
    itemName: '',
    sku: '',
    quantity: 1,
    unitPrice: 0,
    discountPercent: 0,
    unitOfMeasure: 'PCS',
    taxRate: '',
    supplierId: '',
  });

  useEffect(() => {
    fetchSuppliers();
    fetchProducts();
    fetchCompanyProfile();
    fetchLocations();
    fetchHsnMasters();
  }, []);

  useEffect(() => {
    const timer = setTimeout(fetchPurchaseOrders, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const skuQuery = skuSearch.trim().toLowerCase();

  const filteredPurchaseOrders = useMemo(() => {
    if (!skuQuery) return purchaseOrders;
    return purchaseOrders.filter((po) =>
      (po.items || []).some((item) => {
        const sku = resolvePoLineSku(item).toLowerCase();
        const title = resolvePoLineTitle(item).toLowerCase();
        return sku.includes(skuQuery) || title.includes(skuQuery);
      })
    );
  }, [purchaseOrders, skuQuery]);

  const skuOrderTotals = useMemo(() => {
    if (!skuQuery) return null;

    const bySku = new Map();
    let matchedOrders = 0;

    filteredPurchaseOrders.forEach((po) => {
      let orderMatched = false;
      (po.items || []).forEach((item) => {
        const sku = resolvePoLineSku(item);
        const title = resolvePoLineTitle(item);
        const skuLower = sku.toLowerCase();
        const titleLower = title.toLowerCase();
        if (!skuLower.includes(skuQuery) && !titleLower.includes(skuQuery)) return;

        orderMatched = true;
        const key = sku || title || 'unknown';
        const existing = bySku.get(key) || {
          sku: sku || '—',
          title: title || '—',
          quantity: 0,
          amount: 0,
          orderCount: 0,
          orderIds: new Set(),
        };
        existing.quantity += Number(item.quantity) || 0;
        existing.amount += Number(item.total ?? item.lineTotal) || 0;
        if (!existing.orderIds.has(po._id)) {
          existing.orderIds.add(po._id);
          existing.orderCount += 1;
        }
        bySku.set(key, existing);
      });
      if (orderMatched) matchedOrders += 1;
    });

    const rows = [...bySku.values()]
      .map(({ orderIds, ...rest }) => rest)
      .sort((a, b) => String(a.sku).localeCompare(String(b.sku)));

    return {
      rows,
      matchedOrders,
      totalQuantity: rows.reduce((sum, row) => sum + row.quantity, 0),
      totalAmount: rows.reduce((sum, row) => sum + row.amount, 0),
    };
  }, [filteredPurchaseOrders, skuQuery]);

  const fetchCompanyProfile = async () => {
    try {
      const response = await companyProfileAPI.get();
      setCompanyProfile(response.data);
    } catch (error) {
      console.error('Error fetching company profile:', error);
    }
  };

  const applyShipToLocation = (locationId, locationList = locations) => {
    const location = (locationList || []).find((l) => String(l._id) === String(locationId));
    setShipToLocationId(locationId || '');
    if (!location) {
      setFormData((prev) => ({
        ...prev,
        deliveryLocation: '',
      }));
      return;
    }
    const addressParts = [
      location.address,
      location.city,
      location.state,
      location.pincode,
      location.country,
    ].filter(Boolean);
    setFormData((prev) => ({
      ...prev,
      deliveryLocation: `${location.name}${location.code ? ` (${location.code})` : ''}`,
      shippingAddress: {
        ...(prev.shippingAddress || {}),
        warehouseName: location.name || location.code || '',
        address: addressParts.join(', '),
        contactPerson: location.contactPerson || '',
        contactNumber: location.phone || '',
        companyName:
          prev.buyer?.companyName ||
          prev.billingAddress?.companyName ||
          prev.shippingAddress?.companyName ||
          '',
        gstin: prev.billingAddress?.gstin || prev.buyer?.gstin || prev.shippingAddress?.gstin || '',
      },
    }));
  };

  const fetchLocations = async () => {
    try {
      const response = await locationsAPI.getAll({ isActive: 'true' });
      const list = Array.isArray(response.data) ? response.data : response.data?.data || [];
      setLocations(list);
      const home = list.find((l) => l.isHomeBranch) || list[0];
      if (home?._id) {
        applyShipToLocation(String(home._id), list);
      }
    } catch (error) {
      console.error('Error fetching locations:', error);
    }
  };

  const fetchHsnMasters = async () => {
    try {
      const response = await hsnMastersAPI.getActive();
      const list = Array.isArray(response.data) ? response.data : response.data?.data || [];
      setHsnMasters(list);
    } catch (error) {
      console.error('Error fetching HSN masters:', error);
      setHsnMasters([]);
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
          const taxRate = getTaxRateForProduct(product, 0, hsnMasters);

          return enrichLineItem(
            {
              product: productId,
              quantity: item.quantity,
              unitPrice,
              discountPercent: item.discountPercent || 0,
              unitOfMeasure: getProductUom(product, hsnMasters),
              taxRate,
              supplierId:
                item.supplierId ||
                item.supplier ||
                getDesignatedSupplierId(product) ||
                '',
            },
            product,
            0,
            hsnMasters
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
    () => computePurchaseOrderTotals(formData, products, hsnMasters),
    [formData, products, hsnMasters]
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
    const totals = computePurchaseOrderTotals(groupForm, products, hsnMasters);
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
      const taxRate = getTaxRateForProduct(product, 0, hsnMasters);

      return enrichLineItem(
        {
          product: productId,
          quantity: item.quantity,
          unitPrice,
          discountPercent: item.discountPercent || 0,
          unitOfMeasure: getProductUom(product, hsnMasters),
          taxRate,
          supplierId:
            item.supplierId ||
            item.supplier ||
            getDesignatedSupplierId(product) ||
            '',
        },
        product,
        0,
        hsnMasters
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
    const itemName = String(newItem.itemName || '').trim();
    const product = newItem.product
      ? products.find((p) => p._id === newItem.product)
      : null;
    const title = itemName || product?.title || product?.name || '';
    if (!title.trim()) {
      alert('Title is required for each line item');
      return;
    }
    if (!validateQuantity(newItem.quantity).valid) {
      alert('Quantity must be greater than zero');
      return;
    }
    if (!validatePrice(newItem.unitPrice).valid) {
      alert('Amount cannot be negative');
      return;
    }
    if (autoVendorSplit && !newItem.supplierId) {
      alert('Select a vendor for this item');
      return;
    }
    const taxRate =
      newItem.taxRate !== '' && newItem.taxRate != null
        ? parseFloat(newItem.taxRate)
        : getTaxRateForProduct(product, formData.defaultTaxRate, hsnMasters);

    const rawItem = {
      product: newItem.product || undefined,
      itemName: title.trim(),
      quantity: parseFloat(newItem.quantity),
      unitPrice: parseFloat(newItem.unitPrice),
      discountPercent: 0,
      unitOfMeasure: newItem.unitOfMeasure || getProductUom(product, hsnMasters),
      taxRate,
      sku: String(newItem.sku || product?.sku || '').trim(),
      hsnCode: getProductHsn(product),
      receivedQuantity: 0,
      supplierId:
        newItem.supplierId || getDesignatedSupplierId(product) || formData.supplier || '',
    };
    rawItem.total = rawItem.quantity * rawItem.unitPrice;
    const enriched = enrichLineItem(rawItem, product, formData.defaultTaxRate, hsnMasters);

    setFormData((prev) => ({
      ...prev,
      items: sortItemsBySupplier([...prev.items, enriched], products, suppliers),
    }));
    setNewItem({
      product: '',
      itemName: '',
      sku: '',
      quantity: 1,
      unitPrice: 0,
      discountPercent: 0,
      unitOfMeasure: 'PCS',
      taxRate: '',
      supplierId: '',
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
    if (!editingPO && !shipToLocationId) {
      alert('Please select a Ship To location');
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
            `These products have no vendor assigned. Select a vendor for each product after choosing the item:\n\n• ${names}`
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
            products,
            hsnMasters
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
    setShipToLocationId('');
    setNewItem({
      product: '',
      itemName: '',
      sku: '',
      quantity: 1,
      unitPrice: 0,
      discountPercent: 0,
      unitOfMeasure: 'PCS',
      taxRate: '',
    });
    const home = locations.find((l) => l.isHomeBranch) || locations[0];
    if (home?._id) {
      setTimeout(() => applyShipToLocation(String(home._id), locations), 0);
    }
  };

  const closePoModal = () => {
    setShowModal(false);
    setEditingPO(null);
    closeCreateFlow();
    resetForm();
  };

  const openAddModal = () => {
    setEditingPO(null);
    resetForm();
    setCreateStep('choice');
    setSelectedPrId('');
    setCreateSource('new');
    setPendingPrLinkId(null);
    setShowCreateChoice(true);
  };

  const renderItemRow = (item, index) => {
    const productId = item.product?._id || item.product;
    const product = productId ? products.find((p) => p._id === productId) : null;
    const enriched = enrichLineItem(item, product, formData.defaultTaxRate, hsnMasters);
    const vendorOptions = getVendorOptionsForProduct(product, suppliers);
    const productName =
      product?.title || product?.name || item.itemName || 'New item';
    return (
      <div key={`${productId || item.itemName || 'item'}-${index}`} className="item-row po-item-row-simplified">
        <span className="po-product-name" title={productName}>
          {truncateProductName(productName)}
        </span>
        <span>{enriched.sku || '—'}</span>
        <span className="po-item-vendor-cell">
          <select
            value={item.supplierId || formData.supplier || ''}
            onChange={(e) => handleItemVendorChange(index, e.target.value)}
            aria-label={`Vendor for ${productName}`}
            required={autoVendorSplit}
          >
            <option value="">Select vendor</option>
            {(vendorOptions.length ? vendorOptions : suppliers).map((vendor) => (
              <option key={vendor._id} value={vendor._id}>
                {vendor.name}
              </option>
            ))}
            {item.supplierId &&
              !(vendorOptions.length ? vendorOptions : suppliers).some(
                (v) => String(v._id) === String(item.supplierId)
              ) && (
                <option value={item.supplierId}>
                  {suppliers.find((s) => String(s._id) === String(item.supplierId))?.name ||
                    'Selected vendor'}
                </option>
              )}
          </select>
        </span>
        <span>{enriched.hsnCode || getProductHsn(product) || '—'}</span>
        <span>{item.quantity}</span>
        <span>{enriched.unitOfMeasure}</span>
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

      <div className="po-sku-search-bar">
        <label htmlFor="po-sku-search">Find SKU on purchase orders</label>
        <div className="po-sku-search-row">
          <input
            id="po-sku-search"
            type="search"
            value={skuSearch}
            onChange={(e) => setSkuSearch(e.target.value)}
            placeholder="Search by SKU or product title…"
            autoComplete="off"
          />
          {skuSearch ? (
            <button type="button" className="btn-clear-sku-search" onClick={() => setSkuSearch('')}>
              Clear
            </button>
          ) : null}
        </div>
        {skuOrderTotals ? (
          <div className="po-sku-totals">
            <div className="po-sku-totals-summary">
              <span>
                <strong>{skuOrderTotals.matchedOrders}</strong> PO
                {skuOrderTotals.matchedOrders === 1 ? '' : 's'}
              </span>
              <span>
                Total qty: <strong>{skuOrderTotals.totalQuantity.toLocaleString('en-IN')}</strong>
              </span>
              <span>
                Total amount: <strong>{formatINR(skuOrderTotals.totalAmount)}</strong>
              </span>
            </div>
            {skuOrderTotals.rows.length > 0 ? (
              <table className="po-sku-totals-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Title</th>
                    <th>POs</th>
                    <th>Total Qty</th>
                    <th>Total Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {skuOrderTotals.rows.map((row) => (
                    <tr key={`${row.sku}-${row.title}`}>
                      <td>{row.sku}</td>
                      <td>{row.title}</td>
                      <td>{row.orderCount}</td>
                      <td>{row.quantity.toLocaleString('en-IN')}</td>
                      <td>{formatINR(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="po-sku-empty">No PO lines match “{skuSearch.trim()}”.</p>
            )}
          </div>
        ) : null}
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
                <th>SKU</th>
                <th>Qty</th>
                <th>Total</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPurchaseOrders.length === 0 ? (
                <tr>
                  <td colSpan="9" className="no-data">
                    {skuQuery ? 'No purchase orders found for this SKU' : 'No purchase orders found'}
                  </td>
                </tr>
              ) : (
                filteredPurchaseOrders.flatMap((po) => {
                  const lines =
                    po.items?.length > 0
                      ? po.items
                      : [{ _placeholder: true, sku: '—', quantity: 0 }];
                  const rowSpan = lines.length;
                  return lines.map((item, idx) => {
                    const sku = item._placeholder
                      ? '—'
                      : resolvePoLineSku(item) || '—';
                    const qty = item._placeholder ? '—' : item.quantity ?? 0;
                    const title = item._placeholder ? '' : resolvePoLineTitle(item);
                    return (
                      <tr
                        key={`${po._id}-${idx}`}
                        className={`clickable-row${idx > 0 ? ' po-list-item-row' : ''}`}
                        onClick={() => setViewingPO(po)}
                      >
                        {idx === 0 ? (
                          <>
                            <td rowSpan={rowSpan}>{po.poNumber}</td>
                            <td rowSpan={rowSpan}>{getPurchaseRequisitionNumber(po)}</td>
                            <td rowSpan={rowSpan}>
                              {po.needsVendorAssignment ? (
                                <span className="po-vendor-pending-badge">Assign vendor</span>
                              ) : (
                                po.supplier?.name || '—'
                              )}
                            </td>
                            <td rowSpan={rowSpan}>
                              {new Date(po.orderDate).toLocaleDateString()}
                            </td>
                            <td rowSpan={rowSpan}>
                              <span className={`status-badge status-${po.status}`}>
                                {po.status}
                              </span>
                            </td>
                          </>
                        ) : null}
                        <td title={title || undefined}>
                          <span className="po-list-sku">{sku}</span>
                          {title && sku === '—' ? (
                            <span className="po-list-title-hint">{truncateProductName(title)}</span>
                          ) : null}
                        </td>
                        <td>{qty}</td>
                        {idx === 0 ? (
                          <>
                            <td rowSpan={rowSpan}>
                              ₹
                              {po.total?.toLocaleString('en-IN', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </td>
                            <td rowSpan={rowSpan} onClick={(e) => e.stopPropagation()}>
                              <button className="btn-edit" onClick={() => handleEdit(po)}>
                                {po.needsVendorAssignment ? 'Assign Vendor' : 'Edit'}
                              </button>
                              <button className="btn-delete" onClick={() => handleDelete(po._id)}>
                                Delete
                              </button>
                            </td>
                          </>
                        ) : null}
                      </tr>
                    );
                  });
                })
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
          mandatoryFieldsHelp={[
            'PO Reference * — your PO number / reference for each order',
            'Supplier Name * — vendor from Supplier Master',
            'Order Date & Expected Delivery Date — different dates create separate POs',
            'One PO is created per unique vendor + PO reference + dates combination',
            'Multiple line rows with the same vendor, PO ref, and dates = one PO with many items',
            'Product SKU (optional) — match Product Master when known',
            'Product Name (optional if SKU set) — use for new items without SKU',
            'Quantity *, Unit Price (Amount) * — line items',
          ]}
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
            { label: 'Currency', value: viewingPO.currency || 'INR' },
            { label: 'Vendor', value: viewingPO.supplier?.name },
            { label: 'Vendor GSTIN', value: viewingPO.supplierDetails?.gstin },
            {
              label: 'Vendor Location',
              value: [viewingPO.supplierDetails?.state, viewingPO.supplierDetails?.address]
                .filter(Boolean)
                .join(' — '),
            },
            { label: 'Order Date', value: viewingPO.orderDate ? new Date(viewingPO.orderDate).toLocaleDateString() : '' },
            { label: 'Expected Delivery', value: viewingPO.expectedDeliveryDate ? new Date(viewingPO.expectedDeliveryDate).toLocaleDateString() : '' },
            {
              label: 'Ship To',
              value: viewingPO.deliveryLocation || viewingPO.shippingAddress?.warehouseName,
            },
            { label: 'Subtotal', value: formatINR(viewingPO.subtotal) },
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
              <div className="po-detail-items-wrap">
              <table className="detail-view-items-table po-detail-items-table">
                <colgroup>
                  <col className="po-col-image" />
                  <col className="po-col-sku" />
                  <col className="po-col-product" />
                  <col className="po-col-hsn" />
                  <col className="po-col-qty" />
                  <col className="po-col-uom" />
                  <col className="po-col-line" />
                  <col className="po-col-rcvd" />
                  <col className="po-col-pending" />
                </colgroup>
                <thead>
                  <tr>
                    <th>Image</th>
                    <th>SKU</th>
                    <th>Product</th>
                    <th>HSN</th>
                    <th>Qty</th>
                    <th>UOM</th>
                    <th>Total</th>
                    <th>Received</th>
                    <th>Pending</th>
                  </tr>
                </thead>
                <tbody>
                  {viewingPO.items.map((item, idx) => {
                    const fullProduct = resolveProduct(item, products);
                    const productName =
                      fullProduct.title || fullProduct.name || item.itemName || 'New item';
                    const thumbnail = getProductThumbnail(fullProduct);
                    const enriched = enrichLineItem(item, fullProduct, viewingPO.defaultTaxRate || 0, hsnMasters);
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
                        <td>{enriched.sku || '—'}</td>
                        <td className="po-product-name" title={productName}>
                          {productUrl ? (
                            <a href={productUrl} target="_blank" rel="noopener noreferrer">
                              {truncateProductName(productName)}
                            </a>
                          ) : (
                            truncateProductName(productName)
                          )}
                        </td>
                        <td>{enriched.hsnCode || '-'}</td>
                        <td>{item.quantity}</td>
                        <td>{enriched.unitOfMeasure}</td>
                        <td>{formatINR(enriched.lineTotal)}</td>
                        <td>{enriched.receivedQuantity || 0}</td>
                        <td>{enriched.pendingQuantity ?? item.quantity}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
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
                  Choose how you want to create purchase orders. Assign a vendor after selecting each
                  product — one PO is created per vendor on save.
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
                      Add products, then pick a vendor and HSN for each line.
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
              {editingPO ? (
                <PurchaseOrderExtendedFields
                  formData={formData}
                  onChange={handleInputChange}
                  onNestedChange={handleNestedChange}
                  onSupplierChange={handleSupplierChange}
                  suppliers={suppliers}
                  autoVendorSplit={false}
                />
              ) : (
                <p className="po-create-hint">
                  Company information comes from Company Master. Add products, then choose a vendor
                  for each item. Tax is applied from HSN / Category master.
                </p>
              )}

              <div className="items-section">
                <h3>Items</h3>
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
                    <label>Product (optional)</label>
                    <ProductSearchPicker
                      products={products}
                      value={newItem.product}
                      onChange={(productId, product) => {
                        const price = productPrices[productId];
                        const designated = getDesignatedSupplierId(product) || '';
                        setNewItem({
                          ...newItem,
                          product: productId,
                          itemName: product?.title || product?.name || '',
                          sku: product?.sku || '',
                          unitPrice: price ? (price.purchasePrice || price.salesPrice || 0) : 0,
                          unitOfMeasure: getProductUom(product, hsnMasters),
                          taxRate: getTaxRateForProduct(product, formData.defaultTaxRate, hsnMasters),
                          supplierId: designated || newItem.supplierId || formData.supplier || '',
                        });
                      }}
                      placeholder="Type product name or SKU…"
                    />
                  </div>
                  <div className="add-item-field add-item-field-product">
                    <label>Title *</label>
                    <input
                      type="text"
                      placeholder="Product title (required)"
                      value={newItem.itemName}
                      onChange={(e) =>
                        setNewItem({
                          ...newItem,
                          itemName: e.target.value,
                        })
                      }
                      required
                    />
                  </div>
                  <div className="add-item-field add-item-field-sm">
                    <label>SKU (optional)</label>
                    <input
                      type="text"
                      placeholder="Optional — leave blank for new items"
                      value={newItem.sku}
                      onChange={(e) => setNewItem({ ...newItem, sku: e.target.value })}
                    />
                  </div>
                  <div className="add-item-field add-item-field-sm">
                    <label>Vendor *</label>
                    <select
                      value={newItem.supplierId}
                      onChange={(e) => setNewItem({ ...newItem, supplierId: e.target.value })}
                    >
                      <option value="">Select vendor</option>
                      {(() => {
                        const product = products.find((p) => p._id === newItem.product);
                        const options = product
                          ? getVendorOptionsForProduct(product, suppliers)
                          : suppliers;
                        return (options.length ? options : suppliers).map((vendor) => (
                          <option key={vendor._id} value={vendor._id}>
                            {vendor.name}
                          </option>
                        ));
                      })()}
                    </select>
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
                    <label>HSN</label>
                    <input
                      type="text"
                      disabled
                      value={
                        getProductHsn(
                          products.find((p) => p._id === newItem.product) || null
                        ) || '—'
                      }
                      title="From category / HSN master"
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
                    <label>Total</label>
                    <input
                      type="text"
                      disabled
                      value={formatINR(
                        enrichLineItem(
                          {
                            quantity: newItem.quantity,
                            unitPrice: newItem.unitPrice,
                            discountPercent: 0,
                            taxRate: newItem.taxRate !== '' ? newItem.taxRate : undefined,
                          },
                          products.find((p) => p._id === newItem.product) || null,
                          formData.defaultTaxRate,
                          hsnMasters
                        ).lineTotal
                      )}
                    />
                  </div>
                  <button type="button" onClick={handleAddItem} className="btn-add-item">
                    Add Item
                  </button>
                </div>

                {formData.items.length > 0 && (
                  <div className="items-list-header po-items-header-simplified">
                    <span>Product</span>
                    <span>SKU</span>
                    <span>Vendor</span>
                    <span>HSN</span>
                    <span>Qty</span>
                    <span>UOM</span>
                    <span>Total</span>
                    <span></span>
                  </div>
                )}
                <div className="items-list has-vendor-col">
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

              <div className="po-ship-to-row">
                <label htmlFor="po-ship-to-location">Ship To *</label>
                <select
                  id="po-ship-to-location"
                  value={shipToLocationId}
                  onChange={(e) => applyShipToLocation(e.target.value)}
                  required
                >
                  <option value="">Select Ship To location</option>
                  {locations.map((loc) => (
                    <option key={loc._id} value={String(loc._id)}>
                      {loc.name}
                      {loc.code ? ` (${loc.code})` : ''}
                      {loc.isHomeBranch ? ' — Home' : ''}
                    </option>
                  ))}
                </select>
                {formData.shippingAddress?.address ? (
                  <p className="po-ship-to-address">{formData.shippingAddress.address}</p>
                ) : null}
              </div>

              <div className="form-row po-tax-summary-grid">
                <div className="form-group"><label>Subtotal</label><input type="text" value={formatINR(poTotals.subtotal)} disabled /></div>
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
              <p className="po-tax-source-hint">
                {poTotals.isIntraState ? 'CGST + SGST (same state).' : 'IGST (inter-state).'}
                {' '}Tax rates from Category HSN master.
              </p>

              {editingPO ? (
                <>
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
                </>
              ) : null}

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

