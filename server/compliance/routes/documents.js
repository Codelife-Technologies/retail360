const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const ComplianceDocument = require('../models/ComplianceDocument');
const { paginate } = require('../../utils/pagination');
const { requireCompliance } = require('../utils/auth');
const { buildQuery } = require('../utils/crudFactory');

const router = express.Router();

const uploadDir = path.join(__dirname, '../../uploads/compliance');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
});

router.get('/', requireCompliance('compliance.documents.view'), async (req, res) => {
  try {
    const query = buildQuery(req, {
      searchFields: ['fileName', 'originalName', 'uploadedBy', 'category', 'remarks'],
      dateField: 'uploadDate',
      extraFilters: ['category'],
    });
    if (req.query.page || req.query.limit) {
      const result = await paginate(ComplianceDocument, query, {
        page: req.query.page,
        limit: req.query.limit,
        sort: { uploadDate: -1 },
      });
      return res.json(result);
    }
    const data = await ComplianceDocument.find(query).sort({ uploadDate: -1 });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post(
  '/upload',
  requireCompliance('compliance.documents.create'),
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'File is required' });
      const category = req.body.category || 'GST';
      const doc = await ComplianceDocument.create({
        fileName: req.file.filename,
        originalName: req.file.originalname,
        category,
        uploadDate: new Date(),
        uploadedBy: req.user?.username || req.user?.email || 'User',
        mimeType: req.file.mimetype,
        size: req.file.size,
        storagePath: req.file.filename,
        department: req.body.department || '',
        remarks: req.body.remarks || '',
      });
      res.status(201).json(doc);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
);

router.get('/:id/download', requireCompliance('compliance.documents.view'), async (req, res) => {
  try {
    const doc = await ComplianceDocument.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const filePath = path.join(uploadDir, doc.storagePath);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing on server' });
    res.download(filePath, doc.originalName || doc.fileName);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/preview', requireCompliance('compliance.documents.view'), async (req, res) => {
  try {
    const doc = await ComplianceDocument.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const filePath = path.join(uploadDir, doc.storagePath);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing on server' });
    res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
    res.sendFile(filePath);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', requireCompliance('compliance.documents.delete'), async (req, res) => {
  try {
    const doc = await ComplianceDocument.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const filePath = path.join(uploadDir, doc.storagePath);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.json({ message: 'Document deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
