import { useCallback, useMemo, useState } from 'react';

export function useDocumentSelection() {
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [anchorId, setAnchorId] = useState(null);

  const clear = useCallback(() => {
    setSelectedIds(new Set());
    setAnchorId(null);
  }, []);

  const isSelected = useCallback((id) => selectedIds.has(String(id)), [selectedIds]);

  const toggle = useCallback((id, { additive = false } = {}) => {
    const sid = String(id);
    setSelectedIds((prev) => {
      const next = additive ? new Set(prev) : new Set();
      if (next.has(sid) && additive) next.delete(sid);
      else next.add(sid);
      return next;
    });
    setAnchorId(sid);
  }, []);

  const selectOnly = useCallback((id) => {
    const sid = String(id);
    setSelectedIds(new Set([sid]));
    setAnchorId(sid);
  }, []);

  const selectMany = useCallback((ids) => {
    setSelectedIds(new Set((ids || []).map(String)));
  }, []);

  const selectedList = useMemo(() => Array.from(selectedIds), [selectedIds]);

  return {
    selectedIds,
    selectedList,
    anchorId,
    isSelected,
    toggle,
    selectOnly,
    selectMany,
    clear,
  };
}
