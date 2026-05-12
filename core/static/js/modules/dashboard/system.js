import { ui } from '../ui.js';
import { API } from '../api.js';
import { toast } from '../toasts.js';
import * as i18n from '../i18n.js';
import { initSpectrumPicker } from '../color-picker-logic.js';

export function initSystemSettings() {
    const btnSave = document.getElementById('btn-save-system-settings');
    if (btnSave) {
        btnSave.onclick = saveSystemSettings;
    }

    // Custom Color Picker logic
    const colorTrigger = document.getElementById('sys-color-trigger');
    const colorDropdown = document.getElementById('sys-color-dropdown');
    const colorPreviewCircle = document.getElementById('sys-color-preview-circle');
    const colorValueDisplay = document.getElementById('sys-color-value');
    const colorInput = document.getElementById('sys-primary-color');
    const swatches = colorDropdown ? colorDropdown.querySelectorAll('.color-swatch') : [];

    const updateColorPreview = (color) => {
        if (!/^#(?:[0-9a-fA-F]{3}){1,2}$/.test(color)) return;
        if (colorValueDisplay) colorValueDisplay.innerText = color;
        if (colorPreviewCircle) colorPreviewCircle.style.backgroundColor = color;
        if (colorInput) colorInput.value = color;
        
        swatches.forEach(s => {
            if (s.dataset.color) {
                s.classList.toggle('active', s.dataset.color.toLowerCase() === color.toLowerCase());
            }
        });
        
        // Update document theme colors immediately for preview
        document.documentElement.style.setProperty('--primary-color', color);
        const rgb = hexToRgb(color);
        if (rgb) {
            document.documentElement.style.setProperty('--primary-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
        }
    };

    if (colorTrigger) {
        colorTrigger.onclick = (e) => {
            e.stopPropagation();
            colorDropdown.classList.toggle('active');
        };
    }

    document.addEventListener('click', (e) => {
        if (colorDropdown && !colorDropdown.contains(e.target) && !colorTrigger.contains(e.target)) {
            colorDropdown.classList.remove('active');
        }
    });

    // Swatches
    swatches.forEach(swatch => {
        swatch.onclick = (e) => {
            const color = swatch.dataset.color;
            if (color) {
                updateColorPreview(color);
                colorDropdown.classList.remove('active');
            }
        };
    });

    // Custom Spectrum Picker logic
    initSpectrumPicker({
        canvasId: 'sys-spectrum-canvas',
        cursorId: 'sys-spectrum-cursor',
        hueSliderId: 'sys-hue-slider',
        triggerId: 'sys-spectrum-trigger',
        containerId: 'sys-spectrum-container',
        onUpdate: (color) => {
            updateColorPreview(color);
        }
    });

    // Ambient Glow Preview (Dual Theme)
    const glowToggle = document.getElementById('sys-bg-glow-enabled');
    const glowOpacityLight = document.getElementById('sys-bg-glow-opacity-light');
    const glowOpacityDark = document.getElementById('sys-bg-glow-opacity-dark');
    const glowBadgeLight = document.getElementById('sys-glow-opacity-light-badge');
    const glowBadgeDark = document.getElementById('sys-glow-opacity-dark-badge');
    const bgGlowEl = document.querySelector('.bg-glow');

    if (glowToggle && bgGlowEl) {
        const updateGlow = () => {
            const enabled = glowToggle.checked;
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
            const opacityLight = glowOpacityLight.value;
            const opacityDark = glowOpacityDark.value;
            
            bgGlowEl.style.display = enabled ? 'block' : 'none';
            
            // Apply only to current theme for preview
            const targetOpacity = currentTheme === 'light' ? opacityLight : opacityDark;
            document.documentElement.style.setProperty('--bg-glow-opacity', targetOpacity);
            
            if (glowBadgeLight) glowBadgeLight.innerText = `${Math.round(opacityLight * 100)}%`;
            if (glowBadgeDark) glowBadgeDark.innerText = `${Math.round(opacityDark * 100)}%`;
        };

        glowToggle.onchange = updateGlow;
        if (glowOpacityLight) glowOpacityLight.oninput = updateGlow;
        if (glowOpacityDark) glowOpacityDark.oninput = updateGlow;
    }

    // Force translations and icons for new elements
    setTimeout(() => {
        i18n.updatePage();
        if (window.lucide) window.lucide.createIcons();
    }, 100);

    const hexToRgb = (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    };

    // File Upload Handlers (Uses variables defined above)
    let pendingLogo = null;
    let pendingFavicon = null;

    const logoUpload = document.getElementById('sys-logo-upload');
    const logoTrigger = document.getElementById('btn-sys-logo-trigger');
    const logoPreview = document.getElementById('sys-logo-preview');
    const logoPlaceholder = document.getElementById('logo-placeholder');

    if (logoTrigger && logoUpload) {
        logoTrigger.onclick = () => logoUpload.click();
        logoUpload.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                pendingLogo = file;
                const reader = new FileReader();
                reader.onload = (re) => {
                    logoPreview.src = re.target.result;
                    logoPreview.style.display = 'block';
                    if (logoPlaceholder) logoPlaceholder.style.display = 'none';
                };
                reader.readAsDataURL(file);
            }
        };
    }

    const faviconUpload = document.getElementById('sys-favicon-upload');
    const faviconTrigger = document.getElementById('btn-sys-favicon-trigger');
    const faviconPreview = document.getElementById('sys-favicon-preview');
    const faviconPlaceholder = document.getElementById('favicon-placeholder');

    if (faviconTrigger && faviconUpload) {
        faviconTrigger.onclick = () => faviconUpload.click();
        faviconUpload.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                pendingFavicon = file;
                const reader = new FileReader();
                reader.onload = (re) => {
                    faviconPreview.src = re.target.result;
                    faviconPreview.style.display = 'block';
                    if (faviconPlaceholder) faviconPlaceholder.style.display = 'none';
                };
                reader.readAsDataURL(file);
            }
        };
    }
}

