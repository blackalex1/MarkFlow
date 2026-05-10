import { ui } from '../../ui.js';
import { toast } from '../../toasts.js';
import { API } from '../../api.js';
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
            toast.success('Key copied to clipboard!');
        };
    }
}

/**
 * Generates a new SSH key pair via API
 */
export async function createKeyPair() {
    const i18n = window.i18n || {};
    const t = (key, fallback) => (i18n.t ? i18n.t(key) : fallback);

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
                toast.info('URL converted to SSH format');
            }
        }

        showKeyDrawer(pair.public_key, t('git_unique_key_title', 'Unique Key Generated'), t('git_unique_key_desc', 'Copy this unique key to your Git provider settings.'));
        toast.success('Unique key pair generated.');
    } catch (e) {
        toast.error('Failed to generate key pair');
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
            showKeyDrawer(data.pubkey, `Public Key (${data.type})`, `Copy this ${data.type} key to your Git provider settings.`);
        } else {
            toast.error('No key found');
        }
    } catch (err) {
        toast.error('Error fetching key');
    }
}
