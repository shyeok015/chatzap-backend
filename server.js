const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST", "OPTIONS"],
        credentials: true
    }
});

app.use(cors({
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    credentials: true
}));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.json());

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/favicon.ico', (req, res) => res.status(204).end());

const usersDb = new Map();
let userCounter = 0;
const chats = [];
const messages = {};
const statuses = [];
const polls = {};
const processedMessages = new Set();
const connectedUsers = new Map();
const disappearingMessages = {};

// मेमोरी लीक रोकने के लिए processedMessages को समय-समय पर साफ करें
setInterval(() => {
    if (processedMessages.size > 10000) { // 10,000 मैसेज ID से ज्यादा होने पर साफ करें
        processedMessages.clear();
        console.log('processedMessages साफ किया गया');
    }
}, 60 * 60 * 1000); // हर घंटे चेक करें

console.log('Initial usersDb:', Array.from(usersDb.values()));
console.log('Initial chats:', chats);

app.post('/register', (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'यूज़रनेम और पासवर्ड ज़रूरी हैं' });
        }
        if (usersDb.has(username)) {
            return res.status(400).json({ success: false, message: 'यूज़रनेम पहले से मौजूद है' });
        }
        userCounter++;
        const userId = `user${userCounter}`;
        const newUser = { 
            password, 
            userId, 
            profilePic: "/placeholder.png", 
            status: "Available", 
            bio: "Hi! I am using ChatZap",
            username,
            contacts: []
        };
        usersDb.set(username, newUser);
        console.log('Registered user:', newUser);
        res.json({ success: true, userId, profile: { profilePic: newUser.profilePic, status: newUser.status, bio: newUser.bio, username: newUser.username } });
    } catch (error) {
        console.error('Error in register:', error);
        res.status(500).json({ success: false, message: 'सर्वर त्रुटि, कृपया फिर से कोशिश करें' });
    }
});

app.post('/login', (req, res) => {
    try {
        const { username, password } = req.body;
        const user = usersDb.get(username);
        if (user && user.password === password) {
            res.json({ success: true, userId: user.userId, profile: { profilePic: user.profilePic, status: user.status, bio: user.bio, username: user.username, password: user.password } });
        } else {
            res.status(401).json({ success: false, message: 'गलत यूज़रनेम या पासवर्ड' });
        }
    } catch (error) {
        console.error('Error in login:', error);
        res.status(500).json({ success: false, message: 'सर्वर त्रुटि, कृपया फिर से कोशिश करें' });
    }
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './uploads';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);
        cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

app.post('/upload', upload.single('file'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'कोई फाइल अपलोड नहीं हुई' });
        const filePath = `http://localhost:3000/uploads/${req.file.filename}`;
        res.json({ filePath });
    } catch (error) {
        console.error('Error in upload:', error);
        res.status(500).json({ success: false, message: 'सर्वर त्रुटि, कृपया फिर से कोशिश करें' });
    }
});

app.post('/updateProfile', upload.single('profilePic'), (req, res) => {
    try {
        const { userId, status, bio, password } = req.body;
        const user = Array.from(usersDb.values()).find(u => u.userId === userId);
        if (user) {
            if (req.file) user.profilePic = `http://localhost:3000/uploads/${req.file.filename}`;
            if (status) user.status = status;
            if (bio) user.bio = bio;
            if (password) user.password = password;
            io.emit('profileUpdated', { userId, profilePic: user.profilePic, status: user.status, bio: user.bio, username: user.username });
            res.json({ 
                success: true, 
                profile: { 
                    profilePic: user.profilePic, 
                    status: user.status, 
                    bio: user.bio, 
                    username: user.username, 
                    password: user.password 
                } 
            });
        } else {
            res.status(404).json({ success: false, message: 'यूज़र नहीं मिला' });
        }
    } catch (error) {
        console.error('Error in updateProfile:', error);
        res.status(500).json({ success: false, message: 'सर्वर त्रुटि, कृपया फिर से कोशिश करें' });
    }
});

