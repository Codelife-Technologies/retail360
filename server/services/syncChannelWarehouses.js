const Location = require('../models/Location');
const SalesLocation = require('../models/SalesLocation');

function normalizeIdList(ids = []) {
  const seen = new Set();
  return (ids || [])
    .map((id) => String(id?._id || id || '').trim())
    .filter((id) => {
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
}

/**
 * Keep SalesLocation mappings in sync with SalesChannel.warehouses
 * so sales/stock can resolve warehouse from the channel link.
 */
async function syncChannelWarehouseLinks(channel, warehouseIds) {
  if (!channel?._id) return;

  const channelId = String(channel._id);
  const linkedWarehouseIds = normalizeIdList(warehouseIds);

  const existingLinks = await SalesLocation.find({ salesChannels: channel._id });

  for (const warehouseId of linkedWarehouseIds) {
    const alreadyLinked = existingLinks.some(
      (sl) => String(sl.location?._id || sl.location) === warehouseId
        && (sl.salesChannels || []).some((id) => String(id) === channelId)
    );
    if (alreadyLinked) continue;

    let salesLocation = await SalesLocation.findOne({
      location: warehouseId,
      isActive: true,
    });

    if (salesLocation) {
      const hasChannel = (salesLocation.salesChannels || []).some(
        (id) => String(id) === channelId
      );
      if (!hasChannel) {
        salesLocation.salesChannels = [...(salesLocation.salesChannels || []), channel._id];
        await salesLocation.save();
      }
      continue;
    }

    const warehouse = await Location.findById(warehouseId);
    if (!warehouse) continue;

    let code = `${channel.code || 'CH'}-${warehouse.code || 'WH'}`
      .replace(/[^A-Z0-9_-]/gi, '')
      .toUpperCase()
      .slice(0, 40);

    const codeExists = await SalesLocation.findOne({ code });
    if (codeExists) {
      code = `${code}-${String(channel._id).slice(-4)}`.toUpperCase().slice(0, 40);
    }

    await SalesLocation.create({
      code,
      name: `${channel.name || channel.code} · ${warehouse.name || warehouse.code}`,
      salesChannels: [channel._id],
      location: warehouse._id,
      country: channel.country,
      currency: channel.defaultCurrency,
      address: warehouse.address || '',
      contactPerson: warehouse.contactPerson || '',
      phone: warehouse.phone || '',
      email: warehouse.email || '',
      isActive: true,
    });
  }

  // Unlink channel from sales locations whose warehouse was removed
  for (const salesLocation of existingLinks) {
    const locId = String(salesLocation.location?._id || salesLocation.location || '');
    if (linkedWarehouseIds.includes(locId)) continue;

    salesLocation.salesChannels = (salesLocation.salesChannels || []).filter(
      (id) => String(id) !== channelId
    );
    if (!salesLocation.salesChannels.length) {
      salesLocation.isActive = false;
    }
    await salesLocation.save();
  }
}

module.exports = {
  normalizeIdList,
  syncChannelWarehouseLinks,
};
