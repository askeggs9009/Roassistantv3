/**
 * DotGrid Background Animation - Vanilla JS
 * Converted from ReactBits DotGrid component
 * Interactive dot grid with mouse proximity effects and click physics
 */

// Import GSAP from CDN (will be loaded via script tag)
// gsap is expected to be globally available

class DotGridBackground {
    constructor(options = {}) {
        // Configuration
        this.dotSize = options.dotSize || 2;
        this.gap = options.gap || 32;
        this.baseColor = options.baseColor || '#5227FF';
        this.activeColor = options.activeColor || '#58a6ff';
        this.proximity = options.proximity || 120;
        this.speedTrigger = options.speedTrigger || 100;
        this.shockRadius = options.shockRadius || 250;
        this.shockStrength = options.shockStrength || 5;
        this.maxSpeed = options.maxSpeed || 5000;
        this.resistance = options.resistance || 750;
        this.returnDuration = options.returnDuration || 1.5;

        // State
        this.wrapper = null;
        this.canvas = null;
        this.ctx = null;
        this.dots = [];
        this.pointer = {
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            speed: 0,
            lastTime: 0,
            lastX: 0,
            lastY: 0
        };

        // Pre-calculate RGB values
        this.baseRgb = this.hexToRgb(this.baseColor);
        this.activeRgb = this.hexToRgb(this.activeColor);

        // Cached circle path for performance
        this.circlePath = null;

        // Animation frame ID
        this.rafId = null;

        // Check if GSAP is available
        if (typeof gsap === 'undefined') {
            console.warn('GSAP not loaded. DotGrid physics will not work. Please include GSAP via <script> tag.');
            return;
        }

        this.init();
    }

    hexToRgb(hex) {
        const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
        if (!m) return { r: 0, g: 0, b: 0 };
        return {
            r: parseInt(m[1], 16),
            g: parseInt(m[2], 16),
            b: parseInt(m[3], 16)
        };
    }

    throttle(func, limit) {
        let lastCall = 0;
        return (...args) => {
            const now = performance.now();
            if (now - lastCall >= limit) {
                lastCall = now;
                func.apply(this, args);
            }
        };
    }

