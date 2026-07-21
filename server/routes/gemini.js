const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const Subcategory = require('../models/Subcategory');
const Product = require('../models/Product');
const logger = require('../utils/logger');
const { 
  generateMultipleImages: generateMultipleImagesGemini, 
  generateSingleImage: generateSingleImageGemini, 
  saveGeneratedImage: saveGeneratedImageGemini 
} = require('../utils/geminiImageGenerator');
const { requirePermission } = require('../middleware/auth');
// Lazy-load openaiImageGenerator to avoid blocking server startup if OpenAI package has dependency issues
let openaiImageGenerator = null;
function getOpenAIImageGenerator() {
  if (!openaiImageGenerator) {
    try {
      openaiImageGenerator = require('../utils/openaiImageGenerator');
    } catch (err) {
      logger.backend.error('OpenAI image generator not available', { error: err.message });
      throw new Error('OpenAI image generation is not available. The OpenAI package may need to be reinstalled: npm install openai');
    }
  }
  return openaiImageGenerator;
}

// Configure multer for temporary file storage
const upload = multer({
  dest: path.join(__dirname, '..', 'uploads', 'temp'),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images (jpg, jpeg, png, gif, webp) are allowed.'));
    }
  }
});

// Ensure directory exists
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// Helper function to get the appropriate generator functions based on provider
function getGeneratorFunctions(provider) {
  const normalizedProvider = (provider || 'gemini').toLowerCase();
  
  if (normalizedProvider === 'openai' || normalizedProvider === 'dall-e' || normalizedProvider === 'chatgpt') {
    const {
      generateMultipleImages: generateMultipleImagesOpenAI,
      generateSingleImage: generateSingleImageOpenAI,
      saveGeneratedImage: saveGeneratedImageOpenAI
    } = getOpenAIImageGenerator();
    return {
      generateSingleImage: generateSingleImageOpenAI,
      generateMultipleImages: generateMultipleImagesOpenAI,
      saveGeneratedImage: saveGeneratedImageOpenAI,
      uploadDir: 'openai-generated'
    };
  } else {
    // Default to Gemini
    return {
      generateSingleImage: generateSingleImageGemini,
      generateMultipleImages: generateMultipleImagesGemini,
      saveGeneratedImage: saveGeneratedImageGemini,
      uploadDir: 'gemini-generated'
    };
  }
}

// POST /api/gemini/regenerate-image
// Regenerate a single image using the same prompt (must be before /generate-images)
router.post('/regenerate-image', requirePermission('gemini.generate'), upload.single('image'), async (req, res) => {
  let tempImagePath = null;
  
  try {
    logger.backend.info('Regenerate image route hit', { url: req.url, body: req.body });
    
    // Validate input
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }
    
    const { subcategoryId, prompt, order, provider, model, size, quality } = req.body;
    
    if (!subcategoryId) {
      return res.status(400).json({ error: 'Subcategory ID is required' });
    }
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }
    
    if (!order) {
      return res.status(400).json({ error: 'Order is required' });
    }
    
    tempImagePath = req.file.path;
    
    // Validate subcategory exists
    const subcategory = await Subcategory.findById(subcategoryId);
    if (!subcategory) {
      return res.status(404).json({ error: 'Subcategory not found' });
    }
    
    // Get generator functions based on provider
    const generators = getGeneratorFunctions(provider);
    
    logger.backend.info('Regenerating single image', { 
      subcategoryId, 
      order,
      provider: provider || 'gemini',
      imagePath: tempImagePath 
    });
    
    // Generate single image with provider-specific options
    let result;
    if (provider && (provider.toLowerCase() === 'openai' || provider.toLowerCase() === 'dall-e' || provider.toLowerCase() === 'chatgpt')) {
      result = await generators.generateSingleImage(
        tempImagePath, 
        prompt, 
        model || 'dall-e-3', 
        size || '1024x1024', 
        quality || 'standard'
      );
    } else {
      result = await generators.generateSingleImage(tempImagePath, prompt);
    }
    
    if (!result.success || !result.imageData) {
      return res.status(500).json({ 
        error: 'Failed to generate image',
        message: result.note || 'Unknown error'
      });
    }
    
    // Create output directory for generated images
    const outputDir = path.join(__dirname, '..', 'uploads', generators.uploadDir, subcategoryId);
    ensureDirectoryExists(outputDir);
    
    // Create filename based on order and timestamp
    const timestamp = Date.now();
    const ext = result.mimeType === 'image/png' ? '.png' : '.jpg';
    const filename = `image_${timestamp}_${order}${ext}`;
    const outputPath = path.join(outputDir, filename);
    
    // Save the image
    generators.saveGeneratedImage(result.imageData, outputPath, `order_${order}`);
    
    // Create relative URL path
    const relativePath = `${generators.uploadDir}/${subcategoryId}/${filename}`;
    
    logger.backend.info('Image regenerated and saved', { 
      order,
      provider: provider || 'gemini',
      path: relativePath 
    });
    
    // Clean up temporary uploaded file
    if (tempImagePath && fs.existsSync(tempImagePath)) {
      fs.unlinkSync(tempImagePath);
    }
    
    res.json({
      success: true,
      image: {
        order: parseInt(order),
        prompt: prompt,
        url: `/uploads/${relativePath}`,
        path: relativePath,
        provider: provider || 'gemini'
      }
    });
    
  } catch (error) {
    // Clean up temporary file on error
    if (tempImagePath && fs.existsSync(tempImagePath)) {
      try {
        fs.unlinkSync(tempImagePath);
      } catch (cleanupError) {
        logger.backend.error('Error cleaning up temp file', { error: cleanupError.message });
      }
    }
    
    logger.backend.error('Error regenerating image', { 
      error: error.message, 
      stack: error.stack,
      subcategoryId: req.body.subcategoryId,
      order: req.body.order,
      provider: req.body.provider
    });
    
    res.status(500).json({ 
      error: 'Failed to regenerate image',
      message: error.message 
    });
  }
});

