import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { documentsAPI } from '../services/documentsApi';
import { documentIcon, extractList, formatBytes, formatDate } from '../utils/documentsUtils';

function EmployeeDocuments() {
  const [docs, setDocs] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [employee, setEmployee] = useState('');
  const [status, setStatus] = useState('Active');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [toast, setToast] = useState('');
  const [settings, setSettings] = useState(null);
  const [meta, setMeta] = useState({ title: '', department: '', description: '', tags: '', folderId: '' });
  const fileInputRef = useRef(null);

  const [folders, setFolders] = useState([]);
  const [unfiledCount, setUnfiledCount] = useState(0);
  const [selectedFolder, setSelectedFolder] = useState('all'); // 'all' | 'unfiled' | folderId
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [moveDocId, setMoveDocId] = useState(null);

  const loadFolders = useCallback(async () => {
    try {
      const res = await documentsAPI.listFolders({ sourceScope: 'Manual Upload' });
      setFolders(res.data?.folders || []);
      setUnfiledCount(res.data?.unfiledCount || 0);
    } catch (_e) {
      // non-fatal — documents still load
    }
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await documentsAPI.list({
        source: 'Manual Upload',
        status: status || undefined,
        search: search || undefined,
        department: department || undefined,
        uploadedBy: employee || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        folderId: selectedFolder === 'all' ? undefined : selectedFolder,
        page,
        limit: 25,
      });
      const { data, pagination: pag } = extractList(res);
      setDocs(data);
      setPagination(pag);
    } catch (e) {
      setToast(e.response?.data?.error || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [page, search, department, employee, status, dateFrom, dateTo, selectedFolder]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadFolders(); }, [loadFolders]);

  useEffect(() => {
    documentsAPI.getSettings().then((r) => setSettings(r.data)).catch(() => {});
  }, []);

  // Keep upload target folder in sync with the selected browse folder
  useEffect(() => {
    if (selectedFolder === 'all' || selectedFolder === 'unfiled') {
      setMeta((m) => ({ ...m, folderId: '' }));
    } else {
      setMeta((m) => ({ ...m, folderId: selectedFolder }));
    }
  }, [selectedFolder]);

  const folderNameById = useMemo(() => {
    const map = {};
    folders.forEach((f) => { map[String(f._id)] = f.name; });
    return map;
  }, [folders]);

  const selectedFolderLabel = useMemo(() => {
    if (selectedFolder === 'all') return 'All documents';
    if (selectedFolder === 'unfiled') return 'Unfiled';
    return folderNameById[selectedFolder] || 'Folder';
  }, [selectedFolder, folderNameById]);

  const uploadFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    const maxBytes = settings?.maxUploadBytes || 25 * 1024 * 1024;
    const allowed = settings?.allowedExtensions || [];
    for (const file of files) {
      if (file.size > maxBytes) {
        setToast(`${file.name} exceeds max size (${formatBytes(maxBytes)})`);
        return;
      }
      const ext = `.${(file.name.split('.').pop() || '').toLowerCase()}`;
      if (allowed.length && !allowed.includes(ext)) {
        setToast(`${file.name}: file type not allowed`);
        return;
      }
    }

    try {
      setUploading(true);
      setProgress(15);
      const formData = new FormData();
      files.forEach((f) => formData.append('files', f));
      if (meta.title) formData.append('title', meta.title);
      if (meta.department) formData.append('department', meta.department);
      if (meta.description) formData.append('description', meta.description);
      if (meta.tags) formData.append('tags', meta.tags);
      if (meta.folderId) formData.append('folderId', meta.folderId);

      setProgress(45);
      const res = await documentsAPI.upload(formData);
      setProgress(100);
      setToast(res.data?.message || 'Upload complete');
      setMeta({ title: '', department: meta.department, description: '', tags: '', folderId: meta.folderId });
      await Promise.all([load(), loadFolders()]);
      setTimeout(() => { setToast(''); setProgress(0); }, 2500);
    } catch (e) {
      setToast(e.response?.data?.error || 'Upload failed');
      setProgress(0);
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    uploadFiles(e.dataTransfer.files);
  };

  const handleDelete = async (doc) => {
    if (!window.confirm(`Move "${doc.title || doc.fileName}" to trash?`)) return;
    try {
      await documentsAPI.softDelete(doc._id);
      setToast('Moved to trash');
      await Promise.all([load(), loadFolders()]);
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
      const res = await documentsAPI.createFolder({ name, sourceScope: 'Manual Upload' });
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
      ? `Delete folder "${folder.name}"? ${count} document(s) will be moved to Unfiled.`
      : `Delete folder "${folder.name}"?`;
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
      const res = await documentsAPI.reorderFolders(ids, 'Manual Upload');
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
      const res = await documentsAPI.reorderFolders(ids, 'Manual Upload');
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
      setToast('Document moved');
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
          <h1>Employee Documents</h1>
          <p className="dm-subtitle">
            Organize files into folders · Upload PDF, Word, Excel, PowerPoint, images, ZIP, TXT, CSV
            {settings ? ` · Max ${formatBytes(settings.maxUploadBytes)}` : ''}
          </p>
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

          <nav className="dm-folder-list" aria-label="Document folders">
            <button
              type="button"
              className={`dm-folder-item${selectedFolder === 'all' ? ' active' : ''}`}
              onClick={() => selectBrowseFolder('all')}
            >
              <span className="dm-folder-icon">📁</span>
              <span className="dm-folder-name">All documents</span>
            </button>
            <button
              type="button"
              className={`dm-folder-item${selectedFolder === 'unfiled' ? ' active' : ''}`}
              onClick={() => selectBrowseFolder('unfiled')}
            >
              <span className="dm-folder-icon">📄</span>
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
            <p className="dm-folder-hint">Create folders to sort documents the way you want.</p>
          ) : null}
        </aside>

        <div className="dm-main-panel">
          <div className="dm-card">
            <h3>Upload Documents{selectedFolder !== 'all' && selectedFolder !== 'unfiled' ? ` → ${selectedFolderLabel}` : ''}</h3>
            <div className="dm-toolbar">
              <label className="dm-field">
                <span>Title (optional)</span>
                <input className="dm-input" value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} />
              </label>
              <label className="dm-field">
                <span>Department</span>
                <input className="dm-input" value={meta.department} onChange={(e) => setMeta({ ...meta, department: e.target.value })} />
              </label>
              <label className="dm-field">
                <span>Folder</span>
                <select
                  className="dm-select"
                  value={meta.folderId}
                  onChange={(e) => setMeta({ ...meta, folderId: e.target.value })}
                >
                  <option value="">Unfiled</option>
                  {folders.map((f) => (
                    <option key={f._id} value={f._id}>{f.name}</option>
                  ))}
                </select>
              </label>
              <label className="dm-field dm-search">
                <span>Tags (comma separated)</span>
                <input className="dm-input" value={meta.tags} onChange={(e) => setMeta({ ...meta, tags: e.target.value })} />
              </label>
            </div>
            <div
              className={`dm-dropzone${dragActive ? ' active' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
            >
              <p><strong>Drag & drop files here</strong></p>
              <p>or click to browse · multiple files supported</p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={(e) => uploadFiles(e.target.files)}
              />
            </div>
            {uploading || progress > 0 ? (
              <div className="dm-progress" aria-label="Upload progress">
                <div className="dm-progress-bar" style={{ width: `${progress}%` }} />
              </div>
            ) : null}
          </div>

          <div className="dm-toolbar">
            <div className="dm-folder-breadcrumb">
              Viewing: <strong>{selectedFolderLabel}</strong>
            </div>
            <label className="dm-field dm-search">
              <span>Search</span>
              <input className="dm-input" value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} placeholder="Name, employee, tags…" />
            </label>
            <label className="dm-field">
              <span>Department</span>
              <input className="dm-input" value={department} onChange={(e) => { setPage(1); setDepartment(e.target.value); }} />
            </label>
            <label className="dm-field">
              <span>Employee</span>
              <input className="dm-input" value={employee} onChange={(e) => { setPage(1); setEmployee(e.target.value); }} />
            </label>
            <label className="dm-field">
              <span>Status</span>
              <select className="dm-select" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
                <option value="Active">Active</option>
                <option value="Archived">Archived</option>
              </select>
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

          <div className="dm-card">
            {loading ? (
              <div className="dm-empty">Loading…</div>
            ) : docs.length === 0 ? (
              <div className="dm-empty">
                <h3>No documents{selectedFolder !== 'all' ? ` in ${selectedFolderLabel}` : ''}</h3>
                <p>Upload files using the dropzone above{folders.length ? ', or pick another folder.' : '.'}</p>
              </div>
            ) : (
              <div className="dm-table-wrap">
                <table className="dm-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Document Name</th>
                      <th>Folder</th>
                      <th>Department</th>
                      <th>Uploaded By</th>
                      <th>Upload Date</th>
                      <th>Size</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docs.map((doc) => (
                      <tr key={doc._id}>
                        <td style={{ fontSize: '1.25rem' }}>{documentIcon(doc)}</td>
                        <td>{doc.title || doc.fileName}</td>
                        <td>{doc.folderId ? (folderNameById[String(doc.folderId)] || 'Folder') : 'Unfiled'}</td>
                        <td>{doc.department || '—'}</td>
                        <td>{doc.uploadedBy || '—'}</td>
                        <td>{formatDate(doc.createdAt)}</td>
                        <td>{formatBytes(doc.fileSize)}</td>
                        <td><span className={`dm-badge ${String(doc.status || '').toLowerCase()}`}>{doc.status}</span></td>
                        <td>
                          <button type="button" className="dm-link" onClick={() => documentsAPI.download(doc._id, doc.fileName || doc.title).catch((e) => setToast(e.response?.data?.error || 'Download failed'))}>Download</button>
                          {' · '}
                          <button type="button" className="dm-link" onClick={() => setMoveDocId(moveDocId === doc._id ? null : doc._id)}>Move</button>
                          {' · '}
                          <button type="button" className="dm-link" onClick={() => handleDelete(doc)}>Delete</button>
                          {moveDocId === doc._id ? (
                            <div className="dm-move-menu">
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
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {pagination ? (
            <div className="dm-pagination">
              <button type="button" className="dm-btn" disabled={!pagination.hasPrevPage} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <span>Page {pagination.page} / {pagination.totalPages}</span>
              <button type="button" className="dm-btn" disabled={!pagination.hasNextPage} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default EmployeeDocuments;
