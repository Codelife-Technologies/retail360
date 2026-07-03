/** Standard employee departments (mirrors server/hr/utils/departments.js). */
export const EMPLOYEE_DEPARTMENTS = ['Warehouse', 'Stocks', 'Accounts', 'HR'];

export function mergeDepartments(existing = []) {
  return [...new Set([...EMPLOYEE_DEPARTMENTS, ...existing.filter(Boolean)])].sort((a, b) =>
    a.localeCompare(b)
  );
}
