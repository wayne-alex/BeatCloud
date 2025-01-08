const deviceId = localStorage.getItem('device_id') || 'None';


// WebSocket setup
let songsSocket = new WebSocket(
    `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/songs/`
);

songsSocket.onopen = function () {
    songsSocket.send(JSON.stringify({
        type: 'device_connect',
        device_id: deviceId
    }));
};

songsSocket.onmessage = function (e) {
    const data = JSON.parse(e.data);

    switch (data.type) {
        case 'song_list':
            updateSongList(data.songs);
            break;
        case 'song_update':
            handleSongUpdate(data);
            break;
        case 'sync_status':
            updateSyncStatus(data);
            break;
    }
};

function updateSongList(songs) {
    const songsContainer = document.querySelector('#songs');
    const existingSongs = songsContainer.querySelectorAll('.song-card:not(.upload-progress-card)');
    existingSongs.forEach(song => song.remove());
    songs.forEach(song => createSongCard(song, deviceId));
}

function handleSongUpdate(data) {
    const {action, song, source_device} = data;

    if (source_device !== deviceId) {
        if (action === 'create') {
            createSongCard(song);
            updateStats(1);
        } else if (action === 'update') {
            updateSongCard(song);
        } else if (action === 'delete') {
            deleteSongCard(song.id);
            updateStats(-1);
        }
    }
}

function updateSyncStatus(data) {
    const {song_id, synced_devices} = data;
    const songCard = document.querySelector(`[data-song-id="${song_id}"]`);

    if (songCard) {
        const syncStatus = songCard.querySelector('.sync-status');
        const isFullySynced = synced_devices.length >= 2;

        if (isFullySynced) {
            syncStatus.classList.remove('syncing');
            syncStatus.innerHTML = `
                <span class="material-icons-outlined">cloud_done</span>
                <span>Synced to ${synced_devices.length} devices</span>
            `;
        } else {
            syncStatus.classList.add('syncing');
            syncStatus.innerHTML = `
                <span class="material-icons-outlined">sync</span>
                <span>Syncing to devices (${synced_devices.length})...</span>
            `;
        }
    }
}

function notifyWebSocket(action, data) {
    if (songsSocket.readyState === WebSocket.OPEN) {
        songsSocket.send(JSON.stringify({
            type: 'song_update',
            action,
            source_device: deviceId,
            ...data
        }));
    } else {
        console.error('WebSocket is not open. Unable to send notification.');
    }
}

