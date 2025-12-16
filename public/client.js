const socket = io();
let myUsername = "", myRoom = "", amIAdmin = false, myAvatar = "";
let localStream, peerConnection, mediaRecorder, audioChunks = [];
let currentReply = null, selectedMsgIdForAction = null, typingTimeout;
const rtcSettings = { 'iceServers': [{ 'urls': 'stun:stun.l.google.com:19302' }] };

const els = {
    loginScreen: document.getElementById('login-screen'),
    usernameInput: document.getElementById('username-input'),
    roomInput: document.getElementById('room-input'),
    passwordInput: document.getElementById('password-input'),
    joinBtn: document.getElementById('join-btn'),
    appContainer: document.getElementById('app-container'),
    chatArea: document.getElementById('chat-area'),
    chatForm: document.getElementById('chat-form'),
    messageInput: document.getElementById('message-input'),
    fileInput: document.getElementById('file-input'),
    roomDisplay: document.getElementById('room-display'),
    statusText: document.getElementById('status-text'),
    notifSound: document.getElementById('notification-sound'),
    ringtone: document.getElementById('ringtone'),
    replyPreview: document.getElementById('reply-preview'),
    replyUser: document.getElementById('reply-user'),
    replyText: document.getElementById('reply-text'),
    micBtn: document.getElementById('mic-btn'),
    sendBtn: document.getElementById('send-btn'),
    emojiBtn: document.getElementById('emoji-btn'),
    locationBtn: document.getElementById('location-btn'),
    themeBtn: document.getElementById('theme-btn'),
    onlineDot: document.getElementById('online-indicator'),
    videoCallBtn: document.getElementById('video-call-btn'),
    videoModal: document.getElementById('video-modal'),
    localVideo: document.getElementById('local-video'),
    remoteVideo: document.getElementById('remote-video'),
    endCallBtn: document.getElementById('end-call-btn'),
    incomingCallUI: document.getElementById('incoming-call-ui'),
    callerName: document.getElementById('caller-name'),
    acceptCallBtn: document.getElementById('accept-call-btn'),
    rejectCallBtn: document.getElementById('reject-call-btn'),
    usersModal: document.getElementById('users-modal'),
    usersList: document.getElementById('users-list'),
    contextMenu: document.getElementById('context-menu'),
    reactionPicker: document.getElementById('reaction-picker'),
    gifBtn: document.getElementById('gif-btn'),
    gifModal: document.getElementById('gif-modal'),
    gifGrid: document.getElementById('gif-grid')
};

// --- GİRİŞ ---
els.joinBtn.addEventListener('click', () => {
    if (els.usernameInput.value && els.roomInput.value && els.passwordInput.value) {
        myUsername = els.usernameInput.value.trim();
        myRoom = els.roomInput.value.trim();
        myAvatar = `https://api.dicebear.com/9.x/avataaars/svg?seed=${myUsername}`;
        socket.emit('join room', { 
            username: myUsername, 
            room: myRoom,
            password: els.passwordInput.value.trim(),
            avatar: myAvatar
        });
    } else { alert("Tüm alanları doldur!"); }
});

socket.on('error', (msg) => alert(msg));
socket.on('joined', (data) => {
    amIAdmin = data.isAdmin;
    els.roomDisplay.textContent = myRoom + (amIAdmin ? " (Yönetici)" : "");
    els.loginScreen.style.display = 'none';
    els.appContainer.style.display = 'flex';
});

