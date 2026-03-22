/**
 * app.js - NINE RADIO
 * Logic for station management, persistence, audio playback, and UI.
 */

// --- GLOBAL STATE ---
let state = {
    stations: [],
    currentStationId: null,
    currentTrackIndex: -1,
    currentVisualIndex: -1,
    isAdmin: false,
    adminPassword: 'radio',
    driveApiKey: '',
    channelLogo: 'https://picsum.photos/seed/nineradio/100/100',
    visualOption: 'web', // 'web', 'local', 'mix'
    isShuffle: true,
    isPlaying: false,
    quickMix: null,
    tracks: [],
    visuals: []
};

let currentAudioUrl = null;
let currentVisualUrl = null;

// --- DB INITIALIZATION (IndexedDB) ---
let db;
const DB_NAME = 'NineRadioDB';
const DB_VERSION = 1;

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('media')) {
                db.createObjectStore('media', { keyPath: 'id' });
            }
        };
        request.onsuccess = (e) => {
            db = e.target.result;
            resolve(db);
        };
        request.onerror = (e) => reject(e);
    });
}

async function saveMediaToDB(id, blob) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['media'], 'readwrite');
        const store = transaction.objectStore('media');
        store.put({ id, blob });
        transaction.oncomplete = () => resolve();
        transaction.onerror = (e) => reject(e);
    });
}

async function getMediaFromDB(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['media'], 'readonly');
        const store = transaction.objectStore('media');
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result ? request.result.blob : null);
        request.onerror = (e) => reject(e);
    });
}

async function deleteMediaFromDB(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['media'], 'readwrite');
        const store = transaction.objectStore('media');
        store.delete(id);
        transaction.oncomplete = () => resolve();
        transaction.onerror = (e) => reject(e);
    });
}

// --- CORE LOGIC ---

async function init() {
    await initDB();
    loadState();
    updateUI();
    startClocks();
    updateTickers();
    renderStations();
    checkStorage();
}

function loadState() {
    const saved = localStorage.getItem('nine_radio_state');
    if (saved) {
        const parsed = JSON.parse(saved);
        state = { ...state, ...parsed };
    }
    // Apply initial settings
    document.getElementById('channel-logo').src = state.channelLogo;
}

function saveState() {
    const toSave = { ...state };
    delete toSave.tracks;
    delete toSave.visuals;
    delete toSave.quickMix;
    localStorage.setItem('nine_radio_state', JSON.stringify(toSave));
}

function startClocks() {
    setInterval(() => {
        const now = new Date();
        document.getElementById('date-display').textContent = now.toLocaleDateString('fr-FR');
        document.getElementById('time-display').textContent = now.toLocaleTimeString('fr-FR');
    }, 1000);
}

function updateTickers() {
    // Mock news for now
    const news = [
        "NINE RADIO : LA RADIO INTELLIGENTE EN FRANÇAIS",
        "ACTUALITÉ : LE NOUVEAU MODE ADMIN EST DISPONIBLE",
        "MÉTÉO : SOLEIL RADIEUX SUR TOUTE LA RÉGION",
        "SPORT : VICTOIRE HISTORIQUE POUR L'ÉQUIPE LOCALE",
        "ÉCONOMIE : LES MARCHÉS SONT STABLES CE MATIN"
    ];
    document.getElementById('news-ticker').textContent = news.join(' • ') + ' • ';
    
    const finance = [
        "CAC 40 : 7,450.20 (+0.5%)",
        "NASDAQ : 16,200.45 (+1.1%)",
        "BITCOIN : $65,420",
        "EUR/MAD : 10.85",
        "OR : $2,150/oz"
    ];
    document.getElementById('finance-ticker').textContent = finance.join(' • ') + ' • ';
}

function checkStorage() {
    if (navigator.storage && navigator.storage.estimate) {
        navigator.storage.estimate().then(estimate => {
            const used = (estimate.usage / (1024 * 1024)).toFixed(1);
            const total = (estimate.quota / (1024 * 1024 * 1024)).toFixed(1);
            document.getElementById('storage-info').textContent = `Stockage: ${used}MB / ${total}GB`;
        });
    }
}

// --- UI RENDERING ---

