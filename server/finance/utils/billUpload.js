const path = require('path');
const fs = require('fs');
const multer = require('multer');

const uploadDir = path.join(__dirname, '../../uploads/finance/bills');
fs.mkdirSync(uploadDir, { recursive: true });

const billUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const safe = String(file.originalname || 'bill').replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mimeOk = /^(image\/|application\/pdf)/i.test(file.mimetype || '');
    const nameOk = /\.(pdf|jpe?g|png|webp|gif)$/i.test(file.originalname || '');
    if (mimeOk || nameOk) return cb(null, true);
    return cb(new Error('Only PDF or image bills are allowed'));
  },
});

function billFromFile(file) {
  if (!file) return null;
  return {
    fileName: file.filename,
    originalName: file.originalname,
    filePath: `finance/bills/${file.filename}`,
    mimeType: file.mimetype,
    fileSize: file.size,
    uploadedAt: new Date(),
  };
}

function removeBillFile(bill) {
  if (!bill?.fileName) return;
  const full = path.join(uploadDir, bill.fileName);
  fs.unlink(full, () => {});
}

function applyBillToBody(body, file, existingBill) {
  const next = { ...body };
  delete next.bill;
  delete next.removeBill;

  if (file) {
    if (existingBill) removeBillFile(existingBill);
    next.bill = billFromFile(file);
    return next;
  }

  if (String(body.removeBill || '').toLowerCase() === 'true') {
    if (existingBill) removeBillFile(existingBill);
    next.bill = {
      fileName: '',
      originalName: '',
      filePath: '',
      mimeType: '',
      fileSize: 0,
      uploadedAt: undefined,
    };
  }

  return next;
}

function coerceFinanceNumbers(body) {
  const next = { ...body };
  if (next.amount != null && next.amount !== '') next.amount = Number(next.amount) || 0;
  if (next.gst != null && next.gst !== '') next.gst = Number(next.gst) || 0;
  return next;
}

module.exports = {
  billUpload,
  billFromFile,
  removeBillFile,
  applyBillToBody,
  coerceFinanceNumbers,
};
