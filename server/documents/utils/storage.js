const path = require('path');
const fs = require('fs');

const UPLOADS_ROOT = path.join(__dirname, '..', '..', 'uploads');
const AI_DIR = path.join(UPLOADS_ROOT, 'document-management', 'ai-generated');
const MANUAL_DIR = path.join(UPLOADS_ROOT, 'document-management', 'employee-documents');
const THUMB_DIR = path.join(UPLOADS_ROOT, 'document-management', 'thumbnails');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function ensureDocumentFolders() {
  ensureDir(AI_DIR);
  ensureDir(MANUAL_DIR);
  ensureDir(THUMB_DIR);
}

function extensionOf(fileName = '') {
  const ext = path.extname(String(fileName)).toLowerCase();
  return ext || '';
}

function isImageMime(mimeType = '') {
  return String(mimeType).startsWith('image/');
}

function toPublicUrl(relativePath) {
  const cleaned = String(relativePath || '').replace(/^\/+/, '');
  return `/uploads/${cleaned}`;
}

function relativeFromUploads(absolutePath) {
  return path.relative(UPLOADS_ROOT, absolutePath).split(path.sep).join('/');
}

/**
 * Best-effort thumbnail generation.
 * Uses sharp when available; otherwise reuses the source image URL for images.
 */
async function generateThumbnail(sourceAbsPath, mimeType) {
  ensureDir(THUMB_DIR);
  if (!isImageMime(mimeType)) {
    return { thumbnailPath: '', thumbnailUrl: '' };
  }

  const base = path.basename(sourceAbsPath, path.extname(sourceAbsPath));
  const thumbName = `${base}_thumb.jpg`;
  const thumbAbs = path.join(THUMB_DIR, thumbName);

  try {
    // Optional dependency — do not fail module load if missing
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    const sharp = require('sharp');
    await sharp(sourceAbsPath)
      .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(thumbAbs);
    const relative = relativeFromUploads(thumbAbs);
    return { thumbnailPath: relative, thumbnailUrl: toPublicUrl(relative) };
  } catch (_err) {
    const relative = relativeFromUploads(sourceAbsPath);
    return { thumbnailPath: relative, thumbnailUrl: toPublicUrl(relative) };
  }
}

module.exports = {
  UPLOADS_ROOT,
  AI_DIR,
  MANUAL_DIR,
  THUMB_DIR,
  ensureDir,
  ensureDocumentFolders,
  extensionOf,
  isImageMime,
  toPublicUrl,
  relativeFromUploads,
  generateThumbnail,
};
