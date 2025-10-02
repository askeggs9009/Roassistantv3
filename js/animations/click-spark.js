/**
 * ClickSpark Animation - Vanilla JS
 * Adapted from ReactBits
 * Creates sparking effect on clicks
 */

class ClickSpark {
    constructor(options = {}) {
        this.sparkColor = options.sparkColor || '#58a6ff';
        this.sparkSize = options.sparkSize || 10;
        this.sparkRadius = options.sparkRadius || 15;
        this.sparkCount = options.sparkCount || 8;
        this.duration = options.duration || 400;
        this.easing = options.easing || 'ease-out';
        this.extraScale = options.extraScale || 1.0;

        this.canvas = null;
        this.ctx = null;
        this.sparks = [];
        this.animationId = null;

        this.init();
    }

    init() {
        // Create canvas
        this.canvas = document.createElement('canvas');
        this.canvas.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 9999;
        `;
        document.body.appendChild(this.canvas);

        this.ctx = this.canvas.getContext('2d');

        // Set canvas size
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        // Listen for clicks
        document.addEventListener('click', (e) => this.handleClick(e));

        // Start animation loop
        this.animate();
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    easeFunc(t) {
        switch (this.easing) {
            case 'linear':
                return t;
            case 'ease-in':
                return t * t;
            case 'ease-in-out':
                return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
            default: // ease-out
                return t * (2 - t);
        }
    }

    handleClick(e) {
        const now = performance.now();
        const x = e.clientX;
        const y = e.clientY;

        // Create new sparks
        for (let i = 0; i < this.sparkCount; i++) {
            this.sparks.push({
                x,
                y,
                angle: (2 * Math.PI * i) / this.sparkCount,
                startTime: now
            });
        }
    }

    animate(timestamp) {
        this.animationId = requestAnimationFrame((t) => this.animate(t));

        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw and update sparks
        this.sparks = this.sparks.filter(spark => {
            const elapsed = timestamp - spark.startTime;

            if (elapsed >= this.duration) {
                return false;
            }

            const progress = elapsed / this.duration;
            const eased = this.easeFunc(progress);

            const distance = eased * this.sparkRadius * this.extraScale;
            const lineLength = this.sparkSize * (1 - eased);

            const x1 = spark.x + distance * Math.cos(spark.angle);
            const y1 = spark.y + distance * Math.sin(spark.angle);
            const x2 = spark.x + (distance + lineLength) * Math.cos(spark.angle);
            const y2 = spark.y + (distance + lineLength) * Math.sin(spark.angle);

            // Draw spark line
            this.ctx.strokeStyle = this.sparkColor;
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(x1, y1);
            this.ctx.lineTo(x2, y2);
            this.ctx.stroke();

            return true;
        });
    }

    destroy() {
        cancelAnimationFrame(this.animationId);
        this.canvas.remove();
        window.removeEventListener('resize', () => this.resizeCanvas());
        document.removeEventListener('click', (e) => this.handleClick(e));
    }
}

// Auto-initialize with default options
window.clickSpark = new ClickSpark({
    sparkColor: '#58a6ff',
    sparkSize: 12,
    sparkRadius: 20,
    sparkCount: 8,
    duration: 400,
    extraScale: 1.2
});
