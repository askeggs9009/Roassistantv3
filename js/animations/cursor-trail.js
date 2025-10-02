/**
 * Cursor Trail Animation - Vanilla JS
 * Inspired by ReactBits BlobCursor component
 * Creates smooth trailing cursor effect
 */

class CursorTrail {
    constructor(options = {}) {
        this.trailCount = options.trailCount || 3;
        this.sizes = options.sizes || [40, 70, 50];
        this.colors = options.colors || [
            'rgba(88, 166, 255, 0.3)',
            'rgba(124, 58, 237, 0.2)',
            'rgba(88, 166, 255, 0.1)'
        ];
        this.blur = options.blur || 30;
        this.ease = options.ease || 0.15;

        this.container = null;
        this.blobs = [];
        this.mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        this.animationId = null;
        this.isVisible = false;

        this.init();
    }

    init() {
        // Create container
        this.container = document.createElement('div');
        this.container.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 9998;
            overflow: hidden;
        `;
        document.body.appendChild(this.container);

        // Create filter for blur effect
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.style.cssText = 'position: absolute; width: 0; height: 0;';
        svg.innerHTML = `
            <defs>
                <filter id="cursor-blob-filter">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="${this.blur}" />
                    <feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 35 -10"/>
                </filter>
            </defs>
        `;
        this.container.appendChild(svg);

        // Create blob wrapper
        const blobWrapper = document.createElement('div');
        blobWrapper.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            filter: url(#cursor-blob-filter);
        `;
        this.container.appendChild(blobWrapper);

        // Create blobs
        for (let i = 0; i < this.trailCount; i++) {
            const blob = document.createElement('div');
            blob.style.cssText = `
                position: absolute;
                width: ${this.sizes[i]}px;
                height: ${this.sizes[i]}px;
                border-radius: 50%;
                background: ${this.colors[i]};
                transform: translate(-50%, -50%);
                will-change: transform;
                transition: opacity 0.3s ease;
            `;

            blobWrapper.appendChild(blob);
            this.blobs.push({
                element: blob,
                x: this.mouse.x,
                y: this.mouse.y,
                ease: i === 0 ? 0.15 : 0.08 / (i + 1)
            });
        }

        // Track mouse
        document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        document.addEventListener('mouseenter', () => this.show());
        document.addEventListener('mouseleave', () => this.hide());

        // Start animation
        this.animate();
    }

    handleMouseMove(e) {
        this.mouse.x = e.clientX;
        this.mouse.y = e.clientY;

        if (!this.isVisible) {
            this.show();
        }
    }

    show() {
        this.isVisible = true;
        this.container.style.opacity = '1';
    }

    hide() {
        this.isVisible = false;
        this.container.style.opacity = '0';
    }

    animate() {
        this.animationId = requestAnimationFrame(() => this.animate());

        this.blobs.forEach((blob, index) => {
            // Smooth lerp towards mouse position
            const dx = this.mouse.x - blob.x;
            const dy = this.mouse.y - blob.y;

            blob.x += dx * blob.ease;
            blob.y += dy * blob.ease;

            // Update position
            blob.element.style.transform = `translate3d(${blob.x}px, ${blob.y}px, 0) translate(-50%, -50%)`;
        });
    }

    destroy() {
        cancelAnimationFrame(this.animationId);
        this.container.remove();
        document.removeEventListener('mousemove', (e) => this.handleMouseMove(e));
        document.removeEventListener('mouseenter', () => this.show());
        document.removeEventListener('mouseleave', () => this.hide());
    }
}

// Auto-initialize with AI-themed cursor
window.cursorTrail = new CursorTrail({
    trailCount: 3,
    sizes: [35, 60, 45],
    colors: [
        'rgba(88, 166, 255, 0.4)',
        'rgba(124, 58, 237, 0.25)',
        'rgba(88, 166, 255, 0.15)'
    ],
    blur: 30
});
