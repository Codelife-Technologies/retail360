import React from 'react';
import {
  PRODUCT_IMAGE_PLACEHOLDER,
  getProductDisplayName,
  getProductThumbnail,
  normalizeProductSupplierLinks,
  resolveProductImageUrl,
} from '../utils/productDisplayUtils';
import './Products.css';

function ProductDetailField({ label, value }) {
  return (
    <div className="detail-field">
      <span className="detail-field-label">{label}</span>
      <span className="detail-field-value">{value || value === 0 ? value : '—'}</span>
    </div>
  );
}

function formatDim(d) {
  return d && (d.length || d.width || d.height)
    ? `${d.length || 0} × ${d.width || 0} × ${d.height || 0} cm`
    : '';
}

function formatPrice(price, currency = 'AED') {
  if (!price?.salesPrice && price?.salesPrice !== 0) return null;
  const value = Number(price.salesPrice) || 0;
  if (currency === 'AED') {
    return `AED ${value.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function ProductDetailsModal({
  product,
  price,
  priceCurrency = 'AED',
  onClose,
  onEdit,
  replenishContext,
}) {
  if (!product) return null;

  const displayName = getProductDisplayName(product);
  const productUrl = product.productUrl?.trim();
  const images = (product.images || []).filter((img) => img && img.trim() !== '');
  const dim = product.productDimensionCm || {};
  const pkg = product.packageDimensionCm || {};
  const bullets = (product.bulletPoints || []).filter((b) => b && b.trim() !== '');
  const keywords = (product.keywords || []).filter((k) => k && k.trim() !== '');
  const formattedPrice = formatPrice(price, priceCurrency);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content large-modal" onClick={(e) => e.stopPropagation()}>
        <div className="detail-modal-header">
          <h2>Product Details</h2>
          <div className="detail-modal-header-actions">
            {onEdit && (
              <button className="btn-primary" type="button" onClick={() => onEdit(product)}>
                ✏️ Edit
              </button>
            )}
            <button className="btn-secondary" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div className="detail-hero">
          <img
            className="detail-hero-image"
            src={getProductThumbnail(product) || PRODUCT_IMAGE_PLACEHOLDER}
            alt={displayName || 'Product'}
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = PRODUCT_IMAGE_PLACEHOLDER;
            }}
          />
          <div className="detail-hero-info">
            <span className="detail-hero-sku">SKU: {product.sku || '—'}</span>
            <h3 className="detail-hero-title">{displayName || '—'}</h3>
            {productUrl && (
              <a
                href={productUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="detail-hero-link"
              >
                Open product page ↗
              </a>
            )}
            {formattedPrice && <span className="detail-hero-price">{formattedPrice}</span>}
          </div>
        </div>

        {replenishContext && (
          <div className="detail-section replenish-detail-section">
            <h4>Replenish Report — {replenishContext.locationName || 'Location'}</h4>
            <div className="detail-grid">
              <ProductDetailField label="Warehouse" value={replenishContext.locationName} />
              <ProductDetailField label="Location Code" value={replenishContext.locationCode} />
              <ProductDetailField label="Current Stock" value={replenishContext.currentStock} />
              <ProductDetailField label="Min Stock" value={replenishContext.minStock} />
              <ProductDetailField label="Available Stock" value={replenishContext.availableStock} />
              <ProductDetailField
                label={`Sold (${replenishContext.lastMonthLabel || 'Previous month'})`}
                value={replenishContext.salesCurrent}
              />
              <ProductDetailField
                label={`Sold (${replenishContext.pastThreeMonthsLabel || 'Past 3 months'})`}
                value={replenishContext.salesPastThreeMonths}
              />
              {replenishContext.showDateColumn && (
                <ProductDetailField
                  label={`Sold (${replenishContext.specificDateLabel || 'Date'})`}
                  value={replenishContext.salesOnDate}
                />
              )}
              <ProductDetailField label="Replenish Status" value={replenishContext.replenishStatus} />
              <ProductDetailField label="Suggested Reorder" value={replenishContext.suggestedReorder} />
            </div>
          </div>
        )}

        <div className="detail-section">
          <h4>Basic Information</h4>
          <div className="detail-grid">
            <ProductDetailField label="SL No" value={product.slno} />
            <ProductDetailField label="Variation" value={product.variation} />
            <ProductDetailField label="Parent SKU / ASIN" value={product.parentSkuOrAsin} />
            <ProductDetailField label="SKU" value={product.sku} />
            <ProductDetailField label="EAN" value={product.ean} />
            <ProductDetailField label="Brand" value={product.brandName} />
          </div>
        </div>

        <div className="detail-section">
          <h4>Classification & Codes</h4>
          <div className="detail-grid">
            <ProductDetailField label="Category" value={product.category?.name || product.category} />
            <ProductDetailField
              label="Sub-Category"
              value={product.subCategory?.name || product.subCategory}
            />
            <ProductDetailField label="HSN Code" value={product.category?.hsnCode || product.hsnCode} />
            <ProductDetailField label="Manufacturer" value={product.manufacturerName} />
            <ProductDetailField label="Contact Details" value={product.contactDetails} />
          </div>
        </div>

        <div className="detail-section">
          <h4>Suppliers</h4>
          {normalizeProductSupplierLinks(product).length === 0 ? (
            <p className="product-suppliers-empty">No suppliers linked.</p>
          ) : (
            <ul className="product-suppliers-readonly">
              {normalizeProductSupplierLinks(product).map((link) => (
                <li key={link.supplierId}>
                  <div className="product-supplier-readonly-main">
                    <strong>{link.supplier?.name || 'Supplier'}</strong>
                    {link.supplier?.supplierCode && (
                      <span className="product-supplier-code">{link.supplier.supplierCode}</span>
                    )}
                  </div>
                  <span className="product-supplier-sku-unit">
                    SKU: {link.sku || '—'} · Unit: {link.unit || 'pcs'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="detail-section">
          <h4>Product Details</h4>
          <div className="detail-grid">
            <ProductDetailField label="Colour" value={product.colour} />
            <ProductDetailField label="Material" value={product.material} />
            <ProductDetailField label="Size" value={product.size} />
            <ProductDetailField label="Shape" value={product.shape} />
            <ProductDetailField label="Weight" value={product.weight ? `${product.weight} kg` : ''} />
            <ProductDetailField label="Special Feature" value={product.specialFeature} />
            <ProductDetailField label="Unit" value={product.unit} />
            <ProductDetailField label="Product Dimensions" value={formatDim(dim)} />
            <ProductDetailField label="Package Dimensions" value={formatDim(pkg)} />
          </div>
        </div>

        {bullets.length > 0 && (
          <div className="detail-section">
            <h4>Bullet Points</h4>
            <ul className="detail-bullets">
              {bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </div>
        )}

        {product.description && (
          <div className="detail-section">
            <h4>Description</h4>
            <p className="detail-description">{product.description}</p>
          </div>
        )}

        {keywords.length > 0 && (
          <div className="detail-section">
            <h4>Keywords</h4>
            <div className="detail-keywords">
              {keywords.map((k, i) => (
                <span key={i} className="detail-keyword-tag">
                  {k}
                </span>
              ))}
            </div>
          </div>
        )}

        {images.length > 0 && (
          <div className="detail-section">
            <h4>Images ({images.length})</h4>
            <div className="detail-images-grid">
              {images.map((img, i) => (
                <img
                  key={i}
                  className="detail-image-thumb"
                  src={resolveProductImageUrl(img)}
                  alt={`${displayName} ${i + 1}`}
                  loading="lazy"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = PRODUCT_IMAGE_PLACEHOLDER;
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ProductDetailsModal;
