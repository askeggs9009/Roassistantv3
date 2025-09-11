/* Chat Area Styles */
.chat-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
    width: 100%;
}

.messages-container {
    flex: 1;
    overflow-y: auto;
    padding: 2rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    width: 100%;
    min-height: 0;
}

/* Input Container - Centered */
.input-container {
    background: #0d1117;
    border-top: 1px solid #21262d;
    padding: 1.5rem;
    width: 100%;
    flex-shrink: 0;
    display: flex;
    justify-content: center; /* Center the input wrapper */
}

.input-wrapper {
    background: #21262d;
    border: 1px solid #30363d;
    border-radius: 12px;
    padding: 1rem;
    transition: border-color 0.2s ease;
    width: 100%;
    max-width: 800px; /* Limit max width to match messages */
}

.input-wrapper:focus-within {
    border-color: #58a6ff;
    box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.1);
}

.input-wrapper.drag-active {
    border-color: #58a6ff;
    background: rgba(88, 166, 255, 0.05);
}

.input-content {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: 100%;
}

.input-row {
    display: flex;
    align-items: flex-end;
    gap: 1rem;
    width: 100%;
}

.input-area {
    flex: 1;
    background: transparent;
    border: none;
    color: #f0f6fc;
    font-size: 1rem;
    font-family: inherit;
    resize: none;
    outline: none;
    min-height: 24px;
    max-height: 120px;
    line-height: 1.5;
}

.input-area::placeholder {
    color: #8b949e;
}

.attach-button {
    background: transparent;
    border: none;
    color: #8b949e;
    padding: 0.5rem;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.2rem;
    min-width: 36px;
    height: 36px;
    flex-shrink: 0;
}

.attach-button:hover {
    background: rgba(139, 148, 158, 0.2);
    color: #f0f6fc;
}

.send-button {
    background: linear-gradient(45deg, #58a6ff, #1f6feb);
    border: none;
    border-radius: 8px;
    color: white;
    padding: 0.5rem 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 36px;
    flex-shrink: 0;
}

.send-button:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(88, 166, 255, 0.4);
}

.send-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
}

/* Message Styles */
.message {
    display: flex;
    gap: 1rem;
    align-items: flex-start;
    max-width: 800px;
    margin: 0 auto;
    width: 100%;
}

.message.user {
    flex-direction: row-reverse;
}

.message-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 14px;
    flex-shrink: 0;
}

.user .message-avatar {
    background: linear-gradient(45deg, #58a6ff, #1f6feb);
    color: white;
}

.assistant .message-avatar {
    background: linear-gradient(45deg, #00d4ff, #9d4edd);
    color: white;
}

.message-content {
    flex: 1;
    min-width: 0;
}

.message-text {
    background: #161b22;
    border: 1px solid #21262d;
    border-radius: 12px;
    padding: 1rem;
    line-height: 1.6;
    word-wrap: break-word;
}

.user .message-text {
    background: #0969da;
    border-color: #1f6feb;
    color: white;
}

/* File Attachments */
.file-attachments {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid #30363d;
}

.file-attachment {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 0.5rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    max-width: 200px;
}

.file-attachment:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: #58a6ff;
}

.file-icon {
    font-size: 1rem;
    flex-shrink: 0;
}

.file-info {
    flex: 1;
    min-width: 0;
}

.file-name {
    color: #f0f6fc;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.file-size {
    color: #8b949e;
    font-size: 0.75rem;
}

.file-remove {
    background: none;
    border: none;
    color: #8b949e;
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 4px;
    font-size: 0.8rem;
    transition: all 0.2s ease;
    flex-shrink: 0;
}

.file-remove:hover {
    background: rgba(248, 81, 73, 0.2);
    color: #f85149;
}

.file-attachment.image {
    background: rgba(0, 212, 255, 0.1);
    border-color: rgba(0, 212, 255, 0.3);
}

.file-attachment.code {
    background: rgba(157, 78, 221, 0.1);
    border-color: rgba(157, 78, 221, 0.3);
}

.file-preview {
    width: 40px;
    height: 40px;
    border-radius: 4px;
    object-fit: cover;
    flex-shrink: 0;
}

/* Drag & Drop Overlay */
.drag-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(13, 17, 23, 0.95);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    border-radius: 12px;
    border: 2px dashed #58a6ff;
    margin: 1.5rem;
}

.drag-content {
    text-align: center;
    pointer-events: none;
}

.drag-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
    opacity: 0.8;
}

.drag-text {
    font-size: 1.2rem;
    font-weight: 600;
    color: #58a6ff;
    margin-bottom: 0.5rem;
}

.drag-subtext {
    color: #8b949e;
    font-size: 0.9rem;
}

/* Responsive Design */
@media (min-width: 1200px) {
    .input-wrapper {
        max-width: 900px; /* Slightly larger on big screens */
    }
    
    .message {
        max-width: 900px;
    }
}

@media (min-width: 1600px) {
    .input-wrapper {
        max-width: 1000px;
    }
    
    .message {
        max-width: 1000px;
    }
}

/* Mobile responsiveness - keep full width on small screens */
@media (max-width: 768px) {
    .input-container {
        justify-content: stretch; /* Full width on mobile */
        padding: 1rem;
    }
    
    .input-wrapper {
        max-width: none; /* Remove max-width constraint on mobile */
    }
    
    .messages-container {
        padding: 1rem;
    }
}