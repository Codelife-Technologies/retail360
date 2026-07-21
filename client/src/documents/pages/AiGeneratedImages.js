import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { documentsAPI } from '../services/documentsApi';
import { extractList, formatDateTime } from '../utils/documentsUtils';

const SOURCE_SCOPE = 'AI Generator';

function AiGeneratedImages() {
  const [docs, setDocs] = useState([]);
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
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [moveDocId, setMoveDocId] = useState(null);

  const loadFolders = useCallback(async () => {
    try {
      const res = await documentsAPI.listFolders({ sourceScope: SOURCE_SCOPE });
      setFolders(res.data?.folders || []);
      setUnfiledCount(res.data?.unfiledCount || 0);
    } catch (_e) {
      // non-fatal
    }
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
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
      setDocs(data);
      setPagination(pag);
    } catch (e) {
      setToast(e.response?.data?.error || 'Failed to load AI images');
    } finally {
      setLoading(false);
    }
  }, [page, search, category, dateFrom, dateTo, selectedFolder]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadFolders(); }, [loadFolders]);

  const folderNameById = useMemo(() => {
    const map = {};
    folders.forEach((f) => { map[String(f._id)] = f.name; });
    return map;
  }, [folders]);

  const selectedFolderLabel = useMemo(() => {
    if (selectedFolder === 'all') return 'All images';
    if (selectedFolder === 'unfiled') return 'Unfiled';
    return folderNameById[selectedFolder] || 'Folder';
  }, [selectedFolder, folderNameById]);

  const handleDownload = async (doc) => {
    try {
      await documentsAPI.download(doc._id, doc.fileName || 'image');
    } catch (e) {
      setToast(e.response?.data?.error || 'Download failed');
    }
  };

  const handleShare = async (doc) => {
    const url = documentsAPI.fileUrl(doc.fileUrl);
    try {
      if (navigator.share) {
        await navigator.share({ title: doc.title || doc.sku, url });
      } else {
        await navigator.clipboard.writeText(url);
        setToast('Link copied to clipboard');
        setTimeout(() => setToast(''), 2000);
      }
    } catch (_e) {
      await navigator.clipboard.writeText(url);
      setToast('Link copied to clipboard');
      setTimeout(() => setToast(''), 2000);
    }
  };

  const handleDelete = async (doc) => {
    if (!window.confirm(`Move "${doc.title || doc.sku}" to trash?`)) return;
    try {
      await documentsAPI.softDelete(doc._id);
      setToast('Moved to trash');
      await Promise.all([load(), loadFolders()]);
      setTimeout(() => setToast(''), 2000);
    } catch (e) {
      setToast(e.response?.data?.error || 'Delete failed');
    }
  };

  const handleCreateFolder = async (e) => {
    e?.preventDefault?.();
    const name = newFolderName.trim();
    if (!name) {
      setToast('Enter a folder name');
      return;
    }
    try {
      setCreatingFolder(true);
      const res = await documentsAPI.createFolder({ name, sourceScope: SOURCE_SCOPE });
      setNewFolderName('');
      setToast(`Folder "${name}" created`);
      await loadFolders();
      if (res.data?._id) {
        setSelectedFolder(String(res.data._id));
        setPage(1);
      }
    } catch (err) {
      setToast(err.response?.data?.error || 'Failed to create folder');
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
      setToast('Folder name is required');
      return;
    }
    try {
      await documentsAPI.updateFolder(folderId, { name });
      setRenamingId(null);
      setToast('Folder renamed');
      await loadFolders();
    } catch (err) {
      setToast(err.response?.data?.error || 'Rename failed');
    }
  };

  const handleDeleteFolder = async (folder) => {
    const count = folder.documentCount || 0;
    const msg = count
      ? `Delete folder "${folder.name}"? ${count} image(s) will be moved to Unfiled.`
      : `Delete folder "${folder.name}"? This cannot be undone.`;
    if (!window.confirm(msg)) return;
    try {
      await documentsAPI.deleteFolder(folder._id);
      setToast('Folder deleted');
      if (selectedFolder === String(folder._id)) {
        setSelectedFolder('all');
        setPage(1);
      }
      await Promise.all([loadFolders(), load()]);
    } catch (err) {
      setToast(err.response?.data?.error || 'Failed to delete folder');
    }
  };

  const moveFolderUp = async (index) => {
    if (index <= 0) return;
    const ids = folders.map((f) => f._id);
    [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
    try {
      const res = await documentsAPI.reorderFolders(ids, SOURCE_SCOPE);
      setFolders(res.data?.folders || []);
      setUnfiledCount(res.data?.unfiledCount ?? unfiledCount);
    } catch (err) {
      setToast(err.response?.data?.error || 'Reorder failed');
    }
  };

  const moveFolderDown = async (index) => {
    if (index >= folders.length - 1) return;
    const ids = folders.map((f) => f._id);
    [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]];
    try {
      const res = await documentsAPI.reorderFolders(ids, SOURCE_SCOPE);
      setFolders(res.data?.folders || []);
      setUnfiledCount(res.data?.unfiledCount ?? unfiledCount);
    } catch (err) {
      setToast(err.response?.data?.error || 'Reorder failed');
    }
  };

  const handleMoveDocument = async (docId, folderId) => {
    try {
      await documentsAPI.moveToFolder(docId, folderId || null);
      setMoveDocId(null);
      setToast('Image moved');
      await Promise.all([load(), loadFolders()]);
    } catch (err) {
      setToast(err.response?.data?.error || 'Move failed');
    }
  };

  const selectBrowseFolder = (key) => {
    setSelectedFolder(key);
    setPage(1);
    setMoveDocId(null);
  };

  return (
    <div className="dm-page">
      <div className="dm-page-header">
        <div>
          <h1>AI Generated Images</h1>
          <p className="dm-subtitle">Organize AI images into folders · Saved from the Image Generator</p>
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
              placeholder="New folder name"
              maxLength={120}
              aria-label="New folder name"
            />
            <button type="submit" className="dm-btn dm-btn-primary" disabled={creatingFolder || !newFolderName.trim()}>
              {creatingFolder ? '…' : 'Add'}
            </button>
          </form>

          <nav className="dm-folder-list" aria-label="AI image folders">
            <button
              type="button"
              className={`dm-folder-item${selectedFolder === 'all' ? ' active' : ''}`}
              onClick={() => selectBrowseFolder('all')}
            >
              <span className="dm-folder-icon">📁</span>
              <span className="dm-folder-name">All images</span>
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

            {folders.map((folder, index) => {
              const id = String(folder._id);
              const isActive = selectedFolder === id;
              const isRenaming = renamingId === id;
              return (
                <div key={id} className={`dm-folder-row${isActive ? ' active' : ''}`}>
                  {isRenaming ? (
                    <div className="dm-folder-rename">
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
                    <>
                      <button
                        type="button"
                        className={`dm-folder-item${isActive ? ' active' : ''}`}
                        onClick={() => selectBrowseFolder(id)}
                      >
                        <span className="dm-folder-icon">📂</span>
                        <span className="dm-folder-name" title={folder.description || folder.name}>{folder.name}</span>
                        <span className="dm-folder-count">{folder.documentCount || 0}</span>
                      </button>
                      <div className="dm-folder-actions">
                        <button type="button" className="dm-folder-action" title="Move up" disabled={index === 0} onClick={() => moveFolderUp(index)}>↑</button>
                        <button type="button" className="dm-folder-action" title="Move down" disabled={index === folders.length - 1} onClick={() => moveFolderDown(index)}>↓</button>
                        <button type="button" className="dm-folder-action" title="Rename" onClick={() => startRename(folder)}>✎</button>
                        <button type="button" className="dm-folder-action-btn danger" title="Delete folder" onClick={() => handleDeleteFolder(folder)}>Delete</button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </nav>

          {!folders.length ? (
            <p className="dm-folder-hint">Create folders to sort AI images the way you want.</p>
          ) : null}
        </aside>

        <div className="dm-main-panel">
          <div className="dm-toolbar">
            <div className="dm-folder-breadcrumb">
              Viewing: <strong>{selectedFolderLabel}</strong>
            </div>
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
          ) : docs.length === 0 ? (
            <div className="dm-empty">
              <h3>No AI images{selectedFolder !== 'all' ? ` in ${selectedFolderLabel}` : ''}</h3>
              <p>Generate images in Utilities → Image Generator, then click <strong>Save</strong> (optionally choose a folder).</p>
            </div>
          ) : (
            <div className="dm-grid">
              {docs.map((doc) => (
                <div key={doc._id} className="dm-image-card">
                  <div className="dm-image-preview">
                    <img src={documentsAPI.fileUrl(doc.thumbnailUrl || doc.fileUrl)} alt={doc.title} />
                  </div>
                  <div className="dm-image-body">
                    <strong>{doc.sku || 'No SKU'}</strong>
                    <span className="dm-meta">{doc.productName || '—'}</span>
                    <span className="dm-meta">{doc.category || '—'} · {doc.brand || '—'}</span>
                    <span className="dm-meta">
                      {doc.folderId ? (folderNameById[String(doc.folderId)] || 'Folder') : 'Unfiled'}
                    </span>
                    <span className="dm-meta">{formatDateTime(doc.createdAt)} · by {doc.uploadedBy || 'AI'}</span>
                    <span className="dm-badge ai">v{doc.version}</span>
                  </div>
                  <div className="dm-image-actions">
                    <button type="button" className="dm-btn" onClick={() => setPreview(doc)}>Preview</button>
                    <button type="button" className="dm-btn" onClick={() => handleDownload(doc)}>Download</button>
                    <button type="button" className="dm-btn" onClick={() => handleShare(doc)}>Share</button>
                    <button
                      type="button"
                      className="dm-btn"
                      onClick={() => setMoveDocId(moveDocId === doc._id ? null : doc._id)}
                    >
                      Move
                    </button>
                    <button type="button" className="dm-btn dm-btn-danger" onClick={() => handleDelete(doc)}>Delete</button>
                  </div>
                  {moveDocId === doc._id ? (
                    <div className="dm-move-menu" style={{ padding: '0 0.85rem 0.85rem' }}>
                      <button type="button" className="dm-btn" onClick={() => handleMoveDocument(doc._id, null)}>Unfiled</button>
                      {folders.map((f) => (
                        <button
                          key={f._id}
                          type="button"
                          className="dm-btn"
                          disabled={String(doc.folderId || '') === String(f._id)}
                          onClick={() => handleMoveDocument(doc._id, f._id)}
                        >
                          {f.name}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          {pagination ? (
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
                <h1 style={{ fontSize: '1.2rem' }}>{preview.title}</h1>
                <p className="dm-subtitle">{preview.sku} · {preview.productName}</p>
              </div>
              <button type="button" className="dm-btn" onClick={() => setPreview(null)}>Close</button>
            </div>
            <img src={documentsAPI.fileUrl(preview.fileUrl)} alt={preview.title} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default AiGeneratedImages;
