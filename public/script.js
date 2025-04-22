
let userId = null;
let socket = null;
let currentChatId = null;
let selectedReceiver = null;
let statusTimer = null;
let currentStatusIndex = -1;
let allStatuses = [];
let mediaRecorder = null;
let audioChunks = [];
let localStream = null;
let remoteStream = null;
let peerConnection = null;
let incomingCallData = null;
let userProfile = { profilePic: "/placeholder.png", status: "Available", bio: "Hi! I am using ChatZap", username: "" };
let chats = [];
let polls = {};
let userCache = new Map();

const loginModal = document.getElementById('loginModal');
const registerModal = document.getElementById('registerModal');
const container = document.querySelector('.container');

if (loginModal && container) {
    loginModal.style.display = 'flex';
    container.style.display = 'none';
} else {
    console.error('लॉगिन मोडल या कंटेनर नहीं मिला');
}

// डार्क मोड टॉगल करने का फंक्शन
function toggleDarkMode() {
    const body = document.body;
    body.classList.toggle('dark-theme');
    const isDarkMode = body.classList.contains('dark-theme');
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    const darkModeIcon = document.getElementById('darkModeToggle');
    if (darkModeIcon) {
        darkModeIcon.classList.toggle('fa-moon');
        darkModeIcon.classList.toggle('fa-sun');
    }
}

// DOM लोड होने पर थीम चेक करें
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
        const darkModeIcon = document.getElementById('darkModeToggle');
        if (darkModeIcon) {
            darkModeIcon.classList.remove('fa-moon');
            darkModeIcon.classList.add('fa-sun');
        }
    }
});

// रजिस्टर और लॉगिन मोडल स्विच करने के फंक्शन
function showRegister() {
    if (loginModal && registerModal) {
        loginModal.style.display = 'none';
        registerModal.style.display = 'flex';
    }
}

function showLogin() {
    if (loginModal && registerModal) {
        registerModal.style.display = 'none';
        loginModal.style.display = 'flex';
    }
}

// यूजर रजिस्टर करने का फंक्शन
// यूजर रजिस्टर करने का फंक्शन
function register() {
    const username = document.getElementById('regUsername')?.value;
    const password = document.getElementById('regPassword')?.value;
    if (!username || !password) {
        document.getElementById('registerMessage').textContent = 'Please enter the username and password';
        return;
    }
    fetch('https://chatzap.xyz/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            userId = data.userId;
            userProfile = {
                ...data.profile,
                password: password // रजिस्टर करते समय पासवर्ड को userProfile में जोड़ा
            };
            if (registerModal && container) {
                registerModal.style.display='none';
                container.style.display='flex';
                console.log('रजिस्टर सफल, सॉकेट कनेक्शन शुरू हो रहा है...');
                initSocketConnection(); // यहाँ कॉल करें
            }
        } else {
            document.getElementById('registerMessage').textContent=data.message;
        }
    })
    .catch(error => {
        console.error('रजिस्टर त्रुटि:', error);
        document.getElementById('registerMessage').textContent='Server error please try again';
    });
}
function login() {
    const username = document.getElementById('username')?.value;
    const password = document.getElementById('password')?.value;
    if (!username || !password) {
        document.getElementById('loginMessage').textContent = 'Please enter the username and password';
        return;
    }
    fetch('https://chatzap.xyz/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            userId = data.userId;
            userProfile = {
                ...data.profile,
                password: data.profile.password || password
            };
            if (loginModal && container) {
                loginModal.style.display = 'none';
                container.style.display = 'flex';
                console.log('लॉगिन सफल, सॉकेट कनेक्शन शुरू हो रहा है...');
                initSocketConnection(); // यहाँ कॉल करें
            }
        } else {
            document.getElementById('loginMessage').textContent = data.message;
        }
    })
    .catch(error => {
        console.error('लॉगिन त्रुटि:', error);
        document.getElementById('loginMessage').textContent = 'Server error please try again';
    });
}
// सॉकेट कनेक्शन शुरू करने का फंक्शन (सुधार के साथ)
function initSocketConnection() {
    if (!userId) {
        console.error('यूज़र ID सेट नहीं है, कनेक्शन शुरू नहीं हो सकता');
        return;
    }
    if (socket && socket.connected) {
        socket.disconnect(); // पुराना कनेक्शन बंद करें
    }
    try {
        socket = io('https://chatzap.xyz', {
            reconnection: true,
            reconnectionAttempts: 5, // रीकनेक्शन की कोशिशें 10 से घटाकर 5
            reconnectionDelay: 2000, // अंतराल को 1 सेकंड से बढ़ाकर 2 सेकंड
            reconnectionDelayMax: 10000, // अधिकतम 10 सेकंड
            transports: ['websocket'],
            timeout: 10000,
            query: { userId }
        });

        socket.on('connect', () => {
            console.log('सर्वर से कनेक्ट हुआ, सॉकेट ID:', socket.id);
            socket.emit('register', userId);
            initSocket();
        });

        socket.on('connect_error', (error) => {
            console.error('कनेक्शन त्रुटि:', error.message);
            if (loginModal) {
                document.getElementById('loginMessage').textContent = 'सर्वर से कनेक्ट नहीं हो सका, पुनः प्रयास हो रहा है...';
            }
        });

        socket.on('disconnect', (reason) => {
            console.log('सर्वर से डिस्कनेक्ट हुआ, कारण:', reason);
            if (reason === 'io server disconnect') {
                setTimeout(() => {
                    if (!socket.connected) initSocketConnection();
                }, 5000); // रीकनेक्शन में 5 सेकंड की देरी
            }
        });

        const darkModeToggle = document.getElementById('darkModeToggle');
        if (darkModeToggle) {
            darkModeToggle.addEventListener('click', toggleDarkMode);
        }

        const sidebarSettingsButton = document.getElementById('sidebarSettingsButton');
        if (sidebarSettingsButton) {
            sidebarSettingsButton.addEventListener('click', (e) => {
                e.preventDefault();
                showSidebarSettings(e);
            });
        } else {
            console.error('साइडबार सेटिंग्स बटन नहीं मिला');
        }
    } catch (error) {
        console.error('सॉकेट कनेक्शन सेटअप में त्रुटि:', error);
    }
}

// साइडबार सेटिंग्स मेन्यू दिखाने का फंक्शन
function showSidebarSettings(e) {
    const existingMenu = document.querySelector('.chat-settings-menu');
    if (existingMenu) existingMenu.remove();

    const menu = document.createElement('div');
    menu.classList.add('chat-settings-menu');
    menu.innerHTML = `
        <div class="chat-settings-option" data-action="createPoll">Create Poll</div>
        ${currentChatId && chats.find(c => c.id === currentChatId && c.isGroup && c.creatorId === userId) ? `
            <div class="chat-settings-option" data-action="editGroup">Edit Group</div>
            <div class="chat-settings-option" data-action="addMember">Add Member</div>
            <div class="chat-settings-option" data-action="removeMember">Remove Member</div>
        ` : ''}
    `;
    document.body.appendChild(menu);

    const rect = e.target.getBoundingClientRect();
    menu.style.left = `${rect.left}px`;
    menu.style.top = `${rect.bottom + window.scrollY}px`;
    menu.style.position = 'absolute';
    menu.style.zIndex = '1000';

    // मोबाइल के लिए रेस्पॉन्सिव स्टाइलिंग
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
        // मेन्यू को 3 डॉट्स के नीचे पोजीशन करें
        menu.style.left = `${rect.left - 120}px`; // बायीं ओर थोड़ा ऑफसेट ताकि मेन्यू आइकन के नीचे सही से आए
        menu.style.top = `${rect.bottom + window.scrollY + 5}px`; // आइकन के ठीक नीचे
        menu.style.width = '160px'; // फिक्स्ड चौड़ाई मेन्यू के लिए
        menu.style.maxWidth = 'none'; // चैट एरिया की चौड़ाई पर निर्भर नहीं
        menu.style.backgroundColor = document.body.classList.contains('dark-theme') ? '#333' : '#fff';
        menu.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
        menu.style.borderRadius = '8px';
        menu.style.padding = '5px 0';
    }

    console.log('Sidebar settings menu created, checking dark mode:', document.body.classList.contains('dark-theme'));

    document.querySelectorAll('.chat-settings-option').forEach(option => {
        option.addEventListener('click', (event) => {
            event.stopPropagation();
            const action = option.dataset.action;
            if (action === 'createPoll' && currentChatId) {
                showCreatePollModal();
            } else if (action === 'editGroup') {
                showEditGroupModal();
            } else if (action === 'addMember') {
                showAddGroupMemberModal();
            } else if (action === 'removeMember') {
                showRemoveGroupMemberModal();
            } else {
                alert('Please Choose a Chat first');
            }
            menu.remove();
        });

        // मोबाइल में ऑप्शन की स्टाइलिंग
        if (isMobile) {
            option.style.padding = '10px 15px';
            option.style.fontSize = '16px';
            option.style.borderBottom = document.body.classList.contains('dark-theme') ? '1px solid #555' : '1px solid #eee';
            option.style.color = document.body.classList.contains('dark-theme') ? '#fff' : '#000';
        }
    });

    // आखिरी ऑप्शन की बॉर्डर हटाएं (मोबाइल में)
    if (isMobile) {
        const options = menu.querySelectorAll('.chat-settings-option');
        if (options.length > 0) {
            options[options.length - 1].style.borderBottom = 'none';
        }
    }

    document.addEventListener('click', (event) => {
        if (!menu.contains(event.target) && event.target !== document.getElementById('sidebarSettingsButton')) {
            menu.remove();
        }
    }, { once: true });
}

// पोल बनाने का मोडल दिखाने का फंक्शन
function showCreatePollModal() {
    if (!currentChatId) {
        alert('Please select a chat first');
        return;
    }
    const modal = document.getElementById('createPollModal');
    if (modal) {
        modal.style.display = 'flex';
        document.getElementById('pollQuestion').value = '';
        document.getElementById('pollOptions').value = '';
        // मोबाइल के लिए चैट एरिया में छोटा मोडल
        const isMobile = window.innerWidth <= 768;
        if (isMobile) {
            const chatArea = document.querySelector('.chat-area');
            if (chatArea) {
                modal.style.position = 'fixed'; // फिक्स्ड पोजीशन ताकि सेंटर में रहे
                modal.style.left = '0';
                modal.style.top = '0';
                modal.style.width = '100%';
                modal.style.height = '100%';
                modal.style.zIndex = '1001';
                modal.style.backgroundColor = 'rgba(0,0,0,0.5)'; // बैकग्राउंड ओवरले
                const modalContent = modal.querySelector('.modal-content');
                if (modalContent) {
                    modalContent.style.width = '90%';
                    modalContent.style.maxWidth = '320px'; // छोटा मोडल साइज
                    modalContent.style.margin = 'auto';
                    modalContent.style.backgroundColor = document.body.classList.contains('dark-theme') ? '#333' : '#fff';
                    modalContent.style.borderRadius = '8px';
                    modalContent.style.padding = '20px';
                }
            }
        }
    }
}

