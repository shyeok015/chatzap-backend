const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "https://chatzap.xyz",
        methods: ["GET", "POST", "OPTIONS"],
        credentials: true
    }
});

const BASE_URL = "https://chatzap.xyz";

// MongoDB Atlas कनेक्शन
const mongoUri = "mongodb+srv://ayush:ayushAS123@cluster0.tl2q5se.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const client = new MongoClient(mongoUri);

let db, usersCollection, chatsCollection, messagesCollection, statusesCollection, pollsCollection;

async function connectToMongoDB() {
    try {
        await client.connect();
        db = client.db('chatApp');
        usersCollection = db.collection('users');
        chatsCollection = db.collection('chats');
        messagesCollection = db.collection('messages');
        statusesCollection = db.collection('statuses');
        pollsCollection = db.collection('polls');
        console.log('MongoDB Atlas से कनेक्ट हो गया');
    } catch (error) {
        console.error('MongoDB कनेक्शन में त्रुटि:', error);
        process.exit(1);
    }
}

connectToMongoDB();

app.use(cors({
    origin: 'https://chatzap.xyz',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    credentials: true
}));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.json());

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/favicon.ico', (req, res) => res.status(204).end());

const connectedUsers = new Map();
const disappearingMessages = {};

// फाइल अपलोड के लिए सेटअप
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './uploads';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);
        cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// रजिस्टर एंडपॉइंट
app.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'यूज़रनेम और पासवर्ड ज़रूरी हैं' });
        }

        const existingUser = await usersCollection.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'यूज़रनेम पहले से मौजूद है' });
        }

        const newUser = { 
            username,
            password, 
            profilePic: "/placeholder.png", 
            status: "Available", 
            bio: "Hi! I am using ChatZap",
            contacts: [],
            createdAt: new Date()
        };

        const result = await usersCollection.insertOne(newUser);
        const userId = result.insertedId.toString();

        console.log('नया यूज़र रजिस्टर्ड:', { username, userId });
        res.json({ 
            success: true, 
            userId, 
            profile: { 
                profilePic: newUser.profilePic, 
                status: newUser.status, 
                bio: newUser.bio, 
                username: newUser.username 
            } 
        });
    } catch (error) {
        console.error('रजिस्टर में त्रुटि:', error);
        res.status(500).json({ success: false, message: 'सर्वर त्रुटि, कृपया फिर से कोशिश करें' });
    }
});

// लॉगिन एंडपॉइंट
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await usersCollection.findOne({ username });

        if (user && user.password === password) {
            res.json({ 
                success: true, 
                userId: user._id.toString(), 
                profile: { 
                    profilePic: user.profilePic, 
                    status: user.status, 
                    bio: user.bio, 
                    username: user.username,
                    password: user.password 
                } 
            });
        } else {
            res.status(401).json({ success: false, message: 'गलत यूज़रनेम या पासवर्ड' });
        }
    } catch (error) {
        console.error('लॉगिन में त्रुटि:', error);
        res.status(500).json({ success: false, message: 'सर्वर त्रुटि, कृपया फिर से कोशिश करें' });
    }
});

// फाइल अपलोड एंडपॉइंट
app.post('/upload', upload.single('file'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'कोई फाइल अपलोड नहीं हुई' });
        const filePath = `https://chatzap.xyz/uploads/${req.file.filename}`;
        res.json({ filePath });
    } catch (error) {
        console.error('अपलोड में त्रुटि:', error);
        res.status(500).json({ success: false, message: 'सर्वर त्रुटि, कृपया फिर से कोशिश करें' });
    }
});

// प्रोफाइल अपडेट एंडपॉइंट
app.post('/updateProfile', upload.single('profilePic'), async (req, res) => {
    try {
        const { userId, status, bio, password } = req.body;
        const user = await usersCollection.findOne({ _id: new ObjectId(userId) });

        if (!user) {
            return res.status(404).json({ success: false, message: 'यूज़र नहीं मिला' });
        }

        const updates = {};
        if (req.file) updates.profilePic = `https://chatzap.xyz/uploads/${req.file.filename}`;
        if (status) updates.status = status;
        if (bio) updates.bio = bio;
        if (password) updates.password = password;

        await usersCollection.updateOne({ _id: new ObjectId(userId) }, { $set: updates });
        const updatedUser = await usersCollection.findOne({ _id: new ObjectId(userId) });

        io.emit('profileUpdated', { 
            userId, 
            profilePic: updatedUser.profilePic, 
            status: updatedUser.status, 
            bio: updatedUser.bio, 
            username: updatedUser.username 
        });

        res.json({ 
            success: true, 
            profile: { 
                profilePic: updatedUser.profilePic, 
                status: updatedUser.status, 
                bio: updatedUser.bio, 
                username: updatedUser.username, 
                password: updatedUser.password 
            } 
        });
    } catch (error) {
        console.error('प्रोफाइल अपडेट में त्रुटि:', error);
        res.status(500).json({ success: false, message: 'सर्वर त्रुटि, कृपया फिर से कोशिश करें' });
    }
});

