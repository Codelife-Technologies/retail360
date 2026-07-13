const ROLE_SHORT_LABELS = {
  admin: 'Admin',
  super_admin: 'Admin',
  hr: 'HR',
  accounts: 'Acct',
  warehouse: 'WH',
  employee: 'Emp',
};

const GROUP_SHORT_LABELS = {
  admin: 'Admin',
  hr: 'HR',
  accounts: 'Acct',
  warehouse: 'WH',
};

export function getShortRoleLabel(role, maxLength = 6) {
  const code = typeof role === 'object'
    ? String(role.code || role.name || '').trim()
    : String(role || '').trim();
  if (!code) return '—';

  const key = code.toLowerCase();
  if (ROLE_SHORT_LABELS[key]) return ROLE_SHORT_LABELS[key];
  if (code.length <= maxLength) return code;
  return `${code.slice(0, Math.max(maxLength - 1, 1))}…`;
}

export function getShortGroupLabel(group, maxLength = 6) {
  const code = typeof group === 'object'
    ? String(group.code || group.name || '').trim()
    : String(group || '').trim();
  if (!code) return '—';

  const key = code.toLowerCase();
  if (GROUP_SHORT_LABELS[key]) return GROUP_SHORT_LABELS[key];
  if (code.length <= maxLength) return code;
  return `${code.slice(0, Math.max(maxLength - 1, 1))}…`;
}

export function getRoleTitle(role) {
  if (typeof role !== 'object') return String(role || '');
  return [role.name, role.code].filter(Boolean).join(' · ');
}

export function getGroupTitle(group) {
  if (typeof group !== 'object') return String(group || '');
  return [group.name, group.code].filter(Boolean).join(' · ');
}