// Modal functions
function showUploadModal() {
    const modal = document.getElementById('uploadModal');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function hideUploadModal() {
    const modal = document.getElementById('uploadModal');
    modal.classList.remove('active');
    document.body.style.overflow = 'auto';
}

function getDeviceIcon(deviceType) {
    if (!deviceType) return 'smartphone';

    switch (deviceType.toLowerCase()) {
        case 'desktop':
            return 'computer';
        case 'mobile':
            return 'smartphone';
        case 'tablet':
            return 'tablet';
        default:
            return 'smartphone';
    }
}

function createSongCard(songData, currentDeviceId) {
    const songsSection = document.getElementById('songs');
    const songCard = document.createElement('div');
    songCard.className = 'song-card';
    songCard.dataset.songId = songData.id;

    const deviceIcon = getDeviceIcon(songData.uploaded_from__device_type);
    const uploadedFromText = songData.uploaded_from__id === currentDeviceId ?
        'Uploaded from this device' :
        `Uploaded from ${songData.uploaded_from__name || 'Unknown Device'}`;

    songCard.innerHTML = `
        <div class="song-main">
            <div class="song-info">
                <div class="song-icon">
                    <span class="material-icons-outlined">music_note</span>
                </div>
                <div class="song-details">
                    <h3>${songData.title}</h3>
                    <p>${songData.artist}</p>
                </div>
            </div>
        </div>
        <div class="upload-info">
            <span class="material-icons-outlined">${deviceIcon}</span>
            <span>${uploadedFromText}</span>
        </div>
        <div class="song-actions">
            <div class="sync-status">
                <span class="material-icons-outlined">cloud_done</span>
                <span>Synced</span>
            </div>
            <div class="action-icons">
                <span class="material-icons-outlined play">play_circle</span>
                <span class="material-icons-outlined download">download</span>
                <span class="material-icons-outlined delete">delete_outline</span>
            </div>
        </div>
    `;

    // Add specific click handler for play button
    const playBtn = songCard.querySelector('.play');
    playBtn.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();

        // Remove playing state from all other cards
        document.querySelectorAll('.song-card').forEach(card => {
            card.classList.remove('playing');
            card.querySelector('.play').classList.remove('playing');
            card.querySelector('.play').textContent = 'play_circle';
        });

        // Add playing state to this card
        songCard.classList.add('playing');
        playBtn.classList.add('playing');
        playBtn.textContent = 'music_note';  // Change icon to music note

        console.log('Play clicked:', songData.id);
        MusicPlayer.loadAndPlaySong(songData.id)
            .catch(error => {
                // Remove playing state if there's an error
                songCard.classList.remove('playing');
                playBtn.classList.remove('playing');
                playBtn.textContent = 'play_circle';
                console.error('Error playing song:', error);
            });
    };

    // Add method to stop playing animation
    songCard.stopPlaying = function () {
        songCard.classList.remove('playing');
        const playBtn = songCard.querySelector('.play');
        playBtn.classList.remove('playing');
        playBtn.textContent = 'play_circle';
    };

    // Existing download button handler
    const downloadBtn = songCard.querySelector('.download');
    downloadBtn.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        downloadSong(songData.id, songData.title);
    };

    // Existing delete button handler
    const deleteBtn = songCard.querySelector('.delete');
    deleteBtn.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        notifyWebSocket('delete', {
            song: {id: songData.id},
            sync_status: {
                synced_devices: [deviceId]
            }
        });

        const songCard = e.target.closest('.song-card');
        songCard.classList.add('slide-out');
        setTimeout(() => {
            songCard.remove();
            updateStats(-1);
        }, 300);
    };

    const statsBar = songsSection.querySelector('.stats-bar');
    if (statsBar) {
        songsSection.insertBefore(songCard, statsBar.nextSibling);
    } else {
        songsSection.appendChild(songCard);
    }

    return songCard;
}

function createUploadProgressCard(file) {
    const songsSection = document.getElementById('songs');
    const songCard = document.createElement('div');
    songCard.className = 'song-card upload-progress-card';
    // ... rest of the card HTML ...

    const statsBar = songsSection.querySelector('.stats-bar');
    if (statsBar) {
        songsSection.insertBefore(songCard, statsBar.nextSibling);
    } else {
        songsSection.appendChild(songCard);
    }

    return songCard;
}

function handleFileSelect(event) {
    const files = event.target.files;
    if (files.length > 0) {
        hideUploadModal();
        Array.from(files).forEach(file => {
            const container = document.querySelector('.container');
            const songCard = createUploadProgressCard(file);
            const statsBar = document.querySelector('.stats-bar');

            if (statsBar && statsBar.parentNode === container) {
                container.insertBefore(songCard, statsBar.nextSibling);
            } else {
                container.appendChild(songCard);
            }

            uploadFile(file, songCard);
        });
    }
}

function uploadFile(file, songCard) {
    const progressFill = songCard.querySelector('.progress-fill');
    const songDetails = songCard.querySelector('.song-details p');
    const syncStatus = songCard.querySelector('.sync-status');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('device_id', deviceId);

    const xhr = new XMLHttpRequest();
    xhr.timeout = 30000;

    xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
            const progress = (event.loaded / event.total) * 100;
            progressFill.style.width = `${progress}%`;
        }
    });

    xhr.ontimeout = () => handleUploadError(songCard);
    xhr.onerror = () => handleUploadError(songCard);

    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
            if (xhr.status === 200) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    songDetails.textContent = response.artist || 'Unknown Artist';

                    setTimeout(() => {
                        songCard.classList.add('slide-out');
                        setTimeout(() => {
                            songCard.remove();
                            const newSongCard = createSongCard(response, deviceId);

                            notifyWebSocket('create', {
                                song: response,
                                sync_status: {
                                    synced_devices: [deviceId]
                                }
                            });

                            updateStats(1);
                        }, 300);
                    }, 1000);
                } catch (error) {
                    handleUploadError(songCard);
                }
            } else {
                handleUploadError(songCard);
            }
        }
    };

    xhr.open('POST', '/upload_song/', true);
    xhr.setRequestHeader('X-CSRFToken', getCookie('csrftoken'));
    xhr.send(formData);
}