// कॉन्टैक्ट जोड़ने का एंडपॉइंट
app.post('/addContact', async (req, res) => {
    try {
        const { username, currentUserId } = req.body;
        const currentUser = await usersCollection.findOne({ _id: new ObjectId(currentUserId) });
        const contact = await usersCollection.findOne({ username });

        if (!username || !contact || !currentUser) {
            return res.status(400).json({ success: false, message: 'यूज़र रजिस्टर्ड नहीं है या कॉन्टैक्ट यूज़रनेम अमान्य है' });
        }
        if (username === currentUser.username) {
            return res.status(400).json({ success: false, message: 'आप स्वयं को कॉन्टैक्ट के रूप में नहीं जोड़ सकते' });
        }

        const contactId = contact._id.toString();

        if (!currentUser.contacts.includes(contactId)) {
            await usersCollection.updateOne(
                { _id: new ObjectId(currentUserId) },
                { $addToSet: { contacts: contactId } }
            );
        }

        if (!contact.contacts.includes(currentUserId)) {
            await usersCollection.updateOne(
                { _id: contact._id },
                { $addToSet: { contacts: currentUserId } }
            );
        }

        let existingChat = await chatsCollection.findOne({
            isGroup: false,
            participants: { $all: [currentUserId, contactId], $size: 2 }
        });

        if (!existingChat) {
            const newChat = {
                name: contact.username,
                profilePic: contact.profilePic,
                userId: contactId,
                isGroup: false,
                lastMessage: "",
                participants: [currentUserId, contactId],
                createdAt: new Date()
            };

            const result = await chatsCollection.insertOne(newChat);
            existingChat = { ...newChat, id: result.insertedId.toString() };
        }

        const currentUserChats = await getChatsForUser(currentUserId);
        const contactUserChats = await getChatsForUser(contactId);

        const currentUserSocket = connectedUsers.get(currentUserId);
        if (currentUserSocket) {
            io.to(currentUserSocket).emit('chatList', currentUserChats);
        }

        const contactSocket = connectedUsers.get(contactId);
        if (contactSocket) {
            io.to(contactSocket).emit('chatList', contactUserChats);
        }

        res.json({ success: true, contact: existingChat });
    } catch (error) {
        console.error('कॉन्टैक्ट जोड़ने में त्रुटि:', error);
        res.status(500).json({ success: false, message: 'सर्वर त्रुटि, कृपया फिर से कोशिश करें', error: error.message });
    }
});

// ग्रुप बनाने का एंडपॉइंट
app.post('/createGroup', async (req, res) => {
    try {
        const { name, members, creatorId } = req.body;
        const creator = await usersCollection.findOne({ _id: new ObjectId(creatorId) });

        if (!name || !members || members.length === 0 || !creatorId || !creator) {
            return res.status(400).json({ success: false, message: 'ग्रुप का नाम, सदस्य और क्रिएटर ID ज़रूरी हैं' });
        }

        const validMembers = [];
        for (const memberId of members) {
            const member = await usersCollection.findOne({ _id: new ObjectId(memberId) });
            if (member && (creator.contacts.includes(memberId) || member.contacts.includes(creatorId))) {
                validMembers.push(memberId);
            }
        }

        if (validMembers.length === 0) {
            return res.status(400).json({ success: false, message: 'कोई वैध सदस्य नहीं मिला जो आपके कॉन्टैक्ट में हो या जिसके कॉन्टैक्ट में आप हों' });
        }

        if (!validMembers.includes(creatorId)) validMembers.push(creatorId);

        const newGroup = {
            name,
            profilePic: "/placeholder.png",
            members: validMembers,
            isGroup: true,
            lastMessage: "",
            creatorId,
            createdAt: new Date()
        };

        const result = await chatsCollection.insertOne(newGroup);
        const groupId = result.insertedId.toString();

        const updatedChats = await getChatsForUser(creatorId);
        io.emit('chatList', updatedChats);

        res.json({ success: true, group: { ...newGroup, id: groupId } });
    } catch (error) {
        console.error('ग्रुप बनाने में त्रुटि:', error);
        res.status(500).json({ success: false, message: 'सर्वर त्रुटि, कृपया फिर से कोशिश करें' });
    }
});

