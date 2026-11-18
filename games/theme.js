try {
    const settings = JSON.parse(localStorage.getItem('dashboard-settings') || '{}');
    const light = settings.theme === 'light' || (settings.theme === 'system' && matchMedia('(prefers-color-scheme: light)').matches);
    document.body.classList.toggle('theme-light', light);
} catch { /* Default matches the dashboard's dark theme. */ }
