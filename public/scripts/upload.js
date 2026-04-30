/* ─────────────────────────────────────────────────────────────────
   upload.js — KeyDrop upload page logic
   ───────────────────────────────────────────────────────────────── */

let currentTab = 'text';
let selectedFile = null;
let generatedCode = null;

// ── Tab Switching ───────────────────────────────────────────────────
function switchTab(tab) {
    currentTab = tab;

    document.getElementById('panel-text').classList.toggle('hidden', tab !== 'text');
    document.getElementById('panel-file').classList.toggle('hidden', tab !== 'file');

    document.getElementById('tab-text').classList.toggle('active', tab === 'text');
    document.getElementById('tab-file').classList.toggle('active', tab === 'file');

    document.getElementById('tab-text').setAttribute('aria-selected', tab === 'text');
    document.getElementById('tab-file').setAttribute('aria-selected', tab === 'file');

    clearError();
    hideCodeResult();
}

// ── Character Counter ───────────────────────────────────────────────
const textInput = document.getElementById('text-input');
if (textInput) {
    textInput.addEventListener('input', () => {
        document.getElementById('char-count').textContent =
            textInput.value.length.toLocaleString();
    });
}

// ── Drag & Drop ─────────────────────────────────────────────────────
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');

if (dropZone) {
    ['dragenter', 'dragover'].forEach(e =>
        dropZone.addEventListener(e, ev => { ev.preventDefault(); dropZone.classList.add('drag-over'); })
    );
    ['dragleave', 'drop'].forEach(e =>
        dropZone.addEventListener(e, ev => { ev.preventDefault(); dropZone.classList.remove('drag-over'); })
    );
    dropZone.addEventListener('drop', ev => {
        const file = ev.dataTransfer.files[0];
        if (file) handleFileSelect(file);
    });
}

if (fileInput) {
    fileInput.addEventListener('change', () => {
        if (fileInput.files[0]) handleFileSelect(fileInput.files[0]);
    });
}

function handleFileSelect(file) {
    const MAX = 50 * 1024 * 1024;
    if (file.size > MAX) {
        showError('File size exceeds the 50 MB limit.');
        return;
    }
    selectedFile = file;

    document.getElementById('file-emoji').textContent = getFileEmoji(file.name, file.type);
    document.getElementById('file-name-display').textContent = file.name;
    document.getElementById('file-size-display').textContent = formatBytes(file.size);
    document.getElementById('file-info').classList.remove('hidden');
    clearError();
    hideCodeResult();
}

function clearFile() {
    selectedFile = null;
    fileInput.value = '';
    document.getElementById('file-info').classList.add('hidden');
}

// ── Upload ───────────────────────────────────────────────────────────
async function uploadContent() {
    clearError();
    hideCodeResult();

    if (currentTab === 'text') {
        const text = textInput.value.trim();
        if (!text) { showError('Please enter some text to share.'); return; }
        await uploadText(text);
    } else {
        if (!selectedFile) { showError('Please select a file to share.'); return; }
        await uploadFile(selectedFile);
    }
}

async function uploadText(text) {
    setLoading(true);
    try {
        const res = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'text', text })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload failed');
        showCodeResult(data.code, data.expiresAt);
    } catch (err) {
        showError(err.message);
    } finally {
        setLoading(false);
    }
}

async function uploadFile(file) {
    setLoading(true);
    showProgress();

    try {
        const formData = new FormData();
        formData.append('type', 'file');
        formData.append('file', file);

        // Fake progress animation while uploading
        animateProgress();

        const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload failed');

        setProgress(100);
        setTimeout(() => hideProgress(), 400);
        showCodeResult(data.code, data.expiresAt);
    } catch (err) {
        hideProgress();
        showError(err.message);
    } finally {
        setLoading(false);
    }
}

// ── Code Result ──────────────────────────────────────────────────────
function showCodeResult(code, expiresAt) {
    generatedCode = code;
    document.getElementById('code-display').textContent = code;

    if (expiresAt) {
        const diff = new Date(expiresAt) - Date.now();
        const hours = Math.floor(diff / 3600000);
        const mins = Math.floor((diff % 3600000) / 60000);
        document.getElementById('expiry-time').textContent =
            hours > 0 ? `${hours}h ${mins}m` : `${mins} minutes`;
    }

    // Set retrieve link with code pre-filled
    document.getElementById('retrieve-link').href = `/retrieve?code=${code}`;

    document.getElementById('code-result').classList.add('show');
}

function hideCodeResult() {
    document.getElementById('code-result').classList.remove('show');
}

// ── Copy ─────────────────────────────────────────────────────────────
function copyCode() {
    if (!generatedCode) return;
    navigator.clipboard.writeText(generatedCode).then(() => showToast('✅ Code copied!'));
}

// ── Delete ────────────────────────────────────────────────────────────
async function deleteCurrentDrop() {
    if (!generatedCode) return;
    if (!confirm('Are you sure you want to delete this data? This cannot be undone.')) return;

    const btn = document.getElementById('delete-btn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Deleting...';

    try {
        const res = await fetch(`/api/delete/${generatedCode}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Deletion failed');

        showToast('🗑️ Data deleted successfully!');
        hideCodeResult();
        if (currentTab === 'text') textInput.value = '';
        else clearFile();
    } catch (err) {
        showError(err.message);
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// ── Helpers ──────────────────────────────────────────────────────────
function setLoading(on) {
    const btn = document.getElementById('upload-btn');
    const text = document.getElementById('upload-btn-text');
    btn.disabled = on;
    text.innerHTML = on
        ? '<span class="spinner"></span> Uploading…'
        : 'Generate Access Code';
}

function showError(msg) {
    const el = document.getElementById('upload-error');
    el.innerHTML = `⚠️ ${msg}`;
    el.classList.remove('hidden');
}
function clearError() {
    document.getElementById('upload-error').classList.add('hidden');
}

function showProgress() {
    document.getElementById('progress-bar').style.display = 'block';
    setProgress(0);
}
function hideProgress() {
    document.getElementById('progress-bar').style.display = 'none';
}
function setProgress(pct) {
    document.getElementById('progress-fill').style.width = pct + '%';
}

let _progressInterval;
function animateProgress() {
    let p = 0;
    _progressInterval = setInterval(() => {
        p = Math.min(p + Math.random() * 12, 90);
        setProgress(p);
        if (p >= 90) clearInterval(_progressInterval);
    }, 200);
}

function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
}

function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 ** 2) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 ** 3) return (bytes / 1024 ** 2).toFixed(1) + ' MB';
    return (bytes / 1024 ** 3).toFixed(1) + ' GB';
}

function getFileEmoji(name, mime) {
    if (mime.startsWith('image/')) return '🖼️';
    if (mime.startsWith('video/')) return '🎬';
    if (mime.startsWith('audio/')) return '🎵';
    if (mime.includes('pdf')) return '📕';
    if (mime.includes('zip') || mime.includes('rar') || mime.includes('7z')) return '🗜️';
    if (mime.includes('spreadsheet') || name.match(/\.(xlsx?|csv)$/i)) return '📊';
    if (mime.includes('word') || name.match(/\.docx?$/i)) return '📝';
    if (mime.includes('presentation') || name.match(/\.(pptx?)$/i)) return '📋';
    if (mime.includes('text') || name.match(/\.(txt|md|json|xml|html|css|js)$/i)) return '📃';
    return '📄';
}
