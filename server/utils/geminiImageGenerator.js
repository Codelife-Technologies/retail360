const { GoogleGenAI, Modality } = require('@google/genai');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

// Initialize Gemini client
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set');
  }
  return new GoogleGenAI({ apiKey });
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

// Image generation model names (Gemini "nano banana" image models)
const IMAGE_MODELS = {
  flash: 'gemini-2.5-flash-image',
  pro: 'gemini-2.5-flash-image-preview'
};

// Generate a single image using Gemini API
async function generateSingleImage(imagePath, prompt, useProModel = false) {
  try {
    const genAI = getGeminiClient();
    
    // Image generation models ("nano banana"). The model MUST be told to return
    // an image via responseModalities, otherwise it replies with text only.
    const modelName = useProModel ? IMAGE_MODELS.pro : IMAGE_MODELS.flash;
    
    // Convert image to base64 for reference
    const imageBase64 = imageToBase64(imagePath);
    const mimeType = getMimeType(imagePath);
    
    // Prepare the full prompt that includes reference to the uploaded image
    // The prompt should guide the model to generate an image similar to the uploaded one
    const fullPrompt = `Based on the uploaded product image, ${prompt}. Generate a high-quality product image that matches the style and quality of the reference image.`;
    
    // Generate image using the image generation model
    const response = await genAI.models.generateContent({
      model: modelName,
      contents: [
        {
          inlineData: {
            data: imageBase64,
            mimeType: mimeType
          }
        },
        {
          text: fullPrompt
        }
      ],
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE]
      }
    });
    
    // Check if response contains image data
    // Gemini image generation models return images in the response parts
    const candidates = response.candidates;
    if (candidates && candidates.length > 0) {
      const candidate = candidates[0];
      
      if (candidate.content && candidate.content.parts) {
        for (const part of candidate.content.parts) {
          if (part.inlineData && part.inlineData.data) {
            return {
              success: true,
              imageData: part.inlineData.data,
              mimeType: part.inlineData.mimeType || 'image/png',
              prompt: prompt
            };
          }
        }
      }
    }
    
    // Fallback: no image data found (model returned text only)
    let text = '';
    try {
      text = response.text || '';
    } catch (textError) {
      text = '';
    }
    logger.backend.warn('Gemini API returned no image data', { prompt, text: String(text).substring(0, 100) });
    
    return {
      success: false,
      text: text,
      prompt: prompt,
      note: 'API returned no image (text only). Check the model name and API key.'
    };
  } catch (error) {
    logger.backend.error('Error generating image with Gemini', { 
      error: error.message, 
      stack: error.stack,
      prompt 
    });
    throw new Error(`Failed to generate image: ${error.message}`);
  }
}

// Generate multiple images using multiple prompts
async function generateMultipleImages(imagePath, prompts) {
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
      logger.backend.info(`Generating image ${i + 1}/${prompts.length}`, { 
        order: promptObj.order 
      });
      
      try {
        const result = await generateSingleImage(imagePath, promptObj.prompt);
        results.push({
          order: promptObj.order,
          prompt: promptObj.prompt,
          success: true,
          data: result
        });
        
        // Add a small delay to avoid rate limiting
        if (i < prompts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
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
    logger.backend.error('Error generating multiple images', { error: error.message });
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
      logger.backend.warn('Received non-image data from Gemini', { type, outputPath, dataType: typeof imageData });
      throw new Error('Invalid image data format received from Gemini API');
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
  getGeminiClient,
  imageToBase64,
  generateSingleImage,
  generateMultipleImages,
  saveGeneratedImage,
  getMimeType
};

