require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" }, maxHttpBufferSize: 1e8 });

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB Baglandi'))
    .catch((err) => console.log('Hata:', err));

const MessageSchema = new mongoose.Schema({
    room: String, username: String, text: String, image: String, audio: String, location: String,
    replyTo: { username: String, text: String },
    isRead: { type: Boolean, default: false }, // Mavi tik için
    createdAt: { type: Date, default: Date.now },
    isDeleted: { type: Boolean, default: false }
});
const Message = mongoose.model('Message', MessageSchema);

// ODA YÖNETİMİ (RAM'de tutulur)
const roomData = {}; // { 'OdaAdi': { password: '123', adminSocketId: 'xyz' } }

io.on('connection', (socket) => {
    
    // ODAYA GİRİŞ
    socket.on('join room', async ({ username, room, password }) => {
        // 1. Oda var mı kontrol et
        if (!roomData[room]) {
            // Oda yoksa oluştur: İlk giren Admin olur, şifreyi o belirler
            roomData[room] = { password: password, admin: socket.id };
        } else {
            // Oda varsa şifreyi kontrol et
            if (roomData[room].password !== password) {
                socket.emit('error', 'Hatalı Oda Şifresi!');
                return;
            }
        }

        socket.join(room);
        socket.username = username; // Sokete ismi kaydet
        socket.room = room;

        // Admin bilgisini ve kullanıcıyı gönder
        const isAdmin = (roomData[room].admin === socket.id);
        socket.emit('joined', { isAdmin });

        // Kişi sayısını güncelle
        updateRoomUsers(room);

        // Eski mesajları yükle ve OKUNDU olarak işaretle (Çünkü biri girdi)
        try {
            const oldMessages = await Message.find({ room: room }).sort({ createdAt: 1 }).limit(50);
            socket.emit('load old messages', oldMessages);
            
            // Odaya girince bekleyen mesajları okundu yap
            await Message.updateMany({ room: room, isRead: false, username: { $ne: username } }, { isRead: true });
            // Diğerlerine haber ver: "Mesajlarınız okundu"
            socket.to(room).emit('messages read'); 
        } catch (err) {}
    });

    // MESAJ GÖNDERME
    socket.on('chat message', async (data) => {
        // Odada başka biri varsa mesaj direkt "Okundu" olarak gider
        const roomSize = io.sockets.adapter.rooms.get(data.room)?.size || 0;
        const isReadNow = roomSize > 1;

        const newMessage = new Message({
            room: data.room, username: data.username, text: data.text,
            image: data.image, audio: data.audio, location: data.location,
            replyTo: data.replyTo, isRead: isReadNow
        });
        const savedMsg = await newMessage.save();
        io.to(data.room).emit('chat message', savedMsg);
    });

    // OKUNDU BİLGİSİ (Biri mesajı görünce)
    socket.on('mark read', async ({ room, username }) => {
        // O odadaki bana ait olmayan mesajları okundu yap
        await Message.updateMany({ room: room, isRead: false, username: { $ne: username } }, { isRead: true });
        io.to(room).emit('messages read');
    });

    // KULLANICI ATMA (KICK) - Sadece Admin
    socket.on('kick user', (targetSocketId) => {
        const room = socket.room;
        if (roomData[room] && roomData[room].admin === socket.id) {
            io.to(targetSocketId).emit('kicked'); // Kullanıcıya atıldığını söyle
            io.sockets.sockets.get(targetSocketId)?.leave(room); // Odadan at
            updateRoomUsers(room);
        }
    });

    // GÖRÜNTÜLÜ ARAMA SİNYALLERİ
    socket.on('call-user', (d) => socket.to(d.room).emit('call-made', { offer: d.offer }));
    socket.on('make-answer', (d) => socket.to(d.room).emit('answer-made', { answer: d.answer }));
    socket.on('ice-candidate', (d) => socket.to(d.room).emit('ice-candidate', { candidate: d.candidate }));
    socket.on('reject-call', (d) => socket.to(d.room).emit('call-rejected'));
    socket.on('end-call', (d) => socket.to(d.room).emit('call-ended'));
    
    // YAZIYOR...
    socket.on('typing', (d) => socket.to(d.room).emit('typing', d));
    socket.on('stop typing', (d) => socket.to(d.room).emit('stop typing'));
    
    // SİLME
    socket.on('delete message', async ({ msgId, room }) => {
        const updated = await Message.findByIdAndUpdate(msgId, { isDeleted: true, text:null, image:null, audio:null, location:null }, { new: true });
        if (updated) io.to(room).emit('message updated', updated);
    });

    socket.on('disconnecting', () => {
        const room = socket.room;
        if (room) {
            // Eğer Admin çıktıysa, oda yönetimini sıfırla veya devret (Basitlik için siliyoruz)
            if (roomData[room]?.admin === socket.id) {
                delete roomData[room]; // Oda başsız kaldı, şifre sıfırlandı
            }
            setTimeout(() => updateRoomUsers(room), 1000);
        }
    });

    function updateRoomUsers(room) {
        if (!io.sockets.adapter.rooms.get(room)) return;
        const users = [];
        io.sockets.adapter.rooms.get(room).forEach(socketId => {
            const s = io.sockets.sockets.get(socketId);
            if (s) users.push({ id: socketId, username: s.username, isAdmin: (roomData[room]?.admin === socketId) });
        });
        io.to(room).emit('room users', users);
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Sunucu calisiyor'));