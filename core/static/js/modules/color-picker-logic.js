export function initSpectrumPicker(options) {
    const { canvasId, cursorId, hueSliderId, triggerId, containerId, onUpdate } = options;
    
    const canvas = document.getElementById(canvasId);
    const cursor = document.getElementById(cursorId);
    const hueSlider = document.getElementById(hueSliderId);
    const trigger = document.getElementById(triggerId);
    const container = document.getElementById(containerId);
    
    if (!canvas || !cursor || !hueSlider || !trigger || !container) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let currentHue = 0;

    function syncCanvasSize() {
        if (canvas.width !== canvas.offsetWidth || canvas.height !== canvas.offsetHeight) {
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
            drawSpectrum(currentHue);
        }
    }

    function drawSpectrum(hue) {
        if (canvas.width === 0) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Saturation gradient (white to hue)
        const gradientH = ctx.createLinearGradient(0, 0, canvas.width, 0);
        gradientH.addColorStop(0, '#fff');
        gradientH.addColorStop(1, `hsl(${hue}, 100%, 50%)`);
        ctx.fillStyle = gradientH;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Value gradient (transparent to black)
        const gradientV = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradientV.addColorStop(0, 'rgba(0,0,0,0)');
        gradientV.addColorStop(1, '#000');
        ctx.fillStyle = gradientV;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    function updateColor(e) {
        const rect = canvas.getBoundingClientRect();
        let x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
        let y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;
        
        x = Math.max(0, Math.min(x, canvas.width - 1));
        y = Math.max(0, Math.min(y, canvas.height - 1));
        
        cursor.style.left = `${x}px`;
        cursor.style.top = `${y}px`;
        
        const imageData = ctx.getImageData(x, y, 1, 1).data;
        const hex = rgbToHex(imageData[0], imageData[1], imageData[2]);
        onUpdate(hex);
    }

    function rgbToHex(r, g, b) {
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
    }

    function hexToHsv(hex) {
        let r = 0, g = 0, b = 0;
        if (hex.length === 4) {
            r = parseInt(hex[1] + hex[1], 16) / 255;
            g = parseInt(hex[2] + hex[2], 16) / 255;
            b = parseInt(hex[3] + hex[3], 16) / 255;
        } else if (hex.length === 7) {
            r = parseInt(hex.slice(1, 3), 16) / 255;
            g = parseInt(hex.slice(3, 5), 16) / 255;
            b = parseInt(hex.slice(5, 7), 16) / 255;
        }

        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, v = max;
        const d = max - min;
        s = max === 0 ? 0 : d / max;

        if (max === min) {
            h = 0;
        } else {
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return { h: h * 360, s, v };
    }

    function setInitialColor(hex) {
        if (!hex || !hex.startsWith('#')) hex = '#6366F1';
        const { h, s, v } = hexToHsv(hex);
        currentHue = h;
        hueSlider.value = h;
        drawSpectrum(currentHue);

        const x = s * canvas.width;
        const y = (1 - v) * canvas.height;
        cursor.style.left = `${Math.max(0, Math.min(x, canvas.width - 1))}px`;
        cursor.style.top = `${Math.max(0, Math.min(y, canvas.height - 1))}px`;
    }

    // Toggle Spectrum
    trigger.onclick = (e) => {
        e.stopPropagation();
        const isActive = container.classList.toggle('active');
        if (isActive) {
            syncCanvasSize();
            // Search for the actual color input outside the picker container if needed
            // or look for a specific class
            const pickerWrapper = trigger.closest('.custom-color-picker');
            const colorInput = document.getElementById(options.valueInputId) || 
                               pickerWrapper.querySelector('.color-input-field') || 
                               document.querySelector('[id$="-new-color"]');
                               
            const startColor = colorInput?.value || '#6366F1';
            setInitialColor(startColor);
        }
    };

    // Hue Slider
    hueSlider.oninput = (e) => {
        currentHue = e.target.value;
        drawSpectrum(currentHue);
        
        let x = parseFloat(cursor.style.left) || 0;
        let y = parseFloat(cursor.style.top) || 0;
        
        x = Math.max(0, Math.min(x, canvas.width - 1));
        y = Math.max(0, Math.min(y, canvas.height - 1));
        
        const imageData = ctx.getImageData(x, y, 1, 1).data;
        onUpdate(rgbToHex(imageData[0], imageData[1], imageData[2]));
    };

    // Interaction
    let isDragging = false;
    const startDrag = (e) => { isDragging = true; updateColor(e); };
    const stopDrag = () => { isDragging = false; };
    const doDrag = (e) => { if (isDragging) updateColor(e); };

    canvas.onmousedown = startDrag;
    window.addEventListener('mousemove', doDrag);
    window.addEventListener('mouseup', stopDrag);
    
    canvas.ontouchstart = startDrag;
    window.addEventListener('touchmove', doDrag);
    window.addEventListener('touchend', stopDrag);

    // Initial Draw
    drawSpectrum(0);
}
