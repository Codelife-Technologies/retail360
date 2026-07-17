const XLSX = require('xlsx');

function sendWorkbook(res, rows, filename, format) {
  const fmt = String(format || 'xlsx').toLowerCase();
  if (fmt === 'csv') {
    const sheet = XLSX.utils.json_to_sheet(rows);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    return res.send(XLSX.utils.sheet_to_csv(sheet));
  }
  if (fmt === 'pdf') {
    const text = `${filename}\n${new Date().toISOString()}\n\n${rows
      .map((r, i) => `${i + 1}. ${JSON.stringify(r)}`)
      .join('\n')}`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
    return res.send(Buffer.from(text));
  }
  const sheet = XLSX.utils.json_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, filename.slice(0, 31));
  const buffer = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
  return res.send(buffer);
}

module.exports = { sendWorkbook };
