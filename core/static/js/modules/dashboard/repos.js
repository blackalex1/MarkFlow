import { ui } from '../ui.js';
import { toast } from '../toasts.js';
import { loadSyncConfig } from './sync.js';

export async function loadRepositories() {
    if (!ui.gitReposTbody) return;
    const res = await fetch('/api/git/repos');
    if (!res.ok) return;
    const repos = await res.json();
    if (!Array.isArray(repos)) return;
    
    ui.gitReposTbody.innerHTML = '';
        // Import i18n if not available (should be in the file but let's check)
        const i18n = window.i18n || {};
        const t = (key, fallback) => (i18n.t ? i18n.t(key) : fallback);

        repos.forEach(repo => {
            const row = document.createElement('tr');
            
            // Format status and time
            let syncInfo = `<span style="color: var(--text-muted); font-size: 11px;">${t('sync_never', 'Never synced')}</span>`;
            if (repo.last_sync_at) {
                const date = new Date(repo.last_sync_at);
                const timeStr = date.toLocaleString();
                const isSuccess = repo.last_sync_status === 'success';
                const color = isSuccess ? 'var(--success-color)' : 'var(--danger-color)';
                const icon = isSuccess ? 'check-circle' : 'x-circle';
                
                syncInfo = `
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                        <div style="display: flex; align-items: center; gap: 4px; color: ${color}; font-size: 12px; font-weight: 500;">
                            <i data-lucide="${icon}" style="width: 14px; height: 14px;"></i>
                            <span>${isSuccess ? (t('sync_success', 'Success')) : (t('sync_failed', 'Failed'))}</span>
                        </div>
                        <span style="color: var(--text-muted); font-size: 10px;">${timeStr}</span>
                    </div>
                `;
            }

            row.innerHTML = `
                <td style="padding: 12px 10px;">
                    <div style="display: flex; flex-direction: column;">
                        <span style="font-weight: 500; font-size: 14px;">${repo.name}</span>
                        <span style="font-size: 11px; color: var(--text-muted); opacity: 0.8; margin-top: 2px;">${repo.url}</span>
                    </div>
                </td>
                <td style="padding: 12px 10px;">${syncInfo}</td>
                <td style="padding: 12px 10px; text-align: right;">
                    <div style="display: flex; gap: 8px; justify-content: flex-end; align-items: center;">
                        ${repo.is_active ? 
                            `<span class="tag tag-on" style="font-size: 11px; padding: 4px 10px;">${t('repo_btn_active', 'Active')}</span>` : 
                            `<button class="btn btn-sm btn-outline" style="padding: 4px 12px;" onclick="window.activateRepo(${repo.id})">${t('repo_btn_activate', 'Activate')}</button>`
                        }
                        <button class="btn btn-sm btn-text" style="padding: 4px 8px;" onclick="window.editRepo(${repo.id})">${t('repo_btn_edit', 'Edit')}</button>
                        <button class="btn btn-sm btn-text btn-danger" style="padding: 4px 8px;" onclick="window.deleteRepo(${repo.id})">${t('repo_btn_delete', 'Delete')}</button>
                    </div>
                </td>
            `;
            ui.gitReposTbody.appendChild(row);
        });
    if (window.lucide) window.lucide.createIcons();
}

let tempKeyPair = { keyId: null, public: null };

