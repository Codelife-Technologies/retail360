const Department = require('../models/Department');
const Designation = require('../models/Designation');
const PayrollComponent = require('../models/PayrollComponent');
const Employee = require('../models/Employee');
const { mergeDepartments } = require('./departments');
const {
  DEFAULT_DEPARTMENTS,
  DEFAULT_DESIGNATIONS,
  DEFAULT_PAYROLL_COMPONENTS,
} = require('./hrMasterDefaults');

async function seedIfEmpty() {
  const [deptCount, desigCount, payCount] = await Promise.all([
    Department.countDocuments(),
    Designation.countDocuments(),
    PayrollComponent.countDocuments(),
  ]);

  const result = { departments: 0, designations: 0, payrollComponents: 0 };

  if (deptCount === 0) {
    const existingNames = await Employee.distinct('department');
    const names = mergeDepartments(existingNames);
    const docs = names.map((name, index) => {
      const preset = DEFAULT_DEPARTMENTS.find(
        (row) => row.name.toLowerCase() === String(name).toLowerCase()
      );
      return {
        code: preset?.code || String(name).slice(0, 4).toUpperCase().replace(/\s/g, '') || `D${index + 1}`,
        name,
        description: preset?.description || '',
        isActive: true,
        sortOrder: preset?.sortOrder ?? index + 1,
      };
    });
    if (docs.length) {
      await Department.insertMany(docs, { ordered: false }).catch(() => null);
      result.departments = docs.length;
    }
  }

  if (desigCount === 0) {
    const existingDesignations = (await Employee.distinct('designation')).filter(Boolean);
    const fromEmployees = existingDesignations.map((name, index) => ({
      name,
      department: '',
      grade: '',
      description: '',
      isActive: true,
      sortOrder: 100 + index,
    }));
    const docs = [...DEFAULT_DESIGNATIONS];
    fromEmployees.forEach((row) => {
      if (!docs.some((d) => d.name.toLowerCase() === row.name.toLowerCase())) {
        docs.push(row);
      }
    });
    if (docs.length) {
      await Designation.insertMany(docs, { ordered: false }).catch(() => null);
      result.designations = docs.length;
    }
  }

  if (payCount === 0) {
    await PayrollComponent.insertMany(DEFAULT_PAYROLL_COMPONENTS, { ordered: false }).catch(() => null);
    result.payrollComponents = DEFAULT_PAYROLL_COMPONENTS.length;
  }

  return result;
}

async function syncMissingDefaults() {
  let departmentsAdded = 0;
  let designationsAdded = 0;
  let payrollAdded = 0;

  for (const row of DEFAULT_DEPARTMENTS) {
    const exists = await Department.findOne({
      $or: [{ code: row.code }, { name: row.name }],
    });
    if (!exists) {
      await Department.create(row);
      departmentsAdded += 1;
    }
  }
  for (const row of DEFAULT_DESIGNATIONS) {
    const exists = await Designation.findOne({
      name: row.name,
      department: row.department || '',
    });
    if (!exists) {
      await Designation.create(row);
      designationsAdded += 1;
    }
  }
  for (const row of DEFAULT_PAYROLL_COMPONENTS) {
    const exists = await PayrollComponent.findOne({ code: row.code });
    if (!exists) {
      await PayrollComponent.create(row);
      payrollAdded += 1;
    }
  }

  return { departmentsAdded, designationsAdded, payrollAdded };
}

module.exports = {
  seedIfEmpty,
  syncMissingDefaults,
  DEFAULT_DEPARTMENTS,
  DEFAULT_DESIGNATIONS,
  DEFAULT_PAYROLL_COMPONENTS,
};
