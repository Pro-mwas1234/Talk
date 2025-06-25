// Initialize Firebase
const firebaseConfig = {
    apiKey: "AIzaSyCSmCGBQ6fzzcdZAp82PvWlelJteYvoXu8",
    authDomain: "trending-4b135.firebaseapp.com",
    databaseURL: "https://trending-4b135-default-rtdb.firebaseio.com",
    projectId: "trending-4b135",
    storageBucket: "trending-4b135.firebasestorage.app",
    messagingSenderId: "807429550803",
    appId: "1:807429550803:web:b076204a85d3f066035a26",
    measurementId: "G-60HP09HPSM"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// DOM elements
const elements = {
    messagesContainer: document.getElementById('messagesContainer'),
    messageInput: document.getElementById('messageInput'),
    sendButton: document.getElementById('sendButton'),
    attachButton: document.getElementById('attachButton'),
    fileInput: document.getElementById('fileInput'),
    typingIndicator: document.getElementById('typingIndicator'),
    nameModal: document.getElementById('nameModal'),
    userNameInput: document.getElementById('userNameInput'),
    submitNameBtn: document.getElementById('submitNameBtn')
};

// App state
let currentUser = {
    id: 'user-' + Math.random().toString(36).substr(2, 9),
    name: null
};
let isTyping = false;
let lastTypingTime = 0;
let expiryTimer = null;
const MESSAGE_EXPIRY_MINUTES = 30;

// Firebase references
const messagesRef = database.ref('messages');
const typingRef = database.ref('typing');
const usersRef = database.ref('users');

// Initialize app
function init() {
    showNameModal();
    setupEventListeners();
}

// Show name modal
function showNameModal() {
    elements.nameModal.style.display = 'flex';
    elements.userNameInput.focus();
}

// Hide name modal
function hideNameModal() {
    elements.nameModal.style.display = 'none';
}

// Setup event listeners
function setupEventListeners() {
    // Name submission
    elements.submitNameBtn.addEventListener('click', handleNameSubmit);
    elements.userNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleNameSubmit();
    });

    // Message sending
    elements.sendButton.addEventListener('click', sendMessage);
    elements.messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !elements.sendButton.disabled) {
            sendMessage();
        }
    });

    // Typing indicator
    elements.messageInput.addEventListener('input', () => {
        elements.sendButton.disabled = elements.messageInput.value.trim() === '';
        updateTyping(elements.messageInput.value.trim() !== '');
    });

    // File attachment
    elements.attachButton.addEventListener('click', () => elements.fileInput.click());
    elements.fileInput.addEventListener('change', handleFileUpload);
}

// Handle name submission
function handleNameSubmit() {
    const userName = elements.userNameInput.value.trim();
    if (userName) {
        currentUser.name = userName;
        localStorage.setItem('chatUserName', userName);
        hideNameModal();
        
        // Add user to online list
        usersRef.child(currentUser.id).set({
            name: userName,
            joinedAt: firebase.database.ServerValue.TIMESTAMP
        });
        
        // Send join notification
        sendSystemMessage(`${userName} joined the chat`);
        loadMessages();
    }
}

// Send message with expiry timestamp
function sendMessage() {
    const messageText = elements.messageInput.value.trim();
    if (messageText) {
        const timestamp = Date.now();
        const newMessageRef = messagesRef.push();
        newMessageRef.set({
            text: messageText,
            senderId: currentUser.id,
            senderName: currentUser.name,
            timestamp: timestamp,
            expiry: timestamp + (MESSAGE_EXPIRY_MINUTES * 60 * 1000),
            type: 'text'
        }).then(() => {
            elements.messageInput.value = '';
            elements.sendButton.disabled = true;
            updateTyping(false);
        });
    }
}

// Handle file upload with expiry
function handleFileUpload(e) {
    const file = e.target.files[0];
    if (file && file.type.match('image.*')) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const imageUrl = event.target.result;
            const timestamp = Date.now();
            const newMessageRef = messagesRef.push();
            newMessageRef.set({
                imageUrl: imageUrl,
                senderId: currentUser.id,
                senderName: currentUser.name,
                timestamp: timestamp,
                expiry: timestamp + (MESSAGE_EXPIRY_MINUTES * 60 * 1000),
                type: 'image'
            });
        };
        reader.readAsDataURL(file);
    }
    e.target.value = '';
}

// Update typing status
function updateTyping(typing) {
    if (typing !== isTyping) {
        isTyping = typing;
        typingRef.child(currentUser.id).set(isTyping ? currentUser.name : null);
    }
    lastTypingTime = Date.now();
}

