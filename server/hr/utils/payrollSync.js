const Payroll = require('../models/Payroll');

function calcNetSalary(basicSalary, allowances = 0, deductions = 0) {
  return Math.max((Number(basicSalary) || 0) + (Number(allowances) || 0) - (Number(deductions) || 0), 0);
}

/** Sync pending payroll rows for one employee from their current basic salary. */
async function syncPendingPayrollsForEmployee(employeeId, basicSalary) {
  const basic = Number(basicSalary) || 0;
  const pendingRows = await Payroll.find({
    employee: employeeId,
    paymentStatus: 'Pending',
  });

  if (!pendingRows.length) return 0;

  let updated = 0;
  for (const row of pendingRows) {
    const netSalary = calcNetSalary(basic, row.allowances, row.deductions);
    if (row.basicSalary !== basic || row.netSalary !== netSalary) {
      row.basicSalary = basic;
      row.netSalary = netSalary;
      await row.save();
      updated += 1;
    }
  }
  return updated;
}

/** Sync all pending payroll rows matching a query from employee master salaries. */
async function syncPendingPayrollsForQuery(query = {}) {
  const Employee = require('../models/Employee');
  const pendingRows = await Payroll.find({ ...query, paymentStatus: 'Pending' }).select(
    'employee basicSalary allowances deductions netSalary'
  );

  if (!pendingRows.length) return 0;

  const employeeIds = [...new Set(pendingRows.map((row) => String(row.employee)))];
  const employees = await Employee.find({ _id: { $in: employeeIds } }).select('basicSalary').lean();
  const salaryByEmployee = new Map(
    employees.map((emp) => [String(emp._id), Number(emp.basicSalary) || 0])
  );

  let updated = 0;
  for (const row of pendingRows) {
    const basic = salaryByEmployee.get(String(row.employee)) ?? 0;
    const netSalary = calcNetSalary(basic, row.allowances, row.deductions);
    if (row.basicSalary !== basic || row.netSalary !== netSalary) {
      await Payroll.updateOne(
        { _id: row._id },
        { $set: { basicSalary: basic, netSalary } }
      );
      updated += 1;
    }
  }
  return updated;
}

module.exports = {
  calcNetSalary,
  syncPendingPayrollsForEmployee,
  syncPendingPayrollsForQuery,
};
