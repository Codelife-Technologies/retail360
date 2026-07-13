const XLSX = require('xlsx');

/**
 * Generate Excel template for a module
 * @param {Array} headers - Array of header objects { key, label, required, type }
 * @param {Array} sampleData - Optional sample data rows
 * @returns {Buffer} Excel file buffer
 */
function generateTemplate(headers, sampleData = [], options = {}) {
  // Create workbook
  const workbook = XLSX.utils.book_new();

  // Prepare header row
  const headerRow = headers.map(h => h.label || h.key);

  // Prepare data rows
  const dataRows = [];
  
  // Add sample data if provided
  if (sampleData.length > 0) {
    sampleData.forEach(sample => {
      const row = headers.map(h => sample[h.key] || '');
      dataRows.push(row);
    });
  }

  // Combine header and data
  const worksheetData = [headerRow, ...dataRows];

  // Create worksheet
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

  // Set column widths
  const colWidths = headers.map(() => ({ wch: 20 }));
  worksheet['!cols'] = colWidths;

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');

  if (options.instructions && options.instructions.length > 0) {
    const instructionRows = options.instructions.map((line) => [line]);
    const instructionSheet = XLSX.utils.aoa_to_sheet(instructionRows);
    instructionSheet['!cols'] = [{ wch: 90 }];
    XLSX.utils.book_append_sheet(workbook, instructionSheet, 'Instructions');
  }

  // Generate buffer
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return buffer;
}

/**
 * Export data to Excel
 * @param {Array} data - Data array
 * @param {Array} headers - Header definitions
 * @returns {Buffer} Excel file buffer
 */
function exportToExcel(data, headers) {
  const workbook = XLSX.utils.book_new();
  
  // Prepare header row
  const headerRow = headers.map(h => h.label || h.key);
  
  // Prepare data rows
  const dataRows = data.map(item => {
    return headers.map(h => {
      const value = item[h.key];
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') return JSON.stringify(value);
      return value.toString();
    });
  });
  
  // Combine header and data
  const worksheetData = [headerRow, ...dataRows];
  
  // Create worksheet
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
  
  // Set column widths
  const colWidths = headers.map(() => ({ wch: 20 }));
  worksheet['!cols'] = colWidths;
  
  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
  
  // Generate buffer
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return buffer;
}

/**
 * Build an .xlsx buffer from an array of plain objects (column order follows first row keys).
 * @param {Array<Record<string, unknown>>} rows
 * @param {string} sheetName
 * @returns {Buffer}
 */
function exportJsonRowsToExcelBuffer(rows, sheetName = 'Report') {
  const workbook = XLSX.utils.book_new();
  const safeName = String(sheetName).replace(/[\\/?*[\]:]/g, '').slice(0, 31) || 'Report';

  if (!rows || rows.length === 0) {
    const worksheet = XLSX.utils.aoa_to_sheet([['No data']]);
    worksheet['!cols'] = [{ wch: 20 }];
    XLSX.utils.book_append_sheet(workbook, worksheet, safeName);
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const colCount = Object.keys(rows[0]).length;
  worksheet['!cols'] = Array(Math.max(colCount, 1)).fill({ wch: 22 });
  XLSX.utils.book_append_sheet(workbook, worksheet, safeName);
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * Export multiple sheets to one Excel workbook.
 * @param {Array<{ name: string, headers: Array, data: Array }>} sheets
 * @returns {Buffer}
 */
function exportMultiSheetExcel(sheets) {
  const workbook = XLSX.utils.book_new();

  (sheets || []).forEach((sheet) => {
    const headers = sheet.headers || [];
    const headerRow = headers.map((h) => h.label || h.key);
    const dataRows = (sheet.data || []).map((item) =>
      headers.map((h) => {
        const value = item[h.key];
        if (value === null || value === undefined) return '';
        if (typeof value === 'object') return JSON.stringify(value);
        return value.toString();
      })
    );
    const worksheet = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
    worksheet['!cols'] = headers.map(() => ({ wch: 20 }));
    const safeName = String(sheet.name || 'Sheet').replace(/[\\/?*[\]:]/g, '').slice(0, 31) || 'Sheet';
    XLSX.utils.book_append_sheet(workbook, worksheet, safeName);
  });

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { generateTemplate, exportToExcel, exportJsonRowsToExcelBuffer, exportMultiSheetExcel };

