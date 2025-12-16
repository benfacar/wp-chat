self.addEventListener('install', (e) => {
    console.log('[Service Worker] Installed');
});

self.addEventListener('fetch', (e) => {
    // Şimdilik boş, offline çalışması için ileride doldurulabilir.
});