app.post('/addContact', (req, res) => {
    try {
        const { username, currentUserId } = req.body;
        const currentUser = Array.from(usersDb.values()).find(u => u.userId === currentUserId);
        const contact = usersDb.get(username);

        if (!username || !contact || !currentUser) {
            return res.status(400).json({ success: false, message: 'यूज़र रजिस्टर्ड नहीं है या कॉन्टैक्ट यूज़रनेम अमान्य है' });
        }
        if (username === currentUser.username) {
            return res.status(400).json({ success: false, message: 'आप स्वयं को कॉन्टैक्ट के रूप में नहीं जोड़ सकते' });
        }

        if (!currentUser.contacts.includes(contact.userId)) {
            currentUser.contacts.push(contact.userId);
        }
        const mutualContact = Array.from(usersDb.values()).find(u => u.userId === contact.userId);
        if (mutualContact && !mutualContact.contacts.includes(currentUserId)) {
            mutualContact.contacts.push(currentUserId);
        }

        let existingChat = chats.find(chat => 
            chat.participants && 
            chat.participants.length === 2 && 
            chat.participants.includes(currentUserId) && 
            chat.participants.includes(contact.userId)
        );

        console.log('Before addContact - Existing chats:', JSON.stringify(chats, null, 2));
        if (!existingChat) {
            for (let i = chats.length - 1; i >= 0; i--) {
                if (chats[i].participants && 
                    chats[i].participants.length === 2 && 
                    chats[i].participants.includes(currentUserId) && 
                    chats[i].participants.includes(contact.userId)) {
                    const chatId = chats[i].id;
                    chats.splice(i, 1);
                    if (messages[chatId]) {
                        delete messages[chatId];
                    }
                }
            }
            const newChat = { 
                id: chats.length + 1, 
                name: contact.username,
                profilePic: contact.profilePic, 
                userId: contact.userId, 
                isGroup: false, 
                lastMessage: "",
                participants: [currentUserId, contact.userId]
            };
            chats.push(newChat);
            existingChat = newChat;
            console.log('After addContact - New chat added:', JSON.stringify(newChat, null, 2));
        }

        const currentUserChats = chats
            .filter(c => (c.participants && c.participants.includes(currentUserId)) || (c.isGroup && c.members && c.members.includes(currentUserId)))
            .map(c => ({ ...c, messages: messages[c.id] || [] }));

        const contactUserChats = chats
            .filter(c => (c.participants && c.participants.includes(contact.userId)) || (c.isGroup && c.members && c.members.includes(contact.userId)))
            .map(c => ({ ...c, messages: messages[c.id] || [] }));

        const currentUserSocket = connectedUsers.get(currentUserId);
        if (currentUserSocket) {
            io.to(currentUserSocket).emit('chatList', currentUserChats);
        } else {
            console.warn('No socket found for currentUserId:', currentUserId);
        }

        const contactSocket = connectedUsers.get(contact.userId);
        if (contactSocket) {
            io.to(contactSocket).emit('chatList', contactUserChats);
        } else {
            console.warn('No socket found for contact.userId:', contact.userId);
        }

        res.json({ success: true, contact: existingChat });
    } catch (error) {
        console.error('Error in addContact:', error);
        res.status(500).json({ success: false, message: 'सर्वर त्रुटि, कृपया फिर से कोशिश करें', error: error.message });
    }
});

app.post('/createGroup', (req, res) => {
    try {
        const { name, members, creatorId } = req.body;
        const creator = Array.from(usersDb.values()).find(u => u.userId === creatorId);

        if (!name || !members || members.length === 0 || !creatorId || !creator) {
            return res.status(400).json({ success: false, message: 'ग्रुप का नाम, सदस्य और क्रिएटर ID ज़रूरी हैं' });
        }

        const validMembers = members.filter(memberId => {
            const member = Array.from(usersDb.values()).find(u => u.userId === memberId);
            return member && (creator.contacts.includes(memberId) || member.contacts.includes(creatorId));
        });

        if (validMembers.length === 0) {
            return res.status(400).json({ success: false, message: 'कोई वैध सदस्य नहीं मिला जो आपके कॉन्टैक्ट में हो या जिसके कॉन्टैक्ट में आप हों' });
        }

        if (!validMembers.includes(creatorId)) validMembers.push(creatorId);

        const newGroup = { 
            id: chats.length + 1, 
            name, 
            profilePic: "/placeholder.png", 
            members: validMembers, 
            isGroup: true, 
            lastMessage: "", 
            creatorId
        };
        chats.push(newGroup);
        console.log('Created group:', newGroup);
        const updatedChats = chats.map(c => ({ ...c, messages: messages[c.id] || [] }));
        io.emit('chatList', updatedChats);
        res.json({ success: true, group: newGroup });
    } catch (error) {
        console.error('Error in createGroup:', error);
        res.status(500).json({ success: false, message: 'सर्वर त्रुटि, कृपया फिर से कोशिश करें' });
    }
});

app.post('/updateGroup', upload.single('profilePic'), (req, res) => {
    try {
        const { groupId, name, creatorId } = req.body;
        const group = chats.find(c => c.id === parseInt(groupId) && c.isGroup && c.creatorId === creatorId);

        if (!group) {
            return res.status(403).json({ success: false, message: 'ग्रुप नहीं मिला या आप क्रिएटर नहीं हैं' });
        }

        if (name) group.name = name;
        if (req.file) group.profilePic = `http://localhost:3000/uploads/${req.file.filename}`;

        const updatedChats = chats.map(c => ({ ...c, messages: messages[c.id] || [] }));
        io.emit('chatList', updatedChats);
        res.json({ success: true, group });
    } catch (error) {
        console.error('Error in updateGroup:', error);
        res.status(500).json({ success: false, message: 'सर्वर त्रुटि, कृपया फिर से कोशिश करें' });
    }
});

