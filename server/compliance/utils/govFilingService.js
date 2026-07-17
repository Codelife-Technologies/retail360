const ComplianceCompany = require('../models/ComplianceCompany');

function getGovConfig() {
  const apiKey = process.env.GOVT_FILING_API_KEY || '';
  const baseUrl = (process.env.GOVT_FILING_API_BASE_URL || '').replace(/\/$/, '');
  return {
    configured: Boolean(apiKey && baseUrl),
    baseUrl: baseUrl || null,
    portalHint: process.env.GOVT_FILING_PORTAL_HINT || 'Government e-filing gateway',
  };
}

async function getCompanyTaxIds() {
  const company = await ComplianceCompany.findOne({ singletonKey: 'compliance' }).lean();
  return {
    gstin: company?.gstin || '',
    pan: company?.pan || '',
    tan: company?.tan || '',
    companyName: company?.companyName || company?.legalName || '',
  };
}

async function submitFilingToGovernment(filing, master) {
  const config = getGovConfig();
  if (!config.configured) {
    const error = new Error(
      'Government filing API is not configured. Set GOVT_FILING_API_KEY and GOVT_FILING_API_BASE_URL in server environment.'
    );
    error.statusCode = 503;
    throw error;
  }

  const company = await getCompanyTaxIds();
  const payload = {
    formCode: filing.governmentFormCode || master?.governmentFormCode || filing.formCode,
    formName: filing.formName,
    category: filing.category,
    period: filing.period,
    amount: filing.amount || 0,
    gstin: company.gstin,
    pan: company.pan,
    tan: company.tan,
    companyName: company.companyName,
    remarks: filing.remarks || '',
    attachmentUrl: filing.attachment || '',
    metadata: {
      filingId: String(filing._id),
      portal: filing.governmentPortal || master?.governmentPortal || '',
    },
  };

  const response = await fetch(`${config.baseUrl}/filings/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GOVT_FILING_API_KEY}`,
      'X-API-Key': process.env.GOVT_FILING_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const error = new Error(data.error || data.message || `Government API error (${response.status})`);
    error.statusCode = response.status;
    error.responseBody = data;
    throw error;
  }

  return {
    governmentStatus: data.status === 'ACKNOWLEDGED' ? 'Acknowledged' : 'Submitted',
    governmentReference: data.reference || data.arn || data.acknowledgementNumber || '',
    governmentResponse: JSON.stringify(data),
    filedDate: data.filedDate ? new Date(data.filedDate) : new Date(),
    status: data.status === 'REJECTED' ? 'Rejected' : 'Filed',
  };
}

module.exports = {
  getGovConfig,
  submitFilingToGovernment,
};
