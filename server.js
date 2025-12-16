require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const mongoose = require('mongoose');
const cors = require('cors');

// --- AYARLAR ---
const app = express();
// Büyük resimler için limit artırımı
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    maxHttpBufferSize: 1e8 
});

// --- VERİTABANI BAĞLANTISI ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB Bağlantısı Başarılı!'))
    .catch((err) => console.log('MongoDB Hatası:', err));

const MessageSchema = new mongoose.Schema({
    room: String,
    username: String,
    text: String,
    image: String,
    createdAt: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', MessageSchema);

// --- HTML İÇERİĞİ (Tırnak hatalarını önlemek için sadeleştirildi) ---
const htmlContent = `
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>WhatsApp Ultra</title>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <style>
        * { box-sizing: border-box; }
        body { margin: 0; font-family: Helvetica, Arial, sans-serif; background-color: #d1d7db; height: 100vh; display: flex; justify-content: center; overflow: hidden; }
        
        /* GİRİŞ EKRANI */
        #login-screen { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: #00a884; z-index: 1000; display: flex; flex-direction: column; align-items: center; justify-content: center; color: white; }
        #login-box { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 10px rgba(0,0,0,0.2); text-align: center; width: 85%; max-width: 350px; display: flex; flex-direction: column; gap: 15px; }
        #login-box h2 { color: #00a884; margin: 0 0 10px 0; }
        .login-input { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 5px; font-size: 16px; outline: none; }
        #join-btn { background: #00a884; color: white; border: none; padding: 12px; border-radius: 5px; cursor: pointer; font-size: 16px; font-weight: bold; }
        
        /* ANA EKRAN */
        #app-container { width: 100%; max-width: 500px; background: #e5ddd5; display: none; flex-direction: column; height: 100%; box-shadow: 0 0 20px rgba(0,0,0,0.1); position: relative; }
        
        header { background-color: #008069; color: white; padding: 10px 15px; display: flex; align-items: center; gap: 10px; z-index: 10; }
        .avatar { width: 40px; height: 40px; background: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #008069; font-size: 20px; }
        .header-info { flex: 1; }
        .header-name { font-weight: bold; font-size: 1.1rem; }
        .room-badge { font-size: 0.75rem; background: rgba(0,0,0,0.1); padding: 2px 6px; border-radius: 4px; margin-left: 5px; }
        
        #chat-area { flex: 1; overflow-y: auto; padding: 15px; background-image: url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png'); background-repeat: repeat; display: flex; flex-direction: column; gap: 8px; }
        
        .message-row { display: flex; width: 100%; }
        .my-message { justify-content: flex-end; }
        .other-message { justify-content: flex-start; }
        
        .bubble { max-width: 75%; padding: 6px 8px; border-radius: 8px; position: relative; font-size: 15px; box-shadow: 0 1px 1px rgba(0,0,0,0.1); word-wrap: break-word; display: flex; flex-direction: column; }
        .my-message .bubble { background-color: #d9fdd3; border-top-right-radius: 0; }
        .other-message .bubble { background-color: #fff; border-top-left-radius: 0; }
        
        .sender-name { font-size: 0.75rem; color: #e542a3; font-weight: bold; margin-bottom: 2px; }
        .my-message .sender-name { display: none; }
        
        .msg-image { max-width: 100%; border-radius: 5px; margin-top: 5px; cursor: pointer; }
        
        .meta { display: flex; justify-content: flex-end; align-items: center; gap: 4px; font-size: 0.65rem; color: #999; margin-top: 2px; align-self: flex-end; }
        .tick { color: #53bdeb; }
        
        #footer { background: #f0f2f5; padding: 8px; display: flex; align-items: center; gap: 8px; min-height: 60px; }
        #message-input { flex: 1; padding: 10px 15px; border: none; border-radius: 20px; outline: none; font-size: 16px; height: 40px; }
        .icon-btn { background: none; border: none; color: #54656f; font-size: 22px; cursor: pointer; padding: 5px; }
        #file-input { display: none; }
    </style>
</head>
<body>

    <div id="login-screen">
        <div id="login-box">
            <h2>WhatsApp Giriş</h2>
            <input type="text" id="username-input" class="login-input" placeholder="Adınız" autocomplete="off">
            <input type="text" id="room-input" class="login-input" placeholder="Oda İsmi (Örn: Aile)" autocomplete="off">
            <button id="join-btn">Sohbete Katıl</button>
        </div>
    </div>

    <div id="app-container">
        <header>
            <div class="avatar"><i class="fas fa-users"></i></div>
            <div class="header-info">
                <div class="header-name">Sohbet <span id="room-display" class="room-badge"></span></div>
                <div class="header-status" style="font-size: 0.8rem;">çevrimiçi</div>
            </div>
        </header>

        <div id="chat-area"></div>

        <div id="footer">
            <button class="icon-btn" onclick="document.getElementById('file-input').click()">
                <i class="fas fa-paperclip"></i>
            </button>
            <input type="file" id="file-input" accept="image/*">

            <form id="chat-form" style="flex: 1; display: flex; gap: 5px;">
                <input type="text" id="message-input" placeholder="Mesaj yazın" autocomplete="off">
                <button class="icon-btn" style="color: #008069;"><i class="fas fa-paper-plane"></i></button>
            </form>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let myUsername = "";
        let myRoom = "";

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

        joinBtn.addEventListener('click', () => {
            if (usernameInput.value && roomInput.value) {
                myUsername = usernameInput.value.trim();
                myRoom = roomInput.value.trim();
                socket.emit('join room', { username: myUsername, room: myRoom });
                roomDisplay.textContent = myRoom;
                loginScreen.style.display = 'none';
                appContainer.style.display = 'flex';
            } else {
                alert("Lütfen isim ve oda ismi girin!");
            }
        });

        function appendMessage(data) {
            const isOwn = data.username === myUsername;
            const time = new Date(data.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            const row = document.createElement('div');
            row.className = 'message-row ' + (isOwn ? 'my-message' : 'other-message');

            let contentHtml = '';
            if (data.image) {
                contentHtml += '<img src="' + data.image + '" class="msg-image" onclick="window.open(this.src)">';
            }
            if (data.text) {
                contentHtml += '<span>' + data.text + '</span>';
            }

            let nameHtml = isOwn ? '' : '<span class="sender-name">' + data.username + '</span>';
            let tickHtml = isOwn ? '<i class="fas fa-check-double tick"></i>' : '';

            const bubble = document.createElement('div');
            bubble.className = 'bubble';
            bubble.innerHTML = nameHtml + contentHtml + '<div class="meta"><span>' + time + '</span>' + tickHtml + '</div>';

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

        socket.on('chat message', (data) => appendMessage(data));
        socket.on('load old messages', (msgs) => {
            chatArea.innerHTML = '';
            msgs.forEach(msg => appendMessage(msg));
        });
    </script>
</body>
</html>
`;

app.get('/', (req, res) => res.send(htmlContent));

io.on('connection', (socket) => {
    socket.on('join room', async ({ username, room
