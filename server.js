require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const mongoose = require('mongoose');
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
    room: String, username: String, avatar: String,
    text: String, image: String, audio: String, location: String,
    replyTo: { username: String, text: String },
    reactions: { type: Map, of: String, default: {} },
    isRead: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    isDeleted: { type: Boolean, default: false }
});
const Message = mongoose.model('Message', MessageSchema);

const roomData = {}; // Oda yöneticileri ve şifreleri

io.on('connection', (socket) => {
    
    // --- ODAYA GİRİŞ ---
    socket.on('join room', async ({ username, room, password, avatar }) => {
        if (!roomData[room]) {
            roomData[room] = { password: password, admin: socket.id };
        } else if (roomData[room].password !== password) {
            socket.emit('error', 'Hatalı Oda Şifresi!'); return;
        }

        socket.join(room);
        socket.username = username;
        socket.room = room;
        socket.avatar = avatar;

        const isAdmin = (roomData[room].admin === socket.id);
        socket.emit('joined', { isAdmin });
        updateRoomUsers(room);

        try {
            const oldMessages = await Message.find({ room: room }).sort({ createdAt: 1 }).limit(50);
            socket.emit('load old messages', oldMessages);
            // Bekleyen mesajları okundu yap
            await Message.updateMany({ room: room, isRead: false, username: { $ne: username } }, { isRead: true });
            socket.to(room).emit('messages read'); 
        } catch (err) {}
    });

    // --- MESAJ ---
    socket.on('chat message', async (data) => {
        const roomSize = io.sockets.adapter.rooms.get(data.room)?.size || 0;
        const newMessage = new Message({
            room: data.room, username: data.username, avatar: data.avatar,
            text: data.text, image: data.image, audio: data.audio, location: data.location,
            replyTo: data.replyTo, isRead: (roomSize > 1)
        });
        const savedMsg = await newMessage.save();
        io.to(data.room).emit('chat message', savedMsg);
    });

    // --- TEPKİLER ---
    socket.on('add reaction', async ({ msgId, room, username, emoji }) => {
        const msg = await Message.findById(msgId);
        if (msg) {
            if (msg.reactions.get(username) === emoji) msg.reactions.delete(username);
            else msg.reactions.set(username, emoji);
            await msg.save();
            io.to(room).emit('message updated', msg);
        }
    });

    // --- SİLME ---
    socket.on('delete message', async ({ msgId, room }) => {
        const updated = await Message.findByIdAndUpdate(msgId, { 
            isDeleted: true, text:null, image:null, audio:null, location:null, reactions: {} 
        }, { new: true });
        if (updated) io.to(room).emit('message updated', updated);
    });

    // --- DİĞERLERİ ---
    socket.on('mark read', async ({ room, username }) => {
        await Message.updateMany({ room: room, isRead: false, username: { $ne: username } }, { isRead: true });
        io.to(room).emit('messages read');
    });

    socket.on('kick user', (id) => {
        if (roomData[socket.room]?.admin === socket.id) {
            io.to(id).emit('kicked');
            io.sockets.sockets.get(id)?.leave(socket.room);
            updateRoomUsers(socket.room);
        }
    });

    socket.on('typing', (d) => socket.to(d.room).emit('typing', d));
    socket.on('stop typing', (d) => socket.to(d.room).emit('stop typing'));
    
    // --- VIDEO SIGNALING ---
    socket.on('call-user', (d) => socket.to(d.room).emit('call-made', { offer: d.offer }));
    socket.on('make-answer', (d) => socket.to(d.room).emit('answer-made', { answer: d.answer }));
    socket.on('ice-candidate', (d) => socket.to(d.room).emit('ice-candidate', { candidate: d.candidate }));
    socket.on('reject-call', (d) => socket.to(d.room).emit('call-rejected'));
    socket.on('end-call', (d) => socket.to(d.room).emit('call-ended'));
    socket.on('accept-call', (d) => {});

    socket.on('disconnecting', () => {
        const room = socket.room;
        if (room) {
            if (roomData[room]?.admin === socket.id) delete roomData[room];
            setTimeout(() => updateRoomUsers(room), 1000);
        }
    });

    function updateRoomUsers(room) {
        if (!io.sockets.adapter.rooms.get(room)) return;
        const users = [];
        io.sockets.adapter.rooms.get(room).forEach(sid => {
            const s = io.sockets.sockets.get(sid);
            if (s) users.push({ id: sid, username: s.username, avatar: s.avatar, isAdmin: (roomData[room]?.admin === sid) });
        });
        io.to(room).emit('room users', users);
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Sunucu calisiyor'));