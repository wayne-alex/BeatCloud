// app.js
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => {
                console.log('ServiceWorker registration successful');
            })
            .catch(err => {
                console.log('ServiceWorker registration failed: ', err);
            });
    });
}

// Add offline functionality for downloading songs
let downloadedSongs = [];

async function downloadSongForOffline(songId, songTitle) {
    try {
        const response = await fetch(`/download_song/${songId}/`);
        const blob = await response.blob();

        // Store in IndexedDB
        const db = await openDB('MusicAppDB', 1, {
            upgrade(db) {
                db.createObjectStore('songs');
            },
        });

        await db.put('songs', blob, songId);
        downloadedSongs.push({id: songId, title: songTitle});

        showNotification('Song downloaded for offline use', 'success');
    } catch (error) {
        console.error('Offline download failed:', error);
        showNotification('Download failed', 'error');
    }
}

// Function to check if online
function isOnline() {
    return navigator.onLine;
}

// Listen for online/offline events
window.addEventListener('online', function () {
    showNotification('Back online', 'success');
    syncDownloadedSongs();
});

window.addEventListener('offline', function () {
    showNotification('You are offline', 'warning');
});