// ग्रुप एडिट करने का मोडल दिखाने का फंक्शन
function showEditGroupModal() {
    const group = chats.find(c => c.id === currentChatId && c.isGroup && c.creatorId === userId);
    if (!group) {
        alert('You are not the creator of this group');
        return;
    }
    const modal = document.createElement('div');
    modal.classList.add('modal');
    modal.innerHTML = `
        <div class="modal-content">
            <h2>Edit Group</h2>
            <form id="editGroupForm">
                <label for="groupName">Group Name</label>
                <input type="text" id="groupName" value="${group.name}" required>
                <label for="groupPicInput">Group Picture</label>
                <input type="file" id="groupPicInput" accept="image/*">
                <button type="submit">Save</button>
                <button type="button" id="closeEditGroupModal">Close</button>
            </form>
        </div>
    `;
    document.body.appendChild(modal);
    modal.style.display = 'flex';

    // मोबाइल के लिए चैट एरिया में छोटा मोडल
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
        const chatArea = document.querySelector('.chat-area');
        if (chatArea) {
            modal.style.position = 'fixed';
            modal.style.left = '0';
            modal.style.top = '0';
            modal.style.width = '100%';
            modal.style.height = '100%';
            modal.style.zIndex = '1001';
            modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
            const modalContent = modal.querySelector('.modal-content');
            if (modalContent) {
                modalContent.style.width = '90%';
                modalContent.style.maxWidth = '320px';
                modalContent.style.margin = 'auto';
                modalContent.style.backgroundColor = document.body.classList.contains('dark-theme') ? '#333' : '#fff';
                modalContent.style.borderRadius = '8px';
                modalContent.style.padding = '20px';
            }
        }
    }

    document.getElementById('editGroupForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('groupName')?.value;
        const profilePic = document.getElementById('groupPicInput')?.files[0];
        const formData = new FormData();
        formData.append('groupId', currentChatId);
        formData.append('name', name);
        formData.append('creatorId', userId);
        if (profilePic) formData.append('profilePic', profilePic);

        const response = await fetch('https://chatzap.xyz/updateGroup', { method: 'POST', body: formData });
        const result = await response.json();
        if (result.success) {
            modal.remove();
            socket.emit('chatList');
        } else {
            alert(result.message || 'ग्रुप अपडेट करने में त्रुटि');
        }
    });

    document.getElementById('closeEditGroupModal').addEventListener('click', () => modal.remove());
}

// ग्रुप में नया सदस्य जोड़ने का मोडल दिखाने का फंक्शन
function showAddGroupMemberModal() {
    const group = chats.find(c => c.id === currentChatId && c.isGroup && c.creatorId === userId);
    if (!group) {
        alert('You are not the creator of this group');
        return;
    }
    const modal = document.createElement('div');
    modal.classList.add('modal');
    modal.innerHTML = `
        <div class="modal-content">
            <h2>Add New Member</h2>
            <form id="addGroupMemberForm">
                <label for="memberUsername">Member Usename</label>
                <input type="text" id="memberUsername" placeholder="Enter Username" required>
                <button type="submit">Submit</button>
                <button type="button" id="closeAddGroupMemberModal">Close</button>
            </form>
        </div>
    `;
    document.body.appendChild(modal);
    modal.style.display = 'flex';

    // मोबाइल के लिए चैट एरिया में छोटा मोडल
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
        const chatArea = document.querySelector('.chat-area');
        if (chatArea) {
            modal.style.position = 'fixed';
            modal.style.left = '0';
            modal.style.top = '0';
            modal.style.width = '100%';
            modal.style.height = '100%';
            modal.style.zIndex = '1001';
            modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
            const modalContent = modal.querySelector('.modal-content');
            if (modalContent) {
                modalContent.style.width = '90%';
                modalContent.style.maxWidth = '320px';
                modalContent.style.margin = 'auto';
                modalContent.style.backgroundColor = document.body.classList.contains('dark-theme') ? '#333' : '#fff';
                modalContent.style.borderRadius = '8px';
                modalContent.style.padding = '20px';
            }
        }
    }

    document.getElementById('addGroupMemberForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const memberUsername = document.getElementById('memberUsername')?.value;
        if (!memberUsername || memberUsername === userProfile.username) {
            alert('Please enter a valid member username different from yours');
            return;
        }

        const response = await fetch(`https://chatzap.xyz/getUsers?userId=${userId}`);
        const users = await response.json();
        const member = users.find(u => u.username === memberUsername);
        if (!member) {
            alert('This Username member was not found');
            return;
        }
        const memberId = member.userId;

        console.log('Sending addGroupMember request with:', { groupId: currentChatId, memberId, creatorId: userId });
        const addResponse = await fetch('https://chatzap.xyz/addGroupMember', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupId: currentChatId, memberId, creatorId: userId })
        });
        const result = await addResponse.json();
        console.log('Response from addGroupMember:', result);
        if (result.success) {
            alert('Member Successfully Added');
            modal.remove();
            socket.emit('chatList');
        } else {
            alert(result.message || 'सदस्य जोड़ने में त्रुटि: सर्वर ने अनुमति नहीं दी');
            console.error('API त्रुटि:', result);
        }
    });

    document.getElementById('closeAddGroupMemberModal').addEventListener('click', () => modal.remove());
}

// ग्रुप से सदस्य हटाने का मोडल दिखाने का फंक्शन
function showRemoveGroupMemberModal() {
    const group = chats.find(c => c.id === currentChatId && c.isGroup && c.creatorId === userId);
    if (!group) {
        alert('Please enter a valid member username different from yours');
        return;
    }
    const modal = document.createElement('div');
    modal.classList.add('modal');
    modal.innerHTML = `
        <div class="modal-content">
            <h2>Remove Member</h2>
            <form id="removeGroupMemberForm">
                <label for="memberUsername">Member Username</label>
                <input type="text" id="memberUsername" placeholder="Enter Username" required>
                <button type="submit">Remove</button>
                <button type="button" id="closeRemoveGroupMemberModal">Close</button>
            </form>
        </div>
    `;
    document.body.appendChild(modal);
    modal.style.display = 'flex';

    // मोबाइल के लिए चैट एरिया में छोटा मोडल
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
        const chatArea = document.querySelector('.chat-area');
        if (chatArea) {
            modal.style.position = 'fixed';
            modal.style.left = '0';
            modal.style.top = '0';
            modal.style.width = '100%';
            modal.style.height = '100%';
            modal.style.zIndex = '1001';
            modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
            const modalContent = modal.querySelector('.modal-content');
            if (modalContent) {
                modalContent.style.width = '90%';
                modalContent.style.maxWidth = '320px';
                modalContent.style.margin = 'auto';
                modalContent.style.backgroundColor = document.body.classList.contains('dark-theme') ? '#333' : '#fff';
                modalContent.style.borderRadius = '8px';
                modalContent.style.padding = '20px';
            }
        }
    }

    document.getElementById('removeGroupMemberForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const memberUsername = document.getElementById('memberUsername')?.value;
        if (!memberUsername || memberUsername === userProfile.username) {
            alert('Please enter a valid member username different from yours');
            return;
        }

        const response = await fetch(`https://chatzap.xyz/getUsers?userId=${userId}`);
        const users = await response.json();
        const member = users.find(u => u.username === memberUsername);
        if (!member) {
            alert('This Username Member was not found');
            return;
        }
        const memberId = member.userId;

        console.log('Sending removeGroupMember request with:', { groupId: currentChatId, memberId, creatorId: userId });
        const removeResponse = await fetch('https://chatzap.xyz/removeGroupMember', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groupId: currentChatId, memberId, creatorId: userId })
        });
        const result = await removeResponse.json();
        console.log('Response from removeGroupMember:', result);
        if (result.success) {
            alert('Member Successfully Removed');
            modal.remove();
            socket.emit('chatList');
        } else {
            alert(result.message || 'सदस्य हटाने में त्रुटि: सर्वर ने अनुमति नहीं दी');
            console.error('API त्रुटि:', result);
        }
    });

    document.getElementById('closeRemoveGroupMemberModal').addEventListener('click', () => modal.remove());
}

