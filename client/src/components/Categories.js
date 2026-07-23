import React, { useState, useEffect } from 'react';
import { categoriesAPI, subcategoriesAPI } from '../services/api';
import DetailModal from './DetailModal';
import './Categories.css';

function Categories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [viewingCategory, setViewingCategory] = useState(null);
  const [subcategoryCounts, setSubcategoryCounts] = useState({});
  const [formData, setFormData] = useState({
    name: '',
    hsnCode: '',
    gstRate: 0,
    description: '',
  });

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      fetchCategories();
    }, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchTerm]);

  useEffect(() => {
    // Fetch subcategory counts for each category
    const fetchSubcategoryCounts = async () => {
      const counts = {};
      for (const category of categories) {
        try {
          const response = await categoriesAPI.getSubcategories(category._id);
          counts[category._id] = response.data.length;
        } catch (error) {
          counts[category._id] = 0;
        }
      }
      setSubcategoryCounts(counts);
    };
    if (categories.length > 0) {
      fetchSubcategoryCounts();
    }
  }, [categories]);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const response = await categoriesAPI.getAll({ search: searchTerm });
      setCategories(response.data);
    } catch (error) {
      console.error('Error fetching categories:', error);
      alert('Failed to fetch categories');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'gstRate' ? parseFloat(value) || 0 : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingCategory) {
        await categoriesAPI.update(editingCategory._id, formData);
      } else {
        await categoriesAPI.create(formData);
      }
      setShowModal(false);
      setEditingCategory(null);
      resetForm();
      fetchCategories();
    } catch (error) {
      console.error('Error saving category:', error);
      alert(error.response?.data?.error || 'Failed to save category');
    }
  };

  const handleEdit = (category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name || '',
      hsnCode: category.hsnCode || '',
      gstRate: category.gstRate ?? 0,
      description: category.description || '',
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this category?')) {
      return;
    }
    try {
      await categoriesAPI.delete(id);
      fetchCategories();
    } catch (error) {
      console.error('Error deleting category:', error);
      alert(error.response?.data?.error || 'Failed to delete category');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      hsnCode: '',
      gstRate: 0,
      description: '',
    });
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingCategory(null);
    resetForm();
  };

  const openAddModal = () => {
    setEditingCategory(null);
    resetForm();
    setShowModal(true);
  };

  return (
    <div className="categories-container">
      <div className="categories-header">
        <h1>Categories</h1>
        <button className="btn-primary" onClick={openAddModal}>
          + Add Category
        </button>
      </div>

      <div className="search-bar">
        <input
          type="text"
          placeholder="Search categories by name or HSN code..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="loading">Loading categories...</div>
      ) : (
        <div className="categories-table-container">
          <table className="categories-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>HSN Code</th>
                <th>GST %</th>
                <th>Description</th>
                <th>Subcategories</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.length === 0 ? (
                <tr>
                  <td colSpan="6" className="no-data">
                    No categories found
                  </td>
                </tr>
              ) : (
                categories.map((category) => (
                  <tr
                    key={category._id}
                    className="clickable-row"
                    onClick={() => setViewingCategory(category)}
                  >
                    <td>{category.name}</td>
                    <td>{category.hsnCode}</td>
                    <td>{category.gstRate != null ? `${category.gstRate}%` : '0%'}</td>
                    <td>{category.description || '-'}</td>
                    <td>{subcategoryCounts[category._id] || 0}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button
                        className="btn-edit"
                        onClick={() => handleEdit(category)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn-delete"
                        onClick={() => handleDelete(category._id)}
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

      {viewingCategory && (
        <DetailModal
          title={viewingCategory.name || 'Category Details'}
          fields={[
            { label: 'Name', value: viewingCategory.name },
            { label: 'HSN Code', value: viewingCategory.hsnCode },
            { label: 'GST %', value: `${viewingCategory.gstRate ?? 0}%` },
            { label: 'Subcategories', value: subcategoryCounts[viewingCategory._id] || 0 },
            { label: 'Description', value: viewingCategory.description, full: true },
          ]}
          onClose={() => setViewingCategory(null)}
          onEdit={() => {
            const category = viewingCategory;
            setViewingCategory(null);
            handleEdit(category);
          }}
          onDelete={() => {
            const id = viewingCategory._id;
            setViewingCategory(null);
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
            <h2>{editingCategory ? 'Edit Category' : 'Add Category'}</h2>
            <form onSubmit={handleSubmit} className="category-form">
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
                <label>HSN Code *</label>
                <input
                  type="text"
                  name="hsnCode"
                  value={formData.hsnCode}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="form-group">
                <label>GST Rate (%) *</label>
                <input
                  type="number"
                  name="gstRate"
                  value={formData.gstRate}
                  onChange={handleInputChange}
                  min="0"
                  max="100"
                  step="0.01"
                  required
                />
                <small className="form-hint">Applied on Purchase Orders by this HSN / category.</small>
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
                  {editingCategory ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Categories;

