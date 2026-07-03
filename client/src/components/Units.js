import React, { useState, useEffect } from 'react';
import { unitsAPI } from '../services/api';
import './Units.css';

function Units() {
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingUnit, setEditingUnit] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
  });

  useEffect(() => {
    fetchUnits();
  }, []);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      fetchUnits();
    }, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchTerm]);

  const fetchUnits = async () => {
    try {
      setLoading(true);
      const response = await unitsAPI.getAll({ search: searchTerm });
      setUnits(response.data);
    } catch (error) {
      console.error('Error fetching units:', error);
      alert('Failed to fetch units');
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
      if (editingUnit) {
        await unitsAPI.update(editingUnit._id, formData);
      } else {
        await unitsAPI.create(formData);
      }
      setShowModal(false);
      setEditingUnit(null);
      resetForm();
      fetchUnits();
    } catch (error) {
      console.error('Error saving unit:', error);
      alert(error.response?.data?.error || 'Failed to save unit');
    }
  };

  const handleEdit = (unit) => {
    setEditingUnit(unit);
    setFormData({
      name: unit.name || '',
      code: unit.code || '',
      description: unit.description || '',
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this unit?')) {
      return;
    }
    try {
      await unitsAPI.delete(id);
      fetchUnits();
    } catch (error) {
      console.error('Error deleting unit:', error);
      alert(error.response?.data?.error || 'Failed to delete unit');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      code: '',
      description: '',
    });
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingUnit(null);
    resetForm();
  };

  const openAddModal = () => {
    setEditingUnit(null);
    resetForm();
    setShowModal(true);
  };

  return (
    <div className="units-container">
      <div className="units-header">
        <h1>Unit Master</h1>
        <button className="btn-primary" onClick={openAddModal}>
          + Add Unit
        </button>
      </div>

      <div className="search-bar">
        <input
          type="text"
          placeholder="Search units by name or code..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="loading">Loading units...</div>
      ) : (
        <div className="units-table-container">
          <table className="units-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Code</th>
                <th>Description</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {units.length === 0 ? (
                <tr>
                  <td colSpan="4" className="no-data">
                    No units found
                  </td>
                </tr>
              ) : (
                units.map((unit) => (
                  <tr key={unit._id}>
                    <td>{unit.name}</td>
                    <td>{unit.code || '-'}</td>
                    <td>{unit.description || '-'}</td>
                    <td>
                      <button
                        className="btn-edit"
                        onClick={() => handleEdit(unit)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn-delete"
                        onClick={() => handleDelete(unit._id)}
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

      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>{editingUnit ? 'Edit Unit' : 'Add Unit'}</h2>
            <form onSubmit={handleSubmit} className="unit-form">
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
                <label>Code</label>
                <input
                  type="text"
                  name="code"
                  value={formData.code}
                  onChange={handleInputChange}
                  placeholder="e.g. PCS, KG"
                />
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
                  {editingUnit ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Units;
