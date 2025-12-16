const socket = io();
let myUsername = "";
let myRoom = "";
let typingTimeout;

const loginScreen = document.getElementById('login-screen');
const usernameInput = document.getElementById('username-input');
const roomInput = document.getElementById('room-input');
const joinBtn = document.getElementById('join-btn');
const appContainer = document.getElementById('app-container');
const chatArea = document.getElementById('chat-area');
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
const fileInput = document.getElementById('file-input');
const roomDisplay = document.getElementById('room-display');
const statusText = document.getElementById('status-text');
const notifSound = document.getElementById('notification-sound');

// Giris
joinBtn.addEventListener('click', () => {
    if (usernameInput.value && roomInput.value) {
        myUsername = usernameInput.value.trim();
        myRoom = roomInput.value.trim();
        socket.emit('join room', { username: myUsername, room: myRoom });
        roomDisplay.textContent = "(" + myRoom + ")";
        loginScreen.style.display = 'none';
        appContainer.style.display = 'flex';
    } else { alert("Isim ve oda zorunlu!"); }
});

// Mesaj Ekleme
function appendMessage(data) {
    const existingMsg = document.getElementById('msg-' + data._id);
    let contentHtml = '';
    let deletedClass = '';

    if (data.isDeleted) {
        contentHtml = '<div class="deleted-msg"><i class="fas fa-ban"></i> Bu mesaj silindi</div>';
        deletedClass = 'deleted';
    } else {
        if (data.image) contentHtml += '<img src="' + data.image + '" class="msg-image" onclick="window.open(this.src)">';
        if (data.text) contentHtml += '<span>' + data.text + '</span>';
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

    let nameHtml = isOwn ? '' : '<span class="sender-name">' + data.username + '</span>';
    let tickHtml = isOwn ? '<i class="fas fa-check-double tick"></i>' : '';

    const bubble = document.createElement('div');
    bubble.className = 'bubble ' + deletedClass;
    
    if (isOwn && !data.isDeleted) {
        bubble.ondblclick = () => {
            if (confirm('Bu mesaji herkesden silmek istiyor musun?')) {
                socket.emit('delete message', { msgId: data._id, room: myRoom });
            }
        };
        bubble.title = "Silmek icin cift tikla";
    }

    bubble.innerHTML = nameHtml + '<div class="bubble-content">' + contentHtml + '</div>' + '<div class="meta"><span>' + time + '</span>' + tickHtml + '</div>';
    
    row.appendChild(bubble);
    chatArea.appendChild(row);
    chatArea.scrollTop = chatArea.scrollHeight;
}

chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (messageInput.value) {
        const data = { room: myRoom, username: myUsername, text: messageInput.value, image: null };
        socket.emit('chat message', data);
        messageInput.value = '';
        socket.emit('stop typing', { room: myRoom });
    }
});

fileInput.addEventListener('change', function() {
    const file = this.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(evt) {
            const data = { room: myRoom, username: myUsername, text: null, image: evt.target.result };
            socket.emit('chat message', data);
        };
        reader.readAsDataURL(file);
        this.value = '';
    }
});

messageInput.addEventListener('input', () => {
    socket.emit('typing', { room: myRoom, username: myUsername });
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        socket.emit('stop typing', { room: myRoom });
    }, 2000);
});

socket.on('chat message', (data) => {
    appendMessage(data);
    if (data.username !== myUsername && !data.isDeleted) {
        notifSound.play().catch(e => {});
    }
});

socket.on('load old messages', (msgs) => {
    chatArea.innerHTML = '';
    msgs.forEach(msg => appendMessage(msg));
});

socket.on('message updated', (data) => appendMessage(data));
socket.on('room data', ({ count }) => { statusText.textContent = count + " kisi odada"; });
socket.on('typing', (data) => {
    if (data.username !== myUsername) {
        statusText.textContent = data.username + " yaziyor...";
        statusText.classList.add('typing-indicator');
    }
});
socket.on('stop typing', () => {
    statusText.classList.remove('typing-indicator');
    socket.emit('get room count', myRoom);
});