app.post('/addGroupMember', (req, res) => {
    try {
        console.log('addGroupMember Request Body:', req.body);
        const { groupId, memberId, creatorId } = req.body;
        const group = chats.find(c => c.id === parseInt(groupId) && c.isGroup);
        const creator = Array.from(usersDb.values()).find(u => u.userId === creatorId);
        const member = Array.from(usersDb.values()).find(u => u.userId === memberId);

        console.log('Group:', group, 'Creator:', creator, 'Member:', member);
        console.log('Users DB:', Array.from(usersDb.values()));
        console.log('Chats:', chats);

        if (!group) return res.status(404).json({ success: false, message: 'ग्रुप नहीं मिला' });
        if (!creator) return res.status(404).json({ success: false, message: 'क्रिएटर नहीं मिला' });
        if (!member) return res.status(404).json({ success: false, message: 'सदस्य नहीं मिला' });

        if (creatorId !== group.creatorId) {
            return res.status(403).json({ success: false, message: 'केवल ग्रुप क्रिएटर ही सदस्य जोड़ सकता है' });
        }

        if (!group.members.includes(memberId)) {
            group.members.push(memberId);
            const updatedChats = chats.map(c => ({ ...c, messages: messages[c.id] || [] }));
            io.emit('chatList', updatedChats);
            res.json({ success: true, group });
        } else {
            res.json({ success: false, message: 'सदस्य पहले से ग्रुप में है' });
        }
    } catch (error) {
        console.error('Error in addGroupMember:', error);
        res.status(500).json({ success: false, message: 'सर्वर त्रुटि, कृपया फिर से कोशिश करें' });
    }
});

app.post('/removeGroupMember', (req, res) => {
    try {
        console.log('removeGroupMember Request Body:', req.body);
        const { groupId, memberId, creatorId } = req.body;
        const group = chats.find(c => c.id === parseInt(groupId) && c.isGroup);

        console.log('Group:', group);
        if (!group) return res.status(404).json({ success: false, message: 'ग्रुप नहीं मिला' });

        const creator = Array.from(usersDb.values()).find(u => u.userId === creatorId);
        console.log('Creator:', creator);
        if (!creator) return res.status(404).json({ success: false, message: 'क्रिएटर नहीं मिला' });

        const member = Array.from(usersDb.values()).find(u => u.userId === memberId);
        console.log('Member:', member);
        if (!member) return res.status(404).json({ success: false, message: 'सदस्य नहीं मिला' });

        if (creatorId !== group.creatorId) {
            return res.status(403).json({ success: false, message: 'केवल ग्रुप क्रिएटर ही सदस्य हटा सकता है' });
        }

        const memberIndex = group.members.indexOf(memberId);
        if (memberIndex === -1) {
            return res.status(400).json({ success: false, message: 'सदस्य ग्रुप में नहीं है' });
        }

        group.members.splice(memberIndex, 1);
        const updatedChats = chats.map(c => ({ ...c, messages: messages[c.id] || [] }));
        io.emit('chatList', updatedChats);
        console.log('Member removed successfully, Updated Group:', group);
        res.json({ success: true, group });
    } catch (error) {
        console.error('Error in removeGroupMember:', error);
        res.status(500).json({ success: false, message: 'सर्वर त्रुटि, कृपया फिर से कोशिश करें' });
    }
});

app.get('/getUsers', (req, res) => {
    try {
        const { userId } = req.query;
        const user = Array.from(usersDb.values()).find(u => u.userId === userId);

        if (!user) return res.status(404).json({ success: false, message: 'यूज़र नहीं मिला' });

        const mutualContacts = Array.from(usersDb.values()).filter(otherUser => {
            return user.contacts.includes(otherUser.userId) || otherUser.contacts.includes(user.userId);
        });

        const usersList = mutualContacts.map(user => ({
            userId: user.userId,
            profilePic: user.profilePic,
            status: user.status,
            bio: user.bio,
            username: user.username
        }));

        res.json(usersList);
    } catch (error) {
        console.error('Error in getUsers:', error);
        res.status(500).json({ success: false, message: 'सर्वर त्रुटि, कृपया फिर से कोशिश करें' });
    }
});

