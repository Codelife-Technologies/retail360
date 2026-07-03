# Image Generation Enhancement - Multi-Provider Support

## Overview
Enhanced the image generation feature to support both **Google Gemini** and **OpenAI DALL-E (ChatGPT)** as AI providers for image generation.

## Changes Made

### 1. Backend Changes

#### New File: `server/utils/openaiImageGenerator.js`
- Created OpenAI/DALL-E image generator utility
- Supports DALL-E 2 and DALL-E 3 models
- Configurable image sizes (1024x1024, 1792x1024, 1024x1792)
- Quality options (standard, HD)
- Handles rate limiting with appropriate delays

#### Updated: `server/routes/gemini.js`
- Added provider selection support (`gemini` or `openai`)
- Routes now accept `provider`, `model`, `size`, and `quality` parameters
- Automatically routes to appropriate generator based on provider
- Images saved in separate directories (`gemini-generated` or `openai-generated`)

#### Updated: `server/package.json`
- Added `openai` package dependency (v4.20.0)

### 2. Frontend Changes

#### Updated: `client/src/components/GeminiImageGenerator.js`
- Added provider selection dropdown (Gemini or OpenAI DALL-E)
- Added OpenAI-specific options:
  - Model selection (DALL-E 2 or DALL-E 3)
  - Image size selection (for DALL-E 3)
  - Quality selection (Standard or HD for DALL-E 3)
- Updated UI to show provider selection as Step 1
- Provider parameter is passed to backend API calls

### 3. Configuration

#### Updated: `server/.env.example`
- Added `GEMINI_API_KEY` configuration
- Added `OPENAI_API_KEY` configuration
- Included instructions for obtaining API keys

## API Changes

### Endpoints
Both endpoints now accept additional parameters:

**POST `/api/gemini/regenerate-image`**
- `provider` (optional): `"gemini"` (default) or `"openai"`/`"dall-e"`/`"chatgpt"`
- `model` (optional, OpenAI only): `"dall-e-2"` or `"dall-e-3"` (default)
- `size` (optional, OpenAI only): `"1024x1024"` (default), `"1792x1024"`, or `"1024x1792"`
- `quality` (optional, OpenAI only): `"standard"` (default) or `"hd"`

**POST `/api/gemini/generate-images`**
- Same parameters as above

## Usage

### Setting Up API Keys

1. **Gemini API Key:**
   - Visit: https://makersuite.google.com/app/apikey
   - Create a new API key
   - Add to `.env`: `GEMINI_API_KEY=your_key_here`

2. **OpenAI API Key:**
   - Visit: https://platform.openai.com/api-keys
   - Create a new API key
   - Add to `.env`: `OPENAI_API_KEY=your_key_here`

### Using the Feature

1. **Select Provider:**
   - Choose between "Google Gemini" or "OpenAI DALL-E (ChatGPT)"
   - If using OpenAI, configure:
     - Model: DALL-E 3 (recommended) or DALL-E 2
     - Size: Square, Landscape, or Portrait (DALL-E 3 only)
     - Quality: Standard or HD (DALL-E 3 only)

2. **Select Category and Subcategory:**
   - Choose the category and subcategory
   - Configure prompts (6-10 prompts required)

3. **Upload Image:**
   - Upload a reference product image

4. **Generate Images:**
   - Select prompts to generate
   - Click "Generate Images"
   - Images will be generated using the selected provider

## Provider Comparison

### Google Gemini
- **Pros:**
  - Faster generation
  - Better at understanding image context
  - More flexible prompt interpretation
- **Cons:**
  - May require more prompt refinement
  - Less consistent output quality

### OpenAI DALL-E
- **Pros:**
  - Higher quality, more photorealistic images
  - Better consistency
  - HD quality option available
- **Cons:**
  - Slower generation (rate limits: 7 images/min for DALL-E 3)
  - More expensive per image
  - Cannot directly use reference images (prompt-based only)

## Rate Limits

- **Gemini:** Generally more lenient, but sequential generation recommended
- **DALL-E 3:** 7 images per minute
- **DALL-E 2:** 10 images per minute

The system automatically adds delays between requests to respect rate limits.

## File Structure

Generated images are saved in separate directories:
- Gemini: `server/uploads/gemini-generated/{subcategoryId}/`
- OpenAI: `server/uploads/openai-generated/{subcategoryId}/`

## Installation

After pulling the changes, run:
```bash
cd server
npm install
```

This will install the new `openai` package.

## Notes

- Both providers can be used simultaneously (different subcategories can use different providers)
- Provider selection is per-generation, not per-subcategory
- OpenAI DALL-E 3 requires HD quality for best results but costs more
- DALL-E 2 is cheaper but produces lower quality images
- The system maintains backward compatibility - if no provider is specified, it defaults to Gemini

