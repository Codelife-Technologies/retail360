const express = require('express');
const router = express.Router();
const Category = require('../models/Category');
const Subcategory = require('../models/Subcategory');
const Product = require('../models/Product');
const logger = require('../utils/logger');
const { paginate } = require('../utils/pagination');
const { requirePermission } = require('../middleware/auth');

// GET all categories (with pagination)
router.get('/', requirePermission('categories.view'), async (req, res) => {
  try {
    const { search, page, limit } = req.query;
    const query = {};
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { hsnCode: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (page || limit) {
      const result = await paginate(Category, query, {
        page: page || 1,
        limit: limit || 25,
        sort: { name: 1 }
      });
      res.json(result);
    } else {
      const categories = await Category.find(query).sort({ name: 1 });
      res.json(categories);
    }
  } catch (error) {
    logger.backend.error('Error fetching categories', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// GET subcategories for a category (must come before /:id route)
router.get('/:id/subcategories', requirePermission('categories.view'), async (req, res) => {
  try {
    const subcategories = await Subcategory.find({ category: req.params.id }).sort({ name: 1 });
    res.json(subcategories);
  } catch (error) {
    logger.backend.error('Error fetching subcategories for category', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// GET single category
router.get('/:id', requirePermission('categories.view'), async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json(category);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create category
router.post('/', requirePermission('categories.create'), async (req, res) => {
  try {
    logger.backend.info('Creating category', { body: req.body });
    const category = new Category(req.body);
    await category.save();
    logger.backend.info('Category created successfully', { categoryId: category._id });
    res.status(201).json(category);
  } catch (error) {
    logger.backend.error('Error creating category', {
      message: error.message,
      stack: error.stack,
      body: req.body,
      code: error.code
    });
    if (error.code === 11000) {
      const field = error.keyPattern.name ? 'name' : 'hsnCode';
      res.status(400).json({ error: `Category ${field} already exists` });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});

// PUT update category
router.put('/:id', requirePermission('categories.update'), async (req, res) => {
  try {
    const category = await Category.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json(category);
  } catch (error) {
    logger.backend.error('Error updating category', { error: error.message });
    if (error.code === 11000) {
      const field = error.keyPattern.name ? 'name' : 'hsnCode';
      res.status(400).json({ error: `Category ${field} already exists` });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});

// DELETE category
router.delete('/:id', requirePermission('categories.delete'), async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    // Check if category has subcategories
    const subcategoryCount = await Subcategory.countDocuments({ category: req.params.id });
    if (subcategoryCount > 0) {
      return res.status(400).json({ 
        error: `Cannot delete category. It has ${subcategoryCount} subcategory(ies) associated with it.` 
      });
    }
    
    // Check if category is used by products
    const productCount = await Product.countDocuments({ category: req.params.id });
    if (productCount > 0) {
      return res.status(400).json({ 
        error: `Cannot delete category. It is used by ${productCount} product(s).` 
      });
    }
    
    await Category.findByIdAndDelete(req.params.id);
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    logger.backend.error('Error deleting category', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

