const mongoose = require('mongoose');

const exchangeRateCacheSchema = new mongoose.Schema(
  {
    base: { type: String, required: true, uppercase: true, default: 'INR' },
    rates: { type: Map, of: Number, default: {} },
    /** Units of each currency per 1 base (e.g. how many USD for 1 INR). */
    source: { type: String, default: 'open.er-api.com' },
    fetchedAt: { type: Date, default: Date.now },
    nextRefreshAt: { type: Date },
  },
  { timestamps: true }
);

exchangeRateCacheSchema.index({ base: 1 }, { unique: true });

module.exports = mongoose.model('ExchangeRateCache', exchangeRateCacheSchema);
