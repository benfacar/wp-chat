require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// --- VERİTABANI ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB Bağlantısı Başarılı!'))
    .catch((err) => console.log('MongoDB Hatası:', err));

const MessageSchema = new mongoose.Schema({
    username: String,
    text: String,
    createdAt: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', MessageSchema);

// --- WHATSAPP GÖRÜNÜMLÜ HTML (Frontend) ---
const htmlContent = `
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>WhatsApp Klonu</title>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <style>
        /* Genel Ayarlar */
        * { box-sizing: border-box; }
        body { margin: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #d1d7db; height: 100vh; display: flex; justify-content: center; overflow: hidden; }
        
        /* Giriş Ekranı */
        #login-screen { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: #00a884; z-index: 1000; display: flex; flex-direction: column; align-items: center; justify-content: center; color: white; }
        #login-box { background: white; padding: 40px; border-radius: 10px; box-shadow: 0 4px 10px rgba(0,0,0,0.2); text-align: center; width: 80%; max-width: 300px; }
        #login-box h2 { color: #00a884; margin-top: 0; }
        #username-input { width: 100%; padding: 10px; margin: 15px 0; border: 1px solid #ddd; border-radius: 5px; font-size: 16px; outline: none; }
        #join-btn { background: #00a884; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-size: 16px; width: 100%; }
        
        /* Ana Uygulama */
        #app-container { width: 100%; max-width: 500px; background: #e5ddd5; display: none; flex-direction: column; height: 100%; box-shadow: 0 0 20px rgba(0,0,0,0.1); position: relative; }
        
        /* Başlık (Header) */
        header { background-color: #008069; color: white; padding: 10px 15px; display: flex; align-items: center; gap: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.2); z-index: 10; }
        .avatar { width: 40px; height: 40px; background: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #008069; font-size: 20px; }
        .header-info { flex: 1; }
        .header-name { font-weight: bold; font-size: 1.1rem; }
        .header-status { font-size: 0.8rem; opacity: 0.8; }
        
        /* Sohbet Alanı */
        #chat-area { flex: 1; overflow-y: auto; padding: 15px; background-image: url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png'); background-repeat: repeat; display: flex; flex-direction: column; gap: 8px; }
        
        /* Mesaj Balonları */
        .message-row { display: flex; width: 100%; }
        .my-message { justify-content: flex-end; }
        .other-message { justify-content: flex-start; }
        
        .bubble { max-width: 75%; padding: 6px 10px; border-radius: 8px; position: relative; font-size: 15px; line-height: 1.4; box-shadow: 0 1px 1px rgba(0,0,0,0.1); word-wrap: break-word; }
        .my-message .bubble { background-color: #d9fdd3; border-top-right-radius: 0; }
        .other-message .bubble { background-color: #fff; border-top-left-radius: 0; }
        
        .sender-name { font-size: 0.75rem; color: #e542a3; font-weight: bold; margin-bottom: 2px; display: block; }
        .my-message .sender-name { display: none; } /* Kendi ismimiz yazmasın */
        
        .meta { display: flex; justify-content: flex-end; align-items: center; gap: 4px; font-size: 0.65rem; color: #999; margin-top: 2px; margin-left: 10px; }
        .tick { color: #53bdeb; } /* Mavi Tik Rengi */
        
        /* Alt Kısım (Input) */
        #footer { background: #f0f2f5; padding: 10px; display: flex; align-items: center; gap: 10px; }
        #message-input { flex: 1; padding: 12px; border: none; border-radius: 20px; outline: none; font-size: 16px; }
        #send-btn { background: transparent; border: none; color: #008069; font-size: 24px; cursor: pointer; }
    </style>
</head>
<body>

    <div id="login-screen">
        <div id="login-box">
            <h2>WhatsApp Web</h2>
            <p>Sohbete katılmak için ismini gir</p>
            <form id="login-form">
                <input type="text" id="username-input" placeholder="Adınız..." autocomplete="off" required>
                <button type="submit" id="join-btn">Sohbete Başla</button>
            </form>
        </div>
    </div>

    <div id="app-container">
        <header>
            <div class="avatar"><i class="fas fa-user"></i></div>
            <div class="header-info">
                <div class="header-name">Grup Sohbeti</div>
                <div class="header-status">Çevrimiçi</div>
            </div>
            <i class="fas fa-ellipsis-v" style="color: white; cursor: pointer;"></i>
        </header>

        <div id="chat-area"></div>

        <div id="footer">
            <i class="far fa-smile" style="color: #54656f; font-size: 24px; cursor: pointer;"></i>
            <form id="chat-form" style="flex: 1; display: flex;">
                <input type="text" id="message-input" placeholder="Bir mesaj yazın" autocomplete="off">
                <button id="send-btn"><i class="fas fa-paper-plane"></i></button>
            </form>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        let myUsername = "";

        // DOM Elementleri
        const loginScreen = document.getElementById('login-screen');
        const loginForm = document.getElementById('login-form');
        const usernameInput = document.getElementById('username-input');
        const appContainer = document.getElementById('app-container');
        const chatArea = document.getElementById('chat-area');
        const chatForm = document.getElementById('chat-form');
        const messageInput = document.getElementById('message-input');

        // Giriş Yapma
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (usernameInput.value.trim()) {
                myUsername = usernameInput.value.trim();
                loginScreen.style.display = 'none';
                appContainer.style.display = 'flex';
                // Eski mesajları talep et (Socket bağlandığında otomatik gelir ama burada bekleyelim)
                window.scrollTo(0, document.body.scrollHeight);
            }
        });

        // Mesaj Ekleme Fonksiyonu
        function appendMessage(data) {
            const isOwn = data.username === myUsername;
            const time = new Date(data.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            const row = document.createElement('div');
            row.className = 'message-row ' + (isOwn ? 'my-message' : 'other-message');

            const bubble = document.createElement('div');
            bubble.className = 'bubble';

            // Başkasının mesajıysa ismini göster (pembe renkli)
            let nameHtml = isOwn ? '' : \`<span class="sender-name">\${data.username}</span>\`;
            
            // Tik işareti (sadece kendi mesajımızsa)
            let tickHtml = isOwn ? '<i class="fas fa-check-double tick"></i>' : '';

            bubble.innerHTML = \`
                \${nameHtml}
                \${data.text}
                <div class="meta">
                    <span>\${time}</span>
                    \${tickHtml}
                </div>
            \`;

            row.appendChild(bubble);
            chatArea.appendChild(row);
            chatArea.scrollTop = chatArea.scrollHeight;
        }

        // Mesaj Gönderme
        chatForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (messageInput.value && myUsername) {
                const data = { username: myUsername, text: messageInput.value };
                socket.emit('chat message', data);
                // Kendi ekranımıza hemen düşsün (optimistic UI)
                // appendMessage({ ...data, createdAt: new Date() }); // Socket'ten geleni beklemek daha güvenli sırası karışmaz
                messageInput.value = '';
            }
        });

        // Sunucudan Mesaj Gelince
        socket.on('chat message', (data) => {
            appendMessage(data);
        });

        // Eski Mesajlar
        socket.on('load old messages', (msgs) => {
            chatArea.innerHTML = ''; // Temizle
            msgs.forEach(msg => appendMessage(msg));
        });

    </script>
</body>
</html>
`;

app.get('/', (req, res) => res.send(htmlContent));

// --- SOCKET ---
io.on('connection', async (socket) => {
    try {
        const oldMessages = await Message.find().sort({ createdAt: 1 }).limit(50);
        socket.emit('load old messages', oldMessages);
    } catch (err) {}

    socket.on('chat message', async (data) => {
        const newMessage = new Message({ 
            username: data.username, 
            text: data.text,
            createdAt: new Date()
        });
        await newMessage.save();
        io.emit('chat message', newMessage);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(\`Sunucu çalışıyor\`));
