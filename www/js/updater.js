// Checks GitHub Releases for a newer APK and offers it on the home screen.
const APP_VERSION = '0.2.0';
const RELEASE_REPO = 'ravivarmapatturi/gully-legends';

const Updater = (() => {
  const newer = (a, b) => {
    const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
    return false;
  };
  async function check() {
    try {
      const r = await fetch(`https://api.github.com/repos/${RELEASE_REPO}/releases/latest`, { cache: 'no-store' });
      if (!r.ok) return;
      const rel = await r.json();
      const latest = String(rel.tag_name || '').replace(/^v/, '');
      const apk = (rel.assets || []).find(a => a.name.endsWith('.apk'));
      if (!latest || !apk || !newer(latest, APP_VERSION)) return;
      const bar = document.getElementById('updateBar');
      bar.querySelector('b').textContent = 'v' + latest;
      bar.querySelector('a').href = apk.browser_download_url;
      bar.hidden = false;
    } catch (e) { /* offline: just skip */ }
  }
  return { check };
})();