// सॉकेट इनिशियलाइज़ करने का मुख्य फंक्शन
function initSocket() {
    const chatList = document.getElementById("chatList");
    const statusList = document.getElementById("statusList");
    const messagesDiv = document.getElementById("messages");
    const chatName = document.getElementById("chatName");
    const chatStatus = document.getElementById("chatStatus");
    const chatBio = document.getElementById("chatBio");

    if (!chatList || !statusList || !messagesDiv || !chatName || !chatStatus || !chatBio) {
        console.error('एक या अधिक DOM एलिमेंट्स नहीं मिले');
        return;
    }

    // चैट और स्टेटस टैब स्विच करने के लिए इवेंट लिस्टनर
    document.getElementById('chatTab').addEventListener('click', () => {
        document.getElementById('chatTab').classList.add('active');
        document.getElementById('statusTab').classList.remove('active');
        chatList.style.display = 'block';
        statusList.style.display = 'none';
    });

    document.getElementById('statusTab').addEventListener('click', () => {
        document.getElementById('statusTab').classList.add('active');
        document.getElementById('chatTab').classList.remove('active');
        chatList.style.display = 'none';
        statusList.style.display = 'block';
    });

   // `initSocket` फंक्शन के अंदर मौजूदा `chatList` सॉकेट इवेंट को इस से बदलें
   socket.on('chatList', (chatsData) => {
    chats = [];
    const chatList = document.getElementById("chatList");
    if (!chatList) {
        console.error('chatList element not found');
        return;
    }
    chatList.innerHTML = "";
    
    fetch(`https://chatzap.xyz/getUsers?userId=${userId}`)
        .then(response => {
            if (!response.ok) throw new Error('नेटवर्क रिस्पॉन्स नहीं मिला');
            return response.json();
        })
        .then(users => {
            userCache = new Map(users.map(user => [user.userId, {
                ...user,
                profilePic: user.profilePic ? `${user.profilePic}?t=${Date.now()}` : "/placeholder.png"
            }]));
            
            const userProfiles = userCache;
            const userChats = chatsData.filter(chat => 
                (chat.participants?.includes(userId) && chat.participants.length === 2) || 
                (chat.isGroup && chat.members.includes(userId))
            );
            const uniqueChats = new Map();
            userChats.forEach(chat => {
                if (!uniqueChats.has(chat.id)) {
                    uniqueChats.set(chat.id, chat);
                }
            });
            chats = Array.from(uniqueChats.values());
            chats.forEach(chat => {
                let otherUserId = null;
                let groupProfilePic = "/placeholder.png"; // डिफॉल्ट ग्रुप डीपी
                if (chat.isGroup && chat.profilePic) {
                    groupProfilePic = `${chat.profilePic}?t=${Date.now()}`; // ग्रुप की डीपी अगर सेट है
                }
                if (chat.participants && chat.participants.length === 2) {
                    otherUserId = chat.participants.find(p => p !== userId);
                } else if (chat.isGroup) {
                    otherUserId = chat.members.find(m => m !== userId) || chat.members[0];
                }
                const otherUser = userProfiles.get(otherUserId) || { 
                    profilePic: "/placeholder.png", 
                    status: "Offline", 
                    bio: "", 
                    username: chat.name || "अज्ञात" 
                };
                const chatMessages = (chat.messages || []).filter(msg => 
                    msg.sender === userId || 
                    msg.sender === otherUserId || 
                    chat.isGroup
                );
                const unreadCount = chatMessages.filter(msg => 
                    msg.sender !== userId && 
                    (!msg.readBy || !msg.readBy.includes(userId))
                ).length;

                if (!chatList.querySelector(`[data-chat-id="${chat.id}"]`)) {
                    const chatItem = document.createElement("div");
                    chatItem.classList.add("chat-item");
                    chatItem.dataset.chatId = chat.id;
                    chatItem.innerHTML = `
                        <img class="user-dp" data-user-id="${otherUserId || chat.id}" src="${chat.isGroup ? groupProfilePic : otherUser.profilePic}" alt="प्रोफाइल" onerror="this.src='/placeholder.png'">
                        <div>
                            <h4>${chat.isGroup ? chat.name : otherUser.username} ${chat.isGroup ? '<span>(Group)</span>' : ''}</h4>
                            <p>${chat.lastMessage || "No messages yet"}</p>
                            <p class="profile-status">${chat.isGroup ? "Group" : otherUser.status}</p>
                            ${unreadCount > 0 ? `<span class="unread-count">${unreadCount}</span>` : ""}
                        </div>
                    `;

                    chatItem.addEventListener("click", () => {
                        loadChat(chat);
                        selectedReceiver = chat.isGroup ? null : chat.participants.find(p => p !== userId);
                        document.querySelector('.container').classList.add('chat-open');
                        document.querySelector('.chat-area').classList.add('active');
                    });

                    const dpElement = chatItem.querySelector('.user-dp');
                    if (dpElement) {
                        dpElement.addEventListener('click', (e) => {
                            e.stopPropagation();
                            const userIdToView = dpElement.dataset.userId;
                            openProfileView(userIdToView, chat.isGroup);
                        });
                    }

                    chatList.appendChild(chatItem);
                }
            });
        })
        .catch(error => {
            console.error('यूज़र्स लाने में त्रुटि:', error);
            alert('सर्वर से डेटा लाने में त्रुटि, कृपया बाद में प्रयास करें');
            if (!socket.connected) initSocketConnection();
        });
});
    
function loadChat(chat) {
    currentChatId = chat.id;
    let otherUserId = null;
    let groupProfilePic = "/placeholder.png"; // डिफॉल्ट ग्रुप डीपी
    if (chat.isGroup && chat.profilePic) {
        groupProfilePic = `${chat.profilePic}?t=${Date.now()}`; // ग्रुप की डीपी अगर सेट है
    }
    if (chat.participants && chat.participants.length === 2) {
        otherUserId = chat.participants.find(p => p !== userId);
    } else if (chat.isGroup) {
        otherUserId = chat.members.find(m => m !== userId) || chat.members[0];
    }
    fetch(`https://chatzap.xyz/getUsers?userId=${userId}`)
        .then(response => {
            if (!response.ok) throw new Error('नेटवर्क रिस्पॉन्स नहीं मिला');
            return response.json();
        })
        .then(users => {
            userCache = new Map(users.map(user => [user.userId, {
                ...user,
                profilePic: user.profilePic ? `${user.profilePic}?t=${Date.now()}` : "/placeholder.png"
            }]));
            const otherUser = userCache.get(otherUserId) || { 
                profilePic: "/placeholder.png", 
                status: "Offline", 
                bio: "", 
                username: chat.name || "अज्ञात" 
            };
            chatName.textContent = chat.isGroup ? chat.name + " (Group)" : otherUser.username;
            document.querySelector('.chat-info img').src = chat.isGroup ? groupProfilePic : otherUser.profilePic;
            document.querySelector('.chat-info img').onerror = function() { this.src = '/placeholder.png'; }; // डीपी फेल होने पर डिफॉल्ट
            chatStatus.textContent = chat.isGroup ? "Group" : otherUser.status;
            chatBio.textContent = chat.isGroup ? "This is a group chat" : otherUser.bio;
        })
        .catch(error => {
            console.error('यूज़र प्रोफाइल लाने में त्रुटि:', error);
            alert('सर्वर से डेटा लाने में त्रुटि, कृपया बाद में प्रयास करें');
            if (!socket.connected) {
                setTimeout(() => initSocketConnection(), 5000);
            }
        });
    messagesDiv.innerHTML = "";
    socket.emit('loadChat', chat.id);
    socket.emit('markMessagesAsRead', { chatId: chat.id, userId });
}

    // स्टेटस लिस्ट अपडेट करने का सॉकेट इवेंट
    socket.on('statusList', (statuses) => {
        allStatuses = statuses;
        statusList.innerHTML = "";
        statuses.forEach((status, index) => {
            const isOwnStatus = status.userId === userId;
            const profilePic = status.profilePic || '/placeholder.png'; // सर्वर से डीपी लें
            const username = status.username || 'Unknown';
            const statusItem = document.createElement("div");
            statusItem.classList.add("status-item");
            statusItem.innerHTML = `
                <div class="status-info" style="display: flex; align-items: center;">
                    <img src="${profilePic}" class="status-dp" alt="प्रोफाइल" style="width: 40px; height: 40px; border-radius: 50%; margin-right: 10px;">
                    <div>
                        <h4>${username}</h4>
                        <p>${new Date(status.timestamp).toLocaleTimeString()}</p>
                    </div>
                </div>
                ${status.text ? `<div>${status.text}</div>` : ''}
                ${status.media ? (status.media.endsWith('.mp4') ? 
                    `<video src="${status.media}" class="status-media" controls preload="metadata"></video>` : 
                    `<img src="${status.media}" class="status-media">`) : ''}
                ${isOwnStatus ? `<i class="fas fa-trash delete-status" data-status-id="${status.id}" title="Delete Status"></i>` : ''}
            `;
            statusItem.addEventListener('click', () => {
                currentStatusIndex = index;
                showStatusView(status);
            });
            const deleteBtn = statusItem.querySelector('.delete-status');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (confirm('Are you sure you want to delete this status?')) {
                        socket.emit('deleteStatus', { statusId: status.id, userId });
                    }
                });
            }
            statusList.appendChild(statusItem);
        });
    });

    // स्टेटस डिलीट होने पर अपडेट
    socket.on('statusDeleted', ({ statusId }) => {
        const index = allStatuses.findIndex(s => s.id === statusId);
        if (index !== -1) {
            allStatuses.splice(index, 1);
            if (currentStatusIndex === index) {
                document.getElementById('statusViewModal').style.display = 'none';
                if (statusTimer) clearTimeout(statusTimer);
                currentStatusIndex--;
                switchToNextStatus();
            } else if (currentStatusIndex > index) {
                currentStatusIndex--;
            }
            socket.emit('statusList');
        }
    });

    // चैट मैसेजेस लोड करने का सॉकेट इवेंट

    socket.on('chatMessages', ({ chatId, messages }) => {
        if (chatId === currentChatId) {
            messagesDiv.innerHTML = "";
            messages.forEach(msg => {
                if (msg.poll) {
                    const poll = polls[msg.poll]; // पहले से स्टोर किया गया पोल डेटा
                    if (poll) {
                        displayPoll(poll);
                    } else {
                        console.warn('पोल डेटा उपलब्ध नहीं:', msg.poll);
                        const errorMsg = document.createElement('div');
                        errorMsg.classList.add('message', 'received');
                        errorMsg.textContent = 'पोल लोड करने में त्रुटि हुई।';
                        messagesDiv.appendChild(errorMsg);
                    }
                } else {
                    // अगर मैसेज पहले से मौजूद है, तो डुप्लिकेट न करें
                    const existingMessage = messagesDiv.querySelector(`[data-message-id="${msg.id}"]`);
                    if (!existingMessage) {
                        displayMessage(msg);
                    } else {
                        // स्टेटस अपडेट करें (उदाहरण: sent -> delivered -> read)
                        const statusElement = existingMessage.querySelector('.message-status');
                        if (statusElement && msg.sender === userId) {
                            if (msg.status === "sent") {
                                statusElement.innerHTML = '<span class="tick single-tick">✓</span>';
                            } else if (msg.status === "delivered") {
                                statusElement.innerHTML = '<span class="tick double-tick">✓✓</span>';
                            } else if (msg.status === "read") {
                                statusElement.innerHTML = '<span class="tick double-tick blue-tick">✓✓</span>';
                            }
                        }
                    }
                }
            });
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
    });
  

    // बैक बटन पर क्लिक करने पर
document.querySelector('.back-arrow').addEventListener('click', () => {
    document.querySelector('.container').classList.remove('chat-open');
    document.querySelector('.chat-area').classList.remove('active');
});

    // नया मैसेज आने पर अपडेट
    socket.on('newMessage', ({ chatId, message }) => {
        if (chatId === currentChatId) {
            // अगर मैसेज पहले से मौजूद है, तो सिर्फ स्टेटस अपडेट करें
            const existingMessage = messagesDiv.querySelector(`[data-message-id="${message.id}"]`);
            if (!existingMessage) {
                displayMessage(message);
                messagesDiv.scrollTop = messagesDiv.scrollHeight;
            } else if (message.sender === userId) {
                const statusElement = existingMessage.querySelector('.message-status');
                if (statusElement) {
                    if (message.status === "sent") {
                        statusElement.innerHTML = '<span class="tick single-tick">✓</span>';
                    } else if (message.status === "delivered") {
                        statusElement.innerHTML = '<span class="tick double-tick">✓✓</span>';
                    } else if (message.status === "read") {
                        statusElement.innerHTML = '<span class="tick double-tick blue-tick">✓✓</span>';
                    }
                }
            }
        }
    });

    // मैसेज डिलीट होने पर अपडेट
    socket.on('messageDeleted', ({ chatId, messageId }) => {
        if (chatId === currentChatId) {
            const message = messagesDiv.querySelector(`[data-message-id="${messageId}"]`);
            if (message) message.remove();
        }
    });

    // नया पोल आने पर अपडेट
    socket.on('newPoll', (poll) => {
        if (poll && poll.id && currentChatId === poll.chatId) {
            // अगर पोल पहले से मौजूद है, तो डुप्लिकेट न करें
            const existingPoll = messagesDiv.querySelector(`[data-poll-id="${poll.id}"]`);
            if (!existingPoll) {
                displayPoll(poll);
                messagesDiv.scrollTop = messagesDiv.scrollHeight;
            }
        } else {
            console.error('अमान्य पोल डेटा प्राप्त हुआ:', poll);
        }
    });
    
    socket.on('pollVote', (updatedPoll) => {
        if (updatedPoll && updatedPoll.id) {
            console.log('पोल वोट अपडेट प्राप्त हुआ:', updatedPoll);
            updatePollDisplay(updatedPoll);
            polls[updatedPoll.id] = updatedPoll; // अपडेटेड पोल को स्टोर करें
        } else {
            console.error('अमान्य पोल वोट अपडेट:', updatedPoll);
        }
    });
    
    socket.on('pollDeleted', (pollId) => {
        const pollDiv = messagesDiv.querySelector(`[data-poll-id="${pollId}"]`);
        if (pollDiv) {
            pollDiv.remove();
            delete polls[pollId];
        }
    });

    socket.on('pollError', (data) => {
        console.error('पोल त्रुटि:', data.message);
        alert(data.message); // या कोई अन्य UI नोटिफिकेशन
    });
    // `initSocket` फंक्शन के अंदर, मौजूदा सॉकेट इवेंट्स के बाद यह जोड़ें
    socket.on('messagesRead', ({ chatId, userId: readerId }) => {
    if (chatId === currentChatId && readerId === userId) {
        socket.emit('chatList'); // चैट लिस्ट रिफ्रेश करें ताकि अनरीड काउंट अपडेट हो
        }
    });

    // client.js में मौजूदा displayMessage को इस से बदलें
    // client.js में मौजूदा displayMessage फंक्शन को इस से बदल दें
function displayMessage(msg) {
    const existingMessage = messagesDiv.querySelector(`[data-message-id="${msg.id}"]`);
    if (existingMessage) return;

    const message = document.createElement("div");
    message.classList.add("message", msg.sender === userId ? "sent" : "received");
    message.dataset.messageId = msg.id;

    let mediaContent = '';
    if (msg.media) {
        if (msg.media.endsWith('.mp4')) {
            mediaContent = `<video src="${msg.media}" class="media" controls preload="metadata"></video>`;
        } else {
            mediaContent = `<img src="${msg.media}" class="media">`;
        }
    }

    message.innerHTML = `
        <div class="message-content">
            <div><strong>${msg.username || msg.sender}:</strong></div>
            ${msg.text ? `<div>${msg.text}</div>` : ''}
            ${mediaContent}
            ${msg.voice ? `
                <div class="voice-message">
                    <audio controls>
                        <source src="${msg.voice}" type="audio/webm">
                       Your browser does not support the audio element.
                    </audio>
                </div>
            ` : ''}
            <div class="reactions">
                ${Object.entries(msg.reactions || {}).map(([reactor, emoji]) => `<span data-reactor="${reactor}" class="reaction-emoji">${emoji}</span>`).join(' ')}
            </div>
        </div>
        <div class="message-details">
            <span class="message-time">${new Date(msg.timestamp).toLocaleTimeString()}</span>
            ${msg.sender === userId ? `
                <span class="message-status">
                    ${msg.status === "sent" ? '<span class="tick single-tick">✓</span>' : ""}
                    ${msg.status === "delivered" ? '<span class="tick double-tick">✓✓</span>' : ""}
                    ${msg.status === "read" ? '<span class="tick double-tick blue-tick">✓✓</span>' : ""}
                </span>
                <i class="fas fa-trash message-delete" title="Delete Message"></i>
            ` : ''}
        </div>
    `;

    // फोटो के लिए ओरिएंटेशन चेक और फुल स्क्रीन व्यू
    const mediaElement = message.querySelector('.media');
    if (mediaElement && mediaElement.tagName === 'IMG') {
        // इमेज लोड होने का इंतज़ार करें और ओरिएंटेशन चेक करें
        mediaElement.onload = function() {
            if (this.naturalHeight > this.naturalWidth) {
                this.classList.add('portrait');
            } else {
                this.classList.add('landscape');
            }
        };
        // अगर इमेज पहले से लोड हो चुकी हो, तो तुरंत चेक करें
        if (mediaElement.complete) {
            if (mediaElement.naturalHeight > mediaElement.naturalWidth) {
                mediaElement.classList.add('portrait');
            } else {
                mediaElement.classList.add('landscape');
            }
        }

        // फुल स्क्रीन व्यू के लिए क्लिक इवेंट
        mediaElement.addEventListener('click', function(e) {
            e.preventDefault();

            // फुल स्क्रीन डिव बनाएं
            const fullscreenDiv = document.createElement('div');
            fullscreenDiv.classList.add('fullscreen-image-view');
            fullscreenDiv.style.position = 'fixed';
            fullscreenDiv.style.top = '0';
            fullscreenDiv.style.left = '0';
            fullscreenDiv.style.width = '100%';
            fullscreenDiv.style.height = '100%';
            fullscreenDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.9)';
            fullscreenDiv.style.zIndex = '10000';
            fullscreenDiv.style.display = 'flex';
            fullscreenDiv.style.justifyContent = 'center';
            fullscreenDiv.style.alignItems = 'center';

            // फुल स्क्रीन में इमेज कॉपी करें
            const fullscreenImg = document.createElement('img');
            fullscreenImg.src = this.src;
            fullscreenImg.style.maxWidth = '90%';
            fullscreenImg.style.maxHeight = '90%';
            fullscreenImg.style.objectFit = 'contain';

            // "X" (कट) बटन बनाएं
            const closeButton = document.createElement('button');
            closeButton.innerHTML = '✕';
            closeButton.style.position = 'absolute';
            closeButton.style.top = '10px';
            closeButton.style.right = '10px';
            closeButton.style.background = 'rgba(255, 255, 255, 0.8)';
            closeButton.style.border = 'none';
            closeButton.style.borderRadius = '50%';
            closeButton.style.width = '30px';
            closeButton.style.height = '30px';
            closeButton.style.fontSize = '20px';
            closeButton.style.cursor = 'pointer';
            closeButton.style.zIndex = '10001';

            // "X" बटन पर क्लिक करने पर चैट में वापस जाएं
            closeButton.addEventListener('click', function() {
                document.body.removeChild(fullscreenDiv);
                document.body.style.overflow = 'auto'; // स्क्रॉलिंग वापस चालू करें
            });

            // फुल स्क्रीन डिव में इमेज और बटन जोड़ें
            fullscreenDiv.appendChild(fullscreenImg);
            fullscreenDiv.appendChild(closeButton);
            document.body.appendChild(fullscreenDiv);

            // स्क्रॉलिंग रोकें
            document.body.style.overflow = 'hidden';
        });
    }

    // बाकी इवेंट्स (रिएक्शन, डिलीट आदि)
    let pressTimer;
    message.addEventListener('mousedown', (e) => {
        if (e.button === 0) {
            pressTimer = setTimeout(() => showReactionMenu(e, msg.id), 500);
        }
    });
    message.addEventListener('mouseup', () => clearTimeout(pressTimer));
    message.addEventListener('mouseleave', () => clearTimeout(pressTimer));
    message.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showReactionMenu(e, msg.id);
    });

    const deleteBtn = message.querySelector('.message-delete');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to delete this message?')) {
                socket.emit('deleteMessage', { chatId: currentChatId, messageId: msg.id, userId });
            }
        });
    }

    messagesDiv.appendChild(message);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    const reactionEmojis = message.querySelectorAll('.reaction-emoji');
    reactionEmojis.forEach(emoji => {
        emoji.style.fontSize = '16px';
        emoji.style.padding = '2px 4px';
        emoji.style.backgroundColor = '#e9ecef';
        emoji.style.borderRadius = '10px';
        emoji.style.margin = '2px';
    });
}
    // पोल डिस्प्ले करने का फंक्शन
    function displayPoll(poll) {
        if (!poll || !poll.id || !poll.options || !poll.votes) {
            console.error('अमान्य पोल डेटा:', poll);
            return;
        }
    
        const messagesDiv = document.getElementById('messages');
        const existingPoll = messagesDiv.querySelector(`[data-poll-id="${poll.id}"]`);
        if (existingPoll) {
            updatePollDisplay(poll);
            return;
        }
    
        const pollDiv = document.createElement('div');
        pollDiv.classList.add('poll');
        pollDiv.dataset.pollId = poll.id;
    
        const pollHeader = document.createElement('div');
        pollHeader.classList.add('poll-header');
        pollHeader.innerHTML = `
            <div class="poll-question">${poll.question || 'No question'}</div>
            ${poll.sender === userId ? `<i class="fas fa-trash delete-poll" title="Delete Poll"></i>` : ''}
        `;
        pollDiv.appendChild(pollHeader);
    
        const optionsContainer = document.createElement('div');
        optionsContainer.classList.add('poll-options');
        const maxOptions = Math.min(poll.options.length, poll.votes.length);
        for (let i = 0; i < maxOptions; i++) {
            const optionDiv = document.createElement('div');
            optionDiv.classList.add('poll-option');
            optionDiv.dataset.option = i;
            const isVoted = poll.votes[i]?.includes(userId) || false;
            optionDiv.style.backgroundColor = isVoted ? '#00a884' : '';
            optionDiv.style.color = isVoted ? 'white' : '';
            optionDiv.textContent = `${poll.options[i] || 'अज्ञात'} (${poll.votes[i]?.length || 0} वोट)`;
            optionsContainer.appendChild(optionDiv);
        }
        pollDiv.appendChild(optionsContainer);
    
        const analyticsBtn = document.createElement('button');
        analyticsBtn.classList.add('poll-analytics-btn');
        analyticsBtn.dataset.pollId = poll.id;
        analyticsBtn.textContent = 'View Analytics';
        pollDiv.appendChild(analyticsBtn);
    
        const analyticsDiv = document.createElement('div');
        analyticsDiv.classList.add('poll-analytics');
        analyticsDiv.style.display = 'none';
        pollDiv.appendChild(analyticsDiv);
    
        const deletePollBtn = pollHeader.querySelector('.delete-poll');
        if (deletePollBtn) {
            deletePollBtn.addEventListener('click', () => {
                if (confirm('Are you sure you want to remove this Poll?')) {
                    socket.emit('deletePoll', { chatId: currentChatId, pollId: poll.id, userId });
                }
            });
        }
    
        optionsContainer.querySelectorAll('.poll-option').forEach(option => {
            option.addEventListener('click', () => {
                const optionIndex = parseInt(option.dataset.option);
                if (!poll.votes[optionIndex]?.includes(userId)) {
                    console.log('वोट भेजा जा रहा है:', { chatId: currentChatId, pollId: poll.id, optionIndex, userId });
                    socket.emit('votePoll', { chatId: currentChatId, pollId: poll.id, optionIndex, userId });
                } else {
                    console.log('आप पहले ही इस विकल्प पर वोट कर चुके हैं!');
                }
            });
        });
    
        analyticsBtn.addEventListener('click', () => {
            if (analyticsDiv.style.display === 'none') {
                analyticsDiv.style.display = 'block';
                analyticsDiv.innerHTML = poll.options.map((option, index) => `
                    <div>${option || 'अज्ञात'}: ${poll.votes[index]?.length || 0} वोट</div>
                `).join('');
            } else {
                analyticsDiv.style.display = 'none';
            }
        });
    
        messagesDiv.appendChild(pollDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        polls[poll.id] = poll; // पोल को लोकल स्टोर में सेव करें
    }

    // पोल अपडेट करने का फंक्शन
    function updatePollDisplay(poll) {
        const messagesDiv = document.getElementById('messages');
        const pollDiv = messagesDiv.querySelector(`[data-poll-id="${poll.id}"]`);
        if (!pollDiv) return;
    
        const optionsContainer = pollDiv.querySelector('.poll-options');
        if (!optionsContainer) return;
    
        optionsContainer.innerHTML = ''; // पुराने विकल्प हटाएं
        const maxOptions = Math.min(poll.options.length, poll.votes.length);
        for (let i = 0; i < maxOptions; i++) {
            const optionDiv = document.createElement('div');
            optionDiv.classList.add('poll-option');
            optionDiv.dataset.option = i;
            const isVoted = poll.votes[i]?.includes(userId) || false;
            optionDiv.style.backgroundColor = isVoted ? '#00a884' : '';
            optionDiv.style.color = isVoted ? 'white' : '';
            optionDiv.textContent = `${poll.options[i] || 'अज्ञात'} (${poll.votes[i]?.length || 0} वोट)`;
            optionsContainer.appendChild(optionDiv);
        }
    
        optionsContainer.querySelectorAll('.poll-option').forEach(option => {
            option.addEventListener('click', () => {
                const optionIndex = parseInt(option.dataset.option);
                if (!poll.votes[optionIndex]?.includes(userId)) {
                    console.log('वोट अपडेट के लिए भेजा जा रहा है:', { chatId: currentChatId, pollId: poll.id, optionIndex, userId });
                    socket.emit('votePoll', { chatId: currentChatId, pollId: poll.id, optionIndex, userId });
                }
            });
        });
    }
// प्रोफाइल एडिट बटन का इवेंट
// प्रोफाइल एडिट बटन का इवेंट
// प्रोफाइल एडिट बटन का इवेंट
const editProfileButton = document.getElementById('editProfileButton');
if (editProfileButton) {
    editProfileButton.addEventListener("click", () => {
        const modal = document.getElementById('editProfileModal');
        if (modal) {
            modal.style.display = 'flex';
            // मौजूदा फील्ड्स
            const profileStatus = document.getElementById('profileStatus');
            const bio = document.getElementById('bio');
            const profilePicDisplay = document.getElementById('profilePicDisplay');
            const usernameDisplay = document.getElementById('usernameDisplay');
            const passwordDisplay = document.getElementById('passwordDisplay');

            if (profileStatus) profileStatus.value = userProfile.status || '';
            if (bio) bio.value = userProfile.bio || '';
            if (profilePicDisplay) profilePicDisplay.src = userProfile.profilePic || '/placeholder.png';
            if (usernameDisplay) usernameDisplay.value = userProfile.username || '';
            if (passwordDisplay) {
                // पासवर्ड को सही तरीके से लोड करें
                passwordDisplay.value = userProfile.password || ''; // यह लाइन पहले से है, लेकिन सुनिश्चित करें कि passwordDisplay सही ID है
            }
        }
    });
}
// लॉगिन फॉर्म सबमिट
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;
        const response = await fetch('https://chatzap.xyz/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const result = await response.json();
        if (result.success) {
            userId = result.userId;
            userProfile = result.profile; // यहाँ userProfile में पासवर्ड भी आएगा
            // बाकी कोड...
        }
    });
}
// प्रोफाइल अपडेट फॉर्म सबमिट करने का इवेंट (पहले से है, कोई बदलाव नहीं)
// प्रोफाइल अपडेट फॉर्म सबमिट करने का इवेंट
const editProfileForm = document.getElementById('editProfileForm');
if (editProfileForm) {
    editProfileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const profilePic = document.getElementById('profilePicInput')?.files[0];
        const status = document.getElementById('profileStatus')?.value;
        const bio = document.getElementById('bio')?.value;

        const formData = new FormData();
        formData.append('userId', userId);
        if (status) formData.append('status', status);
        if (bio) formData.append('bio', bio);
        if (profilePic) formData.append('profilePic', profilePic);
        // पासवर्ड को formData में नहीं जोड़ा, क्योंकि यह रीड-ओनली है

        const response = await fetch('https://chatzap.xyz/updateProfile', { method: 'POST', body: formData });
        const result = await response.json();
        if (result.success) {
            userProfile = {
                ...result.profile,
                password: userProfile.password // मौजूदा पासवर्ड बनाए रखें
            };
            const modal = document.getElementById('editProfileModal');
            if (modal) modal.style.display = 'none';
            socket.emit('profileUpdated', { userId, profilePic: userProfile.profilePic, status: userProfile.status, bio: userProfile.bio, username: userProfile.username });
        }
    });
}


    // प्रोफाइल मोडल बंद करने का इवेंट
    const closeEditProfileModal = document.getElementById('closeEditProfileModal');
    if (closeEditProfileModal) {
        closeEditProfileModal.addEventListener('click', () => {
            const modal = document.getElementById('editProfileModal');
            if (modal) modal.style.display = 'none';
        });
    }

    // माइक्रोफोन बटन के लिए रिकॉर्डिंग शुरू और बंद करने के इवेंट्स
    const micButton = document.getElementById('micButton');
    if (micButton) {
        micButton.addEventListener('mousedown', startRecording);
        micButton.addEventListener('mouseup', stopRecording);
    }

    async function startRecording(e) {
        e.preventDefault();
        if (!currentChatId) {
            alert('Please Select a Chat first');
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            mediaRecorder.start();
            mediaRecorder.ondataavailable = (event) => audioChunks.push(event.data);
            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                const formData = new FormData();
                formData.append('file', audioBlob, 'voice-message.webm');
                const response = await fetch('https://chatzap.xyz/upload', { method: 'POST', body: formData });
                const result = await response.json();
                if (result.filePath && currentChatId) {
                    const messageId = `${currentChatId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    socket.emit('sendMessage', { 
                        chatId: currentChatId, 
                        text: "", 
                        sender: userId, 
                        receiverId: selectedReceiver, 
                        media: null, 
                        voice: result.filePath,
                        messageId
                    });
                }
                stream.getTracks().forEach(track => track.stop());
            };
        } catch (error) {
            console.error('माइक्रोफोन एक्सेस त्रुटि:', error);
            alert('माइक्रोफोन तक पहुँच अस्वीकृत या त्रुटि हुई');
        }
    }

    function stopRecording(e) {
        e.preventDefault();
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                const formData = new FormData();
                formData.append('file', audioBlob, 'voice-message.webm');
                const response = await fetch('https://chatzap.xyz/upload', { method: 'POST', body: formData });
                const result = await response.json();
                if (result.filePath && currentChatId) {
                    const messageId = `${currentChatId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    const message = {
                        id: messageId,
                        chatId: currentChatId,
                        text: "",
                        sender: userId,
                        username: userProfile.username,
                        timestamp: new Date().toISOString(),
                        status: 'sent',
                        media: null,
                        voice: result.filePath,
                        reactions: {}
                    };
                    // लोकली मैसेज डिस्प्ले करें
                    displayMessage(message);
                    // सर्वर को मैसेज भेजें
                    socket.emit('sendMessage', { 
                        chatId: currentChatId, 
                        text: "", 
                        sender: userId, 
                        receiverId: selectedReceiver, 
                        media: null, 
                        voice: result.filePath,
                        messageId
                    });
                    messagesDiv.scrollTop = messagesDiv.scrollHeight; // स्क्रॉल नीचे करें
                }
                stream.getTracks().forEach(track => track.stop());
            };
        }
    }

    // फाइल बटन पर क्लिक करने का इवेंट (पेपरक्लिप) - यहाँ फिक्स किया गया है
    const fileButton = document.getElementById('fileButton');
    if (fileButton) {
        fileButton.addEventListener('click', (e) => {
            e.preventDefault();
            showAttachmentMenu(e); // अटैचमेंट मेन्यू दिखाएं
        });
    } else {
        console.error('फाइल बटन नहीं मिला!');
    }

    // फाइल इनपुट पर बदलाव होने का इवेंट
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.addEventListener("change", async (e) => {
            const file = e.target.files[0];
            if (file && currentChatId) {
                const formData = new FormData();
                formData.append('file', file);
                const response = await fetch('https://chatzap.xyz/upload', { method: 'POST', body: formData });
                const result = await response.json();
                if (result.filePath) {
                    const messageId = `${currentChatId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    const message = {
                        id: messageId,
                        chatId: currentChatId,
                        text: "",
                        sender: userId,
                        username: userProfile.username,
                        timestamp: new Date().toISOString(),
                        status: 'sent',
                        media: result.filePath,
                        voice: null,
                        reactions: {}
                    };
                    // लोकली मैसेज डिस्प्ले करें
                    displayMessage(message);
                    // सर्वर को मैसेज भेजें
                    socket.emit('sendMessage', {
                        chatId: currentChatId,
                        text: "",
                        sender: userId,
                        receiverId: selectedReceiver,
                        media: result.filePath,
                        voice: null,
                        messageId
                    });
                    messagesDiv.scrollTop = messagesDiv.scrollHeight; // स्क्रॉल नीचे करें
                }
                fileInput.value = ''; // इनपुट रीसेट करें
            }
        });
    }

    // कॉन्टैक्ट जोड़ने का बटन इवेंट
    const addContactButton = document.getElementById('addContactButton');
    if (addContactButton) {
        addContactButton.addEventListener("click", () => {
            const modal = document.getElementById('addContactModal');
            if (modal) modal.style.display = 'flex';
        });
    }

    // कॉन्टैक्ट फॉर्म सबमिट करने का इवेंट
// कॉन्टैक्ट फॉर्म सबमिट करने का इवेंट
const addContactForm = document.getElementById('addContactForm');
if (addContactForm) {
    addContactForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const contactName = document.getElementById('contactName')?.value;
        if (contactName && userId) {
            fetch('https://chatzap.xyz/addContact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: contactName, currentUserId: userId })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    const modal = document.getElementById('addContactModal');
                    if (modal) modal.style.display = 'none';
                    // नया बदलाव: पुरानी चैट्स रीसेट करें और दोनों यूजर्स के लिए रिफ्रेश करें
                    chats = []; // चैट्स ऐरे को खाली करें
                    socket.emit('chatList', { userId }); // अपनी चैट लिस्ट रिफ्रेश करें
                    // नया कॉन्टैक्ट जोड़ा गया, तो उनके लिए भी अपडेट करें
                    fetch(`https://chatzap.xyz/getUsers?userId=${userId}`)
                        .then(res => res.json())
                        .then(users => {
                            const contact = users.find(u => u.username === contactName);
                            if (contact) {
                                socket.emit('chatList', { userId: contact.userId }); // कॉन्टैक्ट की चैट लिस्ट रिफ्रेश करें
                            }
                        });
                } else {
                    alert(data.message || 'Error adding contact');
                }
            })
            .catch(error => {
                console.error('कॉन्टैक्ट जोड़ने में त्रुटि:', error);
                alert('सर्वर त्रुटि, कृपया पुनः प्रयास करें या यूजर को रजिस्टर करें');
            });
        }
    });
}

    // कॉन्टैक्ट मोडल बंद करने का इवेंट
    const closeAddContactModal = document.getElementById('closeAddContactModal');
    if (closeAddContactModal) {
        closeAddContactModal.addEventListener('click', () => {
            const modal = document.getElementById('addContactModal');
            if (modal) modal.style.display = 'none';
        });
    }

    // स्टेटस जोड़ने का बटन इवेंट
    const addStatusButton = document.getElementById('addStatusButton');
    if (addStatusButton) {
        addStatusButton.addEventListener("click", () => {
            const modal = document.getElementById('addStatusModal');
            if (modal) modal.style.display = 'flex';
        });
    }

    // स्टेटस फॉर्म सबमिट करने का इवेंट
    const addStatusForm = document.getElementById('addStatusForm');
    if (addStatusForm) {
        addStatusForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const statusText = document.getElementById('statusText')?.value;
            const statusFile = document.getElementById('statusFile')?.files[0];
            const formData = new FormData();
            formData.append('userId', userId);
            if (statusText) formData.append('text', statusText);
            if (statusFile) formData.append('file', statusFile);

            const response = await fetch('https://chatzap.xyz/addStatus', { method: 'POST', body: formData });
            const result = await response.json();
            if (result.success) {
                const modal = document.getElementById('addStatusModal');
                if (modal) modal.style.display = 'none';
            }
        });
    }

    // स्टेटस मोडल बंद करने का इवेंट
    const closeAddStatusModal = document.getElementById('closeAddStatusModal');
    if (closeAddStatusModal) {
        closeAddStatusModal.addEventListener('click', () => {
            const modal = document.getElementById('addStatusModal');
            if (modal) modal.style.display = 'none';
        });
    }

    // ग्रुप बनाने का बटन इवेंट
    const createGroupButton = document.getElementById('createGroupButton');
    if (createGroupButton) {
        createGroupButton.addEventListener("click", () => {
            const modal = document.getElementById('createGroupModal');
            if (modal) modal.style.display = 'flex';
            fetch(`https://chatzap.xyz/getUsers?userId=${userId}`)
                .then(response => response.json())
                .then(users => {
                    const selectElement = document.getElementById('select-members');
                    if (selectElement) {
                        selectElement.innerHTML = '';
                        users.forEach(user => {
                            if (user.userId !== userId) {
                                const option = document.createElement('option');
                                option.value = user.userId;
                                option.textContent = user.username;
                                selectElement.appendChild(option);
                            }
                        });
                    }
                })
                .catch(error => console.error('कॉन्टैक्ट्स लोड करने में त्रुटि:', error));
        });
    }

    // ग्रुप फॉर्म सबमिट करने का इवेंट
    const createGroupForm = document.getElementById('createGroupForm');
    if (createGroupForm) {
        createGroupForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const groupName = document.getElementById('groupName')?.value;
            const selectElement = document.getElementById('select-members');
            const members = Array.from(selectElement.selectedOptions).map(option => option.value);

            if (groupName && members.length > 0) {
                fetch('https://chatzap.xyz/createGroup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: groupName, members, creatorId: userId })
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        const modal = document.getElementById('createGroupModal');
                        if (modal) {
                            modal.style.display = 'none';
                            document.getElementById('groupName').value = '';
                            selectElement.selectedIndex = -1;
                            socket.emit('chatList');
                        }
                    } else {
                        alert(data.message);
                    }
                })
                .catch(error => console.error('ग्रुप क्रिएट करने में त्रुटि:', error));
            } else {
                alert('Please Select the name of the group and and at least one member');
            }
        });
    }

    // ग्रुप मोडल बंद करने का इवेंट
    const closeCreateGroupModal = document.getElementById('closeCreateGroupModal');
    if (closeCreateGroupModal) {
        closeCreateGroupModal.addEventListener('click', () => {
            const modal = document.getElementById('createGroupModal');
            if (modal) modal.style.display = 'none';
            const selectElement = document.getElementById('select-members');
            if (selectElement) selectElement.selectedIndex = -1;
            document.getElementById('groupName').value = '';
        });
    }

    // पोल फॉर्म सबमिट करने का इवेंट
    const createPollForm = document.getElementById('createPollForm');
    if (createPollForm) {
        createPollForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const question = document.getElementById('pollQuestion')?.value;
            const optionsText = document.getElementById('pollOptions')?.value;
            if (question && optionsText && currentChatId) {
                const options = optionsText.split('\n').map(opt => opt.trim()).filter(opt => opt);
                if (options.length >= 2) {
                    const pollId = `${currentChatId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    const poll = {
                        id: pollId,
                        chatId: currentChatId,
                        question,
                        options,
                        votes: options.map(() => []),
                        sender: userId
                    };
                    // लोकली पोल डिस्प्ले करें
                    displayPoll(poll);
                    // सर्वर को पोल भेजें
                    socket.emit('createPoll', { chatId: currentChatId, question, options, sender: userId });
                    const modal = document.getElementById('createPollModal');
                    if (modal) modal.style.display = 'none';
                    messagesDiv.scrollTop = messagesDiv.scrollHeight; // स्क्रॉल नीचे करें
                } else {
                    alert('Please put at least 2 option');
                }
            }
        });
    }

    // पोल मोडल बंद करने का इवेंट
    const closeCreatePollModal = document.getElementById('closeCreatePollModal');
    if (closeCreatePollModal) {
        closeCreatePollModal.addEventListener('click', () => {
            const modal = document.getElementById('createPollModal');
            if (modal) modal.style.display = 'none';
        });
    }

    // चैट इनपुट लिस्टनर्स शुरू करने का फंक्शन
    function initChatInputListeners() {
        const sendButton = document.getElementById('sendButton');
        const messageInput = document.getElementById('messageInput');
        if (sendButton && messageInput) {
            // पुराने लिस्टनर्स हटाएं
            sendButton.replaceWith(sendButton.cloneNode(true));
            messageInput.replaceWith(messageInput.cloneNode(true));
            
            // नए लिस्टनर्स जोड़ें
            const newSendButton = document.getElementById('sendButton');
            const newMessageInput = document.getElementById('messageInput');
            newSendButton.addEventListener('click', sendMessage);
            newMessageInput.addEventListener('keypress', handleKeyPress);
        }
    }
    function handleKeyPress(e) {
        if (e.key === 'Enter') {
            sendMessage();
        }
    }

    // मैसेज भेजने का फंक्शन
    function sendMessage() {
        const text = document.getElementById('messageInput')?.value.trim();
        if (text && currentChatId && socket) {
            const messageId = `${currentChatId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const message = {
                id: messageId,
                chatId: currentChatId,
                text,
                sender: userId,
                username: userProfile.username,
                timestamp: new Date().toISOString(),
                status: 'sent',
                media: null,
                voice: null,
                reactions: {}
            };
            // नया बदलाव: selectedReceiver को फिर से सत्यापित करें
            const chat = chats.find(c => c.id === currentChatId);
            if (chat && !chat.isGroup) {
                selectedReceiver = chat.participants.find(p => p !== userId);
            }
            // लोकली मैसेज डिस्प्ले करें
            displayMessage(message);
            // सर्वर को मैसेज भेजें
            socket.emit('sendMessage', { 
                chatId: currentChatId, 
                text, 
                sender: userId, 
                receiverId: selectedReceiver, 
                media: null, 
                voice: null, 
                messageId
            });
            document.getElementById('messageInput').value = "";
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
    }

    initChatInputListeners();

    // WebRTC कॉन्फिगरेशन
    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            {
                urls: 'turn:turn.anyfirewall.com:443?transport=tcp',
                username: 'webrtc',
                credential: 'webrtc'
            }
        ],
        iceTransportPolicy: 'all',
        iceCandidatePoolSize: 10
    };

    // कॉल शुरू करने का फंक्शन
    async function startCall(callType) {
        if (!selectedReceiver) return alert('Please Select a chat first');
        try {
            const constraints = callType === 'video' ? { audio: true, video: { width: 640, height: 480 } } : { audio: true };
            localStream = await navigator.mediaDevices.getUserMedia(constraints);
            const localVideo = document.getElementById('localVideo');
            localVideo.srcObject = localStream;
            localVideo.muted = true; // लोकल वीडियो की आवाज़ म्यूट करें ताकि इको न हो
    
            peerConnection = new RTCPeerConnection(configuration);
            localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    
            peerConnection.ontrack = (event) => {
                console.log('रिमोट स्ट्रीम प्राप्त हुई:', event.streams);
                if (!remoteStream || remoteStream.id !== event.streams[0].id) {
                    remoteStream = event.streams[0];
                    const remoteVideo = document.getElementById('remoteVideo');
                    remoteVideo.srcObject = remoteStream;
                    remoteVideo.play(); // सुनिश्चित करें कि रिमोट वीडियो चल रहा है
                }
            };
    
            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    console.log('ICE कैंडिडेट भेजा जा रहा है:', event.candidate);
                    socket.emit('ice-candidate', { receiverId: selectedReceiver, candidate: event.candidate });
                }
            };
    
            peerConnection.onconnectionstatechange = () => {
                console.log('कनेक्शन स्टेट:', peerConnection.connectionState);
                if (peerConnection.connectionState === 'connected') {
                    console.log('कॉल कनेक्ट हो गया!');
                } else if (peerConnection.connectionState === 'failed') {
                    console.log('कनेक्शन फेल हो गया, पुनः प्रयास करें');
                    endCall();
                }
            };
    
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            socket.emit('call-user', { receiverId: selectedReceiver, offer, callType });
            document.getElementById('callModal').style.display = 'flex';
            initializeCallControls(callType);
        } catch (error) {
            console.error('कॉल सेटअप त्रुटि:', error);
            alert('कॉल शुरू करने में त्रुटि, कृपया माइक्रोफोन/कैमरा चेक करें');
        }
    }

    function endCall() {
        if (peerConnection) peerConnection.close();
        if (localStream) localStream.getTracks().forEach(track => track.stop());
        if (remoteStream) remoteStream.getTracks().forEach(track => track.stop());
        document.getElementById('callModal').style.display = 'none';
        socket.emit('end-call', { receiverId: selectedReceiver });
        peerConnection = null;
        localStream = null;
        remoteStream = null;
    }

   // कॉल कंट्रोल्स शुरू करने का फंक्शन
