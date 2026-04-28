(() => {
  const DRIVE_API        = 'https://www.googleapis.com/drive/v3';
  const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
  const SCOPE_KEY        = 'dermai-drive-scope';
  const FOLDER_ROOT_KEY  = 'dermai-drive-folder-root';
  const FOLDER_SCANS_KEY = 'dermai-drive-folder-scans';
  const FOLDER_PROG_KEY  = 'dermai-drive-folder-progress';

  function hasScope() {
    return localStorage.getItem(SCOPE_KEY) === 'true';
  }

  async function requestDriveScope() {
    if (window.Auth) await window.Auth.requestDriveScope();
  }

  async function _token() {
    const t = window.Auth ? await window.Auth.getProviderToken() : null;
    if (!t) throw new Error('Drive: no provider_token — call requestDriveScope() first');
    return t;
  }

  async function _apiFetch(url, opts = {}) {
    const token = await _token();
    const res = await fetch(url, {
      ...opts,
      headers: { Authorization: `Bearer ${token}`, ...opts.headers },
    });
    if (res.status === 204) return null;
    if (!res.ok) {
      // 401 means token expired — caller should re-trigger OAuth
      const body = await res.json().catch(() => ({}));
      const err = new Error(body.error?.message || `Drive API ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  async function _ensureFolder(name, parentId, cacheKey) {
    const cached = localStorage.getItem(cacheKey);
    if (cached) return cached;

    const q = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parentId ? ` and '${parentId}' in parents` : ''}`;
    const search = await _apiFetch(`${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id)`);
    if (search.files.length > 0) {
      localStorage.setItem(cacheKey, search.files[0].id);
      return search.files[0].id;
    }

    const meta = { name, mimeType: 'application/vnd.google-apps.folder' };
    if (parentId) meta.parents = [parentId];
    const created = await _apiFetch(`${DRIVE_API}/files?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(meta),
    });
    localStorage.setItem(cacheKey, created.id);
    return created.id;
  }

  async function ensureScansFolder() {
    const root = await _ensureFolder('DermAI Photos', null, FOLDER_ROOT_KEY);
    return _ensureFolder('Scans', root, FOLDER_SCANS_KEY);
  }

  async function ensureProgressFolder() {
    const root = await _ensureFolder('DermAI Photos', null, FOLDER_ROOT_KEY);
    return _ensureFolder('Progress', root, FOLDER_PROG_KEY);
  }

  async function uploadPhoto(file, filename, folderId) {
    const token = await _token();
    const meta  = { name: filename, parents: [folderId] };
    const form  = new FormData();
    form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
    form.append('file', file);

    const res = await fetch(
      `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,webViewLink,thumbnailLink`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error?.message || `Drive upload ${res.status}`);
    }
    return res.json(); // { id, webViewLink }
  }

  async function deletePhoto(fileId) {
    await _apiFetch(`${DRIVE_API}/files/${fileId}`, { method: 'DELETE' });
  }

  // Silently migrate existing PhotoDB blobs to DermAI Photos/Scans/ on first Drive grant.
  async function migrateFromIndexedDB(userId) {
    const key = `dermai-drive-migrated:${userId}`;
    if (localStorage.getItem(key) || typeof PhotoDB === 'undefined') return;
    try {
      const photos = await PhotoDB.getAll();
      if (!photos.length) { localStorage.setItem(key, 'true'); return; }
      const folderId = await ensureScansFolder();
      for (const photo of photos) {
        try {
          const date = new Date(photo.scanAt).toISOString().slice(0, 10);
          const file = new File([photo.blob], `migrated-scan-${date}.jpg`, { type: 'image/jpeg' });
          await uploadPhoto(file, `scan-${date}-front.jpg`, folderId);
        } catch (e) {
          console.warn('[Drive] migration skip:', photo.id, e.message);
        }
      }
      localStorage.setItem(key, 'true');
    } catch (e) {
      console.warn('[Drive] migrateFromIndexedDB failed:', e.message);
    }
  }

  window.Drive = { hasScope, requestDriveScope, ensureScansFolder, ensureProgressFolder, uploadPhoto, deletePhoto, migrateFromIndexedDB };
})();
