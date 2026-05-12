import { ui } from '../../ui.js';
import { toast } from '../../toasts.js';
import { API } from '../../api.js';
import { t } from '../../i18n.js';
import { convertToSsh } from './utils.js';

export let tempKeyPair = { keyId: null, public: null };

/**
 * Reset the temporary key pair state
 */
export function resetTempKeyPair() {
    tempKeyPair = { keyId: null, public: null };
}

/**
 * Shows a modal drawer with SSH key details
 */
export function showKeyDrawer(key, title, desc) {
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
            toast.success(t('toast_pubkey_copied'));
        };
    }
}

/**
 * Generates a new SSH key pair via API
 */
export async function createKeyPair() {

    if (ui.btnRepoGenUniqueKey) {
        ui.btnRepoGenUniqueKey.disabled = true;
        ui.btnRepoGenUniqueKey.innerText = t('btn_generating', 'Generating...');
    }

    try {
        const res = await fetch(API.GIT_GEN_KEY_PAIR);
        const pair = await res.json();
        tempKeyPair.keyId = pair.key_id;
        tempKeyPair.public = pair.public_key;
        
        if (ui.repoGeneratedPubkey) ui.repoGeneratedPubkey.innerText = pair.public_key;
        if (ui.repoUniqueKeyDisplay) ui.repoUniqueKeyDisplay.classList.remove('hidden');
        if (ui.repoManualKeyInput) ui.repoManualKeyInput.classList.add('hidden');
        
        if (ui.btnRepoGenUniqueKey) ui.btnRepoGenUniqueKey.classList.add('hidden');
        if (ui.btnRepoManualKey) ui.btnRepoManualKey.classList.add('hidden');
        
        if (ui.repoUrl) {
            const currentUrl = ui.repoUrl.value.trim();
            const sshUrl = convertToSsh(currentUrl);
            if (sshUrl !== currentUrl) {
                ui.repoUrl.value = sshUrl;
                toast.info(t('toast_url_to_ssh'));
            }
        }

        showKeyDrawer(pair.public_key, t('git_unique_key_title'), t('git_unique_key_desc'));
        toast.success(t('toast_unique_key_generated'));
    } catch (e) {
        toast.error(t('toast_key_gen_failed'));
        if (ui.btnRepoGenUniqueKey) {
            ui.btnRepoGenUniqueKey.innerText = t('git_repo_gen_unique', 'Generate Unique Key');
            ui.btnRepoGenUniqueKey.disabled = false;
        }
    }
}

/**
 * Fetches and shows the public key for a repository
 */
export async function viewRepoKey(id) {
    try {
        const res = await fetch(`/api/git/repos/${id}/pubkey`);
        const data = await res.json();
        if (data.pubkey) {
            const titleKey = data.type === 'unique' ? 'repo_key_title_unique' : 'repo_key_title_global';
            showKeyDrawer(data.pubkey, t(titleKey), t('git_provider_desc'));
        } else {
            toast.error(t('toast_key_not_found'));
        }
    } catch (err) {
        toast.error(t('toast_key_fetch_error'));
    }
}
