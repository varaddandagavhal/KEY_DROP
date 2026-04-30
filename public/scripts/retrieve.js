/* ─────────────────────────────────────────────────────────────────
   retrieve.js — KeyDrop retrieve page logic
   ───────────────────────────────────────────────────────────────── */

let currentCode = null;
let currentResult = null;

// ── OTP Input Wiring ─────────────────────────────────────────────────
const otpBoxes = Array.from({ length: 6 }, (_, i) => document.getElementById(`otp-${i}`));

otpBoxes.forEach((box, idx) => {
    box.addEventListener('keydown', e => {
        if (e.key === 'Backspace') {
            if (!box.value && idx > 0) {
                otpBoxes[idx - 1].focus();
                otpBoxes[idx - 1].value = '';
                otpBoxes[idx - 1].classList.remove('filled');
            }
            return;
        }
        if (e.key === 'ArrowLeft' && idx > 0) { e.preventDefault(); otpBoxes[idx - 1].focus(); return; }
        if (e.key === 'ArrowRight' && idx < 5) { e.preventDefault(); otpBoxes[idx + 1].focus(); return; }
        if (e.key === 'Enter') { retrieveContent(); return; }
    });

    box.addEventListener('input', e => {
        const val = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        box.value = val ? val[val.length - 1] : '';
        box.classList.toggle('filled', !!box.value);
        if (box.value && idx < 5) otpBoxes[idx + 1].focus();
        clearError();
    });

    box.addEventListener('paste', e => {
        e.preventDefault();
        const pasted = (e.clipboardData || window.clipboardData)
            .getData('text')
            .replace(/[^a-zA-Z0-9]/g, '')
            .toUpperCase()
            .slice(0, 6);
        pasted.split('').forEach((ch, i) => {
            if (otpBoxes[i]) {
                otpBoxes[i].value = ch;
                otpBoxes[i].classList.add('filled');
            }
        });
        const next = Math.min(pasted.length, 5);
        otpBoxes[next].focus();
    });
});

// Auto-fill from URL ?code=XXXXXX
window.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
        const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
        clean.split('').forEach((ch, i) => {
            if (otpBoxes[i]) {
                otpBoxes[i].value = ch;
                otpBoxes[i].classList.add('filled');
            }
        });
        if (clean.length === 6) retrieveContent();
    }
    otpBoxes[0].focus();
});

// ── Retrieve ──────────────────────────────────────────────────────────
async function retrieveContent() {
    const code = otpBoxes.map(b => b.value).join('').toUpperCase();

    if (code.length < 6) {
        showError('Please enter all 6 characters of your access code.');
        return;
    }

    clearError();
    hideResult();
    setLoading(true);

    try {
        const res = await fetch(`/api/retrieve/${code}`);
        const data = await res.json();

        if (res.status === 404) throw new Error('Content not found. The code may be incorrect.');
        if (res.status === 410) throw new Error('This content has expired and been deleted.');
        if (!res.ok) throw new Error(data.error || 'Failed to retrieve content.');

        currentCode = code;
        currentResult = data;
        showResult(data);

    } catch (err) {
        showError(err.message);
    } finally {
        setLoading(false);
    }
}

// ── Show Result ───────────────────────────────────────────────────────
function showResult(data) {
    const panel = document.getElementById('result-panel');

    // Expiry info
    const expiresAt = new Date(data.expiresAt);
    const diff = expiresAt - Date.now();
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const expiryStr = hours > 0 ? `Expires in ${hours}h ${mins}m` : `Expires in ${mins} minutes`;
    document.getElementById('expiry-info').textContent = `⏳ ${expiryStr}`;

    if (data.type === 'text') {
        // Badge
        document.getElementById('type-badge').className = 'result-type-badge badge-text';
        document.getElementById('type-badge').textContent = '📝 Text Content';

        // Text content
        document.getElementById('text-content').textContent = data.text;
        document.getElementById('text-result').classList.remove('hidden');
        document.getElementById('file-result').classList.add('hidden');

    } else if (data.type === 'file') {
        // Badge
        document.getElementById('type-badge').className = 'result-type-badge badge-file';
        document.getElementById('type-badge').textContent = '📁 File';

        // File info
        document.getElementById('result-file-icon').textContent = getFileEmoji(data.filename, data.mimetype || '');
        document.getElementById('result-filename').textContent = data.filename;
        document.getElementById('result-filesize').textContent = formatBytes(data.filesize);
        document.getElementById('result-mimetype').textContent = data.mimetype || 'Unknown type';

        document.getElementById('text-result').classList.add('hidden');
        document.getElementById('file-result').classList.remove('hidden');
    }

    panel.classList.add('show');
}

function hideResult() {
    document.getElementById('result-panel').classList.remove('show');
}

// ── Download File ─────────────────────────────────────────────────────
function downloadFile() {
    if (!currentCode) return;
    const link = document.createElement('a');
    link.href = `/api/download/${currentCode}`;
    link.download = currentResult?.filename || 'download';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Animate button
    const btn = document.getElementById('download-btn');
    btn.textContent = '✅ Downloading…';
    btn.disabled = true;
    setTimeout(() => {
        btn.innerHTML = '⬇️ Download File';
        btn.disabled = false;
    }, 3000);
}

// ── Copy Text ─────────────────────────────────────────────────────────
function copyResultText() {
    const text = document.getElementById('text-content').textContent;
    navigator.clipboard.writeText(text).then(() => showToast('✅ Text copied!'));
}

// ── Download Text ─────────────────────────────────────────────────────
function downloadText() {
    const text = document.getElementById('text-content').textContent;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `keydrop-${currentCode}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// ── Delete Data ───────────────────────────────────────────────────────
async function deleteCurrentData() {
    if (!currentCode) return;
    if (!confirm('Are you sure you want to delete this content forever?')) return;

    const btn = document.getElementById('delete-data-btn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Deleting...';

    try {
        const res = await fetch(`/api/delete/${currentCode}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Deletion failed');

        showToast('🗑️ Data deleted permanently!');
        resetRetrieve();
    } catch (err) {
        showError(err.message);
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// ── Reset ─────────────────────────────────────────────────────────────
function resetRetrieve() {
    otpBoxes.forEach(b => { b.value = ''; b.classList.remove('filled'); });
    hideResult();
    clearError();
    currentCode = null;
    currentResult = null;
    otpBoxes[0].focus();
    // Clear URL param
    history.replaceState({}, '', '/retrieve');
}

// ── Helpers ───────────────────────────────────────────────────────────
function setLoading(on) {
    const btn = document.getElementById('retrieve-btn');
    const text = document.getElementById('retrieve-btn-text');
    btn.disabled = on;
    text.innerHTML = on
        ? '<span class="spinner"></span> Retrieving…'
        : 'Retrieve Content';
}

function showError(msg) {
    const el = document.getElementById('retrieve-error');
    el.innerHTML = `⚠️ ${msg}`;
    el.classList.remove('hidden');
}
function clearError() {
    document.getElementById('retrieve-error').classList.add('hidden');
}

function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
}

function formatBytes(bytes) {
    if (!bytes) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 ** 2) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 ** 3) return (bytes / 1024 ** 2).toFixed(1) + ' MB';
    return (bytes / 1024 ** 3).toFixed(1) + ' GB';
}

function getFileEmoji(name = '', mime = '') {
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
