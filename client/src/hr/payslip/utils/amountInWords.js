const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];

const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(num) {
  if (num < 20) return ONES[num];
  const ten = Math.floor(num / 10);
  const one = num % 10;
  return `${TENS[ten]}${one ? ` ${ONES[one]}` : ''}`.trim();
}

function threeDigits(num) {
  if (num < 100) return twoDigits(num);
  const hundred = Math.floor(num / 100);
  const rest = num % 100;
  return `${ONES[hundred]} Hundred${rest ? ` ${twoDigits(rest)}` : ''}`.trim();
}

function convertIndianGroup(num, label) {
  if (!num) return '';
  return `${threeDigits(num)} ${label}`.trim();
}

function convertNumberToWords(num) {
  if (num === 0) return 'Zero';

  const crore = Math.floor(num / 10000000);
  const lakh = Math.floor((num % 10000000) / 100000);
  const thousand = Math.floor((num % 100000) / 1000);
  const remainder = num % 1000;

  const parts = [
    convertIndianGroup(crore, 'Crore'),
    convertIndianGroup(lakh, 'Lakh'),
    convertIndianGroup(thousand, 'Thousand'),
    remainder ? threeDigits(remainder) : '',
  ].filter(Boolean);

  return parts.join(' ');
}

/** Convert INR amount to Indian English words. */
export function amountInWordsINR(amount) {
  const value = Math.round(Number(amount) || 0);
  if (value === 0) return 'Rupees Zero Only';
  return `Rupees ${convertNumberToWords(value)} Only`;
}
