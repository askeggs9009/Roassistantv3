/**
 * Animations Initializer
 * Main controller for all ReactBits-inspired animations
 * Provides a unified API for managing animations
 */

class AnimationsController {
    constructor() {
        this.config = {
            particles: true,
            clickSpark: true,
            cursorTrail: true,
            blurText: true,
            microInteractions: true
        };

        this.instances = {
            particles: null,
            clickSpark: null,
            cursorTrail: null,
            blurText: null,
            microInteractions: null
        };

        this.ready = false;
        this.initCallbacks = [];
    }

    /**
     * Initialize all animations
     */
    init(customConfig = {}) {
        // Merge custom config
        this.config = { ...this.config, ...customConfig };

        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this._initAnimations());
        } else {
            this._initAnimations();
        }
    }

    _initAnimations() {
        console.log('🎨 Initializing ReactBits-inspired animations...');

        // All animations are auto-initialized by their respective files
        // Store references to the global instances
        if (this.config.particles && window.particlesBackground) {
            this.instances.particles = window.particlesBackground;
            console.log('✅ Particles background loaded');
        }

        if (this.config.clickSpark && window.clickSpark) {
            this.instances.clickSpark = window.clickSpark;
            console.log('✅ Click spark effect loaded');
        }

        if (this.config.cursorTrail && window.cursorTrail) {
            this.instances.cursorTrail = window.cursorTrail;
            console.log('✅ Cursor trail loaded');
        }

        if (this.config.blurText && window.blurTextAnimator) {
            this.instances.blurText = window.blurTextAnimator;
            console.log('✅ Blur text animator loaded');
        }

        if (this.config.microInteractions && window.microInteractions) {
            this.instances.microInteractions = window.microInteractions;
            console.log('✅ Micro-interactions loaded');
        }

        this.ready = true;
        console.log('🚀 All animations initialized!');

        // Run initialization callbacks
        this.initCallbacks.forEach(callback => callback());
        this.initCallbacks = [];

        // Integrate with chat system if available
        this._integrateChatAnimations();
    }

    /**
     * Integrate animations with the chat system
     */
    _integrateChatAnimations() {
        // Hook into message rendering
        const originalAddMessage = window.addMessage;
        if (originalAddMessage) {
            window.addMessage = (...args) => {
                const result = originalAddMessage.apply(this, args);

                // Animate new AI messages with blur text
                setTimeout(() => {
                    const lastMessage = document.querySelector('.message:last-child');
                    if (lastMessage && lastMessage.classList.contains('assistant-message')) {
                        const content = lastMessage.querySelector('.message-content');
                        if (content && this.instances.blurText) {
                            this.instances.blurText.animate(content, {
                                delay: 15,
                                duration: 0.35,
                                animateBy: 'words',
                                direction: 'bottom',
                                once: true
                            });
                        }
                    }
                }, 100);

                return result;
            };
        }
    }

    /**
     * Run callback when animations are ready
     */
    onReady(callback) {
        if (this.ready) {
            callback();
        } else {
            this.initCallbacks.push(callback);
        }
    }

    /**
     * Toggle specific animation
     */
    toggle(animationName, enabled) {
        if (this.instances[animationName]) {
            if (enabled) {
                this.config[animationName] = true;
                // Re-initialize if needed
            } else {
                this.config[animationName] = false;
                if (this.instances[animationName].destroy) {
                    this.instances[animationName].destroy();
                }
            }
        }
    }

    /**
     * Update animation config
     */
    updateConfig(animationName, newConfig) {
        if (this.instances[animationName] && this.instances[animationName].updateConfig) {
            this.instances[animationName].updateConfig(newConfig);
        }
    }

    /**
     * Get animation instance
     */
    get(animationName) {
        return this.instances[animationName];
    }

    /**
     * Destroy all animations
     */
    destroyAll() {
        Object.entries(this.instances).forEach(([name, instance]) => {
            if (instance && instance.destroy) {
                instance.destroy();
                console.log(`❌ Destroyed ${name}`);
            }
        });
        this.ready = false;
    }
}

// Create and export global instance
window.animationsController = new AnimationsController();

// Auto-initialize with default config
window.animationsController.init();

// Helper functions for common animations
window.animateText = function(element, options = {}) {
    if (window.blurTextAnimator) {
        window.blurTextAnimator.animate(element, options);
    }
};

window.showTypingIndicator = function() {
    if (window.createTypingIndicator) {
        return window.createTypingIndicator();
    }
};

// Export for ES modules if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AnimationsController };
}

console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🎨 ReactBits-Inspired Animations Loaded                 ║
║                                                           ║
║   ✨ Particles Background                                 ║
║   ⚡ Click Spark Effect                                   ║
║   🌊 Cursor Trail                                         ║
║   📝 Blur Text Animation                                  ║
║   🎯 Micro-Interactions                                   ║
║                                                           ║
║   Ready to enhance your AI assistant! 🚀                 ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`);
