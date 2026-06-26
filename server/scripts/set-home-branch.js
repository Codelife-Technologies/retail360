require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Location = require('../models/Location');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/inventory';
const BRANCH_CODE = (process.argv[2] || 'NOIDA63').toUpperCase();

async function main() {
  await mongoose.connect(MONGODB_URI);

  const location = await Location.findOne({ code: BRANCH_CODE });
  if (!location) {
    throw new Error(`Location with code '${BRANCH_CODE}' not found`);
  }

  await Location.updateMany({ _id: { $ne: location._id } }, { $set: { isHomeBranch: false } });
  location.isHomeBranch = true;
  await location.save();

  console.log(`Home branch set to ${location.code} (${location.name})`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err.message || err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
