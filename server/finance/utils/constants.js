const EXPENSE_CATEGORIES = {
  Inventory: ['Purchase', 'Freight', 'Packaging', 'Warehouse'],
  Employee: ['Salary', 'Bonus', 'Incentives', 'PF', 'ESIC'],
  Office: ['Rent', 'Electricity', 'Internet', 'Office Supplies'],
  Marketing: ['Amazon Ads', 'Flipkart Ads', 'Google Ads', 'Facebook Ads'],
  Operations: ['Shipping', 'Courier', 'Fuel', 'Repairs'],
  Software: ['Microsoft', 'Hosting', 'Domain', 'Cursor AI', 'ChatGPT'],
  Finance: ['GST', 'TDS', 'Bank Charges', 'Interest'],
};

const CATEGORY_LIST = Object.keys(EXPENSE_CATEGORIES);
const SUBCATEGORY_LIST = CATEGORY_LIST.flatMap((cat) =>
  EXPENSE_CATEGORIES[cat].map((sub) => `${cat} / ${sub}`)
);

const PAYMENT_MODES = ['Cash', 'Bank Transfer', 'UPI', 'Card', 'Cheque', 'Other'];
const EXPENSE_STATUSES = ['Pending', 'Paid', 'Partial', 'Cancelled'];
const SALES_CHANNELS_COMPARE = ['Amazon', 'Flipkart', 'Website', 'Wholesale', 'Retail'];

function parseDateRange(query = {}) {
  let dateFrom = query.dateFrom ? new Date(query.dateFrom) : null;
  let dateTo = query.dateTo ? new Date(query.dateTo) : null;

  if (query.financialYear) {
    const fy = String(query.financialYear);
    const startYear = Number(fy.split('-')[0]) || Number(fy);
    if (!Number.isNaN(startYear)) {
      dateFrom = new Date(startYear, 3, 1); // 1 Apr
      dateTo = new Date(startYear + 1, 2, 31, 23, 59, 59, 999); // 31 Mar
    }
  }

  if (query.month) {
    const [y, m] = String(query.month).split('-').map(Number);
    if (y && m) {
      dateFrom = new Date(y, m - 1, 1);
      dateTo = new Date(y, m, 0, 23, 59, 59, 999);
    }
  }

  if (dateTo) dateTo.setHours(23, 59, 59, 999);
  return { dateFrom, dateTo };
}

function buildDateQuery(field, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return {};
  const q = {};
  if (dateFrom || dateTo) {
    q[field] = {};
    if (dateFrom) q[field].$gte = dateFrom;
    if (dateTo) q[field].$lte = dateTo;
  }
  return q;
}

function pct(part, whole) {
  if (!whole) return 0;
  return Math.round((part / whole) * 10000) / 100;
}

function monthKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Calendar range covering the last N months (includes current month). */
function getPastMonthsRange(months = 6) {
  const dateTo = new Date();
  dateTo.setHours(23, 59, 59, 999);
  const dateFrom = new Date(dateTo.getFullYear(), dateTo.getMonth() - (months - 1), 1);
  dateFrom.setHours(0, 0, 0, 0);
  return { dateFrom, dateTo };
}

function getPastMonthKeys(months = 6, endDate = new Date()) {
  const keys = [];
  const end = new Date(endDate);
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
    keys.push(monthKey(d));
  }
  return keys;
}

function toDateInputValue(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

module.exports = {
  EXPENSE_CATEGORIES,
  CATEGORY_LIST,
  SUBCATEGORY_LIST,
  PAYMENT_MODES,
  EXPENSE_STATUSES,
  SALES_CHANNELS_COMPARE,
  parseDateRange,
  buildDateQuery,
  pct,
  monthKey,
  getPastMonthsRange,
  getPastMonthKeys,
  toDateInputValue,
};
