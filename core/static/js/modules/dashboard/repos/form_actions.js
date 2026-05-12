import { ui } from '../../ui.js';
import { toast } from '../../toasts.js';
import { t } from '../../i18n.js';
import { API } from '../../api.js';
import { loadRepositories } from './list.js';
import { showKeyDrawer, resetTempKeyPair, tempKeyPair } from './ssh.js';

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
            document.getElementById('repo-editor-title').innerText = t('repo_edit_title');
            ui.repoName.value = repo.name;
            ui.repoUrl.value = repo.url;
            ui.repoSlug.value = repo.slug;
            ui.repoSlugDisplay.innerText = repo.slug;
            ui.repoName.dataset.id = repo.id;
            ui.repoName.dataset.currentPubKey = repo.ssh_public_key || '';
            
            const hasUnique = repo.ssh_public_key && repo.ssh_public_key.length > 0;
            ui.repoUseGlobalSSH.checked = !hasUnique;
            
            if (ui.repoKeyTypeSelection) ui.repoKeyTypeSelection.classList.toggle('hidden', hasUnique);
            if (ui.repoUniqueKeyBox) ui.repoUniqueKeyBox.classList.toggle('hidden', !hasUnique);
            if (ui.btnViewGlobalKeyHint) ui.btnViewGlobalKeyHint.classList.toggle('hidden', hasUnique);
            
            if (hasUnique) {
                if (ui.repoCurrentKeyStatus) ui.repoCurrentKeyStatus.classList.remove('hidden');
                if (ui.repoKeyGenArea) ui.repoKeyGenArea.classList.add('hidden');
                
                if (ui.btnViewCurrentUniqueKey) {
                    ui.btnViewCurrentUniqueKey.onclick = () => showKeyDrawer(repo.ssh_public_key, t('repo_view_key_title'), '');
                }
                if (ui.btnTriggerRegenKey) {
                    ui.btnTriggerRegenKey.onclick = () => {
                        ui.repoCurrentKeyStatus.classList.add('hidden');
                        ui.repoKeyGenArea.classList.remove('hidden');
                        if (ui.btnRepoManualKey) ui.btnRepoManualKey.classList.remove('hidden');
                        if (ui.btnRepoGenUniqueKey) {
                            ui.btnRepoGenUniqueKey.classList.remove('hidden');
                            ui.btnRepoGenUniqueKey.disabled = false;
                            ui.btnRepoGenUniqueKey.innerText = t('git_repo_gen_unique');
                        }
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

export async function saveRepo() {
    const id = ui.repoName.dataset.id;
    const data = {
        name: ui.repoName.value.trim(),
        slug: ui.repoSlug.value.trim(),
        url: ui.repoUrl.value.trim(),
        branch: ui.repoBranchSelect.value,
        key_id: ui.repoUseGlobalSSH.checked ? null : tempKeyPair.keyId,
        public_key: ui.repoUseGlobalSSH.checked ? 
            '' : (tempKeyPair.public || ui.repoManualPublicKey.value.trim() || ui.repoName.dataset.currentPubKey),
        private_key: ui.repoUseGlobalSSH.checked ?
            '' : ui.repoManualPrivateKey.value.trim(),
        auto_sync_interval: ui.repoAutoSyncToggle.checked ? 
            ((parseInt(ui.repoAutoSyncInterval.value) || 30) * parseInt(ui.repoAutoSyncUnit.value)) : 0,
        sync_strategy: ui.repoSyncStrategy.value,
        flatten_in_tree: ui.repoFlattenToggle ? ui.repoFlattenToggle.checked : false
    };

    if (!data.name || !data.slug || !data.url) return toast.warn(t('warn_fill_required'));
    
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
            toast.success(id ? t('toast_repo_updated') : t('toast_repo_added'));
            ui.repoEditorForm.classList.add('hidden');
            
            const repoListContainer = document.getElementById('git-repos-list-container');
            if (repoListContainer) repoListContainer.classList.remove('hidden');
            
            if (ui.repoUniqueKeyDisplay) ui.repoUniqueKeyDisplay.classList.add('hidden');
            ui.btnRepoGenUniqueKey.classList.remove('hidden');
            
            loadRepositories();
            resetTempKeyPair();
        } else {
            const err = await res.json();
            toast.error(err.detail || t('error_save_repo'));
        }
    } catch (err) {
        toast.error(t('error_network'));
    }
}
