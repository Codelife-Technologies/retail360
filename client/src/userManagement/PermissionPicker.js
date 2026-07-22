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
  const [packFeedback, setPackFeedback] = useState('');

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

  const packCoverage = useMemo(() => {
    const map = {};
    ACCESS_PACKS.forEach((pack) => {
      const packIds = permissionIdsForCodes(permissions, pack.permissionCodes).map(String);
      const selectedCount = packIds.filter((id) => selectedSet.has(id)).length;
      map[pack.id] = {
        packIds,
        selectedCount,
        total: packIds.length,
        allOn: packIds.length > 0 && selectedCount === packIds.length,
      };
    });
    return map;
  }, [permissions, selectedSet]);

  const applyPack = (pack) => {
    const coverage = packCoverage[pack.id] || {
      packIds: permissionIdsForCodes(permissions, pack.permissionCodes).map(String),
    };
    const packIds = coverage.packIds || [];

    if (!permissions.length) {
      setPackFeedback('Permissions are still loading…');
      return;
    }
    if (packIds.length === 0) {
      setPackFeedback(`No matching permissions found for “${pack.label}”.`);
      return;
    }

    const missing = packIds.filter((id) => !selectedSet.has(id));
    if (missing.length === 0) {
      setPackFeedback(`“${pack.label}” is already fully selected.`);
      return;
    }

    setSelected([...selectedSet, ...packIds]);
    setSearch('');
    setPackFeedback(`Added ${missing.length} permission${missing.length === 1 ? '' : 's'} from “${pack.label}”.`);
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
            {ACCESS_PACKS.map((pack) => {
              const coverage = packCoverage[pack.id];
              const active = coverage?.allOn;
              return (
                <button
                  key={pack.id}
                  type="button"
                  className={`um-access-pack-btn${active ? ' is-active' : ''}`}
                  title={pack.description}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    applyPack(pack);
                  }}
                >
                  {active ? '✓ ' : '+ '}
                  {pack.label}
                </button>
              );
            })}
          </div>
          {packFeedback ? (
            <div className="um-access-pack-feedback" role="status">
              {packFeedback}
            </div>
          ) : null}
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
