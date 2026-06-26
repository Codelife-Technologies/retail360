import React from 'react';
import { purchaseOrdersAPI } from '../services/api';
import { openGmailShare, openWhatsAppShare } from '../utils/purchaseOrderShareUtils';
import {
  generatePurchaseOrderPrintHtml,
  downloadPurchaseOrderHtml,
} from '../utils/generatePurchaseOrderPrintHtml';
import {
  PRODUCT_IMAGE_PLACEHOLDER,
  getProductThumbnail,
} from '../utils/productDisplayUtils';
import './PoShareActions.css';

const UPLOADS_BASE = (process.env.REACT_APP_API_URL || 'http://localhost:5000/api').replace(
  '/api',
  ''
);

async function resolvePoForShare(po) {
  if (!po?._id) return po;
  const needsFetch =
    !po.items?.length ||
    po.items.some((item) => item.unitPrice == null && item.total == null);
  if (!needsFetch) return po;
  try {
    const response = await purchaseOrdersAPI.getById(po._id);
    return response.data || po;
  } catch (error) {
    console.error('Failed to load PO for sharing:', error);
    return po;
  }
}

function PoShareActions({ po, products = [], compact = false, onPrint }) {
  if (!po || po.needsVendorAssignment) return null;

  const handleWhatsApp = async () => {
    const fullPo = await resolvePoForShare(po);
    openWhatsAppShare(fullPo, products);
  };

  const handleEmail = async () => {
    const fullPo = await resolvePoForShare(po);
    openGmailShare(fullPo, products);
  };

  const handleDownload = async () => {
    const fullPo = await resolvePoForShare(po);
    const html = generatePurchaseOrderPrintHtml(fullPo, products, {
      getProductThumbnail,
      productImagePlaceholder: PRODUCT_IMAGE_PLACEHOLDER,
      uploadsBase: UPLOADS_BASE,
    });
    downloadPurchaseOrderHtml(html, fullPo.poNumber);
  };

  return (
    <div className={`po-share-actions ${compact ? 'compact' : ''}`}>
      <button
        type="button"
        className="btn-share btn-share-whatsapp"
        onClick={handleWhatsApp}
        title="Share via WhatsApp"
      >
        WhatsApp
      </button>
      <button
        type="button"
        className="btn-share btn-share-email"
        onClick={handleEmail}
        title="Share via Email"
      >
        Email
      </button>
      <button
        type="button"
        className="btn-share btn-share-download"
        onClick={handleDownload}
        title="Download purchase order"
      >
        Download
      </button>
      {onPrint && (
        <button type="button" className="btn-share btn-share-print" onClick={() => onPrint(po)}>
          Print
        </button>
      )}
    </div>
  );
}

export default PoShareActions;
