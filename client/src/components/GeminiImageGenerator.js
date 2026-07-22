import React, { useState, useEffect, useRef } from 'react';
import { geminiAPI, subcategoriesAPI, categoriesAPI, productsAPI } from '../services/api';
import { documentsAPI } from '../documents/services/documentsApi';
import logger from '../utils/logger';
import './GeminiImageGenerator.css';

function GeminiImageGenerator() {
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedSubcategory, setSelectedSubcategory] = useState('');
  const [prompts, setPrompts] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [generatedImages, setGeneratedImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [editingPrompts, setEditingPrompts] = useState([]);
  const [loadingPrompts, setLoadingPrompts] = useState(false);
  const [regeneratingImages, setRegeneratingImages] = useState({});
  const [selectedPrompts, setSelectedPrompts] = useState(new Set());
  const [selectedGeneratedImages, setSelectedGeneratedImages] = useState(new Set());

  const [skuQuery, setSkuQuery] = useState('');
  const [skuResults, setSkuResults] = useState([]);
  const [skuSearching, setSkuSearching] = useState(false);
  const [showSkuDropdown, setShowSkuDropdown] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [savingToProduct, setSavingToProduct] = useState(false);
  const [savingToDocuments, setSavingToDocuments] = useState(false);
  const [savedToDocuments, setSavedToDocuments] = useState(new Set());
  const [aiFolders, setAiFolders] = useState([]);
  const [saveFolderId, setSaveFolderId] = useState('');
  const skuSearchRef = useRef(null);
  const skuDebounceRef = useRef(null);
  const skipCategoryResetRef = useRef(false);

  const GEMINI_TOKEN_API_URL = '';

  const [tokenLimit, setTokenLimit] = useState({
    remainingTokens: 1000000,
    totalTokens: 1000000,
    remainingRequests: 1500,
    totalRequests: 1500,
    isDemo: true,
    loading: false,
    error: null,
  });

  const getRemainingTokens = async () => {
    if (!GEMINI_TOKEN_API_URL) {
      setTokenLimit((prev) => ({
        ...prev,
        isDemo: true,
        loading: false,
        error: null,
      }));
      return;
    }

    setTokenLimit((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const response = await fetch(GEMINI_TOKEN_API_URL, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setTokenLimit({
        remainingTokens: data.remainingTokens ?? 0,
        totalTokens: data.totalTokens ?? 1000000,
        remainingRequests: data.remainingRequests ?? 0,
        totalRequests: data.totalRequests ?? 1500,
        isDemo: false,
        loading: false,
        error: null,
      });
    } catch (err) {
      logger.error('Error fetching Gemini token limit', { error: err.message });
      setTokenLimit((prev) => ({
        ...prev,
        loading: false,
        error: 'Sync error',
      }));
    }
  };

  useEffect(() => {
    getRemainingTokens();
    const interval = setInterval(getRemainingTokens, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    documentsAPI.listFolders({ sourceScope: 'AI Generator' })
      .then((res) => setAiFolders(res.data?.folders || []))
      .catch(() => setAiFolders([]));
  }, []);

  useEffect(() => {
    fetchSubcategories();
  }, [selectedCategory]);

  useEffect(() => {
    if (selectedSubcategory) {
      fetchPrompts();
    } else {
      setPrompts([]);
      setSelectedPrompts(new Set());
    }
  }, [selectedSubcategory]);

  useEffect(() => {
    if (prompts.length > 0) {
      setSelectedPrompts(new Set(prompts.map((p) => p.order)));
    }
  }, [prompts]);

  useEffect(() => {
    if (skipCategoryResetRef.current) {
      skipCategoryResetRef.current = false;
      return;
    }
    if (selectedCategory) {
      setSelectedSubcategory('');
      setPrompts([]);
    }
  }, [selectedCategory]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (skuSearchRef.current && !skuSearchRef.current.contains(event.target)) {
        setShowSkuDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchCategories = async () => {
    try {
      const response = await categoriesAPI.getAll();
      setCategories(response.data);
    } catch (error) {
      logger.error('Error fetching categories', { error: error.message });
    }
  };

  const fetchSubcategories = async () => {
    try {
      const params = {};
      if (selectedCategory) {
        params.category = selectedCategory;
      }
      const response = await subcategoriesAPI.getAll(params);
      setSubcategories(response.data);
    } catch (error) {
      logger.error('Error fetching subcategories', { error: error.message });
    }
  };

  const fetchPrompts = async () => {
    try {
      setLoadingPrompts(true);
      const response = await subcategoriesAPI.getImagePrompts(selectedSubcategory);
      setPrompts(response.data.prompts || []);
    } catch (error) {
      logger.error('Error fetching prompts', { error: error.message });
      setPrompts([]);
    } finally {
      setLoadingPrompts(false);
    }
  };

  const getImageUrl = (url) => {
    if (!url) return null;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
    const base = API_BASE_URL.replace(/\/api\/?$/, '');
    if (url.startsWith('/uploads/')) return `${base}${url}`;
    if (url.startsWith('uploads/')) return `${base}/${url}`;
    return `${base}/uploads/${url.replace(/^\/+/, '')}`;
  };

  const searchProductsBySku = async (query) => {
    const term = String(query || '').trim();
    if (term.length < 1) {
      setSkuResults([]);
      setSkuSearching(false);
      return;
    }

    try {
      setSkuSearching(true);
      const params = { search: term, page: 1, limit: 15 };
      if (selectedSubcategory) params.subCategory = selectedSubcategory;
      else if (selectedCategory) params.category = selectedCategory;

      const response = await productsAPI.getAll(params);
      const rows = Array.isArray(response.data)
        ? response.data
        : (response.data?.data || []);
      setSkuResults(rows);
      setShowSkuDropdown(true);
    } catch (error) {
      logger.error('Error searching products', { error: error.message });
      setSkuResults([]);
    } finally {
      setSkuSearching(false);
    }
  };

  const handleSkuQueryChange = (value) => {
    setSkuQuery(value);
    if (skuDebounceRef.current) clearTimeout(skuDebounceRef.current);
    skuDebounceRef.current = setTimeout(() => searchProductsBySku(value), 300);
  };

  const applyProductImageAsSource = async (product) => {
    const firstImage = (product?.images || []).find(Boolean);
    if (!firstImage) return false;

    try {
      const imageUrl = getImageUrl(firstImage);
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error('Could not load product image');
      const blob = await response.blob();
      const ext = (firstImage.split('.').pop() || 'jpg').split('?')[0];
      const file = new File([blob], `${product.sku || 'product'}.${ext}`, {
        type: blob.type || 'image/jpeg',
      });
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result);
      reader.readAsDataURL(file);
      return true;
    } catch (error) {
      logger.error('Error loading product image as source', { error: error.message });
      return false;
    }
  };

  const handleSelectProduct = async (product) => {
    setSelectedProduct(product);
    setSkuQuery(product.sku || '');
    setShowSkuDropdown(false);
    setSkuResults([]);

    const categoryId = product.category?._id || product.category || '';
    const subCategoryId = product.subCategory?._id || product.subCategory || '';

    if (categoryId) {
      skipCategoryResetRef.current = true;
      setSelectedCategory(String(categoryId));
    }
    if (subCategoryId) {
      setSelectedSubcategory(String(subCategoryId));
    }

    if ((product.images || []).length > 0) {
      await applyProductImageAsSource(product);
    }
  };

  const handleClearProduct = () => {
    setSelectedProduct(null);
    setSkuQuery('');
    setSkuResults([]);
  };

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handlePromptToggle = (order) => {
    setSelectedPrompts((prev) => {
      const next = new Set(prev);
      if (next.has(order)) next.delete(order);
      else next.add(order);
      return next;
    });
  };

  const handleSelectAllPrompts = () => {
    setSelectedPrompts(new Set(prompts.map((p) => p.order)));
  };

  const handleDeselectAllPrompts = () => {
    setSelectedPrompts(new Set());
  };

  const handleGenerateImages = async () => {
    if (!selectedImage) {
      alert('Please select an image first');
      return;
    }
    if (!selectedSubcategory) {
      alert('Please select a subcategory first');
      return;
    }
    if (selectedPrompts.size === 0) {
      alert('Please select at least one prompt to generate');
      return;
    }
    if (prompts.length < 6) {
      alert('Subcategory must have at least 6 prompts configured. Please configure prompts first.');
      return;
    }

    try {
      setLoading(true);
      const selectedPromptObjects = prompts
        .filter((p) => selectedPrompts.has(p.order))
        .sort((a, b) => a.order - b.order);

      const generationPromises = selectedPromptObjects.map(async (promptObj) => {
        try {
          const formData = new FormData();
          formData.append('image', selectedImage);
          formData.append('subcategoryId', selectedSubcategory);
          formData.append('prompt', promptObj.prompt);
          formData.append('order', promptObj.order.toString());
          if (selectedProduct?._id) formData.append('productId', selectedProduct._id);
          if (selectedProduct?.sku) formData.append('sku', selectedProduct.sku);

          const response = await geminiAPI.regenerateImage(formData);
          return response.data.success ? response.data.image : null;
        } catch (error) {
          logger.error('Error generating image', { error: error.message, order: promptObj.order });
          return {
            order: promptObj.order,
            prompt: promptObj.prompt,
            success: false,
            error: error.response?.data?.error || error.message,
          };
        }
      });

      const results = await Promise.all(generationPromises);

      setGeneratedImages((prev) => {
        const existingMap = new Map(prev.map((img) => [img.order, img]));
        results.forEach((result) => {
          if (result) existingMap.set(result.order, result);
        });
        return Array.from(existingMap.values()).sort((a, b) => a.order - b.order);
      });

      // Newly generated/replaced images are not yet saved to Document Management
      setSavedToDocuments((prev) => {
        const next = new Set(prev);
        results.forEach((result) => {
          if (result?.url) next.delete(result.order);
        });
        return next;
      });

      setSelectedGeneratedImages((prev) => {
        const next = new Set(prev);
        results.forEach((result) => {
          if (result?.url) next.add(result.order);
        });
        return next;
      });

      const successful = results.filter((r) => r?.url).length;
      alert(`Successfully generated ${successful} out of ${results.length} selected images. Use Save to add them to Document Management.`);

      setTokenLimit((prev) => ({
        ...prev,
        remainingRequests: Math.max(0, prev.remainingRequests - results.length),
        remainingTokens: Math.max(0, prev.remainingTokens - results.length * 50000),
      }));
    } catch (error) {
      logger.error('Error generating images', { error: error.message });
      alert(error.response?.data?.error || error.message || 'Failed to generate images');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSelectedToProduct = async () => {
    if (!selectedProduct?._id) {
      alert('Please select a product SKU first');
      return;
    }

    const imagesToSave = generatedImages.filter(
      (img) => img.url && selectedGeneratedImages.has(img.order)
    );

    if (imagesToSave.length === 0) {
      alert('Please select at least one generated image to save');
      return;
    }

    if (!window.confirm(`Save ${imagesToSave.length} image(s) to product ${selectedProduct.sku}?`)) {
      return;
    }

    try {
      setSavingToProduct(true);
      const response = await geminiAPI.saveToProduct({
        productId: selectedProduct._id,
        images: imagesToSave.map((img) => ({
          url: img.url,
          path: img.path,
          order: img.order,
        })),
      });
      alert(response.data?.message || `Saved ${imagesToSave.length} image(s) to ${selectedProduct.sku}`);
    } catch (error) {
      logger.error('Error saving images to product', { error: error.message });
      alert(error.response?.data?.error || error.message || 'Failed to save images to product');
    } finally {
      setSavingToProduct(false);
    }
  };

  const buildAiSavePayload = (images) => ({
    productId: selectedProduct?._id,
    sku: selectedProduct?.sku,
    folderId: saveFolderId || undefined,
    images: images.map((img) => ({
      url: img.url,
      path: img.path,
      order: img.order,
      prompt: img.prompt,
      title: selectedProduct
        ? `${selectedProduct.sku || ''} ${selectedProduct.title || selectedProduct.name || ''}`.trim()
        : img.prompt,
    })),
  });

  const handleSaveImagesToDocuments = async (images) => {
    const imagesToSave = (images || []).filter((img) => img?.url);
    if (imagesToSave.length === 0) {
      alert('No images to save');
      return;
    }

    try {
      setSavingToDocuments(true);
      const response = await documentsAPI.aiSave(buildAiSavePayload(imagesToSave));
      const savedCount = response.data?.saved?.length || 0;
      const skippedCount = Array.isArray(response.data?.skipped)
        ? response.data.skipped.filter((s) => !s.error).length
        : 0;

      setSavedToDocuments((prev) => {
        const next = new Set(prev);
        imagesToSave.forEach((img) => next.add(img.order));
        return next;
      });

      alert(
        response.data?.message
        || `Saved ${savedCount} image(s) to Document Management`
          + (skippedCount ? ` (${skippedCount} already saved)` : '')
      );
    } catch (error) {
      logger.error('Error saving images to Document Management', { error: error.message });
      alert(error.response?.data?.error || error.message || 'Failed to save to Document Management');
    } finally {
      setSavingToDocuments(false);
    }
  };

  const handleSaveSelectedToDocuments = async () => {
    const imagesToSave = generatedImages.filter(
      (img) => img.url && selectedGeneratedImages.has(img.order) && !savedToDocuments.has(img.order)
    );
    if (imagesToSave.length === 0) {
      alert('Select unsaved generated images to save to Document Management');
      return;
    }
    await handleSaveImagesToDocuments(imagesToSave);
  };

  const handleOpenPromptModal = () => {
    if (!selectedSubcategory) {
      alert('Please select a subcategory first');
      return;
    }
    if (prompts.length > 0) {
      setEditingPrompts([...prompts]);
    } else {
      setEditingPrompts([
        { prompt: '', order: 1 },
        { prompt: '', order: 2 },
        { prompt: '', order: 3 },
        { prompt: '', order: 4 },
        { prompt: '', order: 5 },
        { prompt: '', order: 6 },
      ]);
    }
    setShowPromptModal(true);
  };

  const handlePromptChange = (index, field, value) => {
    const updated = [...editingPrompts];
    updated[index] = { ...updated[index], [field]: value };
    setEditingPrompts(updated);
  };

  const handleAddPrompt = () => {
    if (editingPrompts.length >= 10) {
      alert('Maximum 10 prompts allowed');
      return;
    }
    setEditingPrompts([
      ...editingPrompts,
      { prompt: '', order: editingPrompts.length + 1 },
    ]);
  };

  const handleRemovePrompt = (index) => {
    const updated = editingPrompts.filter((_, i) => i !== index);
    updated.forEach((p, i) => {
      p.order = i + 1;
    });
    setEditingPrompts(updated);
  };

  const handleSavePrompts = async () => {
    if (editingPrompts.length < 6 || editingPrompts.length > 10) {
      alert('Must have 6-10 prompts');
      return;
    }

    for (const prompt of editingPrompts) {
      if (!prompt.prompt) {
        alert('All prompts must have prompt text');
        return;
      }
    }

    const sortedPrompts = [...editingPrompts].sort((a, b) => a.order - b.order);
    for (let i = 0; i < sortedPrompts.length; i++) {
      if (sortedPrompts[i].order !== i + 1) {
        sortedPrompts[i].order = i + 1;
      }
    }

    try {
      await subcategoriesAPI.updateImagePrompts(selectedSubcategory, {
        prompts: sortedPrompts,
      });
      setShowPromptModal(false);
      fetchPrompts();
      alert(`Successfully saved ${sortedPrompts.length} prompts for this subcategory`);
    } catch (error) {
      logger.error('Error saving prompts', { error: error.message });
      alert(error.response?.data?.error || 'Failed to save prompts');
    }
  };

  const handleDownloadImage = async (image) => {
    try {
      const imageUrl = getImageUrl(image.url);
      if (!imageUrl) {
        alert('Image URL not available');
        return;
      }

      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      const skuPrefix = selectedProduct?.sku ? `${selectedProduct.sku}_` : '';
      link.download = `${skuPrefix}generated_image_${image.order}_${Date.now()}.${imageUrl.split('.').pop().split('?')[0]}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      logger.error('Error downloading image', { error: error.message });
      alert(`Failed to download image: ${error.message}`);
    }
  };

  const handleRegenerateImage = async (image) => {
    if (!selectedImage) {
      alert('Original image is required for regeneration');
      return;
    }
    if (!selectedSubcategory) {
      alert('Subcategory is required');
      return;
    }
    if (!image.prompt) {
      alert('Prompt not available for this image');
      return;
    }

    try {
      setRegeneratingImages((prev) => ({ ...prev, [image.order]: true }));

      const formData = new FormData();
      formData.append('image', selectedImage);
      formData.append('subcategoryId', selectedSubcategory);
      formData.append('prompt', image.prompt);
      formData.append('order', image.order.toString());
      if (selectedProduct?._id) formData.append('productId', selectedProduct._id);
      if (selectedProduct?.sku) formData.append('sku', selectedProduct.sku);

      const response = await geminiAPI.regenerateImage(formData);

      if (response.data.success) {
        setGeneratedImages((prev) =>
          prev.map((img) => (img.order === image.order ? response.data.image : img))
        );
        setSelectedGeneratedImages((prev) => {
          const next = new Set(prev);
          next.add(image.order);
          return next;
        });
        // Regenerated file needs a fresh Save to Documents
        setSavedToDocuments((prev) => {
          const next = new Set(prev);
          next.delete(image.order);
          return next;
        });
        setTokenLimit((prev) => ({
          ...prev,
          remainingRequests: Math.max(0, prev.remainingRequests - 1),
          remainingTokens: Math.max(0, prev.remainingTokens - 50000),
        }));
      } else {
        alert(`Failed to regenerate image: ${response.data.message || 'Unknown error'}`);
      }
    } catch (error) {
      logger.error('Error regenerating image', { error: error.message });
      alert(error.response?.data?.error || error.message || 'Failed to regenerate image');
    } finally {
      setRegeneratingImages((prev) => {
        const updated = { ...prev };
        delete updated[image.order];
        return updated;
      });
    }
  };

  return (
    <div className="gemini-image-generator-container">
      <div className="gemini-header">
        <div className="header-title-area">
          <h1>Gemini Image Generator</h1>
          <p>Generate 6-10 product images using AI based on uploaded images and subcategory prompts</p>
        </div>

        <div className="gemini-token-counter">
          <div className="token-counter-header">
            <span className="token-counter-title">
              <span className="gemini-sparkle-icon">✨</span> Gemini API Quota
            </span>
            {tokenLimit.isDemo ? (
              <span className="badge demo-badge" title="Paste your API endpoint in GeminiImageGenerator.js to sync live data">Demo Mode</span>
            ) : (
              <span className="badge live-badge">Live Sync</span>
            )}
          </div>
          <div className="token-counter-body">
            <div className="quota-metric">
              <div className="metric-label">
                <span>Daily Requests</span>
                <span className="metric-values">
                  {tokenLimit.loading
                    ? '...'
                    : `${tokenLimit.remainingRequests.toLocaleString()} / ${tokenLimit.totalRequests.toLocaleString()}`}
                </span>
              </div>
              <div className="progress-bar-container">
                <div
                  className="progress-bar-fill requests-fill"
                  style={{
                    width: `${Math.max(0, Math.min(100, (tokenLimit.remainingRequests / tokenLimit.totalRequests) * 100))}%`,
                  }}
                />
              </div>
            </div>
            <div className="quota-metric">
              <div className="metric-label">
                <span>Daily Tokens</span>
                <span className="metric-values">
                  {tokenLimit.loading
                    ? '...'
                    : `${(tokenLimit.remainingTokens / 1000).toFixed(0)}k / ${(tokenLimit.totalTokens / 1000).toFixed(0)}k`}
                </span>
              </div>
              <div className="progress-bar-container">
                <div
                  className="progress-bar-fill tokens-fill"
                  style={{
                    width: `${Math.max(0, Math.min(100, (tokenLimit.remainingTokens / tokenLimit.totalTokens) * 100))}%`,
                  }}
                />
              </div>
            </div>
          </div>
          <div className="token-counter-footer">
            {tokenLimit.error ? (
              <span className="quota-error-text">{tokenLimit.error}</span>
            ) : (
              <span className="quota-sync-time">
                {tokenLimit.isDemo ? 'Using local demo metrics' : 'Automatically syncs hourly'}
              </span>
            )}
            <button
              className="btn-refresh-quota"
              onClick={getRemainingTokens}
              disabled={tokenLimit.loading}
              title="Refresh Quota Status"
            >
              🔄
            </button>
          </div>
        </div>
      </div>

      <div className="gemini-content">
        <div className="gemini-section">
          <h2>1. Select Product SKU (optional)</h2>
          <div className="form-group sku-search-group" ref={skuSearchRef}>
            <label>Product SKU</label>
            <div className="sku-search-input-wrap">
              <input
                type="text"
                className="sku-search-input"
                value={skuQuery}
                onChange={(e) => handleSkuQueryChange(e.target.value)}
                onFocus={() => {
                  if (skuResults.length > 0) setShowSkuDropdown(true);
                }}
                placeholder="Search by SKU, name, or title…"
                autoComplete="off"
              />
              {selectedProduct ? (
                <button type="button" className="btn-link sku-clear-btn" onClick={handleClearProduct}>
                  Clear
                </button>
              ) : null}
            </div>
            {skuSearching ? <small className="form-hint">Searching…</small> : null}
            {showSkuDropdown && skuResults.length > 0 ? (
              <ul className="sku-search-dropdown">
                {skuResults.map((product) => (
                  <li key={product._id}>
                    <button
                      type="button"
                      className="sku-search-option"
                      onClick={() => handleSelectProduct(product)}
                    >
                      <strong>{product.sku || '—'}</strong>
                      <span>{product.title || product.name || ''}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {selectedProduct ? (
              <div className="selected-product-chip">
                <div>
                  <strong>{selectedProduct.sku}</strong>
                  <span>{selectedProduct.title || selectedProduct.name}</span>
                </div>
                {(selectedProduct.images || []).length > 0 ? (
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => applyProductImageAsSource(selectedProduct)}
                  >
                    Use product image as source
                  </button>
                ) : null}
              </div>
            ) : (
              <small className="form-hint">
                Select a SKU to attach product details when saving to Document Management / Product Master.
              </small>
            )}
          </div>
        </div>

        <div className="gemini-section">
          <h2>2. Select Category and Subcategory</h2>
          <div className="form-row">
            <div className="form-group">
              <label>Category *</label>
              <select
                value={selectedCategory}
                onChange={(e) => {
                  setSelectedProduct(null);
                  setSkuQuery('');
                  setSelectedCategory(e.target.value);
                }}
              >
                <option value="">Select a category</option>
                {categories.map((cat) => (
                  <option key={cat._id} value={cat._id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Subcategory *</label>
              <select
                value={selectedSubcategory}
                onChange={(e) => setSelectedSubcategory(e.target.value)}
                disabled={!selectedCategory}
              >
                <option value="">Select a subcategory</option>
                {subcategories.map((subcat) => (
                  <option key={subcat._id} value={subcat._id}>
                    {subcat.name}
                  </option>
                ))}
              </select>
              {!selectedCategory ? (
                <small className="form-hint">Please select a category first</small>
              ) : null}
            </div>
          </div>

          {selectedSubcategory ? (
            <div className="prompts-section">
              <div className="prompts-header">
                <h3>Image Generation Prompts ({prompts.length})</h3>
                <div className="prompts-header-actions">
                  {prompts.length > 0 ? (
                    <>
                      <button className="btn-link" onClick={handleSelectAllPrompts}>
                        Select All
                      </button>
                      <span style={{ margin: '0 0.5rem' }}>|</span>
                      <button className="btn-link" onClick={handleDeselectAllPrompts}>
                        Deselect All
                      </button>
                      <span style={{ margin: '0 0.5rem' }}>|</span>
                    </>
                  ) : null}
                  <button className="btn-secondary" onClick={handleOpenPromptModal}>
                    {prompts.length === 0 ? 'Configure Prompts' : 'Edit Prompts'}
                  </button>
                </div>
              </div>
              {loadingPrompts ? (
                <p>Loading prompts...</p>
              ) : prompts.length === 0 ? (
                <div className="alert alert-warning">
                  No prompts configured. Please configure 6-10 prompts for this subcategory.
                </div>
              ) : (
                <>
                  <div className="prompts-selection-info">
                    <span>
                      {selectedPrompts.size} of {prompts.length} prompts selected
                    </span>
                  </div>
                  <div className="prompts-list">
                    {prompts
                      .sort((a, b) => a.order - b.order)
                      .map((prompt) => {
                        const isSelected = selectedPrompts.has(prompt.order);
                        const isGenerated = generatedImages.some(
                          (img) => img.order === prompt.order && img.url
                        );
                        return (
                          <div
                            key={prompt._id || prompt.order}
                            className={`prompt-item ${isSelected ? 'prompt-selected' : ''} ${isGenerated ? 'prompt-generated' : ''}`}
                          >
                            <label className="prompt-checkbox-label">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handlePromptToggle(prompt.order)}
                                className="prompt-checkbox"
                              />
                              <span className="prompt-order">{prompt.order}</span>
                            </label>
                            <span className="prompt-text">{prompt.prompt}</span>
                            {isGenerated ? (
                              <span className="prompt-status-badge" title="Image already generated">
                                ✓
                              </span>
                            ) : null}
                          </div>
                        );
                      })}
                  </div>
                </>
              )}
            </div>
          ) : null}
        </div>

        <div className="gemini-section">
          <h2>3. Upload Image</h2>
          <div className="form-group">
            <label>Product Image *</label>
            <input type="file" accept="image/*" onChange={handleImageSelect} />
            {imagePreview ? (
              <div className="image-preview-container">
                <img src={imagePreview} alt="Preview" className="image-preview" />
              </div>
            ) : null}
          </div>
        </div>

        <div className="gemini-section">
          <h2>4. Generate Images</h2>
          <div className="generate-actions">
            <button
              className="btn-primary btn-generate"
              onClick={handleGenerateImages}
              disabled={!selectedImage || !selectedSubcategory || selectedPrompts.size === 0 || loading}
            >
              {loading
                ? 'Generating Images...'
                : `Generate ${selectedPrompts.size} Selected Image${selectedPrompts.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>

        {generatedImages.length > 0 ? (
          <div className="gemini-section">
            <div className="generated-images-header">
              <h2>
                Generated Images ({generatedImages.filter((img) => img.url).length})
              </h2>
              <div className="generated-images-actions">
                <button
                  className="btn-link"
                  onClick={() => {
                    setSelectedGeneratedImages(
                      new Set(generatedImages.filter((img) => img.url).map((img) => img.order))
                    );
                  }}
                >
                  Select All
                </button>
                <span style={{ margin: '0 0.5rem' }}>|</span>
                <button className="btn-link" onClick={() => setSelectedGeneratedImages(new Set())}>
                  Deselect All
                </button>
                {selectedGeneratedImages.size > 0 ? (
                  <>
                    <span style={{ margin: '0 0.5rem' }}>|</span>
                    <button
                      className="btn-secondary btn-regenerate-bulk"
                      onClick={async () => {
                        const imagesToRegenerate = generatedImages.filter(
                          (img) => img.url && selectedGeneratedImages.has(img.order)
                        );
                        if (imagesToRegenerate.length === 0) return;
                        if (!window.confirm(`Regenerate ${imagesToRegenerate.length} selected image(s)?`)) {
                          return;
                        }
                        for (const img of imagesToRegenerate) {
                          await handleRegenerateImage(img);
                        }
                      }}
                      disabled={
                        selectedGeneratedImages.size === 0
                        || Object.keys(regeneratingImages).length > 0
                      }
                    >
                      Regenerate Selected ({selectedGeneratedImages.size})
                    </button>
                    <span style={{ margin: '0 0.5rem' }}>|</span>
                    <button
                      className="btn-secondary btn-download-bulk"
                      onClick={async () => {
                        const imagesToDownload = generatedImages.filter(
                          (img) => img.url && selectedGeneratedImages.has(img.order)
                        );
                        for (const img of imagesToDownload) {
                          await handleDownloadImage(img);
                          await new Promise((resolve) => setTimeout(resolve, 200));
                        }
                      }}
                      disabled={selectedGeneratedImages.size === 0}
                    >
                      Download Selected ({selectedGeneratedImages.size})
                    </button>
                    <span style={{ margin: '0 0.5rem' }}>|</span>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                      <span>Folder</span>
                      <select
                        value={saveFolderId}
                        onChange={(e) => setSaveFolderId(e.target.value)}
                        style={{ padding: '0.35rem 0.5rem', borderRadius: 6, border: '1px solid #d1d5db' }}
                        title="Save into an AI images folder in Document Management"
                      >
                        <option value="">Unfiled</option>
                        {aiFolders.map((f) => (
                          <option key={f._id} value={f._id}>
                            {f.name}{(f.visibility || 'Shared') === 'Personal' ? ' (Personal)' : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                    <span style={{ margin: '0 0.5rem' }}>|</span>
                    <button
                      className="btn-primary btn-save-documents"
                      onClick={handleSaveSelectedToDocuments}
                      disabled={
                        selectedGeneratedImages.size === 0
                        || savingToDocuments
                        || !generatedImages.some(
                          (img) => img.url && selectedGeneratedImages.has(img.order) && !savedToDocuments.has(img.order)
                        )
                      }
                      title="Save selected images to Document Management → AI Generated Images"
                    >
                      {savingToDocuments
                        ? 'Saving…'
                        : `Save to Documents (${[...selectedGeneratedImages].filter((o) => !savedToDocuments.has(o)).length})`}
                    </button>
                    <span style={{ margin: '0 0.5rem' }}>|</span>
                    <button
                      className="btn-secondary btn-save-product"
                      onClick={handleSaveSelectedToProduct}
                      disabled={
                        selectedGeneratedImages.size === 0
                        || !selectedProduct
                        || savingToProduct
                      }
                      title={
                        selectedProduct
                          ? `Save selected images to product ${selectedProduct.sku}`
                          : 'Select a product SKU first'
                      }
                    >
                      {savingToProduct
                        ? 'Saving…'
                        : `Save to Product${selectedProduct?.sku ? ` (${selectedProduct.sku})` : ''}`}
                    </button>
                  </>
                ) : null}
              </div>
            </div>
            <p className="form-hint save-product-hint">
              Use <strong>Save to Documents</strong> to show images in Document Management → AI Generated Images
              {saveFolderId ? ' (selected folder)' : ' (Unfiled, or pick a folder above)'}.
              {selectedProduct ? ` SKU ${selectedProduct.sku} metadata will be attached.` : ' Select a SKU (optional) to attach product details.'}
              {' '}Create more folders in Document Management → AI Generated Images.
            </p>
            <div className="generated-images-grid">
              {generatedImages.map((img, index) => {
                const isSelected = selectedGeneratedImages.has(img.order);
                const isSaved = savedToDocuments.has(img.order);
                return (
                  <div
                    key={index}
                    className={`generated-image-card ${isSelected ? 'image-selected' : ''}${isSaved ? ' image-saved-docs' : ''}`}
                  >
                    {img.url ? (
                      <>
                        <div className="image-checkbox-container">
                          <label className="image-checkbox-label">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                setSelectedGeneratedImages((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(img.order);
                                  else next.delete(img.order);
                                  return next;
                                });
                              }}
                              className="image-checkbox"
                            />
                          </label>
                        </div>
                        <div className="image-container">
                          <img
                            src={getImageUrl(img.url)}
                            alt={`Generated image ${img.order}`}
                            className="generated-image"
                            onError={(e) => {
                              e.target.style.display = 'none';
                            }}
                          />
                          <div className="image-actions">
                            <button
                              className="btn-action btn-save-docs"
                              onClick={() => handleSaveImagesToDocuments([img])}
                              disabled={savingToDocuments || isSaved}
                              title={isSaved ? 'Already saved to Document Management' : 'Save to Document Management'}
                            >
                              {isSaved ? '✓ Saved' : '💾 Save'}
                            </button>
                            <button
                              className="btn-action btn-download"
                              onClick={() => handleDownloadImage(img)}
                              title="Download image"
                            >
                              ⬇️ Download
                            </button>
                            <button
                              className="btn-action btn-regenerate"
                              onClick={() => handleRegenerateImage(img)}
                              disabled={regeneratingImages[img.order] || !selectedImage}
                              title="Regenerate image"
                            >
                              {regeneratingImages[img.order] ? '⏳ Regenerating...' : '🔄 Regenerate'}
                            </button>
                          </div>
                        </div>
                        <div className="image-info">
                          <span className="image-prompt">{img.prompt}</span>
                          <span className="image-order">#{img.order}{isSaved ? ' · Docs' : ''}</span>
                        </div>
                      </>
                    ) : (
                      <div className="image-error">
                        <p>Failed to generate</p>
                        <small>{img.error}</small>
                        {selectedImage ? (
                          <button
                            className="btn-action btn-regenerate"
                            onClick={() => handleRegenerateImage(img)}
                            disabled={regeneratingImages[img.order]}
                            style={{ marginTop: '10px' }}
                          >
                            {regeneratingImages[img.order] ? '⏳ Regenerating...' : '🔄 Retry'}
                          </button>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {showPromptModal ? (
        <div className="modal-overlay" onClick={() => setShowPromptModal(false)}>
          <div className="modal-content large-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Configure Image Generation Prompts</h2>
            <p className="modal-description">
              Configure 6-10 prompts for image generation. Each prompt will generate one image.
              <strong> Minimum 6 prompts required.</strong>
            </p>

            <div className="prompts-editor">
              {editingPrompts.map((prompt, index) => (
                <div key={index} className="prompt-editor-item">
                  <div className="prompt-editor-row">
                    <div className="form-group-small">
                      <label>Order</label>
                      <input
                        type="number"
                        value={prompt.order}
                        onChange={(e) =>
                          handlePromptChange(index, 'order', parseInt(e.target.value, 10))
                        }
                        min="1"
                        max="10"
                        disabled
                      />
                    </div>
                    <div className="form-group-large">
                      <label>Prompt *</label>
                      <input
                        type="text"
                        value={prompt.prompt}
                        onChange={(e) => handlePromptChange(index, 'prompt', e.target.value)}
                        placeholder="Generate a product image with..."
                      />
                    </div>
                    <button
                      className="btn-remove"
                      onClick={() => handleRemovePrompt(index)}
                      disabled={editingPrompts.length <= 6}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}

              {editingPrompts.length < 10 ? (
                <button className="btn-add-prompt" onClick={handleAddPrompt}>
                  + Add Prompt
                </button>
              ) : null}
            </div>

            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowPromptModal(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleSavePrompts}>
                Save Prompts
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default GeminiImageGenerator;
