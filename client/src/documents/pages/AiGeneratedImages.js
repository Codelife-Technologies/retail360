import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { documentsAPI } from '../services/documentsApi';
import { extractList, formatDateTime } from '../utils/documentsUtils';

const SOURCE_SCOPE = 'AI Generator';

function folderIcon(kind) {
  if (kind === 'sku') return '🏷️';
  return '📁';
}

function buildFolderTree(folders) {
  const byParent = new Map();
  folders.forEach((folder) => {
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

function flattenMoveTargets(tree, depth = 0) {
  const rows = [];
  tree.forEach((node) => {
    rows.push({
      ...node.folder,
      depth,
      label: `${'— '.repeat(depth)}${node.folder.name}`,
    });
    rows.push(...flattenMoveTargets(node.children, depth + 1));
  });
  return rows;
}

function AiGeneratedImages() {
  const [docs, setDocs] = useState([]);
  const [productImages, setProductImages] = useState([]);
  const [childFolders, setChildFolders] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [preview, setPreview] = useState(null);
  const [toast, setToast] = useState('');

  const [folders, setFolders] = useState([]);
  const [unfiledCount, setUnfiledCount] = useState(0);
  const [selectedFolder, setSelectedFolder] = useState('all');
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [syncing, setSyncing] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [moveDocId, setMoveDocId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const uploadInputRef = useRef(null);

  const folderTree = useMemo(() => buildFolderTree(folders), [folders]);
  const moveTargets = useMemo(() => flattenMoveTargets(folderTree), [folderTree]);

  const folderById = useMemo(() => {
    const map = {};
    folders.forEach((f) => { map[String(f._id)] = f; });
    return map;
  }, [folders]);

  const selectedFolderMeta = selectedFolder !== 'all' && selectedFolder !== 'unfiled'
    ? folderById[selectedFolder]
    : null;

  const breadcrumb = useMemo(() => {
    if (selectedFolder === 'all') return [{ id: 'all', name: 'My Drive' }];
    if (selectedFolder === 'unfiled') {
      return [
        { id: 'all', name: 'My Drive' },
        { id: 'unfiled', name: 'Unfiled' },
      ];
    }
    const parts = [];
    let cursor = selectedFolderMeta;
    const guard = new Set();
    while (cursor && !guard.has(String(cursor._id))) {
      guard.add(String(cursor._id));
      parts.unshift({ id: String(cursor._id), name: cursor.name });
      cursor = cursor.parentId ? folderById[String(cursor.parentId)] : null;
    }
    return [{ id: 'all', name: 'My Drive' }, ...parts];
  }, [selectedFolder, selectedFolderMeta, folderById]);

  const selectedFolderLabel = useMemo(() => {
    if (!breadcrumb.length) return 'My Drive';
    return breadcrumb.map((p) => p.name).join(' / ');
  }, [breadcrumb]);

  const driveFolders = useMemo(() => {
    if (selectedFolder === 'unfiled') return [];
    if (selectedFolder === 'all') {
      return folderTree.map((node) => node.folder);
    }
    return childFolders || [];
  }, [selectedFolder, folderTree, childFolders]);

  const loadFolders = useCallback(async () => {
    try {
      const res = await documentsAPI.listFolders({ sourceScope: SOURCE_SCOPE });
      let list = res.data?.folders || [];
      setUnfiledCount(res.data?.unfiledCount || 0);

      const hasCatalog = list.some((f) => f.folderKind === 'category' || f.folderKind === 'subcategory');
      if (!hasCatalog) {
        try {
          const synced = await documentsAPI.syncCatalogFolders({ sourceScope: SOURCE_SCOPE });
          list = synced.data?.folders || list;
          setUnfiledCount(synced.data?.unfiledCount ?? res.data?.unfiledCount ?? 0);
        } catch (_syncErr) {
          // Keep empty list; user can click Sync later
        }
      }

      setFolders(list);
      setExpandedIds((prev) => {
        if (prev.size) return prev;
        const next = new Set();
        list.forEach((f) => {
          if ((f.folderKind || 'custom') === 'category') next.add(String(f._id));
        });
        return next;
      });
    } catch (_e) {
      // non-fatal
    }
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const isCatalogBrowse =
        selectedFolder !== 'all' &&
        selectedFolder !== 'unfiled' &&
        Boolean(folderById[selectedFolder]);

      if (isCatalogBrowse) {
        const res = await documentsAPI.browseFolder(selectedFolder, {
          search: search || undefined,
          category: category || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          page,
          limit: 48,
        });
        setChildFolders(res.data?.children || []);
        setDocs(res.data?.documents || []);
        setProductImages(res.data?.productImages || []);
        setPagination(res.data?.pagination || null);
      } else {
        const res = await documentsAPI.list({
          source: SOURCE_SCOPE,
          status: 'Active',
          search: search || undefined,
          category: category || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          folderId: selectedFolder === 'all' ? undefined : selectedFolder,
          page,
          limit: 24,
        });
        const { data, pagination: pag } = extractList(res);
        setChildFolders([]);
        setProductImages([]);
        setDocs(data);
        setPagination(pag);
      }
    } catch (e) {
      setToast(e.response?.data?.error || 'Failed to load AI images');
    } finally {
      setLoading(false);
    }
  }, [page, search, category, dateFrom, dateTo, selectedFolder, folderById]);

  useEffect(() => { loadFolders(); }, [loadFolders]);
  useEffect(() => { load(); }, [load]);

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(''), 2500);
  };

  const handleSyncCatalog = async () => {
    try {
      setSyncing(true);
      const res = await documentsAPI.syncCatalogFolders({ sourceScope: SOURCE_SCOPE });
      setFolders(res.data?.folders || []);
      setUnfiledCount(res.data?.unfiledCount || 0);
      const created =
        (res.data?.categoryFoldersCreated || 0) +
        (res.data?.subcategoryFoldersCreated || 0) +
        (res.data?.skuFoldersCreated || 0);
      showToast(
        created
          ? `Catalog folders synced (${created} new)`
          : 'Catalog folders are up to date'
      );
      // Expand all categories after sync
      const next = new Set();
      (res.data?.folders || []).forEach((f) => {
        if (f.folderKind === 'category' || f.folderKind === 'subcategory') {
          next.add(String(f._id));
        }
      });
      setExpandedIds(next);
    } catch (e) {
      showToast(e.response?.data?.error || 'Failed to sync catalog folders');
    } finally {
      setSyncing(false);
    }
  };

  const handleDownload = async (doc) => {
    try {
      if (doc.kind === 'product') {
        const url = documentsAPI.fileUrl(doc.fileUrl);
        window.open(url, '_blank', 'noopener,noreferrer');
        return;
      }
      await documentsAPI.download(doc._id, doc.fileName || 'image');
    } catch (e) {
      showToast(e.response?.data?.error || 'Download failed');
    }
  };

  const handleShare = async (doc) => {
    const url = documentsAPI.fileUrl(doc.fileUrl);
    try {
      if (navigator.share) {
        await navigator.share({ title: doc.title || doc.sku, url });
      } else {
        await navigator.clipboard.writeText(url);
        showToast('Link copied to clipboard');
      }
    } catch (_e) {
      await navigator.clipboard.writeText(url);
      showToast('Link copied to clipboard');
    }
  };

  const handleDesktopUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    if (event.target) event.target.value = '';
    if (!files.length) return;

    const imageFiles = files.filter((f) => String(f.type || '').startsWith('image/'));
    if (!imageFiles.length) {
      showToast('Select image files only (JPG, PNG, WebP, etc.)');
      return;
    }

    try {
      setUploading(true);
      const formData = new FormData();
      imageFiles.forEach((file) => formData.append('files', file));

      if (selectedFolderMeta && selectedFolder !== 'all' && selectedFolder !== 'unfiled') {
        formData.append('folderId', selectedFolderMeta._id);
      }
      if (selectedFolderMeta?.folderKind === 'sku' && selectedFolderMeta.linkedSku) {
        formData.append('sku', selectedFolderMeta.linkedSku);
      }

      const res = await documentsAPI.uploadAi(formData);
      const createdCount = res.data?.created?.length || 0;
      const failedCount = res.data?.errors?.length || 0;
      showToast(
        res.data?.message ||
          `Uploaded ${createdCount} image(s)${failedCount ? `, ${failedCount} failed` : ''}`
      );
      await Promise.all([load(), loadFolders()]);
    } catch (e) {
      showToast(e.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (doc) => {
    if (doc.kind === 'product') {
      showToast('Product catalog images are managed in Master → Products');
      return;
    }
    if (!window.confirm(`Move "${doc.title || doc.sku}" to trash?`)) return;
    try {
      await documentsAPI.softDelete(doc._id);
      showToast('Moved to trash');
      await Promise.all([load(), loadFolders()]);
    } catch (e) {
      showToast(e.response?.data?.error || 'Delete failed');
    }
  };

  const handleCreateFolder = async (e) => {
    e?.preventDefault?.();
    const name = newFolderName.trim();
    if (!name) {
      showToast('Enter a folder name');
      return;
    }
    try {
      setCreatingFolder(true);
      const parentId =
        selectedFolderMeta && selectedFolderMeta.folderKind !== 'sku'
          ? selectedFolderMeta._id
          : undefined;
      const res = await documentsAPI.createFolder({
        name,
        sourceScope: SOURCE_SCOPE,
        parentId,
      });
      setNewFolderName('');
      showToast(`Folder "${name}" created`);
      await loadFolders();
      if (res.data?._id) {
        setSelectedFolder(String(res.data._id));
        setPage(1);
        if (parentId) {
          setExpandedIds((prev) => new Set([...prev, String(parentId)]));
        }
      }
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to create folder');
    } finally {
      setCreatingFolder(false);
    }
  };

  const startRename = (folder) => {
    setRenamingId(String(folder._id));
    setRenameValue(folder.name);
  };

  const submitRename = async (folderId) => {
    const name = renameValue.trim();
    if (!name) {
      showToast('Folder name is required');
      return;
    }
    try {
      await documentsAPI.updateFolder(folderId, { name });
      setRenamingId(null);
      showToast('Folder renamed');
      await loadFolders();
    } catch (err) {
      showToast(err.response?.data?.error || 'Rename failed');
    }
  };

  const handleDeleteFolder = async (folder) => {
    if (folder.folderKind && folder.folderKind !== 'custom') {
      if (!window.confirm(
        `Delete catalog folder "${folder.name}"? Images stay in Document Management but leave this folder.`
      )) return;
    } else {
      const count = folder.documentCount || 0;
      const msg = count
        ? `Delete folder "${folder.name}"? ${count} image(s) will be moved to Unfiled.`
        : `Delete folder "${folder.name}"? This cannot be undone.`;
      if (!window.confirm(msg)) return;
    }
    try {
      await documentsAPI.deleteFolder(folder._id);
      showToast('Folder deleted');
      if (selectedFolder === String(folder._id)) {
        setSelectedFolder('all');
        setPage(1);
      }
      await Promise.all([loadFolders(), load()]);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to delete folder');
    }
  };

  const handleMoveDocument = async (docId, folderId) => {
    try {
      await documentsAPI.moveToFolder(docId, folderId || null);
      setMoveDocId(null);
      showToast('Image moved');
      await Promise.all([load(), loadFolders()]);
    } catch (err) {
      showToast(err.response?.data?.error || 'Move failed');
    }
  };

  const handleSetDefaultImage = async (doc) => {
    try {
      if (doc.kind === 'product') {
        if (!doc.productId && doc.imageIndex == null) {
          showToast('Cannot set default for this catalog image');
          return;
        }
        await documentsAPI.setProductCatalogDefault(doc.productId, {
          index: doc.imageIndex,
        });
      } else {
        const sku = doc.sku || selectedFolderMeta?.linkedSku || '';
        if (!sku && !doc.productId) {
          showToast('Open a SKU folder (or use an image with SKU) to set the default product image');
          return;
        }
        await documentsAPI.setProductDefault(doc._id, { sku });
      }
      showToast('Default product image updated');
      await Promise.all([load(), loadFolders()]);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to set default image');
    }
  };

  const selectBrowseFolder = (key) => {
    const id = String(key);
    setMoveDocId(null);
    setPage(1);

    // Clicking the already-open folder closes it (back to parent / My Drive)
    if (selectedFolder === id && id !== 'all') {
      if (id === 'unfiled') {
        setSelectedFolder('all');
      } else {
        const meta = folderById[id];
        setSelectedFolder(meta?.parentId ? String(meta.parentId) : 'all');
        setExpandedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
      return;
    }

    setSelectedFolder(id);

    if (id && id !== 'all' && id !== 'unfiled') {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        let cursor = folderById[id];
        const guard = new Set();
        while (cursor && !guard.has(String(cursor._id))) {
          guard.add(String(cursor._id));
          next.add(String(cursor._id));
          if (cursor.parentId) next.add(String(cursor.parentId));
          cursor = cursor.parentId ? folderById[String(cursor.parentId)] : null;
        }
        return next;
      });
    }
  };

  const toggleExpanded = (folderId) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      const id = String(folderId);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderTreeNodes = (nodes) =>
    nodes.map((node) => {
      const folder = node.folder;
      const id = String(folder._id);
      const hasChildren = node.children.length > 0;
      const isExpanded = expandedIds.has(id);
      const isActive = selectedFolder === id;
      const isRenaming = renamingId === id;
      const kind = folder.folderKind || 'custom';

      return (
        <div key={id} className="dm-tree-node">
          {isRenaming ? (
            <div className="dm-folder-rename" style={{ paddingLeft: `${0.35 + node.depth * 0.85}rem` }}>
              <input
                className="dm-input"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitRename(id);
                  if (e.key === 'Escape') setRenamingId(null);
                }}
                autoFocus
                aria-label="Rename folder"
              />
              <button type="button" className="dm-btn dm-btn-primary" onClick={() => submitRename(id)}>Save</button>
              <button type="button" className="dm-btn" onClick={() => setRenamingId(null)}>Cancel</button>
            </div>
          ) : (
            <div className={`dm-folder-row${isActive ? ' active' : ''}`}>
              <button
                type="button"
                className={`dm-folder-item${isActive ? ' active' : ''}`}
                style={{ paddingLeft: `${0.55 + node.depth * 0.85}rem` }}
                onClick={() => selectBrowseFolder(id)}
              >
                {hasChildren ? (
                  <span
                    className="dm-tree-caret"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpanded(id);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleExpanded(id);
                      }
                    }}
                    aria-label={isExpanded ? 'Collapse' : 'Expand'}
                  >
                    {isExpanded ? '▾' : '▸'}
                  </span>
                ) : (
                  <span className="dm-tree-caret spacer" />
                )}
                <span className="dm-folder-icon">{folderIcon(kind)}</span>
                <span className="dm-folder-name" title={folder.description || folder.name}>
                  {folder.name}
                </span>
                <span className="dm-folder-count">{folder.documentCount || 0}</span>
              </button>
              <div className="dm-folder-actions">
                {kind === 'custom' ? (
                  <>
                    <button
                      type="button"
                      className="dm-folder-action"
                      title="Rename"
                      onClick={() => startRename(folder)}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className="dm-folder-action danger"
                      title="Delete folder"
                      onClick={() => handleDeleteFolder(folder)}
                    >
                      ×
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          )}
          {hasChildren && isExpanded ? renderTreeNodes(node.children) : null}
        </div>
      );
    });

  const allImages = useMemo(() => {
    const catalog = (productImages || []).map((img) => ({ ...img, _id: img.id }));
    return [...catalog, ...docs];
  }, [productImages, docs]);

  const viewingSku = selectedFolderMeta?.folderKind === 'sku';
  const showFolderGrid = driveFolders.length > 0;
  const showFilesSection = allImages.length > 0;

  return (
    <div className="dm-page dm-drive-page">
      <div className="dm-page-header">
        <div>
          <h1>Product images</h1>
          <p className="dm-subtitle">
            Browse folders like Drive — Category → Subcategory → SKU. Upload from desktop or save AI-generated images here.
          </p>
        </div>
        <div className="dm-actions">
          <input
            ref={uploadInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={handleDesktopUpload}
          />
          <button
            type="button"
            className="dm-btn dm-btn-primary"
            onClick={() => uploadInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? 'Uploading…' : '⬆ Upload from desktop'}
          </button>
          <button type="button" className="dm-btn" onClick={handleSyncCatalog} disabled={syncing}>
            {syncing ? 'Syncing…' : 'Sync catalog folders'}
          </button>
        </div>
      </div>

      {toast ? <div className="dm-toast">{toast}</div> : null}

      <div className="dm-layout">
        <aside className="dm-folder-panel">
          <div className="dm-folder-panel-header">
            <h3>Folders</h3>
          </div>

          <form className="dm-folder-create" onSubmit={handleCreateFolder}>
            <input
              className="dm-input"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder={selectedFolderMeta && selectedFolderMeta.folderKind !== 'sku' ? 'Subfolder name' : 'Custom folder name'}
              maxLength={120}
              aria-label="New folder name"
            />
            <button type="submit" className="dm-btn dm-btn-primary" disabled={creatingFolder || !newFolderName.trim()}>
              {creatingFolder ? '…' : 'New'}
            </button>
          </form>

          <nav className="dm-folder-list" aria-label="Product image folders">
            <button
              type="button"
              className={`dm-folder-item${selectedFolder === 'all' ? ' active' : ''}`}
              onClick={() => selectBrowseFolder('all')}
            >
              <span className="dm-folder-icon">💾</span>
              <span className="dm-folder-name">My Drive</span>
            </button>
            <button
              type="button"
              className={`dm-folder-item${selectedFolder === 'unfiled' ? ' active' : ''}`}
              onClick={() => selectBrowseFolder('unfiled')}
            >
              <span className="dm-folder-icon">🖼️</span>
              <span className="dm-folder-name">Unfiled</span>
              <span className="dm-folder-count">{unfiledCount}</span>
            </button>

            {renderTreeNodes(folderTree)}
          </nav>

          {!folders.length ? (
            <p className="dm-folder-hint">
              Click <strong>Sync catalog folders</strong> to create Category → Subcategory → SKU folders from your product master.
            </p>
          ) : null}
        </aside>

        <div className="dm-main-panel">
          <div className="dm-toolbar dm-drive-toolbar">
            <nav className="dm-drive-breadcrumb" aria-label="Folder path">
              {breadcrumb.map((crumb, index) => {
                const isLast = index === breadcrumb.length - 1;
                return (
                  <React.Fragment key={`${crumb.id}-${index}`}>
                    {index > 0 ? <span className="dm-drive-crumb-sep">/</span> : null}
                    {isLast ? (
                      <span className="dm-drive-crumb current">{crumb.name}</span>
                    ) : (
                      <button
                        type="button"
                        className="dm-drive-crumb"
                        onClick={() => selectBrowseFolder(crumb.id)}
                      >
                        {crumb.name}
                      </button>
                    )}
                  </React.Fragment>
                );
              })}
            </nav>
            <label className="dm-field dm-search">
              <span>Search</span>
              <input
                className="dm-input"
                placeholder="SKU, product, category, tags…"
                value={search}
                onChange={(e) => { setPage(1); setSearch(e.target.value); }}
              />
            </label>
            <label className="dm-field">
              <span>Category</span>
              <input className="dm-input" value={category} onChange={(e) => { setPage(1); setCategory(e.target.value); }} placeholder="Category" />
            </label>
            <label className="dm-field">
              <span>From</span>
              <input type="date" className="dm-input" value={dateFrom} onChange={(e) => { setPage(1); setDateFrom(e.target.value); }} />
            </label>
            <label className="dm-field">
              <span>To</span>
              <input type="date" className="dm-input" value={dateTo} onChange={(e) => { setPage(1); setDateTo(e.target.value); }} />
            </label>
          </div>

          {loading ? (
            <div className="dm-empty">Loading…</div>
          ) : (
            <>
              {showFolderGrid ? (
                <section className="dm-drive-section">
                  <h3 className="dm-drive-section-title">Folders</h3>
                  <div className="dm-drive-folder-grid">
                    {driveFolders.map((child) => {
                      const count = (child.documentCount || 0) + (child.productImageCount || 0);
                      return (
                        <button
                          key={child._id}
                          type="button"
                          className="dm-drive-folder"
                          onDoubleClick={() => selectBrowseFolder(String(child._id))}
                          onClick={() => selectBrowseFolder(String(child._id))}
                          title={child.description || child.name}
                        >
                          <span className="dm-drive-folder-icon" aria-hidden="true">
                            {folderIcon(child.folderKind)}
                          </span>
                          <span className="dm-drive-folder-name">{child.name}</span>
                          <span className="dm-drive-folder-meta">
                            {count} item{count === 1 ? '' : 's'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              {showFilesSection ? (
                <section className="dm-drive-section">
                  {showFolderGrid ? <h3 className="dm-drive-section-title">Files</h3> : null}
                  <div className="dm-grid">
                    {allImages.map((doc) => (
                      <div key={doc._id} className={`dm-image-card${doc.isDefault ? ' is-default' : ''}`}>
                        <div className="dm-image-preview">
                          <img src={documentsAPI.fileUrl(doc.thumbnailUrl || doc.fileUrl)} alt={doc.title || doc.sku} />
                          {doc.isDefault ? (
                            <span className="dm-default-badge">Default</span>
                          ) : null}
                        </div>
                        <div className="dm-image-body">
                          <strong>{doc.sku || 'No SKU'}</strong>
                          <span className="dm-meta">{doc.productName || '—'}</span>
                          <span className="dm-meta">
                            {doc.category || '—'}
                            {doc.subCategory ? ` / ${doc.subCategory}` : ''}
                            {doc.brand ? ` · ${doc.brand}` : ''}
                          </span>
                          <span className="dm-meta">
                            {doc.kind === 'product'
                              ? 'Product catalog'
                              : doc.folderId
                                ? (folderById[String(doc.folderId)]?.name || 'Folder')
                                : 'Unfiled'}
                          </span>
                          {doc.kind !== 'product' ? (
                            <span className="dm-meta">{formatDateTime(doc.createdAt)} · by {doc.uploadedBy || 'AI'}</span>
                          ) : null}
                          <span className={`dm-badge ${doc.kind === 'product' ? 'catalog' : 'ai'}`}>
                            {doc.kind === 'product' ? 'Catalog' : `AI v${doc.version || 1}`}
                          </span>
                        </div>
                        <div className="dm-image-actions">
                          <button type="button" className="dm-btn" onClick={() => setPreview(doc)}>Preview</button>
                          <button
                            type="button"
                            className={`dm-btn${doc.isDefault ? ' dm-btn-default-active' : ''}`}
                            onClick={() => handleSetDefaultImage(doc)}
                            disabled={Boolean(doc.isDefault)}
                            title={doc.isDefault ? 'Already the default product image' : 'Show this image in Product Master'}
                          >
                            {doc.isDefault ? 'Default' : 'Set as default'}
                          </button>
                          <button type="button" className="dm-btn" onClick={() => handleDownload(doc)}>
                            {doc.kind === 'product' ? 'Open' : 'Download'}
                          </button>
                          <button type="button" className="dm-btn" onClick={() => handleShare(doc)}>Share</button>
                          {doc.kind !== 'product' ? (
                            <>
                              <button
                                type="button"
                                className="dm-btn"
                                onClick={() => setMoveDocId(moveDocId === doc._id ? null : doc._id)}
                              >
                                Move
                              </button>
                              <button type="button" className="dm-btn dm-btn-danger" onClick={() => handleDelete(doc)}>Delete</button>
                            </>
                          ) : null}
                        </div>
                        {moveDocId === doc._id ? (
                          <div className="dm-move-menu" style={{ padding: '0 0.85rem 0.85rem' }}>
                            <button type="button" className="dm-btn" onClick={() => handleMoveDocument(doc._id, null)}>Unfiled</button>
                            {moveTargets.map((f) => (
                              <button
                                key={f._id}
                                type="button"
                                className="dm-btn"
                                disabled={String(doc.folderId || '') === String(f._id)}
                                onClick={() => handleMoveDocument(doc._id, f._id)}
                              >
                                {f.label}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {!showFolderGrid && !showFilesSection ? (
                <div className="dm-empty">
                  <h3>No items{selectedFolder !== 'all' ? ` in ${selectedFolderLabel}` : ''}</h3>
                  <p>
                    {viewingSku
                      ? 'This SKU has no images yet. Upload from desktop, or generate in Utilities → Image Generator and Save.'
                      : 'Sync catalog folders, upload from desktop, or generate in Utilities → Image Generator and Save.'}
                  </p>
                </div>
              ) : null}
            </>
          )}

          {pagination && (pagination.totalPages || 1) > 1 ? (
            <div className="dm-pagination">
              <button type="button" className="dm-btn" disabled={!pagination.hasPrevPage} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <span>Page {pagination.page} / {pagination.totalPages}</span>
              <button type="button" className="dm-btn" disabled={!pagination.hasNextPage} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          ) : null}
        </div>
      </div>

      {preview ? (
        <div className="dm-modal-backdrop" onClick={() => setPreview(null)}>
          <div className="dm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dm-page-header">
              <div>
                <h1 style={{ fontSize: '1.2rem' }}>{preview.title || preview.sku}</h1>
                <p className="dm-subtitle">
                  {preview.sku}
                  {preview.productName ? ` · ${preview.productName}` : ''}
                  {preview.subCategory ? ` · ${preview.subCategory}` : ''}
                </p>
              </div>
              <button type="button" className="dm-btn" onClick={() => setPreview(null)}>Close</button>
            </div>
            <img src={documentsAPI.fileUrl(preview.fileUrl)} alt={preview.title || preview.sku} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default AiGeneratedImages;