// ग्रुप अपडेट एंडपॉइंट
app.post('/updateGroup', upload.single('profilePic'), async (req, res) => {
    try {
        const { groupId, name, creatorId } = req.body;
        const group = await chatsCollection.findOne({ 
            _id: new ObjectId(groupId), 
            isGroup: true, 
            creatorId 
        });

        if (!group) {
            return res.status(403).json({ success: false, message: 'ग्रुप नहीं मिला या आप क्रिएटर नहीं हैं' });
        }

        const updates = {};
        if (name) updates.name = name;
        if (req.file) updates.profilePic = `https://chatzap.xyz/uploads/${req.file.filename}`;

        await chatsCollection.updateOne(
            { _id: new ObjectId(groupId) },
            { $set: updates }
        );

        const updatedChats = await getChatsForUser(creatorId);
        io.emit('chatList', updatedChats);

        res.json({ success: true, group: { ...group, ...updates, id: groupId } });
    } catch (error) {
        console.error('ग्रुप अपडेट में त्रुटि:', error);
        res.status(500).json({ success: false, message: 'सर्वर त्रुटि, कृपया फिर से कोशिश करें' });
    }
});

// ग्रुप में सदस्य जोड़ने का एंडपॉइंट
app.post('/addGroupMember', async (req, res) => {
    try {
        const { groupId, memberId, creatorId } = req.body;
        const group = await chatsCollection.findOne({ _id: new ObjectId(groupId), isGroup: true });
        const creator = await usersCollection.findOne({ _id: new ObjectId(creatorId) });
        const member = await usersCollection.findOne({ _id: new ObjectId(memberId) });

        if (!group) return res.status(404).json({ success: false, message: 'ग्रुप नहीं मिला' });
        if (!creator) return res.status(404).json({ success: false, message: 'क्रिएटर नहीं मिला' });
        if (!member) return res.status(404).json({ success: false, message: 'सदस्य नहीं मिला' });

        if (creatorId !== group.creatorId) {
            return res.status(403).json({ success: false, message: 'केवल ग्रुप क्रिएटर ही सदस्य जोड़ सकता है' });
        }

        if (!group.members.includes(memberId)) {
            await chatsCollection.updateOne(
                { _id: new ObjectId(groupId) },
                { $addToSet: { members: memberId } }
            );

            const updatedChats = await getChatsForUser(creatorId);
            io.emit('chatList', updatedChats);

            res.json({ success: true, group: { ...group, members: [...group.members, memberId] } });
        } else {
            res.json({ success: false, message: 'सदस्य पहले से ग्रुप में है' });
        }
    } catch (error) {
        console.error('सदस्य जोड़ने में त्रुटि:', error);
        res.status(500).json({ success: false, message: 'सर्वर त्रुटि, कृपया फिर से कोशिश करें' });
    }
});

// ग्रुप से सदस्य हटाने का एंडपॉइंट
app.post('/removeGroupMember', async (req, res) => {
    try {
        const { groupId, memberId, creatorId } = req.body;
        const group = await chatsCollection.findOne({ _id: new ObjectId(groupId), isGroup: true });

        if (!group) return res.status(404).json({ success: false, message: 'ग्रुप नहीं मिला' });

        const creator = await usersCollection.findOne({ _id: new ObjectId(creatorId) });
        if (!creator) return res.status(404).json({ success: false, message: 'क्रिएटर नहीं मिला' });

        const member = await usersCollection.findOne({ _id: new ObjectId(memberId) });
        if (!member) return res.status(404).json({ success: false, message: 'सदस्य नहीं मिला' });

        if (creatorId !== group.creatorId) {
            return res.status(403).json({ success: false, message: 'केवल ग्रुप क्रिएटर ही सदस्य हटा सकता है' });
        }

        if (!group.members.includes(memberId)) {
            return res.status(400).json({ success: false, message: 'सदस्य ग्रुप में नहीं है' });
        }

        await chatsCollection.updateOne(
            { _id: new ObjectId(groupId) },
            { $pull: { members: memberId } }
        );

        const updatedChats = await getChatsForUser(creatorId);
        io.emit('chatList', updatedChats);

        res.json({ success: true, group: { ...group, members: group.members.filter(m => m !== memberId) } });
    } catch (error) {
        console.error('सदस्य हटाने में त्रुटि:', error);
        res.status(500).json({ success: false, message: 'सर्वर त्रुटि, कृपया फिर से कोशिश करें' });
    }
});