function initializeCallControls(callType) {
    const muteButton = document.getElementById('muteButton');
    const videoButton = document.getElementById('videoButton');
    const fullScreenButton = document.getElementById('fullScreenButton');
    const endCallButton = document.getElementById('endCallButton');
    const callerDP = document.getElementById('callerDP');
    const callerName = document.getElementById('callerName');
    const localVideo = document.getElementById('localVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    const videoContainer = document.querySelector('.video-container');

    // Adjust video layout based on call type
    if (callType === 'voice') {
        remoteVideo.style.display = 'none';
        localVideo.style.display = 'none';
        const otherUser = chats.find(c => c.participants && c.participants.includes(selectedReceiver))?.participants.find(p => p !== userId);
        fetch(`https://chatzap.xyz/getUsers?userId=${userId}`)
            .then(response => response.json())
            .then(users => {
                const user = users.find(u => u.userId === otherUser);
                if (user) {
                    callerDP.src = user.profilePic || "/placeholder.png";
                    callerName.textContent = user.username || "अज्ञात";
                }
            });
    } else {
        remoteVideo.style.display = 'block';
        localVideo.style.display = 'block';
        callerDP.style.display = 'none';
        callerName.style.display = 'none';

        // Ensure videos fit the container
        function adjustVideoLayout() {
            const containerWidth = videoContainer.offsetWidth;
            const containerHeight = videoContainer.offsetHeight;
            remoteVideo.style.width = `${containerWidth}px`;
            remoteVideo.style.height = `${containerHeight}px`;
            localVideo.style.width = `${containerWidth * 0.2}px`; // 20% of container width
            localVideo.style.height = 'auto'; // Maintain aspect ratio
        }

        // Initial adjustment
        adjustVideoLayout();

        // Handle window resize
        window.addEventListener('resize', adjustVideoLayout);

        // Clean up resize listener when call ends
        const cleanupResize = () => {
            window.removeEventListener('resize', adjustVideoLayout);
        };
        if (endCallButton) {
            endCallButton.addEventListener('click', () => {
                cleanupResize();
            });
        }
    }

    if (muteButton) {
        let isMuted = false;
        muteButton.classList.remove('muted');
        muteButton.title = 'म्यूट';
        muteButton.innerHTML = '<i class="fas fa-microphone"></i>';
        muteButton.addEventListener('click', () => {
            if (localStream) {
                const audioTracks = localStream.getAudioTracks();
                if (audioTracks.length > 0) {
                    isMuted = !isMuted;
                    audioTracks[0].enabled = !isMuted;
                    muteButton.classList.toggle('muted', isMuted);
                    muteButton.title = isMuted ? 'अनम्यूट' : 'म्यूट';
                    muteButton.innerHTML = isMuted 
                        ? '<i class="fas fa-microphone-slash"></i>' 
                        : '<i class="fas fa-microphone"></i>';
                }
            }
        });
    }

    if (videoButton && callType === 'video') {
        let isVideoOff = false;
        videoButton.title = 'वीडियो बंद करें';
        videoButton.innerHTML = '<i class="fas fa-video"></i>';
        videoButton.addEventListener('click', () => {
            if (localStream) {
                const videoTracks = localStream.getVideoTracks();
                if (videoTracks.length > 0) {
                    isVideoOff = !isVideoOff;
                    videoTracks[0].enabled = !isVideoOff;
                    videoButton.title = isVideoOff ? 'वीडियो चालू करें' : 'वीडियो बंद करें';
                    videoButton.innerHTML = isVideoOff 
                        ? '<i class="fas fa-video-slash"></i>' 
                        : '<i class="fas fa-video"></i>';
                }
            }
        });
    } else if (videoButton) {
        videoButton.style.display = 'none';
    }

    if (fullScreenButton) {
        fullScreenButton.addEventListener('click', () => {
            const videoContainer = document.querySelector('.video-container');
            if (videoContainer.requestFullscreen) {
                videoContainer.requestFullscreen();
            } else if (videoContainer.mozRequestFullScreen) {
                videoContainer.mozRequestFullScreen();
            } else if (videoContainer.webkitRequestFullscreen) {
                videoContainer.webkitRequestFullscreen();
            } else if (videoContainer.msRequestFullscreen) {
                videoContainer.msRequestFullscreen();
            }
        });
    }

    if (endCallButton) {
        endCallButton.addEventListener('click', () => {
            if (peerConnection) peerConnection.close();
            if (localStream) localStream.getTracks().forEach(track => track.stop());
            if (remoteStream) remoteStream.getTracks().forEach(track => track.stop());
            document.getElementById('callModal').style.display = 'none';
            socket.emit('end-call', { receiverId: selectedReceiver });
            peerConnection = null;
            localStream = null;
            remoteStream = null;
        });
    }
}
    // वॉइस और वीडियो कॉल बटन इवेंट्स
    const voiceCallButton = document.getElementById('voiceCallButton');
    if (voiceCallButton) {
        voiceCallButton.addEventListener('click', () => startCall('voice'));
    }

    const videoCallButton = document.getElementById('videoCallButton');
    if (videoCallButton) {
        videoCallButton.addEventListener('click', () => startCall('video'));
    }

    // इनकमिंग कॉल प्राप्त करने का सॉकेट इवेंट
    socket.on('call-received', ({ callerId, offer, callType }) => {
        console.log('Call received by:', userId, 'from:', callerId, 'with type:', callType);
        incomingCallData = { callerId, offer, callType };
        const incomingCallModal = document.getElementById('incomingCallModal');
        const callerIdElement = document.getElementById('callerId');
        const callTypeElement = document.getElementById('callType');
        if (incomingCallModal && callerIdElement && callTypeElement) {
            fetch(`https://chatzap.xyz/getUsers?userId=${userId}`)
                .then(response => response.json())
                .then(users => {
                    const caller = users.find(u => u.userId === callerId);
                    callerIdElement.textContent = caller ? caller.username : callerId;
                    callTypeElement.textContent = callType === 'video' ? 'Video Call' : 'Voice Call';
                    incomingCallModal.style.display = 'flex';
                })
                .catch(error => console.error('Caller info fetch error:', error));
        } else {
            console.error('Incoming call modal or elements not found');
        }
    });

    // कॉल स्वीकार करने का बटन इवेंट
    const acceptCallButton = document.getElementById('acceptCallButton');
    if (acceptCallButton) {
        acceptCallButton.addEventListener('click', async () => {
            const incomingCallModal = document.getElementById('incomingCallModal');
            if (incomingCallModal) incomingCallModal.style.display = 'none';
            const constraints = incomingCallData.callType === 'video' ? { audio: true, video: { width: 640, height: 480 } } : { audio: true };
            try {
                localStream = await navigator.mediaDevices.getUserMedia(constraints);
                const localVideo = document.getElementById('localVideo');
                localVideo.srcObject = localStream;
                localVideo.muted = true; // लोकल ऑडियो म्यूट करें
    
                peerConnection = new RTCPeerConnection(configuration);
                localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    
                peerConnection.ontrack = (event) => {
                    console.log('रिमोट स्ट्रीम प्राप्त हुई (स्वीकार):', event.streams);
                    if (!remoteStream || remoteStream.id !== event.streams[0].id) {
                        remoteStream = event.streams[0];
                        const remoteVideo = document.getElementById('remoteVideo');
                        remoteVideo.srcObject = remoteStream;
                        remoteVideo.play(); // रिमोट वीडियो चलाएं
                    }
                };
    
                peerConnection.onicecandidate = (event) => {
                    if (event.candidate) {
                        console.log('ICE कैंडिडेट भेजा जा रहा है (स्वीकार):', event.candidate);
                        socket.emit('ice-candidate', { receiverId: incomingCallData.callerId, candidate: event.candidate });
                    }
                };
    
                peerConnection.onconnectionstatechange = () => {
                    console.log('कनेक्शन स्टेट (स्वीकार):', peerConnection.connectionState);
                    if (peerConnection.connectionState === 'connected') {
                        console.log('कॉल कनेक्ट हो गया (स्वीकार)!');
                    } else if (peerConnection.connectionState === 'failed') {
                        console.log('कनेक्शन फेल हो गया (स्वीकार), पुनः प्रयास करें');
                        endCall();
                    }
                };
    
                await peerConnection.setRemoteDescription(new RTCSessionDescription(incomingCallData.offer));
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                socket.emit('call-accepted', { callerId: incomingCallData.callerId, answer });
    
                document.getElementById('callModal').style.display = 'flex';
                initializeCallControls(incomingCallData.callType);
            } catch (error) {
                console.error('कॉल स्वीकार त्रुटि:', error);
                alert('कॉल स्वीकार करने में त्रुटि, कृपया माइक्रोफोन/कैमरा चेक करें');
            }
        });
    }

    // कॉल अस्वीकार करने का बटन इवेंट
    const declineCallButton = document.getElementById('declineCallButton');
    if (declineCallButton) {
        declineCallButton.addEventListener('click', () => {
            const incomingCallModal = document.getElementById('incomingCallModal');
            if (incomingCallModal) incomingCallModal.style.display = 'none';
            socket.emit('call-rejected', { callerId: incomingCallData.callerId });
            incomingCallData = null;
        });
    }

    // कॉल खत्म होने पर अपडेट
    socket.on('call-ended', () => {
        if (peerConnection) peerConnection.close();
        if (localStream) localStream.getTracks().forEach(track => track.stop());
        if (remoteStream) remoteStream.getTracks().forEach(track => track.stop());
        document.getElementById('callModal').style.display = 'none';
        peerConnection = null;
        localStream = null;
        remoteStream = null;
    });

    // ICE कैंडिडेट्स प्राप्त करने का सॉकेट इवेंट
    socket.on('ice-candidate', async ({ candidate }) => {
        if (peerConnection) {
            try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                console.log('ICE कैंडिडेट जोड़ा गया:', candidate);
            } catch (error) {
                console.error('ICE कैंडिडेट जोड़ने में त्रुटि:', error);
            }
        } else {
            console.warn('peerConnection तैयार नहीं है, ICE कैंडिडेट छोड़ दिया गया');
        }
    });

    // कॉल स्वीकार होने पर अपडेट
    socket.on('call-accepted', async ({ answer }) => {
        if (peerConnection) {
            try {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
                console.log('रिमोट डिस्क्रिप्शन सेट की गई');
            } catch (error) {
                console.error('रिमोट डिस्क्रिप्शन सेट करने में त्रुटि:', error);
            }
        }
    });
}

