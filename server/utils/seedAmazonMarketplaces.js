const SalesChannel = require('../models/SalesChannel');

const AMAZON_MARKETPLACES = [
  { code: 'AMAZON_IN', name: 'Amazon India', country: 'IN', defaultCurrency: 'INR' },
  { code: 'AMAZON_US', name: 'Amazon.com', country: 'US', defaultCurrency: 'USD' },
  { code: 'AMAZON_UK', name: 'Amazon UK', country: 'GB', defaultCurrency: 'GBP' },
  { code: 'AMAZON_DE', name: 'Amazon Germany', country: 'DE', defaultCurrency: 'EUR' },
  { code: 'AMAZON_FR', name: 'Amazon France', country: 'FR', defaultCurrency: 'EUR' },
  { code: 'AMAZON_IT', name: 'Amazon Italy', country: 'IT', defaultCurrency: 'EUR' },
  { code: 'AMAZON_ES', name: 'Amazon Spain', country: 'ES', defaultCurrency: 'EUR' },
  { code: 'AMAZON_CA', name: 'Amazon Canada', country: 'CA', defaultCurrency: 'CAD' },
  { code: 'AMAZON_MX', name: 'Amazon Mexico', country: 'MX', defaultCurrency: 'MXN' },
  { code: 'AMAZON_JP', name: 'Amazon Japan', country: 'JP', defaultCurrency: 'JPY' },
  { code: 'AMAZON_AU', name: 'Amazon Australia', country: 'AU', defaultCurrency: 'AUD' },
  { code: 'AMAZON_UAE', name: 'Amazon UAE', country: 'AE', defaultCurrency: 'AED' },
];

async function seedAmazonMarketplaces() {
  try {
    let created = 0;
    for (const mp of AMAZON_MARKETPLACES) {
      const existing = await SalesChannel.findOne({ code: mp.code });
      if (!existing) {
        await SalesChannel.create({
          code: mp.code,
          name: mp.name,
          type: 'marketplace',
          country: mp.country,
          defaultCurrency: mp.defaultCurrency,
          isActive: true,
        });
        created++;
      } else {
        // If the channel exists but is inactive or missing required fields, update it.
        const needsUpdate =
          existing.isActive !== true || !existing.country || !existing.defaultCurrency;
        if (needsUpdate) {
          await SalesChannel.findByIdAndUpdate(
            existing._id,
            {
              $set: {
                name: mp.name,
                type: 'marketplace',
                country: mp.country,
                defaultCurrency: mp.defaultCurrency,
                isActive: true,
              },
            },
            { new: true, runValidators: true }
          );
        }
      }
    }
    return { created, total: AMAZON_MARKETPLACES.length };
  } catch (error) {
    console.error('seedAmazonMarketplaces error:', error.message);
    throw error;
  }
}

module.exports = { seedAmazonMarketplaces };