async function saveSystemSettings() {
    const btn = document.getElementById('btn-save-system-settings');
    const appName = document.getElementById('sys-app-name').value;
    const primaryColor = document.getElementById('sys-primary-color').value;
    const useLogo = document.getElementById('sys-use-logo').checked;
    
    // Limits
    const limits = {};
    ['login', '2fa-verify', 'change-password', 'file-ops', 'search', 'create-user'].forEach(key => {
        const num = document.getElementById(`sys-limit-${key}-num`).value;
        const period = document.getElementById(`sys-limit-${key}-period`).value;
        limits[key.replace(/-/g, '_')] = `${num}/${period}`;
    });

    const maxRequestSize = document.getElementById('sys-max-request-size').value;

    const originalText = btn.innerText;
    const { t } = i18n;
    btn.disabled = true;
    btn.innerText = t('sys_saving', 'Saving...');

    try {
        // 1. Handle file uploads first if any
        let logoPath = document.getElementById('sys-logo-preview')?.src || '';
        if (logoPath.startsWith('data:')) {
            const logoFile = document.getElementById('sys-logo-upload').files[0];
            const formData = new FormData();
            formData.append('file', logoFile);
            const res = await fetch(`${API.SYSTEM_UPLOAD_ASSET}?type=logo`, { method: 'POST', body: formData });
            if (res.ok) {
                const result = await res.json();
                logoPath = result.path;
            }
        } else {
            logoPath = logoPath.replace(window.location.origin, '');
        }

        let faviconPath = document.getElementById('sys-favicon-preview')?.src || '';
        if (faviconPath.startsWith('data:')) {
            const faviconFile = document.getElementById('sys-favicon-upload').files[0];
            const formData = new FormData();
            formData.append('file', faviconFile);
            const res = await fetch(`${API.SYSTEM_UPLOAD_ASSET}?type=favicon`, { method: 'POST', body: formData });
            if (res.ok) {
                const result = await res.json();
                faviconPath = result.path;
            }
        } else {
            faviconPath = faviconPath.replace(window.location.origin, '');
        }

        // 2. Save core settings
        const data = {
            app_name: appName,
            primary_color: primaryColor,
            use_logo: useLogo,
            logo_path: logoPath,
            favicon_path: faviconPath,
            bg_glow_enabled: document.getElementById('sys-bg-glow-enabled').checked,
            bg_glow_opacity_light: parseFloat(document.getElementById('sys-bg-glow-opacity-light').value),
            bg_glow_opacity_dark: parseFloat(document.getElementById('sys-bg-glow-opacity-dark').value),
            security_limits: limits,
            max_request_size_mb: parseInt(maxRequestSize)
        };

        const res = await fetch(API.SETTINGS, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.detail || t('sys_updated_error', 'Failed to save settings'));
        }

        toast.success(t('sys_updated_success', 'System settings saved'));
        
        // Refresh page to apply branding changes
        setTimeout(() => window.location.reload(), 1000);

    } catch (err) {
        toast.error(err.message);
    } finally {
        btn.disabled = false;
        btn.innerText = originalText;
    }
}
