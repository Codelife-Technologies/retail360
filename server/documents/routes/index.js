const express = require('express');
const documentsRoutes = require('./documents');

const router = express.Router();
router.use('/', documentsRoutes);

module.exports = router;
