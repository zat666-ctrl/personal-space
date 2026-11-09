(() => {
    'use strict';

    const STORAGE_BUCKET = 'personal-files';
    const MAX_FILE_BYTES = 50 * 1024 * 1024;
    let personalSpaceClient = null;
    let currentUser = null;
    let lastLoadedUserId = null;
    let notes = [];
    let activeNoteId = null;
    let files = [];
    let cloudDebounce = null;

    function configured() {
        const config = window.PERSONAL_SPACE_CONFIG || {};
        return Boolean(
            config.url &&
            config.publishableKey &&
            !config.url.includes('__SUPABASE_') &&
            !config.publishableKey.includes('__SUPABASE_')
        );
    }

    function setAuthMessage(message, isError = false) {
        const element = document.getElementById('cloud-auth-message');
        if (!element) return;
        element.textContent = message || '';
        element.style.color = isError ? '#ef4444' : '';
    }

    function requireUser(featureName) {
        if (currentUser) return true;
        alert(`Please sign in from Settings → Cloud Sync to use ${featureName}.`);
        return false;
    }

    function collectPageData() {
        const pageData = {};
        (settings.pages || []).forEach((page) => {
            const value = localStorage.getItem('dashboard-page-' + page.id);
            if (!value) return;
            try { pageData[page.id] = JSON.parse(value); } catch {}
        });
        return pageData;
    }

    function collectQuickNotes() {
        return {
            plain: localStorage.getItem('notepad') || '',
            rich: localStorage.getItem('notepad-rich') || '',
            markdown: localStorage.getItem('notepad-md') || ''
        };
    }

    function safeSettingsForCloud() {
        const clone = JSON.parse(JSON.stringify(settings));
        delete clone.firebaseConfig;
        delete clone.supabaseConfig;
        return clone;
    }

    function applyCloudState(data) {
        if (data.settings) {
            settings = { ...defaultSettings, ...data.settings };
            settings.widgetSizes = {
                ...defaultSettings.widgetSizes,
                ...(data.settings.widgetSizes || {})
            };
            localStorage.setItem('dashboard-settings', JSON.stringify(settings));
        }
        if (Array.isArray(data.shortcuts)) {
            shortcuts = data.shortcuts;
            localStorage.setItem('dashboard-shortcuts', JSON.stringify(shortcuts));
        }
        if (Array.isArray(data.shortcut_folders)) {
            shortcutFolders = data.shortcut_folders;
            localStorage.setItem('dashboard-shortcut-folders', JSON.stringify(shortcutFolders));
        }
        if (Array.isArray(data.todos)) {
            todos = data.todos;
            localStorage.setItem('dashboard-todos', JSON.stringify(todos));
        }
        if (data.daily_focus) {
            localStorage.setItem('dashboard-daily-focus', JSON.stringify(data.daily_focus));
        }
        if (data.widget_positions) {
            localStorage.setItem('dashboard-widget-grid-v2', JSON.stringify(data.widget_positions));
        }
        if (data.page_data && typeof data.page_data === 'object') {
            Object.entries(data.page_data).forEach(([pageId, state]) => {
                localStorage.setItem('dashboard-page-' + pageId, JSON.stringify(state));
            });
        }
        if (data.quick_notes) {
            localStorage.setItem('notepad', data.quick_notes.plain || '');
            localStorage.setItem('notepad-rich', data.quick_notes.rich || '');
            localStorage.setItem('notepad-md', data.quick_notes.markdown || '');
        }

        applySettings();
        updateSettingsUI();
        renderShortcuts();
        renderFolderManagement();
        renderTodos();
        renderPageTabs();
        loadWidgetPositions();
    }

    async function handleUserChanged(user) {
        currentUser = user || null;
        cloudSyncState.user = currentUser;
        updateCloudSyncUI(currentUser ? 'signed-in' : 'signed-out');

        const avatar = document.getElementById('cloud-user-avatar');
        if (avatar) avatar.style.display = 'none';

        if (!currentUser) {
            lastLoadedUserId = null;
            notes = [];
            files = [];
            renderKnowledgeList();
            renderFileList();
            return;
        }

        const email = currentUser.email || '';
        const name = document.getElementById('cloud-user-name');
        const emailElement = document.getElementById('cloud-user-email');
        if (name) name.textContent = email.split('@')[0] || 'Personal Space';
        if (emailElement) emailElement.textContent = email;

        if (lastLoadedUserId === currentUser.id) return;
        lastLoadedUserId = currentUser.id;
        await syncFromCloud();
        await Promise.all([loadNotes(), loadFiles()]);
    }

    initFirebase = function initSupabase() {
        if (!configured() || !window.supabase?.createClient) {
            setAuthMessage('Supabase is not configured for this build.', true);
            return false;
        }
        if (personalSpaceClient) return true;

        const config = window.PERSONAL_SPACE_CONFIG;
        personalSpaceClient = window.supabase.createClient(config.url, config.publishableKey, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true
            }
        });
        cloudSyncState.app = personalSpaceClient;
        cloudSyncState.auth = personalSpaceClient.auth;
        cloudSyncState.db = personalSpaceClient;
        cloudSyncState.initialized = true;

        personalSpaceClient.auth.onAuthStateChange((_event, session) => {
            setTimeout(() => handleUserChanged(session?.user || null), 0);
        });
        personalSpaceClient.auth.getSession().then(({ data, error }) => {
            if (error) setAuthMessage(error.message, true);
            else handleUserChanged(data.session?.user || null);
        });
        return true;
    };

    signInWithGoogle = async function signInWithSupabase() {
        if (!personalSpaceClient && !initFirebase()) return;
        const email = document.getElementById('cloud-email')?.value.trim();
        const password = document.getElementById('cloud-password')?.value || '';
        if (!email || !password) {
            setAuthMessage('Enter your email and password.', true);
            return;
        }
        setAuthMessage('Signing in…');
        const { error } = await personalSpaceClient.auth.signInWithPassword({ email, password });
        setAuthMessage(error ? error.message : 'Signed in.', Boolean(error));
    };

    async function signUpUser() {
        if (!personalSpaceClient && !initFirebase()) return;
        const email = document.getElementById('cloud-email')?.value.trim();
        const password = document.getElementById('cloud-password')?.value || '';
        if (!email || password.length < 8) {
            setAuthMessage('Use a valid email and a password of at least 8 characters.', true);
            return;
        }
        setAuthMessage('Creating account…');
        const { data, error } = await personalSpaceClient.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: window.location.href.split('#')[0] }
        });
        if (error) setAuthMessage(error.message, true);
        else if (!data.session) setAuthMessage('Check your email to confirm the account, then sign in.');
        else setAuthMessage('Account created and signed in.');
    }

    signOutUser = async function signOutSupabase() {
        if (!personalSpaceClient) return;
        const { error } = await personalSpaceClient.auth.signOut();
        if (error) setAuthMessage(error.message, true);
    };

    syncToCloud = async function syncStateToSupabase() {
        if (!personalSpaceClient || !currentUser) return;
        clearTimeout(cloudDebounce);
        updateCloudSyncUI('syncing');
        const payload = {
            user_id: currentUser.id,
            settings: safeSettingsForCloud(),
            shortcuts,
            shortcut_folders: shortcutFolders,
            todos,
            daily_focus: JSON.parse(localStorage.getItem('dashboard-daily-focus') || '{}'),
            widget_positions: JSON.parse(localStorage.getItem('dashboard-widget-grid-v2') || '{}'),
            page_data: collectPageData(),
            quick_notes: collectQuickNotes()
        };
        const { error } = await personalSpaceClient
            .from('dashboard_state')
            .upsert(payload, { onConflict: 'user_id' });
        updateCloudSyncUI(error ? 'error' : 'synced', error ? error.message : 'Synced just now');
    };

    syncFromCloud = async function syncStateFromSupabase() {
        if (!personalSpaceClient || !currentUser) return;
        updateCloudSyncUI('syncing', 'Pulling…');
        const { data, error } = await personalSpaceClient
            .from('dashboard_state')
            .select('*')
            .eq('user_id', currentUser.id)
            .maybeSingle();
        if (error) {
            updateCloudSyncUI('error', error.message);
            return;
        }
        if (!data) {
            await syncToCloud();
            return;
        }
        applyCloudState(data);
        updateCloudSyncUI('synced', 'Pulled from cloud');
    };

    function queueCloudSync() {
        if (!currentUser) return;
        clearTimeout(cloudDebounce);
        cloudDebounce = setTimeout(syncToCloud, 1200);
    }

    async function loadNotes() {
        if (!personalSpaceClient || !currentUser) return;
        const { data, error } = await personalSpaceClient
            .from('notes')
            .select('*')
            .order('updated_at', { ascending: false });
        if (error) {
            setKnowledgeStatus(error.message, true);
            return;
        }
        notes = data || [];
        renderKnowledgeList();
    }

    function setKnowledgeStatus(message, isError = false) {
        const element = document.getElementById('knowledge-status');
        if (!element) return;
        element.textContent = message || '';
        element.style.color = isError ? '#ef4444' : '';
    }

    function renderKnowledgeList() {
        const list = document.getElementById('knowledge-list');
        if (!list) return;
        const query = (document.getElementById('knowledge-search')?.value || '').trim().toLowerCase();
        const filtered = notes.filter((note) => {
            const haystack = `${note.title}\n${note.content}\n${(note.tags || []).join(' ')}`.toLowerCase();
            return !query || haystack.includes(query);
        });
        if (!filtered.length) {
            list.innerHTML = '<div class="personal-space-empty">No matching notes.</div>';
            return;
        }
        list.innerHTML = filtered.map((note) => `
            <button class="personal-space-list-item${note.id === activeNoteId ? ' active' : ''}" data-note-id="${note.id}">
                ${escapeHtml(note.title)}
                <small>${new Date(note.updated_at).toLocaleString()}</small>
            </button>
        `).join('');
        list.querySelectorAll('[data-note-id]').forEach((button) => {
            button.addEventListener('click', () => openNote(button.dataset.noteId));
        });
    }

    function openNote(id) {
        const note = notes.find((item) => item.id === id);
        if (!note) return;
        activeNoteId = id;
        document.getElementById('knowledge-title').value = note.title;
        document.getElementById('knowledge-tags').value = (note.tags || []).join(', ');
        document.getElementById('knowledge-content').value = note.content || '';
        showKnowledgeEditor();
        renderKnowledgeList();
        setKnowledgeStatus('');
    }

    function newNote() {
        activeNoteId = null;
        document.getElementById('knowledge-title').value = '';
        document.getElementById('knowledge-tags').value = '';
        document.getElementById('knowledge-content').value = '';
        showKnowledgeEditor();
        renderKnowledgeList();
        setKnowledgeStatus('New note');
        document.getElementById('knowledge-title').focus();
    }

    async function saveNote() {
        if (!requireUser('Knowledge Base')) return;
        const title = document.getElementById('knowledge-title').value.trim();
        const content = document.getElementById('knowledge-content').value;
        const tags = document.getElementById('knowledge-tags').value
            .split(',').map((tag) => tag.trim()).filter(Boolean);
        if (!title) {
            setKnowledgeStatus('A title is required.', true);
            return;
        }
        setKnowledgeStatus('Saving…');
        let result;
        if (activeNoteId) {
            result = await personalSpaceClient
                .from('notes')
                .update({ title, content, tags })
                .eq('id', activeNoteId)
                .select()
                .single();
        } else {
            result = await personalSpaceClient
                .from('notes')
                .insert({ user_id: currentUser.id, title, content, tags })
                .select()
                .single();
        }
        if (result.error) {
            setKnowledgeStatus(result.error.message, true);
            return;
        }
        activeNoteId = result.data.id;
        await loadNotes();
        setKnowledgeStatus('Saved');
    }

    async function deleteNote() {
        if (!activeNoteId || !confirm('Delete this note?')) return;
        const { error } = await personalSpaceClient.from('notes').delete().eq('id', activeNoteId);
        if (error) {
            setKnowledgeStatus(error.message, true);
            return;
        }
        activeNoteId = null;
        await loadNotes();
        newNote();
        setKnowledgeStatus('Deleted');
    }

    function showKnowledgePreview() {
        const editor = document.getElementById('knowledge-content');
        const preview = document.getElementById('knowledge-preview');
        preview.innerHTML = renderMarkdown(editor.value);
        preview.classList.remove('hidden');
        editor.classList.add('hidden');
    }

    function showKnowledgeEditor() {
        document.getElementById('knowledge-preview')?.classList.add('hidden');
        document.getElementById('knowledge-content')?.classList.remove('hidden');
    }

    async function loadFiles() {
        if (!personalSpaceClient || !currentUser) return;
        const { data, error } = await personalSpaceClient
            .from('files')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) {
            setFileStatus(error.message, true);
            return;
        }
        files = data || [];
        renderFileList();
    }

    function setFileStatus(message, isError = false) {
        const element = document.getElementById('file-status');
        if (!element) return;
        element.textContent = message || '';
        element.style.color = isError ? '#ef4444' : '';
    }

    function formatBytes(bytes) {
        if (!bytes) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'];
        const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
        return `${(bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`;
    }

    function renderFileList() {
        const list = document.getElementById('file-list');
        if (!list) return;
        const query = (document.getElementById('file-search')?.value || '').trim().toLowerCase();
        const filtered = files.filter((file) => !query || file.name.toLowerCase().includes(query));
        if (!filtered.length) {
            list.innerHTML = '<div class="personal-space-empty">No matching files.</div>';
            return;
        }
        list.innerHTML = filtered.map((file) => `
            <div class="personal-space-file-row">
                <div>
                    <div class="personal-space-file-name">${escapeHtml(file.name)}</div>
                    <small>${formatBytes(file.size_bytes)} · ${new Date(file.created_at).toLocaleString()}</small>
                </div>
                <div class="personal-space-toolbar">
                    <button class="tool-btn" data-file-open="${file.id}">Open</button>
                    <button class="tool-btn" data-file-delete="${file.id}">Delete</button>
                </div>
            </div>
        `).join('');
        list.querySelectorAll('[data-file-open]').forEach((button) => {
            button.addEventListener('click', () => openFile(button.dataset.fileOpen));
        });
        list.querySelectorAll('[data-file-delete]').forEach((button) => {
            button.addEventListener('click', () => deleteFile(button.dataset.fileDelete));
        });
    }

    function storageObjectName(name) {
        const extension = name.match(/\.([a-z0-9]{1,16})$/i)?.[1]?.toLowerCase();
        return `${crypto.randomUUID()}${extension ? `.${extension}` : ''}`;
    }

    async function uploadFiles(fileList) {
        if (!requireUser('Files')) return;
        const selected = Array.from(fileList || []);
        let uploadedCount = 0;
        const failures = [];
        for (const file of selected) {
            if (file.size > MAX_FILE_BYTES) {
                failures.push(`${file.name}: exceeds the 50 MB limit`);
                continue;
            }
            setFileStatus(`Uploading ${file.name}…`);
            // Supabase object keys are kept ASCII-only. The original filename,
            // including Chinese characters, is preserved in public.files.name.
            const objectPath = `${currentUser.id}/${storageObjectName(file.name)}`;
            const upload = await personalSpaceClient.storage
                .from(STORAGE_BUCKET)
                .upload(objectPath, file, { upsert: false, contentType: file.type || undefined });
            if (upload.error) {
                failures.push(`${file.name}: ${upload.error.message}`);
                continue;
            }
            const metadata = await personalSpaceClient.from('files').insert({
                user_id: currentUser.id,
                object_path: objectPath,
                name: file.name,
                mime_type: file.type || 'application/octet-stream',
                size_bytes: file.size
            });
            if (metadata.error) {
                await personalSpaceClient.storage.from(STORAGE_BUCKET).remove([objectPath]);
                failures.push(`${file.name}: ${metadata.error.message}`);
                continue;
            }
            uploadedCount += 1;
        }
        document.getElementById('file-upload-input').value = '';
        await loadFiles();
        if (failures.length) {
            setFileStatus(`${uploadedCount} uploaded; ${failures.join(' | ')}`, true);
        } else if (uploadedCount) {
            setFileStatus(`${uploadedCount} file${uploadedCount === 1 ? '' : 's'} uploaded successfully.`);
        }
    }

    async function openFile(id) {
        const file = files.find((item) => item.id === id);
        if (!file) return;
        const { data, error } = await personalSpaceClient.storage
            .from(STORAGE_BUCKET)
            .createSignedUrl(file.object_path, 60);
        if (error) setFileStatus(error.message, true);
        else window.open(data.signedUrl, '_blank', 'noopener');
    }

    async function deleteFile(id) {
        const file = files.find((item) => item.id === id);
        if (!file || !confirm(`Delete ${file.name}?`)) return;
        const storageResult = await personalSpaceClient.storage.from(STORAGE_BUCKET).remove([file.object_path]);
        if (storageResult.error) {
            setFileStatus(storageResult.error.message, true);
            return;
        }
        const { error } = await personalSpaceClient.from('files').delete().eq('id', id);
        if (error) setFileStatus(error.message, true);
        else {
            await loadFiles();
            setFileStatus('Deleted');
        }
    }

    function downloadJson(data, fileName) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName;
        anchor.click();
        URL.revokeObjectURL(url);
    }

    exportSettings = async function exportPersonalSpace() {
        const data = {
            settings: safeSettingsForCloud(),
            shortcuts,
            shortcutFolders,
            todos,
            dailyFocus: JSON.parse(localStorage.getItem('dashboard-daily-focus') || '{}'),
            widgetPositions: JSON.parse(localStorage.getItem('dashboard-widget-grid-v2') || '{}'),
            pageData: collectPageData(),
            quickNotes: collectQuickNotes(),
            notes: [],
            files: [],
            exportDate: new Date().toISOString(),
            version: 'personal-space-1.0'
        };
        if (personalSpaceClient && currentUser) {
            const [noteResult, fileResult] = await Promise.all([
                personalSpaceClient.from('notes').select('*').order('updated_at', { ascending: false }),
                personalSpaceClient.from('files').select('*').order('created_at', { ascending: false })
            ]);
            if (!noteResult.error) data.notes = noteResult.data || [];
            if (!fileResult.error) data.files = fileResult.data || [];
        }
        downloadJson(data, `personal-space-backup-${new Date().toISOString().slice(0, 10)}.json`);
    };

    importSettings = function importPersonalSpace(file) {
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (data.settings) {
                    settings = { ...defaultSettings, ...data.settings };
                    localStorage.setItem('dashboard-settings', JSON.stringify(settings));
                }
                if (Array.isArray(data.shortcuts)) {
                    shortcuts = data.shortcuts;
                    localStorage.setItem('dashboard-shortcuts', JSON.stringify(shortcuts));
                }
                if (Array.isArray(data.shortcutFolders)) {
                    shortcutFolders = data.shortcutFolders;
                    localStorage.setItem('dashboard-shortcut-folders', JSON.stringify(shortcutFolders));
                }
                if (Array.isArray(data.todos)) {
                    todos = data.todos;
                    localStorage.setItem('dashboard-todos', JSON.stringify(todos));
                }
                if (data.dailyFocus) localStorage.setItem('dashboard-daily-focus', JSON.stringify(data.dailyFocus));
                if (data.widgetPositions) localStorage.setItem('dashboard-widget-grid-v2', JSON.stringify(data.widgetPositions));
                if (data.pageData) {
                    Object.entries(data.pageData).forEach(([id, state]) => {
                        localStorage.setItem('dashboard-page-' + id, JSON.stringify(state));
                    });
                }
                if (data.quickNotes) {
                    localStorage.setItem('notepad', data.quickNotes.plain || '');
                    localStorage.setItem('notepad-rich', data.quickNotes.rich || '');
                    localStorage.setItem('notepad-md', data.quickNotes.markdown || '');
                }
                if (currentUser && Array.isArray(data.notes) && data.notes.length) {
                    const restored = data.notes.map((note) => ({
                        id: note.id,
                        user_id: currentUser.id,
                        title: note.title,
                        content: note.content || '',
                        tags: note.tags || []
                    }));
                    const { error } = await personalSpaceClient.from('notes').upsert(restored);
                    if (error) throw error;
                }
                if (currentUser) await syncToCloud();
                window.location.reload();
            } catch (error) {
                alert('Import failed: ' + (error.message || 'invalid backup file'));
            }
        };
        reader.readAsText(file);
    };

    function openKnowledgeBase() {
        if (!requireUser('Knowledge Base')) return;
        openOverlay(document.getElementById('knowledge-lightbox'));
        loadNotes();
        if (!activeNoteId && notes.length) openNote(notes[0].id);
    }

    function openFileManager() {
        if (!requireUser('Files')) return;
        openOverlay(document.getElementById('files-lightbox'));
        loadFiles();
    }

    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('cloud-signup-btn')?.addEventListener('click', signUpUser);
        document.getElementById('knowledge-btn')?.addEventListener('click', openKnowledgeBase);
        document.getElementById('files-btn')?.addEventListener('click', openFileManager);
        document.getElementById('close-knowledge')?.addEventListener('click', () => closeOverlay(document.getElementById('knowledge-lightbox')));
        document.getElementById('close-files')?.addEventListener('click', () => closeOverlay(document.getElementById('files-lightbox')));
        document.getElementById('knowledge-new')?.addEventListener('click', newNote);
        document.getElementById('knowledge-save')?.addEventListener('click', saveNote);
        document.getElementById('knowledge-delete')?.addEventListener('click', deleteNote);
        document.getElementById('knowledge-preview-btn')?.addEventListener('click', showKnowledgePreview);
        document.getElementById('knowledge-edit-btn')?.addEventListener('click', showKnowledgeEditor);
        document.getElementById('knowledge-search')?.addEventListener('input', renderKnowledgeList);
        document.getElementById('file-search')?.addEventListener('input', renderFileList);
        document.getElementById('file-upload-input')?.addEventListener('change', (event) => uploadFiles(event.target.files));
        document.getElementById('notepad-textarea')?.addEventListener('input', queueCloudSync);
        document.getElementById('notepad-richtext')?.addEventListener('input', queueCloudSync);
        document.getElementById('focus-input')?.addEventListener('input', queueCloudSync);

        const originalSaveTodos = saveTodos;
        saveTodos = function saveTodosAndSync() {
            originalSaveTodos();
            queueCloudSync();
        };
    });
})();
