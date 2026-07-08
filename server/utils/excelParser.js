const XLSX = require('xlsx');

/**
 * Parse Excel file and return data as array of objects
 * @param {Buffer} fileBuffer - Excel file buffer
 * @param {Object} options - Parsing options
 * @returns {Array} Array of objects with row data
 */
function parseExcel(fileBuffer, options = {}) {
  try {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, {
      raw: false,
      defval: '',
      ...options
    });
    return data;
  } catch (error) {
    throw new Error(`Failed to parse Excel file: ${error.message}`);
  }
}

/**
 * Validate Excel data against schema
 * @param {Array} data - Parsed Excel data
 * @param {Object} schema - Validation schema
 * @returns {Object} Validation result with errors
 */
function validateExcelData(data, schema) {
  const errors = [];
  const requiredFields = schema.required || [];
  const fieldTypes = schema.types || {};
  const uniqueFields = schema.unique || [];

  data.forEach((row, index) => {
    const rowNum = index + 2; // +2 because Excel rows start at 1 and header is row 1

    // Check required fields
    requiredFields.forEach(field => {
      if (!row[field] || row[field].toString().trim() === '') {
        errors.push({
          row: rowNum,
          field: field,
          message: `${field} is required`,
          data: row
        });
      }
    });

    // Check data types
    Object.keys(fieldTypes).forEach(field => {
      if (row[field] && row[field].toString().trim() !== '') {
        const expectedType = fieldTypes[field];
        const value = row[field];

        if (expectedType === 'number' && isNaN(parseFloat(value))) {
          errors.push({
            row: rowNum,
            field: field,
            message: `${field} must be a number`,
            data: row
          });
        } else if (expectedType === 'date' && isNaN(Date.parse(value))) {
          errors.push({
            row: rowNum,
            field: field,
            message: `${field} must be a valid date`,
            data: row
          });
        } else if (expectedType === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          errors.push({
            row: rowNum,
            field: field,
            message: `${field} must be a valid email`,
            data: row
          });
        }
      }
    });
  });

  return {
    isValid: errors.length === 0,
    errors
  };
}

function buildImportErrorSummary(errors = []) {
  return errors.reduce((acc, err) => {
    const key = (err.message || 'Unknown error').split('.')[0].slice(0, 120);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

module.exports = { parseExcel, validateExcelData, buildImportErrorSummary };

