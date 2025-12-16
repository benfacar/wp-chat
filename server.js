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
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    maxHttpBufferSize: 1e8 
});

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB Baglandi'))
    .catch((err) => console.log('MongoDB Hatasi:', err));

const MessageSchema = new mongoose.Schema({
    room: String, username: String, text: String, image: String, audio: String, location: String,
    replyTo: { username: String, text: String },
    createdAt: { type: Date, default: Date.now },
    isDeleted: { type: Boolean, default: false }
});
const Message = mongoose.model('Message', MessageSchema);

io.on('connection', (socket) => {
    
    socket.on('join room', async ({ username, room }) => {
        socket.join(room);
        updateRoomCount(room);
        try {
            const oldMessages = await Message.find({ room: room }).sort({ createdAt: 1 }).limit(50);
            socket.emit('load old messages', oldMessages);
        } catch (err) {}
    });

    socket.on('chat message', async (data) => {
        const newMessage = new Message({ room: data.room, username: data.username, text: data.text, image: data.image, audio: data.audio, location: data.location, replyTo: data.replyTo });
        const savedMsg = await newMessage.save();
        io.to(data.room).emit('chat message', savedMsg);
    });

    socket.on('delete message', async ({ msgId, room }) => {
        const updatedMsg = await Message.findByIdAndUpdate(msgId, { isDeleted: true, text: null, image: null, audio: null, location: null }, { new: true });
        if (updatedMsg) io.to(room).emit('message updated', updatedMsg);
    });

    socket.on('typing', (d) => socket.to(d.room).emit('typing', d));
    socket.on('stop typing', (d) => socket.to(d.room).emit('stop typing'));
    socket.on('get room count', (room) => updateRoomCount(room));

    // --- VIDEO CALL SIGNALS ---
    socket.on('call-user', (data) => socket.to(data.room).emit('call-made', { offer: data.offer }));
    socket.on('make-answer', (data) => socket.to(data.room).emit('answer-made', { answer: data.answer }));
    socket.on('ice-candidate', (data) => socket.to(data.room).emit('ice-candidate', { candidate: data.candidate }));
    socket.on('reject-call', (data) => socket.to(data.room).emit('call-rejected'));
    socket.on('end-call', (data) => socket.to(data.room).emit('call-ended'));
    socket.on('accept-call', (data) => { /* Opsiyonel log */ });

    socket.on('disconnecting', () => {
        for (const room of socket.rooms) {
            if (room !== socket.id) {
                setTimeout(() => updateRoomCount(room), 1000);
            }
        }
    });

    function updateRoomCount(room) {
        const count = io.sockets.adapter.rooms.get(room)?.size || 0;
        io.to(room).emit('room data', { count });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Sunucu calisiyor'));