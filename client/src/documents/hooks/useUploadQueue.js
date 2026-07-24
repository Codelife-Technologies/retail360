import { useCallback, useRef, useState } from 'react';
import { documentsAPI } from '../services/documentsApi';
import { SOURCE_AI } from '../utils/driveLocalStore';

function makeId() {
  return `up_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Floating upload queue with progress, cancel, retry.
 * Uses existing upload / uploadAi endpoints + axios onUploadProgress.
 */
export function useUploadQueue({ scope, folderId, meta = {}, onComplete } = {}) {
  const [items, setItems] = useState([]);
  const controllers = useRef(new Map());

  const updateItem = useCallback((id, patch) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const removeItem = useCallback((id) => {
    const ctrl = controllers.current.get(id);
    if (ctrl) {
      ctrl.abort();
      controllers.current.delete(id);
    }
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const runUpload = useCallback(
    async (entry) => {
      const controller = new AbortController();
      controllers.current.set(entry.id, controller);
      updateItem(entry.id, { status: 'uploading', progress: 0, error: '' });

      try {
        const formData = new FormData();
        formData.append('files', entry.file);
        if (entry.folderId) formData.append('folderId', entry.folderId);
        if (entry.meta?.title) formData.append('title', entry.meta.title);
        if (entry.meta?.department) formData.append('department', entry.meta.department);
        if (entry.meta?.description) formData.append('description', entry.meta.description);
        if (entry.meta?.tags) formData.append('tags', entry.meta.tags);

        const isAi = entry.scope === SOURCE_AI;
        const apiCall = isAi ? documentsAPI.uploadAi : documentsAPI.upload;
        await apiCall(formData, {
          signal: controller.signal,
          onUploadProgress: (evt) => {
            if (!evt.total) return;
            const pct = Math.round((evt.loaded / evt.total) * 100);
            updateItem(entry.id, { progress: pct });
          },
        });

        updateItem(entry.id, { status: 'done', progress: 100 });
        controllers.current.delete(entry.id);
        if (onComplete) onComplete(entry);
        setTimeout(() => removeItem(entry.id), 1800);
      } catch (e) {
        if (e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError') {
          updateItem(entry.id, { status: 'cancelled', error: 'Cancelled' });
        } else {
          updateItem(entry.id, {
            status: 'error',
            error: e.response?.data?.error || e.message || 'Upload failed',
          });
        }
        controllers.current.delete(entry.id);
      }
    },
    [updateItem, removeItem, onComplete]
  );

  const enqueueFiles = useCallback(
    (fileList, overrides = {}) => {
      const files = Array.from(fileList || []);
      if (!files.length) return;
      const nextEntries = files.map((file) => ({
        id: makeId(),
        file,
        name: file.name,
        size: file.size,
        previewUrl: file.type?.startsWith('image/') ? URL.createObjectURL(file) : '',
        scope: overrides.scope || scope,
        folderId: overrides.folderId !== undefined ? overrides.folderId : folderId,
        meta: { ...meta, ...(overrides.meta || {}) },
        status: 'queued',
        progress: 0,
        error: '',
      }));
      setItems((prev) => [...nextEntries, ...prev]);
      nextEntries.forEach((entry) => runUpload(entry));
    },
    [scope, folderId, meta, runUpload]
  );

  const cancel = useCallback(
    (id) => {
      const ctrl = controllers.current.get(id);
      if (ctrl) ctrl.abort();
      updateItem(id, { status: 'cancelled', error: 'Cancelled' });
    },
    [updateItem]
  );

  const retry = useCallback(
    (id) => {
      setItems((prev) => {
        const found = prev.find((it) => it.id === id);
        if (found) {
          setTimeout(() => runUpload(found), 0);
        }
        return prev.map((it) =>
          it.id === id ? { ...it, status: 'queued', progress: 0, error: '' } : it
        );
      });
    },
    [runUpload]
  );

  const clearDone = useCallback(() => {
    setItems((prev) => prev.filter((it) => it.status === 'uploading' || it.status === 'queued'));
  }, []);

  return {
    items,
    enqueueFiles,
    cancel,
    retry,
    removeItem,
    clearDone,
    hasActive: items.some((it) => it.status === 'uploading' || it.status === 'queued'),
  };
}
