const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// पब्लिक फोल्डर से फाइलें सर्व करें
app.use(express.static(path.join(__dirname, 'public')));

// अपलोड की गई फाइलें सर्व करें
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// JSON डेटा के लिए
app.use(express.json());

// यूज़र डेटा (डेटाबेस की जगह)
const usersDb = new Map();
usersDb.set('user1', { password: 'pass123', userId: 'user1' });
usersDb.set('user2', { password: 'pass456', userId: 'user2' });

// लॉगिन
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = usersDb.get(username);
    if (user && user.password === password) {
        res.json({ success: true, userId: user.userId });
    } else {
        res.status(401).json({ success: false, message: 'गलत यूज़रनेम या पासवर्ड' });
    }
});

// फाइल अपलोड सेटअप
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './uploads';
        if (!fs.existsSync(dir)) {
            console.log('uploads फोल्डर नहीं मिला, बना रहे हैं...');
            fs.mkdirSync(dir);
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const fileName = Date.now() + path.extname(file.originalname);
        console.log('फाइल का नाम:', fileName); // डिबगिंग
        cb(null, fileName);
    }
});
const upload = multer({ storage });

// फाइल अपलोड एंडपॉइंट
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        console.error('फाइल अपलोड में समस्या: कोई फाइल नहीं मिली');
        return res.status(400).json({ error: 'कोई फाइल अपलोड नहीं हुई' });
    }
    const baseUrl = `${req.protocol}://${req.get('host')}`; // जैसे http://localhost:3000
    const filePath = `${baseUrl}/uploads/${req.file.filename}`;
    console.log('फाइल अपलोड हुई, URL:', filePath); // डिबगिंग
    res.json({ filePath });
});

// यूज़र, चैट और मैसेज स्टोर
const users = new Map();
const chats = [
    { id: 1, name: "Alice", profilePic: "https://via.placeholder.com/40" },
    { id: 2, name: "Bob", profilePic: "https://via.placeholder.com/40" },
    { id: 3, name: "Charlie", profilePic: "https://via.placeholder.com/40" }
];
const messages = {
    1: [{ text: "हाय, आप कैसे हैं?", sender: "user1", timestamp: Date.now() }],
    2: [{ text: "कल मिलते हैं!", sender: "user2", timestamp: Date.now() }],
    3: [{ text: "बाद में कॉल करें।", sender: "user1", timestamp: Date.now() }]
};

// Socket.IO कनेक्शन
io.on('connection', (socket) => {
    console.log('एक यूज़र जुड़ा:', socket.id);

    const userId = socket.id;
    users.set(userId, socket.id);

    socket.emit('userId', userId);
    socket.emit('chatList', chats);

    socket.on('loadChat', (chatId) => {
        console.log('चैट लोड हो रही है:', chatId); // डिबगिंग
        socket.emit('chatMessages', { chatId, messages: messages[chatId] || [] });
    });

    socket.on('sendMessage', ({ chatId, text, sender, receiverId, media }) => {
        const message = { text, sender, media, timestamp: Date.now() };
        console.log('नया मैसेज भेजा गया:', message); // डिबगिंग
        if (!messages[chatId]) messages[chatId] = [];
        messages[chatId].push(message);

        const receiverSocketId = users.get(receiverId);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('newMessage', { chatId, message });
        }
        socket.emit('newMessage', { chatId, message });
    });

    socket.on('disconnect', () => {
        console.log('यूज़र डिस्कनेक्ट हुआ:', socket.id);
        users.delete(userId);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`सर्वर पोर्ट ${PORT} पर चल रहा है`);
});