/**
 * Micro-Interactions - Vanilla JS
 * Enhanced UI interactions for the AI assistant
 */

class MicroInteractions {
    constructor() {
        this.init();
    }

    init() {
        this.addButtonRippleEffect();
        this.addHoverGlowEffect();
        this.addScrollRevealAnimations();
        this.addTypingIndicator();
        this.addMessageSlideIn();
        this.addSmoothScrolling();
    }

    /**
     * Add ripple effect to buttons on click
     */
    addButtonRippleEffect() {
        const style = document.createElement('style');
        style.textContent = `
            .ripple-container {
                position: relative;
                overflow: hidden;
            }

            .ripple {
                position: absolute;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.3);
                transform: scale(0);
                animation: ripple-animation 0.6s ease-out;
                pointer-events: none;
            }

            @keyframes ripple-animation {
                to {
                    transform: scale(4);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);

        document.addEventListener('click', (e) => {
            const button = e.target.closest('button, .btn, .send-button');
            if (!button) return;

            // Make button a ripple container
            if (!button.classList.contains('ripple-container')) {
                button.classList.add('ripple-container');
            }

            const ripple = document.createElement('span');
            ripple.classList.add('ripple');

            const rect = button.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            const x = e.clientX - rect.left - size / 2;
            const y = e.clientY - rect.top - size / 2;

            ripple.style.width = ripple.style.height = `${size}px`;
            ripple.style.left = `${x}px`;
            ripple.style.top = `${y}px`;

            button.appendChild(ripple);

            setTimeout(() => ripple.remove(), 600);
        });
    }

    /**
     * Add glow effect on hover for interactive elements
     */
    addHoverGlowEffect() {
        const style = document.createElement('style');
        style.textContent = `
            .hover-glow {
                position: relative;
                transition: all 0.3s ease;
            }

            .hover-glow::before {
                content: '';
                position: absolute;
                top: -2px;
                left: -2px;
                right: -2px;
                bottom: -2px;
                background: linear-gradient(45deg, #58a6ff, #7c3aed, #58a6ff);
                border-radius: inherit;
                opacity: 0;
                z-index: -1;
                filter: blur(10px);
                transition: opacity 0.3s ease;
                animation: glow-rotate 3s linear infinite;
            }

            .hover-glow:hover::before {
                opacity: 0.7;
            }

            @keyframes glow-rotate {
                0% { filter: blur(10px) hue-rotate(0deg); }
                100% { filter: blur(10px) hue-rotate(360deg); }
            }
        `;
        document.head.appendChild(style);

        // Add to buttons and interactive elements
        const elements = document.querySelectorAll('button:not(.no-glow), .btn:not(.no-glow), .send-button');
        elements.forEach(el => {
            if (!el.classList.contains('hover-glow')) {
                el.classList.add('hover-glow');
            }
        });
    }

    /**
     * Add scroll-reveal animations
     */
    addScrollRevealAnimations() {
        const style = document.createElement('style');
        style.textContent = `
            .reveal-element {
                opacity: 0;
                transform: translateY(30px);
                transition: all 0.6s ease;
            }

            .reveal-element.revealed {
                opacity: 1;
                transform: translateY(0);
            }
        `;
        document.head.appendChild(style);

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('revealed');
                }
            });
        }, {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        });

        // Observe elements with reveal class
        const elements = document.querySelectorAll('.reveal-element');
        elements.forEach(el => observer.observe(el));

        // Save observer to window for future use
        window.revealObserver = observer;
    }

    /**
     * Enhanced typing indicator for AI responses
     */
    addTypingIndicator() {
        const style = document.createElement('style');
        style.textContent = `
            .typing-indicator {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                padding: 0.5rem 0.75rem;
                background: rgba(88, 166, 255, 0.1);
                border-radius: 12px;
                margin: 0.5rem 0;
            }

            .typing-indicator .dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #58a6ff;
                animation: typing-bounce 1.4s infinite ease-in-out;
            }

            .typing-indicator .dot:nth-child(1) {
                animation-delay: 0s;
            }

            .typing-indicator .dot:nth-child(2) {
                animation-delay: 0.2s;
            }

            .typing-indicator .dot:nth-child(3) {
                animation-delay: 0.4s;
            }

            @keyframes typing-bounce {
                0%, 60%, 100% {
                    transform: translateY(0);
                    opacity: 0.7;
                }
                30% {
                    transform: translateY(-10px);
                    opacity: 1;
                }
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Add slide-in animation for new messages
     */
    addMessageSlideIn() {
        const style = document.createElement('style');
        style.textContent = `
            @keyframes message-slide-in {
                from {
                    opacity: 0;
                    transform: translateX(-20px);
                }
                to {
                    opacity: 1;
                    transform: translateX(0);
                }
            }

            @keyframes message-slide-in-right {
                from {
                    opacity: 0;
                    transform: translateX(20px);
                }
                to {
                    opacity: 1;
                    transform: translateX(0);
                }
            }

            .message-enter {
                animation: message-slide-in 0.4s ease-out;
            }

            .message-enter.user-message {
                animation: message-slide-in-right 0.4s ease-out;
            }

            .message-fade-in {
                animation: fadeIn 0.3s ease-in;
            }

            @keyframes fadeIn {
                from {
                    opacity: 0;
                }
                to {
                    opacity: 1;
                }
            }
        `;
        document.head.appendChild(style);

        // Observer for new messages
        const chatObserver = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1 && node.classList.contains('message')) {
                        node.classList.add('message-enter');
                    }
                });
            });
        });

        // Start observing chat container when it exists
        const startObservingChat = () => {
            const chatContainer = document.querySelector('.chat-messages') ||
                                 document.querySelector('.messages-container') ||
                                 document.querySelector('[class*="message"]')?.parentElement;

            if (chatContainer) {
                chatObserver.observe(chatContainer, {
                    childList: true,
                    subtree: true
                });
            }
        };

        // Try to start observing immediately, or wait for DOM ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', startObservingChat);
        } else {
            startObservingChat();
        }

        window.chatMessageObserver = chatObserver;
    }

    /**
     * Add smooth scrolling for anchor links
     */
    addSmoothScrolling() {
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function(e) {
                const href = this.getAttribute('href');
                if (href === '#') return;

                const target = document.querySelector(href);
                if (target) {
                    e.preventDefault();
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            });
        });
    }

    /**
     * Create a typing indicator element
     */
    static createTypingIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'typing-indicator';
        indicator.innerHTML = `
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
        `;
        return indicator;
    }
}

// Auto-initialize
window.microInteractions = new MicroInteractions();

// Export helper function
window.createTypingIndicator = MicroInteractions.createTypingIndicator;
