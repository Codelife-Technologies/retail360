import { useCallback, useEffect, useMemo, useState } from 'react';
import { documentsAPI } from '../services/documentsApi';
import { extractList } from '../utils/documentsUtils';
import {
  SOURCE_AI,
  SOURCE_MANUAL,
  buildBreadcrumb,
  buildFolderTree,
  flattenFolderTree,
  sortItems,
} from '../utils/driveLocalStore';

/**
 * Shared folder/document browser for AI + Manual scopes using existing APIs.
 */
export function useFolderBrowser({
  scope = SOURCE_MANUAL,
  enabled = true,
  sort = { field: 'name', dir: 'asc' },
  pageSize = 48,
}) {
  const [folders, setFolders] = useState([]);
  const [unfiledCount, setUnfiledCount] = useState(0);
  const [selectedFolder, setSelectedFolder] = useState('all');
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [childFolders, setChildFolders] = useState([]);
  const [docs, setDocs] = useState([]);
  const [productImages, setProductImages] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({
    category: '',
    department: '',
    employee: '',
    dateFrom: '',
    dateTo: '',
    brand: '',
    sku: '',
    status: 'Active',
  });
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);

  const sourceScope = scope === SOURCE_AI ? SOURCE_AI : SOURCE_MANUAL;

  const folderById = useMemo(() => {
    const map = {};
    folders.forEach((f) => {
      map[String(f._id)] = f;
    });
    return map;
  }, [folders]);

  const folderTree = useMemo(() => buildFolderTree(folders), [folders]);
  const moveTargets = useMemo(() => flattenFolderTree(folderTree), [folderTree]);
  const breadcrumb = useMemo(
    () => buildBreadcrumb(selectedFolder, folderById),
    [selectedFolder, folderById]
  );

  const selectedFolderMeta =
    selectedFolder !== 'all' && selectedFolder !== 'unfiled'
      ? folderById[selectedFolder]
      : null;

  const loadFolders = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await documentsAPI.listFolders({ sourceScope });
      let list = res.data?.folders || [];
      setUnfiledCount(res.data?.unfiledCount || 0);

      if (sourceScope === SOURCE_AI) {
        const hasCatalog = list.some(
          (f) => f.folderKind === 'category' || f.folderKind === 'subcategory'
        );
        if (!hasCatalog) {
          try {
            const synced = await documentsAPI.syncCatalogFolders({ sourceScope });
            list = synced.data?.folders || list;
            setUnfiledCount(synced.data?.unfiledCount ?? res.data?.unfiledCount ?? 0);
          } catch (_e) {
            // non-fatal
          }
        }
      }

      setFolders(list);
      setExpandedIds((prev) => {
        if (prev.size) return prev;
        const next = new Set();
        list.forEach((f) => {
          if ((f.folderKind || 'custom') === 'category' || !f.parentId) {
            next.add(String(f._id));
          }
        });
        return next;
      });
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load folders');
    }
  }, [enabled, sourceScope]);

  const loadPage = useCallback(
    async (pageNum = 1, { append = false } = {}) => {
      if (!enabled) return;
      try {
        if (append) setLoadingMore(true);
        else setLoading(true);
        setError('');

        const isBrowse =
          selectedFolder !== 'all' &&
          selectedFolder !== 'unfiled' &&
          Boolean(folderById[selectedFolder]);

        if (isBrowse) {
          const res = await documentsAPI.browseFolder(selectedFolder, {
            search: search || undefined,
            category: filters.category || undefined,
            dateFrom: filters.dateFrom || undefined,
            dateTo: filters.dateTo || undefined,
            page: pageNum,
            limit: pageSize,
          });
          const nextDocs = res.data?.documents || [];
          const nextChildren = res.data?.children || [];
          const nextProducts = res.data?.productImages || [];
          if (append) {
            setDocs((prev) => [...prev, ...nextDocs]);
          } else {
            setDocs(nextDocs);
            setChildFolders(nextChildren);
            setProductImages(nextProducts);
          }
          setPagination(res.data?.pagination || null);
        } else {
          const res = await documentsAPI.list({
            source: sourceScope,
            status: filters.status || 'Active',
            search: search || undefined,
            category: filters.category || undefined,
            department: filters.department || undefined,
            employee: filters.employee || undefined,
            dateFrom: filters.dateFrom || undefined,
            dateTo: filters.dateTo || undefined,
            brand: filters.brand || undefined,
            sku: filters.sku || undefined,
            folderId: selectedFolder === 'all' ? undefined : selectedFolder,
            page: pageNum,
            limit: pageSize,
          });
          const { data, pagination: pag } = extractList(res);
          if (append) setDocs((prev) => [...prev, ...data]);
          else {
            setDocs(data);
            setChildFolders([]);
            setProductImages([]);
          }
          setPagination(pag);
        }
        setPage(pageNum);
      } catch (e) {
        setError(e.response?.data?.error || 'Failed to load documents');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [
      enabled,
      selectedFolder,
      folderById,
      search,
      filters,
      sourceScope,
      pageSize,
    ]
  );

  useEffect(() => {
    if (!enabled) return;
    loadFolders();
  }, [enabled, loadFolders]);

  useEffect(() => {
    if (!enabled) return;
    setPage(1);
    loadPage(1, { append: false });
  }, [enabled, selectedFolder, search, filters, sourceScope, folders.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(async () => {
    await loadFolders();
    await loadPage(1, { append: false });
  }, [loadFolders, loadPage]);

  const loadMore = useCallback(() => {
    if (!pagination?.hasNextPage || loadingMore || loading) return;
    loadPage(page + 1, { append: true });
  }, [pagination, loadingMore, loading, page, loadPage]);

  const selectFolder = useCallback((id) => {
    setSelectedFolder(String(id));
    setPage(1);
  }, []);

  const toggleExpanded = useCallback((id) => {
    const sid = String(id);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
      return next;
    });
  }, []);

  const syncCatalog = useCallback(async () => {
    if (sourceScope !== SOURCE_AI) return;
    try {
      setSyncing(true);
      const res = await documentsAPI.syncCatalogFolders({ sourceScope });
      setFolders(res.data?.folders || []);
      setUnfiledCount(res.data?.unfiledCount || 0);
    } catch (e) {
      setError(e.response?.data?.error || 'Catalog sync failed');
    } finally {
      setSyncing(false);
    }
  }, [sourceScope]);

  const driveFolders = useMemo(() => {
    if (selectedFolder === 'unfiled') return [];
    if (selectedFolder === 'all') {
      return folderTree.map((node) => node.folder);
    }
    return childFolders || [];
  }, [selectedFolder, folderTree, childFolders]);

  const contentItems = useMemo(() => {
    const folderItems = (driveFolders || []).map((f) => ({
      ...f,
      _driveKind: 'folder',
      _id: f._id,
    }));
    const catalogItems = (productImages || []).map((img) => ({
      ...img,
      _driveKind: 'document',
      _id: img.id || img._id,
      kind: 'product',
      title: img.title,
      documentType: 'Image',
      source: 'Product Catalog',
    }));
    const docItems = (docs || []).map((d) => ({
      ...d,
      _driveKind: 'document',
    }));
    return sortItems([...folderItems, ...catalogItems, ...docItems], sort);
  }, [driveFolders, productImages, docs, sort]);

  return {
    sourceScope,
    folders,
    folderTree,
    folderById,
    moveTargets,
    unfiledCount,
    selectedFolder,
    selectedFolderMeta,
    breadcrumb,
    expandedIds,
    childFolders,
    docs,
    productImages,
    contentItems,
    driveFolders,
    pagination,
    loading,
    loadingMore,
    page,
    search,
    setSearch,
    filters,
    setFilters,
    error,
    setError,
    syncing,
    loadFolders,
    refresh,
    loadMore,
    selectFolder,
    toggleExpanded,
    syncCatalog,
    setSelectedFolder: selectFolder,
  };
}

export { SOURCE_AI, SOURCE_MANUAL };