// स्टेटस व्यू दिखाने का फंक्शन
function showStatusView(status) {
    const modal = document.getElementById('statusViewModal');
    if (modal) {
        modal.style.display = 'flex';
        document.getElementById('statusViewUser').textContent = status.username || status.userId;
        document.getElementById('statusViewTime').textContent = new Date(status.timestamp).toLocaleTimeString();
        const contentDiv = document.getElementById('statusViewContent');
        contentDiv.innerHTML = '';
        
        let videoElement = null;
        if (status.text) {
            const textDiv = document.createElement('div');
            textDiv.classList.add('status-view-text');
            textDiv.textContent = status.text;
            contentDiv.appendChild(textDiv);
        }
        if (status.media) {
            if (status.media.endsWith('.mp4')) {
                contentDiv.innerHTML = `<video src="${status.media}" class="status-view-media" autoplay></video>`;
                videoElement = contentDiv.querySelector('video');
                videoElement.muted = false; // ऑडियो को चालू रखें
            } else {
                contentDiv.innerHTML = `<img src="${status.media}" class="status-view-media">`;
            }
        }
        if (status.userId === userId) {
            const deleteBtn = document.createElement('i');
            deleteBtn.classList.add('fas', 'fa-trash', 'delete-status-full');
            deleteBtn.dataset.statusId = status.id;
            deleteBtn.title = 'स्टेटस हटाएं';
            contentDiv.appendChild(deleteBtn);
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm('Do You Want to Remvoe Status?')) {
                    socket.emit('deleteStatus', { statusId: status.id, userId });
                }
            });
        }

        // पुराना टाइमर साफ करें
        if (statusTimer) clearTimeout(statusTimer);

        // वीडियो ड्यूरेशन या डिफॉल्ट 5-सेकंड टाइमआउट
        if (videoElement) {
            videoElement.addEventListener('loadedmetadata', () => {
                const duration = videoElement.duration * 1000; // मिलीसेकंड में
                videoElement.play().catch(err => console.error('वीडियो प्ले करने में त्रुटि:', err)); // प्ले शुरू करें
                statusTimer = setTimeout(() => {
                    switchToNextStatus();
                }, duration); // वीडियो की पूरी अवधि के बाद अगला स्टेटस
            });

            // यूजर द्वारा वीडियो पॉज या खत्म होने पर मैनुअल कंट्रोल
            videoElement.addEventListener('pause', () => {
                if (statusTimer) clearTimeout(statusTimer);
            });
            videoElement.addEventListener('play', () => {
                if (!statusTimer) {
                    statusTimer = setTimeout(() => {
                        switchToNextStatus();
                    }, (videoElement.duration - videoElement.currentTime) * 1000);
                }
            });
            videoElement.addEventListener('ended', () => {
                switchToNextStatus(); // वीडियो खत्म होने पर ऑटो-एडवांस
            });
        } else {
            // इमेज या टेक्स्ट के लिए डिफॉल्ट 5-सेकंड टाइमआउट
            statusTimer = setTimeout(() => {
                switchToNextStatus();
            }, 5000);
        }
    }
}

