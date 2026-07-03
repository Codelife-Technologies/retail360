/**
 * Standard Indian public holidays (DoPT gazetted + common observances).
 * 2026 dates from DoPT O.M. F.No.12/2/2023-JCA (Annexure-I).
 */

const STANDARD_BY_YEAR = {
  2026: [
    { name: "New Year's Day", month: 1, day: 1, type: 'National' },
    { name: 'Republic Day', month: 1, day: 26, type: 'National' },
    { name: 'Holi', month: 3, day: 4, type: 'National' },
    { name: 'Ram Navami', month: 3, day: 26, type: 'National' },
    { name: 'Good Friday', month: 4, day: 3, type: 'National' },
    { name: 'Eid-ul-Fitr', month: 3, day: 21, type: 'National' },
    { name: 'Buddha Purnima', month: 5, day: 1, type: 'National' },
    { name: 'Bakrid', month: 5, day: 27, type: 'National' },
    { name: 'Independence Day', month: 8, day: 15, type: 'National' },
    { name: 'Janmashtami', month: 9, day: 4, type: 'National' },
    { name: 'Ganesh Chaturthi', month: 9, day: 14, type: 'Regional' },
    { name: 'Gandhi Jayanti', month: 10, day: 2, type: 'National' },
    { name: 'Dussehra', month: 10, day: 20, type: 'National' },
    { name: 'Diwali', month: 11, day: 8, type: 'National' },
    { name: 'Guru Nanak Jayanti', month: 11, day: 24, type: 'National' },
    { name: 'Christmas Day', month: 12, day: 25, type: 'National' },
  ],
};

function getStandardHolidaysForYear(year) {
  return STANDARD_BY_YEAR[year] || [];
}

function getSupportedHolidayYears() {
  return Object.keys(STANDARD_BY_YEAR).map(Number).sort();
}

module.exports = {
  getStandardHolidaysForYear,
  getSupportedHolidayYears,
};
