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

// --- VERİTABANI BAĞLANTISI ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB Bağlantısı Başarılı!'))
    .catch((err) => console.log('MongoDB Hatası:', err));

const MessageSchema = new mongoose.Schema({
    username: String,
    text: String,
    createdAt: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', MessageSchema);

// --- HTML KODU (DOĞRUDAN BURADA) ---
const htmlContent = `
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Chat Uygulaması</title>
    <style>
        body { font-family: sans-serif; background: #e5ddd5; margin: 0; display: flex; flex-direction: column; height: 100vh; }
        #chat-container { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 10px; }
        .message { background: #fff; padding: 8px 12px; border-radius: 8px; max-width: 70%; box-shadow: 0 1px 1px rgba(0,0,0,0.1); width: fit-content; }
        .my-message { align-self: flex-end; background: #dcf8c6; }
        .username { font-size: 0.75rem; color: #555; font-weight: bold; margin-bottom: 2px; }
        #form { background: #f0f0f0; padding: 10px; display: flex; gap: 10px; }
        input { flex: 1; padding: 10px; border-radius: 20px; border: 1px solid #ddd; outline: none; }
        button { background: #128C7E; color: white; border: none; padding: 10px 20px; border-radius: 20px; cursor: pointer; }
    </style>
</head>
<body>
    <div id="chat-container"></div>
    <form id="form">
        <input id="username" type="text" placeholder="İsim" style="flex: 0 0 80px;" required />
        <input id="input" type="text" placeholder="Mesaj..." autocomplete="off" />
        <button>Gönder</button>
    </form>
    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        const form = document.getElementById('form');
        const input = document.getElementById('input');
        const username = document.getElementById('username');
        const chat = document.getElementById('chat-container');

        function append(data, isOwn) {
            const div = document.createElement('div');
            div.className = 'message ' + (isOwn ? 'my-message' : '');
            div.innerHTML = '<div class="username">' + data.username + '</div>' + data.text;
            chat.appendChild(div);
            chat.scrollTop = chat.scrollHeight;
        }

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            if (input.value && username.value) {
                const data = { username: username.value, text: input.value };
                socket.emit('chat message', data);
                append(data, true); 
                input.value = '';
            }
        });

        socket.on('chat message', (data) => {
            if (data.username !== username.value) append(data, false);
        });

        socket.on('load old messages', (msgs) => {
            msgs.forEach(m => append(m, m.username === username.value));
        });
    </script>
</body>
</html>
`;

// --- ANA SAYFA İSTEĞİ ---
app.get('/', (req, res) => {
    res.send(htmlContent);
});

// --- SOCKET İŞLEMLERİ ---
io.on('connection', async (socket) => {
    try {
        const oldMessages = await Message.find().sort({ createdAt: 1 }).limit(50);
        socket.emit('load old messages', oldMessages);
    } catch (err) {}

    socket.on('chat message', async (data) => {
        const newMessage = new Message({ username: data.username, text: data.text });
        await newMessage.save();
        io.emit('chat message', data);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Sunucu çalışıyor`));
