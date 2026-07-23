const mongoose = require('mongoose');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/inventory');
  const Office = mongoose.connection.collection('hrofficelocations');
  const Emp = mongoose.connection.collection('hremployees');

  const office = await Office.findOne({ isActive: true, isDefault: true })
    || await Office.findOne({ isActive: true });

  if (!office) {
    console.log('No active office found');
    await mongoose.disconnect();
    return;
  }

  const result = await Emp.updateMany(
    { status: 'Active' },
    { $set: { officeLocation: office._id } }
  );
  console.log({
    office: office.name,
    matched: result.matchedCount,
    modified: result.modifiedCount,
  });

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
