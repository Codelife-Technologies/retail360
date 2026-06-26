/**
 * Default buyer (company) profile for Purchase Orders.
 * Override via environment variables or edit this config for your organisation.
 */
export const DEFAULT_BUYER = {
  companyName: process.env.REACT_APP_BUYER_COMPANY_NAME || 'Retail360 Private Limited',
  registeredAddress:
    process.env.REACT_APP_BUYER_ADDRESS ||
    '123, Business Park, Andheri East, Mumbai, Maharashtra – 400069, India',
  gstin: process.env.REACT_APP_BUYER_GSTIN || '27AAAAA0000A1Z5',
  pan: process.env.REACT_APP_BUYER_PAN || 'AAAAA0000A',
  state: process.env.REACT_APP_BUYER_STATE || 'Maharashtra',
  contactNumber: process.env.REACT_APP_BUYER_PHONE || '+91 98765 43210',
  email: process.env.REACT_APP_BUYER_EMAIL || 'accounts@retail360.in',
  jurisdiction: process.env.REACT_APP_BUYER_JURISDICTION || 'Mumbai, Maharashtra',
};

export const DEFAULT_PO_TERMS = [
  'Goods must conform to agreed specifications.',
  'Supplier must provide GST-compliant invoice.',
  'Defective goods may be rejected.',
  'Delivery delays may attract penalties.',
  'Payment subject to material acceptance.',
  'Warranty terms as agreed.',
];