// POST /api/gemini/generate-images
// Generate 6-10 images based on uploaded image and subcategory prompts
router.post('/generate-images', requirePermission('gemini.generate'), upload.single('image'), async (req, res) => {
  let tempImagePath = null;
  
  try {
    // Validate input
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }
    
    const { subcategoryId, provider, model, size, quality } = req.body;
    if (!subcategoryId) {
      return res.status(400).json({ error: 'Subcategory ID is required' });
    }
    
    tempImagePath = req.file.path;
    
    // Fetch subcategory and validate prompts
    const subcategory = await Subcategory.findById(subcategoryId);
    if (!subcategory) {
      return res.status(404).json({ error: 'Subcategory not found' });
    }
    
    const prompts = subcategory.imageGenerationPrompts || [];
    if (prompts.length === 0) {
      return res.status(400).json({ 
        error: 'No image generation prompts found for this subcategory. Please configure prompts first.' 
      });
    }
    
    if (prompts.length < 6 || prompts.length > 10) {
      return res.status(400).json({ 
        error: `Subcategory must have 6-10 prompts. Currently has ${prompts.length} prompts.` 
      });
    }
    
    // Sort prompts by order
    const sortedPrompts = [...prompts].sort((a, b) => a.order - b.order);
    
    // Get generator functions based on provider
    const generators = getGeneratorFunctions(provider);
    
    logger.backend.info('Starting image generation', { 
      subcategoryId, 
      promptCount: sortedPrompts.length,
      provider: provider || 'gemini',
      imagePath: tempImagePath 
    });
    
    // Generate images using the appropriate utility
    let generationResults;
    if (provider && (provider.toLowerCase() === 'openai' || provider.toLowerCase() === 'dall-e' || provider.toLowerCase() === 'chatgpt')) {
      generationResults = await generators.generateMultipleImages(
        tempImagePath, 
        sortedPrompts, 
        model || 'dall-e-3', 
        size || '1024x1024', 
        quality || 'standard'
      );
    } else {
      generationResults = await generators.generateMultipleImages(tempImagePath, sortedPrompts);
    }
    
    // Create output directory for generated images
    const outputDir = path.join(__dirname, '..', 'uploads', generators.uploadDir, subcategoryId);
    ensureDirectoryExists(outputDir);
    
    // Save generated images and collect URLs
    const savedImages = [];
    const timestamp = Date.now();
    
    for (let i = 0; i < generationResults.length; i++) {
      const result = generationResults[i];
      
      if (result.success && result.data && result.data.imageData) {
        try {
          // Create filename based on order and timestamp
          const ext = result.data.mimeType === 'image/png' ? '.png' : '.jpg';
          const filename = `image_${timestamp}_${result.order}${ext}`;
          const outputPath = path.join(outputDir, filename);
          
          // Save the image
          generators.saveGeneratedImage(result.data.imageData, outputPath, `order_${result.order}`);
          
          // Create relative URL path
          const relativePath = `${generators.uploadDir}/${subcategoryId}/${filename}`;
          
          savedImages.push({
            order: result.order,
            prompt: result.prompt,
            url: `/uploads/${relativePath}`,
            path: relativePath,
            provider: provider || 'gemini'
          });
          
          logger.backend.info('Image generated and saved', { 
            order: result.order,
            provider: provider || 'gemini',
            path: relativePath 
          });
        } catch (saveError) {
          logger.backend.error('Error saving generated image', { 
            error: saveError.message,
            order: result.order 
          });
          savedImages.push({
            order: result.order,
            prompt: result.prompt,
            success: false,
            error: saveError.message
          });
        }
      } else {
        // Handle failed generation
        logger.backend.warn('Image generation failed for prompt', { 
          order: result.order,
          error: result.error 
        });
        savedImages.push({
          order: result.order,
          prompt: result.prompt,
          success: false,
          error: result.error || 'Unknown error'
        });
      }
    }
    
    // Clean up temporary uploaded file
    if (tempImagePath && fs.existsSync(tempImagePath)) {
      fs.unlinkSync(tempImagePath);
    }
    
    // Check if we have any successful generations
    const successfulImages = savedImages.filter(img => img.url);
    
    if (successfulImages.length === 0) {
      const providerName = provider || 'Gemini';
      return res.status(500).json({ 
        error: `Failed to generate any images. Please check your ${providerName} API configuration and prompts.`,
        details: savedImages
      });
    }
    
    logger.backend.info('Image generation completed', { 
      subcategoryId,
      provider: provider || 'gemini',
      total: savedImages.length,
      successful: successfulImages.length 
    });
    
    res.json({
      success: true,
      images: savedImages,
      provider: provider || 'gemini',
      message: `Successfully generated ${successfulImages.length} out of ${savedImages.length} images`
    });
    
  } catch (error) {
    // Clean up temporary file on error
    if (tempImagePath && fs.existsSync(tempImagePath)) {
      try {
        fs.unlinkSync(tempImagePath);
      } catch (cleanupError) {
        logger.backend.error('Error cleaning up temp file', { error: cleanupError.message });
      }
    }
    
    logger.backend.error('Error generating images', { 
      error: error.message, 
      stack: error.stack,
      subcategoryId: req.body.subcategoryId,
      provider: req.body.provider
    });
    
    res.status(500).json({ 
      error: 'Failed to generate images',
      message: error.message 
    });
  }
});

