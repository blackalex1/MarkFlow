import { ui } from '../ui.js';
import { toast } from '../toasts.js';
import * as i18n from '../i18n.js';

export function initSystemSettings() {
    const btnSave = document.getElementById('btn-save-system-settings');
    const inputAppName = document.getElementById('sys-app-name');
    const inputPrimaryColor = document.getElementById('sys-primary-color');
    const colorValueDisplay = document.getElementById('sys-color-value');
    
    // Custom Picker elements
    const colorTrigger = document.getElementById('sys-color-trigger');
    const colorDropdown = document.getElementById('sys-color-dropdown');
    const colorPreviewCircle = document.getElementById('sys-color-preview-circle');
    const swatches = document.querySelectorAll('.color-swatch');
    
    // Logo/Favicon Triggers (CSP Friendly)
    const btnLogoTrigger = document.getElementById('btn-sys-logo-trigger');
    const btnFaviconTrigger = document.getElementById('btn-sys-favicon-trigger');
    const logoUpload = document.getElementById('sys-logo-upload');
    const faviconUpload = document.getElementById('sys-favicon-upload');

    if (btnLogoTrigger && logoUpload) {
        btnLogoTrigger.onclick = () => logoUpload.click();
    }
    if (btnFaviconTrigger && faviconUpload) {
        btnFaviconTrigger.onclick = () => faviconUpload.click();
    }

    // Logo Fallback Handler (CSP Friendly)
    const mainLogo = document.getElementById('app-logo-main');
    if (mainLogo) {
        mainLogo.onerror = () => {
            mainLogo.style.display = 'none';
            const altName = document.getElementById('sidebar-app-name-alt');
            if (altName) altName.style.display = 'block';
        };
    }
    
    if (!btnSave) return;

    // Force translations for new elements
    setTimeout(() => {
        i18n.updatePage();
    }, 100);

    const hexToRgb = (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    };

    const updateColorPreview = (color) => {
        if (!/^#(?:[0-9a-fA-F]{3}){1,2}$/.test(color)) return;
        
        const rgb = hexToRgb(color);
        if (colorValueDisplay) colorValueDisplay.innerText = color;
        if (colorPreviewCircle) colorPreviewCircle.style.backgroundColor = color;
        if (inputPrimaryColor) inputPrimaryColor.value = color;
        
        document.documentElement.style.setProperty('--primary-color', color, 'important');
        if (rgb) {
            document.documentElement.style.setProperty('--primary-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`, 'important');
        }
        
        // Mark active swatch
        swatches.forEach(s => {
            s.classList.toggle('active', s.dataset.color.toLowerCase() === color.toLowerCase());
        });
    };

    // Toggle Dropdown
    if (colorTrigger) {
        colorTrigger.onclick = (e) => {
            e.stopPropagation();
            colorDropdown.classList.toggle('active');
        };
    }

    // Close on click outside
    document.addEventListener('click', (e) => {
        if (colorDropdown && !colorDropdown.contains(e.target) && !colorTrigger.contains(e.target)) {
            colorDropdown.classList.remove('active');
        }
    });

    // Swatches
    swatches.forEach(swatch => {
        swatch.onclick = (e) => {
            const color = swatch.dataset.color;
            updateColorPreview(color);
            colorDropdown.classList.remove('active');
        };
    });

    // File Upload Handlers (Uses variables defined above)
    let pendingLogo = null;
    let pendingFavicon = null;
    
    const handleFilePreview = (input, type) => {
        const file = input.files[0];
        if (!file) return;

        if (type === 'logo') pendingLogo = file;
        else pendingFavicon = file;

        const reader = new FileReader();
        reader.onload = (e) => {
            const previewId = type === 'logo' ? 'sys-logo-preview' : 'sys-favicon-preview';
            const placeholderId = type === 'logo' ? 'logo-placeholder' : 'favicon-placeholder';
            const previewEl = document.getElementById(previewId);
            const placeholderEl = document.getElementById(placeholderId);
            if (previewEl) {
                previewEl.src = e.target.result;
                previewEl.style.display = 'block';
            }
            if (placeholderEl) {
                placeholderEl.style.display = 'none';
            }
        };
        reader.readAsDataURL(file);
    };

    const uploadAsset = async (file, type) => {
        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch(`/api/system/upload-asset?type=${type}`, {
                method: 'POST',
                body: formData
            });

            if (res.ok) {
                const data = await res.json();
                return data.path;
            } else {
                const data = await res.json();
                throw new Error(data.detail || "Upload failed");
            }
        } catch (err) {
            console.error(err);
            throw err;
        }
    };

    if (logoUpload) logoUpload.onchange = () => handleFilePreview(logoUpload, 'logo');
    if (faviconUpload) faviconUpload.onchange = () => handleFilePreview(faviconUpload, 'favicon');

    if (inputPrimaryColor) {
        inputPrimaryColor.oninput = (e) => {
            let color = e.target.value;
            if (!color.startsWith('#')) color = '#' + color;
            updateColorPreview(color);
        };
    }

    btnSave.onclick = async () => {
        const app_name = inputAppName.value.trim();
        const primary_color = inputPrimaryColor.value;
        const use_logo = document.getElementById('sys-use-logo').checked;
        
        // Get clean paths (no ?v=)
        const getCleanPath = (id) => {
            const el = document.getElementById(id);
            if (!el) return '';
            const p = el.value || el.dataset.currentPath || '';
            return p.includes('?') ? p.split('?')[0] : p;
        };

        let logo_path = getCleanPath('sys-logo-path');
        let favicon_path = getCleanPath('sys-favicon-path');
        
        toast.info(i18n.t('sys_saving') || "Saving...", 2000);

        try {
            if (pendingLogo) {
                logo_path = await uploadAsset(pendingLogo, 'logo');
                pendingLogo = null;
            }
            if (pendingFavicon) {
                favicon_path = await uploadAsset(pendingFavicon, 'favicon');
                pendingFavicon = null;
            }
        } catch (err) {
            return toast.error("Asset upload failed: " + err.message);
        }
        const getLimit = (key) => {
            const num = document.getElementById(`sys-limit-${key}-num`).value;
            const period = document.getElementById(`sys-limit-${key}-period`).value;
            return `${num}/${period}`;
        };

        const security_limits = {
            login: getLimit('login'),
            "2fa_verify": getLimit('2fa-verify'),
            change_password: getLimit('change-password'),
            file_ops: getLimit('file-ops'),
            search: getLimit('search'),
            create_user: getLimit('create-user')
        };

        if (!app_name) return toast.warn(i18n.t('sys_name_empty'));

        try {
            const res = await fetch('/api/system/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    app_name, 
                    primary_color, 
                    use_logo, 
                    logo_path,
                    favicon_path,
                    security_limits
                })
            });

            if (res.ok) {
                toast.success(i18n.t('sys_updated_success'));
                
                // Update title immediately
                document.title = app_name;
                
                // Update sidebar branding
                ['sidebar-app-name', 'sidebar-app-name-alt', 'sidebar-app-name-simple'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.innerText = app_name;
                });
                
                // Update CSS variables
                const rgb = hexToRgb(primary_color);
                document.documentElement.style.setProperty('--primary-color', primary_color, 'important');
                if (rgb) {
                    document.documentElement.style.setProperty('--primary-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`, 'important');
                }

                // Update all logo/favicon images on the page to bypass cache
                const version = Date.now();
                const fullLogoPath = logo_path ? (logo_path.includes('?') ? logo_path.split('?')[0] : logo_path) : '';
                const fullFaviconPath = favicon_path ? (favicon_path.includes('?') ? favicon_path.split('?')[0] : favicon_path) : '';

                document.querySelectorAll('.app-logo, #sys-logo-preview').forEach(img => {
                    if (fullLogoPath) {
                        img.src = `${fullLogoPath}?v=${version}`;
                        img.style.display = 'block';
                    } else {
                        img.style.display = 'none';
                    }
                });

                document.querySelectorAll('#sys-favicon-preview').forEach(img => {
                    if (fullFaviconPath) {
                        img.src = `${fullFaviconPath}?v=${version}`;
                        img.style.display = 'block';
                    } else {
                        img.style.display = 'none';
                    }
                });

                // Update hidden inputs so subsequent saves don't use old data
                const logoInput = document.getElementById('sys-logo-path');
                const faviconInput = document.getElementById('sys-favicon-path');
                if (logoInput) {
                    logoInput.value = fullLogoPath;
                    logoInput.dataset.currentPath = fullLogoPath;
                }
                if (faviconInput) {
                    faviconInput.value = fullFaviconPath;
                    faviconInput.dataset.currentPath = fullFaviconPath;
                }
                
                // Hide placeholders if new assets are present
                const logoPlaceholder = document.getElementById('logo-placeholder');
                const faviconPlaceholder = document.getElementById('favicon-placeholder');
                if (logoPlaceholder && fullLogoPath) logoPlaceholder.style.display = 'none';
                if (faviconPlaceholder && fullFaviconPath) faviconPlaceholder.style.display = 'none';
                
                // Show/hide branding container in sidebar
                const branding = document.querySelector('.app-branding');
                const simpleName = document.getElementById('sidebar-app-name-simple');
                if (branding) branding.style.display = use_logo ? 'flex' : 'none';
                if (simpleName) simpleName.style.display = use_logo ? 'none' : 'block';
            } else {
                const data = await res.json();
                let errMsg = i18n.t('sys_save_failed');
                if (data.detail && Array.isArray(data.detail)) {
                    errMsg = data.detail.map(e => e.msg).join(', ');
                } else if (data.detail) {
                    errMsg = data.detail;
                }
                toast.error(errMsg);
            }
        } catch (err) {
            toast.error(i18n.t('sys_network_error'));
        }
    };
}
