import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { documentsAPI } from './services/documentsApi';
import { extractList, formatBytes } from './utils/documentsUtils';
import {
  SOURCE_AI,
  SOURCE_MANUAL,
  getViewMode,
  setViewMode as persistViewMode,
  getSortPrefs,
  setSortPrefs,
  subTabToView,
} from './utils/driveLocalStore';
import { useFolderBrowser } from './hooks/useFolderBrowser';
import { useDocumentSelection } from './hooks/useDocumentSelection';
import { useLocalStars } from './hooks/useLocalStars';
import { useLocalRecent } from './hooks/useLocalRecent';
import { useUploadQueue } from './hooks/useUploadQueue';
import { useDriveShortcuts } from './hooks/useDriveShortcuts';
import DriveSidebar from './components/DriveSidebar';
import DriveTopBar from './components/DriveTopBar';
import DriveBreadcrumb from './components/DriveBreadcrumb';
import DriveToolbar from './components/DriveToolbar';
import FolderTree from './components/FolderTree';
import ContentGrid from './components/ContentGrid';
import ContentList from './components/ContentList';
import ContextMenu from './components/ContextMenu';
import DetailsPanel from './components/DetailsPanel';
import PreviewModal from './components/PreviewModal';
import UploadQueue from './components/UploadQueue';
import EmptyState from './components/EmptyState';
import ShareDialog from './components/ShareDialog';
import DocumentsSettings from './pages/DocumentsSettings';
import './DocumentsDrive.css';

function navFromSubTab(subTab) {
  switch (subTab) {
    case 'ai-generated-images':
      return 'ai';
    case 'employee-documents':
      return 'employee';
    case 'documents-trash':
      return 'trash';
    case 'storage-analytics':
      return 'storage';
    case 'documents-settings':
      return 'settings';
    default:
      return 'my-drive';
  }
}

