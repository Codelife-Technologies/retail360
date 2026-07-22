import React, { useMemo, useState } from 'react';
import {
  ACCESS_PACKS,
  groupPermissionsByModule,
  permissionIdsForCodes,
} from './accessPacks';
import './PermissionPicker.css';

/**
 * Always-visible module permission list (no collapse).
 * Global CSS kept breaking expand/collapse; a flat grouped list is reliable.
 */
function PermissionPicker({
  permissions = [],
  selectedIds = [],
  onChange,
  showPacks = true,
}) {
  const [search, setSearch] = useState('');

  const selectedSet = useMemo(
    () => new Set((selectedIds || []).map(String)),
    [selectedIds]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return permissions || [];
    return (permissions || []).filter((p) => {
      const hay = `${p.name || ''} ${p.code || ''} ${p.module || ''} ${p.description || ''}`.toLowerCase();
      return hay.includes(term);
    });
  }, [permissions, search]);

  const groups = useMemo(() => groupPermissionsByModule(filtered), [filtered]);

  const setSelected = (nextIds) => {
    onChange?.(Array.from(new Set(nextIds.map(String))));
  };

  const toggleOne = (id) => {
    const key = String(id);
    if (selectedSet.has(key)) {
      setSelected([...selectedSet].filter((x) => x !== key));
    } else {
      setSelected([...selectedSet, key]);
    }
  };

  const toggleModulePerms = (modulePerms, selectAll) => {
    const ids = modulePerms.map((p) => String(p._id));
    if (selectAll) {
      setSelected([...selectedSet, ...ids]);
    } else {
      const drop = new Set(ids);
      setSelected([...selectedSet].filter((id) => !drop.has(id)));
    }
  };

  const applyPack = (pack) => {
    const packIds = permissionIdsForCodes(permissions, pack.permissionCodes).map(String);
    setSelected([...selectedSet, ...packIds]);
  };

  return (
    <div className="um-perm-picker">
      <div className="um-perm-picker-toolbar">
        <div className="um-perm-search">
          <span aria-hidden="true">🔍</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search permissions (e.g. documents, gemini, sales)…"
            aria-label="Search permissions"
          />
        </div>
        <span className="um-perm-count">{selectedSet.size} selected</span>
        <button
          type="button"
          className="um-perm-link-btn"
          onClick={() => setSelected([])}
        >
          Clear all
        </button>
      </div>

      {showPacks ? (
        <div className="um-access-packs">
          <div className="um-access-packs-label">Quick access packs</div>
          <div className="um-access-packs-row">
            {ACCESS_PACKS.map((pack) => (
              <button
                key={pack.id}
                type="button"
                className="um-access-pack-btn"
                title={pack.description}
                onClick={() => applyPack(pack)}
              >
                + {pack.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="um-perm-groups">
        {groups.length === 0 ? (
          <div className="um-perm-empty">
            {(permissions || []).length === 0
              ? 'Loading permissions…'
              : 'No permissions match your search.'}
          </div>
        ) : (
          groups.map((group) => {
            const moduleKey = String(group.moduleKey || 'other');
            const ids = group.permissions.map((p) => String(p._id));
            const selectedInGroup = ids.filter((id) => selectedSet.has(id)).length;
            const allSelected = selectedInGroup === ids.length && ids.length > 0;

            return (
              <section key={moduleKey} className="um-perm-group is-open">
                <header className="um-perm-group-head">
                  <div className="um-perm-group-toggle" style={{ cursor: 'default' }}>
                    <strong className="um-perm-group-title">{group.label}</strong>
                    <span className="um-perm-group-meta">
                      {selectedInGroup}/{ids.length}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="um-perm-link-btn"
                    onClick={() => toggleModulePerms(group.permissions, !allSelected)}
                  >
                    {allSelected ? 'Clear module' : 'Select module'}
                  </button>
                </header>

                <ul className="um-perm-group-body">
                  {group.permissions.map((p) => {
                    const id = String(p._id);
                    const checked = selectedSet.has(id);
                    return (
                      <li key={id} className="um-perm-li">
                        <label className={`um-perm-row${checked ? ' is-checked' : ''}`}>
                          <input
                            type="checkbox"
                            className="um-perm-checkbox"
                            checked={checked}
                            onChange={() => toggleOne(p._id)}
                          />
                          <span className="um-perm-item-text">
                            <span className="um-perm-item-name">
                              {p.name || p.code || 'Permission'}
                            </span>
                            <span className="um-perm-item-code">{p.code}</span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

export default PermissionPicker;