// अगला स्टेटस दिखाने का फंक्शन
function switchToNextStatus() {
    if (statusTimer) clearTimeout(statusTimer);
    currentStatusIndex = (currentStatusIndex + 1) % allStatuses.length;
    if (currentStatusIndex < allStatuses.length) {
        showStatusView(allStatuses[currentStatusIndex]);
    } else {
        document.getElementById('statusViewModal').style.display = 'none';
        currentStatusIndex = -1;
    }
}

// पिछले स्टेटस बटन का इवेंट
const prevStatusButton = document.getElementById('prevStatusButton');
if (prevStatusButton) {
    prevStatusButton.addEventListener('click', () => {
        if (currentStatusIndex > 0) {
            if (statusTimer) clearTimeout(statusTimer);
            currentStatusIndex--;
            showStatusView(allStatuses[currentStatusIndex]);
        }
    });
}

// अगला स्टेटस बटन का इवेंट
const nextStatusButton = document.getElementById('nextStatusButton');
if (nextStatusButton) {
    nextStatusButton.addEventListener('click', () => {
        if (statusTimer) clearTimeout(statusTimer);
        switchToNextStatus();
    });
}

// स्टेटस व्यू मोडल बंद करने का इवेंट
const closeStatusViewModal = document.getElementById('closeStatusViewModal');
if (closeStatusViewModal) {
    closeStatusViewModal.addEventListener('click', () => {
        const modal = document.getElementById('statusViewModal');
        if (modal) {
            // अगर कोई वीडियो चल रहा है, तो उसे पॉज करें
            const videoElement = document.querySelector('#statusViewContent video');
            if (videoElement) {
                videoElement.pause();
                videoElement.currentTime = 0; // वीडियो को शुरू में रीसेट करें
            }
            modal.style.display = 'none';
            if (statusTimer) clearTimeout(statusTimer);
            currentStatusIndex = -1;
        }
    });
}

