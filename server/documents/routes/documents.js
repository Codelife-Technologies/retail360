const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const Document = require('../models/Document');
const {
  requireDocuments,
  userPermissionSet,
  isDocumentsAdmin,
  isDocumentsManager,
} = require('../utils/auth');
const { MANUAL_DIR, AI_DIR, ensureDocumentFolders } = require('../utils/storage');
const documentService = require('../services/documentService');
const DocumentFolder = require('../models/DocumentFolder');

const router = express.Router();
ensureDocumentFolders();

// Drop obsolete unique index (pre-personal-folders) if present
DocumentFolder.collection.dropIndex('name_1_parentId_1_sourceScope_1_status_1').catch(() => {});
DocumentFolder.syncIndexes().catch(() => {});

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureDocumentFolders();
    cb(null, MANUAL_DIR);
  },
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});

const aiStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureDocumentFolders();
    cb(null, AI_DIR);
  },
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});

function createUploadMiddleware() {
  return multer({
    storage,
    limits: { fileSize: 100 * 1024 * 1024 },
  });
}

function createAiUploadMiddleware() {
  return multer({
    storage: aiStorage,
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (String(file.mimetype || '').startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed'));
      }
    },
  });
}

async function resolveScope(req) {
  const permissions = await userPermissionSet(req.user.id);
  const admin = isDocumentsAdmin(permissions);
  const manager = isDocumentsManager(permissions);
  return {
    permissions,
    admin,
    manager,
    userId: req.user.id,
    ownOnly: !admin && !manager,
    department: req.query.scopeDepartment || '',
  };
}

function canMutateDoc(doc, scope) {
  if (scope.admin) return true;
  if (scope.manager) return true;
  return String(doc.uploadedByUserId || '') === String(scope.userId);
}