export function initRepos() {
    const convertToSsh = (url) => {
        if (!url || !url.startsWith('http')) return url;
        try {
            // https://github.com/user/repo -> git@github.com:user/repo.git
            let clean = url.replace('https://', '').replace('http://', '');
            let parts = clean.split('/');
            if (parts.length >= 2) {
                let domain = parts[0];
                let rest = parts.slice(1).join('/');
                return `git@${domain}:${rest}${rest.endsWith('.git') ? '' : '.git'}`;
            }
            return url;
        } catch (e) { return url; }
    };

    const showKeyDrawer = (key, title, desc) => {
        let modal = ui.modalViewKey || document.getElementById('modal-view-key');
        if (!modal) {
            console.error('Modal View Key element not found!');
            alert(`Key Generated:\n\n${key}`);
            return;
        }
        const keyText = document.getElementById('ssh-key-text');
        const titleEl = document.getElementById('view-key-title');
        const descEl = document.getElementById('view-key-desc');
        const closeBtn = document.getElementById('close-view-key');
        const copyBtn = document.getElementById('btn-copy-ssh-key');

        if (keyText) keyText.innerText = key;
        if (titleEl) titleEl.innerText = title || 'SSH Public Key';
        if (descEl) descEl.innerText = desc;
        modal.classList.remove('hidden');
        if (closeBtn) closeBtn.onclick = () => modal.classList.add('hidden');
        if (copyBtn) {
            copyBtn.onclick = () => {
                navigator.clipboard.writeText(key);
                toast.success('Key copied to clipboard!');
            };
        }
    };

    window.viewRepoKey = async (id) => {
        const res = await fetch(`/api/git/repos/${id}/pubkey`);
        const data = await res.json();
        if (data.pubkey) {
            showKeyDrawer(data.pubkey, `Public Key (${data.type})`, `Copy this ${data.type} key to your Git provider settings.`);
        } else {
            toast.error('No key found');
        }
    };

    if (ui.btnViewGlobalKeyHint) {
        ui.btnViewGlobalKeyHint.onclick = async () => {
            const res = await fetch('/api/git/pubkey');
            const data = await res.json();
            if (data.pubkey) {
                showKeyDrawer(data.pubkey, 'Global SSH Public Key', 'This is your common key for all repositories.');
            } else {
                toast.warn('Global key is not configured');
            }
        };
    }

    window.editRepo = async (id) => {
        const res = await fetch('/api/git/repos');
        if (!res.ok) return;
        const repos = await res.json();
        if (!Array.isArray(repos)) return;
        const repo = repos.find(r => r.id == id);
        if (repo) {
            ui.repoEditorForm.classList.remove('hidden');
            ui.repoEditorForm.scrollIntoView({ behavior: 'smooth' });
            document.getElementById('repo-editor-title').innerText = 'Edit Repository';
            ui.repoName.value = repo.name;
            ui.repoUrl.value = repo.url;
            ui.repoSlug.value = repo.slug;
            ui.repoSlugDisplay.innerText = repo.slug;
            ui.repoName.dataset.id = repo.id;
            
            const hasUnique = repo.ssh_public_key && repo.ssh_public_key.length > 0;
            ui.repoUseGlobalSSH.checked = !hasUnique;
            
            // Hide selection checkbox if unique key is configured
            if (ui.repoKeyTypeSelection) ui.repoKeyTypeSelection.classList.toggle('hidden', hasUnique);
            if (ui.repoUniqueKeyBox) ui.repoUniqueKeyBox.classList.toggle('hidden', !hasUnique);
            if (ui.btnViewGlobalKeyHint) ui.btnViewGlobalKeyHint.classList.toggle('hidden', hasUnique);
            
            if (hasUnique) {
                if (ui.repoCurrentKeyStatus) ui.repoCurrentKeyStatus.classList.remove('hidden');
                if (ui.repoKeyGenArea) ui.repoKeyGenArea.classList.add('hidden');
                
                if (ui.btnViewCurrentUniqueKey) {
                    ui.btnViewCurrentUniqueKey.onclick = () => showKeyDrawer(repo.ssh_public_key, 'Current Unique Key');
                }
                if (ui.btnTriggerRegenKey) {
                    ui.btnTriggerRegenKey.onclick = () => {
                        ui.repoCurrentKeyStatus.classList.add('hidden');
                        ui.repoKeyGenArea.classList.remove('hidden');
                        if (ui.repoKeyTypeSelection) ui.repoKeyTypeSelection.classList.remove('hidden');
                    };
                }
            } else {
                if (ui.repoCurrentKeyStatus) ui.repoCurrentKeyStatus.classList.add('hidden');
                if (ui.repoKeyGenArea) ui.repoKeyGenArea.classList.remove('hidden');
            }

            ui.btnRepoGenUniqueKey.innerText = 'Generate Unique Key for this Repo';
            ui.btnRepoGenUniqueKey.disabled = false;
            if (ui.repoUniqueKeyDisplay) ui.repoUniqueKeyDisplay.classList.add('hidden');
            ui.btnRepoGenUniqueKey.classList.remove('hidden');
            
            ui.repoBranchSelect.innerHTML = `<option value="${repo.branch}" selected>${repo.branch}</option>`;
            tempKeyPair = { keyId: null, public: null };
        }
    };

    window.activateRepo = async (id) => {
        const res = await fetch(`/api/git/repos/${id}/activate`, { method: 'POST' });
        if (res.ok) {
            toast.success('Repository activated');
            loadRepositories();
            loadSyncConfig();
        }
    };

    window.deleteRepo = async (id) => {
        if (!confirm('Delete this repository configuration?')) return;
        const res = await fetch(`/api/git/repos/${id}`, { method: 'DELETE' });
        if (res.ok) {
            toast.success('Repository deleted');
            loadRepositories();
        }
    };

    if (ui.repoUrl) {
        ui.repoUrl.oninput = () => {
            if (!ui.repoName.dataset.id) {
                let name = ui.repoUrl.value.split('/').pop().replace('.git', '');
                if (name.includes(':')) name = name.split(':').pop();
                const hash = Math.random().toString(36).substring(2, 6);
                const slug = `${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${hash}`;
                ui.repoSlug.value = slug;
                ui.repoSlugDisplay.innerText = slug;
            }
        };
    }

    if (ui.btnRepoFetchBranches) {
        ui.btnRepoFetchBranches.onclick = async () => {
            const url = ui.repoUrl.value.trim();
            if (!url) return toast.warn('Enter URL first');
            ui.btnRepoFetchBranches.disabled = true;
            try {
                let fetchUrl = `/api/git/branches?url=${encodeURIComponent(url)}`;
                if (tempKeyPair && tempKeyPair.keyId) {
                    fetchUrl += `&key_id=${encodeURIComponent(tempKeyPair.keyId)}`;
                }
                const res = await fetch(fetchUrl);
                const data = await res.json();
                if (res.ok && data.branches) {
                    ui.repoBranchSelect.innerHTML = data.branches.map(b => `<option value="${b}">${b}</option>`).join('');
                    toast.success('Branches loaded');
                } else {
                    toast.error(data.detail || 'Failed to fetch branches');
                }
            } finally {
                ui.btnRepoFetchBranches.disabled = false;
            }
        };
    }

    if (ui.repoUseGlobalSSH) {
        ui.repoUseGlobalSSH.onchange = () => {
            const isGlobal = ui.repoUseGlobalSSH.checked;
            if (ui.repoUniqueKeyBox) ui.repoUniqueKeyBox.classList.toggle('hidden', isGlobal);
            if (ui.btnViewGlobalKeyHint) ui.btnViewGlobalKeyHint.classList.toggle('hidden', !isGlobal);
        };
    }

    if (ui.btnRepoGenUniqueKey) {
        ui.btnRepoGenUniqueKey.onclick = async () => {
            ui.btnRepoGenUniqueKey.disabled = true;
            ui.btnRepoGenUniqueKey.innerText = 'Generating...';
            try {
                const res = await fetch('/api/git/gen-key-pair');
                const pair = await res.json();
                tempKeyPair = { keyId: pair.key_id, public: pair.public_key };
                
                if (ui.repoGeneratedPubkey) ui.repoGeneratedPubkey.innerText = pair.public_key;
                if (ui.repoUniqueKeyDisplay) ui.repoUniqueKeyDisplay.classList.remove('hidden');
                ui.btnRepoGenUniqueKey.classList.add('hidden');
                
                if (ui.repoUrl) {
                    const currentUrl = ui.repoUrl.value.trim();
                    const sshUrl = convertToSsh(currentUrl);
                    if (sshUrl !== currentUrl) {
                        ui.repoUrl.value = sshUrl;
                        toast.info('URL converted to SSH format');
                    }
                }

                showKeyDrawer(pair.public_key, 'Unique Key Generated', 'Copy this unique key to your Git provider settings.');
                toast.success('Unique key pair generated.');
            } catch (e) {
                toast.error('Failed to generate key pair');
                ui.btnRepoGenUniqueKey.innerText = 'Generate Unique Key';
                ui.btnRepoGenUniqueKey.disabled = false;
            }
        };
    }

    if (ui.btnCopyGeneratedKey) {
        ui.btnCopyGeneratedKey.onclick = () => {
            if (tempKeyPair.public) {
                navigator.clipboard.writeText(tempKeyPair.public);
                toast.success('Public key copied!');
            }
        };
    }

    if (ui.btnAddRepo) {
        ui.btnAddRepo.onclick = () => {
            ui.repoEditorForm.classList.remove('hidden');
            ui.repoEditorForm.scrollIntoView({ behavior: 'smooth' });
            document.getElementById('repo-editor-title').innerText = 'Add New Repository';
            ui.repoName.value = '';
            ui.repoUrl.value = '';
            ui.repoSlug.value = '';
            ui.repoSlugDisplay.innerText = 'auto-generated';
            ui.repoUseGlobalSSH.checked = true;
            if (ui.repoKeyTypeSelection) ui.repoKeyTypeSelection.classList.remove('hidden');
            if (ui.btnViewGlobalKeyHint) ui.btnViewGlobalKeyHint.classList.remove('hidden');
            if (ui.repoUniqueKeyBox) ui.repoUniqueKeyBox.classList.add('hidden');
            if (ui.repoUniqueKeyDisplay) ui.repoUniqueKeyDisplay.classList.add('hidden');
            if (ui.repoCurrentKeyStatus) ui.repoCurrentKeyStatus.classList.add('hidden');
            if (ui.repoKeyGenArea) ui.repoKeyGenArea.classList.remove('hidden');
            ui.btnRepoGenUniqueKey.classList.remove('hidden');
            ui.btnRepoGenUniqueKey.disabled = false;
            ui.btnRepoGenUniqueKey.innerText = 'Generate Unique Key for this Repo';
            ui.repoBranchSelect.innerHTML = '<option value="master">master</option><option value="main">main</option>';
            ui.repoName.dataset.id = '';
            tempKeyPair = { keyId: null, public: null };
        };
    }

    if (ui.btnCancelRepo) {
        ui.btnCancelRepo.onclick = () => {
            ui.repoEditorForm.classList.add('hidden');
            if (ui.repoUniqueKeyDisplay) ui.repoUniqueKeyDisplay.classList.add('hidden');
            ui.btnRepoGenUniqueKey.classList.remove('hidden');
        };
    }

    if (ui.btnSaveRepo) {
        ui.btnSaveRepo.onclick = async () => {
            const id = ui.repoName.dataset.id;
            const data = {
                name: ui.repoName.value.trim(),
                slug: ui.repoSlug.value.trim(),
                url: ui.repoUrl.value.trim(),
                branch: ui.repoBranchSelect.value,
                key_id: ui.repoUseGlobalSSH.checked ? null : tempKeyPair.keyId,
                public_key: ui.repoUseGlobalSSH.checked ? null : tempKeyPair.public
            };
            if (!data.name || !data.slug || !data.url) return toast.warn('Fill Name, Slug and URL');
            const method = id ? 'PUT' : 'POST';
            const url = id ? `/api/git/repos/${id}` : '/api/git/repos';
            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (res.ok) {
                toast.success(id ? 'Repository updated' : 'Repository added');
                ui.repoEditorForm.classList.add('hidden');
                if (ui.repoUniqueKeyDisplay) ui.repoUniqueKeyDisplay.classList.add('hidden');
                ui.btnRepoGenUniqueKey.classList.remove('hidden');
                loadRepositories();
                tempKeyPair = { keyId: null, public: null };
            } else {
                const err = await res.json();
                toast.error(err.detail || 'Failed to save repository');
            }
        };
    }
}
