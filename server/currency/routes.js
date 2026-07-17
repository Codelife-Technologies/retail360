const express = require('express');
const { getRates } = require('./services/exchangeRateService');
const { SUPPORTED_CURRENCIES, BASE_CURRENCY, currencyForCountry } = require('./constants');

const router = express.Router();

router.get('/meta', (_req, res) => {
  res.json({
    baseCurrency: BASE_CURRENCY,
    currencies: SUPPORTED_CURRENCIES,
    refreshMinutes: Number(process.env.EXCHANGE_RATE_REFRESH_MINUTES) || 60,
  });
});

router.get('/rates', async (req, res) => {
  try {
    const force = String(req.query.refresh || '') === '1' || String(req.query.force || '') === '1';
    const payload = await getRates({ force });
    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/country-currency/:country', (req, res) => {
  res.json({
    country: req.params.country,
    currency: currencyForCountry(req.params.country),
  });
});

module.exports = router;
