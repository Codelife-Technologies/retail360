const express = require('express');
const ComplianceCompany = require('../models/ComplianceCompany');
const { requireCompliance } = require('../utils/auth');

const router = express.Router();

async function getOrCreate() {
  let doc = await ComplianceCompany.findOne({ singletonKey: 'compliance' });
  if (!doc) {
    doc = await ComplianceCompany.create({ singletonKey: 'compliance' });
  }
  return doc;
}

router.get('/', requireCompliance('compliance.company.view'), async (req, res) => {
  try {
    const doc = await getOrCreate();
    res.json(doc);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/', requireCompliance('compliance.company.update'), async (req, res) => {
  try {
    const allowed = [
      'companyName', 'cin', 'gstin', 'pan', 'tan',
      'address', 'state', 'contactPerson', 'email', 'phone',
    ];
    const updates = {};
    allowed.forEach((key) => {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    });
    const doc = await ComplianceCompany.findOneAndUpdate(
      { singletonKey: 'compliance' },
      { $set: updates },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.json(doc);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