app.post('/removeContact', (req, res) => {
    try {
        const { userId, contactId } = req.body;
        const currentUser = Array.from(usersDb.values()).find(u => u.userId === userId);
        const contactUser = Array.from(usersDb.values()).find(u => u.userId === contactId);

        if (!currentUser || !contactUser) {
            return res.status(404).json({ success: false, message: 'यूज़र या कॉन्टैक्ट नहीं मिला' });
        }

        const contactIndex = currentUser.contacts.indexOf(contactId);
        if (contactIndex === -1) {
            return res.status(400).json({ success: false, message: 'यह कॉन्टैक्ट आपके संपर्क में नहीं है' });
        }

        currentUser.contacts.splice(contactIndex, 1);
        const mutualContactIndex = contactUser.contacts.indexOf(userId);
        if (mutualContactIndex !== -1) {
            contactUser.contacts.splice(mutualContactIndex, 1);
        }

        const chatIndex = chats.findIndex(chat => 
            chat.participants && 
            chat.participants.length === 2 && 
            chat.participants.includes(userId) && 
            chat.participants.includes(contactId)
        );
        if (chatIndex !== -1) {
            const chatId = chats[chatIndex].id;
            chats.splice(chatIndex, 1);
            if (messages[chatId]) {
                delete messages[chatId];
            }
        }

        const currentUserChats = chats
            .filter(c => (c.participants && c.participants.includes(userId)) || (c.isGroup && c.members && c.members.includes(userId)))
            .map(c => ({ ...c, messages: messages[c.id] || [] }));

        const contactUserChats = chats
            .filter(c => (c.participants && c.participants.includes(contactId)) || (c.isGroup && c.members && c.members.includes(contactId)))
            .map(c => ({ ...c, messages: messages[c.id] || [] }));

        const currentUserSocket = connectedUsers.get(userId);
        if (currentUserSocket) {
            io.to(currentUserSocket).emit('chatList', currentUserChats);
        }

        const contactSocket = connectedUsers.get(contactId);
        if (contactSocket) {
            io.to(contactSocket).emit('chatList', contactUserChats);
        }

        res.json({ success: true, message: 'कॉन्टैक्ट सफलतापूर्वक हटाया गया' });
    } catch (error) {
        console.error('Error in removeContact:', error);
        res.status(500).json({ success: false, message: 'सर्वर त्रुटि, कृपया फिर से कोशिश करें' });
    }
});

app.post('/addStatus', upload.single('file'), (req, res) => {
    try {
        const { userId, text } = req.body;
        if (userId) {
            let media = req.file ? `http://localhost:3000/uploads/${req.file.filename}` : null;
            const user = Array.from(usersDb.values()).find(u => u.userId === userId);
            const username = user ? user.username : 'अज्ञात';
            const newStatus = { 
                id: statuses.length + 1, 
                userId, 
                username, 
                profilePic: user ? user.profilePic : '/placeholder.png',
                text: text || '', 
                media, 
                timestamp: Date.now() 
            };
            statuses.push(newStatus);

            connectedUsers.forEach((socketId, connectedUserId) => {
                const connectedUser = Array.from(usersDb.values()).find(u => u.userId === connectedUserId);
                if (connectedUser) {
                    const isMutualContact = (connectedUser.contacts.includes(userId) && user.contacts.includes(connectedUserId)) || connectedUserId === userId;
                    if (isMutualContact) {
                        const visibleStatuses = statuses.filter(status => 
                            status.userId === connectedUserId || 
                            (connectedUser.contacts.includes(status.userId) && Array.from(usersDb.values()).find(u => u.userId === status.userId)?.contacts.includes(connectedUserId))
                        );
                        io.to(socketId).emit('statusList', visibleStatuses);
                    }
                }
            });

            res.json({ success: true, status: newStatus });
        } else {
            res.status(400).json({ success: false, message: 'यूज़र ID ज़रूरी है' });
        }
    } catch (error) {
        console.error('Error in addStatus:', error);
        res.status(500).json({ success: false, message: 'सर्वर त्रुटि, कृपया फिर से कोशिश करें' });
    }
});

app.get('/getPoll/:pollId', (req, res) => {
    try {
        const poll = polls[req.params.pollId];
        if (!poll) {
            return res.status(404).json({ success: false, message: 'पोल नहीं मिला' });
        }
        if (!poll.question || !Array.isArray(poll.options) || !Array.isArray(poll.votes)) {
            return res.status(500).json({ success: false, message: 'पोल डेटा अमान्य' });
        }
        res.json({ success: true, poll });
    } catch (error) {
        console.error('पोल डेटा लाने में त्रुटि:', error);
        res.status(500).json({ success: false, message: 'सर्वर में त्रुटि, पोल डेटा लोड नहीं हो सका' });
    }
});

app.get('/getProfile', (req, res) => {
    try {
        const userId = req.query.userId;
        const user = Array.from(usersDb.values()).find(u => u.userId === userId);
        if (user) {
            const profile = {
                username: user.username,
                profilePic: user.profilePic,
                status: user.status,
                bio: user.bio,
                password: user.password
            };
            res.json({ success: true, profile });
        } else {
            res.status(404).json({ success: false, message: 'यूज़र नहीं मिला' });
        }
    } catch (error) {
        console.error('Error in getProfile:', error);
        res.status(500).json({ success: false, message: 'सर्वर त्रुटि, कृपया फिर से कोशिश करें' });
    }
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ success: false, message: 'सर्वर त्रुटि, कृपया फिर से कोशिश करें' });
});

