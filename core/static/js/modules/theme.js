export function initTheme() {
    const themeToggle = document.getElementById('theme-toggle');
    if (!themeToggle) return;

    const savedTheme = localStorage.getItem('theme');
    const systemTheme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    const currentTheme = savedTheme || systemTheme;

    setTheme(currentTheme);

    themeToggle.onclick = () => {
        const newTheme = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        setTheme(newTheme);
        localStorage.setItem('theme', newTheme);
    };
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const themeToggle = document.getElementById('theme-toggle');
    const hljsTheme = document.getElementById('hljs-theme');

    if (hljsTheme) {
        hljsTheme.href = theme === 'light' 
            ? 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css'
            : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css';
    }

    if (!themeToggle) return;
    
    const icon = themeToggle.querySelector('i');
    if (icon && window.lucide) {
        icon.setAttribute('data-lucide', theme === 'light' ? 'moon' : 'sun');
        lucide.createIcons();
    }
}