// यूज़र्स लिस्ट एंडपॉइंट
app.get('/getUsers', async (req, res) => {
    try {
        const { userId } = req.query;
        const user = await usersCollection.findOne({ _id: new ObjectId(userId) });

        if (!user) return res.status(404).json({ success: false, message: 'यूज़र नहीं मिला' });

        const mutualContacts = await usersCollection.find({
            _id: { $in: user.contacts.map(id => new ObjectId(id)) }
        }).toArray();

        const usersList = mutualContacts.map(user => ({
            userId: user._id.toString(),
            profilePic: user.profilePic,
            status: user.status,
            bio: user.bio,
            username: user.username
        }));

        res.json(usersList);
    } catch (error) {
        console.error('यूज़र्स लिस्ट प्राप्त करने में त्रुटि:', error);
        res.status(500).json({ success: false, message: 'सर्वर त्रुटि, कृपया फिर से कोशिश करें' });
    }
});

// कॉन्टैक्ट हटाने का एंडपॉइंट
app.post('/removeContact', async (req, res) => {
    try {
        const { userId, contactId } = req.body;
        const currentUser = await usersCollection.findOne({ _id: new ObjectId(userId) });
        const contactUser = await usersCollection.findOne({ _id: new ObjectId(contactId) });

        if (!currentUser || !contactUser) {
            return res.status(404).json({ success: false, message: 'यूज़र या कॉन्टैक्ट नहीं मिला' });
        }

        if (!currentUser.contacts.includes(contactId)) {
            return res.status(400).json({ success: false, message: 'यह कॉन्टैक्ट आपके संपर्क में नहीं है' });
        }

        // दोनों यूज़र्स से कॉन्टैक्ट हटाएं
        await usersCollection.updateOne(
            { _id: new ObjectId(userId) },
            { $pull: { contacts: contactId } }
        );

        await usersCollection.updateOne(
            { _id: new ObjectId(contactId) },
            { $pull: { contacts: userId } }
        );

        // चैट डिलीट करें (अगर मौजूद हो)
        await chatsCollection.deleteOne({
            isGroup: false,
            participants: { $all: [userId, contactId], $size: 2 }
        });

        const currentUserChats = await getChatsForUser(userId);
        const contactUserChats = await getChatsForUser(contactId);

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
        console.error('कॉन्टैक्ट हटाने में त्रुटि:', error);
        res.status(500).json({ success: false, message: 'सर्वर त्रुटि, कृपया फिर से कोशिश करें' });
    }
});

// स्टेटस जोड़ने का एंडपॉइंट
app.post('/addStatus', upload.single('file'), async (req, res) => {
    try {
        const { userId, text } = req.body;
        if (!userId) {
            return res.status(400).json({ success: false, message: 'यूज़र ID ज़रूरी है' });
        }

        const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
        if (!user) {
            return res.status(404).json({ success: false, message: 'यूज़र नहीं मिला' });
        }

        const media = req.file ? `https://chatzap.xyz/uploads/${req.file.filename}` : null;
        const newStatus = {
            userId,
            username: user.username,
            profilePic: user.profilePic,
            text: text || '',
            media,
            timestamp: new Date()
        };

        await statusesCollection.insertOne(newStatus);

        // सभी कनेक्टेड यूज़र्स को अपडेटेड स्टेटस लिस्ट भेजें
        const visibleStatuses = await statusesCollection.find({
            $or: [
                { userId },
                { userId: { $in: user.contacts } }
            ]
        }).sort({ timestamp: -1 }).toArray();

        io.emit('statusList', visibleStatuses);

        res.json({ success: true, status: newStatus });
    } catch (error) {
        console.error('स्टेटस जोड़ने में त्रुटि:', error);
        res.status(500).json({ success: false, message: 'सर्वर त्रुटि, कृपया फिर से कोशिश करें' });
    }
});

