require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Sale = require('../models/Sale');
require('../models/Stock');
require('../models/SalesLocation');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/inventory';

async function main() {
  await mongoose.connect(MONGODB_URI);

  const sales = await Sale.find({}, '_id salesNumber');
  if (sales.length === 0) {
    console.log('No sales records found.');
    await mongoose.disconnect();
    return;
  }

  console.log(`Found ${sales.length} sale(s). Deleting...`);

  let deleted = 0;
  for (const sale of sales) {
    await Sale.findByIdAndDelete(sale._id);
    deleted += 1;
    if (deleted % 50 === 0) {
      console.log(`  ${deleted}/${sales.length} deleted...`);
    }
  }

  console.log(`Done. Deleted ${deleted} sale(s). Stock was restored for each deleted sale.`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err.message || err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
