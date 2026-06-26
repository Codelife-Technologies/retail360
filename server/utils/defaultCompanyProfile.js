/** Default company master used when no profile exists in the database yet. */
function getDefaultCompanyProfile() {
  return {
    singletonKey: 'master',
    buyer: {
      companyName: process.env.BUYER_COMPANY_NAME || 'Retail360 Private Limited',
      registeredAddress:
        process.env.BUYER_ADDRESS ||
        '123, Business Park, Andheri East, Mumbai, Maharashtra – 400069, India',
      gstin: process.env.BUYER_GSTIN || '27AAAAA0000A1Z5',
      pan: process.env.BUYER_PAN || 'AAAAA0000A',
      state: process.env.BUYER_STATE || 'Maharashtra',
      contactPerson: '',
      contactNumber: process.env.BUYER_PHONE || '+91 98765 43210',
      email: process.env.BUYER_EMAIL || 'accounts@retail360.in',
    },
    billingAddress: {
      companyName: process.env.BUYER_COMPANY_NAME || 'Retail360 Private Limited',
      warehouseName: '',
      address:
        process.env.BUYER_ADDRESS ||
        '123, Business Park, Andheri East, Mumbai, Maharashtra – 400069, India',
      gstin: process.env.BUYER_GSTIN || '27AAAAA0000A1Z5',
      contactPerson: '',
      contactNumber: process.env.BUYER_PHONE || '+91 98765 43210',
    },
    shippingAddress: {
      companyName: '',
      warehouseName: '',
      address: '',
      gstin: '',
      contactPerson: '',
      contactNumber: '',
    },
    jurisdiction: process.env.BUYER_JURISDICTION || 'Mumbai, Maharashtra',
    termsAndConditions: [
      'Goods must conform to agreed specifications.',
      'Supplier must provide GST-compliant invoice.',
      'Defective goods may be rejected.',
      'Delivery delays may attract penalties.',
      'Payment subject to material acceptance.',
      'Warranty terms as agreed.',
    ],
    advancePercent: 0,
    creditDays: 0,
    deliveryMode: '',
    incoterms: '',
    preparedBy: { name: '', designation: '' },
    checkedBy: { name: '', designation: '' },
    approvedBy: { name: '', designation: '' },
  };
}

module.exports = { getDefaultCompanyProfile };
