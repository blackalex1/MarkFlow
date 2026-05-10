import { ui } from '../../ui.js';
import { toast } from '../../toasts.js';
import { t } from '../../i18n.js';
import { API } from '../../api.js';
import { loadRepositories } from './list.js';
import { tempKeyPair, showKeyDrawer, createKeyPair, resetTempKeyPair } from './ssh.js';
import { convertToSsh } from './utils.js';

/**
 * Initializes listeners for the repository editor form
 */
export function initRepos() {
    if (ui.repoSyncStrategy) {
        ui.repoSyncStrategy.onchange = () => {
            const val = ui.repoSyncStrategy.value;
            if (ui.strategyDescription && ui.strategyInfoBox) {
                ui.strategyDescription.textContent = t(`strategy_help_${val}`) || '';
                
                const isForce = val === 'force';
                // Dynamic styling for danger
                ui.strategyInfoBox.style.background = isForce ? 'rgba(239, 68, 68, 0.05)' : 'rgba(99, 102, 241, 0.05)';
                ui.strategyInfoBox.style.borderColor = isForce ? 'rgba(239, 68, 68, 0.1)' : 'rgba(99, 102, 241, 0.1)';
                
                const icon = ui.strategyInfoBox.querySelector('i');
                if (icon) {
                    icon.style.color = isForce ? '#ef4444' : 'var(--primary-color)';
                    icon.setAttribute('data-lucide', isForce ? 'alert-triangle' : 'info');
                    if (window.lucide) lucide.createIcons();
                }
            }
        };
    }

    // Initialize toggle listener for auto-sync
    if (ui.repoAutoSyncToggle && !ui.repoAutoSyncToggle.dataset.init) {
        ui.repoAutoSyncToggle.onchange = () => {
            if (ui.repoAutoSyncToggle.checked) {
                if (ui.repoIntervalContainer) ui.repoIntervalContainer.classList.remove('hidden');
            } else {
                if (ui.repoIntervalContainer) ui.repoIntervalContainer.classList.add('hidden');
            }
        };
        ui.repoAutoSyncToggle.dataset.init = 'true';
    }

    // Global Key Hint
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

    // URL slug auto-generation
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

    // Fetch Branches
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
                    ui.repoBranchSelect.innerHTML = '';
                    data.branches.forEach(b => {
                        const option = document.createElement('option');
                        option.value = b;
                        option.textContent = b;
                        ui.repoBranchSelect.appendChild(option);
                    });
                    toast.success('Branches loaded');
                } else {
                    toast.error(data.detail || 'Failed to fetch branches');
                }
            } finally {
                ui.btnRepoFetchBranches.disabled = false;
            }
        };
    }

    // Use Global SSH toggle
    if (ui.repoUseGlobalSSH) {
        ui.repoUseGlobalSSH.onchange = () => {
            const isGlobal = ui.repoUseGlobalSSH.checked;
            if (ui.repoUniqueKeyBox) ui.repoUniqueKeyBox.classList.toggle('hidden', isGlobal);
            if (ui.btnViewGlobalKeyHint) ui.btnViewGlobalKeyHint.classList.toggle('hidden', !isGlobal);
            if (isGlobal && ui.repoManualKeyInput) ui.repoManualKeyInput.classList.add('hidden');
        };
    }

    // Manual Key input toggle
    if (ui.btnRepoManualKey) {
        ui.btnRepoManualKey.onclick = () => {
            if (ui.repoManualKeyInput) ui.repoManualKeyInput.classList.toggle('hidden');
            if (ui.repoUniqueKeyDisplay) ui.repoUniqueKeyDisplay.classList.add('hidden');
            ui.btnRepoGenUniqueKey.classList.remove('hidden');
            ui.repoManualPrivateKey.value = '';
            ui.repoManualPublicKey.value = '';
        };
    }

    // Generate Unique Key
    if (ui.btnRepoGenUniqueKey) {
        ui.btnRepoGenUniqueKey.onclick = createKeyPair;
    }

    // Copy generated key
    if (ui.btnCopyGeneratedKey) {
        ui.btnCopyGeneratedKey.onclick = () => {
            if (tempKeyPair.public) {
                navigator.clipboard.writeText(tempKeyPair.public);
                toast.success('Public key copied!');
            }
        };
    }

    // Add New Repo button
    if (ui.btnAddRepo) {
        ui.btnAddRepo.onclick = () => {
            ui.repoEditorForm.classList.remove('hidden');
            ui.repoEditorForm.scrollIntoView({ behavior: 'smooth' });
            document.getElementById('repo-editor-title').innerText = t('repo_add_title', 'Add New Repository');
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
            resetTempKeyPair();
            
            if (window.i18n && window.i18n.updatePage) window.i18n.updatePage();
        };
    }

    // Cancel editing
    if (ui.btnCancelRepo) {
        ui.btnCancelRepo.onclick = () => {
            ui.repoEditorForm.classList.add('hidden');
            if (ui.repoUniqueKeyDisplay) ui.repoUniqueKeyDisplay.classList.add('hidden');
            ui.btnRepoGenUniqueKey.classList.remove('hidden');
        };
    }

    // Save Repository
    if (ui.btnSaveRepo) {
        ui.btnSaveRepo.onclick = saveRepo;
    }
}

