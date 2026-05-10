/**
 * Converts HTTPS Git URL to SSH format (specifically for GitHub)
 */
export function convertToSsh(url) {
    if (!url || !url.startsWith('http')) return url;
    try {
        // https://github.com/user/repo -> git@github.com:user/repo.git
        let clean = url.replace('https://', '').replace('http://', '');
        let parts = clean.split('/');
        if (parts.length >= 2) {
            let domain = parts[0];
            let rest = parts.slice(1).join('/');
            return `git@${domain}:${rest}${rest.endsWith('.git') ? '' : '.git'}`;
        }
        return url;
    } catch (e) { return url; }
}
