const socket = io();
let myUsername = "", myRoom = "", typingTimeout, currentReply = null;
let mediaRecorder, audioChunks = [];

// Elementler
const elements = {
    loginScreen: document.getElementById('login-screen'),
    usernameInput: document.getElementById('username-input'),
    roomInput: document.getElementById('room-input'),
    joinBtn: document.getElementById('join-btn'),
    appContainer: document.getElementById('app-container'),
    chatArea: document.getElementById('chat-area'),
    chatForm: document.getElementById('chat-form'),
    messageInput: document.getElementById('message-input'),
    fileInput: document.getElementById('file-input'),
    roomDisplay: document.getElementById('room-display'),
    statusText: document.getElementById('status-text'),
    notifSound: document.getElementById('notification-sound'),
    replyPreview: document.getElementById('reply-preview'),
    replyUser: document.getElementById('reply-user'),
    replyText: document.getElementById('reply-text'),
    micBtn: document.getElementById('mic-btn'),
    sendBtn: document.getElementById('send-btn'),
    emojiBtn: document.getElementById('emoji-btn'),
    locationBtn: document.getElementById('location-btn')
};

// --- EMOJI PANELİ ---
const picker = new EmojiButton();
picker.on('emoji', selection => {
    elements.messageInput.value += selection.emoji;
    checkInput(); // Buton durumunu guncelle
});
elements.emojiBtn.addEventListener('click', () => picker.togglePicker(elements.emojiBtn));

// --- GİRİŞ ---
elements.joinBtn.addEventListener('click', () => {
    if (elements.usernameInput.value && elements.roomInput.value) {
        myUsername = elements.usernameInput.value.trim();
        myRoom = elements.roomInput.value.trim();
        socket.emit('join room', { username: myUsername, room: myRoom });
        elements.roomDisplay.textContent = myRoom;
        elements.loginScreen.style.display = 'none';
        elements.appContainer.style.display = 'flex';
    } else { alert("İsim ve oda zorunlu!"); }
});

// --- MESAJ YÖNETİMİ ---
function checkInput() {
    if (elements.messageInput.value.trim().length > 0) {
        elements.micBtn.style.display = 'none';
        elements.sendBtn.style.display = 'block';
    } else {
        elements.micBtn.style.display = 'block';
        elements.sendBtn.style.display = 'none';
    }
}
elements.messageInput.addEventListener('input', () => {
    checkInput();
    socket.emit('typing', { room: myRoom, username: myUsername });
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => socket.emit('stop typing', { room: myRoom }), 2000);
});

// --- YANITLAMA ---
window.cancelReply = function() {
    currentReply = null;
    elements.replyPreview.style.display = 'none';
};

function appendMessage(data) {
    const existingMsg = document.getElementById('msg-' + data._id);
    let contentHtml = '';
    let deletedClass = '';

    if (data.isDeleted) {
        contentHtml = '<div class="deleted-msg"><i class="fas fa-ban"></i> Bu mesaj silindi</div>';
        deletedClass = 'deleted';
    } else {
        if (data.replyTo && data.replyTo.username) {
            contentHtml += `<div class="reply-bubble"><strong>${data.replyTo.username}</strong><span>${data.replyTo.text || 'Medya'}</span></div>`;
        }
        if (data.image) contentHtml += `<img src="${data.image}" class="msg-image" onclick="window.open(this.src)">`;
        if (data.audio) contentHtml += `<audio controls src="${data.audio}"></audio>`;
        if (data.location) contentHtml += `<a href="${data.location}" target="_blank" class="location-link"><i class="fas fa-map-marker-alt"></i> Konumu Haritada Gör</a>`;
        if (data.text) contentHtml += `<span>${data.text}</span>`;
    }

    if (existingMsg) {
        existingMsg.querySelector('.bubble-content').innerHTML = contentHtml;
        return;
    }

    const isOwn = data.username === myUsername;
    const time = new Date(data.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const row = document.createElement('div');
    row.className = 'message-row ' + (isOwn ? 'my-message' : 'other-message');
    row.id = 'msg-' + data._id;

    let nameHtml = isOwn ? '' : `<span class="sender-name">${data.username}</span>`;
    let tickHtml = isOwn ? '<i class="fas fa-check-double tick"></i>' : '';

    const bubble = document.createElement('div');
    bubble.className = 'bubble ' + deletedClass;

    if (!data.isDeleted) {
        bubble.ondblclick = () => {
            currentReply = { username: data.username, text: data.text || 'Medya/Konum' };
            elements.replyUser.innerText = currentReply.username;
            elements.replyText.innerText = currentReply.text;
            elements.replyPreview.style.display = 'flex';
            elements.messageInput.focus();
        };
        if (isOwn) {
            bubble.oncontextmenu = (e) => {
                e.preventDefault();
                if (confirm('Silmek istiyor musun?')) socket.emit('delete message', { msgId: data._id, room: myRoom });
            };
        }
    }

    bubble.innerHTML = `${nameHtml}<div class="bubble-content">${contentHtml}</div><div class="meta"><span>${time}</span>${tickHtml}</div>`;
    elements.chatArea.appendChild(row);
    elements.chatArea.scrollTop = elements.chatArea.scrollHeight;
}

// --- GÖNDERME ---
elements.chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (elements.messageInput.value) {
        const data = { 
            room: myRoom, username: myUsername, text: elements.messageInput.value, 
            image: null, audio: null, location: null, replyTo: currentReply 
        };
        socket.emit('chat message', data);
        elements.messageInput.value = '';
        checkInput();
        cancelReply();
        socket.emit('stop typing', { room: myRoom });
    }
});

