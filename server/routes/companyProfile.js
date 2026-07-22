const express = require('express');
const router = express.Router();
const CompanyProfile = require('../models/CompanyProfile');
const { getDefaultCompanyProfile } = require('../utils/defaultCompanyProfile');
const { requirePermission } = require('../middleware/auth');

const SINGLETON_KEY = 'master';

/** GET company master — returns saved profile or sensible defaults. */
router.get('/', requirePermission('companyProfile.view'), async (req, res) => {
  try {
    let profile = await CompanyProfile.findOne({ singletonKey: SINGLETON_KEY }).lean();
    if (!profile) {
      profile = getDefaultCompanyProfile();
    }
    res.json(profile);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/** PUT upsert company master (single record for the organisation). */
router.put('/', requirePermission('companyProfile.update'), async (req, res) => {
  try {
    const payload = { ...req.body };
    delete payload._id;
    delete payload.singletonKey;
    delete payload.createdAt;
    delete payload.updatedAt;
    delete payload.__v;

    const profile = await CompanyProfile.findOneAndUpdate(
      { singletonKey: SINGLETON_KEY },
      { $set: payload, $setOnInsert: { singletonKey: SINGLETON_KEY } },
      { new: true, upsert: true, runValidators: true }
    );
    res.json(profile);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
