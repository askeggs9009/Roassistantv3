/**
 * Micro-interactions for enhanced user experience
 * Adds smooth animations and feedback for user actions
 */

class MicroInteractions {
    constructor() {
        this.isEnabled = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.init();
    }

    init() {
        if (!this.isEnabled) return;

        this.initScrollAnimations();
        this.initHoverEffects();
        this.initClickEffects();
        this.initIntersectionObserver();
        this.initParticleEffects();
        this.initMagneticEffects();
        this.initSmoothScrolling();
    }

    // Initialize scroll-based animations
    initScrollAnimations() {
        const animatedElements = document.querySelectorAll('.animate-on-scroll');

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    entry.target.style.animationDelay = Math.random() * 0.5 + 's';
                }
            });
        }, {
            threshold: 0.1,
            rootMargin: '50px'
        });

        animatedElements.forEach(element => {
            observer.observe(element);
        });
    }

    // Initialize hover effects for cards and buttons
    initHoverEffects() {
        // Add hover effects to quick actions
        const quickActions = document.querySelectorAll('.quick-action');
        quickActions.forEach(action => {
            action.addEventListener('mouseenter', this.addRippleEffect.bind(this));
            action.addEventListener('mousemove', this.addParallaxHover.bind(this));
            action.addEventListener('mouseleave', this.resetParallax.bind(this));
        });

        // Add hover effects to navigation items
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('mouseenter', (e) => {
                this.addGlowEffect(e.target);
            });
            item.addEventListener('mouseleave', (e) => {
                this.removeGlowEffect(e.target);
            });
        });

        // Add hover effects to buttons
        const buttons = document.querySelectorAll('button, .btn');
        buttons.forEach(button => {
            button.addEventListener('mouseenter', this.addButtonHover.bind(this));
            button.addEventListener('mouseleave', this.removeButtonHover.bind(this));
        });
    }

    // Initialize click effects
    initClickEffects() {
        document.addEventListener('click', (e) => {
            if (e.target.matches('button, .btn, .quick-action, .nav-item')) {
                this.createRipple(e);
            }
        });
    }

    // Initialize intersection observer for staggered animations
    initIntersectionObserver() {
        const staggerElements = document.querySelectorAll('.stagger-animation');

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('animate');
                }
            });
        });

        staggerElements.forEach(element => {
            observer.observe(element);
        });
    }

    // Add parallax hover effect
    addParallaxHover(e) {
        const card = e.currentTarget;
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const rotateX = (y - centerY) / 10;
        const rotateY = (centerX - x) / 10;

        card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.02)`;
    }

    // Reset parallax effect
    resetParallax(e) {
        const card = e.currentTarget;
        card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale(1)';
    }

    // Add ripple effect on hover
    addRippleEffect(e) {
        const element = e.currentTarget;
        const ripple = document.createElement('div');
        ripple.className = 'hover-ripple';
        ripple.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            width: 0;
            height: 0;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(88, 166, 255, 0.2), transparent);
            transform: translate(-50%, -50%);
            animation: rippleExpand 0.8s ease-out;
            pointer-events: none;
            z-index: 0;
        `;

        if (element.style.position !== 'absolute' && element.style.position !== 'relative') {
            element.style.position = 'relative';
        }

        element.appendChild(ripple);

        setTimeout(() => {
            if (ripple.parentNode) {
                ripple.parentNode.removeChild(ripple);
            }
        }, 800);
    }

    // Create click ripple effect
    createRipple(e) {
        const button = e.currentTarget;
        const rect = button.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = e.clientX - rect.left - size / 2;
        const y = e.clientY - rect.top - size / 2;

        const ripple = document.createElement('div');
        ripple.style.cssText = `
            position: absolute;
            left: ${x}px;
            top: ${y}px;
            width: ${size}px;
            height: ${size}px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.3);
            transform: scale(0);
            animation: ripple 0.6s linear;
            pointer-events: none;
            z-index: 1000;
        `;

        if (button.style.position !== 'absolute' && button.style.position !== 'relative') {
            button.style.position = 'relative';
        }
        button.style.overflow = 'hidden';

        button.appendChild(ripple);

        setTimeout(() => {
            if (ripple.parentNode) {
                ripple.parentNode.removeChild(ripple);
            }
        }, 600);
    }

    // Add glow effect to elements
    addGlowEffect(element) {
        element.style.transition = 'all 0.3s ease';
        element.style.boxShadow = '0 0 20px rgba(88, 166, 255, 0.3)';
    }

    // Remove glow effect
    removeGlowEffect(element) {
        element.style.boxShadow = '';
    }

    // Add button hover effect
    addButtonHover(e) {
        const button = e.currentTarget;
        button.style.transform = 'translateY(-2px) scale(1.02)';
    }

    // Remove button hover effect
    removeButtonHover(e) {
        const button = e.currentTarget;
        button.style.transform = '';
    }

    // Initialize particle effects for hero section
    initParticleEffects() {
        const welcomeScreen = document.querySelector('.welcome-screen');
        if (!welcomeScreen) return;

        // Create floating particles
        for (let i = 0; i < 10; i++) {
            setTimeout(() => {
                this.createFloatingParticle(welcomeScreen);
            }, i * 1000);
        }

        // Recreate particles every 20 seconds
        setInterval(() => {
            this.createFloatingParticle(welcomeScreen);
        }, 2000);
    }

    // Create a floating particle
    createFloatingParticle(container) {
        const particle = document.createElement('div');
        particle.className = 'particle';

        const size = Math.random() * 6 + 2;
        const left = Math.random() * 100;
        const animationDuration = Math.random() * 10 + 10;
        const opacity = Math.random() * 0.5 + 0.2;

        particle.style.cssText = `
            position: absolute;
            left: ${left}%;
            bottom: -10px;
            width: ${size}px;
            height: ${size}px;
            background: ${Math.random() > 0.5 ?
                'radial-gradient(circle, rgba(88, 166, 255, ' + opacity + '), transparent)' :
                'radial-gradient(circle, rgba(157, 78, 221, ' + opacity + '), transparent)'};
            border-radius: 50%;
            animation: float ${animationDuration}s linear infinite;
            pointer-events: none;
            z-index: 1;
        `;

        container.appendChild(particle);

        setTimeout(() => {
            if (particle.parentNode) {
                particle.parentNode.removeChild(particle);
            }
        }, animationDuration * 1000);
    }

    // Initialize magnetic effects for special elements
    initMagneticEffects() {
        const magneticElements = document.querySelectorAll('.sidebar-icon, .welcome-icon');

        magneticElements.forEach(element => {
            element.addEventListener('mousemove', (e) => {
                const rect = element.getBoundingClientRect();
                const x = e.clientX - rect.left - rect.width / 2;
                const y = e.clientY - rect.top - rect.height / 2;

                const distance = Math.sqrt(x * x + y * y);
                const maxDistance = 50;

                if (distance < maxDistance) {
                    const force = (maxDistance - distance) / maxDistance;
                    const translateX = x * force * 0.2;
                    const translateY = y * force * 0.2;

                    element.style.transform = `translate(${translateX}px, ${translateY}px) scale(1.05)`;
                }
            });

            element.addEventListener('mouseleave', () => {
                element.style.transform = '';
            });
        });
    }

    // Initialize smooth scrolling for the messages container
    initSmoothScrolling() {
        const messagesContainer = document.getElementById('messagesContainer');
        if (!messagesContainer) return;

        // Add momentum scrolling
        messagesContainer.style.scrollBehavior = 'smooth';

        // Smooth scroll to bottom when new messages arrive
        const observer = new MutationObserver(() => {
            messagesContainer.scrollTo({
                top: messagesContainer.scrollHeight,
                behavior: 'smooth'
            });
        });

        observer.observe(messagesContainer, {
            childList: true,
            subtree: true
        });
    }

    // Add loading skeleton animation
    static createLoadingSkeleton(container) {
        const skeleton = document.createElement('div');
        skeleton.className = 'skeleton-loader';
        skeleton.style.cssText = `
            width: 100%;
            height: 20px;
            border-radius: 4px;
            margin: 8px 0;
        `;
        container.appendChild(skeleton);
        return skeleton;
    }

    // Remove loading skeleton
    static removeLoadingSkeleton(skeleton) {
        if (skeleton && skeleton.parentNode) {
            skeleton.style.opacity = '0';
            setTimeout(() => {
                if (skeleton.parentNode) {
                    skeleton.parentNode.removeChild(skeleton);
                }
            }, 300);
        }
    }

    // Add typing indicator animation
    static createTypingIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'typing-indicator';
        indicator.innerHTML = `
            <div class="typing-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
        `;

        indicator.style.cssText = `
            display: flex;
            align-items: center;
            padding: 1rem;
            animation: fadeIn 0.3s ease;
        `;

        const style = document.createElement('style');
        style.textContent = `
            .typing-dots {
                display: flex;
                gap: 4px;
            }
            .typing-dots span {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #58a6ff;
                animation: typingBounce 1.4s infinite ease-in-out;
            }
            .typing-dots span:nth-child(1) { animation-delay: -0.32s; }
            .typing-dots span:nth-child(2) { animation-delay: -0.16s; }
            @keyframes typingBounce {
                0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
                40% { transform: scale(1); opacity: 1; }
            }
        `;

        if (!document.querySelector('#typing-indicator-styles')) {
            style.id = 'typing-indicator-styles';
            document.head.appendChild(style);
        }

        return indicator;
    }
}

// Initialize micro-interactions when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.microInteractions = new MicroInteractions();
});

// Add CSS for ripple animation if not already present
if (!document.querySelector('#ripple-styles')) {
    const style = document.createElement('style');
    style.id = 'ripple-styles';
    style.textContent = `
        @keyframes ripple {
            to {
                transform: scale(4);
                opacity: 0;
            }
        }

        @keyframes rippleExpand {
            to {
                width: 200px;
                height: 200px;
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MicroInteractions;
}