function handleUploadError(songCard) {
    songCard.classList.add('upload-error', 'error-animation');
    const songIcon = songCard.querySelector('.song-icon .material-icons-outlined');
    songIcon.textContent = 'error_outline';

    const syncStatus = songCard.querySelector('.sync-status');
    syncStatus.classList.remove('syncing');
    syncStatus.classList.add('error');
    syncStatus.innerHTML = `
        <span class="material-icons-outlined">error_outline</span>
        <span>Upload failed</span>
        <span class="material-icons-outlined remove-error" onclick="removeFailedUpload(this)">close</span>
    `;

    const progressBar = songCard.querySelector('.progress-bar');
    if (progressBar) {
        progressBar.style.display = 'none';
    }

    const songDetails = songCard.querySelector('.song-details p');
    songDetails.textContent = 'Failed to upload';
}

function removeFailedUpload(element) {
    const songCard = element.closest('.song-card');
    songCard.classList.add('slide-out');
    setTimeout(() => {
        songCard.remove();
    }, 300);
}

function deleteSongCard(songId) {
    const songCard = document.querySelector(`[data-song-id="${songId}"]`);
    if (songCard) {
        songCard.classList.add('slide-out');
        setTimeout(() => {
            songCard.remove();
        }, 300);
    }
}

// UI functions
function updateStats(change) {
    const songsStat = document.querySelector('.stat-value');
    const currentSongs = parseInt(songsStat.textContent);
    songsStat.textContent = currentSongs + change;
}

function togglePanel(panelName) {
    const panels = document.querySelectorAll('.panel');
    const targetPanel = document.getElementById(`${panelName}Panel`);

    panels.forEach(panel => {
        if (panel !== targetPanel) {
            panel.classList.remove('active');
        }
    });

    targetPanel.classList.toggle('active');
}

function searchSongs(query) {
    query = query.toLowerCase();
    const songCards = document.querySelectorAll('.song-card');

    songCards.forEach(card => {
        const title = card.querySelector('.song-details h3').textContent.toLowerCase();
        const artist = card.querySelector('.song-details p').textContent.toLowerCase();

        if (title.includes(query) || artist.includes(query)) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
}

function sortSongs(criteria) {
    const container = document.querySelector('.container');
    const songCards = Array.from(document.querySelectorAll('.song-card'));
    const statsBar = document.querySelector('.stats-bar');

    document.querySelectorAll('.sort-option').forEach(option => {
        option.classList.remove('active');
    });
    event.currentTarget.classList.add('active');

    songCards.sort((a, b) => {
        let valueA, valueB;

        switch (criteria) {
            case 'name':
                valueA = a.querySelector('.song-details h3').textContent;
                valueB = b.querySelector('.song-details h3').textContent;
                break;
            case 'artist':
                valueA = a.querySelector('.song-details p').textContent;
                valueB = b.querySelector('.song-details p').textContent;
                break;
            case 'date':
                valueA = a.dataset.dateAdded || '0';
                valueB = b.dataset.dateAdded || '0';
                break;
        }

        return valueA.localeCompare(valueB);
    });

    songCards.forEach(card => card.remove());
    container.appendChild(statsBar);
    songCards.forEach(card => container.appendChild(card));
}

function toggleSetting(setting) {
    const settings = {
        offline: 'Offline Mode',
        quality: 'High Quality Streaming',
        sync: 'Auto-Sync',
        wifi: 'Download Over WiFi Only'
    };

    console.log(`${settings[setting]} ${event.target.checked ? 'enabled' : 'disabled'}`);
}

function switchTab(tabId) {
    const tabs = document.querySelectorAll('.tab');
    const targetTab = document.querySelector(`.tab[onclick="switchTab('${tabId}')"]`);

    tabs.forEach(tab => tab.classList.remove('active'));
    targetTab.classList.add('active');

    targetTab.scrollIntoView({behavior: 'smooth', block: 'nearest', inline: 'center'});

    const sections = document.querySelectorAll('.section');
    const targetSection = document.getElementById(tabId);

    sections.forEach(section => section.classList.remove('active'));
    targetSection.classList.add('active');
}

// Utility functions
function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Modal click outside
    document.getElementById('uploadModal').addEventListener('click', function (e) {
        if (e.target === this) {
            hideUploadModal();
        }
    });

    // Dropzone events
    const dropzone = document.querySelector('.dropzone');

    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = '#1DB954';
        dropzone.style.background = 'rgba(29, 185, 84, 0.05)';
    });

    dropzone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'rgba(29, 185, 84, 0.3)';
        dropzone.style.background = 'none';
    });

    // Continue Event Listeners
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const fileInput = document.getElementById('fileInput');
            fileInput.files = files;
            handleFileSelect({target: fileInput});
        }
        dropzone.style.borderColor = 'rgba(29, 185, 84, 0.3)';
        dropzone.style.background = 'none';
    });

    // Delete song handler
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete')) {
            const songCard = e.target.closest('.song-card');
            const songId = songCard.dataset.songId;

            notifyWebSocket('delete', {
                song: {id: songId},
                sync_status: {
                    synced_devices: [deviceId]
                }
            });

            songCard.classList.add('slide-out');
            setTimeout(() => {
                songCard.remove();
                updateStats(-1);
            }, 300);
        }
    });

    // Download song handler
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('download')) {
            const songCard = e.target.closest('.song-card');
            const songId = songCard.dataset.songId;
            const songTitle = songCard.querySelector('.song-details h3').textContent;

            // Trigger download
            downloadSong(songId, songTitle);
        }
    });

    // Panel click outside handler
    document.addEventListener('click', function (e) {
        if (!e.target.closest('.panel') && !e.target.closest('.action-button')) {
            document.querySelectorAll('.panel').forEach(panel => {
                panel.classList.remove('active');
            });
        }
    });

    // Initialize tabs
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
        });
    });
});