// --- KONUM ATMA ---
elements.locationBtn.addEventListener('click', () => {
    if (!navigator.geolocation) return alert("Tarayıcınız konumu desteklemiyor");
    elements.locationBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    navigator.geolocation.getCurrentPosition(position => {
        const link = `https://www.google.com/maps?q=${position.coords.latitude},${position.coords.longitude}`;
        socket.emit('chat message', { room: myRoom, username: myUsername, location: link, text: null });
        elements.locationBtn.innerHTML = '<i class="fas fa-map-marker-alt"></i>';
    }, () => {
        alert("Konum alınamadı.");
        elements.locationBtn.innerHTML = '<i class="fas fa-map-marker-alt"></i>';
    });
});

// --- SES KAYIT ---
elements.micBtn.addEventListener('mousedown', startRecording);
elements.micBtn.addEventListener('mouseup', stopRecording);
elements.micBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startRecording(); });
elements.micBtn.addEventListener('touchend', (e) => { e.preventDefault(); stopRecording(); });

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.addEventListener("dataavailable", event => audioChunks.push(event.data));
        mediaRecorder.addEventListener("stop", () => {
            const reader = new FileReader();
            reader.readAsDataURL(new Blob(audioChunks, { type: 'audio/webm' }));
            reader.onloadend = () => {
                socket.emit('chat message', { room: myRoom, username: myUsername, audio: reader.result });
            };
            stream.getTracks().forEach(track => track.stop());
        });
        mediaRecorder.start();
        elements.micBtn.classList.add('recording');
    } catch (err) { alert("Mikrofon hatası!"); }
}
function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
        elements.micBtn.classList.remove('recording');
    }
}

// --- DOSYA ---
elements.fileInput.addEventListener('change', function() {
    if (this.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => socket.emit('chat message', { room: myRoom, username: myUsername, image: e.target.result });
        reader.readAsDataURL(this.files[0]);
        this.value = '';
    }
});

// --- SOCKET OLAYLARI ---
socket.on('chat message', (data) => {
    appendMessage(data);
    if (data.username !== myUsername && !data.isDeleted) elements.notifSound.play().catch(()=>{});
});
socket.on('load old messages', (msgs) => { elements.chatArea.innerHTML = ''; msgs.forEach(msg => appendMessage(msg)); });
socket.on('message updated', (data) => appendMessage(data));
socket.on('room data', ({ count }) => { elements.statusText.textContent = count + " kişi odada"; });
socket.on('typing', (data) => { if(data.username !== myUsername) { elements.statusText.textContent = data.username + " yazıyor..."; elements.statusText.classList.add('typing-indicator'); } });
socket.on('stop typing', () => { elements.statusText.classList.remove('typing-indicator'); socket.emit('get room count', myRoom); });

// --- PWA SERVICE WORKER (Basit) ---
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
}