// GET /documents/analytics — before /:id
router.get(
  '/analytics',
  requireDocuments('documents.view', 'documents.analytics.view'),
  async (req, res) => {
    try {
      const scope = await resolveScope(req);
      const data = await documentService.getAnalytics(scope);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// GET /documents/settings
router.get(
  '/settings',
  requireDocuments('documents.view', 'documents.settings.view', 'documents.upload', 'documents.create'),
  async (req, res) => {
    try {
      const settings = await documentService.getSettings();
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// PUT /documents/settings
router.put(
  '/settings',
  requireDocuments('documents.manage', 'documents.settings.update'),
  async (req, res) => {
    try {
      const settings = await documentService.updateSettings(req.body || {});
      res.json(settings);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
);

// GET /documents/sku/:sku
router.get(
  '/sku/:sku',
  requireDocuments('documents.view'),
  async (req, res) => {
    try {
      const scope = await resolveScope(req);
      const result = await documentService.listDocuments(
        { ...req.query, sku: req.params.sku, status: req.query.status || 'Active' },
        scope,
        { page: req.query.page || 1, limit: req.query.limit || 50 }
      );
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ── Folders (must be before /:id) ──────────────────────────────────────────

// GET /documents/folders
router.get('/folders', requireDocuments('documents.view', 'documents.manual.view', 'documents.ai.view'), async (req, res) => {
  try {
    const scope = await resolveScope(req);
    const data = await documentService.listFolders(scope, {
      sourceScope: req.query.sourceScope || 'Manual Upload',
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /documents/folders/sync-catalog — build Category → Subcategory → SKU folders
router.post(
  '/folders/sync-catalog',
  requireDocuments('documents.create', 'documents.update', 'documents.ai.view'),
  async (req, res) => {
    try {
      const result = await documentService.syncCatalogFolders({
        sourceScope: req.body?.sourceScope || 'AI Generator',
        user: req.user,
      });
      const scope = await resolveScope(req);
      const folders = await documentService.listFolders(scope, {
        sourceScope: result.sourceScope,
      });
      res.json({ ...result, ...folders });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
);

// GET /documents/folders/:id/browse — children + images for catalog folders
router.get(
  '/folders/:id/browse',
  requireDocuments('documents.view', 'documents.manual.view', 'documents.ai.view'),
  async (req, res) => {
    try {
      const scope = await resolveScope(req);
      const data = await documentService.browseFolder(
        req.params.id,
        scope,
        {
          search: req.query.search,
          category: req.query.category,
          dateFrom: req.query.dateFrom,
          dateTo: req.query.dateTo,
          status: req.query.status || 'Active',
        },
        {
          page: req.query.page || 1,
          limit: req.query.limit || 48,
        }
      );
      res.json(data);
    } catch (error) {
      const denied = /denied/i.test(error.message);
      const missing = /not found/i.test(error.message);
      res.status(denied ? 403 : missing ? 404 : 500).json({ error: error.message });
    }
  }
);

// POST /documents/folders
router.post(
  '/folders',
  requireDocuments('documents.create', 'documents.upload', 'documents.update'),
  async (req, res) => {
    try {
      const scope = await resolveScope(req);
      const folder = await documentService.createFolder({
        name: req.body?.name,
        description: req.body?.description,
        parentId: req.body?.parentId,
        department: req.body?.department,
        sortOrder: req.body?.sortOrder,
        sourceScope: req.body?.sourceScope || 'Manual Upload',
        visibility: req.body?.visibility || 'Shared',
        employeeVisible: req.body?.employeeVisible,
        user: req.user,
        scope,
      });
      res.status(201).json(folder);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
);

// PUT /documents/folders/reorder — before /folders/:id
router.put(
  '/folders/reorder',
  requireDocuments('documents.update'),
  async (req, res) => {
    try {
      const scope = await resolveScope(req);
      const data = await documentService.reorderFolders(
        req.body?.orderedIds || [],
        scope,
        { sourceScope: req.body?.sourceScope || req.query.sourceScope || 'Manual Upload' }
      );
      res.json(data);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
);

// PUT /documents/folders/:id
router.put('/folders/:id', requireDocuments('documents.update'), async (req, res) => {
  try {
    const scope = await resolveScope(req);
    const folder = await documentService.updateFolder(req.params.id, req.body || {}, scope);
    res.json(folder);
  } catch (error) {
    const status = error.message === 'Access denied' ? 403 : 400;
    res.status(status).json({ error: error.message });
  }
});

// DELETE /documents/folders/:id
router.delete('/folders/:id', requireDocuments('documents.delete', 'documents.update'), async (req, res) => {
  try {
    const scope = await resolveScope(req);
    const result = await documentService.deleteFolder(req.params.id, scope);
    res.json({ message: 'Folder deleted. Documents moved to Unfiled.', ...result });
  } catch (error) {
    const status = error.message === 'Access denied' ? 403 : 400;
    res.status(status).json({ error: error.message });
  }
});

// POST /documents/:id/move — move document into a folder
router.post('/:id/move', requireDocuments('documents.update'), async (req, res) => {
  try {
    const scope = await resolveScope(req);
    const doc = await documentService.moveDocumentToFolder(
      req.params.id,
      req.body?.folderId,
      scope
    );
    res.json(doc);
  } catch (error) {
    const status = error.message === 'Access denied' ? 403 : 400;
    res.status(status).json({ error: error.message });
  }
});

// POST /documents/:id/set-product-default — use this image as product default
router.post('/:id/set-product-default', requireDocuments('documents.update'), async (req, res) => {
  try {
    const Document = require('../models/Document');
    const { setProductDefaultFromDocument } = require('../../utils/productDefaultImage');
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    if (doc.status === 'Deleted') {
      return res.status(400).json({ error: 'Cannot use a deleted document as default image' });
    }

    const product = await setProductDefaultFromDocument(doc, {
      sku: req.body?.sku,
    });
    res.json({
      success: true,
      message: 'Default product image updated',
      productId: product._id,
      sku: product.sku,
      defaultImage: product.images?.[0] || null,
      images: product.images,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// GET /documents
router.get('/', requireDocuments('documents.view'), async (req, res) => {
  try {
    const scope = await resolveScope(req);
    const result = await documentService.listDocuments(
      req.query,
      scope,
      {
        page: parseInt(req.query.page || '1', 10),
        limit: parseInt(req.query.limit || '24', 10),
      }
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /documents/:id
router.get('/:id', requireDocuments('documents.view'), async (req, res) => {
  try {
    const scope = await resolveScope(req);
    const doc = await Document.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    if (scope.ownOnly && String(doc.uploadedByUserId || '') !== String(scope.userId) && doc.source !== 'AI Generator') {
      return res.status(403).json({ error: 'Access denied' });
    }
    res.json(doc);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /documents/:id/download
router.get('/:id/download', requireDocuments('documents.view', 'documents.download'), async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const abs = path.join(require('../utils/storage').UPLOADS_ROOT, doc.storagePath);
    if (!fs.existsSync(abs)) return res.status(404).json({ error: 'File missing on server' });
    res.download(abs, doc.fileName || path.basename(abs));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /documents/upload
router.post(
  '/upload',
  requireDocuments('documents.create', 'documents.upload'),
  (req, res, next) => {
    createUploadMiddleware().array('files', 20)(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message });
      return next();
    });
  },
  async (req, res) => {
    try {
      const files = req.files || [];
      if (!files.length) return res.status(400).json({ error: 'No files uploaded' });
      const scope = await resolveScope(req);

      const created = [];
      const errors = [];
      for (const file of files) {
        try {
          const doc = await documentService.createManualUpload({
            file,
            user: req.user,
            title: req.body.title,
            description: req.body.description,
            tags: req.body.tags,
            department: req.body.department,
            sku: req.body.sku,
            productId: req.body.productId,
            folderId: req.body.folderId,
            scope,
          });
          created.push(doc);
        } catch (err) {
          errors.push({ file: file.originalname, error: err.message });
          try { fs.unlinkSync(file.path); } catch (_e) { /* ignore */ }
        }
      }

      res.status(201).json({
        success: true,
        created,
        errors,
        message: `Uploaded ${created.length} file(s)${errors.length ? `, ${errors.length} failed` : ''}`,
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
);

// POST /documents/upload-ai — desktop images into AI Generated Images
router.post(
  '/upload-ai',
  requireDocuments('documents.create', 'documents.upload', 'documents.ai.view'),
  (req, res, next) => {
    createAiUploadMiddleware().array('files', 20)(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message });
      return next();
    });
  },
  async (req, res) => {
    try {
      const files = req.files || [];
      if (!files.length) return res.status(400).json({ error: 'No image files uploaded' });
      const scope = await resolveScope(req);

      const created = [];
      const errors = [];
      for (const file of files) {
        try {
          const doc = await documentService.createAiDesktopUpload({
            file,
            user: req.user,
            title: req.body.title,
            description: req.body.description,
            tags: req.body.tags,
            sku: req.body.sku,
            productId: req.body.productId,
            folderId: req.body.folderId,
            scope,
          });
          created.push(doc);
        } catch (err) {
          errors.push({ file: file.originalname, error: err.message });
          try { fs.unlinkSync(file.path); } catch (_e) { /* ignore */ }
        }
      }

      res.status(201).json({
        success: true,
        created,
        errors,
        message: `Added ${created.length} image(s)${errors.length ? `, ${errors.length} failed` : ''}`,
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
);

// POST /documents/ai-save
router.post(
  '/ai-save',
  requireDocuments('documents.create', 'documents.upload', 'gemini.generate'),
  async (req, res) => {
    try {
      const body = req.body || {};
      const images = Array.isArray(body.images) ? body.images : [body];
      const scope = await resolveScope(req);

      const saved = [];
      const skipped = [];
      for (const image of images) {
        if (!image) continue;
        try {
          const result = await documentService.saveAiFromUploadUrl({
            fileUrl: image.fileUrl || image.url,
            path: image.path,
            productId: body.productId || image.productId,
            sku: body.sku || image.sku,
            promptOrder: image.order ?? image.promptOrder,
            promptText: image.prompt || image.promptText,
            uploadedBy: documentService.actorLabel(req.user),
            uploadedByUserId: req.user?.id,
            title: image.title,
            description: image.description,
            tags: image.tags || body.tags,
            mimeType: image.mimeType,
            folderId: body.folderId || image.folderId,
            scope,
          });
          if (result.duplicate) skipped.push(result.document);
          else saved.push(result.document);
        } catch (err) {
          skipped.push({ error: err.message, image });
        }
      }

      res.status(201).json({
        success: true,
        saved,
        skipped,
        message: `Saved ${saved.length} AI image(s)${skipped.length ? `, ${skipped.length} skipped` : ''}`,
      });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
);

// PUT /documents/:id
router.put('/:id', requireDocuments('documents.update'), async (req, res) => {
  try {
    const scope = await resolveScope(req);
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    if (!canMutateDoc(doc, scope)) return res.status(403).json({ error: 'Access denied' });

    const allowed = ['title', 'description', 'tags', 'department', 'status', 'category', 'brand'];
    allowed.forEach((key) => {
      if (req.body[key] !== undefined) doc[key] = req.body[key];
    });
    if (req.body.status === 'Archived') doc.status = 'Archived';
    if (req.body.folderId !== undefined) {
      const nextFolderId = req.body.folderId;
      if (nextFolderId === null || nextFolderId === '' || nextFolderId === 'unfiled') {
        doc.folderId = null;
      } else {
        const moved = await documentService.moveDocumentToFolder(req.params.id, nextFolderId, scope);
        // re-apply other fields that may have been set above onto the moved doc
        allowed.forEach((key) => {
          if (req.body[key] !== undefined) moved[key] = req.body[key];
        });
        if (req.body.status === 'Archived') moved.status = 'Archived';
        await moved.save();
        return res.json(moved);
      }
    }
    await doc.save();
    res.json(doc);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /documents/:id/restore
router.post('/:id/restore', requireDocuments('documents.update', 'documents.delete'), async (req, res) => {
  try {
    const scope = await resolveScope(req);
    if (!scope.admin && !scope.manager) {
      return res.status(403).json({ error: 'Only managers/admins can restore' });
    }
    const doc = await documentService.restore(req.params.id);
    res.json(doc);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /documents/:id/archive
router.post('/:id/archive', requireDocuments('documents.update'), async (req, res) => {
  try {
    const scope = await resolveScope(req);
    const existing = await Document.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Document not found' });
    if (!canMutateDoc(existing, scope)) return res.status(403).json({ error: 'Access denied' });
    const doc = await documentService.archive(req.params.id);
    res.json(doc);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE /documents/:id — soft delete by default; ?permanent=true for hard delete
router.delete('/:id', requireDocuments('documents.delete'), async (req, res) => {
  try {
    const scope = await resolveScope(req);
    const existing = await Document.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Document not found' });

    if (req.query.permanent === 'true') {
      if (!scope.admin) return res.status(403).json({ error: 'Only admins can permanently delete' });
      await documentService.permanentDelete(req.params.id);
      return res.json({ message: 'Document permanently deleted' });
    }

    if (!canMutateDoc(existing, scope) && existing.source === 'AI Generator' && !scope.admin) {
      return res.status(403).json({ error: 'Cannot delete AI images owned by others' });
    }
    if (!canMutateDoc(existing, scope)) {
      return res.status(403).json({ error: 'Cannot delete others\' files' });
    }

    const doc = await documentService.softDelete(req.params.id, req.user);
    res.json({ message: 'Document moved to trash', document: doc });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
