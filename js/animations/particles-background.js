/**
 * Particles Background Animation - Vanilla JS
 * Inspired by ReactBits Particles component
 * Creates a 3D-like floating particles effect
 */

class ParticlesBackground {
    constructor(options = {}) {
        this.particleCount = options.particleCount || 150;
        this.particleColors = options.particleColors || ['#58a6ff', '#7c3aed', '#ffffff'];
        this.speed = options.speed || 0.5;
        this.mouseInteraction = options.mouseInteraction !== false;
        this.mouseInfluence = options.mouseInfluence || 50;
        this.particleSize = options.particleSize || 2;
        this.connectionDistance = options.connectionDistance || 150;
        this.showConnections = options.showConnections !== false;

        this.canvas = null;
        this.ctx = null;
        this.particles = [];
        this.mouse = { x: null, y: null };
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
            z-index: 0;
            opacity: 0.6;
        `;
        document.body.insertBefore(this.canvas, document.body.firstChild);

        this.ctx = this.canvas.getContext('2d');

        // Set canvas size
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        // Track mouse
        if (this.mouseInteraction) {
            document.addEventListener('mousemove', (e) => {
                this.mouse.x = e.clientX;
                this.mouse.y = e.clientY;
            });

            document.addEventListener('mouseleave', () => {
                this.mouse.x = null;
                this.mouse.y = null;
            });
        }

        // Create particles
        this.createParticles();

        // Start animation
        this.animate();
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 255, g: 255, b: 255 };
    }

    createParticles() {
        this.particles = [];
        for (let i = 0; i < this.particleCount; i++) {
            const colorHex = this.particleColors[Math.floor(Math.random() * this.particleColors.length)];
            const color = this.hexToRgb(colorHex);

            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                z: Math.random() * 1000,
                vx: (Math.random() - 0.5) * this.speed,
                vy: (Math.random() - 0.5) * this.speed,
                vz: (Math.random() - 0.5) * this.speed,
                color: color,
                baseSize: this.particleSize + Math.random() * this.particleSize,
                angle: Math.random() * Math.PI * 2,
                angleSpeed: (Math.random() - 0.5) * 0.02
            });
        }
    }

    drawParticle(particle) {
        // Calculate size based on Z position (depth)
        const depth = 1 - (particle.z / 1000);
        const size = particle.baseSize * (0.3 + depth * 0.7);
        const opacity = 0.3 + depth * 0.7;

        // Mouse interaction
        let x = particle.x;
        let y = particle.y;

        if (this.mouse.x !== null && this.mouse.y !== null) {
            const dx = this.mouse.x - particle.x;
            const dy = this.mouse.y - particle.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < this.mouseInfluence * 2) {
                const force = (1 - distance / (this.mouseInfluence * 2)) * 5;
                x -= (dx / distance) * force;
                y -= (dy / distance) * force;
            }
        }

        // Draw glow
        const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, size * 3);
        gradient.addColorStop(0, `rgba(${particle.color.r}, ${particle.color.g}, ${particle.color.b}, ${opacity * 0.3})`);
        gradient.addColorStop(1, `rgba(${particle.color.r}, ${particle.color.g}, ${particle.color.b}, 0)`);

        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(x - size * 3, y - size * 3, size * 6, size * 6);

        // Draw particle
        this.ctx.beginPath();
        this.ctx.arc(x, y, size, 0, Math.PI * 2);
        this.ctx.fillStyle = `rgba(${particle.color.r}, ${particle.color.g}, ${particle.color.b}, ${opacity})`;
        this.ctx.fill();
    }

    drawConnections() {
        if (!this.showConnections) return;

        for (let i = 0; i < this.particles.length; i++) {
            for (let j = i + 1; j < this.particles.length; j++) {
                const dx = this.particles[i].x - this.particles[j].x;
                const dy = this.particles[i].y - this.particles[j].y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < this.connectionDistance) {
                    const opacity = (1 - distance / this.connectionDistance) * 0.2;
                    const depth1 = 1 - (this.particles[i].z / 1000);
                    const depth2 = 1 - (this.particles[j].z / 1000);
                    const avgDepth = (depth1 + depth2) / 2;

                    this.ctx.beginPath();
                    this.ctx.moveTo(this.particles[i].x, this.particles[i].y);
                    this.ctx.lineTo(this.particles[j].x, this.particles[j].y);
                    this.ctx.strokeStyle = `rgba(88, 166, 255, ${opacity * avgDepth})`;
                    this.ctx.lineWidth = 1;
                    this.ctx.stroke();
                }
            }
        }
    }

    updateParticles() {
        this.particles.forEach(particle => {
            // Update position
            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.z += particle.vz;
            particle.angle += particle.angleSpeed;

            // Add wave motion
            particle.x += Math.sin(particle.angle) * 0.5;
            particle.y += Math.cos(particle.angle) * 0.5;

            // Wrap around edges
            if (particle.x < -20) particle.x = this.canvas.width + 20;
            if (particle.x > this.canvas.width + 20) particle.x = -20;
            if (particle.y < -20) particle.y = this.canvas.height + 20;
            if (particle.y > this.canvas.height + 20) particle.y = -20;
            if (particle.z < 0) particle.z = 1000;
            if (particle.z > 1000) particle.z = 0;
        });
    }

    animate() {
        this.animationId = requestAnimationFrame(() => this.animate());

        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw connections first (behind particles)
        this.drawConnections();

        // Update and draw particles
        this.updateParticles();

        // Sort particles by Z (draw far ones first)
        this.particles.sort((a, b) => a.z - b.z);

        this.particles.forEach(particle => {
            this.drawParticle(particle);
        });
    }

    destroy() {
        cancelAnimationFrame(this.animationId);
        this.canvas.remove();
        window.removeEventListener('resize', () => this.resizeCanvas());
    }
}

// Auto-initialize with AI-themed colors
window.particlesBackground = new ParticlesBackground({
    particleCount: 100,
    particleColors: ['#58a6ff', '#7c3aed', '#ffffff', '#00d4ff'],
    speed: 0.3,
    mouseInteraction: true,
    mouseInfluence: 80,
    particleSize: 2,
    connectionDistance: 120,
    showConnections: true
});
