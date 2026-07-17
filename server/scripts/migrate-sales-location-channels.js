/**
 * Migrate SalesLocation.salesChannel → salesChannels[]
 * Safe to run multiple times. Drops obsolete unique indexes first.
 */
const mongoose = require('mongoose');

async function dropObsoleteIndexes(collection) {
  const knownNames = ['salesChannel_1_location_1', 'salesChannel_1'];
  for (const name of knownNames) {
    try {
      await collection.dropIndex(name);
      console.log(`Dropped obsolete index: ${name}`);
    } catch (err) {
      // 27 = IndexNotFound
      if (err.code !== 27 && err.codeName !== 'IndexNotFound') {
        console.warn(`Could not drop index ${name}:`, err.message);
      }
    }
  }
}

async function migrateSalesLocationChannels(connection = mongoose.connection) {
  const collection = connection.collection('saleslocations');

  // Must drop unique (salesChannel, location) before unsetting salesChannel,
  // otherwise multiple docs with same location get salesChannel:null and collide.
  await dropObsoleteIndexes(collection);

  const toMigrate = await collection
    .find({
      salesChannel: { $exists: true, $ne: null },
      $or: [
        { salesChannels: { $exists: false } },
        { salesChannels: { $size: 0 } },
        { salesChannels: null },
      ],
    })
    .project({ _id: 1, salesChannel: 1 })
    .toArray();

  let migrated = 0;
  for (const doc of toMigrate) {
    await collection.updateOne(
      { _id: doc._id },
      {
        $set: { salesChannels: [doc.salesChannel] },
        $unset: { salesChannel: '' },
      }
    );
    migrated += 1;
  }

  // Clean leftover singular field when salesChannels already present
  const unsetResult = await collection.updateMany(
    { salesChannel: { $exists: true } },
    { $unset: { salesChannel: '' } }
  );

  await dropObsoleteIndexes(collection);

  return {
    migrated,
    matched: toMigrate.length,
    unset: unsetResult.modifiedCount || 0,
  };
}

async function main() {
  require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/inventory';
  await mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 15000,
  });
  const stats = await migrateSalesLocationChannels(mongoose.connection);
  console.log(
    `SalesLocation channels migrated: ${stats.migrated} updated, ${stats.matched} matched, ${stats.unset} unset singular field`
  );
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error(err.message || err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
}

module.exports = { migrateSalesLocationChannels };
