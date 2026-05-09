export const en = {
    // Sidebar & UI
    search_placeholder: "Jump to...",
    theme_toggle: "Toggle Theme",
    login_btn: "Login",
    dashboard_btn: "Dashboard",
    welcome_title: "Welcome",
    welcome_msg: "Select a document from the sidebar to view.",
    toc_title: "Table of Contents",

    // Login Modal
    login_title: "Sign In",
    login_welcome: "Welcome back!",
    username_label: "Username",
    password_label: "Password",
    totp_label: "2FA Code (if enabled)",
    btn_login_submit: "Sign In",

    // Errors
    error_access_denied: "Access Denied",
    error_not_found: "Page Not Found",
    error_generic: "An error occurred",
    error_access_denied_msg: "You don't have enough permissions to view this content. Please sign in.",
    error_not_found_msg: "The requested file could not be found. It might have been moved or deleted.",
    btn_retry: "Retry",
    btn_home: "Go Home",
    btn_signin: "Sign In",

    // Dashboard
    tab_account: "Account",
    tab_pages: "Content",
    tab_users: "Users",
    tab_git: "Git",
    tab_logs: "Audit Logs",
    tab_system: "System",
    logout_btn: "Logout",
    logout_all_btn: "Logout from all devices",

    sys_app_name: "Name",
    sys_general_settings: "General Settings",
    sys_branding: "Branding & Assets",
    sys_logo_path: "Logo",
    sys_accent_color: "Accent Color",
    sys_save_btn: "Save System Settings",
    sys_color_hint: "This color will be applied globally to buttons, links, and active elements.",
    sys_custom_hex: "Custom Hex",
    sys_saving: "Saving settings...",
    sys_updated_success: "System settings updated successfully!",
    sys_updated_error: "Failed to save settings",
    sys_name_empty: "App name cannot be empty",
    sys_save_failed: "Failed to save settings",
    sys_network_error: "Network error while saving settings",
    sys_use_logo: "Use Logo",
    sys_favicon_path: "Favicon",
    sys_security_limits: "Security & Rate Limits",
    sys_limit_login: "Login",
    sys_limit_2fa: "2FA Verify",
    sys_limit_password: "Password Change",
    sys_limit_files: "File Operations",
    sys_limit_search: "Search",
    sys_limit_users: "User Creation",
    sys_limit_hint: "Select the maximum number of requests allowed per period.",
    unit_minute: "per minute",
    unit_hour: "per hour",
    unit_day: "per day",

    // Editor
    btn_edit: "Edit",
    btn_save: "Save",
    btn_cancel: "Cancel",
    btn_delete: "Delete",
    btn_upload: "Upload",

    // Settings
    sec_2fa: "Security (2FA)",
    sec_password: "Change Password",
    old_password: "Old Password",
    new_password: "New Password",
    
    // Editor Hints
    hint_h2: "Heading 2",
    hint_h2_desc: "Medium section heading",
    hint_h3: "Heading 3",
    hint_h3_desc: "Small section heading",
    hint_table: "Table",
    hint_table_desc: "Insert a 2x2 table",
    hint_code: "Code Block",
    hint_code_desc: "Fenced code block",
    hint_note: "Note Callout",
    hint_note_desc: "[!NOTE] block",
    hint_tabs: "Tabs",
    strategy_rebase: "Rebase (recommended)",
    strategy_force: "Force (overwrite)",
    strategy_pr: "PR Style (new branch)",
    strategy_help_rebase: "First commits your local changes, then pulls updates and puts your changes on top. Keeps a clean history.",
    strategy_help_force: "WARNING: Discards all local changes and makes the folder an exact copy of the remote branch. Use only for reset.",
    strategy_help_pr: "Safe method. Creates a new branch in Git with your changes, which can then be reviewed and merged via Pull Request.",
    unit_mins: "min.",
    hint_tabs_desc: "Tabbed container",
    
    tt_bold: "Bold (Ctrl+B)",
    tt_italic: "Italic (Ctrl+I)",
    tt_link: "Link (Ctrl+L)",
    tt_quote: "Quote",

    // Callouts
    callout_note: "Note",
    callout_tip: "Tip",
    callout_important: "Important",
    callout_warning: "Warning",
    callout_caution: "Caution",
    
    // Navigation
    nav_prev: "Previous",
    nav_next: "Next",

    // Git Sync
    btn_sync_now: "Sync Now",
    btn_syncing: "Syncing...",
    btn_fetch_branches: "Fetch Branches",
    btn_save_config: "Save Config",
    git_branch_label: "Target Branch",
    git_url_placeholder: "Repo URL (https://... or git@...)",
    btn_generate_ssh: "Generate New",
    btn_save_keys: "Save Keys",
    btn_copy_pubkey: "Copy PubKey",
    status_label: "Status",
    status_draft: "Draft",
    status_in_progress: "In Progress",
    status_published: "Published",
    status_updated: "Status updated to",

    // Menu
    menu_rename: "Rename",
    menu_move: "Move",
    menu_delete: "Delete",

    // Visibility
    vis_label: "Visibility",
    vis_public: "Public",
    vis_private: "Private",

    // Types
    type_folder: "Folder",
    type_file: "Document",
    
    // Force Sync
    btn_force_sync: "Force Sync",
    confirm_force_sync: "WARNING: This will discard all local changes and match the remote state. Continue?",
    
    // Repos
    repo_name_label: "Display Name",
    repo_slug_label: "Folder Name (slug)",
    repo_url_label: "Git URL",
    btn_add_repo: "+ Add",
    btn_edit_repo: "Edit",
    git_repos_list: "Repositories",
    repo_th_name: "Name",
    repo_th_status: "Status / Last Sync",
    repo_th_actions: "Actions",
    repo_btn_activate: "Activate",
    repo_btn_active: "Active",
    repo_btn_edit: "Edit",
    repo_btn_delete: "Delete",
    sync_never: "Never synced",
    sync_success: "Success",
    sync_failed: "Failed",
    git_select_repo: "Select a repository above",

    // Toasts
    toast_draft_found: "Unsaved draft found",
    toast_draft_restored: "Draft restored successfully",
    btn_restore: "Restore",

    // Confirmation Modals
    confirm_delete_title: "Confirm Deletion",
    confirm_delete_msg: "Are you sure you want to delete",
    confirm_delete_repo_title: "Delete Repository",
    confirm_delete_repo: "Are you sure you want to delete this repository configuration?",
    btn_confirm_delete: "Delete",
    confirm_gen_ssh_title: "Regenerate SSH Key",
    confirm_force_sync_title: "Force Sync",
    toast_repo_updated: "Repository updated successfully",
    toast_repo_added: "New repository added successfully",
    repo_unique_key_configured: "Unique key is configured",
    repo_btn_view_key: "View Current Key",
    repo_btn_regenerate: "Regenerate...",
    repo_confirm_regen_title: "Regenerate SSH Key",
    repo_view_key_title: "Current Unique Key",
    repo_confirm_regen_msg: "WARNING: This will replace the current SSH key. You will need to update it on GitHub. Continue?",
    btn_confirm_gen: "Regenerate",
    toast_sync_success: "Synchronization completed successfully"
};