function DocumentsDriveShell({ subTab = 'documents-dashboard', onNavigate }) {
  const { user, hasPermission } = useAuth();
  const userId = String(user?.id || user?._id || 'anon');

  const initial = subTabToView(subTab);
  const [activeNav, setActiveNav] = useState(() => navFromSubTab(subTab));
  const [scope, setScope] = useState(initial.scope || SOURCE_MANUAL);
  const [viewMode, setViewMode] = useState(() => getViewMode(userId));
  const [sort, setSort] = useState(() => getSortPrefs(userId));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [detailsItem, setDetailsItem] = useState(null);
  const [detailsKind, setDetailsKind] = useState('document');
  const [preview, setPreview] = useState(null);
  const [toast, setToast] = useState('');
  const [contextMenu, setContextMenu] = useState(null);
  const [dropFolderId, setDropFolderId] = useState(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderPersonal, setNewFolderPersonal] = useState(false);
  const [newFolderVisible, setNewFolderVisible] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [moveTarget, setMoveTarget] = useState(null);
  const [shareTarget, setShareTarget] = useState(null);
  const [storageLabel, setStorageLabel] = useState('');
  const [specialItems, setSpecialItems] = useState([]);
  const [specialLoading, setSpecialLoading] = useState(false);
  const [analytics, setAnalytics] = useState(null);

  const searchRef = useRef(null);
  const fileInputRef = useRef(null);
  const dragPayload = useRef(null);

  const stars = useLocalStars(userId);
  const recent = useLocalRecent(userId);
  const selection = useDocumentSelection();

  const browseEnabled = activeNav === 'my-drive' || activeNav === 'ai' || activeNav === 'employee';

  const browser = useFolderBrowser({
    scope,
    enabled: browseEnabled,
    sort,
  });

  const uploadFolderId =
    browser.selectedFolder === 'all' || browser.selectedFolder === 'unfiled'
      ? ''
      : browser.selectedFolder;

  const uploads = useUploadQueue({
    scope,
    folderId: uploadFolderId,
    onComplete: () => browser.refresh(),
  });

  useEffect(() => {
    const mapped = subTabToView(subTab);
    setActiveNav(navFromSubTab(subTab));
    if (mapped.scope) setScope(mapped.scope);
  }, [subTab]);

  useEffect(() => {
    documentsAPI.getAnalytics()
      .then((res) => {
        setAnalytics(res.data);
        setStorageLabel(formatBytes(res.data?.storageUsedBytes || 0));
      })
      .catch(() => {});
  }, []);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2800);
  }, []);

  const openDetails = useCallback((item, kind) => {
    setDetailsItem(item);
    setDetailsKind(kind);
    setDetailsOpen(true);
  }, []);

  const handleNav = useCallback(
    (item) => {
      setActiveNav(item.id);
      selection.clear();
      setDetailsItem(null);
      if (item.scope) setScope(item.scope);
      if (item.id === 'ai' && onNavigate) onNavigate('documents:ai-generated-images');
      else if (item.id === 'employee' && onNavigate) onNavigate('documents:employee-documents');
      else if (item.id === 'trash' && onNavigate) onNavigate('documents:documents-trash');
      else if (item.id === 'storage' && onNavigate) onNavigate('documents:storage-analytics');
      else if (item.id === 'settings' && onNavigate) onNavigate('documents:documents-settings');
      else if (item.id === 'my-drive' && onNavigate) onNavigate('documents:documents-dashboard');
    },
    [onNavigate, selection]
  );

  const loadSpecialView = useCallback(async () => {
    if (activeNav !== 'starred' && activeNav !== 'recent' && activeNav !== 'shared' && activeNav !== 'trash') {
      return;
    }
    setSpecialLoading(true);
    try {
      if (activeNav === 'trash') {
        const res = await documentsAPI.list({ status: 'Deleted', page: 1, limit: 100 });
        const { data } = extractList(res);
        setSpecialItems(data.map((d) => ({ ...d, _driveKind: 'document' })));
      } else if (activeNav === 'shared') {
        const res = await documentsAPI.listSharesWithMe();
        const folders = (res.data?.folders || []).map((f) => ({ ...f, _driveKind: 'folder' }));
        const documents = (res.data?.documents || []).map((d) => ({ ...d, _driveKind: 'document' }));
        setSpecialItems([...folders, ...documents]);
      } else if (activeNav === 'starred') {
        const { folders: fIds, documents: dIds } = stars.starred;
        const folderResults = [];
        const [manual, ai] = await Promise.all([
          documentsAPI.listFolders({ sourceScope: SOURCE_MANUAL }),
          documentsAPI.listFolders({ sourceScope: SOURCE_AI }),
        ]);
        const allFolders = [...(manual.data?.folders || []), ...(ai.data?.folders || [])];
        fIds.forEach((id) => {
          const found = allFolders.find((f) => String(f._id) === String(id));
          if (found) folderResults.push({ ...found, _driveKind: 'folder' });
        });
        const docResults = [];
        await Promise.all(
          dIds.slice(0, 40).map(async (id) => {
            try {
              const res = await documentsAPI.getById(id);
              if (res.data) docResults.push({ ...res.data, _driveKind: 'document' });
            } catch (_e) {
              // missing
            }
          })
        );
        setSpecialItems([...folderResults, ...docResults]);
      } else if (activeNav === 'recent') {
        const entries = recent.recent.slice(0, 40);
        const items = [];
        await Promise.all(
          entries.map(async (entry) => {
            try {
              if (entry.kind === 'folder') {
                const [manual, ai] = await Promise.all([
                  documentsAPI.listFolders({ sourceScope: SOURCE_MANUAL }),
                  documentsAPI.listFolders({ sourceScope: SOURCE_AI }),
                ]);
                const allFolders = [...(manual.data?.folders || []), ...(ai.data?.folders || [])];
                const found = allFolders.find((f) => String(f._id) === String(entry.id));
                if (found) items.push({ ...found, _driveKind: 'folder' });
              } else {
                const res = await documentsAPI.getById(entry.id);
                if (res.data) items.push({ ...res.data, _driveKind: 'document' });
              }
            } catch (_e) {
              // skip
            }
          })
        );
        setSpecialItems(items);
      }
    } catch (e) {
      showToast(e.response?.data?.error || 'Failed to load');
      setSpecialItems([]);
    } finally {
      setSpecialLoading(false);
    }
  }, [activeNav, stars.starred, recent.recent, userId, showToast]);

  useEffect(() => {
    loadSpecialView();
  }, [loadSpecialView]);

  const contentItems = browseEnabled ? browser.contentItems : specialItems;

  const handleSelect = useCallback(
    (e, item) => {
      selection.toggle(item._id, { additive: e.ctrlKey || e.metaKey || e.shiftKey });
      const kind = item._driveKind === 'folder' ? 'folder' : 'document';
      openDetails(item, kind);
    },
    [selection, openDetails]
  );

  const handleOpen = useCallback(
    (item) => {
      if (item._driveKind === 'folder') {
        if (!browseEnabled) {
          if (item.sourceScope) setScope(item.sourceScope);
          setActiveNav(item.sourceScope === SOURCE_AI ? 'ai' : 'employee');
        }
        browser.selectFolder(String(item._id));
        recent.push({ id: item._id, kind: 'folder', title: item.name });
        return;
      }
      recent.push({
        id: item._id,
        kind: 'document',
        title: item.title || item.fileName,
      });
      setPreview(item);
      openDetails(item, 'document');
    },
    [browseEnabled, browser, recent, openDetails]
  );

  const handleContextMenu = useCallback((e, { kind, item }) => {
    e.preventDefault();
    e.stopPropagation();
    selection.selectOnly(item._id);
    openDetails(item, kind);
    setContextMenu({ x: e.clientX, y: e.clientY, kind, item });
  }, [selection, openDetails]);

  const renameItem = useCallback(
    async (kind, item, name) => {
      const trimmed = String(name || '').trim();
      if (!trimmed) return;
      try {
        if (kind === 'folder') {
          await documentsAPI.updateFolder(item._id, { name: trimmed });
        } else if (item.kind !== 'product') {
          await documentsAPI.update(item._id, { title: trimmed });
        }
        showToast('Renamed');
        setRenameTarget(null);
        if (browseEnabled) await browser.refresh();
        else await loadSpecialView();
      } catch (err) {
        showToast(err.response?.data?.error || 'Rename failed');
      }
    },
    [browseEnabled, browser, loadSpecialView, showToast]
  );

  const deleteItem = useCallback(
    async (kind, item) => {
      const label = kind === 'folder' ? item.name : item.title || item.fileName;
      if (!window.confirm(`Move "${label}" to trash?`)) return;
      try {
        if (kind === 'folder') {
          await documentsAPI.deleteFolder(item._id);
        } else if (item.kind !== 'product') {
          await documentsAPI.softDelete(item._id);
        } else {
          showToast('Catalog product images cannot be deleted here');
          return;
        }
        showToast('Moved to trash');
        selection.clear();
        if (browseEnabled) await browser.refresh();
        else await loadSpecialView();
      } catch (err) {
        showToast(err.response?.data?.error || 'Delete failed');
      }
    },
    [browseEnabled, browser, loadSpecialView, selection, showToast]
  );

  const moveItemToFolder = useCallback(
    async (item, folderId) => {
      try {
        if (item._driveKind === 'folder') {
          await documentsAPI.updateFolder(item._id, { parentId: folderId || null });
        } else if (item.kind !== 'product') {
          await documentsAPI.moveToFolder(item._id, folderId || null);
        } else {
          showToast('Catalog images cannot be moved');
          return;
        }
        showToast('Moved');
        setMoveTarget(null);
        await browser.refresh();
      } catch (err) {
        showToast(err.response?.data?.error || 'Move failed');
      }
    },
    [browser, showToast]
  );

  const buildContextItems = useCallback(() => {
    if (!contextMenu) return [];
    const { kind, item } = contextMenu;
    const isFolder = kind === 'folder';
    const isProduct = item.kind === 'product';
    const starred = stars.isStarred(kind, item._id);

    return [
      {
        id: 'open',
        label: isFolder ? 'Open' : 'Preview',
        onClick: () => handleOpen(item),
      },
      {
        id: 'rename',
        label: 'Rename',
        disabled: isProduct,
        disabledReason: isProduct ? 'Catalog images are renamed in Product Master' : '',
        onClick: () => {
          setRenameTarget({ kind, item });
          setRenameValue(isFolder ? item.name : item.title || item.fileName || '');
        },
      },
      {
        id: 'move',
        label: 'Move',
        disabled: isProduct,
        onClick: () => setMoveTarget({ kind, item }),
      },
      { separator: true },
      {
        id: 'download',
        label: 'Download',
        disabled: isFolder || isProduct,
        onClick: () => documentsAPI.download(item._id, item.fileName || item.title || 'document'),
      },
      {
        id: 'default',
        label: item.isDefault ? 'Default image' : 'Set as default',
        disabled: isFolder || (!isProduct && scope !== SOURCE_AI),
        onClick: async () => {
          try {
            if (isProduct) {
              await documentsAPI.setProductCatalogDefault(item.productId, { index: item.imageIndex });
            } else {
              const sku = item.sku || browser.selectedFolderMeta?.linkedSku || '';
              await documentsAPI.setProductDefault(item._id, { sku });
            }
            showToast('Default product image updated');
            browser.refresh();
          } catch (err) {
            showToast(err.response?.data?.error || 'Failed to set default');
          }
        },
      },
      {
        id: 'star',
        label: starred ? 'Remove star' : 'Star',
        onClick: () => stars.toggle(kind, item._id),
      },
      {
        id: 'archive',
        label: 'Archive',
        disabled: isFolder || isProduct,
        onClick: async () => {
          try {
            await documentsAPI.archive(item._id);
            showToast('Archived');
            browser.refresh();
          } catch (err) {
            showToast(err.response?.data?.error || 'Archive failed');
          }
        },
      },
      {
        id: 'share',
        label: 'Share',
        disabled: isProduct,
        disabledReason: isProduct ? 'Catalog images cannot be shared' : '',
        onClick: () => setShareTarget({ kind, item }),
      },
      {
        id: 'versions',
        label: 'Version history',
        disabled: true,
        disabledReason: 'Coming soon',
        hint: 'Soon',
      },
      { separator: true },
      {
        id: 'properties',
        label: 'Properties',
        onClick: () => openDetails(item, kind),
      },
      {
        id: 'delete',
        label: activeNav === 'trash' ? 'Delete forever' : 'Delete',
        danger: true,
        disabled: isProduct,
        onClick: async () => {
          if (activeNav === 'trash') {
            if (!window.confirm('Permanently delete? This cannot be undone.')) return;
            try {
              await documentsAPI.permanentDelete(item._id);
              showToast('Deleted forever');
              loadSpecialView();
            } catch (err) {
              showToast(err.response?.data?.error || 'Delete failed');
            }
            return;
          }
          deleteItem(kind, item);
        },
      },
      ...(activeNav === 'trash' && !isFolder
        ? [
            {
              id: 'restore',
              label: 'Restore',
              onClick: async () => {
                try {
                  await documentsAPI.restore(item._id);
                  showToast('Restored');
                  loadSpecialView();
                } catch (err) {
                  showToast(err.response?.data?.error || 'Restore failed');
                }
              },
            },
          ]
        : []),
    ];
  }, [contextMenu, stars, handleOpen, browser, showToast, openDetails, deleteItem, scope, activeNav, loadSpecialView]);

  const beginRename = useCallback((item) => {
    if (!item || item.kind === 'product') return;
    const kind = item._driveKind === 'folder' ? 'folder' : 'document';
    setRenameTarget({ kind, item });
    setRenameValue(kind === 'folder' ? item.name || '' : item.title || item.fileName || '');
  }, []);

  const beginShare = useCallback((item) => {
    if (!item || item.kind === 'product') return;
    const kind = item._driveKind === 'folder' ? 'folder' : 'document';
    setShareTarget({ kind, item });
  }, []);

  const handleTreeSelect = useCallback(
    (id, folderMeta) => {
      browser.selectFolder(id);
      if (folderMeta) {
        openDetails({ ...folderMeta, _driveKind: 'folder' }, 'folder');
        selection.selectOnly(folderMeta._id);
      }
    },
    [browser, openDetails, selection]
  );

  const onDragStart = useCallback((e, item) => {
    dragPayload.current = item;
    e.dataTransfer.setData('application/x-drive-item', String(item._id));
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const onFolderDragOver = useCallback((e, folder) => {
    e.preventDefault();
    e.stopPropagation();
    setDropFolderId(String(folder._id));
  }, []);

  const onFolderDragLeave = useCallback(() => {
    setDropFolderId(null);
  }, []);

  const onFolderDrop = useCallback(
    async (e, folder) => {
      e.preventDefault();
      e.stopPropagation();
      setDropFolderId(null);
      const files = e.dataTransfer?.files;
      if (files?.length) {
        uploads.enqueueFiles(files, { folderId: folder._id, scope });
        return;
      }
      const item = dragPayload.current;
      if (!item) return;
      if (String(item._id) === String(folder._id)) return;
      await moveItemToFolder(item, folder._id);
      dragPayload.current = null;
    },
    [uploads, scope, moveItemToFolder]
  );

  const onBackgroundDrop = useCallback(
    (e) => {
      e.preventDefault();
      const files = e.dataTransfer?.files;
      if (files?.length) {
        uploads.enqueueFiles(files, { folderId: uploadFolderId, scope });
      }
    },
    [uploads, uploadFolderId, scope]
  );

  const handleCreateFolder = async (e) => {
    e?.preventDefault?.();
    const name = newFolderName.trim();
    if (!name) return;
    try {
      setCreatingFolder(true);
      const parentId =
        browser.selectedFolder !== 'all' && browser.selectedFolder !== 'unfiled'
          ? browser.selectedFolder
          : undefined;
      await documentsAPI.createFolder({
        name,
        sourceScope: scope,
        parentId,
        visibility: newFolderPersonal ? 'Personal' : 'Shared',
        employeeVisible: newFolderPersonal ? newFolderVisible : false,
      });
      setNewFolderOpen(false);
      setNewFolderName('');
      setNewFolderPersonal(false);
      setNewFolderVisible(false);
      showToast('Folder created');
      await browser.refresh();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to create folder');
    } finally {
      setCreatingFolder(false);
    }
  };

  const selectedForShortcut = useMemo(() => {
    const id = selection.selectedList[0];
    if (!id) return null;
    return contentItems.find((it) => String(it._id) === String(id)) || detailsItem;
  }, [selection.selectedList, contentItems, detailsItem]);

  useDriveShortcuts({
    enabled: activeNav !== 'settings',
    onUpload: () => fileInputRef.current?.click(),
    onNewFolder: () => setNewFolderOpen(true),
    onDelete: () => {
      if (!selectedForShortcut) return;
      const kind = selectedForShortcut._driveKind === 'folder' ? 'folder' : 'document';
      deleteItem(kind, selectedForShortcut);
    },
    onRename: () => {
      if (!selectedForShortcut) return;
      const kind = selectedForShortcut._driveKind === 'folder' ? 'folder' : 'document';
      setRenameTarget({ kind, item: selectedForShortcut });
      setRenameValue(
        kind === 'folder'
          ? selectedForShortcut.name
          : selectedForShortcut.title || selectedForShortcut.fileName || ''
      );
    },
    onFocusSearch: () => searchRef.current?.focus(),
    onEscape: () => {
      setContextMenu(null);
      setPreview(null);
      selection.clear();
    },
  });

  const starredCount = stars.starred.folders.length + stars.starred.documents.length;

  return (
    <div className="drive-shell">
      {toast ? <div className="drive-toast">{toast}</div> : null}

      <DriveSidebar
        activeNav={activeNav}
        onNavigate={handleNav}
        scope={scope}
        onScopeChange={(next) => {
          setScope(next);
          setActiveNav(next === SOURCE_AI ? 'ai' : 'employee');
          browser.selectFolder('all');
        }}
        storageUsedLabel={storageLabel}
        hasPermission={hasPermission}
        starredCount={starredCount}
      />

      <div className="drive-main">
        <DriveTopBar
          ref={searchRef}
          search={browseEnabled ? browser.search : ''}
          onSearchChange={(v) => browseEnabled && browser.setSearch(v)}
          viewMode={viewMode}
          onViewModeChange={(mode) => {
            setViewMode(mode);
            persistViewMode(userId, mode);
          }}
          sortField={sort.field}
          sortDir={sort.dir}
          onSortChange={(prefs) => {
            setSort(prefs);
            setSortPrefs(userId, prefs);
          }}
          onUpload={() => fileInputRef.current?.click()}
          onNewFolder={() => setNewFolderOpen(true)}
          showUpload={browseEnabled}
          showNewFolder={browseEnabled}
          filtersOpen={filtersOpen}
          onToggleFilters={() => setFiltersOpen((o) => !o)}
        />

        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            uploads.enqueueFiles(e.target.files, { folderId: uploadFolderId, scope });
            e.target.value = '';
          }}
        />

        {activeNav === 'settings' ? (
          <div className="drive-special-page">
            <DocumentsSettings />
          </div>
        ) : activeNav === 'storage' ? (
          <div className="drive-special-page drive-storage-view">
            <h2>Storage</h2>
            <div className="drive-storage-kpis">
              <div className="drive-kpi">
                <strong>{formatBytes(analytics?.storageUsedBytes)}</strong>
                <span>Used</span>
              </div>
              <div className="drive-kpi">
                <strong>{analytics?.totalFiles ?? 0}</strong>
                <span>Files</span>
              </div>
              <div className="drive-kpi">
                <strong>{analytics?.aiGeneratedImages ?? 0}</strong>
                <span>AI images</span>
              </div>
              <div className="drive-kpi">
                <strong>{analytics?.manualDocuments ?? 0}</strong>
                <span>Employee docs</span>
              </div>
            </div>
            <div className="drive-storage-bar-wrap">
              <div className="drive-storage-bar">
                <div style={{ width: `${Math.min(100, ((analytics?.storageUsedBytes || 0) / (5 * 1024 * 1024 * 1024)) * 100)}%` }} />
              </div>
              <p className="drive-muted">Usage relative to a 5 GB display quota (not enforced)</p>
            </div>
            <h3>Largest files</h3>
            <ul className="drive-largest-list">
              {(analytics?.largestFiles || []).map((f) => (
                <li key={f._id}>
                  <span>{f.title || f.fileName}</span>
                  <span>{formatBytes(f.fileSize)}</span>
                </li>
              ))}
            </ul>
            <p className="drive-coming-soon">Unused & duplicate file detection — coming soon</p>
          </div>
        ) : (
          <div className="drive-workspace">
            {browseEnabled ? (
              <div className="drive-tree-pane">
                <div className="drive-tree-toolbar">
                  {scope === SOURCE_AI ? (
                    <button type="button" className="drive-btn" onClick={browser.syncCatalog} disabled={browser.syncing}>
                      {browser.syncing ? 'Syncing…' : 'Sync catalog'}
                    </button>
                  ) : null}
                </div>
                <FolderTree
                  tree={browser.folderTree}
                  selectedFolder={browser.selectedFolder}
                  expandedIds={browser.expandedIds}
                  onSelect={handleTreeSelect}
                  onToggle={browser.toggleExpanded}
                  onSelectRoot={() => browser.selectFolder('all')}
                  onSelectUnfiled={() => browser.selectFolder('unfiled')}
                  unfiledCount={browser.unfiledCount}
                  onContextMenu={handleContextMenu}
                  onRename={beginRename}
                  onShare={beginShare}
                />
              </div>
            ) : null}

            <div className="drive-center">
              {browseEnabled ? (
                <>
                  <DriveBreadcrumb parts={browser.breadcrumb} onNavigate={browser.selectFolder} />
                  {browser.selectedFolderMeta ? (
                    <div className="drive-folder-toolbar">
                      <span className="drive-folder-toolbar-label">
                        Folder: <strong>{browser.selectedFolderMeta.name}</strong>
                      </span>
                      <div className="drive-folder-toolbar-actions">
                        <button
                          type="button"
                          className="drive-btn"
                          onClick={() => beginRename({ ...browser.selectedFolderMeta, _driveKind: 'folder' })}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          className="drive-btn drive-btn-primary"
                          onClick={() => beginShare({ ...browser.selectedFolderMeta, _driveKind: 'folder' })}
                        >
                          Share
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <DriveToolbar
                    open={filtersOpen}
                    filters={browser.filters}
                    onChange={browser.setFilters}
                    sourceScope={scope}
                  />
                </>
              ) : (
                <div className="drive-view-title">
                  <h2>
                    {activeNav === 'trash'
                      ? 'Trash'
                      : activeNav === 'starred'
                        ? 'Starred'
                        : activeNav === 'recent'
                          ? 'Recent'
                          : activeNav === 'shared'
                            ? 'Shared with me'
                            : 'Documents'}
                  </h2>
                </div>
              )}

              {browser.error && browseEnabled ? (
                <div className="drive-inline-error">{browser.error}</div>
              ) : null}

              {activeNav === 'trash' ? (
                <div className="drive-trash-actions-hint">Right-click a file to restore or permanently delete.</div>
              ) : null}

              {viewMode === 'list' ? (
                <ContentList
                  items={contentItems}
                  loading={browseEnabled ? browser.loading : specialLoading}
                  loadingMore={browser.loadingMore}
                  hasMore={browseEnabled && browser.pagination?.hasNextPage}
                  onLoadMore={browser.loadMore}
                  isSelected={selection.isSelected}
                  isStarred={stars.isStarred}
                  onSelect={handleSelect}
                  onOpen={handleOpen}
                  onContextMenu={handleContextMenu}
                  onDragStart={onDragStart}
                  dropFolderId={dropFolderId}
                  onFolderDragOver={onFolderDragOver}
                  onFolderDragLeave={onFolderDragLeave}
                  onFolderDrop={onFolderDrop}
                  onRename={beginRename}
                  onShare={beginShare}
                />
              ) : (
                <ContentGrid
                  items={contentItems}
                  loading={browseEnabled ? browser.loading : specialLoading}
                  loadingMore={browser.loadingMore}
                  hasMore={browseEnabled && browser.pagination?.hasNextPage}
                  onLoadMore={browser.loadMore}
                  isSelected={selection.isSelected}
                  isStarred={stars.isStarred}
                  onSelect={handleSelect}
                  onOpen={handleOpen}
                  onContextMenu={handleContextMenu}
                  onDragStart={onDragStart}
                  dropFolderId={dropFolderId}
                  onFolderDragOver={onFolderDragOver}
                  onFolderDragLeave={onFolderDragLeave}
                  onFolderDrop={onFolderDrop}
                  onBackgroundDrop={onBackgroundDrop}
                  onRename={beginRename}
                  onShare={beginShare}
                />
              )}

              {!contentItems.length && !browser.loading && !specialLoading && activeNav === 'shared' ? (
                <EmptyState
                  title="Nothing shared with you yet"
                  subtitle="When a coworker shares a private folder or file with you (Viewer or Editor), it appears here."
                />
              ) : null}
            </div>

            <DetailsPanel
              open={detailsOpen}
              item={detailsItem}
              kind={detailsKind}
              onClose={() => setDetailsOpen(false)}
              starred={detailsItem ? stars.isStarred(detailsKind, detailsItem._id) : false}
              onToggleStar={(kind, id) => stars.toggle(kind, id)}
              onRename={
                detailsItem && detailsItem.kind !== 'product'
                  ? () => beginRename(detailsItem)
                  : undefined
              }
              onShare={
                detailsItem && detailsItem.kind !== 'product'
                  ? () => beginShare(detailsItem)
                  : undefined
              }
            />
          </div>
        )}
      </div>

      <ContextMenu
        open={Boolean(contextMenu)}
        x={contextMenu?.x || 0}
        y={contextMenu?.y || 0}
        items={buildContextItems()}
        onClose={() => setContextMenu(null)}
      />

      {preview ? <PreviewModal doc={preview} onClose={() => setPreview(null)} /> : null}

      {shareTarget ? (
        <ShareDialog
          open
          resourceType={shareTarget.kind === 'folder' ? 'folder' : 'document'}
          resource={shareTarget.item}
          onClose={() => setShareTarget(null)}
          onToast={showToast}
        />
      ) : null}

      <UploadQueue
        items={uploads.items}
        onCancel={uploads.cancel}
        onRetry={uploads.retry}
        onDismiss={uploads.removeItem}
        onClearDone={uploads.clearDone}
      />

      {newFolderOpen ? (
        <div className="drive-modal-overlay" onClick={() => setNewFolderOpen(false)} role="presentation">
          <form className="drive-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleCreateFolder}>
            <h3>New folder</h3>
            <input
              className="drive-input"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              autoFocus
              maxLength={120}
            />
            {scope === SOURCE_MANUAL ? (
              <>
                <label className="drive-check">
                  <input
                    type="checkbox"
                    checked={newFolderPersonal}
                    onChange={(e) => {
                      setNewFolderPersonal(e.target.checked);
                      if (!e.target.checked) setNewFolderVisible(false);
                    }}
                  />
                  Personal folder
                </label>
                {newFolderPersonal ? (
                  <label className="drive-check">
                    <input
                      type="checkbox"
                      checked={newFolderVisible}
                      onChange={(e) => setNewFolderVisible(e.target.checked)}
                    />
                    Allow other employees to view
                  </label>
                ) : null}
              </>
            ) : null}
            <div className="drive-modal-actions">
              <button type="button" className="drive-btn" onClick={() => setNewFolderOpen(false)}>Cancel</button>
              <button type="submit" className="drive-btn drive-btn-primary" disabled={creatingFolder || !newFolderName.trim()}>
                {creatingFolder ? 'Creating…' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {renameTarget ? (
        <div className="drive-modal-overlay" onClick={() => setRenameTarget(null)} role="presentation">
          <form
            className="drive-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              renameItem(renameTarget.kind, renameTarget.item, renameValue);
            }}
          >
            <h3>Rename</h3>
            <input
              className="drive-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              autoFocus
            />
            <div className="drive-modal-actions">
              <button type="button" className="drive-btn" onClick={() => setRenameTarget(null)}>Cancel</button>
              <button type="submit" className="drive-btn drive-btn-primary">Save</button>
            </div>
          </form>
        </div>
      ) : null}

      {moveTarget ? (
        <div className="drive-modal-overlay" onClick={() => setMoveTarget(null)} role="presentation">
          <div className="drive-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Move to…</h3>
            <div className="drive-move-list">
              <button type="button" className="drive-btn" onClick={() => moveItemToFolder(moveTarget.item, null)}>
                Unfiled
              </button>
              {browser.moveTargets.map((f) => (
                <button
                  key={f._id}
                  type="button"
                  className="drive-btn"
                  style={{ paddingLeft: 12 + (f.depth || 0) * 12 }}
                  onClick={() => moveItemToFolder(moveTarget.item, f._id)}
                >
                  {f.name}
                </button>
              ))}
            </div>
            <div className="drive-modal-actions">
              <button type="button" className="drive-btn" onClick={() => setMoveTarget(null)}>Close</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default DocumentsDriveShell;