// --- KULLANICI LİSTESİ ---
window.toggleUserList = () => els.usersModal.classList.toggle('hidden');
socket.on('room users', (users) => {
    els.onlineDot.classList.toggle('hidden', users.length <= 1);
    els.statusText.textContent = users.length + " kişi çevrimiçi";
    els.usersList.innerHTML = '';
    users.forEach(u => {
        const li = document.createElement('li');
        li.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <img src="${u.avatar || 'https://api.dicebear.com/9.x/avataaars/svg?seed=guest'}" style="width:30px; height:30px; border-radius:50%; border:1px solid #ddd; background:white;">
                <span>${u.username} ${u.isAdmin ? '👑' : ''} ${u.username === myUsername ? '(Sen)' : ''}</span>
            </div>
        `;
        if (amIAdmin && u.username !== myUsername) {
            const btn = document.createElement('button');
            btn.className = 'kick-btn'; btn.innerText = 'At';
            btn.onclick = () => { if(confirm('Atmak istiyor musun?')) socket.emit('kick user', u.id); };
            li.appendChild(btn);
        }
        els.usersList.appendChild(li);
    });
});
socket.on('kicked', () => { alert("Atıldın!"); location.reload(); });

// --- MESAJLAR ---
function appendMessage(data) {
    const existingMsg = document.getElementById('msg-' + data._id);
    let contentHtml = '', deletedClass = '';
    
    if (data.isDeleted) {
        contentHtml = '<div class="deleted-msg"><i class="fas fa-ban"></i> Silindi</div>';
        deletedClass = 'deleted';
    } else {
        if (data.replyTo && data.replyTo.username) contentHtml += `<div class="reply-bubble"><strong>${data.replyTo.username}</strong><span>${data.replyTo.text || 'Medya'}</span></div>`;
        if (data.image) contentHtml += `<img src="${data.image}" class="msg-image" onclick="window.open(this.src)">`;
        if (data.audio) contentHtml += `<audio controls src="${data.audio}"></audio>`;
        if (data.location) contentHtml += `<a href="${data.location}" target="_blank" class="location-link"><i class="fas fa-map-marker-alt"></i> Konum</a>`;
        if (data.text) contentHtml += `<span>${data.text}</span>`;
    }

    let reactionsHtml = '';
    if (data.reactions && Object.keys(data.reactions).length > 0) {
        const counts = {};
        Object.values(data.reactions).forEach(e => counts[e] = (counts[e] || 0) + 1);
        reactionsHtml = `<div class="reactions-container">`;
        for (const [emoji, count] of Object.entries(counts)) {
            reactionsHtml += `<span class="reaction-badge">${emoji} ${count}</span>`;
        }
        reactionsHtml += `</div>`;
    }

    if (existingMsg) { 
        existingMsg.querySelector('.bubble-content').innerHTML = contentHtml; 
        const oldReact = existingMsg.querySelector('.reactions-container');
        if(oldReact) oldReact.remove();
        if(reactionsHtml) existingMsg.querySelector('.bubble').insertAdjacentHTML('beforeend', reactionsHtml);
        return; 
    }

    const isOwn = data.username === myUsername;
    const time = new Date(data.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const row = document.createElement('div');
    row.className = 'message-row ' + (isOwn ? 'my-message' : 'other-message');
    row.id = 'msg-' + data._id;

    let avatarHtml = '';
    if (!isOwn) {
        avatarHtml = `<img src="${data.avatar || 'https://api.dicebear.com/9.x/avataaars/svg?seed='+data.username}" class="msg-avatar">`;
    }

    let tickHtml = '';
    if (isOwn) {
        const tickClass = data.isRead ? 'tick read' : 'tick';
        tickHtml = `<i class="fas fa-check-double ${tickClass}"></i>`;
    }

    const bubble = document.createElement('div');
    bubble.className = 'bubble ' + deletedClass;

    if (!data.isDeleted) {
        bubble.oncontextmenu = (e) => {
            e.preventDefault();
            selectedMsgIdForAction = data._id;
            els.contextMenu.style.top = e.pageY + 'px';
            els.contextMenu.style.left = e.pageX + 'px';
            els.contextMenu.classList.remove('hidden');
            document.getElementById('ctx-delete').style.display = isOwn ? 'flex' : 'none';
            document.getElementById('ctx-reply').onclick = () => {
                currentReply = { username: data.username, text: data.text || 'Medya' };
                els.replyUser.innerText = currentReply.username; els.replyText.innerText = currentReply.text;
                els.replyPreview.style.display = 'flex'; els.messageInput.focus();
                closeMenus();
            };
            document.getElementById('ctx-react').onclick = (ev) => {
                ev.stopPropagation();
                els.reactionPicker.style.top = (e.pageY - 50) + 'px';
                els.reactionPicker.style.left = e.pageX + 'px';
                els.reactionPicker.classList.remove('hidden');
                closeMenus(true);
            };
            document.getElementById('ctx-delete').onclick = () => {
                if(confirm('Sil?')) socket.emit('delete message', { msgId: data._id, room: myRoom });
                closeMenus();
            };
        };
    }

    let nameHtml = isOwn ? '' : `<span class="sender-name">${data.username}</span>`;
    bubble.innerHTML = `${nameHtml}<div class="bubble-content">${contentHtml}</div>${reactionsHtml}<div class="meta"><span>${time}</span>${tickHtml}</div>`;
    row.innerHTML = isOwn ? '' : avatarHtml;
    row.appendChild(bubble);
    els.chatArea.appendChild(row);
    els.chatArea.scrollTop = els.chatArea.scrollHeight;
}

// --- MENÜLER ---
window.onclick = () => closeMenus();
function closeMenus(keepReaction = false) {
    els.contextMenu.classList.add('hidden');
    if(!keepReaction) els.reactionPicker.classList.add('hidden');
}
window.sendReaction = (emoji) => {
    if (selectedMsgIdForAction) {
        socket.emit('add reaction', { msgId: selectedMsgIdForAction, room: myRoom, username: myUsername, emoji });
        closeMenus();
    }
};

// --- GIF ---
const gifLinks = ["https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcDdtY2lvM2N4aGg1aWd4aGg1aWd4aGg1aWd4aGg1aWd4biZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3o7TKSjRrfIPjeiVyM/giphy.gif","https://media.giphy.com/media/l0HlHFRbmaZtBRhXG/giphy.gif","https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif","https://media.giphy.com/media/3oKIPnAiaMCws8nOsE/giphy.gif","https://media.giphy.com/media/l0HlO3BJ8LALPW4sE/giphy.gif","https://media.giphy.com/media/xT9IgG50Fb7Mi0prBC/giphy.gif"];
els.gifBtn.onclick = () => {
    els.gifGrid.innerHTML = '';
    gifLinks.forEach(link => {
        const img = document.createElement('img'); img.src = link; img.className = 'gif-item';
        img.onclick = () => { socket.emit('chat message', { room: myRoom, username: myUsername, avatar: myAvatar, image: link }); els.gifModal.classList.add('hidden'); };
        els.gifGrid.appendChild(img);
    });
    els.gifModal.classList.remove('hidden');
};

// --- GÖNDERME ---
els.chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (els.messageInput.value) {
        socket.emit('chat message', { room: myRoom, username: myUsername, avatar: myAvatar, text: els.messageInput.value, replyTo: currentReply });
        els.messageInput.value = ''; checkInput(); window.cancelReply(); socket.emit('stop typing', { room: myRoom });
    }
});
function checkInput() { els.micBtn.style.display = els.messageInput.value.trim().length > 0 ? 'none' : 'block'; els.sendBtn.style.display = els.messageInput.value.trim().length > 0 ? 'block' : 'none'; }
els.messageInput.addEventListener('input', () => { checkInput(); socket.emit('typing', {room:myRoom, username:myUsername}); clearTimeout(typingTimeout); typingTimeout=setTimeout(()=>socket.emit('stop typing',{room:myRoom}),2000); });
window.cancelReply = function() { currentReply = null; els.replyPreview.style.display = 'none'; };

// --- DOSYA, KONUM, MIC ---
els.fileInput.addEventListener('change', function() { if(this.files[0]){const r=new FileReader();r.onload=e=>socket.emit('chat message',{room:myRoom,username:myUsername,avatar:myAvatar,image:e.target.result});r.readAsDataURL(this.files[0]);this.value=''} });
els.locationBtn.addEventListener('click', () => { navigator.geolocation.getCurrentPosition(p => socket.emit('chat message', { room: myRoom, username: myUsername, avatar: myAvatar, location: `http://maps.google.com/?q=${p.coords.latitude},${p.coords.longitude}` })); });
els.micBtn.addEventListener('mousedown', startRec); els.micBtn.addEventListener('mouseup', stopRec); els.micBtn.addEventListener('touchstart', (e)=>{e.preventDefault();startRec()}); els.micBtn.addEventListener('touchend', (e)=>{e.preventDefault();stopRec()});
async function startRec() { try { const s = await navigator.mediaDevices.getUserMedia({audio:true}); mediaRecorder = new MediaRecorder(s); audioChunks=[]; mediaRecorder.ondataavailable=e=>audioChunks.push(e.data); mediaRecorder.onstop=()=>{const r=new FileReader();r.readAsDataURL(new Blob(audioChunks));r.onloadend=()=>socket.emit('chat message',{room:myRoom,username:myUsername,avatar:myAvatar,audio:r.result});s.getTracks().forEach(t=>t.stop())}; mediaRecorder.start(); els.micBtn.classList.add('recording'); } catch(e){alert("Mic Hata")} }
function stopRec() { if(mediaRecorder && mediaRecorder.state!=="inactive"){mediaRecorder.stop();els.micBtn.classList.remove('recording')} }

// --- SOCKET OLAYLARI ---
socket.on('chat message', d => { 
    appendMessage(d); 
    if(d.username !== myUsername && !d.isDeleted) {
        els.notifSound.play().catch(()=>{});
        socket.emit('mark read', { room: myRoom, username: myUsername });
    }
});
socket.on('load old messages', msgs => { els.chatArea.innerHTML=''; msgs.forEach(m=>appendMessage(m)); });
socket.on('messages read', () => document.querySelectorAll('.tick').forEach(el => el.classList.add('read')));
socket.on('message updated', d => appendMessage(d));
socket.on('typing', d => { if(d.username!==myUsername) { els.statusText.textContent = d.username + " yazıyor..."; els.statusText.classList.add('typing-indicator'); }});
socket.on('stop typing', () => { els.statusText.classList.remove('typing-indicator'); socket.emit('get room count', myRoom); });

// --- VIDEO ---
els.videoCallBtn.addEventListener('click', startCall);
els.endCallBtn.addEventListener('click', endCall);
els.rejectCallBtn.addEventListener('click', () => { els.incomingCallUI.classList.add('hidden'); els.ringtone.pause(); socket.emit('reject-call', { room: myRoom }); });
els.acceptCallBtn.addEventListener('click', async () => { els.incomingCallUI.classList.add('hidden'); els.ringtone.pause(); await initializeMedia(); socket.emit('accept-call', { room: myRoom }); });
async function initializeMedia() { try { localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }); els.localVideo.srcObject = localStream; els.videoModal.classList.remove('hidden'); } catch(err) { alert("Kamera hatası"); } }
async function startCall() { await initializeMedia(); createPeerConnection(); const offer = await peerConnection.createOffer(); await peerConnection.setLocalDescription(offer); socket.emit('call-user', { offer, room: myRoom }); }
function createPeerConnection() { peerConnection = new RTCPeerConnection(rtcSettings); localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream)); peerConnection.ontrack = event => { els.remoteVideo.srcObject = event.streams[0]; }; peerConnection.onicecandidate = event => { if (event.candidate) socket.emit('ice-candidate', { candidate: event.candidate, room: myRoom }); }; }
function endCall() { if (peerConnection) peerConnection.close(); if (localStream) localStream.getTracks().forEach(track => track.stop()); els.videoModal.classList.add('hidden'); els.incomingCallUI.classList.add('hidden'); els.ringtone.pause(); socket.emit('end-call', { room: myRoom }); }
socket.on('call-made', async (data) => { els.videoModal.classList.remove('hidden'); els.incomingCallUI.classList.remove('hidden'); els.callerName.textContent = "Gelen Arama..."; els.ringtone.currentTime = 0; els.ringtone.play(); createPeerConnection(); await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer)); els.acceptCallBtn.onclick = async () => { els.incomingCallUI.classList.add('hidden'); els.ringtone.pause(); if(!localStream) await initializeMedia(); localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream)); const answer = await peerConnection.createAnswer(); await peerConnection.setLocalDescription(answer); socket.emit('make-answer', { answer, room: myRoom }); }; });
socket.on('answer-made', async (data) => await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer)));
socket.on('ice-candidate', async (data) => { if (peerConnection) await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate)); });
socket.on('call-rejected', () => { alert("Reddedildi"); endCall(); }); socket.on('call-ended', () => endCall());

// --- TEMA & EMOJI ---
const picker = new EmojiButton(); picker.on('emoji', s => { els.messageInput.value += s.emoji; checkInput(); }); els.emojiBtn.addEventListener('click', () => picker.togglePicker(els.emojiBtn));
els.themeBtn.addEventListener('click', () => { const isDark = document.body.getAttribute('data-theme') === 'dark'; document.body.setAttribute('data-theme', isDark ? 'light' : 'dark'); els.themeBtn.innerHTML = isDark ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>'; });