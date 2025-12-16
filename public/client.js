const socket = io();
let myUsername = "", myRoom = "", amIAdmin = false;
let localStream, peerConnection;
let mediaRecorder, audioChunks = [];
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
    usersList: document.getElementById('users-list')
};

// --- GİRİŞ & AUTH ---
els.joinBtn.addEventListener('click', () => {
    if (els.usernameInput.value && els.roomInput.value && els.passwordInput.value) {
        myUsername = els.usernameInput.value.trim();
        myRoom = els.roomInput.value.trim();
        socket.emit('join room', { 
            username: myUsername, 
            room: myRoom,
            password: els.passwordInput.value.trim() 
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

socket.on('kicked', () => {
    alert("Yönetici tarafından odadan atıldın!");
    location.reload();
});

// --- ODA & KULLANICI LİSTESİ ---
window.toggleUserList = () => els.usersModal.classList.toggle('hidden');
socket.on('room users', (users) => {
    els.onlineDot.classList.toggle('hidden', users.length <= 1);
    els.statusText.textContent = users.length + " kişi çevrimiçi";
    
    // Listeyi güncelle
    els.usersList.innerHTML = '';
    users.forEach(u => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${u.username} ${u.isAdmin ? '👑' : ''} ${u.username === myUsername ? '(Sen)' : ''}</span>`;
        // Eğer ben adminsem ve bu kişi ben değilsem ATMA butonu koy
        if (amIAdmin && u.username !== myUsername) {
            const btn = document.createElement('button');
            btn.className = 'kick-btn';
            btn.innerText = 'At';
            btn.onclick = () => {
                if(confirm(u.username + ' adlı kişiyi atmak istiyor musun?')) {
                    socket.emit('kick user', u.id);
                }
            };
            li.appendChild(btn);
        }
        els.usersList.appendChild(li);
    });
});

// --- MAVİ TİK & MESAJLAR ---
socket.on('chat message', d => { 
    appendMessage(d); 
    if(d.username !== myUsername && !d.isDeleted) {
        els.notifSound.play().catch(()=>{});
        // Mesajı gördüğüm için "Okundu" sinyali gönder
        socket.emit('mark read', { room: myRoom, username: myUsername });
    }
});

socket.on('messages read', () => {
    // Ekrandaki tüm gri tikleri mavi yap
    document.querySelectorAll('.tick').forEach(el => el.classList.add('read'));
});

// --- MESAJ EKLEME FONKSİYONU (GÜNCEL) ---
function appendMessage(data) {
    const existingMsg = document.getElementById('msg-' + data._id);
    let contentHtml = '', deletedClass = '';
    
    if (data.isDeleted) {
        contentHtml = '<div class="deleted-msg"><i class="fas fa-ban"></i> Bu mesaj silindi</div>';
        deletedClass = 'deleted';
    } else {
        if (data.replyTo && data.replyTo.username) contentHtml += `<div class="reply-bubble"><strong>${data.replyTo.username}</strong><span>${data.replyTo.text || 'Medya'}</span></div>`;
        if (data.image) contentHtml += `<img src="${data.image}" class="msg-image" onclick="window.open(this.src)">`;
        if (data.audio) contentHtml += `<audio controls src="${data.audio}"></audio>`;
        if (data.location) contentHtml += `<a href="${data.location}" target="_blank" class="location-link"><i class="fas fa-map-marker-alt"></i> Konum</a>`;
        if (data.text) contentHtml += `<span>${data.text}</span>`;
    }

    if (existingMsg) { existingMsg.querySelector('.bubble-content').innerHTML = contentHtml; return; }

    const isOwn = data.username === myUsername;
    const time = new Date(data.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const row = document.createElement('div');
    row.className = 'message-row ' + (isOwn ? 'my-message' : 'other-message');
    row.id = 'msg-' + data._id;

    let nameHtml = isOwn ? '' : `<span class="sender-name">${data.username}</span>`;
    const bubble = document.createElement('div');
    bubble.className = 'bubble ' + deletedClass;

    if (!data.isDeleted) {
        bubble.ondblclick = () => {
            currentReply = { username: data.username, text: data.text || 'Medya' };
            els.replyUser.innerText = currentReply.username; els.replyText.innerText = currentReply.text;
            els.replyPreview.style.display = 'flex'; els.messageInput.focus();
        };
        if (isOwn) bubble.oncontextmenu = (e) => { e.preventDefault(); if(confirm('Sil?')) socket.emit('delete message', { msgId: data._id, room: myRoom }); };
    }
    
    // TİK İŞARETİ MANTIĞI
    let tickHtml = '';
    if (isOwn) {
        const tickClass = data.isRead ? 'tick read' : 'tick';
        tickHtml = `<i class="fas fa-check-double ${tickClass}"></i>`;
    }

    bubble.innerHTML = `${nameHtml}<div class="bubble-content">${contentHtml}</div><div class="meta"><span>${time}</span>${tickHtml}</div>`;
    els.chatArea.appendChild(row);
    els.chatArea.scrollTop = els.chatArea.scrollHeight;
}

// --- DİĞER (VİDEO, EMOJI VB. ESKİ KODLAR AYNI) ---
// (Buraya Video Arama ve diğer buton kodlarının aynısı gelecek. Kopyala yapıştır yaparken önceki client.js'deki video ve emoji kısımlarını koruyun)
// Sadece appendMessage ve login kısımları değişti.
// Aşağısı standart:

els.chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (els.messageInput.value) {
        socket.emit('chat message', { room: myRoom, username: myUsername, text: els.messageInput.value, replyTo: currentReply });
        els.messageInput.value = ''; checkInput(); window.cancelReply(); socket.emit('stop typing', { room: myRoom });
    }
});
function checkInput() { els.micBtn.style.display = els.messageInput.value.trim().length > 0 ? 'none' : 'block'; els.sendBtn.style.display = els.messageInput.value.trim().length > 0 ? 'block' : 'none'; }
els.messageInput.addEventListener('input', () => { checkInput(); socket.emit('typing', {room:myRoom, username:myUsername}); clearTimeout(typingTimeout); typingTimeout=setTimeout(()=>socket.emit('stop typing',{room:myRoom}),2000); });
window.cancelReply = function() { currentReply = null; els.replyPreview.style.display = 'none'; };

// ... EMOJI, TEMA, KONUM, SES, VİDEO KODLARI ÖNCEKİ CEVAPTAN AYNI ŞEKİLDE DEVAM EDİYOR ...
// (Video arama mantığı değişmediği için client.js'in geri kalanı önceki cevaptakiyle aynıdır)

// VİDEO KISMI İÇİN KISA ÖZET (Eksik kalmasın diye):
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
// ... DİĞER BUTONLAR (MİKROFON, KONUM, DOSYA) ÖNCEKİ İLE AYNI ...
els.locationBtn.addEventListener('click', () => { navigator.geolocation.getCurrentPosition(p => socket.emit('chat message', { room: myRoom, username: myUsername, location: `http://maps.google.com/?q=${p.coords.latitude},${p.coords.longitude}` })); });
els.micBtn.addEventListener('mousedown', startRec); els.micBtn.addEventListener('mouseup', stopRec); els.micBtn.addEventListener('touchstart', (e)=>{e.preventDefault();startRec()}); els.micBtn.addEventListener('touchend', (e)=>{e.preventDefault();stopRec()});
async function startRec() { try { const s = await navigator.mediaDevices.getUserMedia({audio:true}); mediaRecorder = new MediaRecorder(s); audioChunks=[]; mediaRecorder.ondataavailable=e=>audioChunks.push(e.data); mediaRecorder.onstop=()=>{const r=new FileReader();r.readAsDataURL(new Blob(audioChunks));r.onloadend=()=>socket.emit('chat message',{room:myRoom,username:myUsername,audio:r.result});s.getTracks().forEach(t=>t.stop())}; mediaRecorder.start(); els.micBtn.classList.add('recording'); } catch(e){alert("Mic Hata")} }
function stopRec() { if(mediaRecorder && mediaRecorder.state!=="inactive"){mediaRecorder.stop();els.micBtn.classList.remove('recording')} }
els.fileInput.addEventListener('change', function() { if(this.files[0]){const r=new FileReader();r.onload=e=>socket.emit('chat message',{room:myRoom,username:myUsername,image:e.target.result});r.readAsDataURL(this.files[0]);this.value=''} });
// ... THEME ...
const picker2 = new EmojiButton(); picker2.on('emoji', s => { els.messageInput.value += s.emoji; checkInput(); }); els.emojiBtn.addEventListener('click', () => picker2.togglePicker(els.emojiBtn));
els.themeBtn.addEventListener('click', () => { const isDark = document.body.getAttribute('data-theme') === 'dark'; document.body.setAttribute('data-theme', isDark ? 'light' : 'dark'); els.themeBtn.innerHTML = isDark ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>'; });