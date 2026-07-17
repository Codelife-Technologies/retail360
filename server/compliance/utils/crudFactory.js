const express = require('express');
const XLSX = require('xlsx');
const { paginate } = require('../../utils/pagination');
const { requireCompliance } = require('./auth');

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildQuery(req, options = {}) {
  const {
    searchFields = [],
    dateField = null,
    extraFilters = [],
  } = options;
  const query = {};
  const { search, status, department, dateFrom, dateTo, registerType } = req.query;

  if (search?.trim() && searchFields.length) {
    const term = escapeRegex(search.trim());
    query.$or = searchFields.map((field) => ({
      [field]: { $regex: term, $options: 'i' },
    }));
  }

  if (status) query.status = status;
  if (department) query.department = department;
  if (registerType) query.registerType = registerType;

  extraFilters.forEach((key) => {
    if (req.query[key] === undefined || req.query[key] === '') return;
    if (key === 'isActive') {
      query[key] = req.query[key] === 'true' || req.query[key] === true;
      return;
    }
    query[key] = req.query[key];
  });

  if (dateField && (dateFrom || dateTo)) {
    query[dateField] = {};
    if (dateFrom) query[dateField].$gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      query[dateField].$lte = end;
    }
  }

  return query;
}

function createCrudRouter(Model, options = {}) {
  const {
    resourceName = 'Record',
    searchFields = ['remarks'],
    dateField = 'dueDate',
    defaultSort = { createdAt: -1 },
    viewPerm,
    createPerm,
    updatePerm,
    deletePerm,
    extraFilters = [],
    mapExportRow = null,
    beforeSave = null,
  } = options;

  const router = express.Router();

  router.get('/', requireCompliance(viewPerm), async (req, res) => {
    try {
      const query = buildQuery(req, { searchFields, dateField, extraFilters });
      const sortField = req.query.sortBy || Object.keys(defaultSort)[0];
      const sortDir = req.query.sortOrder === 'asc' ? 1 : (defaultSort[sortField] || -1);
      const sort = { [sortField]: sortDir };

      if (req.query.page || req.query.limit) {
        const result = await paginate(Model, query, {
          page: req.query.page,
          limit: req.query.limit,
          sort,
        });
        return res.json(result);
      }

      const data = await Model.find(query).sort(sort);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/export', requireCompliance(viewPerm), async (req, res) => {
    try {
      const query = buildQuery(req, { searchFields, dateField, extraFilters });
      const rows = await Model.find(query).sort(defaultSort).lean();
      const format = String(req.query.format || 'xlsx').toLowerCase();
      const exportRows = mapExportRow
        ? rows.map(mapExportRow)
        : rows.map((row) => {
            const plain = { ...row };
            delete plain.__v;
            plain._id = String(plain._id);
            return plain;
          });

      if (format === 'csv') {
        const sheet = XLSX.utils.json_to_sheet(exportRows);
        const csv = XLSX.utils.sheet_to_csv(sheet);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${resourceName}.csv"`);
        return res.send(csv);
      }

      if (format === 'pdf') {
        const lines = [
          `${resourceName} Export`,
          `Generated: ${new Date().toISOString()}`,
          `Records: ${exportRows.length}`,
          '',
          ...exportRows.map((row, idx) => `${idx + 1}. ${JSON.stringify(row)}`),
        ];
        const content = lines.join('\n').replace(/[()\\]/g, '');
        // Minimal text PDF
        const pdf = `%PDF-1.1
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length ${content.length + 40} >>stream
BT /F1 9 Tf 40 750 Td (${content.slice(0, 2000).replace(/\n/g, ') Tj T* (')}) Tj ET
endstream
endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000000 00000 n 
trailer<< /Size 6 /Root 1 0 R >>
startxref
0
%%EOF`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${resourceName}.pdf"`);
        return res.send(Buffer.from(pdf));
      }

      const sheet = XLSX.utils.json_to_sheet(exportRows);
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, resourceName.slice(0, 31));
      const buffer = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${resourceName}.xlsx"`);
      return res.send(buffer);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/:id', requireCompliance(viewPerm), async (req, res) => {
    try {
      const item = await Model.findById(req.params.id);
      if (!item) return res.status(404).json({ error: `${resourceName} not found` });
      res.json(item);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/', requireCompliance(createPerm), async (req, res) => {
    try {
      let payload = { ...req.body };
      if (beforeSave) payload = await beforeSave(payload, req, 'create');
      const item = new Model(payload);
      await item.save();
      res.status(201).json(item);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.put('/:id', requireCompliance(updatePerm), async (req, res) => {
    try {
      let payload = { ...req.body };
      if (beforeSave) payload = await beforeSave(payload, req, 'update');
      const item = await Model.findByIdAndUpdate(req.params.id, payload, {
        new: true,
        runValidators: true,
      });
      if (!item) return res.status(404).json({ error: `${resourceName} not found` });
      res.json(item);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.delete('/:id', requireCompliance(deletePerm), async (req, res) => {
    try {
      const item = await Model.findByIdAndDelete(req.params.id);
      if (!item) return res.status(404).json({ error: `${resourceName} not found` });
      res.json({ message: `${resourceName} deleted`, id: req.params.id });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

module.exports = { createCrudRouter, buildQuery };
