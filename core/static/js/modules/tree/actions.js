import { state } from '../ui.js';
import { toast } from '../toasts.js';
import { t } from '../i18n.js';
import { API } from '../api.js';
import { loadFileTree } from '../tree.js';

export async function handleMenuCommand(cmd, node, contextPath = '') {
    const isStaff = state.currentUser && ['developer', 'maintainer', 'owner'].includes(state.currentUser.role);
    if (!isStaff) return;


    if (cmd === 'new-file') {
        const name = await window.promptAction(t('menu_new_file'), t('pages_name_placeholder') || "Enter file name:", '', t('pages_btn_create') || 'OK', t('btn_cancel'));
        if (!name) return;
        const fullPath = contextPath ? `${contextPath}/${name}` : name;
        const res = await fetch(`${API.FILE_CREATE}?path=${encodeURIComponent(fullPath)}`, { method: 'POST' });
        if (res.ok) {
            toast.success(t('toast_save_success'));
            loadFileTree();
            window.dispatchEvent(new CustomEvent('load-file', { detail: { path: fullPath + (fullPath.endsWith('.md') ? '' : '.md') } }));
        } else {
            const err = await res.json();
            toast.error(t(err.detail) || "Failed to create file");
        }
    } else if (cmd === 'new-folder') {
        const name = await window.promptAction(t('menu_new_folder'), t('pages_name_placeholder') || "Enter folder name:", '', t('pages_btn_create') || 'OK', t('btn_cancel'));
        if (!name) return;
        const fullPath = contextPath ? `${contextPath}/${name}` : name;
        const res = await fetch(`${API.FILE_MKDIR}?path=${encodeURIComponent(fullPath)}`, { method: 'POST' });
        if (res.ok) {
            toast.success(t('type_folder') + " created");
            loadFileTree();
        } else {
            const err = await res.json();
            toast.error(t(err.detail) || "Failed to create folder");
        }
    } else if (cmd === 'delete') {
        const typeStr = node.type === 'folder' ? (t('type_folder') || 'folder') : (t('type_file') || 'file');
        const confirmed = await window.confirmAction(
            t('confirm_delete_title') || 'Confirm Delete',
            `${t('confirm_delete_msg') || 'Are you sure you want to delete'} ${typeStr} "${node.name}"?`,
            t('btn_delete') || 'Delete',
            t('btn_cancel') || 'Cancel'
        );
        if (confirmed) {
            const res = await fetch(`${API.FILE_DELETE}?path=${encodeURIComponent(node.path)}`, { method: 'DELETE' });
            if (res.ok) {
                const typeStr = node.type === 'folder' ? (t('type_folder') || 'folder') : (t('type_file') || 'file');
                toast.success(`${typeStr} ${t('toast_delete_success') || 'deleted'}`);
                loadFileTree();
                if (node.path === state.currentFilePath) {
                    location.href = '/';
                }
            } else {
                toast.error(t('toast_delete_failed') || "Failed to delete");
            }
        }
    } else if (cmd === 'rename') {
        const newName = await window.promptAction(t('menu_rename') || 'Rename', t('prompt_rename_name', { name: node.name }), node.name, t('btn_save'), t('btn_cancel'));
        if (!newName || newName === node.name) return;
        
        if (newName.includes('/') || newName.includes('\\')) {
            toast.error(t('error_invalid_filename') || "Filename cannot contain slashes");
            return;
        }
        
        let cleanName = newName;
        if (node.type === 'file' && !cleanName.endsWith('.md')) {
            cleanName += '.md';
        }
        
        const parts = node.path.split('/');
        const parentPath = parts.slice(0, -1).join('/');
        const newPath = parentPath ? `${parentPath}/${cleanName}` : cleanName;
        
        const res = await fetch(API.FILE_MOVE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ old_path: node.path, new_path: newPath })
        });
        
        if (res.ok) {
            const result = await res.json();
            const actualNewPath = result.new_path || newPath;
            toast.success(t('toast_path_updated') || "Path updated");
            loadFileTree();
            if (node.path === state.currentFilePath) {
                window.dispatchEvent(new CustomEvent('load-file', { detail: { path: actualNewPath } }));
            }
        } else {
            const err = await res.json();
            toast.error(t(err.detail) || "Failed to rename");
        }
    } else if (cmd === 'move') {
        const parts = node.path.split('/');
        const currentParent = parts.slice(0, -1).join('/');
        
        const destFolder = await window.promptAction(
            t('menu_move') || 'Move',
            t('prompt_select_destination') || "Select destination folder:",
            currentParent,
            t('btn_save') || 'Save',
            t('btn_cancel') || 'Cancel',
            false,
            null,
            true,
            node.path
        );
        
        if (destFolder === null) return;
        
        const newPath = destFolder === '' ? node.name : `${destFolder}/${node.name}`;
        if (newPath === node.path) return;
        
        const res = await fetch(API.FILE_MOVE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ old_path: node.path, new_path: newPath })
        });
        
        if (res.ok) {
            const result = await res.json();
            const actualNewPath = result.new_path || newPath;
            toast.success(t('toast_path_updated') || "Path updated");
            loadFileTree();
            if (node.path === state.currentFilePath) {
                window.dispatchEvent(new CustomEvent('load-file', { detail: { path: actualNewPath } }));
            }
        } else {
            const err = await res.json();
            toast.error(t(err.detail) || "Failed to move");
        }
    } else if (cmd.startsWith('status-')) {
        const status = cmd.replace('status-', '');
        const res = await fetch(`${API.FILE_STATUS}?path=${encodeURIComponent(node.path)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        if (res.ok) {
            toast.success(`${t('status_updated') || 'Status updated to'} ${t(`status_${status}`)}`);
            loadFileTree();
            // Trigger refresh in viewer if active
            if (node.path === state.currentFilePath) {
                window.dispatchEvent(new CustomEvent('load-file', { detail: { path: node.path } }));
            }
        } else {
            toast.error("Failed to update status");
        }
    } else if (cmd.startsWith('vis-')) {
        const isPublic = cmd === 'vis-public';
        const res = await fetch(`${API.FILE_VISIBILITY}?path=${encodeURIComponent(node.path)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ public: isPublic })
        });
        if (res.ok) {
            const typeStr = node.type === 'folder' ? (t('type_folder') || 'Folder') : (t('type_file') || 'File');
            toast.success(`${typeStr} ${isPublic ? (t('vis_public') || 'is now public') : (t('vis_private') || 'is now private')}`);
            loadFileTree();
            if (node.path === state.currentFilePath) {
                window.dispatchEvent(new CustomEvent('load-file', { detail: { path: node.path } }));
            }
        } else {
            toast.error("Failed to update visibility");
        }
    }
}