// client.js में मौजूदा showReactionMenu को इस से बदलें
function showReactionMenu(e, messageId) {
    e.preventDefault();
    const existingMenu = document.querySelector('.reaction-menu');
    if (existingMenu) existingMenu.remove();

    const menu = document.createElement('div');
    menu.classList.add('reaction-menu');
    menu.innerHTML = `
        <div class="emoji-option" data-emoji="👍">👍</div>
        <div class="emoji-option" data-emoji="❤️">❤️</div>
        <div class="emoji-option" data-emoji="😂">😂</div>
        <div class="emoji-option" data-emoji="😮">😮</div>
        <div class="emoji-option" data-emoji="😢">😢</div>
        <div class="emoji-option" data-emoji="🙏">🙏</div>
    `;
    document.body.appendChild(menu);

    // मेन्यू की पोजीशन मैसेज के नीचे सेट करें
    const rect = e.target.getBoundingClientRect();
    menu.style.left = `${rect.left}px`;
    menu.style.top = `${rect.bottom + window.scrollY + 5}px`;
    menu.style.position = 'absolute';
    menu.style.zIndex = '1000';
    menu.style.display = 'flex';
    menu.style.backgroundColor = '#fff';
    menu.style.borderRadius = '20px';
    menu.style.padding = '5px';
    menu.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';

    // हर इमोजी ऑप्शन पर स्टाइल और क्लिक इवेंट
    document.querySelectorAll('.emoji-option').forEach(option => {
        option.style.padding = '5px 10px';
        option.style.cursor = 'pointer';
        option.style.fontSize = '24px';
        option.addEventListener('click', () => {
            const emoji = option.dataset.emoji;
            socket.emit('addReaction', { chatId: currentChatId, messageId, emoji, userId });
            menu.remove();
        });
    });

    // बाहर क्लिक करने पर मेन्यू हटाएं
    document.addEventListener('click', (event) => {
        if (!menu.contains(event.target)) {
            menu.remove();
        }
    }, { once: true });
}


// अटैचमेंट मेन्यू दिखाने का फंक्शन - यहाँ फिक्स किया गया है
function showAttachmentMenu(e) {
    e.preventDefault();
    e.stopPropagation();
    const existingMenu = document.querySelector('.attachment-menu');
    if (existingMenu) existingMenu.remove();

    const menu = document.createElement('div');
    menu.classList.add('attachment-menu');
    menu.innerHTML = `
        <div class="attachment-option" data-type="image">Photo/Video</div>
        <div class="attachment-option" data-type="file">File</div>
    `;
    document.body.appendChild(menu);

    const rect = e.target.getBoundingClientRect();
    menu.style.left = `${rect.left}px`;
    menu.style.top = `${rect.bottom + window.scrollY + 5}px`;
    menu.style.position = 'absolute';
    menu.style.zIndex = '1000';

    console.log('Attachment menu created, checking dark mode:', document.body.classList.contains('dark-theme'));

    document.querySelectorAll('.attachment-option').forEach(option => {
        option.addEventListener('click', (event) => {
            event.stopPropagation();
            const type = option.dataset.type;
            const fileInput = document.getElementById('fileInput');
            if (fileInput) {
                fileInput.accept = type === 'image' ? 'image/*,video/*' : '*/*';
                fileInput.click();
            } else {
                console.error('फाइल इनपुट नहीं मिला!');
            }
            menu.remove();
        });
    });

    document.addEventListener('click', (event) => {
        if (!menu.contains(event.target) && event.target !== fileButton) {
            menu.remove();
        }
    }, { once: true });
}
// ... (Previous code remains unchanged up to the end of initSocket function)