function sanitizeSkuForFolderName(sku) {
  if (!sku) return null;
  return String(sku).replace(/[<>:"/\\|?*]/g, '_').trim();
}

function resolveUploadAbsolutePath(imageUrlOrPath) {
  const raw = String(imageUrlOrPath || '').trim();
  if (!raw) return null;

  let relative = raw;
  try {
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      relative = new URL(raw).pathname;
    }
  } catch (_e) {
    // keep as-is
  }

  relative = relative.replace(/^\/+/, '');
  if (relative.startsWith('uploads/')) {
    relative = relative.slice('uploads/'.length);
  }

  // Only allow saving files already under the uploads directory
  const uploadsRoot = path.resolve(path.join(__dirname, '..', 'uploads'));
  const absolute = path.resolve(path.join(uploadsRoot, relative));
  if (!absolute.startsWith(uploadsRoot + path.sep) && absolute !== uploadsRoot) {
    return null;
  }
  return absolute;
}

// POST /api/gemini/save-to-product
// Copy selected generated images onto a product's image gallery
router.post('/save-to-product', requirePermission('gemini.generate'), async (req, res) => {
  try {
    const { productId, images } = req.body || {};

    if (!productId) {
      return res.status(400).json({ error: 'Product ID is required' });
    }
    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: 'At least one image is required' });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    if (!product.sku || !String(product.sku).trim()) {
      return res.status(400).json({ error: 'Selected product must have a SKU before images can be saved' });
    }

    const skuFolder = sanitizeSkuForFolderName(product.sku);
    const productDir = path.join(__dirname, '..', 'uploads', 'products', skuFolder);
    ensureDirectoryExists(productDir);

    const savedPaths = [];
    const errors = [];

    for (let i = 0; i < images.length; i += 1) {
      const entry = images[i];
      const sourceRef = typeof entry === 'string' ? entry : (entry?.url || entry?.path);
      const sourceAbs = resolveUploadAbsolutePath(sourceRef);

      if (!sourceAbs || !fs.existsSync(sourceAbs)) {
        errors.push({ index: i, error: 'Source image file not found', source: sourceRef });
        continue;
      }

      const ext = path.extname(sourceAbs) || '.jpg';
      const order = typeof entry === 'object' && entry?.order != null ? entry.order : i + 1;
      const filename = `gemini_${Date.now()}_${order}${ext}`;
      const destAbs = path.join(productDir, filename);
      const relativePath = `products/${skuFolder}/${filename}`;

      try {
        fs.copyFileSync(sourceAbs, destAbs);
        savedPaths.push(relativePath);
      } catch (copyErr) {
        errors.push({ index: i, error: copyErr.message, source: sourceRef });
      }
    }

    if (savedPaths.length === 0) {
      return res.status(400).json({
        error: 'Could not save any images to the product',
        details: errors,
      });
    }

    if (!Array.isArray(product.images)) {
      product.images = [];
    }
    product.images = [...product.images, ...savedPaths];
    await product.save();

    logger.backend.info('Saved generated images to product', {
      productId: product._id,
      sku: product.sku,
      saved: savedPaths.length,
      failed: errors.length,
    });

    res.json({
      success: true,
      productId: product._id,
      sku: product.sku,
      saved: savedPaths,
      failed: errors,
      message: `Saved ${savedPaths.length} image(s) to product ${product.sku}`,
    });
  } catch (error) {
    logger.backend.error('Error saving generated images to product', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      error: 'Failed to save images to product',
      message: error.message,
    });
  }
});

module.exports = router;