// Load messages with expiry check
function loadMessages() {
    // Clear any existing expiry timer
    clearTimeout(expiryTimer);
    
    messagesRef.on('child_added', (snapshot) => {
        const message = snapshot.val();
        const isExpired = isMessageExpired(message);
        displayMessage(message, snapshot.key, isExpired);
        
        // Set expiry timer if not already set
        if (!expiryTimer && !isExpired) {
            setExpiryTimer(message.timestamp);
        }
        
        scrollToBottom();
    });

    // Listen for typing indicators
    typingRef.on('value', (snapshot) => {
        const typingData = snapshot.val() || {};
        const typingUsers = Object.values(typingData).filter(name => name !== currentUser.name);
        
        if (typingUsers.length > 0) {
            elements.typingIndicator.textContent = `${typingUsers.join(', ')} ${typingUsers.length > 1 ? 'are' : 'is'} typing...`;
        } else {
            elements.typingIndicator.textContent = '';
        }
    });

    // Listen for user joins/leaves
    usersRef.on('child_added', (snapshot) => {
        if (snapshot.key !== currentUser.id) {
            const user = snapshot.val();
            sendSystemMessage(`${user.name} joined the chat`);
        }
    });

    usersRef.on('child_removed', (snapshot) => {
        const user = snapshot.val();
        sendSystemMessage(`${user.name} left the chat`);
    });
}

// Check if message is expired
function isMessageExpired(message) {
    if (!message.timestamp) return false;
    const messageAge = (Date.now() - message.timestamp) / (1000 * 60);
    return messageAge > MESSAGE_EXPIRY_MINUTES;
}

// Set timer for message expiration
function setExpiryTimer(oldestMessageTime) {
    const timeElapsed = (Date.now() - oldestMessageTime) / (1000 * 60);
    const timeRemaining = (MESSAGE_EXPIRY_MINUTES - timeElapsed) * 60 * 1000;
    
    if (timeRemaining > 0) {
        expiryTimer = setTimeout(() => {
            cleanExpiredMessages();
        }, timeRemaining);
    }
}

// Clean up expired messages
function cleanExpiredMessages() {
    messagesRef.once('value', (snapshot) => {
        const messages = snapshot.val() || {};
        const now = Date.now();
        
        Object.keys(messages).forEach((key) => {
            const message = messages[key];
            if (message.timestamp && (now - message.timestamp) > (MESSAGE_EXPIRY_MINUTES * 60 * 1000)) {
                messagesRef.child(key).remove();
            }
        });
        
        // Show expiry notice
        sendSystemMessage('Old messages have been cleared');
        
        // Reset timer for next expiry
        expiryTimer = null;
    });
}

// Display message with expiry state
function displayMessage(message, messageId, isExpired = false) {
    const messageElement = document.createElement('div');
    let messageContent = '';
    
    const date = new Date(message.timestamp);
    const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    if (message.type === 'system') {
        messageElement.className = 'message system';
        messageContent = message.text;
    } else {
        const isCurrentUser = message.senderId === currentUser.id;
        messageElement.className = `message ${isCurrentUser ? 'sent' : 'received'} ${isExpired ? 'message-expired' : ''}`;
        
        if (message.type === 'image') {
            messageContent = `
                <img src="${message.imageUrl}" class="message-image" alt="Sent image">
                <span class="timestamp">${timeString}</span>
            `;
        } else {
            messageContent = `
                <div class="message-text">${escapeHtml(message.text)}</div>
                <span class="timestamp">${timeString} • ${message.senderName}</span>
            `;
        }
        
        if (isCurrentUser && !isExpired) {
            messageContent += `
                <div class="message-actions">
                    <button class="delete-btn" data-message-id="${messageId}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
        }
    }
    
    messageElement.innerHTML = messageContent;
    elements.messagesContainer.appendChild(messageElement);
    
    // Add delete event listener if not expired
    if (!isExpired) {
        const deleteBtn = messageElement.querySelector('.delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => deleteMessage(deleteBtn.dataset.messageId));
        }
    }
}

// Send system message
function sendSystemMessage(text) {
    messagesRef.push().set({
        text: text,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        type: 'system'
    });
}

// Delete message
function deleteMessage(messageId) {
    if (confirm('Are you sure you want to delete this message?')) {
        messagesRef.child(messageId).remove();
    }
}

// Scroll to bottom
function scrollToBottom() {
    setTimeout(() => {
        elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
    }, 100);
}

// Escape HTML to prevent XSS
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Handle beforeunload
window.addEventListener('beforeunload', () => {
    usersRef.child(currentUser.id).remove();
    sendSystemMessage(`${currentUser.name} left the chat`);
});

// Initialize the app
document.addEventListener('DOMContentLoaded', init);