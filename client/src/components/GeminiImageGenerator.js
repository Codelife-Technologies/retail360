import React, { useState, useEffect } from 'react';
import { geminiAPI, subcategoriesAPI, categoriesAPI } from '../services/api';
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
  const [regeneratingImages, setRegeneratingImages] = useState({}); // Track regenerating state per image order
  const [selectedPrompts, setSelectedPrompts] = useState(new Set()); // Track selected prompts for generation
  const [selectedGeneratedImages, setSelectedGeneratedImages] = useState(new Set()); // Track selected generated images for bulk operations

  // --- GEMINI TOKEN LIMIT API INTEGRATION ---
  // Leave this blank for the user to paste their API URL later.
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
      // Mock values if URL is not yet provided
      setTokenLimit(prev => ({
        ...prev,
        isDemo: true,
        loading: false,
        error: null
      }));
      return;
    }

    setTokenLimit(prev => ({ ...prev, loading: true, error: null }));
    try {
      const response = await fetch(GEMINI_TOKEN_API_URL, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      // Map API response to state variables.
      // Modify keys below as per your custom API format.
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
      setTokenLimit(prev => ({
        ...prev,
        loading: false,
        error: 'Sync error',
      }));
    }
  };

  useEffect(() => {
    getRemainingTokens();
    // Auto-refresh quota every 5 minutes if API is configured
    const interval = setInterval(getRemainingTokens, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchCategories();
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
    // Auto-select all prompts when prompts are loaded
    if (prompts.length > 0) {
      const allPromptOrders = new Set(prompts.map(p => p.order));
      setSelectedPrompts(allPromptOrders);
    }
  }, [prompts]);

  useEffect(() => {
    // Reset subcategory when category changes
    if (selectedCategory) {
      setSelectedSubcategory('');
      setPrompts([]);
    }
  }, [selectedCategory]);

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

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePromptToggle = (order) => {
    setSelectedPrompts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(order)) {
        newSet.delete(order);
      } else {
        newSet.add(order);
      }
      return newSet;
    });
  };

  const handleSelectAllPrompts = () => {
    const allOrders = new Set(prompts.map(p => p.order));
    setSelectedPrompts(allOrders);
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
      
      // Filter prompts to only selected ones
      const selectedPromptObjects = prompts
        .filter(p => selectedPrompts.has(p.order))
        .sort((a, b) => a.order - b.order);
      
      // Generate images for selected prompts only
      const generationPromises = selectedPromptObjects.map(async (promptObj) => {
        try {
          const formData = new FormData();
          formData.append('image', selectedImage);
          formData.append('subcategoryId', selectedSubcategory);
          formData.append('prompt', promptObj.prompt);
          formData.append('order', promptObj.order.toString());

          const response = await geminiAPI.regenerateImage(formData);
          return response.data.success ? response.data.image : null;
        } catch (error) {
          logger.error('Error generating image', { error: error.message, order: promptObj.order });
          return {
            order: promptObj.order,
            prompt: promptObj.prompt,
            success: false,
            error: error.response?.data?.error || error.message
          };
        }
      });

      const results = await Promise.all(generationPromises);
      
      // Merge with existing generated images, replacing/adding new ones
      setGeneratedImages(prev => {
        const existingMap = new Map(prev.map(img => [img.order, img]));
        results.forEach(result => {
          if (result) {
            existingMap.set(result.order, result);
          }
        });
        return Array.from(existingMap.values()).sort((a, b) => a.order - b.order);
      });

      // Update selected generated images to include newly generated ones
      setSelectedGeneratedImages(prev => {
        const newSet = new Set(prev);
        results.forEach(result => {
          if (result && result.url) {
            newSet.add(result.order);
          }
        });
        return newSet;
      });

      const successful = results.filter(r => r && r.url).length;
      alert(`Successfully generated ${successful} out of ${results.length} selected images`);
      
      // Dynamically deduct requests/tokens based on generation attempts
      setTokenLimit(prev => ({
        ...prev,
        remainingRequests: Math.max(0, prev.remainingRequests - results.length),
        remainingTokens: Math.max(0, prev.remainingTokens - (results.length * 50000))
      }));
    } catch (error) {
      logger.error('Error generating images', { error: error.message });
      alert(error.response?.data?.error || error.message || 'Failed to generate images');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenPromptModal = () => {
    if (!selectedSubcategory) {
      alert('Please select a subcategory first');
      return;
    }
    // Initialize with existing prompts or create 6 empty prompts
    if (prompts.length > 0) {
      setEditingPrompts([...prompts]);
    } else {
      // Create 6 default prompts
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
      { prompt: '', order: editingPrompts.length + 1 }
    ]);
  };

  const handleRemovePrompt = (index) => {
    const updated = editingPrompts.filter((_, i) => i !== index);
    // Reorder prompts
    updated.forEach((p, i) => {
      p.order = i + 1;
    });
    setEditingPrompts(updated);
  };

  const handleSavePrompts = async () => {
    // Validate prompts - must have exactly 6 prompts
    if (editingPrompts.length < 6 || editingPrompts.length > 10) {
      alert('Must have 6-10 prompts');
      return;
    }

    // Ensure we have at least 6 prompts
    if (editingPrompts.length < 6) {
      alert('Minimum 6 prompts required for image generation');
      return;
    }

    for (const prompt of editingPrompts) {
      if (!prompt.prompt) {
        alert('All prompts must have prompt text');
        return;
      }
    }

    // Ensure orders are sequential starting from 1
    const sortedPrompts = [...editingPrompts].sort((a, b) => a.order - b.order);
    for (let i = 0; i < sortedPrompts.length; i++) {
      if (sortedPrompts[i].order !== i + 1) {
        sortedPrompts[i].order = i + 1;
      }
    }

    try {
      await subcategoriesAPI.updateImagePrompts(selectedSubcategory, {
        prompts: sortedPrompts
      });
      setShowPromptModal(false);
      fetchPrompts();
      alert(`Successfully saved ${sortedPrompts.length} prompts for this subcategory`);
    } catch (error) {
      logger.error('Error saving prompts', { error: error.message });
      alert(error.response?.data?.error || 'Failed to save prompts');
    }
  };

  const getImageUrl = (url) => {
    if (!url) return null;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
    return `${API_BASE_URL.replace('/api', '')}${url}`;
  };

  const handleDownloadImage = async (image) => {
    try {
      const imageUrl = getImageUrl(image.url);
      if (!imageUrl) {
        alert('Image URL not available');
        return;
      }

      // Fetch the image as a blob
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      
      // Create a temporary URL for the blob
      const blobUrl = window.URL.createObjectURL(blob);
      
      // Create a temporary anchor element and trigger download
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `generated_image_${image.order}_${Date.now()}.${imageUrl.split('.').pop().split('?')[0]}`;
      document.body.appendChild(link);
      link.click();
      
      // Clean up
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      logger.error('Error downloading image', { error: error.message });
      alert('Failed to download image: ' + error.message);
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
      // Set regenerating state for this specific image
      setRegeneratingImages(prev => ({ ...prev, [image.order]: true }));

      const formData = new FormData();
      formData.append('image', selectedImage);
      formData.append('subcategoryId', selectedSubcategory);
      formData.append('prompt', image.prompt);
      formData.append('order', image.order.toString());

      const response = await geminiAPI.regenerateImage(formData);

      if (response.data.success) {
        // Update the specific image in the generatedImages array
        setGeneratedImages(prev => 
          prev.map(img => 
            img.order === image.order 
              ? response.data.image 
              : img
          )
        );
        // Keep the image selected after regeneration
        setSelectedGeneratedImages(prev => {
          const newSet = new Set(prev);
          newSet.add(image.order);
          return newSet;
        });
        
        // Dynamically deduct quota for regeneration
        setTokenLimit(prev => ({
          ...prev,
          remainingRequests: Math.max(0, prev.remainingRequests - 1),
          remainingTokens: Math.max(0, prev.remainingTokens - 50000)
        }));
      } else {
        alert('Failed to regenerate image: ' + (response.data.message || 'Unknown error'));
      }
    } catch (error) {
      logger.error('Error regenerating image', { error: error.message });
      alert(error.response?.data?.error || error.message || 'Failed to regenerate image');
    } finally {
      // Clear regenerating state
      setRegeneratingImages(prev => {
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
                  {tokenLimit.loading ? '...' : `${tokenLimit.remainingRequests.toLocaleString()} / ${tokenLimit.totalRequests.toLocaleString()}`}
                </span>
              </div>
              <div className="progress-bar-container">
                <div 
                  className="progress-bar-fill requests-fill" 
                  style={{ width: `${Math.max(0, Math.min(100, (tokenLimit.remainingRequests / tokenLimit.totalRequests) * 100))}%` }}
                />
              </div>
            </div>
            <div className="quota-metric">
              <div className="metric-label">
                <span>Daily Tokens</span>
                <span className="metric-values">
                  {tokenLimit.loading ? '...' : `${(tokenLimit.remainingTokens / 1000).toFixed(0)}k / ${(tokenLimit.totalTokens / 1000).toFixed(0)}k`}
                </span>
              </div>
              <div className="progress-bar-container">
                <div 
                  className="progress-bar-fill tokens-fill" 
                  style={{ width: `${Math.max(0, Math.min(100, (tokenLimit.remainingTokens / tokenLimit.totalTokens) * 100))}%` }}
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
          <h2>1. Select Category and Subcategory</h2>
          <div className="form-row">
            <div className="form-group">
              <label>Category *</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
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
              {!selectedCategory && (
                <small className="form-hint">Please select a category first</small>
              )}
            </div>
          </div>

          {selectedSubcategory && (
            <div className="prompts-section">
              <div className="prompts-header">
                <h3>Image Generation Prompts ({prompts.length})</h3>
                <div className="prompts-header-actions">
                  {prompts.length > 0 && (
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
                  )}
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
                    <span>{selectedPrompts.size} of {prompts.length} prompts selected</span>
                  </div>
                  <div className="prompts-list">
                    {prompts
                      .sort((a, b) => a.order - b.order)
                      .map((prompt) => {
                        const isSelected = selectedPrompts.has(prompt.order);
                        const isGenerated = generatedImages.some(img => img.order === prompt.order && img.url);
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
                            {isGenerated && (
                              <span className="prompt-status-badge" title="Image already generated">
                                ✓
                              </span>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="gemini-section">
          <h2>2. Upload Image</h2>
          <div className="form-group">
            <label>Product Image *</label>
            <input
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
            />
            {imagePreview && (
              <div className="image-preview-container">
                <img src={imagePreview} alt="Preview" className="image-preview" />
              </div>
            )}
          </div>
        </div>

        <div className="gemini-section">
          <h2>3. Generate Images</h2>
          <div className="generate-actions">
            <button
              className="btn-primary btn-generate"
              onClick={handleGenerateImages}
              disabled={!selectedImage || !selectedSubcategory || selectedPrompts.size === 0 || loading}
            >
              {loading ? 'Generating Images...' : `Generate ${selectedPrompts.size} Selected Image${selectedPrompts.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>

        {generatedImages.length > 0 && (
          <div className="gemini-section">
            <div className="generated-images-header">
              <h2>Generated Images ({generatedImages.filter(img => img.url).length})</h2>
              <div className="generated-images-actions">
                <button 
                  className="btn-link" 
                  onClick={() => {
                    const allOrders = new Set(generatedImages.filter(img => img.url).map(img => img.order));
                    setSelectedGeneratedImages(allOrders);
                  }}
                >
                  Select All
                </button>
                <span style={{ margin: '0 0.5rem' }}>|</span>
                <button 
                  className="btn-link" 
                  onClick={() => setSelectedGeneratedImages(new Set())}
                >
                  Deselect All
                </button>
                {selectedGeneratedImages.size > 0 && (
                  <>
                    <span style={{ margin: '0 0.5rem' }}>|</span>
                    <button
                      className="btn-secondary btn-regenerate-bulk"
                      onClick={async () => {
                        const imagesToRegenerate = generatedImages.filter(img => 
                          img.url && selectedGeneratedImages.has(img.order)
                        );
                        if (imagesToRegenerate.length === 0) return;
                        
                        if (!window.confirm(`Regenerate ${imagesToRegenerate.length} selected image(s)?`)) {
                          return;
                        }
                        
                        // Regenerate each selected image sequentially
                        for (const img of imagesToRegenerate) {
                          await handleRegenerateImage(img);
                        }
                      }}
                      disabled={selectedGeneratedImages.size === 0 || Object.keys(regeneratingImages).length > 0}
                    >
                      Regenerate Selected ({selectedGeneratedImages.size})
                    </button>
                    <span style={{ margin: '0 0.5rem' }}>|</span>
                    <button
                      className="btn-secondary btn-download-bulk"
                      onClick={async () => {
                        const imagesToDownload = generatedImages.filter(img => 
                          img.url && selectedGeneratedImages.has(img.order)
                        );
                        for (const img of imagesToDownload) {
                          await handleDownloadImage(img);
                          // Small delay between downloads
                          await new Promise(resolve => setTimeout(resolve, 200));
                        }
                      }}
                      disabled={selectedGeneratedImages.size === 0}
                    >
                      Download Selected ({selectedGeneratedImages.size})
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="generated-images-grid">
              {generatedImages.map((img, index) => {
                const isSelected = selectedGeneratedImages.has(img.order);
                return (
                  <div 
                    key={index} 
                    className={`generated-image-card ${isSelected ? 'image-selected' : ''}`}
                  >
                    {img.url ? (
                      <>
                        <div className="image-checkbox-container">
                          <label className="image-checkbox-label">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                setSelectedGeneratedImages(prev => {
                                  const newSet = new Set(prev);
                                  if (e.target.checked) {
                                    newSet.add(img.order);
                                  } else {
                                    newSet.delete(img.order);
                                  }
                                  return newSet;
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
                          <span className="image-order">#{img.order}</span>
                        </div>
                      </>
                    ) : (
                      <div className="image-error">
                        <p>Failed to generate</p>
                        <small>{img.error}</small>
                        {selectedImage && (
                          <button
                            className="btn-action btn-regenerate"
                            onClick={() => handleRegenerateImage(img)}
                            disabled={regeneratingImages[img.order]}
                            style={{ marginTop: '10px' }}
                          >
                            {regeneratingImages[img.order] ? '⏳ Regenerating...' : '🔄 Retry'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Prompt Configuration Modal */}
      {showPromptModal && (
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
                          handlePromptChange(index, 'order', parseInt(e.target.value))
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
                        onChange={(e) =>
                          handlePromptChange(index, 'prompt', e.target.value)
                        }
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

              {editingPrompts.length < 10 && (
                <button className="btn-add-prompt" onClick={handleAddPrompt}>
                  + Add Prompt
                </button>
              )}
            </div>

            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => setShowPromptModal(false)}
              >
                Cancel
              </button>
              <button className="btn-primary" onClick={handleSavePrompts}>
                Save Prompts
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GeminiImageGenerator;

