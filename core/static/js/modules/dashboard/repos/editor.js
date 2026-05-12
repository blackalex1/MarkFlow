import { ui } from '../../ui.js';
import { toast } from '../../toasts.js';
import { t } from '../../i18n.js';
import { API } from '../../api.js';
import { loadRepositories } from './list.js';
import { tempKeyPair, showKeyDrawer, createKeyPair, resetTempKeyPair } from './ssh.js';
import { convertToSsh } from './utils.js';
import { editRepo, saveRepo } from './form_actions.js';

/**
 * Initializes listeners for the repository editor form
 */
export function initRepos() {
    if (ui.repoSyncStrategy) {
        ui.repoSyncStrategy.onchange = () => {
            const val = ui.repoSyncStrategy.value;
            if (ui.strategyDescription && ui.strategyInfoBox) {
                ui.strategyDescription.textContent = t(`strategy_help_${val}`);
                
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
                showKeyDrawer(data.pubkey, t('git_global_key_title'), t('git_global_key_desc'));
            } else {
                toast.warn(t('error_generic'));
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
            if (!url) return toast.warn(t('warn_enter_url'));
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
                    toast.success(t('toast_branches_loaded'));
                } else {
                    toast.error(data.detail || t('error_fetch_branches'));
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
            // Auto-switch from global to unique
            if (ui.repoUseGlobalSSH) {
                ui.repoUseGlobalSSH.checked = false;
                ui.repoUseGlobalSSH.onchange(); // Trigger UI updates
            }
            if (ui.repoManualKeyInput) ui.repoManualKeyInput.classList.toggle('hidden');
            if (ui.repoUniqueKeyDisplay) ui.repoUniqueKeyDisplay.classList.add('hidden');
            ui.btnRepoGenUniqueKey.classList.remove('hidden');
            ui.repoManualPrivateKey.value = '';
            ui.repoManualPublicKey.value = '';
        };
    }

    // Generate Unique Key
    if (ui.btnRepoGenUniqueKey) {
        ui.btnRepoGenUniqueKey.onclick = () => {
            if (ui.repoUseGlobalSSH) {
                ui.repoUseGlobalSSH.checked = false;
                ui.repoUseGlobalSSH.onchange();
            }
            createKeyPair();
        };
    }

    // Copy generated key
    if (ui.btnCopyGeneratedKey) {
        ui.btnCopyGeneratedKey.onclick = () => {
            if (tempKeyPair.public) {
                navigator.clipboard.writeText(tempKeyPair.public);
                toast.success(t('toast_pubkey_copied'));
            }
        };
    }

    // Add New Repo button
    if (ui.btnAddRepo) {
        ui.btnAddRepo.onclick = () => {
            ui.repoEditorForm.classList.remove('hidden');
            ui.repoEditorForm.scrollIntoView({ behavior: 'smooth' });
            document.getElementById('repo-editor-title').innerText = t('repo_add_title');
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
            ui.btnRepoGenUniqueKey.innerText = t('git_repo_gen_unique');
            if (ui.btnRepoManualKey) ui.btnRepoManualKey.classList.remove('hidden');
            
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

export { editRepo, saveRepo };

