let userId = null;
let socket = null;
let currentChatId = null;
let selectedReceiver = null;

// लॉगिन फॉर्म दिखाएं
document.getElementById('loginModal').style.display = 'block';

function login() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            userId = data.userId;
            document.getElementById('loginModal').style.display = 'none';
            document.querySelector('.container').style.display = 'flex';
            socket = io();
            initSocket();
        } else {
            document.getElementById('loginMessage').textContent = data.message;
        }
    });
}

function initSocket() {
    console.log('Socket connected:', socket.connected);
    const chatList = document.getElementById("chatList");
    socket.on('chatList', (chats) => {
        console.log('Received chat list:', chats);
        chatList.innerHTML = "";
        chats.forEach(chat => {
            const chatItem = document.createElement("div");
            chatItem.classList.add("chat-item");
            chatItem.innerHTML = `
                <img src="${chat.profilePic}" alt="Profile">
                <div>
                    <h4>${chat.name}</h4>
                    <p>${chat.lastMessage || "No messages yet"}</p>
                </div>
            `;
            chatItem.addEventListener("click", () => {
                loadChat(chat);
                selectedReceiver = chat.id;
            });
            chatList.appendChild(chatItem);
        });
    });

    const chatName = document.getElementById("chatName");
    const messagesDiv = document.getElementById("messages");
    function loadChat(chat) {
        currentChatId = chat.id;
        chatName.textContent = chat.name;
        messagesDiv.innerHTML = "";
        socket.emit('loadChat', chat.id);
    }

    socket.on('chatMessages', ({ chatId, messages }) => {
        if (chatId === currentChatId) {
            messagesDiv.innerHTML = "";
            messages.forEach(msg => {
                displayMessage(msg);
            });
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
    });

    function displayMessage(msg) {
        const message = document.createElement("div");
        message.classList.add("message", msg.sender === userId ? "sent" : "received");

        // टेक्स्ट मैसेज दिखाएं
        if (msg.text) {
            const textDiv = document.createElement("div");
            textDiv.textContent = `${msg.sender}: ${msg.text}`;
            message.appendChild(textDiv);
        }

        // फोटो या वीडियो दिखाएं
        if (msg.media) {
            console.log('Media URL:', msg.media); // डिबगिंग के लिए
            if (msg.media.includes('image')) {
                const img = document.createElement("img");
                img.src = msg.media;
                img.classList.add("media");
                img.style.maxWidth = "200px"; // साइज़ सेट करें
                img.style.maxHeight = "200px";
                img.onerror = () => console.log('Image failed to load:', msg.media); // अगर फोटो लोड न हो
                message.appendChild(img);
            } else if (msg.media.includes('video')) {
                const video = document.createElement("video");
                video.src = msg.media;
                video.controls = true;
                video.classList.add("media");
                video.style.maxWidth = "200px";
                video.style.maxHeight = "200px";
                video.onerror = () => console.log('Video failed to load:', msg.media);
                message.appendChild(video);
            }
        }
        messagesDiv.appendChild(message);
    }

    const messageInput = document.getElementById("messageInput");
    const sendButton = document.getElementById("sendButton");
    const fileInput = document.getElementById("fileInput");
    const fileButton = document.getElementById("fileButton");

    sendButton.addEventListener("click", sendMessage);
    messageInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") sendMessage();
    });

    fileButton.addEventListener("click", () => {
        fileInput.click();
    });

    fileInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (file) {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });
            const result = await response.json();
            if (result.filePath) {
                console.log('Uploaded file path:', result.filePath); // डिबगिंग के लिए
                socket.emit('sendMessage', {
                    chatId: currentChatId,
                    text: "",
                    sender: userId,
                    receiverId: selectedReceiver,
                    media: result.filePath
                });
            }
        }
    });

    function sendMessage() {
        const text = messageInput.value.trim();
        if (text && currentChatId && selectedReceiver) {
            socket.emit('sendMessage', {
                chatId: currentChatId,
                text,
                sender: userId,
                receiverId: selectedReceiver,
                media: null
            });
            messageInput.value = "";
        }
    }

    socket.on('newMessage', ({ chatId, message }) => {
        if (chatId === currentChatId) {
            displayMessage(message);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
    });
}