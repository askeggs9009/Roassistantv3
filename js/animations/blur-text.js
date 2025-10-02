/**
 * BlurText Animation - Vanilla JS
 * Inspired by ReactBits BlurText component
 * Creates smooth blur-in effect for text
 */

class BlurTextAnimator {
    constructor() {
        this.observers = new Map();
    }

    /**
     * Animate text element with blur-in effect
     * @param {HTMLElement} element - The text element to animate
     * @param {Object} options - Animation options
     */
    animate(element, options = {}) {
        const config = {
            delay: options.delay || 30,
            duration: options.duration || 0.6,
            animateBy: options.animateBy || 'words', // 'words' or 'letters'
            direction: options.direction || 'bottom', // 'top' or 'bottom'
            threshold: options.threshold || 0.1,
            once: options.once !== false
        };

        // Get text content
        const text = element.textContent;
        element.textContent = '';

        // Split by words or letters
        const segments = config.animateBy === 'words'
            ? text.split(' ')
            : text.split('');

        // Create spans for each segment
        const spans = segments.map((segment, index) => {
            const span = document.createElement('span');
            span.textContent = segment;
            span.style.cssText = `
                display: inline-block;
                opacity: 0;
                filter: blur(10px);
                transform: translateY(${config.direction === 'top' ? '-20px' : '20px'});
                transition: all ${config.duration}s cubic-bezier(0.4, 0.0, 0.2, 1);
                transition-delay: ${(index * config.delay) / 1000}s;
            `;

            if (config.animateBy === 'words' && index < segments.length - 1) {
                span.textContent += ' ';
            }

            element.appendChild(span);
            return span;
        });

        // Intersection Observer to trigger animation when element is in view
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    spans.forEach((span, index) => {
                        // Stagger the animation
                        setTimeout(() => {
                            span.style.opacity = '1';
                            span.style.filter = 'blur(0px)';
                            span.style.transform = 'translateY(0)';
                        }, index * config.delay);
                    });

                    if (config.once) {
                        observer.unobserve(element);
                    }
                }
            });
        }, {
            threshold: config.threshold
        });

        observer.observe(element);
        this.observers.set(element, observer);
    }

    /**
     * Animate multiple elements with blur-in effect
     * @param {string} selector - CSS selector for elements
     * @param {Object} options - Animation options
     */
    animateAll(selector, options = {}) {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => this.animate(el, options));
    }

    /**
     * Stop observing an element
     * @param {HTMLElement} element - The element to stop observing
     */
    destroy(element) {
        const observer = this.observers.get(element);
        if (observer) {
            observer.disconnect();
            this.observers.delete(element);
        }
    }

    /**
     * Stop all observers
     */
    destroyAll() {
        this.observers.forEach(observer => observer.disconnect());
        this.observers.clear();
    }
}

// Create global instance
window.blurTextAnimator = new BlurTextAnimator();

/**
 * Helper function to add blur-in animation to AI messages
 * This integrates with the chat interface
 */
function animateAIMessage(messageElement) {
    // Find the message content
    const content = messageElement.querySelector('.message-content') || messageElement;

    // Apply blur-in animation
    window.blurTextAnimator.animate(content, {
        delay: 20,
        duration: 0.4,
        animateBy: 'words',
        direction: 'bottom',
        once: true
    });
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BlurTextAnimator, animateAIMessage };
}
