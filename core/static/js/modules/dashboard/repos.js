import { ui } from '../ui.js';
import { toast } from '../toasts.js';
import { loadSyncConfig } from './sync.js';
import { API } from '../api.js';
import { escapeHTML } from '../security.js';

export async function loadRepositories() {
    if (!ui.gitReposTbody) return;
    const res = await fetch('/api/git/repos');
    if (!res.ok) return;
    const repos = await res.json();
    if (!Array.isArray(repos)) return;
    
    ui.gitReposTbody.innerHTML = '';
    const i18n = window.i18n || {};
    const t = (key, fallback) => (i18n.t ? i18n.t(key) : fallback);

    // Initialize toggle listener only once
    if (ui.repoAutoSyncToggle && !ui.repoAutoSyncToggle.dataset.init) {
        ui.repoAutoSyncToggle.onchange = () => {
            if (ui.repoAutoSyncToggle.checked) {
                ui.repoIntervalContainer.classList.remove('hidden');
            } else {
                ui.repoIntervalContainer.classList.add('hidden');
            }
        };
        ui.repoAutoSyncToggle.dataset.init = 'true';
    }

        repos.forEach(repo => {
            const row = document.createElement('tr');
            
            // Format status and time
            let syncInfo = `<span style="color: var(--text-muted); font-size: 11px;">${t('sync_never', 'Never synced')}</span>`;
            if (repo.last_sync_at) {
                const date = new Date(repo.last_sync_at);
                const timeStr = date.toLocaleString();
                const isSuccess = repo.last_sync_status === 'success';
                const color = isSuccess ? '#22c55e' : '#ef4444';
                const icon = isSuccess ? 'check-circle' : 'x-circle';
                
                syncInfo = `
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                        <div style="display: flex; align-items: center; gap: 4px; color: ${color}; font-size: 12px; font-weight: 600;">
                            <i data-lucide="${icon}" style="width: 14px; height: 14px;"></i>
                            <span>${isSuccess ? (t('sync_success', 'Успешно')) : (t('sync_failed', 'Ошибка'))}</span>
                        </div>
                        <span style="color: var(--text-muted); font-size: 10px;">${timeStr}</span>
                    </div>
                `;
            }

            const safeRepoName = escapeHTML(repo.name);
            const safeRepoUrl = escapeHTML(repo.url);
            row.innerHTML = `
                <td style="padding: 12px 10px;">
                    <div style="display: flex; flex-direction: column;">
                        <span style="font-weight: 500; font-size: 14px;">${safeRepoName}</span>
                        <span style="font-size: 11px; color: var(--text-muted); opacity: 0.8; margin-top: 2px;">${safeRepoUrl}</span>
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
    const i18n = window.i18n || {};
    const t = (key, fallback) => (i18n.t ? i18n.t(key) : fallback);

    if (ui.repoSyncStrategy) {
        ui.repoSyncStrategy.onchange = () => {
            const val = ui.repoSyncStrategy.value;
            if (ui.strategyDescription) {
                ui.strategyDescription.textContent = t(`strategy_help_${val}`) || '';
            }
        };
    }

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

        if (keyText) keyText.innerText = key || '';
        if (titleEl) titleEl.innerText = title || 'SSH Public Key';
        if (descEl) descEl.innerText = desc || '';
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
                showKeyDrawer(data.pubkey, t('git_global_key_title', 'Global SSH Public Key'), t('git_global_key_desc', 'This is your common key for all repositories.'));
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
                    ui.btnViewCurrentUniqueKey.onclick = () => showKeyDrawer(repo.ssh_public_key, t('repo_view_key_title', 'Current Unique Key'), '');
                }
                if (ui.btnTriggerRegenKey) {
                    ui.btnTriggerRegenKey.onclick = async () => {
                        const confirmed = await window.confirmAction(
                            t('repo_confirm_regen_title', 'Regenerate SSH Key'),
                            t('repo_confirm_regen_msg', 'WARNING: This will replace the current SSH key. You will need to update it on GitHub. Continue?'),
                            t('btn_confirm_gen', 'Regenerate'),
                            t('btn_cancel', 'Cancel')
                        );
                        if (confirmed) createKeyPair();
                    };
                }
            } else {
                if (ui.repoCurrentKeyStatus) ui.repoCurrentKeyStatus.classList.add('hidden');
                if (ui.repoKeyGenArea) ui.repoKeyGenArea.classList.remove('hidden');
            }

            ui.btnRepoGenUniqueKey.innerText = t('git_repo_gen_unique', 'Generate Unique Key');
            ui.btnRepoGenUniqueKey.disabled = false;
            if (ui.repoUniqueKeyDisplay) ui.repoUniqueKeyDisplay.classList.add('hidden');
            if (ui.repoManualKeyInput) ui.repoManualKeyInput.classList.add('hidden');
            ui.btnRepoGenUniqueKey.classList.remove('hidden');
            if (ui.btnRepoManualKey) ui.btnRepoManualKey.classList.remove('hidden');
            
            const safeBranch = escapeHTML(repo.branch);
            ui.repoBranchSelect.innerHTML = `<option value="${safeBranch}" selected>${safeBranch}</option>`;
            if (ui.repoAutoSyncInterval) {
                const totalMinutes = repo.auto_sync_interval || 0;
                if (totalMinutes >= 1440 && totalMinutes % 1440 === 0) {
                    ui.repoAutoSyncInterval.value = totalMinutes / 1440;
                    ui.repoAutoSyncUnit.value = "1440";
                } else if (totalMinutes >= 60 && totalMinutes % 60 === 0) {
                    ui.repoAutoSyncInterval.value = totalMinutes / 60;
                    ui.repoAutoSyncUnit.value = "60";
                } else {
                    ui.repoAutoSyncInterval.value = totalMinutes || 30;
                    ui.repoAutoSyncUnit.value = "1";
                }
            }
            if (ui.repoAutoSyncToggle) {
                ui.repoAutoSyncToggle.checked = (repo.auto_sync_interval > 0);
                if (ui.repoAutoSyncToggle.checked) ui.repoIntervalContainer.classList.remove('hidden');
                else ui.repoIntervalContainer.classList.add('hidden');
            }
            if (ui.repoSyncStrategy) {
                ui.repoSyncStrategy.value = repo.sync_strategy || 'rebase';
                ui.repoSyncStrategy.onchange();
            }
            if (ui.repoFlattenToggle) ui.repoFlattenToggle.checked = !!repo.flatten_in_tree;
            tempKeyPair = { keyId: null, public: null };
            
            // Force translation update for newly shown fields
            if (window.i18n && window.i18n.updatePage) window.i18n.updatePage();
            else if (typeof updatePage === 'function') updatePage();
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
        const confirmed = await window.confirmAction(
            t('confirm_delete_repo_title', 'Delete Repository'),
            t('confirm_delete_repo', 'Are you sure you want to delete this repository configuration?'),
            t('btn_confirm_delete', 'Delete'),
            t('btn_cancel', 'Cancel')
        );
        if (!confirmed) return;
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
                    ui.repoBranchSelect.innerHTML = data.branches.map(b => {
                        const safeBranch = escapeHTML(b);
                        return `<option value="${safeBranch}">${safeBranch}</option>`;
                    }).join('');
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
            // Hide manual input if switching back to global
            if (isGlobal && ui.repoManualKeyInput) ui.repoManualKeyInput.classList.add('hidden');
        };
    }

    // Universal Hint Triggers (CSP Friendly)
    document.querySelectorAll('.hint-trigger').forEach(trigger => {
        trigger.onclick = () => {
            const hintId = trigger.dataset.hint;
            const hintEl = document.getElementById(hintId);
            if (hintEl) hintEl.classList.toggle('hidden');
        };
    });

    if (ui.btnRepoManualKey) {
        ui.btnRepoManualKey.onclick = () => {
            if (ui.repoManualKeyInput) ui.repoManualKeyInput.classList.toggle('hidden');
            if (ui.repoUniqueKeyDisplay) ui.repoUniqueKeyDisplay.classList.add('hidden');
            ui.btnRepoGenUniqueKey.classList.remove('hidden');
            ui.repoManualPrivateKey.value = '';
            ui.repoManualPublicKey.value = '';
        };
    }

    if (ui.btnRepoGenUniqueKey) {
        ui.btnRepoGenUniqueKey.onclick = async () => {
            ui.btnRepoGenUniqueKey.disabled = true;
            ui.btnRepoGenUniqueKey.innerText = t('btn_generating', 'Generating...');
            try {
                const res = await fetch(API.GIT_GEN_KEY_PAIR);
                const pair = await res.json();
                tempKeyPair = { keyId: pair.key_id, public: pair.public_key };
                
                if (ui.repoGeneratedPubkey) ui.repoGeneratedPubkey.innerText = pair.public_key;
                if (ui.repoUniqueKeyDisplay) ui.repoUniqueKeyDisplay.classList.remove('hidden');
                if (ui.repoManualKeyInput) ui.repoManualKeyInput.classList.add('hidden');
                ui.btnRepoGenUniqueKey.classList.add('hidden');
                if (ui.btnRepoManualKey) ui.btnRepoManualKey.classList.add('hidden');
                
                if (ui.repoUrl) {
                    const currentUrl = ui.repoUrl.value.trim();
                    const sshUrl = convertToSsh(currentUrl);
                    if (sshUrl !== currentUrl) {
                        ui.repoUrl.value = sshUrl;
                        toast.info('URL converted to SSH format');
                    }
                }

                showKeyDrawer(pair.public_key, t('git_unique_key_title', 'Unique Key Generated'), t('git_unique_key_desc', 'Copy this unique key to your Git provider settings.'));
                toast.success('Unique key pair generated.');
            } catch (e) {
                toast.error('Failed to generate key pair');
                ui.btnRepoGenUniqueKey.innerText = t('git_repo_gen_unique', 'Generate Unique Key');
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
            ui.btnRepoGenUniqueKey.innerText = t('git_repo_gen_unique', 'Generate Unique Key');
            ui.repoBranchSelect.innerHTML = '<option value="master">master</option><option value="main">main</option>';
            if (ui.repoAutoSyncInterval) ui.repoAutoSyncInterval.value = 30;
            if (ui.repoAutoSyncUnit) ui.repoAutoSyncUnit.value = "1";
            if (ui.repoAutoSyncToggle) {
                ui.repoAutoSyncToggle.checked = false;
                ui.repoIntervalContainer.classList.add('hidden');
            }
            if (ui.repoSyncStrategy) {
                ui.repoSyncStrategy.value = 'rebase';
                ui.repoSyncStrategy.onchange();
            }
            if (ui.repoFlattenToggle) ui.repoFlattenToggle.checked = false;
            ui.repoName.dataset.id = '';
            tempKeyPair = { keyId: null, public: null };
            
            if (window.i18n && window.i18n.updatePage) window.i18n.updatePage();
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
                branch: ui.repoBranchSelect.value,
                key_id: ui.repoUseGlobalSSH.checked ? null : tempKeyPair.keyId,
                public_key: ui.repoUseGlobalSSH.checked ? 
                    null : (tempKeyPair.public || ui.repoManualPublicKey.value.trim()),
                private_key: ui.repoUseGlobalSSH.checked ?
                    null : ui.repoManualPrivateKey.value.trim(),
                auto_sync_interval: ui.repoAutoSyncToggle.checked ? 
                    ((parseInt(ui.repoAutoSyncInterval.value) || 30) * parseInt(ui.repoAutoSyncUnit.value)) : 0,
                sync_strategy: ui.repoSyncStrategy.value,
                flatten_in_tree: ui.repoFlattenToggle ? ui.repoFlattenToggle.checked : false
            };
            if (!data.name || !data.slug || !data.url) return toast.warn('Fill Name, Slug and URL');
            const method = id ? 'PUT' : 'POST';
            const url = id ? API.GIT_REPO_BY_ID(id) : API.GIT_REPOS;
            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (res.ok) {
                toast.success(id ? (t('toast_repo_updated', 'Repository updated')) : (t('toast_repo_added', 'Repository added')));
                
                // Hide editor and return to list
                ui.repoEditorForm.classList.add('hidden');
                const repoListContainer = document.getElementById('git-repos-list-container');
                if (repoListContainer) repoListContainer.classList.remove('hidden');
                
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