    init() {
        // Create wrapper
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'dot-grid';
        this.wrapper.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 0;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        document.body.insertBefore(this.wrapper, document.body.firstChild);

        // Create canvas
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'dot-grid__canvas';
        this.canvas.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
        `;
        this.wrapper.appendChild(this.canvas);

        this.ctx = this.canvas.getContext('2d');

        // Create circle path for efficient rendering
        this.createCirclePath();

        // Build initial grid
        this.buildGrid();

        // Set up event listeners
        this.setupEvents();

        // Start animation loop
        this.startAnimation();
    }

    createCirclePath() {
        if (typeof Path2D !== 'undefined') {
            this.circlePath = new Path2D();
            this.circlePath.arc(0, 0, this.dotSize / 2, 0, Math.PI * 2);
        }
    }

    buildGrid() {
        const { width, height } = this.wrapper.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        // Set canvas size
        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;

        if (this.ctx) {
            this.ctx.scale(dpr, dpr);
        }

        // Calculate grid
        const cell = this.dotSize + this.gap;
        const cols = Math.floor((width + this.gap) / cell);
        const rows = Math.floor((height + this.gap) / cell);

        const gridW = cell * cols - this.gap;
        const gridH = cell * rows - this.gap;

        const extraX = width - gridW;
        const extraY = height - gridH;

        const startX = extraX / 2 + this.dotSize / 2;
        const startY = extraY / 2 + this.dotSize / 2;

        // Create dots
        this.dots = [];
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const cx = startX + x * cell;
                const cy = startY + y * cell;
                this.dots.push({
                    cx,
                    cy,
                    xOffset: 0,
                    yOffset: 0,
                    _inertiaApplied: false
                });
            }
        }
    }

    setupEvents() {
        // Mouse move with throttling
        const handleMove = this.throttle((e) => {
            const now = performance.now();
            const pr = this.pointer;
            const dt = pr.lastTime ? now - pr.lastTime : 16;
            const dx = e.clientX - pr.lastX;
            const dy = e.clientY - pr.lastY;

            let vx = (dx / dt) * 1000;
            let vy = (dy / dt) * 1000;
            let speed = Math.hypot(vx, vy);

            if (speed > this.maxSpeed) {
                const scale = this.maxSpeed / speed;
                vx *= scale;
                vy *= scale;
                speed = this.maxSpeed;
            }

            pr.lastTime = now;
            pr.lastX = e.clientX;
            pr.lastY = e.clientY;
            pr.vx = vx;
            pr.vy = vy;
            pr.speed = speed;

            const rect = this.canvas.getBoundingClientRect();
            pr.x = e.clientX - rect.left;
            pr.y = e.clientY - rect.top;

            // Apply inertia to dots near fast-moving cursor
            for (const dot of this.dots) {
                const dist = Math.hypot(dot.cx - pr.x, dot.cy - pr.y);
                if (speed > this.speedTrigger && dist < this.proximity && !dot._inertiaApplied) {
                    this.applyInertia(dot, pr);
                }
            }
        }, 50);

        // Click event for shock wave
        const handleClick = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const cx = e.clientX - rect.left;
            const cy = e.clientY - rect.top;

            for (const dot of this.dots) {
                const dist = Math.hypot(dot.cx - cx, dot.cy - cy);
                if (dist < this.shockRadius && !dot._inertiaApplied) {
                    this.applyShockWave(dot, cx, cy, dist);
                }
            }
        };

        // Resize handler
        const handleResize = () => {
            this.buildGrid();
        };

        window.addEventListener('mousemove', handleMove, { passive: true });
        window.addEventListener('click', handleClick);

        // Use ResizeObserver if available, otherwise fallback to window resize
        if ('ResizeObserver' in window) {
            const ro = new ResizeObserver(handleResize);
            ro.observe(this.wrapper);
            this._resizeObserver = ro;
        } else {
            window.addEventListener('resize', handleResize);
            this._resizeHandler = handleResize;
        }

        // Store handlers for cleanup
        this._moveHandler = handleMove;
        this._clickHandler = handleClick;
    }

    applyInertia(dot, pr) {
        if (typeof gsap === 'undefined') return;

        dot._inertiaApplied = true;
        gsap.killTweensOf(dot);

        const pushX = (dot.cx - pr.x + pr.vx * 0.005) * 0.15;
        const pushY = (dot.cy - pr.y + pr.vy * 0.005) * 0.15;

        gsap.to(dot, {
            xOffset: pushX,
            yOffset: pushY,
            duration: 0.3,
            ease: 'power3.out',
            onComplete: () => {
                gsap.to(dot, {
                    xOffset: 0,
                    yOffset: 0,
                    duration: this.returnDuration,
                    ease: 'elastic.out(1, 0.75)'
                });
                dot._inertiaApplied = false;
            }
        });
    }

    applyShockWave(dot, cx, cy, dist) {
        if (typeof gsap === 'undefined') return;

        dot._inertiaApplied = true;
        gsap.killTweensOf(dot);

        const falloff = Math.max(0, 1 - dist / this.shockRadius);
        const pushX = (dot.cx - cx) * this.shockStrength * falloff * 0.2;
        const pushY = (dot.cy - cy) * this.shockStrength * falloff * 0.2;

        gsap.to(dot, {
            xOffset: pushX,
            yOffset: pushY,
            duration: 0.3,
            ease: 'power3.out',
            onComplete: () => {
                gsap.to(dot, {
                    xOffset: 0,
                    yOffset: 0,
                    duration: this.returnDuration,
                    ease: 'elastic.out(1, 0.75)'
                });
                dot._inertiaApplied = false;
            }
        });
    }

    startAnimation() {
        const proxSq = this.proximity * this.proximity;

        const draw = () => {
            if (!this.ctx || !this.canvas) return;

            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            const { x: px, y: py } = this.pointer;

            for (const dot of this.dots) {
                const ox = dot.cx + dot.xOffset;
                const oy = dot.cy + dot.yOffset;
                const dx = dot.cx - px;
                const dy = dot.cy - py;
                const dsq = dx * dx + dy * dy;

                let style = this.baseColor;
                let scale = 1;
                let glowIntensity = 0;

                if (dsq <= proxSq) {
                    const dist = Math.sqrt(dsq);
                    const t = 1 - dist / this.proximity;

                    // Enhanced color transition with more vibrant interpolation
                    const r = Math.round(this.baseRgb.r + (this.activeRgb.r - this.baseRgb.r) * t);
                    const g = Math.round(this.baseRgb.g + (this.activeRgb.g - this.baseRgb.g) * t);
                    const b = Math.round(this.baseRgb.b + (this.activeRgb.b - this.baseRgb.b) * t);
                    style = `rgb(${r},${g},${b})`;

                    // Scale dots based on proximity (up to 4x size when very close)
                    scale = 1 + (t * t * 3); // Quadratic easing for more dramatic effect

                    // Glow intensity (0 to 1)
                    glowIntensity = t * t; // Quadratic for smoother glow
                }

                this.ctx.save();
                this.ctx.translate(ox, oy);

                // Add glow effect for nearby dots
                if (glowIntensity > 0) {
                    this.ctx.shadowBlur = 15 * glowIntensity;
                    this.ctx.shadowColor = style;
                }

                this.ctx.fillStyle = style;

                // Draw dot with scale
                if (this.circlePath) {
                    this.ctx.scale(scale, scale);
                    this.ctx.fill(this.circlePath);
                } else {
                    // Fallback if Path2D not supported
                    this.ctx.beginPath();
                    this.ctx.arc(0, 0, (this.dotSize / 2) * scale, 0, Math.PI * 2);
                    this.ctx.fill();
                }

                this.ctx.restore();
            }

            this.rafId = requestAnimationFrame(draw);
        };

        draw();
    }

    destroy() {
        // Cancel animation
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
        }

        // Remove event listeners
        if (this._moveHandler) {
            window.removeEventListener('mousemove', this._moveHandler);
        }
        if (this._clickHandler) {
            window.removeEventListener('click', this._clickHandler);
        }
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
        } else if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
        }

        // Remove DOM elements
        if (this.wrapper && this.wrapper.parentNode) {
            this.wrapper.parentNode.removeChild(this.wrapper);
        }
    }
}

// Auto-initialize with default options (dot size 2 as requested)
if (typeof gsap !== 'undefined') {
    window.dotGridBackground = new DotGridBackground({
        dotSize: 2,              // As requested
        gap: 32,
        baseColor: '#5227FF',    // Purple base
        activeColor: '#58a6ff',  // Blue active (matches AI theme)
        proximity: 180,          // Increased from 120 for larger hover effect area
        speedTrigger: 100,
        shockRadius: 250,
        shockStrength: 5,
        maxSpeed: 5000,
        resistance: 750,
        returnDuration: 1.5
    });
} else {
    console.warn('GSAP not loaded. DotGrid will not be initialized. Please include GSAP before this script.');
}