/**
 * Opens the editor for an existing repository
 */
export async function editRepo(id) {
    try {
        const res = await fetch('/api/git/repos');
        if (!res.ok) return;
        const repos = await res.json();
        if (!Array.isArray(repos)) return;
        const repo = repos.find(r => r.id == id);
        
        if (repo) {
            ui.repoEditorForm.classList.remove('hidden');
            ui.repoEditorForm.scrollIntoView({ behavior: 'smooth' });
            document.getElementById('repo-editor-title').innerText = t('repo_edit_title', 'Edit Repository');
            ui.repoName.value = repo.name;
            ui.repoUrl.value = repo.url;
            ui.repoSlug.value = repo.slug;
            ui.repoSlugDisplay.innerText = repo.slug;
            ui.repoName.dataset.id = repo.id;
            
            const hasUnique = repo.ssh_public_key && repo.ssh_public_key.length > 0;
            ui.repoUseGlobalSSH.checked = !hasUnique;
            
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
            
            if (ui.repoBranchSelect) {
                ui.repoBranchSelect.innerHTML = '';
                const option = document.createElement('option');
                option.value = repo.branch;
                option.textContent = repo.branch;
                option.selected = true;
                ui.repoBranchSelect.appendChild(option);
            }
            
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
            
            if (window.i18n && window.i18n.updatePage) window.i18n.updatePage();
        }
    } catch (err) {
        console.error('Error opening repo editor:', err);
    }
}

/**
 * Saves the repository configuration
 */
async function saveRepo() {
    const id = ui.repoName.dataset.id;
    const data = {
        name: ui.repoName.value.trim(),
        slug: ui.repoSlug.value.trim(),
        url: ui.repoUrl.value.trim(),
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
    
    // Safety check for Force strategy
    if (data.sync_strategy === 'force') {
        const confirmed = await window.confirmAction(
            t('confirm_force_strategy_title'),
            t('confirm_force_strategy_msg'),
            t('btn_save'),
            t('btn_cancel')
        );
        if (!confirmed) return;
    }

    const method = id ? 'PUT' : 'POST';
    const url = id ? API.GIT_REPO_BY_ID(id) : API.GIT_REPOS;
    
    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (res.ok) {
            toast.success(id ? (t('toast_repo_updated', 'Repository updated')) : (t('toast_repo_added', 'Repository added')));
            ui.repoEditorForm.classList.add('hidden');
            
            const repoListContainer = document.getElementById('git-repos-list-container');
            if (repoListContainer) repoListContainer.classList.remove('hidden');
            
            if (ui.repoUniqueKeyDisplay) ui.repoUniqueKeyDisplay.classList.add('hidden');
            ui.btnRepoGenUniqueKey.classList.remove('hidden');
            
            loadRepositories();
            resetTempKeyPair();
        } else {
            const err = await res.json();
            toast.error(err.detail || 'Failed to save repository');
        }
    } catch (err) {
        toast.error('Network error while saving repository');
    }
}