function renderStations() {
    const list = document.getElementById('station-list');
    list.innerHTML = '';
    
    state.stations.forEach(station => {
        const item = document.createElement('div');
        item.className = `station-item ${state.currentStationId === station.id ? 'active' : ''}`;
        item.onclick = () => selectStation(station.id);
        
        const icon = document.createElement('img');
        icon.className = 'station-icon';
        icon.src = station.icon || `https://picsum.photos/seed/${station.id}/40/40`;
        
        const name = document.createElement('div');
        name.textContent = station.name;
        
        item.appendChild(icon);
        item.appendChild(name);
        list.appendChild(item);
    });
}

function updateUI() {
    if (state.isAdmin) {
        document.body.classList.add('admin-mode');
        document.getElementById('admin-toggle').textContent = 'Quitter Admin';
    } else {
        document.body.classList.remove('admin-mode');
        document.getElementById('admin-toggle').textContent = 'Mode Admin';
    }
}

// --- STATION MANAGEMENT ---

let currentModalType = '';

window.openStationModal = function(type) {
    currentModalType = type;
    document.getElementById('modal-station').style.display = 'flex';
    document.getElementById('modal-title').textContent = `Nouvelle Station ${type.charAt(0).toUpperCase() + type.slice(1)}`;
    
    document.getElementById('local-fields').style.display = (type === 'local') ? 'block' : 'none';
    document.getElementById('url-fields').style.display = (type !== 'local') ? 'block' : 'none';
    
    // Clear inputs
    document.getElementById('station-name-input').value = '';
    document.getElementById('station-url-input').value = '';
    document.getElementById('station-icon-input').value = '';
}

window.closeModal = function() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
}

window.saveStation = async function() {
    const name = document.getElementById('station-name-input').value;
    const icon = document.getElementById('station-icon-input').value;
    const url = document.getElementById('station-url-input').value;
    
    if (!name) return alert('Nom requis');
    
    const stationId = 'st_' + Date.now();
    const newStation = {
        id: stationId,
        name,
        type: currentModalType,
        icon,
        url
    };
    
    if (currentModalType === 'local') {
        const audioFiles = document.getElementById('audio-files-input').files;
        const visualFiles = document.getElementById('visual-files-input').files;
        
        if (audioFiles.length === 0) return alert('Sélectionnez au moins un fichier audio');
        
        // Save files to IndexedDB
        const trackIds = [];
        for (let i = 0; i < audioFiles.length; i++) {
            const file = audioFiles[i];
            const id = `${stationId}_track_${i}`;
            await saveMediaToDB(id, file);
            trackIds.push({ id, name: file.name });
        }
        newStation.trackIds = trackIds;
        
        const visualIds = [];
        for (let i = 0; i < visualFiles.length; i++) {
            const file = visualFiles[i];
            const id = `${stationId}_visual_${i}`;
            await saveMediaToDB(id, file);
            visualIds.push({ id, name: file.name, type: file.type });
        }
        newStation.visualIds = visualIds;
    }
    
    state.stations.push(newStation);
    saveState();
    renderStations();
    closeModal();
    checkStorage();
}

window.selectStation = async function(id) {
    state.currentStationId = id;
    const station = state.stations.find(s => s.id === id);
    if (!station) return;
    
    document.getElementById('overlay-station-name').textContent = station.name;
    renderStations();
    
    // Reset player
    state.tracks = [];
    state.visuals = [];
    state.currentTrackIndex = -1;
    state.currentVisualIndex = -1;
    
    document.getElementById('spotify-embed-container').style.display = 'none';
    document.getElementById('soundcloud-embed-container').style.display = 'none';
    
    if (station.type === 'local') {
        state.tracks = station.trackIds || [];
        state.visuals = station.visualIds || [];
        document.getElementById('badge-mode').textContent = state.visuals.some(v => v.type.startsWith('video')) ? 'TV' : 'Radio';
        nextTrack();
    } else if (station.type === 'spotify') {
        setupSpotify(station.url);
    } else if (station.type === 'soundcloud') {
        setupSoundCloud(station.url);
    }
}

function setupSpotify(url) {
    const container = document.getElementById('spotify-embed-container');
    container.style.display = 'block';
    let id = url.split('/').pop().split('?')[0];
    container.innerHTML = `<iframe src="https://open.spotify.com/embed/playlist/${id}" width="100%" height="100%" frameborder="0" allowtransparency="true" allow="encrypted-media"></iframe>`;
    document.getElementById('badge-mode').textContent = 'Spotify';
}

