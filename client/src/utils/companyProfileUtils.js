import { DEFAULT_BUYER, DEFAULT_PO_TERMS } from '../config/buyerCompany';

/** Map saved company master → PO form defaults. */
export function companyProfileToPoDefaults(profile) {
  if (!profile) return null;

  const buyer = profile.buyer || {};
  const billing = profile.billingAddress || {};
  const shipping = profile.shippingAddress || {};

  return {
    buyer: {
      companyName: buyer.companyName || DEFAULT_BUYER.companyName,
      registeredAddress: buyer.registeredAddress || DEFAULT_BUYER.registeredAddress,
      gstin: buyer.gstin || DEFAULT_BUYER.gstin,
      pan: buyer.pan || DEFAULT_BUYER.pan,
      state: buyer.state || DEFAULT_BUYER.state,
      contactPerson: buyer.contactPerson || '',
      contactNumber: buyer.contactNumber || DEFAULT_BUYER.contactNumber,
      email: buyer.email || DEFAULT_BUYER.email,
    },
    billingAddress: {
      companyName: billing.companyName || buyer.companyName || DEFAULT_BUYER.companyName,
      warehouseName: billing.warehouseName || '',
      address: billing.address || buyer.registeredAddress || DEFAULT_BUYER.registeredAddress,
      gstin: billing.gstin || buyer.gstin || DEFAULT_BUYER.gstin,
      contactPerson: billing.contactPerson || '',
      contactNumber: billing.contactNumber || buyer.contactNumber || DEFAULT_BUYER.contactNumber,
    },
    shippingAddress: {
      companyName: shipping.companyName || '',
      warehouseName: shipping.warehouseName || '',
      address: shipping.address || '',
      gstin: shipping.gstin || '',
      contactPerson: shipping.contactPerson || '',
      contactNumber: shipping.contactNumber || '',
    },
    jurisdiction: profile.jurisdiction || DEFAULT_BUYER.jurisdiction,
    termsAndConditions:
      profile.termsAndConditions?.length > 0
        ? [...profile.termsAndConditions]
        : [...DEFAULT_PO_TERMS],
    advancePercent: profile.advancePercent ?? 0,
    creditDays: profile.creditDays ?? 0,
    deliveryMode: profile.deliveryMode || '',
    incoterms: profile.incoterms || '',
  };
}

export function profileToCompanyForm(profile) {
  const defaults = companyProfileToPoDefaults(profile) || companyProfileToPoDefaults({});
  return {
    buyer: { ...defaults.buyer },
    billingAddress: { ...defaults.billingAddress },
    shippingAddress: { ...defaults.shippingAddress },
    jurisdiction: defaults.jurisdiction,
    termsText: (defaults.termsAndConditions || []).join('\n'),
    advancePercent: defaults.advancePercent,
    creditDays: defaults.creditDays,
    deliveryMode: defaults.deliveryMode,
    incoterms: defaults.incoterms,
  };
}

export function companyFormToProfilePayload(form) {
  return {
    buyer: { ...form.buyer },
    billingAddress: { ...form.billingAddress },
    shippingAddress: { ...form.shippingAddress },
    jurisdiction: form.jurisdiction || '',
    termsAndConditions: (form.termsText || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
    advancePercent: parseFloat(form.advancePercent) || 0,
    creditDays: parseInt(form.creditDays, 10) || 0,
    deliveryMode: form.deliveryMode || '',
    incoterms: form.incoterms || '',
  };
}
