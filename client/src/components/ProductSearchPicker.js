import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  getCatalogSku,
  getChildSku,
  getParentSku,
  getProductDisplayName,
} from '../utils/productDisplayUtils';
import './ProductSearchPicker.css';

export function matchProductSearch(product, query) {
  const term = String(query || '').trim().toLowerCase();
  if (!term) return true;

  const fields = [
    getProductDisplayName(product),
    getParentSku(product),
    getChildSku(product),
    getCatalogSku(product),
    product?.sku,
    product?.ean,
    product?.brandName,
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  return fields.some((value) => value.includes(term));
}

function formatProductSkuMeta(product) {
  const parentSku = getParentSku(product);
  const childSku = getChildSku(product);
  if (childSku) {
    return `Parent SKU: ${parentSku || '—'} · Child SKU: ${childSku}`;
  }
  return parentSku ? `SKU: ${parentSku}` : 'No SKU';
}

function ProductSearchPicker({
  products = [],
  value = '',
  onChange,
  placeholder = 'Type title or SKU…',
  id,
  required = false,
  disabled = false,
  inputClassName = '',
}) {
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const selectedProduct = useMemo(
    () => products.find((product) => product._id === value) || null,
    [products, value]
  );

  const filteredProducts = useMemo(() => {
    const list = query.trim()
      ? products.filter((product) => matchProductSearch(product, query))
      : products;
    return list.slice(0, 40);
  }, [products, query]);

  useEffect(() => {
    if (!open && selectedProduct) {
      setQuery(getProductDisplayName(selectedProduct));
    } else if (!open && !value) {
      setQuery('');
    }
  }, [selectedProduct, value, open]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
        if (selectedProduct) {
          setQuery(getProductDisplayName(selectedProduct));
        }
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [selectedProduct]);

  const handleInputChange = (event) => {
    const nextQuery = event.target.value;
    setQuery(nextQuery);
    setOpen(true);
    if (!nextQuery.trim() && value) {
      onChange('', null);
    }
  };

  const handleSelect = (product) => {
    onChange(product._id, product);
    setQuery(getProductDisplayName(product));
    setOpen(false);
  };

  const handleFocus = () => {
    setOpen(true);
    inputRef.current?.select();
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      setOpen(false);
      if (selectedProduct) {
        setQuery(getProductDisplayName(selectedProduct));
      }
    }
    if (event.key === 'Enter' && open && filteredProducts.length === 1) {
      event.preventDefault();
      handleSelect(filteredProducts[0]);
    }
  };

  return (
    <div className="product-search-picker" ref={containerRef}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        className={`product-search-picker-input${inputClassName ? ` ${inputClassName}` : ''}`}
        value={query}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        required={required && !value}
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {open && !disabled && (
        <ul className="product-search-picker-results" role="listbox">
          {filteredProducts.length === 0 ? (
            <li className="product-search-picker-empty">No products match your search</li>
          ) : (
            filteredProducts.map((product) => {
              const isSelected = product._id === value;
              return (
                <li key={product._id}>
                  <button
                    type="button"
                    className={`product-search-picker-option${isSelected ? ' selected' : ''}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleSelect(product)}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <span className="product-search-picker-option-title">
                      {getProductDisplayName(product) || 'Unnamed product'}
                    </span>
                    <span className="product-search-picker-option-meta">
                      {formatProductSkuMeta(product)}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}

export default ProductSearchPicker;
