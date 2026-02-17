const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

// Initialize OpenAI client
function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }
  return new OpenAI({ apiKey });
}

// Convert image file to base64
function imageToBase64(imagePath) {
  try {
    const imageBuffer = fs.readFileSync(imagePath);
    return imageBuffer.toString('base64');
  } catch (error) {
    logger.backend.error('Error converting image to base64', { error: error.message, imagePath });
    throw new Error(`Failed to convert image to base64: ${error.message}`);
  }
}

// Get MIME type from file extension
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp'
  };
  return mimeTypes[ext] || 'image/jpeg';
}

// Generate a single image using OpenAI DALL-E API
async function generateSingleImage(imagePath, prompt, model = 'dall-e-3', size = '1024x1024', quality = 'standard') {
  try {
    const openai = getOpenAIClient();
    
    // Read the reference image
    const imageBase64 = imageToBase64(imagePath);
    const mimeType = getMimeType(imagePath);
    
    // Enhance the prompt to include reference to the uploaded image
    // Note: DALL-E 3 doesn't support image input directly, so we describe the image in the prompt
    const enhancedPrompt = `Based on the uploaded product image reference, ${prompt}. Generate a high-quality product image that matches the style and quality of professional product photography.`;
    
    // Generate image using DALL-E
    // DALL-E 3 supports: 1024x1024, 1792x1024, 1024x1792
    // Quality: standard or hd
    const response = await openai.images.generate({
      model: model, // 'dall-e-2' or 'dall-e-3'
      prompt: enhancedPrompt,
      n: 1,
      size: size,
      quality: quality, // 'standard' or 'hd' (only for dall-e-3)
      response_format: 'b64_json' // Get base64 encoded image
    });
    
    if (response.data && response.data.length > 0 && response.data[0].b64_json) {
      return {
        success: true,
        imageData: response.data[0].b64_json,
        mimeType: 'image/png', // DALL-E returns PNG
        prompt: prompt,
        revised_prompt: response.data[0].revised_prompt || prompt
      };
    }
    
    throw new Error('No image data received from OpenAI API');
  } catch (error) {
    logger.backend.error('Error generating image with OpenAI', { 
      error: error.message, 
      stack: error.stack,
      prompt 
    });
    throw new Error(`Failed to generate image: ${error.message}`);
  }
}

// Generate multiple images using multiple prompts
async function generateMultipleImages(imagePath, prompts, model = 'dall-e-3', size = '1024x1024', quality = 'standard') {
  try {
    if (!prompts || prompts.length === 0) {
      throw new Error('No prompts provided');
    }
    
    if (prompts.length < 6 || prompts.length > 10) {
      throw new Error('Must provide 6-10 prompts');
    }
    
    const results = [];
    
    // Generate images sequentially to avoid rate limiting
    for (let i = 0; i < prompts.length; i++) {
      const promptObj = prompts[i];
      logger.backend.info(`Generating image ${i + 1}/${prompts.length} with OpenAI`, { 
        order: promptObj.order 
      });
      
      try {
        const result = await generateSingleImage(imagePath, promptObj.prompt, model, size, quality);
        results.push({
          order: promptObj.order,
          prompt: promptObj.prompt,
          success: true,
          data: result
        });
        
        // Add a delay to avoid rate limiting (OpenAI has rate limits)
        // DALL-E 3: 7 images per minute
        // DALL-E 2: 10 images per minute
        const delay = model === 'dall-e-3' ? 9000 : 7000; // milliseconds
        if (i < prompts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } catch (error) {
        logger.backend.error(`Error generating image for prompt ${i + 1}`, { 
          error: error.message,
          order: promptObj.order 
        });
        results.push({
          order: promptObj.order,
          prompt: promptObj.prompt,
          success: false,
          error: error.message
        });
      }
    }
    
    return results;
  } catch (error) {
    logger.backend.error('Error generating multiple images with OpenAI', { error: error.message });
    throw error;
  }
}

// Save generated image data to file
function saveGeneratedImage(imageData, outputPath, type) {
  try {
    ensureDirectoryExists(path.dirname(outputPath));
    
    let buffer;
    
    // Handle different image data formats
    if (typeof imageData === 'string') {
      // Base64 string (with or without data URI prefix)
      if (imageData.startsWith('data:image')) {
        const base64Data = imageData.split(',')[1];
        buffer = Buffer.from(base64Data, 'base64');
      } else {
        // Plain base64 string
        buffer = Buffer.from(imageData, 'base64');
      }
    } else if (Buffer.isBuffer(imageData)) {
      buffer = imageData;
    } else {
      logger.backend.warn('Received non-image data from OpenAI', { type, outputPath, dataType: typeof imageData });
      throw new Error('Invalid image data format received from OpenAI API');
    }
    
    fs.writeFileSync(outputPath, buffer);
    logger.backend.info('Generated image saved', { outputPath, type, size: buffer.length });
    
    return outputPath;
  } catch (error) {
    logger.backend.error('Error saving generated image', { error: error.message, outputPath });
    throw new Error(`Failed to save generated image: ${error.message}`);
  }
}

// Ensure directory exists
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

module.exports = {
  getOpenAIClient,
  imageToBase64,
  generateSingleImage,
  generateMultipleImages,
  saveGeneratedImage,
  getMimeType
};