function setupSoundCloud(url) {
    const container = document.getElementById('soundcloud-embed-container');
    container.style.display = 'block';
    container.innerHTML = `<iframe width="100%" height="100%" scrolling="no" frameborder="no" allow="autoplay" src="https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%23ff5500&auto_play=false&hide_related=false&show_comments=true&show_user=true&show_reposts=false&show_teaser=true&visual=true"></iframe>`;
    document.getElementById('badge-mode').textContent = 'SoundCloud';
}

// --- PLAYER LOGIC ---

const audio = document.getElementById('main-audio');
const playBtn = document.getElementById('play-btn');

window.nextTrack = async function() {
    if (state.tracks.length === 0) return;
    
    if (state.isShuffle) {
        state.currentTrackIndex = Math.floor(Math.random() * state.tracks.length);
    } else {
        state.currentTrackIndex = (state.currentTrackIndex + 1) % state.tracks.length;
    }
    
    const track = state.tracks[state.currentTrackIndex];
    const blob = await getMediaFromDB(track.id);
    if (blob) {
        if (currentAudioUrl) URL.revokeObjectURL(currentAudioUrl);
        currentAudioUrl = URL.createObjectURL(blob);
        audio.src = currentAudioUrl;
        audio.play();
        state.isPlaying = true;
        playBtn.textContent = '⏸️';
        document.getElementById('overlay-track-title').textContent = track.name.replace(/\.[^/.]+$/, "");
        document.getElementById('status-line').textContent = `Lecture: ${track.name}`;
        
        updateVisual();
    }
}

window.togglePlay = function() {
    if (audio.paused) {
        audio.play();
        state.isPlaying = true;
        playBtn.textContent = '⏸️';
    } else {
        audio.pause();
        state.isPlaying = false;
        playBtn.textContent = '▶️';
    }
}

window.toggleShuffle = function() {
    state.isShuffle = !state.isShuffle;
    document.getElementById('shuffle-btn').style.color = state.isShuffle ? 'var(--primary-red)' : 'white';
}

audio.onended = () => nextTrack();

audio.ontimeupdate = () => {
    const bar = document.getElementById('seek-bar');
    if (audio.duration) {
        bar.value = (audio.currentTime / audio.duration) * 100;
    }
};

document.getElementById('seek-bar').oninput = (e) => {
    if (audio.duration) {
        audio.currentTime = (e.target.value / 100) * audio.duration;
    }
};

// --- VISUAL LOGIC ---

async function updateVisual() {
    const trackTitle = document.getElementById('overlay-track-title').textContent;
    
    if (state.visualOption === 'web') {
        await fetchWebImage(trackTitle);
    } else if (state.visualOption === 'local' && state.visuals.length > 0) {
        await showLocalVisual();
    } else if (state.visualOption === 'mix') {
        if (Math.random() > 0.5) {
            await fetchWebImage(trackTitle);
        } else {
            await showLocalVisual();
        }
    }
}

async function fetchWebImage(query) {
    const img = document.getElementById('visual-img');
    const video = document.getElementById('visual-video');
    
    const cleanQuery = query.split('(')[0].split('feat')[0].split('ft')[0].trim();
    
    try {
        const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(cleanQuery)}&gsrlimit=1&prop=imageinfo&iiprop=url&format=json&origin=*`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.query && data.query.pages) {
            const pages = data.query.pages;
            const firstPage = pages[Object.keys(pages)[0]];
            if (firstPage.imageinfo && firstPage.imageinfo[0]) {
                img.src = firstPage.imageinfo[0].url;
                img.style.display = 'block';
                video.style.display = 'none';
                return;
            }
        }
    } catch (e) {
        console.error("Web image fetch error", e);
    }
    
    if (state.visuals.length > 0) {
        showLocalVisual();
    } else {
        img.src = `https://picsum.photos/seed/${encodeURIComponent(cleanQuery)}/800/600`;
        img.style.display = 'block';
        video.style.display = 'none';
    }
}

