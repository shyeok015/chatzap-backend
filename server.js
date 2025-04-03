const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// JSON डेटा के लिए
app.use(express.json());

// यूज़र डेटा (असली ऐप में डेटाबेस यूज़ करें)
const usersDb = new Map();
usersDb.set('user1', { password: 'pass123', userId: 'user1' });
usersDb.set('user2', { password: 'pass456', userId: 'user2' });

// लॉगिन एंडपॉइंट
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = usersDb.get(username);
    if (user && user.password === password) {
        res.json({ success: true, userId: user.userId });
    } else {
        res.status(401).json({ success: false, message: 'गलत यूज़रनेम या पासवर्ड' });
    }
});

// Set up file upload with multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './uploads';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// File upload endpoint
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    res.json({ filePath: `/uploads/${req.file.filename}` });
});

// In-memory store for users, chats, and messages
const users = new Map();
const chats = [
    { id: 1, name: "Alice", profilePic: "https://via.placeholder.com/40" },
    { id: 2, name: "Bob", profilePic: "https://via.placeholder.com/40" },
    { id: 3, name: "Charlie", profilePic: "https://via.placeholder.com/40" }
];
const messages = {
    1: [{ text: "Hey, how are you?", sender: "user1", timestamp: Date.now() }],
    2: [{ text: "See you tomorrow!", sender: "user2", timestamp: Date.now() }],
    3: [{ text: "Call me later.", sender: "user1", timestamp: Date.now() }]
};

// Socket.IO connection
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    const userId = socket.id;
    users.set(userId, socket.id);

    socket.emit('userId', userId);
    socket.emit('chatList', chats);

    socket.on('loadChat', (chatId) => {
        socket.emit('chatMessages', { chatId, messages: messages[chatId] || [] });
    });

    socket.on('sendMessage', ({ chatId, text, sender, receiverId, media }) => {
        const message = { text, sender, media, timestamp: Date.now() };
        if (!messages[chatId]) messages[chatId] = [];
        messages[chatId].push(message);

        const receiverSocketId = users.get(receiverId);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('newMessage', { chatId, message });
        }
        socket.emit('newMessage', { chatId, message });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        users.delete(userId);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});