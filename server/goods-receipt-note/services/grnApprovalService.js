const { DEFAULT_APPROVAL_CHAIN } = require('../validations/grnValidation');

function initApprovalChain(existing = []) {
  if (existing?.length) return existing;
  return DEFAULT_APPROVAL_CHAIN.map((step) => ({
    ...step,
    status: 'pending',
  }));
}

function getCurrentApprovalStep(approvals) {
  return (approvals || []).find((a) => a.status === 'pending');
}

function processApproval(grn, { approverName, designation, status, comments, digitalSignature }) {
  const step = getCurrentApprovalStep(grn.approvals);
  if (!step) {
    throw new Error('No pending approval step found');
  }

  step.approverName = approverName || step.approverName;
  step.designation = designation || step.designation;
  step.status = status;
  step.comments = comments || '';
  step.approvalDate = new Date();
  if (digitalSignature) step.digitalSignature = digitalSignature;

  if (status === 'rejected' || status === 'returned_for_correction') {
    grn.receiptStatus = status === 'rejected' ? 'cancelled' : 'draft';
    return { allApproved: false, rejected: true };
  }

  const remaining = grn.approvals.filter((a) => a.status === 'pending');
  if (remaining.length === 0) {
    grn.receiptStatus = 'approved';
    grn.approvedByName = approverName;
    grn.approvedAt = new Date();
    return { allApproved: true, rejected: false };
  }

  return { allApproved: false, rejected: false };
}

module.exports = {
  initApprovalChain,
  getCurrentApprovalStep,
  processApproval,
  DEFAULT_APPROVAL_CHAIN,
};