io.on('connection', (socket) => {
    console.log('नया क्लाइंट कनेक्ट हुआ:', socket.id);
    
    socket.on('register', (userId) => {
        try {
            connectedUsers.set(userId, socket.id);
            socket.userId = userId;
            
            const user = Array.from(usersDb.values()).find(u => u.userId === userId);
            if (user) {
                const visibleStatuses = statuses.filter(status => 
                    status.userId === userId || 
                    (user.contacts.includes(status.userId) && Array.from(usersDb.values()).find(u => u.userId === status.userId)?.contacts.includes(userId))
                );
                const userChats = chats.filter(c => 
                    c.participants?.includes(userId) || 
                    (c.isGroup && c.members?.includes(userId))
                ).map(c => ({ ...c, messages: messages[c.id] || [] }));
                socket.emit('chatList', userChats);
                socket.emit('statusList', visibleStatuses);
            }
        } catch (error) {
            console.error('Error in socket register:', error);
            socket.emit('error', { message: 'सर्वर त्रुटि, कृपया फिर से कोशिश करें' });
        }
    });

    socket.on('loadChat', (chatId) => {
        try {
            const chatMessages = messages[chatId] || [];
            socket.emit('chatMessages', { chatId, messages: chatMessages });
        } catch (error) {
            console.error('Error in loadChat:', error);
            socket.emit('error', { message: 'चैट लोड करने में त्रुटि' });
        }
    });

    socket.on('sendMessage', ({ chatId, text, sender, receiverId, media, voice, messageId }) => {
        try {
            if (processedMessages.has(messageId)) return;
            processedMessages.add(messageId);
        
            const chat = chats.find(c => c.id === chatId);
            if (!chat) {
                console.error('Chat not found for chatId:', chatId);
                return;
            }
        
            const participants = chat.isGroup ? chat.members : chat.participants;
            if (!participants || !participants.includes(sender)) {
                console.error('Sender not in chat:', sender, chatId, 'Participants:', participants);
                return;
            }
        
            const senderUser = Array.from(usersDb.values()).find(u => u.userId === sender);
            const username = senderUser ? senderUser.username : 'अज्ञात';
        
            const newMessage = { 
                id: messageId, 
                sender, 
                username,
                text: text || '', 
                media, 
                voice, 
                timestamp: Date.now(), 
                readBy: [],
                status: 'sent',
                reactions: {}
            };
        
            if (!messages[chatId]) messages[chatId] = [];
            messages[chatId].push(newMessage);
            chat.lastMessage = text || (media ? 'मीडिया' : (voice ? 'वॉइस मैसेज' : ''));
        
            if (chat.isGroup) {
                chat.members?.forEach(member => { // यहाँ टाइपो ठीक किया गया (for MarlboroughEach → forEach)
                    const memberSocket = connectedUsers.get(member);
                    if (memberSocket) {
                        io.to(memberSocket).emit('newMessage', { chatId, message: newMessage });
                    }
                });
            } else {
                const receiverSocket = connectedUsers.get(receiverId);
                if (receiverSocket) {
                    io.to(receiverSocket).emit('newMessage', { chatId, message: newMessage });
                }
                const senderSocket = connectedUsers.get(sender);
                if (senderSocket) {
                    io.to(senderSocket).emit('newMessage', { chatId, message: newMessage });
                }
            }
        
            const updatedChats = chats.filter(c => 
                (c.participants && (c.participants.includes(sender) || c.participants.includes(receiverId))) || 
                (c.isGroup && c.members?.includes(sender))
            ).map(c => ({ ...c, messages: messages[c.id] || [] }));
        
            if (chat.isGroup) {
                chat.members?.forEach(member => {
                    const memberSocket = connectedUsers.get(member);
                    if (memberSocket) {
                        const memberChats = chats.filter(c => 
                            (c.participants && c.participants.includes(member)) || 
                            (c.isGroup && c.members?.includes(member))
                        ).map(c => ({ ...c, messages: messages[c.id] || [] }));
                        io.to(memberSocket).emit('chatList', memberChats);
                    }
                });
            } else {
                const senderSocket = connectedUsers.get(sender);
                if (senderSocket) {
                    const senderChats = chats.filter(c => 
                        (c.participants && c.participants.includes(sender)) || 
                        (c.isGroup && c.members?.includes(sender))
                    ).map(c => ({ ...c, messages: messages[c.id] || [] }));
                    io.to(senderSocket).emit('chatList', senderChats);
                }
                const receiverSocket = connectedUsers.get(receiverId);
                if (receiverSocket) {
                    const receiverChats = chats.filter(c => 
                        (c.participants && c.participants.includes(receiverId)) || 
                        (c.isGroup && c.members?.includes(receiverId))
                    ).map(c => ({ ...c, messages: messages[c.id] || [] }));
                    io.to(receiverSocket).emit('chatList', receiverChats);
                }
            }
        } catch (error) {
            console.error('Error in sendMessage:', error);
            socket.emit('error', { message: 'मैसेज भेजने में त्रुटि' });
        }
    });

    socket.on('markMessagesAsRead', ({ chatId, userId }) => {
        try {
            const chat = chats.find(c => c.id === chatId);
            if (!chat || !messages[chatId]) return;
    
            const updatedMessages = messages[chatId].map(msg => {
                if (msg && typeof msg === 'object' && msg.sender !== undefined) {
                    if (msg.sender !== userId && !msg.readBy?.includes(userId)) {
                        const updatedReadBy = [...(msg.readBy || []), userId];
                        let updatedStatus = msg.status;
                        if (chat.isGroup) {
                            const eligibleMembers = chat.members ? chat.members.filter(m => m !== msg.sender) : [];
                            if (eligibleMembers.length > 0 && updatedReadBy.length === eligibleMembers.length) {
                                updatedStatus = 'read';
                            } else {
                                updatedStatus = 'delivered';
                            }
                        } else {
                            updatedStatus = 'read';
                        }
                        return { ...msg, readBy: updatedReadBy, status: updatedStatus };
                    }
                }
                return msg;
            });
    
            messages[chatId] = updatedMessages;
    
            const participants = chat.isGroup ? (chat.members || []) : (chat.participants || []);
            participants.forEach(member => {
                const memberSocket = connectedUsers.get(member);
                if (memberSocket) {
                    io.to(memberSocket).emit('chatMessages', { chatId, messages: updatedMessages });
                }
            });
    
            const updatedChats = chats.map(c => ({
                ...c,
                messages: messages[c.id] || []
            }));
            io.emit('chatList', updatedChats);
            console.log('Messages marked as read for chatId:', chatId, 'Updated Messages:', updatedMessages);
        } catch (error) {
            console.error('Messages marking as read failed:', error);
            socket.emit('markReadError', { message: 'मैसेज को पढ़ा गया के रूप में चिह्नित करने में त्रुटि' });
        }
    });

    socket.on('deleteMessage', ({ chatId, messageId, userId }) => {
        try {
            const chat = chats.find(c => c.id === chatId);
            if (!chat || !messages[chatId]) return;

            const messageIndex = messages[chatId].findIndex(m => m.id === messageId && m.sender === userId);
            if (messageIndex !== -1) {
                messages[chatId].splice(messageIndex, 1);
                if (chat.isGroup) {
                    chat.members?.forEach(member => {
                        const memberSocket = connectedUsers.get(member);
                        if (memberSocket) io.to(memberSocket).emit('messageDeleted', { chatId, messageId });
                    });
                } else {
                    chat.participants?.forEach(participant => {
                        const participantSocket = connectedUsers.get(participant);
                        if (participantSocket) io.to(participantSocket).emit('messageDeleted', { chatId, messageId });
                    });
                }
            }
        } catch (error) {
            console.error('Error in deleteMessage:', error);
            socket.emit('error', { message: 'मैसेज हटाने में त्रुटि' });
        }
    });

    socket.on('addReaction', ({ chatId, messageId, emoji, userId }) => {
        try {
            const chat = chats.find(c => c.id === chatId);
            if (!chat || !messages[chatId]) return;
    
            const message = messages[chatId].find(m => m.id === messageId);
            if (message) {
                if (!message.reactions) message.reactions = {};
                message.reactions[userId] = emoji;
    
                if (chat.isGroup) {
                    chat.members?.forEach(member => {
                        const memberSocket = connectedUsers.get(member);
                        if (memberSocket) {
                            io.to(memberSocket).emit('reactionAdded', { chatId, messageId, userId, emoji });
                        }
                    });
                } else {
                    chat.participants?.forEach(participant => {
                        const participantSocket = connectedUsers.get(participant);
                        if (participantSocket) {
                            io.to(participantSocket).emit('reactionAdded', { chatId, messageId, userId, emoji });
                        }
                    });
                }
            }
        } catch (error) {
            console.error('Error in addReaction:', error);
            socket.emit('error', { message: 'रिएक्शन जोड़ने में त्रुटि' });
        }
    });

    socket.on('deleteStatus', ({ statusId, userId }) => {
        try {
            const statusIndex = statuses.findIndex(s => s.id === statusId && s.userId === userId);
            if (statusIndex !== -1) {
                statuses.splice(statusIndex, 1);
                io.emit('statusDeleted', { statusId });
                connectedUsers.forEach((socketId, connectedUserId) => {
                    const connectedUser = Array.from(usersDb.values()).find(u => u.userId === connectedUserId);
                    if (connectedUser) {
                        const visibleStatuses = statuses.filter(status => 
                            status.userId === connectedUserId || 
                            (connectedUser.contacts.includes(status.userId) && Array.from(usersDb.values()).find(u => u.userId === status.userId)?.contacts.includes(connectedUserId))
                        );
                        io.to(socketId).emit('statusList', visibleStatuses);
                    }
                });
            }
        } catch (error) {
            console.error('Error in deleteStatus:', error);
            socket.emit('error', { message: 'स्टेटस हटाने में त्रुटि' });
        }
    });

    socket.on('createPoll', ({ chatId, question, options, sender }) => {
        try {
            const chat = chats.find(c => c.id === chatId);
            if (!chat) return;
    
            if (!question || !Array.isArray(options) || options.length < 2) {
                socket.emit('pollError', { message: 'प्रश्न और कम से कम 2 विकल्प ज़रूरी हैं' });
                return;
            }
    
            let isDuplicate = false;
            for (let pollId in polls) {
                const existingPoll = polls[pollId];
                if (existingPoll.chatId === chatId && existingPoll.question === question && existingPoll.sender === sender) {
                    isDuplicate = true;
                    break;
                }
            }
    
            if (isDuplicate) {
                console.log('डुप्लिकेट पोल रोका गया:', question);
                socket.emit('pollError', { message: 'यह पोल पहले से मौजूद है!' });
                return;
            }
    
            const pollId = `${chatId}-${Date.now()}`;
            const poll = { 
                id: pollId, 
                chatId, 
                question, 
                options, 
                votes: options.map(() => []), 
                sender, 
                timestamp: Date.now() 
            };
            polls[pollId] = poll;
            console.log(`पोल बनाया गया: ${pollId}, डेटा:`, poll);
    
            const messageId = `${chatId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const senderUser = Array.from(usersDb.values()).find(u => u.userId === sender);
            const username = senderUser ? senderUser.username : 'अज्ञात';
            const newMessage = { 
                id: messageId, 
                sender, 
                username, 
                text: '', 
                media: null, 
                voice: null, 
                poll: pollId, 
                timestamp: Date.now(), 
                status: 'sent',
                readBy: [],
                reactions: {}
            };
    
            if (!messages[chatId]) messages[chatId] = [];
            messages[chatId].push(newMessage);
            chat.lastMessage = `पोल: ${question}`;
    
            if (chat.isGroup) {
                chat.members?.forEach(member => {
                    const memberSocket = connectedUsers.get(member);
                    if (memberSocket) {
                        io.to(memberSocket).emit('newPoll', poll);
                    }
                });
            } else {
                chat.participants?.forEach(participant => {
                    const participantSocket = connectedUsers.get(participant);
                    if (participantSocket) {
                        io.to(participantSocket).emit('newPoll', poll);
                    }
                });
            }
    
            const updatedChats = chats.map(c => ({ ...c, messages: messages[c.id] || [] }));
            io.emit('chatList', updatedChats);
        } catch (error) {
            console.error('Error in createPoll:', error);
            socket.emit('pollError', { message: 'पोल बनाने में त्रुटि' });
        }
    });

    socket.on('votePoll', ({ chatId, pollId, optionIndex, userId }) => {
        try {
            console.log('वोट प्राप्त हुआ:', { chatId, pollId, optionIndex, userId });
            const poll = polls[pollId];
            if (!poll || optionIndex < 0 || optionIndex >= poll.options.length || poll.votes[optionIndex].includes(userId)) {
                console.warn('अमान्य वोट:', { pollId, optionIndex, userId });
                socket.emit('pollError', { message: 'अमान्य वोट या आप पहले ही वोट कर चुके हैं' });
                return;
            }
    
            poll.votes[optionIndex].push(userId);
            console.log('वोट सफलतापूर्वक अपडेट हुआ:', poll);
    
            const chat = chats.find(c => c.id === chatId);
            if (chat) {
                const updatedPoll = { ...poll };
                if (chat.isGroup) {
                    chat.members?.forEach(member => {
                        const memberSocket = connectedUsers.get(member);
                        if (memberSocket) {
                            io.to(memberSocket).emit('pollVote', updatedPoll);
                        }
                    });
                } else {
                    chat.participants?.forEach(participant => {
                        const participantSocket = connectedUsers.get(participant);
                        if (participantSocket) {
                            io.to(participantSocket).emit('pollVote', updatedPoll);
                        }
                    });
                }
            }
        } catch (error) {
            console.error('Error in votePoll:', error);
            socket.emit('pollError', { message: 'वोट करने में त्रुटि' });
        }
    });

    socket.on('deletePoll', ({ chatId, pollId, userId }) => {
        try {
            const poll = polls[pollId];
            if (!poll || poll.sender !== userId) {
                socket.emit('pollDeleteError', { message: 'पोल नहीं मिला या आप इसका मालिक नहीं हैं' });
                return;
            }
    
            delete polls[pollId];
    
            if (messages[chatId]) {
                const messageIndex = messages[chatId].findIndex(m => m.poll === pollId);
                if (messageIndex !== -1) {
                    const deletedMessageId = messages[chatId][messageIndex].id;
                    messages[chatId].splice(messageIndex, 1);
    
                    const chat = chats.find(c => c.id === chatId);
                    if (chat) {
                        chat.lastMessage = messages[chatId].length > 0
                            ? messages[chatId][messages[chatId].length - 1].text || 
                              (messages[chatId][messages[chatId].length - 1].media ? 'मीडिया' : 'कोई मैसेज नहीं')
                            : 'कोई मैसेज नहीं';
                    }
    
                    const chatToNotify = chats.find(c => c.id === chatId);
                    if (chatToNotify) {
                        if (chatToNotify.isGroup) {
                            chatToNotify.members?.forEach(member => {
                                const memberSocket = connectedUsers.get(member);
                                if (memberSocket) io.to(memberSocket).emit('messageDeleted', { chatId, messageId: deletedMessageId });
                            });
                        } else {
                            chatToNotify.participants?.forEach(participant => {
                                const participantSocket = connectedUsers.get(participant);
                                if (participantSocket) io.to(participantSocket).emit('messageDeleted', { chatId, messageId: deletedMessageId });
                            });
                        }
                    }
                }
            }
    
            const updatedChats = chats.map(c => ({ ...c, messages: messages[c.id] || [] }));
            io.emit('chatList', updatedChats);
    
            io.emit('pollDeleted', { pollId, chatId });
        } catch (error) {
            console.error('पोल हटाने में त्रुटि:', error);
            socket.emit('pollDeleteError', { message: 'पोल हटाने में सर्वर त्रुटि' });
        }
    });

    socket.on('getDisappearingSettings', (chatId) => {
        try {
            const duration = disappearingMessages[chatId]?.duration || 0;
            socket.emit('disappearingSettings', { chatId, duration });
        } catch (error) {
            console.error('Error in getDisappearingSettings:', error);
            socket.emit('error', { message: 'डिसअपीयरिंग सेटिंग्स प्राप्त करने में त्रुटि' });
        }
    });

    socket.on('setDisappearingMessages', ({ chatId, duration }) => {
        try {
            disappearingMessages[chatId] = { duration };
            const chat = chats.find(c => c.id === chatId);
            if (chat) {
                if (chat.isGroup) {
                    chat.members?.forEach(member => {
                        const memberSocket = connectedUsers.get(member);
                        if (memberSocket) io.to(memberSocket).emit('disappearingMessagesSet', { chatId, duration });
                    });
                } else {
                    chat.participants?.forEach(participant => {
                        const participantSocket = connectedUsers.get(participant);
                        if (participantSocket) io.to(participantSocket).emit('disappearingMessagesSet', { chatId, duration });
                    });
                }

                if (duration > 0 && messages[chatId]) {
                    const now = Date.now();
                    messages[chatId].forEach(msg => {
                        const timeLeft = duration - (now - msg.timestamp);
                        if (timeLeft > 0) {
                            setTimeout(() => {
                                if (messages[chatId]) {
                                    io.emit('messageDeleted', { chatId, messageId: msg.id });
                                    messages[chatId] = messages[chatId].filter(m => m.id !== msg.id);
                                }
                            }, timeLeft);
                        }
                    });
                }
            }
        } catch (error) {
            console.error('Error in setDisappearingMessages:', error);
            socket.emit('error', { message: 'डिसअपीयरिंग मैसेज सेट करने में त्रुटि' });
        }
    });

    socket.on('call-user', ({ receiverId, offer, callType }) => {
        try {
            console.log(`Call initiated from ${socket.userId} to ${receiverId} with type ${callType}`);
            const receiverSocket = connectedUsers.get(receiverId);
            if (receiverSocket) {
                io.to(receiverSocket).emit('call-received', {
                    callerId: socket.userId,
                    offer,
                    callType
                });
                console.log(`Call event sent to ${receiverId}`);
            } else {
                console.log(`Receiver ${receiverId} not connected`);
            }
        } catch (error) {
            console.error('Error in call-user:', error);
            socket.emit('error', { message: 'कॉल शुरू करने में त्रुटि' });
        }
    });

    socket.on('call-accepted', ({ callerId, answer }) => {
        try {
            console.log(`Call accepted by ${socket.userId} for caller ${callerId}`);
            const callerSocket = connectedUsers.get(callerId);
            if (callerSocket) {
                io.to(callerSocket).emit('call-accepted', { answer });
                console.log(`Call accepted event sent to ${callerId}`);
            }
        } catch (error) {
            console.error('Error in call-accepted:', error);
            socket.emit('error', { message: 'कॉल स्वीकार करने में त्रुटि' });
        }
    });

    socket.on('ice-candidate', ({ receiverId, candidate }) => {
        try {
            console.log(`ICE candidate from ${socket.userId} to ${receiverId}`);
            const receiverSocket = connectedUsers.get(receiverId);
            if (receiverSocket) {
                io.to(receiverSocket).emit('ice-candidate', { candidate });
                console.log(`ICE candidate sent to ${receiverId}`);
            }
        } catch (error) {
            console.error('Error in ice-candidate:', error);
            socket.emit('error', { message: 'ICE कैंडिडेट भेजने में त्रुटि' });
        }
    });

    socket.on('end-call', ({ receiverId }) => {
        try {
            console.log(`Call ended by ${socket.userId} to ${receiverId}`);
            const receiverSocket = connectedUsers.get(receiverId);
            if (receiverSocket) {
                io.to(receiverSocket).emit('call-ended');
                console.log(`Call ended event sent to ${receiverId}`);
            }
        } catch (error) {
            console.error('Error in end-call:', error);
            socket.emit('error', { message: 'कॉल समाप्त करने में त्रुटि' });
        }
    });

    socket.on('disconnect', () => {
        try {
            console.log('क्लाइंट डिस्कनेक्ट हुआ:', socket.id);
            connectedUsers.forEach((socketId, userId) => {
                if (socketId === socket.id) {
                    connectedUsers.delete(userId);
                }
            });
        } catch (error) {
            console.error('Error in disconnect:', error);
        }
    });
});

server.listen(3000, () => console.log('सर्वर पोर्ट 3000 पर चल रहा है'));