async function showLocalVisual() {
    if (state.visuals.length === 0) return;
    
    state.currentVisualIndex = (state.currentVisualIndex + 1) % state.visuals.length;
    const visual = state.visuals[state.currentVisualIndex];
    const blob = await getMediaFromDB(visual.id);
    
    const img = document.getElementById('visual-img');
    const video = document.getElementById('visual-video');
    
    if (blob) {
        if (currentVisualUrl) URL.revokeObjectURL(currentVisualUrl);
        currentVisualUrl = URL.createObjectURL(blob);
        if (visual.type.startsWith('video')) {
            video.src = currentVisualUrl;
            video.style.display = 'block';
            img.style.display = 'none';
            video.play();
        } else {
            img.src = currentVisualUrl;
            img.style.display = 'block';
            video.style.display = 'none';
        }
    }
}

window.nextVisual = function() { updateVisual(); }
window.prevVisual = function() { 
    state.currentVisualIndex = (state.currentVisualIndex - 2 + state.visuals.length) % state.visuals.length;
    updateVisual(); 
}

// --- ADMIN & SETTINGS ---

window.toggleAdminMode = function() {
    if (state.isAdmin) {
        state.isAdmin = false;
        updateUI();
    } else {
        document.getElementById('modal-admin-login').style.display = 'flex';
    }
}

window.verifyAdmin = function() {
    const pass = document.getElementById('admin-password-input').value;
    if (pass === state.adminPassword) {
        state.isAdmin = true;
        updateUI();
        closeModal();
    } else {
        alert('Mot de passe incorrect');
    }
}

window.openSettingsModal = function() {
    document.getElementById('modal-settings').style.display = 'flex';
    document.getElementById('drive-api-key-input').value = state.driveApiKey;
    document.getElementById('channel-logo-input').value = state.channelLogo;
    document.getElementById('visual-option-input').value = state.visualOption;
}

window.saveSettings = function() {
    state.driveApiKey = document.getElementById('drive-api-key-input').value;
    state.channelLogo = document.getElementById('channel-logo-input').value;
    state.visualOption = document.getElementById('visual-option-input').value;
    
    const newPass = document.getElementById('new-admin-password-input').value;
    if (newPass) state.adminPassword = newPass;
    
    document.getElementById('channel-logo').src = state.channelLogo;
    saveState();
    closeModal();
}

// --- QUICK MIX ---

window.triggerQuickMix = async function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.webkitdirectory = true;
    
    input.onchange = async (e) => {
        const files = e.target.files;
        if (files.length === 0) return;
        
        state.tracks = [];
        const stationId = 'quick_mix';
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (file.type.startsWith('audio')) {
                const id = `${stationId}_track_${i}`;
                await saveMediaToDB(id, file);
                state.tracks.push({ id, name: file.name });
            }
        }
        
        document.getElementById('overlay-station-name').textContent = 'Mix Rapide';
        document.getElementById('save-mix-btn').style.display = 'block';
        nextTrack();
    };
    input.click();
}

window.saveQuickMix = function() {
    const name = prompt("Nom de la station pour ce mix :", "Mon Mix");
    if (!name) return;
    
    const stationId = 'st_' + Date.now();
    const newStation = {
        id: stationId,
        name,
        type: 'local',
        trackIds: state.tracks.map((t, i) => ({ ...t, id: `${stationId}_track_${i}` })),
        visualIds: []
    };
    
    state.tracks.forEach(async (t, i) => {
        const blob = await getMediaFromDB(t.id);
        await saveMediaToDB(`${stationId}_track_${i}`, blob);
    });
    
    state.stations.push(newStation);
    saveState();
    renderStations();
    document.getElementById('save-mix-btn').style.display = 'none';
    alert('Mix enregistré !');
}

// --- IMPORT / EXPORT ---

window.exportConfig = function() {
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nine_radio_config_${Date.now()}.json`;
    a.click();
}

window.triggerImport = function() {
    document.getElementById('json-import-input').click();
}

window.handleImport = function(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const imported = JSON.parse(e.target.result);
            if (confirm("Voulez-vous fusionner (OK) ou remplacer (Annuler) les stations existantes ?")) {
                state.stations = [...state.stations, ...imported.stations];
            } else {
                state = { ...state, ...imported };
            }
            saveState();
            location.reload();
        } catch (err) {
            alert("Erreur lors de l'importation du JSON");
        }
    };
    reader.readAsText(file);
}

window.toggleFullscreen = function() {
    const win = document.getElementById('visual-window');
    if (!document.fullscreenElement) {
        win.requestFullscreen().catch(err => {
            alert(`Erreur plein écran: ${err.message}`);
        });
    } else {
        document.exitFullscreen();
    }
}

// --- INITIALIZE ---
init();
