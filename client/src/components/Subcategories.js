import React, { useState, useEffect } from 'react';
import { subcategoriesAPI, categoriesAPI, productsAPI } from '../services/api';
import DetailModal from './DetailModal';
import './Subcategories.css';

function Subcategories() {
  const [subcategories, setSubcategories] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingSubcategory, setEditingSubcategory] = useState(null);
  const [viewingSubcategory, setViewingSubcategory] = useState(null);
  const [productCounts, setProductCounts] = useState({});
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    description: '',
  });

  useEffect(() => {
    fetchCategories();
    fetchSubcategories();
  }, []);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      fetchSubcategories();
    }, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchTerm, selectedCategory]);

  useEffect(() => {
    // Fetch product counts for each subcategory
    const fetchProductCounts = async () => {
      const counts = {};
      for (const subcategory of subcategories) {
        try {
          const response = await productsAPI.getAll({ subCategory: subcategory._id, limit: 1 });
          counts[subcategory._id] = response.data.pagination?.total || 0;
        } catch (error) {
          counts[subcategory._id] = 0;
        }
      }
      setProductCounts(counts);
    };
    if (subcategories.length > 0) {
      fetchProductCounts();
    }
  }, [subcategories]);

  const fetchCategories = async () => {
    try {
      const response = await categoriesAPI.getAll();
      setCategories(response.data);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const fetchSubcategories = async () => {
    try {
      setLoading(true);
      const params = {};
      if (searchTerm) {
        params.search = searchTerm;
      }
      if (selectedCategory) {
        params.category = selectedCategory;
      }
      const response = await subcategoriesAPI.getAll(params);
      setSubcategories(response.data);
    } catch (error) {
      console.error('Error fetching subcategories:', error);
      alert('Failed to fetch subcategories');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingSubcategory) {
        await subcategoriesAPI.update(editingSubcategory._id, formData);
      } else {
        await subcategoriesAPI.create(formData);
      }
      setShowModal(false);
      setEditingSubcategory(null);
      resetForm();
      fetchSubcategories();
    } catch (error) {
      console.error('Error saving subcategory:', error);
      alert(error.response?.data?.error || 'Failed to save subcategory');
    }
  };

  const handleEdit = (subcategory) => {
    setEditingSubcategory(subcategory);
    setFormData({
      name: subcategory.name || '',
      category: subcategory.category?._id || subcategory.category || '',
      description: subcategory.description || '',
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this subcategory?')) {
      return;
    }
    try {
      await subcategoriesAPI.delete(id);
      fetchSubcategories();
    } catch (error) {
      console.error('Error deleting subcategory:', error);
      alert(error.response?.data?.error || 'Failed to delete subcategory');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      category: '',
      description: '',
    });
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingSubcategory(null);
    resetForm();
  };

  const openAddModal = () => {
    setEditingSubcategory(null);
    resetForm();
    setShowModal(true);
  };

  return (
    <div className="subcategories-container">
      <div className="subcategories-header">
        <h1>Subcategories</h1>
        <button className="btn-primary" onClick={openAddModal}>
          + Add Subcategory
        </button>
      </div>

      <div className="filters-bar">
        <input
          type="text"
          placeholder="Search subcategories..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ flex: 1, marginRight: '10px' }}
        />
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          style={{ minWidth: '200px' }}
        >
          <option value="">All Categories</option>
          {categories.map((category) => (
            <option key={category._id} value={category._id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="loading">Loading subcategories...</div>
      ) : (
        <div className="subcategories-table-container">
          <table className="subcategories-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>HSN Code</th>
                <th>Description</th>
                <th>Products</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {subcategories.length === 0 ? (
                <tr>
                  <td colSpan="6" className="no-data">
                    No subcategories found
                  </td>
                </tr>
              ) : (
                subcategories.map((subcategory) => (
                  <tr
                    key={subcategory._id}
                    className="clickable-row"
                    onClick={() => setViewingSubcategory(subcategory)}
                  >
                    <td>{subcategory.name}</td>
                    <td>{subcategory.category?.name || '-'}</td>
                    <td>{subcategory.category?.hsnCode || '-'}</td>
                    <td>{subcategory.description || '-'}</td>
                    <td>{productCounts[subcategory._id] || 0}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button
                        className="btn-edit"
                        onClick={() => handleEdit(subcategory)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn-delete"
                        onClick={() => handleDelete(subcategory._id)}
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

      {viewingSubcategory && (
        <DetailModal
          title={viewingSubcategory.name || 'Subcategory Details'}
          fields={[
            { label: 'Name', value: viewingSubcategory.name },
            { label: 'Category', value: viewingSubcategory.category?.name },
            { label: 'HSN Code', value: viewingSubcategory.category?.hsnCode },
            { label: 'Products', value: productCounts[viewingSubcategory._id] || 0 },
            { label: 'Description', value: viewingSubcategory.description, full: true },
          ]}
          onClose={() => setViewingSubcategory(null)}
          onEdit={() => {
            const subcategory = viewingSubcategory;
            setViewingSubcategory(null);
            handleEdit(subcategory);
          }}
          onDelete={() => {
            const id = viewingSubcategory._id;
            setViewingSubcategory(null);
            handleDelete(id);
          }}
        />
      )}

      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>{editingSubcategory ? 'Edit Subcategory' : 'Add Subcategory'}</h2>
            <form onSubmit={handleSubmit} className="subcategory-form">
              <div className="form-group">
                <label>Name *</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="form-group">
                <label>Category *</label>
                <select
                  name="category"
                  value={formData.category}
                  onChange={handleInputChange}
                  required
                >
                  <option value="">Select Category</option>
                  {categories.map((category) => (
                    <option key={category._id} value={category._id}>
                      {category.name} ({category.hsnCode})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  rows="3"
                />
              </div>
              <div className="form-actions">
                <button type="button" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  {editingSubcategory ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Subcategories;

