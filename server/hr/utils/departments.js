/** Standard employee departments. */
const EMPLOYEE_DEPARTMENTS = ['Warehouse', 'Stocks', 'Accounts', 'HR'];

function mergeDepartments(existing = []) {
  return [...new Set([...EMPLOYEE_DEPARTMENTS, ...existing.filter(Boolean)])].sort((a, b) =>
    a.localeCompare(b)
  );
}

module.exports = { EMPLOYEE_DEPARTMENTS, mergeDepartments };
