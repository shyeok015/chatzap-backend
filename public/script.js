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
    console.log('सॉकेट जुड़ा:', socket.connected);
    const chatList = document.getElementById("chatList");
    socket.on('chatList', (chats) => {
        console.log('चैट लिस्ट मिली:', chats);
        chatList.innerHTML = "";
        chats.forEach(chat => {
            const chatItem = document.createElement("div");
            chatItem.classList.add("chat-item");
            chatItem.innerHTML = `
                <img src="${chat.profilePic}" alt="प्रोफाइल">
                <div>
                    <h4>${chat.name}</h4>
                    <p>${chat.lastMessage || "अभी कोई मैसेज नहीं"}</p>
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
        console.log('चैट मैसेज मिले:', messages); // डिबगिंग
        if (chatId === currentChatId) {
            messagesDiv.innerHTML = "";
            messages.forEach(msg => {
                displayMessage(msg);
            });
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
    });

    function displayMessage(msg) {
        console.log('मैसेज दिखा रहे हैं:', msg); // डिबगिंग
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
            console.log('मीडिया URL:', msg.media); // डिबगिंग
            // फाइल एक्सटेंशन चेक करें
            const fileExtension = msg.media.split('.').pop().toLowerCase();
            const imageExtensions = ['jpg', 'jpeg', 'png', 'gif'];
            const videoExtensions = ['mp4', 'webm', 'ogg'];

            if (imageExtensions.includes(fileExtension)) {
                console.log('यह एक इमेज है, लोड कर रहे हैं...'); // डिबगिंग
                const img = new Image(); // नया Image ऑब्जेक्ट बनाएं
                img.src = msg.media;
                img.classList.add("media");
                img.style.maxWidth = "200px";
                img.style.maxHeight = "200px";

                // इमेज लोड होने पर
                img.onload = () => {
                    console.log('फोटो लोड हो गई:', msg.media);
                    message.appendChild(img);
                };

                // इमेज लोड में एरर होने पर
                img.onerror = () => {
                    console.error('फोटो लोड नहीं हुई:', msg.media);
                    const errorText = document.createElement("div");
                    errorText.textContent = "फोटो लोड करने में असफल";
                    message.appendChild(errorText);
                };
            } else if (videoExtensions.includes(fileExtension)) {
                console.log('यह एक वीडियो है, लोड कर रहे हैं...'); // डिबगिंग
                const video = document.createElement("video");
                video.src = msg.media;
                video.controls = true;
                video.classList.add("media");
                video.style.maxWidth = "200px";
                video.style.maxHeight = "200px";
                video.onerror = () => {
                    console.error('वीडियो लोड नहीं हुआ:', msg.media);
                    const errorText = document.createElement("div");
                    errorText.textContent = "वीडियो लोड करने में असफल";
                    message.appendChild(errorText);
                };
                message.appendChild(video);
            } else {
                console.log('यह न तो इमेज है और न ही वीडियो:', msg.media);
                const errorText = document.createElement("div");
                errorText.textContent = "अज्ञात फाइल टाइप";
                message.appendChild(errorText);
            }
        } else {
            console.log('मैसेज में मीडिया नहीं है:', msg); // डिबगिंग
        }

        // मैसेज को DOM में जोड़ें
        messagesDiv.appendChild(message);
        console.log('मैसेज DOM में जोड़ा गया'); // डिबगिंग
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
            console.log('फाइल चुनी गई:', file.name); // डिबगिंग
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });
            const result = await response.json();
            if (result.filePath) {
                console.log('अपलोड की गई फाइल का पता:', result.filePath); // डिबगिंग
                socket.emit('sendMessage', {
                    chatId: currentChatId,
                    text: "",
                    sender: userId,
                    receiverId: selectedReceiver,
                    media: result.filePath
                });
            } else {
                console.error('फाइल अपलोड में समस्या:', result); // डिबगिंग
            }
        } else {
            console.error('कोई फाइल नहीं चुनी गई'); // डिबगिंग
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
        console.log('नया मैसेज मिला:', message); // डिबगिंग
        if (chatId === currentChatId) {
            displayMessage(message);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
    });
}