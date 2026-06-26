import { useState, useEffect, useCallback } from 'react';
import { grnAPI } from '../services/grnApi';

export function useGrnDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await grnAPI.getDashboard();
      setStats(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { stats, loading, error, refresh };
}

export function useGrnList(initialFilters = {}) {
  const [grns, setGrns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(initialFilters);

  const fetchList = useCallback(async () => {
    try {
      setLoading(true);
      const res = await grnAPI.getAll(filters);
      setGrns(res.data?.data || res.data || []);
    } catch (err) {
      console.error(err);
      setGrns([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  return { grns, loading, filters, setFilters, refresh: fetchList };
}