// Download function
function downloadSong(songId, songTitle) {
    const downloadUrl = `/download_song/${songId}/`;

    fetch(downloadUrl)
        .then(response => response.blob())
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `${songTitle}.mp3`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        })
        .catch(error => {
            console.error('Download failed:', error);
            // Show download error notification
            showNotification('Download failed. Please try again.', 'error');
        });
}

// Notification system
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <span class="material-icons-outlined">${type === 'error' ? 'error_outline' : 'info_outline'}</span>
        <span class="notification-message">${message}</span>
    `;

    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => notification.classList.add('show'), 100);

    // Remove after delay
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function triggerFileInput() {
    document.getElementById('fileInput').click();
}

// WebSocket reconnection logic
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
const reconnectDelay = 1000; // Start with 1 second delay

function handleWebSocketClose() {
    if (reconnectAttempts < maxReconnectAttempts) {
        const delay = reconnectDelay * Math.pow(2, reconnectAttempts);
        setTimeout(() => {
            reconnectWebSocket();
            reconnectAttempts++;
        }, delay);
    } else {
        showNotification('Connection lost. Please refresh the page.', 'error');
    }
}

function reconnectWebSocket() {
    const newSocket = new WebSocket(
        `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/songs/`
    );

    newSocket.onopen = function () {
        songsSocket = newSocket;
        reconnectAttempts = 0;
        showNotification('Connection restored!', 'info');

        // Re-register device
        songsSocket.send(JSON.stringify({
            type: 'device_connect',
            device_id: deviceId
        }));
    };

    newSocket.onclose = handleWebSocketClose;
    newSocket.onmessage = songsSocket.onmessage;
}

// Add WebSocket close handler
songsSocket.onclose = handleWebSocketClose;


class PullToRefresh {
    constructor(element) {
        this.element = element;
        this.touchStart = null;
        this.touchingElement = false;
        this.setupIndicator();
        this.bindEvents();
    }

    setupIndicator() {
        // Wrap content in container
        const wrapper = document.createElement('div');
        wrapper.className = 'pull-to-refresh';
        this.element.parentNode.insertBefore(wrapper, this.element);
        wrapper.appendChild(this.element);

        // Add refresh indicator
        this.indicator = document.createElement('div');
        this.indicator.className = 'refresh-indicator';
        this.indicator.innerHTML = `
            <div class="refresh-spinner"></div>
            <span class="refresh-text">Pull to refresh</span>
        `;
        wrapper.prepend(this.indicator);

        this.wrapper = wrapper;
    }

    bindEvents() {
        this.element.addEventListener('touchstart', this.onTouchStart.bind(this));
        this.element.addEventListener('touchmove', this.onTouchMove.bind(this));
        this.element.addEventListener('touchend', this.onTouchEnd.bind(this));
    }

    onTouchStart(e) {
        if (this.element.scrollTop <= 0) {
            this.touchStart = e.touches[0].clientY;
            this.touchingElement = true;
        }
    }

    onTouchMove(e) {
        if (!this.touchingElement) return;

        const touch = e.touches[0];
        const distance = touch.clientY - this.touchStart;

        if (distance > 0 && this.element.scrollTop <= 0) {
            e.preventDefault();
            this.indicator.classList.add('visible');

            if (distance > 70) {
                this.indicator.querySelector('.refresh-text').textContent = 'Release to refresh';
            } else {
                this.indicator.querySelector('.refresh-text').textContent = 'Pull to refresh';
            }
        }
    }

    onTouchEnd(e) {
        if (!this.touchingElement) return;

        const touch = e.changedTouches[0];
        const distance = touch.clientY - this.touchStart;

        if (distance > 70) {
            this.refresh();
        } else {
            this.reset();
        }

        this.touchingElement = false;
        this.touchStart = null;
    }

    async refresh() {
        this.indicator.classList.add('refreshing');
        this.indicator.querySelector('.refresh-text').textContent = 'Refreshing...';

        // Reload the page
        window.location.reload();

        // After reload, activate devices tab
        const deviceTab = document.querySelector('[data-tab="devices"]');
        if (deviceTab) {
            const tabEvent = new Event('click');
            deviceTab.dispatchEvent(tabEvent);
        }
    }

    reset() {
        this.indicator.classList.remove('visible', 'refreshing');
    }
}

function attachDeleteListeners() {
    document.querySelectorAll('.delete-device').forEach(button => {
        button.addEventListener('click', async function (e) {
            const deviceId = this.dataset.deviceId;

            if (confirm('Are you sure you want to remove this device?')) {
                try {
                    const response = await fetch(`/delete-device/${deviceId}/`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    });

                    if (response.ok) {
                        alert('Device Deleted Successfully!');
                    } else {
                        const data = await response.json();
                        alert(data.error || 'Failed to delete device');
                    }
                } catch (error) {
                    console.error('Error:', error);
                    alert('Failed to delete device. Please try again.');
                }
            }
        });
    });
}

// Initialize pull-to-refresh
document.addEventListener('DOMContentLoaded', () => {
    attachDeleteListeners();
    const devicesSection = document.getElementById('devices');
    if (devicesSection) {
        new PullToRefresh(devicesSection);
    }

    // Check if we need to activate devices tab (after refresh)
    if (sessionStorage.getItem('activateDevicesTab')) {
        sessionStorage.removeItem('activateDevicesTab');
        const deviceTab = document.querySelector('[data-tab="devices"]');
        if (deviceTab) {
            setTimeout(() => {
                deviceTab.click();
            }, 100);
        }
    }
});

// Store flag before refresh
window.addEventListener('beforeunload', () => {
    sessionStorage.setItem('activateDevicesTab', 'true');
});


// Add this to your dashboard.js file
function switchNavigation(tab) {
    // Hide all sections
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });

    // Remove active class from all nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });

    // Show selected section and activate nav item
    if (tab === 'home') {
        document.getElementById('songs').classList.add('active');
    } else if (tab === 'socials') {
        document.getElementById('socials').classList.add('active');
    } else if (tab === 'cloud') {
        document.getElementById('mycloud').classList.add('active');
    }

    // Add active class to clicked nav item
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
}

// Initialize navigation
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        const tab = item.getAttribute('data-tab');
        switchNavigation(tab);
    });
});

// Music player controller
const MusicPlayer = {
    init() {
        this.player = document.querySelector('.player-container');
        this.miniPlayer = this.createMiniPlayer();
        this.isVisible = false;
        this.setupEventListeners();
    },

    createMiniPlayer() {
        const miniPlayer = document.createElement('div');
        miniPlayer.className = 'mini-player';
        miniPlayer.innerHTML = `
       
        <div class="toggle-arrow">
            <i class="material-icons">expand_more</i>
        </div>
        <div class="progress-container">
            <div class="progress-bar"></div>
        </div>
        <img src="/api/placeholder/48/48" alt="Current Track">
        <div class="song-info">
            <div class="title">Track Title</div>
            <div class="artist">Artist Name</div>
        </div>
        <button class="control-button play-mini">
            <i class="material-icons">play_arrow</i>
        </button>
        <button class="control-button next-mini">
            <i class="material-icons">skip_next</i>
        </button>
    `;

        document.body.appendChild(miniPlayer);

        // Add toggle functionality
        const toggleArrow = miniPlayer.querySelector('.toggle-arrow');
        let isVisible = true;

        toggleArrow.addEventListener('click', () => {
            isVisible = !isVisible;
            if (isVisible) {
                miniPlayer.classList.remove('hidden');
            } else {
                miniPlayer.classList.add('hidden');
            }
        });

        // Progress bar functionality
        const progressBar = miniPlayer.querySelector('.progress-bar');
        const progressContainer = miniPlayer.querySelector('.progress-container');
        let isDragging = false;

        const updateProgress = (percent) => {
            progressBar.style.transform = `scaleX(${percent})`;
        };

        progressContainer.addEventListener('mousedown', (e) => {
            isDragging = true;
            const rect = progressContainer.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            updateProgress(percent);
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const rect = progressContainer.getBoundingClientRect();
            const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            updateProgress(percent);
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });

        // Play button animation
        const playButton = miniPlayer.querySelector('.play-mini');
        playButton.addEventListener('click', () => {
            const icon = playButton.querySelector('i');
            if (icon.textContent === 'play_arrow') {
                icon.textContent = 'pause';
                playButton.classList.add('active');
            } else {
                icon.textContent = 'play_arrow';
                playButton.classList.remove('active');
            }
        });

        // Methods to show/hide mini player
        miniPlayer.show = () => {
            isVisible = true;
            miniPlayer.classList.remove('hidden');
        };

        miniPlayer.hide = () => {
            isVisible = false;
            miniPlayer.classList.add('hidden');
        };

        return miniPlayer;
    },

    setupEventListeners() {
        // Handle player collapse
        const backButton = this.player.querySelector('.back-button');
        backButton.onclick = () => this.collapsePlayer();

        // Handle scroll
        let lastScroll = 0;
        window.addEventListener('scroll', () => {
            const currentScroll = window.pageYOffset;
            if (currentScroll > lastScroll && this.isVisible) {
                this.collapsePlayer();
            }
            lastScroll = currentScroll;
        });

        // Mini player controls
        // Assuming you have references to miniPlayer and actionButton
        this.miniPlayer.onclick = (event) => {
            // Check if the target is the actionButton
            if (event.target === this.actionButton) {
                // Do nothing or handle actionButton-specific behavior
                return;
            }
            // If it's not the actionButton, expand the player
            this.expandPlayer();
        };

    },

    async loadAndPlaySong(songId) {
        try {

            const response = await fetch(`/fetch-song/${songId}`);
            const songData = await response.json();
            const track = {
                title: songData.title,
                artist: songData.artist,
                thumbnail: songData.albumArt,
                song_url: songData.song_url
            };
            this.updatePlayerContent(songData);


            // Show player with animation
            this.showPlayer();

            // Update mini player
            this.updateMiniPlayer(songData);
            player.loadTrack(track);
            player.play();

        } catch (error) {
            console.error('Error loading song:', error);
        }
    },

    updatePlayerContent(songData) {


        this.player.querySelector('.track-title').textContent = songData.title;
        this.player.querySelector('.track-artist').textContent = songData.artist;
        this.player.querySelector('.album-art img').src = songData.albumArt;


    },

    updateMiniPlayer(songData) {
        this.miniPlayer.querySelector('img').src = songData.albumArt;
        this.miniPlayer.querySelector('.title').textContent = songData.title;
        this.miniPlayer.querySelector('.artist').textContent = songData.artist;
    },

    showPlayer() {
        this.player.style.display = 'block';
        this.player.style.transform = 'translateY(0)';
        this.miniPlayer.style.transform = 'translateY(100%)';
        this.isVisible = true;
    },

    collapsePlayer() {
        this.player.style.transform = 'translateY(100%)';
        this.miniPlayer.style.transform = 'translateY(0)';
        this.isVisible = false;
    },

    expandPlayer() {
        this.showPlayer();
    }
};
MusicPlayer.onSongEnd = function () {
    document.querySelectorAll('.song-card').forEach(card => {
        card.stopPlaying();
    });
};

// Initialize the music player when the document is ready
document.addEventListener('DOMContentLoaded', () => {
    MusicPlayer.init();
});