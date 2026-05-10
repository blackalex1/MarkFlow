/**
 * Git Repositories Management Module
 * Split into sub-modules for better maintainability.
 */

import { initRepos, editRepo } from './editor.js';
import { loadRepositories, activateRepo, deleteRepo } from './list.js';
import { viewRepoKey, createKeyPair, showKeyDrawer } from './ssh.js';

// Re-export for both ESM and global window compatibility
export {
    initRepos,
    loadRepositories,
    editRepo,
    activateRepo,
    deleteRepo,
    viewRepoKey,
    createKeyPair,
    showKeyDrawer
};

// Global compatibility layer (for legacy onclicks if any)
window.editRepo = editRepo;
window.activateRepo = activateRepo;
window.deleteRepo = deleteRepo;
window.viewRepoKey = viewRepoKey;
