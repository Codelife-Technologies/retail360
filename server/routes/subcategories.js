const express = require('express');
const router = express.Router();
const Subcategory = require('../models/Subcategory');
const Category = require('../models/Category');
const Product = require('../models/Product');
const logger = require('../utils/logger');
const { paginate } = require('../utils/pagination');
const { requirePermission } = require('../middleware/auth');

// GET all subcategories (with pagination and optional category filter)
router.get('/', requirePermission('subcategories.view'), async (req, res) => {
  try {
    const { search, category, page, limit } = req.query;
    const query = {};
    
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }
    
    if (category) {
      query.category = category;
    }
    
    if (page || limit) {
      const result = await paginate(Subcategory, query, {
        page: page || 1,
        limit: limit || 25,
        sort: { name: 1 },
        populate: { path: 'category', select: 'name hsnCode' }
      });
      res.json(result);
    } else {
      const subcategories = await Subcategory.find(query)
        .populate('category', 'name hsnCode')
        .sort({ name: 1 });
      res.json(subcategories);
    }
  } catch (error) {
    logger.backend.error('Error fetching subcategories', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// GET image generation prompts for a subcategory (must be before /:id route)
router.get('/:id/image-prompts', requirePermission('subcategories.view'), async (req, res) => {
  try {
    logger.backend.info('GET image-prompts route hit', { id: req.params.id, url: req.url });
    const subcategory = await Subcategory.findById(req.params.id);
    if (!subcategory) {
      logger.backend.warn('Subcategory not found for image-prompts', { id: req.params.id });
      return res.status(404).json({ error: 'Subcategory not found' });
    }
    
    logger.backend.info('Image prompts fetched successfully', { 
      subcategoryId: subcategory._id, 
      promptCount: (subcategory.imageGenerationPrompts || []).length 
    });
    res.json({ prompts: subcategory.imageGenerationPrompts || [] });
  } catch (error) {
    logger.backend.error('Error fetching image prompts', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// GET single subcategory (must be after more specific routes)
router.get('/:id', requirePermission('subcategories.view'), async (req, res) => {
  try {
    const subcategory = await Subcategory.findById(req.params.id)
      .populate('category', 'name hsnCode');
    if (!subcategory) {
      return res.status(404).json({ error: 'Subcategory not found' });
    }
    res.json(subcategory);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create subcategory
router.post('/', requirePermission('subcategories.create'), async (req, res) => {
  try {
    // Validate category exists
    const category = await Category.findById(req.body.category);
    if (!category) {
      return res.status(400).json({ error: 'Category not found' });
    }
    
    logger.backend.info('Creating subcategory', { body: req.body });
    const subcategory = new Subcategory(req.body);
    await subcategory.save();
    
    const populatedSubcategory = await Subcategory.findById(subcategory._id)
      .populate('category', 'name hsnCode');
    
    logger.backend.info('Subcategory created successfully', { subcategoryId: subcategory._id });
    res.status(201).json(populatedSubcategory);
  } catch (error) {
    logger.backend.error('Error creating subcategory', {
      message: error.message,
      stack: error.stack,
      body: req.body,
      code: error.code
    });
    if (error.code === 11000) {
      res.status(400).json({ error: 'Subcategory with this name already exists in this category' });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});

// PUT update subcategory
router.put('/:id', requirePermission('subcategories.update'), async (req, res) => {
  try {
    // If category is being updated, validate it exists
    if (req.body.category) {
      const category = await Category.findById(req.body.category);
      if (!category) {
        return res.status(400).json({ error: 'Category not found' });
      }
    }
    
    const subcategory = await Subcategory.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('category', 'name hsnCode');
    
    if (!subcategory) {
      return res.status(404).json({ error: 'Subcategory not found' });
    }
    res.json(subcategory);
  } catch (error) {
    logger.backend.error('Error updating subcategory', { error: error.message });
    if (error.code === 11000) {
      res.status(400).json({ error: 'Subcategory with this name already exists in this category' });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});

// PUT update image generation prompts for a subcategory (must be before /:id route)
router.put('/:id/image-prompts', requirePermission('subcategories.update'), async (req, res) => {
  try {
    const subcategory = await Subcategory.findById(req.params.id);
    if (!subcategory) {
      return res.status(404).json({ error: 'Subcategory not found' });
    }
    
    const { prompts } = req.body;
    
    if (!Array.isArray(prompts)) {
      return res.status(400).json({ error: 'Prompts must be an array' });
    }
    
    // Validate prompts array
    if (prompts.length > 0 && (prompts.length < 6 || prompts.length > 10)) {
      return res.status(400).json({ error: 'Subcategory must have 6-10 image generation prompts' });
    }
    
    // Validate each prompt has required fields
    for (const prompt of prompts) {
      if (!prompt.prompt || !prompt.order) {
        return res.status(400).json({ error: 'Each prompt must have prompt and order fields' });
      }
    }
    
    // Validate orders are sequential
    if (prompts.length > 0) {
      const orders = prompts.map(p => p.order).sort((a, b) => a - b);
      for (let i = 0; i < orders.length; i++) {
        if (orders[i] !== i + 1) {
          return res.status(400).json({ error: 'Image generation prompt orders must be sequential starting from 1' });
        }
      }
    }
    
    subcategory.imageGenerationPrompts = prompts;
    await subcategory.save();
    
    logger.backend.info('Image prompts updated', { subcategoryId: subcategory._id, promptCount: prompts.length });
    res.json({ 
      message: 'Image generation prompts updated successfully',
      prompts: subcategory.imageGenerationPrompts 
    });
  } catch (error) {
    logger.backend.error('Error updating image prompts', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// POST add a single prompt to a subcategory
router.post('/:id/image-prompts', requirePermission('subcategories.update'), async (req, res) => {
  try {
    const subcategory = await Subcategory.findById(req.params.id);
    if (!subcategory) {
      return res.status(404).json({ error: 'Subcategory not found' });
    }
    
    const { prompt, order } = req.body;
    
    if (!prompt || !order) {
      return res.status(400).json({ error: 'Prompt and order are required' });
    }
    
    // Check if order already exists
    const existingOrder = subcategory.imageGenerationPrompts.find(p => p.order === order);
    if (existingOrder) {
      return res.status(400).json({ error: 'A prompt with this order already exists' });
    }
    
    // Validate total count
    if (subcategory.imageGenerationPrompts.length >= 10) {
      return res.status(400).json({ error: 'Maximum of 10 prompts allowed per subcategory' });
    }
    
    subcategory.imageGenerationPrompts.push({ prompt, order });
    await subcategory.save();
    
    logger.backend.info('Image prompt added', { subcategoryId: subcategory._id, type });
    res.json({ 
      message: 'Image generation prompt added successfully',
      prompt: subcategory.imageGenerationPrompts[subcategory.imageGenerationPrompts.length - 1]
    });
  } catch (error) {
    logger.backend.error('Error adding image prompt', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// DELETE a specific prompt from a subcategory (must be before /:id route)
router.delete('/:id/image-prompts/:promptId', requirePermission('subcategories.update'), async (req, res) => {
  try {
    const subcategory = await Subcategory.findById(req.params.id);
    if (!subcategory) {
      return res.status(404).json({ error: 'Subcategory not found' });
    }
    
    const promptId = req.params.promptId;
    const promptIndex = subcategory.imageGenerationPrompts.findIndex(p => p._id.toString() === promptId);
    
    if (promptIndex === -1) {
      return res.status(404).json({ error: 'Prompt not found' });
    }
    
    subcategory.imageGenerationPrompts.splice(promptIndex, 1);
    await subcategory.save();
    
    logger.backend.info('Image prompt deleted', { subcategoryId: subcategory._id, promptId });
    res.json({ message: 'Image generation prompt deleted successfully' });
  } catch (error) {
    logger.backend.error('Error deleting image prompt', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// DELETE subcategory (must be after more specific routes)
router.delete('/:id', requirePermission('subcategories.delete'), async (req, res) => {
  try {
    const subcategory = await Subcategory.findById(req.params.id);
    if (!subcategory) {
      return res.status(404).json({ error: 'Subcategory not found' });
    }
    
    // Check if subcategory is used by products
    const productCount = await Product.countDocuments({ subCategory: req.params.id });
    if (productCount > 0) {
      return res.status(400).json({ 
        error: `Cannot delete subcategory. It is used by ${productCount} product(s).` 
      });
    }
    
    await Subcategory.findByIdAndDelete(req.params.id);
    res.json({ message: 'Subcategory deleted successfully' });
  } catch (error) {
    logger.backend.error('Error deleting subcategory', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

