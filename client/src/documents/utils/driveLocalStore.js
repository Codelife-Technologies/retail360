const PREFIX = 'retail360_drive';

function userKey(userId, suffix) {
  const uid = String(userId || 'anon');
  return `${PREFIX}:${uid}:${suffix}`;
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (_e) {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_e) {
    // quota / private mode — ignore
  }
}

export function getStarredIds(userId) {
  const data = readJson(userKey(userId, 'starred'), { folders: [], documents: [] });
  return {
    folders: Array.isArray(data.folders) ? data.folders.map(String) : [],
    documents: Array.isArray(data.documents) ? data.documents.map(String) : [],
  };
}

export function setStarredIds(userId, next) {
  writeJson(userKey(userId, 'starred'), {
    folders: (next.folders || []).map(String),
    documents: (next.documents || []).map(String),
  });
}

export function toggleStarred(userId, kind, id) {
  const current = getStarredIds(userId);
  const key = kind === 'folder' ? 'folders' : 'documents';
  const sid = String(id);
  const list = current[key];
  const idx = list.indexOf(sid);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(sid);
  const next = { ...current, [key]: list };
  setStarredIds(userId, next);
  return next;
}

export function isStarred(userId, kind, id) {
  const current = getStarredIds(userId);
  const key = kind === 'folder' ? 'folders' : 'documents';
  return current[key].includes(String(id));
}

/** Recent entries: [{ id, kind: 'document'|'folder', at }] newest first, max 50 */
export function getRecent(userId) {
  const list = readJson(userKey(userId, 'recent'), []);
  return Array.isArray(list) ? list : [];
}

export function pushRecent(userId, entry) {
  if (!entry?.id) return getRecent(userId);
  const list = getRecent(userId).filter(
    (e) => !(String(e.id) === String(entry.id) && e.kind === entry.kind)
  );
  list.unshift({
    id: String(entry.id),
    kind: entry.kind === 'folder' ? 'folder' : 'document',
    at: Date.now(),
    title: entry.title || '',
  });
  const trimmed = list.slice(0, 50);
  writeJson(userKey(userId, 'recent'), trimmed);
  return trimmed;
}

export function getViewMode(userId) {
  return readJson(userKey(userId, 'viewMode'), 'grid') === 'list' ? 'list' : 'grid';
}

export function setViewMode(userId, mode) {
  writeJson(userKey(userId, 'viewMode'), mode === 'list' ? 'list' : 'grid');
}

export function getSortPrefs(userId) {
  return readJson(userKey(userId, 'sort'), { field: 'name', dir: 'asc' });
}

export function setSortPrefs(userId, prefs) {
  writeJson(userKey(userId, 'sort'), prefs);
}

export function buildFolderTree(folders) {
  const byParent = new Map();
  (folders || []).forEach((folder) => {
    const key = folder.parentId ? String(folder.parentId) : 'root';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(folder);
  });
  byParent.forEach((list) => {
    list.sort((a, b) => {
      const kindOrder = { category: 0, subcategory: 1, sku: 2, custom: 3 };
      const ka = kindOrder[a.folderKind || 'custom'] ?? 3;
      const kb = kindOrder[b.folderKind || 'custom'] ?? 3;
      if (ka !== kb) return ka - kb;
      return (a.sortOrder - b.sortOrder) || String(a.name).localeCompare(String(b.name));
    });
  });

  const walk = (parentKey, depth) => {
    const nodes = byParent.get(parentKey) || [];
    return nodes.map((folder) => ({
      folder,
      depth,
      children: walk(String(folder._id), depth + 1),
    }));
  };

  return walk('root', 0);
}

export function flattenFolderTree(tree, depth = 0) {
  const rows = [];
  (tree || []).forEach((node) => {
    rows.push({
      ...node.folder,
      depth,
      label: `${'— '.repeat(depth)}${node.folder.name}`,
    });
    rows.push(...flattenFolderTree(node.children, depth + 1));
  });
  return rows;
}

export function buildBreadcrumb(selectedFolder, folderById) {
  if (selectedFolder === 'all' || !selectedFolder) {
    return [{ id: 'all', name: 'My Drive' }];
  }
  if (selectedFolder === 'unfiled') {
    return [
      { id: 'all', name: 'My Drive' },
      { id: 'unfiled', name: 'Unfiled' },
    ];
  }
  const parts = [];
  let cursor = folderById[selectedFolder];
  const guard = new Set();
  while (cursor && !guard.has(String(cursor._id))) {
    guard.add(String(cursor._id));
    parts.unshift({ id: String(cursor._id), name: cursor.name });
    cursor = cursor.parentId ? folderById[String(cursor.parentId)] : null;
  }
  return [{ id: 'all', name: 'My Drive' }, ...parts];
}

export function sortItems(items, { field = 'name', dir = 'asc' } = {}) {
  const mult = dir === 'desc' ? -1 : 1;
  const get = (item) => {
    if (item._driveKind === 'folder') {
      if (field === 'name') return String(item.name || '').toLowerCase();
      if (field === 'created') return new Date(item.createdAt || 0).getTime();
      if (field === 'updated') return new Date(item.updatedAt || item.createdAt || 0).getTime();
      if (field === 'size') return 0;
      if (field === 'owner') return String(item.createdBy || '').toLowerCase();
      if (field === 'sku') return String(item.linkedSku || '').toLowerCase();
      if (field === 'department') return String(item.department || '').toLowerCase();
      return String(item.name || '').toLowerCase();
    }
    if (field === 'name') return String(item.title || item.fileName || '').toLowerCase();
    if (field === 'created') return new Date(item.createdAt || 0).getTime();
    if (field === 'updated') return new Date(item.updatedAt || item.createdAt || 0).getTime();
    if (field === 'size') return Number(item.fileSize) || 0;
    if (field === 'owner') return String(item.uploadedBy || '').toLowerCase();
    if (field === 'sku') return String(item.sku || '').toLowerCase();
    if (field === 'department') return String(item.department || '').toLowerCase();
    return String(item.title || item.fileName || '').toLowerCase();
  };
  return [...items].sort((a, b) => {
    // folders first
    if (a._driveKind !== b._driveKind) {
      return a._driveKind === 'folder' ? -1 : 1;
    }
    const va = get(a);
    const vb = get(b);
    if (va < vb) return -1 * mult;
    if (va > vb) return 1 * mult;
    return 0;
  });
}

export const SOURCE_AI = 'AI Generator';
export const SOURCE_MANUAL = 'Manual Upload';

export function subTabToView(subTab) {
  switch (subTab) {
    case 'ai-generated-images':
      return { view: 'browse', scope: SOURCE_AI };
    case 'employee-documents':
      return { view: 'browse', scope: SOURCE_MANUAL };
    case 'documents-trash':
      return { view: 'trash', scope: null };
    case 'storage-analytics':
      return { view: 'storage', scope: null };
    case 'documents-settings':
      return { view: 'settings', scope: null };
    case 'documents-dashboard':
    default:
      return { view: 'browse', scope: SOURCE_MANUAL };
  }
}
