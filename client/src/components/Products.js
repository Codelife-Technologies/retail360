import React, { useState, useEffect } from 'react';
import { productsAPI, pricesAPI, categoriesAPI, subcategoriesAPI, unitsAPI } from '../services/api';
import logger from '../utils/logger';
import Pagination from './Pagination';
import { useAuth } from '../context/AuthContext';
import ExcelUpload from './ExcelUpload';
import './Products.css';

function Products() {
  const { hasPermission } = useAuth();
  const [products, setProducts] = useState([]);
  const [productPrices, setProductPrices] = useState({}); // Map of productId -> price
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showExcelUpload, setShowExcelUpload] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 0
  });
  const [formData, setFormData] = useState({
    // Basic Information
    slno: '',
    parentSkuOrAsin: '',
    variation: '',
    sku: '',
    ean: '',
    title: '',
    brandName: '',
    // Classification & Codes
    category: '',
    subCategory: '',
    hsnCode: '',
    manufacturerName: '',
    contactDetails: '',
    // Product Details
    colour: '',
    material: '',
    size: '',
    shape: '',
    weight: '',
    specialFeature: '',
    // Dimensions
    productDimensionCm: { length: '', width: '', height: '' },
    packageDimensionCm: { length: '', width: '', height: '' },
    // Marketing
    bulletPoints: ['', '', '', '', ''],
    // Media
    images: [''],
    // Existing Fields
    description: '',
    keywords: [],
    unit: 'pcs',
  });
  const [uploadedFiles, setUploadedFiles] = useState([]); // Array of File objects
  const [imagePreviews, setImagePreviews] = useState([]); // Array of preview URLs
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [keywordInput, setKeywordInput] = useState('');

  useEffect(() => {
    fetchProducts();
    fetchCategories();
    fetchUnits();
  }, []);

  const fetchUnits = async () => {
    try {
      const response = await unitsAPI.getAll();
      setUnits(response.data);
    } catch (error) {
      logger.error('Error fetching units', { error: error.message });
    }
  };

  useEffect(() => {
    // Fetch subcategories when category changes
    if (formData.category) {
      fetchSubcategories(formData.category);
    } else {
      setSubcategories([]);
    }
  }, [formData.category]);

  const fetchProducts = async (page = pagination.page, limit = pagination.limit) => {
    try {
      setLoading(true);
      const response = await productsAPI.getAll({ 
        search: searchTerm,
        page,
        limit
      });
      
      // Check if response has pagination metadata
      if (response.data.pagination) {
        setProducts(response.data.data);
        setPagination(response.data.pagination);
      } else {
        // Fallback for non-paginated responses
        setProducts(response.data);
        setPagination({
          page: 1,
          limit: response.data.length,
          total: response.data.length,
          totalPages: 1
        });
      }
    } catch (error) {
      logger.error('Error fetching products', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack
      });
      alert('Failed to fetch products');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      fetchProducts(1, pagination.limit); // Reset to page 1 when search changes
    }, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchTerm]);

  const fetchCategories = async () => {
    try {
      const response = await categoriesAPI.getAll();
      setCategories(response.data);
    } catch (error) {
      logger.error('Error fetching categories', { error: error.message });
    }
  };

  const fetchSubcategories = async (categoryId) => {
    try {
      const response = await categoriesAPI.getSubcategories(categoryId);
      setSubcategories(response.data);
    } catch (error) {
      logger.error('Error fetching subcategories', { error: error.message });
      setSubcategories([]);
    }
  };

  const handlePageChange = (page) => {
    fetchProducts(page, pagination.limit);
  };

  const handleItemsPerPageChange = (limit) => {
    fetchProducts(1, limit);
  };

  const handleExcelUploadComplete = (result) => {
    fetchProducts(pagination.page, pagination.limit);
    setShowExcelUpload(false);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      if (name.startsWith('productDimensionCm.')) {
        const field = name.split('.')[1];
        return {
          ...prev,
          productDimensionCm: {
            ...prev.productDimensionCm,
            [field]: parseFloat(value) || '',
          },
        };
      }
      if (name.startsWith('packageDimensionCm.')) {
        const field = name.split('.')[1];
        return {
          ...prev,
          packageDimensionCm: {
            ...prev.packageDimensionCm,
            [field]: parseFloat(value) || '',
          },
        };
      }
      if (name.startsWith('bulletPoint')) {
        const index = parseInt(name.replace('bulletPoint', '')) - 1;
        const newBulletPoints = [...prev.bulletPoints];
        newBulletPoints[index] = value;
        return { ...prev, bulletPoints: newBulletPoints };
      }
      if (name.startsWith('image')) {
        const index = parseInt(name.replace('image', '')) - 1;
        const newImages = [...prev.images];
        newImages[index] = value;
        return { ...prev, images: newImages };
      }
      // Handle variation change - clear parentSkuOrAsin if variation is NO
      if (name === 'variation') {
        return {
          ...prev,
          variation: value,
          parentSkuOrAsin: value === 'NO' ? '' : prev.parentSkuOrAsin,
        };
      }
      return {
        ...prev,
        [name]:
          name === 'weight' ||
          name === 'slno'
            ? parseFloat(value) || (value === '' ? '' : 0)
            : value,
      };
    });
  };

  const handleKeywordInputChange = (e) => {
    setKeywordInput(e.target.value);
  };

  const handleKeywordKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      handleKeywordAdd();
    }
  };

  const handleKeywordAdd = () => {
    const keyword = keywordInput.trim();
    if (keyword && keyword.length > 0) {
      // Check for duplicates (case-insensitive)
      const isDuplicate = formData.keywords.some(
        k => k.toLowerCase() === keyword.toLowerCase()
      );
      
      if (!isDuplicate) {
        setFormData((prev) => ({
          ...prev,
          keywords: [...prev.keywords, keyword],
        }));
      }
      setKeywordInput('');
    }
  };

  const handleKeywordRemove = (index) => {
    setFormData((prev) => ({
      ...prev,
      keywords: prev.keywords.filter((_, i) => i !== index),
    }));
  };

  const handleImageFileSelect = (e) => {
    const files = Array.from(e.target.files);
    const validFiles = files.filter(file => {
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      return validTypes.includes(file.type);
    });
    
    if (validFiles.length !== files.length) {
      alert('Some files were skipped. Only images (jpg, jpeg, png, gif, webp) are allowed.');
    }
    
    if (validFiles.length > 0) {
      setUploadedFiles((prev) => [...prev, ...validFiles]);
      
      // Create previews
      const newPreviews = validFiles.map(file => ({
        file,
        preview: URL.createObjectURL(file),
        type: 'file'
      }));
      setImagePreviews((prev) => [...prev, ...newPreviews]);
    }
    
    // Reset input
    e.target.value = '';
  };

  const handleAddImage = () => {
    setFormData((prev) => ({
      ...prev,
      images: [...prev.images, ''],
    }));
  };

  const handleRemoveImage = (index, type = 'url') => {
    if (type === 'url') {
      const removedImage = formData.images[index];
      setFormData((prev) => ({
        ...prev,
        images: prev.images.filter((_, i) => i !== index),
      }));
      
      // Also remove from previews if it exists there
      setImagePreviews((prev) => {
        return prev.filter((preview) => {
          if (preview.type === 'url' && preview.url === removedImage) {
            return false;
          }
          if (preview.type === 'uploaded') {
            const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
            const imagePath = preview.url.replace(`${API_BASE_URL.replace('/api', '')}/uploads/`, '');
            return !removedImage.includes(imagePath.split('/').pop());
          }
          return true;
        });
      });
    } else if (type === 'file') {
      // Remove file and its preview
      const preview = imagePreviews[index];
      if (preview && preview.preview) {
        URL.revokeObjectURL(preview.preview);
      }
      setImagePreviews((prev) => prev.filter((_, i) => i !== index));
      setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const handleImageUpload = async (productId) => {
    if (uploadedFiles.length === 0) return [];
    
    try {
      const uploadFormData = new FormData();
      uploadedFiles.forEach((file) => {
        uploadFormData.append('images', file);
      });
      
      const response = await productsAPI.uploadImages(productId, uploadFormData);
      
      if (response.data.success) {
        // Clean up preview URLs for uploaded files
        imagePreviews.forEach(preview => {
          if (preview.preview && preview.type === 'file') {
            URL.revokeObjectURL(preview.preview);
          }
        });
        
        // Clear uploaded files
        setUploadedFiles([]);
        
        // Update previews to show uploaded images
        const uploadedPreviews = response.data.images.map(imgPath => {
          const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
          return { url: `${API_BASE_URL.replace('/api', '')}/uploads/${imgPath}`, type: 'uploaded' };
        });
        
        // Keep existing previews that aren't files, add new uploaded ones
        setImagePreviews((prev) => [
          ...prev.filter(p => p.type !== 'file'),
          ...uploadedPreviews
        ]);
        
        return response.data.images;
      }
      return [];
    } catch (error) {
      logger.error('Error uploading images', {
        message: error.message,
        response: error.response?.data,
      });
      alert('Failed to upload images: ' + (error.response?.data?.error || error.message));
      throw error;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // Validate mandatory fields
      const missing = [];
      if (!formData.sku?.trim()) missing.push('SKU');
      if (!formData.brandName?.trim()) missing.push('Brand Name');
      if (!formData.manufacturerName?.trim()) missing.push('Manufacturer Name');
      if (!formData.contactDetails?.trim()) missing.push('Contact Details');
      if (!formData.category) missing.push('Category');
      if (!formData.subCategory) missing.push('Sub-Category');
      if (!formData.colour?.trim()) missing.push('Colour');
      if (!formData.material?.trim()) missing.push('Material');
      if (!formData.size?.trim()) missing.push('Size');
      if (formData.weight === '' || formData.weight === undefined || formData.weight === null) missing.push('Weight');
      const pd = formData.productDimensionCm || {};
      const validDim = (v) => v !== '' && v !== undefined && v !== null && !isNaN(parseFloat(v));
      if (!validDim(pd.length) || !validDim(pd.width) || !validDim(pd.height)) missing.push('Product Dimensions');
      const pk = formData.packageDimensionCm || {};
      if (!validDim(pk.length) || !validDim(pk.width) || !validDim(pk.height)) missing.push('Package Dimensions');
      const hasImages = (imagePreviews.length > 0) || (uploadedFiles.length > 0) || (formData.images?.filter(i => i?.trim()).length > 0);
      if (!hasImages) missing.push('At least one Image');
      if (!formData.unit?.trim()) missing.push('Unit');
      if (missing.length > 0) {
        alert(`Please fill required fields: ${missing.join(', ')}`);
        return;
      }

      // Get hsnCode from selected category
      const selectedCategory = formData.category ? categories.find(c => c._id === formData.category) : null;
      const hsnCodeValue = selectedCategory?.hsnCode || formData.hsnCode || '';

      // Clean up empty values
      const submitData = {
        ...formData,
        // Clear parentSkuOrAsin if variation is NO
        parentSkuOrAsin: formData.variation === 'YES' ? formData.parentSkuOrAsin : '',
        // Convert category and subCategory to ObjectIds or null
        category: formData.category || null,
        subCategory: formData.subCategory || null,
        hsnCode: hsnCodeValue,
        bulletPoints: formData.bulletPoints.filter((bp) => bp.trim() !== ''),
        images: formData.images.filter((img) => img.trim() !== ''),
        keywords: formData.keywords.filter((kw) => kw.trim() !== ''),
        productDimensionCm: Object.values(formData.productDimensionCm).every(
          (v) => v === ''
        )
          ? undefined
          : {
              length: parseFloat(formData.productDimensionCm.length) || 0,
              width: parseFloat(formData.productDimensionCm.width) || 0,
              height: parseFloat(formData.productDimensionCm.height) || 0,
            },
        packageDimensionCm: Object.values(formData.packageDimensionCm).every(
          (v) => v === ''
        )
          ? undefined
          : {
              length: parseFloat(formData.packageDimensionCm.length) || 0,
              width: parseFloat(formData.packageDimensionCm.width) || 0,
              height: parseFloat(formData.packageDimensionCm.height) || 0,
            },
      };

      let productId;
      if (editingProduct) {
        await productsAPI.update(editingProduct._id, submitData);
        productId = editingProduct._id;
      } else {
        const response = await productsAPI.create(submitData);
        productId = response.data._id;
      }
      
      // Upload images if any files were selected
      if (uploadedFiles.length > 0 && productId) {
        const uploadedPaths = await handleImageUpload(productId);
        // Add uploaded paths to submitData for final update
        if (uploadedPaths.length > 0) {
          submitData.images = [...submitData.images, ...uploadedPaths];
          await productsAPI.update(productId, { images: submitData.images });
        }
      }
      
      closeModal();
      fetchProducts();
    } catch (error) {
      logger.error('Error saving product', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack,
        formData: formData
      });
      alert(error.response?.data?.error || 'Failed to save product');
    }
  };

  const handleEdit = async (product) => {
    setEditingProduct(product);
    const categoryId = product.category?._id || product.category || '';
    const subcategoryId = product.subCategory?._id || product.subCategory || '';
    
    // Load subcategories if category exists
    if (categoryId) {
      await fetchSubcategories(categoryId);
    }
    
    setFormData({
      slno: product.slno || '',
      parentSkuOrAsin: product.parentSkuOrAsin || '',
      variation: product.variation || '',
      sku: product.sku || '',
      ean: product.ean || '',
      title: product.title || '',
      brandName: product.brandName || '',
      category: categoryId,
      subCategory: subcategoryId,
      hsnCode: product.category?.hsnCode || product.hsnCode || '',
      manufacturerName: product.manufacturerName || '',
      contactDetails: product.contactDetails || '',
      colour: product.colour || '',
      material: product.material || '',
      size: product.size || '',
      shape: product.shape || '',
      weight: product.weight || '',
      specialFeature: product.specialFeature || '',
      productDimensionCm: product.productDimensionCm || {
        length: '',
        width: '',
        height: '',
      },
      packageDimensionCm: product.packageDimensionCm || {
        length: '',
        width: '',
        height: '',
      },
      bulletPoints: product.bulletPoints
        ? [...product.bulletPoints, '', '', '', '', ''].slice(0, 5)
        : ['', '', '', '', ''],
      images: product.images && product.images.length > 0 ? product.images : [''],
      description: product.description || '',
      keywords: product.keywords && product.keywords.length > 0 ? product.keywords : [],
      unit: product.unit || 'pcs',
    });
    
    // Set up image previews for existing images
    if (product.images && product.images.length > 0) {
      const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
      const existingPreviews = product.images.map(img => {
        // Check if it's a URL or a file path
        if (img.startsWith('http://') || img.startsWith('https://')) {
          return { url: img, type: 'url' };
        } else if (img.startsWith('products/')) {
          // It's a file path, construct the full URL
          return { url: `${API_BASE_URL.replace('/api', '')}/uploads/${img}`, type: 'uploaded' };
        } else {
          // Fallback: treat as URL
          return { url: img, type: 'url' };
        }
      });
      setImagePreviews(existingPreviews);
    } else {
      setImagePreviews([]);
    }
    
    setUploadedFiles([]);
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this product?')) {
      return;
    }
    try {
      await productsAPI.delete(id);
      fetchProducts();
    } catch (error) {
      console.error('Error deleting product:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack
      });
      alert('Failed to delete product');
    }
  };

  const resetForm = () => {
    // Clean up preview URLs
    imagePreviews.forEach(preview => {
      if (preview.preview) {
        URL.revokeObjectURL(preview.preview);
      }
    });
    
    setFormData({
      slno: '',
      parentSkuOrAsin: '',
      variation: '',
      sku: '',
      ean: '',
      title: '',
      brandName: '',
      category: '',
      subCategory: '',
      hsnCode: '', // Keep for backward compatibility, but will be read-only
      manufacturerName: '',
      contactDetails: '',
      colour: '',
      material: '',
      size: '',
      shape: '',
      weight: '',
      specialFeature: '',
      productDimensionCm: { length: '', width: '', height: '' },
      packageDimensionCm: { length: '', width: '', height: '' },
      bulletPoints: ['', '', '', '', ''],
      images: [''],
      description: '',
      keywords: [],
      unit: 'pcs',
    });
    setUploadedFiles([]);
    setImagePreviews([]);
    setKeywordInput('');
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingProduct(null);
    resetForm();
  };

  const openAddModal = () => {
    setEditingProduct(null);
    resetForm(); // This already clears slno to empty string
    setShowModal(true);
  };

  return (
    <div className="products-container">
      <div className="products-header">
        <h1>Products</h1>
        <div className="header-actions">
          {hasPermission('products.create') && (
            <>
              <button className="btn-secondary" onClick={() => setShowExcelUpload(true)}>
                📥 Upload Excel
              </button>
              <button className="btn-primary" onClick={openAddModal}>
                + Add Product
              </button>
            </>
          )}
        </div>
      </div>

      <div className="search-bar">
        <input
          type="text"
          placeholder="Search products by title, SKU, EAN, brand, HSN code..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="loading">Loading products...</div>
      ) : (
        <div className="products-table-container">
          <table className="products-table">
            <thead>
              <tr>
                <th>Title/Name</th>
                <th>SKU</th>
                <th>Brand</th>
                <th>Category</th>
                <th>Sub-Category</th>
                <th>EAN</th>
                <th>Sales Price</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td colSpan="8" className="no-data">
                    No products found
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <tr key={product._id}>
                    <td>{product.title || '-'}</td>
                    <td>{product.sku || '-'}</td>
                    <td>{product.brandName || '-'}</td>
                    <td>{product.category?.name || product.category || '-'}</td>
                    <td>{product.subCategory?.name || product.subCategory || '-'}</td>
                    <td>{product.ean || '-'}</td>
                    <td>
                      {productPrices[product._id] 
                        ? `₹${productPrices[product._id].salesPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : '-'
                      }
                    </td>
                    <td>
                      {(hasPermission('products.update') || hasPermission('products.delete')) && (
                        <div className="action-buttons">
                          {hasPermission('products.update') && (
                            <button
                              className="btn-edit"
                              onClick={() => handleEdit(product)}
                            >
                              Edit
                            </button>
                          )}
                          {hasPermission('products.delete') && (
                            <button
                              className="btn-delete"
                              onClick={() => handleDelete(product._id)}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          
          {pagination.totalPages > 1 && (
            <Pagination
              currentPage={pagination.page}
              totalPages={pagination.totalPages}
              totalItems={pagination.total}
              itemsPerPage={pagination.limit}
              onPageChange={handlePageChange}
              onItemsPerPageChange={handleItemsPerPageChange}
            />
          )}
        </div>
      )}

      {showExcelUpload && (
        <ExcelUpload
          moduleName="products"
          templateEndpoint="/products/template"
          onUploadComplete={handleExcelUploadComplete}
          onClose={() => setShowExcelUpload(false)}
        />
      )}

      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div
            className="modal-content large-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>{editingProduct ? 'Edit Product' : 'Add Product'}</h2>
            <form onSubmit={handleSubmit} className="product-form">
              {/* Basic Information Section */}
              <div className="form-section">
                <h3>Basic Information</h3>
                <div className="form-row">
                  <div className="form-group">
                    <label>Serial Number</label>
                    <input
                      type="number"
                      name="slno"
                      value={formData.slno}
                      onChange={handleInputChange}
                      disabled={!editingProduct}
                      placeholder={!editingProduct ? "Auto-generated" : ""}
                      readOnly={!!editingProduct}
                    />
                  </div>
                  <div className="form-group">
                    <label>Variation</label>
                    <select
                      name="variation"
                      value={formData.variation}
                      onChange={handleInputChange}
                    >
                      <option value="">Select...</option>
                      <option value="YES">YES</option>
                      <option value="NO">NO</option>
                    </select>
                  </div>
                  {formData.variation === 'YES' && (
                    <div className="form-group">
                      <label>Parent SKU or ASIN *</label>
                      <input
                        type="text"
                        name="parentSkuOrAsin"
                        value={formData.parentSkuOrAsin}
                        onChange={handleInputChange}
                        required={formData.variation === 'YES'}
                      />
                    </div>
                  )}
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>SKU *</label>
                    <input
                      type="text"
                      name="sku"
                      value={formData.sku}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>EAN</label>
                    <input
                      type="text"
                      name="ean"
                      value={formData.ean}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div className="form-group">
                    <label>Title *</label>
                    <input
                      type="text"
                      name="title"
                      value={formData.title}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Brand Name *</label>
                    <input
                      type="text"
                      name="brandName"
                      value={formData.brandName}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Classification & Codes Section */}
              <div className="form-section">
                <h3>Classification & Codes</h3>
                <div className="form-row">
                  <div className="form-group">
                    <label>Category *</label>
                    <select
                      name="category"
                      value={formData.category}
                      required
                      onChange={(e) => {
                        handleInputChange(e);
                        // Clear subcategory when category changes
                        setFormData((prev) => ({ ...prev, subCategory: '' }));
                      }}
                    >
                      <option value="">Select Category</option>
                      {categories.map((cat) => (
                        <option key={cat._id} value={cat._id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Sub-Category *</label>
                    <select
                      name="subCategory"
                      value={formData.subCategory}
                      onChange={handleInputChange}
                      disabled={!formData.category}
                      required
                    >
                      <option value="">Select Sub-Category</option>
                      {subcategories.map((subcat) => (
                        <option key={subcat._id} value={subcat._id}>
                          {subcat.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>HSN Code</label>
                    <input
                      type="text"
                      name="hsnCode"
                      value={formData.category ? categories.find(c => c._id === formData.category)?.hsnCode || '' : formData.hsnCode}
                      readOnly
                      style={{ background: '#f5f5f5', cursor: 'not-allowed' }}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Manufacturer Name *</label>
                    <input
                      type="text"
                      name="manufacturerName"
                      value={formData.manufacturerName}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Contact Details *</label>
                    <input
                      type="text"
                      name="contactDetails"
                      value={formData.contactDetails}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Product Details Section */}
              <div className="form-section">
                <h3>Product Details</h3>
                <div className="form-row">
                  <div className="form-group">
                    <label>Colour *</label>
                    <input
                      type="text"
                      name="colour"
                      value={formData.colour}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Material *</label>
                    <input
                      type="text"
                      name="material"
                      value={formData.material}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Size *</label>
                    <input
                      type="text"
                      name="size"
                      value={formData.size}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Shape</label>
                    <input
                      type="text"
                      name="shape"
                      value={formData.shape}
                      onChange={handleInputChange}
                    />
                  </div>
                  <div className="form-group">
                    <label>Weight (grams/kg) *</label>
                    <input
                      type="number"
                      step="0.01"
                      name="weight"
                      value={formData.weight}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Special Feature</label>
                    <input
                      type="text"
                      name="specialFeature"
                      value={formData.specialFeature}
                      onChange={handleInputChange}
                    />
                  </div>
                </div>
              </div>

              {/* Dimensions Section */}
              <div className="form-section">
                <h3>Dimensions (in cm)</h3>
                <div className="form-row">
                  <div className="form-group">
                    <label>Product Length (cm) *</label>
                    <input
                      type="number"
                      step="0.01"
                      name="productDimensionCm.length"
                      value={formData.productDimensionCm.length}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Product Width (cm) *</label>
                    <input
                      type="number"
                      step="0.01"
                      name="productDimensionCm.width"
                      value={formData.productDimensionCm.width}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Product Height (cm) *</label>
                    <input
                      type="number"
                      step="0.01"
                      name="productDimensionCm.height"
                      value={formData.productDimensionCm.height}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Package Length (cm) *</label>
                    <input
                      type="number"
                      step="0.01"
                      name="packageDimensionCm.length"
                      value={formData.packageDimensionCm.length}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Package Width (cm) *</label>
                    <input
                      type="number"
                      step="0.01"
                      name="packageDimensionCm.width"
                      value={formData.packageDimensionCm.width}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Package Height (cm) *</label>
                    <input
                      type="number"
                      step="0.01"
                      name="packageDimensionCm.height"
                      value={formData.packageDimensionCm.height}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Marketing Section */}
              <div className="form-section">
                <h3>Marketing - Bullet Points</h3>
                {formData.bulletPoints.map((bullet, index) => (
                  <div key={index} className="form-group">
                    <label>Bullet Point {index + 1}</label>
                    <input
                      type="text"
                      name={`bulletPoint${index + 1}`}
                      value={bullet}
                      onChange={handleInputChange}
                    />
                  </div>
                ))}
              </div>

              {/* Media Section */}
              <div className="form-section">
                <h3>Images * (at least one required)</h3>
                
                {/* File Upload */}
                <div className="form-group">
                  <label>Upload Images</label>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageFileSelect}
                    style={{ marginBottom: '10px' }}
                  />
                  <small>Supported formats: JPG, JPEG, PNG, GIF, WEBP (Max 5MB per image)</small>
                </div>
                
                {/* Image Previews */}
                {(imagePreviews.length > 0 || formData.images.some(img => img.trim() !== '')) && (
                  <div className="image-preview-container" style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', 
                    gap: '15px',
                    marginBottom: '20px'
                  }}>
                    {/* Preview uploaded files (not yet saved) */}
                    {imagePreviews.map((preview, index) => {
                      if (preview.type === 'file') {
                        return (
                          <div key={`file-${index}`} style={{ position: 'relative' }}>
                            <img
                              src={preview.preview}
                              alt={`Preview ${index + 1}`}
                              style={{
                                width: '100%',
                                height: '150px',
                                objectFit: 'cover',
                                border: '1px solid #ddd',
                                borderRadius: '4px'
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveImage(index, 'file')}
                              className="btn-remove"
                              style={{
                                position: 'absolute',
                                top: '5px',
                                right: '5px',
                                background: 'red',
                                color: 'white',
                                border: 'none',
                                borderRadius: '50%',
                                width: '25px',
                                height: '25px',
                                cursor: 'pointer'
                              }}
                            >
                              ×
                            </button>
                            <div style={{ fontSize: '12px', marginTop: '5px', wordBreak: 'break-word' }}>
                              {preview.file.name}
                            </div>
                          </div>
                        );
                      } else {
                        // Existing uploaded images or URL images
                        return (
                          <div key={`existing-${index}`} style={{ position: 'relative' }}>
                            <img
                              src={preview.url}
                              alt={`Image ${index + 1}`}
                              style={{
                                width: '100%',
                                height: '150px',
                                objectFit: 'cover',
                                border: '1px solid #ddd',
                                borderRadius: '4px'
                              }}
                              onError={(e) => {
                                e.target.style.display = 'none';
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                // Find and remove from formData.images
                                const imageIndex = formData.images.findIndex(img => {
                                  if (preview.type === 'uploaded') {
                                    return img.includes(preview.url.split('/').pop()) || img === preview.url.replace(/.*\/uploads\//, '');
                                  } else {
                                    return img === preview.url;
                                  }
                                });
                                if (imageIndex !== -1) {
                                  handleRemoveImage(imageIndex, 'url');
                                  // Also remove from previews
                                  setImagePreviews((prev) => prev.filter((_, i) => i !== index));
                                }
                              }}
                              className="btn-remove"
                              style={{
                                position: 'absolute',
                                top: '5px',
                                right: '5px',
                                background: 'red',
                                color: 'white',
                                border: 'none',
                                borderRadius: '50%',
                                width: '25px',
                                height: '25px',
                                cursor: 'pointer'
                              }}
                            >
                              ×
                            </button>
                          </div>
                        );
                      }
                    })}
                    
                    {/* Show URL images that aren't in previews yet (newly added URLs) */}
                    {formData.images.map((image, index) => {
                      if (image.trim() === '') return null;
                      // Check if this URL is already in previews
                      const isInPreviews = imagePreviews.some(p => {
                        if (p.type === 'url') {
                          return p.url === image;
                        }
                        return false;
                      });
                      if (isInPreviews) return null;
                      
                      return (
                        <div key={`url-${index}`} style={{ position: 'relative' }}>
                          <img
                            src={image}
                            alt={`URL Image ${index + 1}`}
                            style={{
                              width: '100%',
                              height: '150px',
                              objectFit: 'cover',
                              border: '1px solid #ddd',
                              borderRadius: '4px'
                            }}
                            onError={(e) => {
                              e.target.style.display = 'none';
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveImage(index, 'url')}
                            className="btn-remove"
                            style={{
                              position: 'absolute',
                              top: '5px',
                              right: '5px',
                              background: 'red',
                              color: 'white',
                              border: 'none',
                              borderRadius: '50%',
                              width: '25px',
                              height: '25px',
                              cursor: 'pointer'
                            }}
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                
                {/* URL Inputs */}
                <div className="form-group">
                  <label>Or Add Image URLs</label>
                  {formData.images.map((image, index) => (
                    <div key={index} className="form-group image-input-group" style={{ marginBottom: '10px' }}>
                      <input
                        type="url"
                        name={`image${index + 1}`}
                        value={image}
                        onChange={handleInputChange}
                        placeholder="Image URL"
                        style={{ flex: 1 }}
                      />
                      {formData.images.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(index, 'url')}
                          className="btn-remove"
                          style={{ marginLeft: '10px' }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={handleAddImage}
                    className="btn-add-image"
                  >
                    + Add Image URL
                  </button>
                </div>
              </div>

              {/* Description */}
              <div className="form-section">
                <h3>Description</h3>
                <div className="form-group">
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    rows="4"
                  />
                </div>
              </div>

              {/* Keywords Section */}
              <div className="form-section">
                <h3>Keywords</h3>
                <div className="form-group">
                  <label>Add Keywords</label>
                  {/* Display existing keywords as tags */}
                  {formData.keywords.length > 0 && (
                    <div className="keywords-tags" style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '8px',
                      marginBottom: '10px',
                      padding: '8px',
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                      minHeight: '40px'
                    }}>
                      {formData.keywords.map((keyword, index) => (
                        <span
                          key={index}
                          className="keyword-tag"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '4px 8px',
                            background: '#f3e8ff',
                            color: '#6B3894',
                            borderRadius: '16px',
                            fontSize: '0.875rem',
                            gap: '6px'
                          }}
                        >
                          {keyword}
                          <button
                            type="button"
                            onClick={() => handleKeywordRemove(index)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#6B3894',
                              cursor: 'pointer',
                              padding: '0',
                              marginLeft: '4px',
                              fontSize: '16px',
                              lineHeight: '1',
                              fontWeight: 'bold'
                            }}
                            onMouseOver={(e) => e.target.style.color = '#d32f2f'}
                            onMouseOut={(e) => e.target.style.color = '#6B3894'}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  {/* Input field for adding new keywords */}
                  <input
                    type="text"
                    value={keywordInput}
                    onChange={handleKeywordInputChange}
                    onKeyDown={handleKeywordKeyDown}
                    onBlur={handleKeywordAdd}
                    placeholder="Type keyword and press Enter or Tab to add"
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #ddd',
                      borderRadius: '6px',
                      fontSize: '1rem'
                    }}
                  />
                  <small style={{ color: '#666', fontSize: '0.875rem', marginTop: '4px', display: 'block' }}>
                    Press Enter or Tab to add keyword. Click × to remove.
                  </small>
                </div>
              </div>

              {/* Unit Section */}
              <div className="form-section">
                <h3>Unit</h3>
                <div className="form-row">
                  <div className="form-group">
                    <label>Unit *</label>
                    <select
                      name="unit"
                      value={formData.unit}
                      onChange={handleInputChange}
                      required
                    >
                      <option value="">Select unit...</option>
                      {units.map((unit) => (
                        <option key={unit._id} value={unit.name}>
                          {unit.name}{unit.code ? ` (${unit.code})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="form-actions">
                <button type="button" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  {editingProduct ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Products;
