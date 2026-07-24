import { useCallback, useEffect, useState } from 'react';
import {
  getStarredIds,
  toggleStarred as toggleStarredStore,
} from '../utils/driveLocalStore';

export function useLocalStars(userId) {
  const [starred, setStarred] = useState(() => getStarredIds(userId));

  useEffect(() => {
    setStarred(getStarredIds(userId));
  }, [userId]);

  const toggle = useCallback(
    (kind, id) => {
      const next = toggleStarredStore(userId, kind, id);
      setStarred(next);
      return next;
    },
    [userId]
  );

  const isStarred = useCallback(
    (kind, id) => {
      const key = kind === 'folder' ? 'folders' : 'documents';
      return (starred[key] || []).includes(String(id));
    },
    [starred]
  );

  return { starred, toggle, isStarred };
}
