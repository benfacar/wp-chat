require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.static(path.join(__dirname, 'public')));

// MongoDB Bağlantısı (Hata olursa uygulama çökmesin diye try-catch ekli değil, loglayacak)
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB Bağlantısı Başarılı!'))
    .catch((err) => console.error('MongoDB Hatası:', err));

const MessageSchema = new mongoose.Schema({
    username: String,
    text: String,
    createdAt: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', MessageSchema);

io.on('connection', async (socket) => {
    console.log('Kullanıcı bağlandı:', socket.id);

    // Eski mesajları yükle
    try {
        const oldMessages = await Message.find().sort({ createdAt: 1 }).limit(50);
        socket.emit('load old messages', oldMessages);
    } catch (err) { console.error(err); }

    // Yeni mesaj
    socket.on('chat message', async (data) => {
        const newMessage = new Message({ username: data.username, text: data.text });
        await newMessage.save();
        io.emit('chat message', data);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Sunucu çalışıyor`));