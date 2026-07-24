import { useCallback, useEffect, useState } from 'react';
import { getRecent, pushRecent as pushRecentStore } from '../utils/driveLocalStore';

export function useLocalRecent(userId) {
  const [recent, setRecent] = useState(() => getRecent(userId));

  useEffect(() => {
    setRecent(getRecent(userId));
  }, [userId]);

  const push = useCallback(
    (entry) => {
      const next = pushRecentStore(userId, entry);
      setRecent(next);
      return next;
    },
    [userId]
  );

  const refresh = useCallback(() => {
    setRecent(getRecent(userId));
  }, [userId]);

  return { recent, push, refresh };
}