// पोल प्राप्त करने का एंडपॉइंट
app.get('/getPoll/:pollId', async (req, res) => {
    try {
        const poll = await pollsCollection.findOne({ _id: new ObjectId(req.params.pollId) });
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

// प्रोफाइल प्राप्त करने का एंडपॉइंट
app.get('/getProfile', async (req, res) => {
    try {
        const userId = req.query.userId;
        const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
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
        console.error('प्रोफाइल प्राप्त करने में त्रुटि:', error);
        res.status(500).json({ success: false, message: 'सर्वर त्रुटि, कृपया फिर से कोशिश करें' });
    }
});

// सॉकेट इवेंट हैंडलर्स
io.on('connection', (socket) => {
    console.log('नया क्लाइंट कनेक्ट हुआ:', socket.id);
    
    socket.on('register', async (userId) => {
        try {
            connectedUsers.set(userId, socket.id);
            socket.userId = userId;
            
            const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
            if (user) {
                const visibleStatuses = await statusesCollection.find({
                    $or: [
                        { userId },
                        { userId: { $in: user.contacts } }
                    ]
                }).sort({ timestamp: -1 }).toArray();

                const userChats = await getChatsForUser(userId);
                
                socket.emit('chatList', userChats);
                socket.emit('statusList', visibleStatuses);
            }
        } catch (error) {
            console.error('सॉकेट रजिस्टर में त्रुटि:', error);
            socket.emit('error', { message: 'सर्वर त्रुटि, कृपया फिर से कोशिश करें' });
        }
    });

    socket.on('loadChat', async (chatId) => {
        try {
            const chatMessages = await messagesCollection.find({ chatId }).sort({ timestamp: 1 }).toArray();
            socket.emit('chatMessages', { chatId, messages: chatMessages });
        } catch (error) {
            console.error('चैट लोड करने में त्रुटि:', error);
            socket.emit('error', { message: 'चैट लोड करने में त्रुटि' });
        }
    });

    socket.on('sendMessage', async ({ chatId, text, sender, receiverId, media, voice, messageId }) => {
        try {
            const existingMessage = await messagesCollection.findOne({ id: messageId });
            if (existingMessage) return;

            const chat = await chatsCollection.findOne({ _id: new ObjectId(chatId) });
            if (!chat) {
                console.error('चैट नहीं मिली:', chatId);
                return;
            }

            const participants = chat.isGroup ? chat.members : chat.participants;
            if (!participants || !participants.includes(sender)) {
                console.error('भेजने वाला चैट में नहीं है:', sender, chatId, 'प्रतिभागी:', participants);
                return;
            }

            const senderUser = await usersCollection.findOne({ _id: new ObjectId(sender) });
            const username = senderUser ? senderUser.username : 'अज्ञात';

            const newMessage = { 
                id: messageId, 
                chatId,
                sender, 
                username,
                text: text || '', 
                media, 
                voice, 
                timestamp: new Date(), 
                readBy: [],
                status: 'sent',
                reactions: {}
            };

            await messagesCollection.insertOne(newMessage);
            
            await chatsCollection.updateOne(
                { _id: new ObjectId(chatId) },
                { $set: { lastMessage: text || (media ? 'मीडिया' : (voice ? 'वॉइस मैसेज' : '')) } }
            );

            if (chat.isGroup) {
                for (const member of chat.members) {
                    const memberSocket = connectedUsers.get(member);
                    if (memberSocket) {
                        io.to(memberSocket).emit('newMessage', { chatId, message: newMessage });
                    }
                }
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

            const updatedChats = await getChatsForUser(sender);
            io.emit('chatList', updatedChats);
        } catch (error) {
            console.error('मैसेज भेजने में त्रुटि:', error);
            socket.emit('error', { message: 'मैसेज भेजने में त्रुटि' });
        }
    });

    socket.on('markMessagesAsRead', async ({ chatId, userId }) => {
        try {
            const chat = await chatsCollection.findOne({ _id: new ObjectId(chatId) });
            if (!chat) return;

            // अपडेट करें कि कौन से मैसेज पढ़े गए हैं
            await messagesCollection.updateMany(
                { 
                    chatId, 
                    sender: { $ne: userId },
                    readBy: { $ne: userId }
                },
                { 
                    $addToSet: { readBy: userId },
                    $set: { 
                        status: chat.isGroup ? 'delivered' : 'read' 
                    } 
                }
            );

            // ग्रुप चैट के लिए, अगर सभी ने पढ़ लिया है तो स्टेटस अपडेट करें
            if (chat.isGroup) {
                const messagesToUpdate = await messagesCollection.find({
                    chatId,
                    sender: { $ne: userId },
                    status: { $ne: 'read' }
                }).toArray();

                for (const msg of messagesToUpdate) {
                    const eligibleMembers = chat.members.filter(m => m !== msg.sender);
                    if (msg.readBy && msg.readBy.length === eligibleMembers.length) {
                        await messagesCollection.updateOne(
                            { _id: msg._id },
                            { $set: { status: 'read' } }
                        );
                    }
                }
            }

            const updatedMessages = await messagesCollection.find({ chatId }).sort({ timestamp: 1 }).toArray();
            
            const participants = chat.isGroup ? chat.members : chat.participants;
            for (const participant of participants) {
                const participantSocket = connectedUsers.get(participant);
                if (participantSocket) {
                    io.to(participantSocket).emit('chatMessages', { chatId, messages: updatedMessages });
                }
            }

            const updatedChats = await getChatsForUser(userId);
            io.emit('chatList', updatedChats);
        } catch (error) {
            console.error('मैसेज पढ़े गए चिह्नित करने में त्रुटि:', error);
            socket.emit('markReadError', { message: 'मैसेज को पढ़ा गया के रूप में चिह्नित करने में त्रुटि' });
        }
    });

    socket.on('deleteMessage', async ({ chatId, messageId, userId }) => {
        try {
            const chat = await chatsCollection.findOne({ _id: new ObjectId(chatId) });
            if (!chat) return;

            const message = await messagesCollection.findOne({ id: messageId, sender: userId });
            if (!message) return;

            await messagesCollection.deleteOne({ id: messageId });

            if (chat.isGroup) {
                for (const member of chat.members) {
                    const memberSocket = connectedUsers.get(member);
                    if (memberSocket) io.to(memberSocket).emit('messageDeleted', { chatId, messageId });
                }
            } else {
                for (const participant of chat.participants) {
                    const participantSocket = connectedUsers.get(participant);
                    if (participantSocket) io.to(participantSocket).emit('messageDeleted', { chatId, messageId });
                }
            }
        } catch (error) {
            console.error('मैसेज हटाने में त्रुटि:', error);
            socket.emit('error', { message: 'मैसेज हटाने में त्रुटि' });
        }
    });

    socket.on('addReaction', async ({ chatId, messageId, emoji, userId }) => {
        try {
            const chat = await chatsCollection.findOne({ _id: new ObjectId(chatId) });
            if (!chat) return;

            await messagesCollection.updateOne(
                { id: messageId },
                { $set: { [`reactions.${userId}`]: emoji } }
            );

            if (chat.isGroup) {
                for (const member of chat.members) {
                    const memberSocket = connectedUsers.get(member);
                    if (memberSocket) {
                        io.to(memberSocket).emit('reactionAdded', { chatId, messageId, userId, emoji });
                    }
                }
            } else {
                for (const participant of chat.participants) {
                    const participantSocket = connectedUsers.get(participant);
                    if (participantSocket) {
                        io.to(participantSocket).emit('reactionAdded', { chatId, messageId, userId, emoji });
                    }
                }
            }
        } catch (error) {
            console.error('रिएक्शन जोड़ने में त्रुटि:', error);
            socket.emit('error', { message: 'रिएक्शन जोड़ने में त्रुटि' });
        }
    });

    socket.on('deleteStatus', async ({ statusId, userId }) => {
        try {
            const result = await statusesCollection.deleteOne({ _id: new ObjectId(statusId), userId });
            if (result.deletedCount > 0) {
                io.emit('statusDeleted', { statusId });

                const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
                if (user) {
                    const visibleStatuses = await statusesCollection.find({
                        $or: [
                            { userId },
                            { userId: { $in: user.contacts } }
                        ]
                    }).sort({ timestamp: -1 }).toArray();

                    io.emit('statusList', visibleStatuses);
                }
            }
        } catch (error) {
            console.error('स्टेटस हटाने में त्रुटि:', error);
            socket.emit('error', { message: 'स्टेटस हटाने में त्रुटि' });
        }
    });

    socket.on('createPoll', async ({ chatId, question, options, sender }) => {
        try {
            const chat = await chatsCollection.findOne({ _id: new ObjectId(chatId) });
            if (!chat) return;

            if (!question || !Array.isArray(options) || options.length < 2) {
                socket.emit('pollError', { message: 'प्रश्न और कम से कम 2 विकल्प ज़रूरी हैं' });
                return;
            }

            const existingPoll = await pollsCollection.findOne({
                chatId,
                question,
                sender
            });

            if (existingPoll) {
                socket.emit('pollError', { message: 'यह पोल पहले से मौजूद है!' });
                return;
            }

            const pollId = new ObjectId();
            const poll = {
                _id: pollId,
                chatId,
                question,
                options,
                votes: options.map(() => []),
                sender,
                timestamp: new Date()
            };

            await pollsCollection.insertOne(poll);

            const senderUser = await usersCollection.findOne({ _id: new ObjectId(sender) });
            const username = senderUser ? senderUser.username : 'अज्ञात';

            const messageId = `${chatId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const newMessage = {
                id: messageId,
                chatId,
                sender,
                username,
                text: '',
                media: null,
                voice: null,
                poll: pollId.toString(),
                timestamp: new Date(),
                status: 'sent',
                readBy: [],
                reactions: {}
            };

            await messagesCollection.insertOne(newMessage);
            
            await chatsCollection.updateOne(
                { _id: new ObjectId(chatId) },
                { $set: { lastMessage: `पोल: ${question}` } }
            );

            if (chat.isGroup) {
                for (const member of chat.members) {
                    const memberSocket = connectedUsers.get(member);
                    if (memberSocket) {
                        io.to(memberSocket).emit('newPoll', poll);
                    }
                }
            } else {
                for (const participant of chat.participants) {
                    const participantSocket = connectedUsers.get(participant);
                    if (participantSocket) {
                        io.to(participantSocket).emit('newPoll', poll);
                    }
                }
            }

            const updatedChats = await getChatsForUser(sender);
            io.emit('chatList', updatedChats);
        } catch (error) {
            console.error('पोल बनाने में त्रुटि:', error);
            socket.emit('pollError', { message: 'पोल बनाने में त्रुटि' });
        }
    });

    socket.on('votePoll', async ({ chatId, pollId, optionIndex, userId }) => {
        try {
            const poll = await pollsCollection.findOne({ _id: new ObjectId(pollId) });
            if (!poll || optionIndex < 0 || optionIndex >= poll.options.length) {
                socket.emit('pollError', { message: 'अमान्य पोल या विकल्प' });
                return;
            }

            // चेक करें कि यूज़र ने पहले ही वोट तो नहीं कर दिया
            const hasVoted = poll.votes.some(voteArray => voteArray.includes(userId));
            if (hasVoted) {
                socket.emit('pollError', { message: 'आप पहले ही वोट कर चुके हैं' });
                return;
            }

            // वोट जोड़ें
            const updatedVotes = [...poll.votes];
            updatedVotes[optionIndex] = [...updatedVotes[optionIndex], userId];

            await pollsCollection.updateOne(
                { _id: new ObjectId(pollId) },
                { $set: { votes: updatedVotes } }
            );

            const updatedPoll = { ...poll, votes: updatedVotes };

            const chat = await chatsCollection.findOne({ _id: new ObjectId(chatId) });
            if (chat) {
                if (chat.isGroup) {
                    for (const member of chat.members) {
                        const memberSocket = connectedUsers.get(member);
                        if (memberSocket) {
                            io.to(memberSocket).emit('pollVote', updatedPoll);
                        }
                    }
                } else {
                    for (const participant of chat.participants) {
                        const participantSocket = connectedUsers.get(participant);
                        if (participantSocket) {
                            io.to(participantSocket).emit('pollVote', updatedPoll);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('वोट करने में त्रुटि:', error);
            socket.emit('pollError', { message: 'वोट करने में त्रुटि' });
        }
    });

    socket.on('deletePoll', async ({ chatId, pollId, userId }) => {
        try {
            const poll = await pollsCollection.findOne({ _id: new ObjectId(pollId) });
            if (!poll || poll.sender !== userId) {
                socket.emit('pollDeleteError', { message: 'पोल नहीं मिला या आप इसका मालिक नहीं हैं' });
                return;
            }

            // पोल डिलीट करें
            await pollsCollection.deleteOne({ _id: new ObjectId(pollId) });

            // पोल मैसेज डिलीट करें
            const message = await messagesCollection.findOne({ poll: pollId.toString() });
            if (message) {
                await messagesCollection.deleteOne({ _id: message._id });

                // चैट का लास्ट मैसेज अपडेट करें
                const lastMessage = await messagesCollection.findOne(
                    { chatId },
                    { sort: { timestamp: -1 } }
                );

                await chatsCollection.updateOne(
                    { _id: new ObjectId(chatId) },
                    { 
                        $set: { 
                            lastMessage: lastMessage 
                                ? lastMessage.text || (lastMessage.media ? 'मीडिया' : 'वॉइस मैसेज') 
                                : 'कोई मैसेज नहीं' 
                        } 
                    }
                );

                // सभी को नोटिफाई करें
                const chat = await chatsCollection.findOne({ _id: new ObjectId(chatId) });
                if (chat) {
                    const participants = chat.isGroup ? chat.members : chat.participants;
                    for (const participant of participants) {
                        const participantSocket = connectedUsers.get(participant);
                        if (participantSocket) {
                            io.to(participantSocket).emit('messageDeleted', { chatId, messageId: message.id });
                        }
                    }
                }
            }

            const updatedChats = await getChatsForUser(userId);
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
            console.error('डिसअपीयरिंग सेटिंग्स प्राप्त करने में त्रुटि:', error);
            socket.emit('error', { message: 'डिसअपीयरिंग सेटिंग्स प्राप्त करने में त्रुटि' });
        }
    });

    socket.on('setDisappearingMessages', ({ chatId, duration }) => {
        try {
            disappearingMessages[chatId] = { duration };
            const chat = chatsCollection.findOne({ _id: new ObjectId(chatId) });
            if (chat) {
                if (chat.isGroup) {
                    chat.members.forEach(member => {
                        const memberSocket = connectedUsers.get(member);
                        if (memberSocket) io.to(memberSocket).emit('disappearingMessagesSet', { chatId, duration });
                    });
                } else {
                    chat.participants.forEach(participant => {
                        const participantSocket = connectedUsers.get(participant);
                        if (participantSocket) io.to(participantSocket).emit('disappearingMessagesSet', { chatId, duration });
                    });
                }
            }
        } catch (error) {
            console.error('डिसअपीयरिंग मैसेज सेट करने में त्रुटि:', error);
            socket.emit('error', { message: 'डिसअपीयरिंग मैसेज सेट करने में त्रुटि' });
        }
    });

    socket.on('call-user', ({ receiverId, offer, callType }) => {
        try {
            console.log(`कॉल शुरू हुई ${socket.userId} से ${receiverId} को, प्रकार: ${callType}`);
            const receiverSocket = connectedUsers.get(receiverId);
            if (receiverSocket) {
                io.to(receiverSocket).emit('call-received', {
                    callerId: socket.userId,
                    offer,
                    callType
                });
                console.log(`कॉल इवेंट भेजा गया ${receiverId} को`);
            } else {
                console.log(`रिसीवर ${receiverId} कनेक्टेड नहीं है`);
            }
        } catch (error) {
            console.error('कॉल शुरू करने में त्रुटि:', error);
            socket.emit('error', { message: 'कॉल शुरू करने में त्रुटि' });
        }
    });

    socket.on('call-accepted', ({ callerId, answer }) => {
        try {
            console.log(`कॉल स्वीकार की गई ${socket.userId} ने, कॉलर: ${callerId}`);
            const callerSocket = connectedUsers.get(callerId);
            if (callerSocket) {
                io.to(callerSocket).emit('call-accepted', { answer });
                console.log(`कॉल स्वीकृति इवेंट भेजा गया ${callerId} को`);
            }
        } catch (error) {
            console.error('कॉल स्वीकार करने में त्रुटि:', error);
            socket.emit('error', { message: 'कॉल स्वीकार करने में त्रुटि' });
        }
    });

    socket.on('ice-candidate', ({ receiverId, candidate }) => {
        try {
            console.log(`ICE कैंडिडेट प्राप्त हुआ ${socket.userId} से ${receiverId} को`);
            const receiverSocket = connectedUsers.get(receiverId);
            if (receiverSocket) {
                io.to(receiverSocket).emit('ice-candidate', { candidate });
                console.log(`ICE कैंडिडेट भेजा गया ${receiverId} को`);
            }
        } catch (error) {
            console.error('ICE कैंडिडेट भेजने में त्रुटि:', error);
            socket.emit('error', { message: 'ICE कैंडिडेट भेजने में त्रुटि' });
        }
    });

    socket.on('end-call', ({ receiverId }) => {
        try {
            console.log(`कॉल समाप्त हुई ${socket.userId} द्वारा, रिसीवर: ${receiverId}`);
            const receiverSocket = connectedUsers.get(receiverId);
            if (receiverSocket) {
                io.to(receiverSocket).emit('call-ended');
                console.log(`कॉल समाप्ति इवेंट भेजा गया ${receiverId} को`);
            }
        } catch (error) {
            console.error('कॉल समाप्त करने में त्रुटि:', error);
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
            console.error('डिस्कनेक्ट में त्रुटि:', error);
        }
    });
});

// हेल्पर फंक्शन: यूज़र के चैट्स प्राप्त करने के लिए
async function getChatsForUser(userId) {
    try {
        const chats = await chatsCollection.find({
            $or: [
                { participants: userId },
                { isGroup: true, members: userId }
            ]
        }).toArray();

        const chatsWithMessages = await Promise.all(chats.map(async chat => {
            const chatMessages = await messagesCollection.find({ chatId: chat._id.toString() })
                .sort({ timestamp: 1 })
                .toArray();
            return { ...chat, id: chat._id.toString(), messages: chatMessages };
        }));

        return chatsWithMessages;
    } catch (error) {
        console.error('चैट्स प्राप्त करने में त्रुटि:', error);
        return [];
    }
}

// एरर हैंडलिंग मिडलवेयर
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ success: false, message: 'सर्वर त्रुटि, कृपया फिर से कोशिश करें' });
});

// सर्वर स्टार्ट करें
server.listen(3000, () => console.log('सर्वर पोर्ट 3000 पर चल रहा है'));