// showContextMenu फंक्शन में, मौजूदा मेन्यू में "कॉन्टैक्ट हटाएं" ऑप्शन जोड़ें
function showContextMenu(e, chat) {
    e.preventDefault();
    const existingMenu = document.querySelector('.context-menu');
    if (existingMenu) existingMenu.remove();

    const menu = document.createElement('div');
    menu.classList.add('context-menu');
    menu.innerHTML = `
        ${chat.isGroup && chat.creatorId === userId ? `
            <div class="context-option" data-action="editGroup">Edit Group</div>
            <div class="context-option" data-action="addMember">Add Member</div>
            <div class="context-option" data-action="removeMember">Remove Member</div>
        ` : ''}
        ${!chat.isGroup ? `<div class="context-option" data-action="removeContact">Remove Contact</div>` : ''}
        <div class="context-option" data-action="deleteChat">Delete Chat</div>
    `;
    document.body.appendChild(menu);

    const rect = e.target.getBoundingClientRect();
    menu.style.left = `${rect.left}px`;
    menu.style.top = `${rect.bottom + window.scrollY}px`;
    menu.style.position = 'absolute';
    menu.style.zIndex = '1000';

    document.querySelectorAll('.context-option').forEach(option => {
        option.addEventListener('click', (event) => {
            event.stopPropagation();
            const action = option.dataset.action;
            if (action === 'editGroup') {
                showEditGroupModal();
            } else if (action === 'addMember') {
                showAddGroupMemberModal();
            } else if (action === 'removeMember') {
                showRemoveGroupMemberModal();
            } else if (action === 'removeContact') {
                if (confirm('क्या आप इस कॉन्टैक्ट को हटाना चाहते हैं?')) {
                    const contactId = chat.participants.find(p => p !== userId);
                    fetch('https://chatzap.xyz/removeContact', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId, contactId })
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            alert('कॉन्टैक्ट सफलतापूर्वक हटाया गया');
                            currentChatId = null; // वर्तमान चैट रीसेट करें
                            selectedReceiver = null; // रिसीवर रीसेट करें
                            document.getElementById('messages').innerHTML = ''; // मैसेज डिव खाली करें
                            document.getElementById('chatName').textContent = ''; // चैट नाम खाली करें
                            document.getElementById('chatStatus').textContent = ''; // स्टेटस खाली करें
                            document.getElementById('chatBio').textContent = ''; // बायो खाली करें
                            document.querySelector('.chat-info img').src = '/placeholder.png'; // डिफॉल्ट DP
                            socket.emit('chatList'); // चैट लिस्ट रिफ्रेश करें
                        } else {
                            alert(data.message || 'कॉन्टैक्ट हटाने में त्रुटि');
                        }
                    })
                    .catch(error => {
                        console.error('कॉन्टैक्ट हटाने में त्रुटि:', error);
                        alert('सर्वर त्रुटि, कृपया पुनः प्रयास करें');
                    });
                }
            } else if (action === 'deleteChat') {
                if (confirm('क्या आप इस चैट को हटाना चाहते हैं?')) {
                    socket.emit('deleteChat', { chatId: chat.id, userId });
                }
            }
            menu.remove();
        });
    });

    document.addEventListener('click', (event) => {
        if (!menu.contains(event.target)) {
            menu.remove();
        }
    }, { once: true });
}
// चैट डिलीट होने पर अपडेट
socket.on('chatDeleted', ({ chatId }) => {
    if (chatId === currentChatId) {
        currentChatId = null;
        selectedReceiver = null;
        document.getElementById('messages').innerHTML = '';
        document.getElementById('chatName').textContent = '';
        document.getElementById('chatStatus').textContent = '';
        document.getElementById('chatBio').textContent = '';
        document.querySelector('.chat-info img').src = '/placeholder.png';
    }
    socket.emit('chatList'); // चैट लिस्ट रिफ्रेश करें
});

// प्रोफाइल अपडेट होने पर अपडेट
socket.on('profileUpdated', ({ userId: updatedUserId, profilePic, status, bio, username }) => {
    if (updatedUserId === userId) {
        userProfile.profilePic = profilePic;
        userProfile.status = status;
        userProfile.bio = bio;
        userProfile.username = username;
    }
    socket.emit('chatList'); // चैट लिस्ट अपडेट करें
    socket.emit('statusList'); // स्टेटस लिस्ट अपडेट करें
    if (currentChatId) {
        const chat = chats.find(c => c.id === currentChatId);
        if (chat && !chat.isGroup && chat.participants.includes(updatedUserId)) {
            loadChat(chat); // चैट हेडर अपडेट करें
        }
    }
});

// यूज़र स्टेटस अपडेट होने पर
socket.on('userStatus', ({ userId: statusUserId, status }) => {
    if (currentChatId) {
        const chat = chats.find(c => c.id === currentChatId);
        if (chat && !chat.isGroup && chat.participants.includes(statusUserId)) {
            document.getElementById('chatStatus').textContent = status;
        }
    }
    socket.emit('chatList'); // चैट लिस्ट में स्टेटस अपडेट करें
});

// client.js में initSocket के अंदर मौजूदा 'reactionAdded' को इस से बदलें
socket.on('reactionAdded', ({ chatId, messageId, userId: reactorId, emoji }) => {
    if (chatId === currentChatId) {
        const message = messagesDiv.querySelector(`[data-message-id="${messageId}"]`);
        if (message) {
            const reactionsDiv = message.querySelector('.reactions');
            const existingReaction = reactionsDiv.querySelector(`[data-reactor="${reactorId}"]`);
            if (existingReaction) {
                existingReaction.textContent = emoji;
            } else {
                const reactionSpan = document.createElement('span');
                reactionSpan.dataset.reactor = reactorId;
                reactionSpan.classList.add('reaction-emoji');
                reactionSpan.textContent = emoji;
                reactionSpan.style.fontSize = '16px';
                reactionSpan.style.padding = '2px 4px';
                reactionSpan.style.backgroundColor = '#e9ecef';
                reactionSpan.style.borderRadius = '10px';
                reactionSpan.style.margin = '2px';
                reactionsDiv.appendChild(reactionSpan);
            }
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
    }
});


// अंत में यह जोड़ें:
socket.on('messageStatus', ({ messageId, status }) => {
    const messageElement = messagesDiv.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
        const statusElement = messageElement.querySelector('.message-status');
        if (statusElement) {
            if (status === "sent") {
                statusElement.innerHTML = '<span class="tick single-tick">✓</span>';
            } else if (status === "delivered") {
                statusElement.innerHTML = '<span class="tick double-tick">✓✓</span>';
            } else if (status === "read") {
                statusElement.innerHTML = '<span class="tick double-tick blue-tick">✓✓</span>';
            }
        }
    }
});

// प्रोफाइल व्यू खोलने का फंक्शन
function openProfileView(userIdToView, isGroup) {
    fetch(`https://chatzap.xyz/getProfile?userId=${userIdToView}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
    })
    .then(response => {
        console.log('Response status:', response.status); // डिबगिंग
        return response.json();
    })
    .then(data => {
        console.log('Response data:', data); // डिबगिंग
        if (data.success) {
            const profile = data.profile;
            document.getElementById('profileViewUsername').textContent = profile.username || 'Unknown';
            document.getElementById('profileViewPic').src = profile.profilePic || '/placeholder.png';
            const profileViewModal = document.getElementById('profileViewModal');
            const chatList = document.getElementById('chatList');
            if (profileViewModal && chatList) {
                profileViewModal.style.display = 'flex';
                chatList.style.display = 'none'; // चैट लिस्ट छुपाएँ

                // बैक एरो इवेंट लिस्नर डायनामिकली जोड़ें
                const backArrow = document.getElementById('backArrow');
                if (backArrow) {
                    backArrow.addEventListener('click', () => {
                        console.log('Back arrow clicked');
                        profileViewModal.style.display = 'none';
                        chatList.style.display = 'block'; // चैट लिस्ट वापस दिखाएँ
                    }, { once: true }); // एक बार के लिए इवेंट
                } else {
                    console.error('backArrow element not found in profile view');
                }
            }
        } else {
            console.error('Profile fetch failed:', data.message);
        }
    })
    .catch(error => console.error('प्रोफाइल लोड करने में त्रुटि:', error));
}

// सॉकेट कनेक्शन शुरू करें
if (userId) {
    initSocketConnection();
}

document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
        const darkModeIcon = document.getElementById('darkModeToggle');
        if (darkModeIcon) {
            darkModeIcon.classList.remove('fa-moon');
            darkModeIcon.classList.add('fa-sun');
        }
    }

    const chatInput = document.getElementById('messageInput');
    if (chatInput) {
        chatInput.addEventListener('input', () => {
            if (currentChatId && socket) {
                socket.emit('typing', { chatId: currentChatId, userId });
            }
        });
    }

    socket.on('typing', ({ chatId, userId: typingUserId }) => {
        if (chatId === currentChatId && typingUserId !== userId) {
            const chatStatus = document.getElementById('chatStatus');
            if (chatStatus) {
                chatStatus.textContent = 'Typing...';
                setTimeout(() => {
                    const chat = chats.find(c => c.id === currentChatId);
                    if (chat && !chat.isGroup) {
                        fetch(`https://chatzap.xyz/getUsers?userId=${userId}`)
                            .then(response => response.json())
                            .then(users => {
                                const otherUser = users.find(u => u.userId === chat.participants.find(p => p !== userId));
                                chatStatus.textContent = otherUser ? otherUser.status : 'Offline';
                            });
                    }
                }, 2000);
            }
        }
    });

    // नया सर्च इनपुट कोड
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase().trim();
            const chatList = document.getElementById('chatList');
            if (!chatList) {
                console.error('चैट लिस्ट नहीं मिली');
                return;
            }
            const chatItems = Array.from(chatList.getElementsByClassName('chat-item'));
            chatItems.forEach(item => {
                const chatNameElement = item.querySelector('h4');
                if (chatNameElement) {
                    let chatName = chatNameElement.textContent.toLowerCase();
                    chatName = chatName.replace('(ग्रुप)', '').trim();
                    if (searchTerm === '' || chatName.includes(searchTerm)) {
                        item.style.display = 'flex';
                        if (chatName.startsWith(searchTerm)) {
                            chatList.prepend(item);
                        }
                    } else {
                        item.style.display = 'none';
                    }
                } else {
                    console.warn('चैट आइटम में <h4> नहीं मिला:', item);
                    item.style.display = 'none';
                }
            });
        });
    } else {
        console.error('सर्च इनपुट नहीं मिला');
    }
});

// ग्लोबल एरर हैंडलिंग
window.addEventListener('error', (event) => {
    console.error('ग्लोबल त्रुटि:', event.message, event.filename, event.lineno);
    alert('An error occurred. Please refresh the page or try again later.');
});

// ऑफलाइन हैंडलिंग
window.addEventListener('offline', () => {
    alert('You are offline. Please check your internet connection.');
    if (socket) socket.disconnect();
});

window.addEventListener('online', () => {
    alert('You are back online. Reconnecting...');
    setTimeout(() => {
        initSocketConnection();
    }, 3000); // 3 सेकंड की देरी
});
// सर्च इनपुट को हैंडल करें
// सर्च इनपुट को हैंडल करें
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase().trim();
            const chatList = document.getElementById('chatList');
            if (!chatList) {
                console.error('चैट लिस्ट नहीं मिली');
                return;
                
            }
            const backArrow = document.getElementById('backArrow');
if (backArrow) {
    backArrow.addEventListener('click', () => {
        console.log('Back arrow clicked');
        const profileViewModal = document.getElementById('profileViewModal');
        const chatList = document.getElementById('chatList');
        console.log('profileViewModal:', profileViewModal, 'chatList:', chatList);
        if (profileViewModal && chatList) {
            profileViewModal.style.display = 'none';
            chatList.style.display = 'block'; // चैट लिस्ट वापस दिखाएँ
        }
    });
} else {
    console.error('backArrow element not found');
}

            const chatItems = Array.from(chatList.getElementsByClassName('chat-item'));
            
            // चैट्स को सर्च टर्म के आधार पर फ़िल्टर और सॉर्ट करें
            chatItems.forEach(item => {
                const chatNameElement = item.querySelector('h4');
                if (chatNameElement) {
                    let chatName = chatNameElement.textContent.toLowerCase();
                    chatName = chatName.replace('(ग्रुप)', '').trim();
                    // अगर सर्च टर्म खाली है या चैट का नाम सर्च टर्म से शुरू होता है
                    if (searchTerm === '' || chatName.includes(searchTerm)) {
                        item.style.display = 'flex';
                        // अगर चैट का नाम सर्च टर्म से शुरू होता है, तो उसे ऊपर लाने के लिए प्राथमिकता दें
                        if (chatName.startsWith(searchTerm)) {
                            chatList.prepend(item); // चैट को लिस्ट में सबसे ऊपर ले जाएँ
                        }
                    } else {
                        item.style.display = 'none';
                    }
                } else {
                    console.warn('चैट आइटम में <h4> नहीं मिला:', item);
                    item.style.display = 'none';
                }
            });
        });
    } else {
        console.error('सर्च इनपुट नहीं मिला');
    }
});