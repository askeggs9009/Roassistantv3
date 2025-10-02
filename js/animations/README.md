# ReactBits-Inspired Animations

This directory contains vanilla JavaScript implementations of animations inspired by [ReactBits.dev](https://reactbits.dev/) - a collection of high-quality React components.

## 🎨 Installed Animations

### 1. **Particles Background** (`particles-background.js`)
A mesmerizing 3D-like floating particles effect with mouse interaction.

**Features:**
- 100 animated particles with depth effect
- AI-themed colors (blue, purple, white)
- Mouse interaction - particles move away from cursor
- Connection lines between nearby particles
- Smooth performance with canvas rendering

**Customization:**
```javascript
window.particlesBackground = new ParticlesBackground({
    particleCount: 150,
    particleColors: ['#58a6ff', '#7c3aed', '#ffffff'],
    speed: 0.5,
    mouseInteraction: true,
    mouseInfluence: 80,
    particleSize: 2,
    connectionDistance: 120,
    showConnections: true
});
```

---

### 2. **Click Spark Effect** (`click-spark.js`)
Visual feedback on every click with radiating sparks.

**Features:**
- 8 sparks radiating from click point
- Smooth animation with configurable easing
- AI-themed blue color (#58a6ff)
- Non-intrusive overlay

**Customization:**
```javascript
window.clickSpark = new ClickSpark({
    sparkColor: '#58a6ff',
    sparkSize: 12,
    sparkRadius: 20,
    sparkCount: 8,
    duration: 400,
    extraScale: 1.2
});
```

---

### 3. **Cursor Trail** (`cursor-trail.js`)
Smooth, blob-like cursor trail that follows the mouse.

**Features:**
- 3-layer trailing effect
- Gaussian blur for smooth appearance
- AI-themed gradient colors
- Smooth easing for natural movement

**Customization:**
```javascript
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
```

---

### 4. **Blur Text Animation** (`blur-text.js`)
Smooth blur-in effect for text elements.

**Features:**
- Animate by words or letters
- Intersection Observer for viewport detection
- Configurable delay and duration
- Top or bottom direction

**Usage:**
```javascript
// Animate a single element
window.blurTextAnimator.animate(element, {
    delay: 30,
    duration: 0.6,
    animateBy: 'words', // or 'letters'
    direction: 'bottom', // or 'top'
    once: true
});

// Animate all elements with a selector
window.blurTextAnimator.animateAll('.animate-text', options);

// Helper for AI messages
animateAIMessage(messageElement);
```

---

### 5. **Micro-Interactions** (`micro-interactions.js`)
Collection of subtle UI enhancements.

**Features:**
- Button ripple effect on click
- Hover glow effect for interactive elements
- Scroll-reveal animations
- Enhanced typing indicator
- Message slide-in animations
- Smooth scrolling for anchors

**Automatic Features:**
- All buttons get ripple and glow effects
- New messages slide in automatically
- Typing indicator styles are ready to use

**Creating a typing indicator:**
```javascript
const indicator = window.createTypingIndicator();
// Add to your chat container
```

---

## 🚀 Usage

### Automatic Initialization
All animations are automatically initialized when the page loads. No setup required!

### Animation Controller
Access and control animations through the global controller:

```javascript
// Wait for animations to be ready
window.animationsController.onReady(() => {
    console.log('Animations ready!');
});

// Get specific animation instance
const particles = window.animationsController.get('particles');

// Toggle animation on/off
window.animationsController.toggle('cursorTrail', false); // Disable
window.animationsController.toggle('cursorTrail', true);  // Enable

// Destroy all animations
window.animationsController.destroyAll();
```

### Helper Functions
Convenient global functions for common tasks:

```javascript
// Animate text element
window.animateText(element, {
    delay: 30,
    duration: 0.6,
    animateBy: 'words'
});

// Create typing indicator
const indicator = window.showTypingIndicator();
```

---

## 🎯 Integration with Chat System

The animations automatically integrate with your chat system:

1. **AI Messages** - Blur-in animation applied automatically
2. **Typing Indicator** - Use `createTypingIndicator()`
3. **Message Entrance** - Slide-in animations for new messages
4. **Interactive Feedback** - Click sparks and ripples on buttons

---

## ⚙️ Configuration

### Global Config
Modify the default configuration in `animations-init.js`:

```javascript
window.animationsController.init({
    particles: true,
    clickSpark: true,
    cursorTrail: true,
    blurText: true,
    microInteractions: true
});
```

### Per-Animation Config
Each animation can be reconfigured after initialization:

```javascript
window.animationsController.updateConfig('particles', {
    particleCount: 200,
    speed: 1.0
});
```

---

## 🎨 Color Scheme

The animations use your AI assistant's color palette:

- **Primary Blue**: `#58a6ff` - Main interactive elements
- **Purple Accent**: `#7c3aed` - Secondary elements
- **White**: `#ffffff` - Highlights
- **Cyan**: `#00d4ff` - Special effects

To match your brand, update colors in each animation file.

---

## 📊 Performance

All animations are optimized for performance:

- **Canvas-based rendering** for particles and effects
- **RequestAnimationFrame** for smooth 60fps
- **CSS transforms** with `will-change` hints
- **Intersection Observer** for viewport detection
- **Event throttling** where appropriate

### Performance Tips:
1. Reduce particle count on slower devices
2. Disable cursor trail on mobile
3. Use `once: true` for text animations
4. Monitor FPS in DevTools

---

## 🐛 Troubleshooting

### Animations not showing?
1. Check browser console for errors
2. Verify all script files loaded (Network tab)
3. Check for JavaScript conflicts
4. Try disabling other scripts temporarily

### Performance issues?
1. Reduce particle count: `particlesBackground.particleCount = 50`
2. Disable connections: `showConnections: false`
3. Lower blur values: `blur: 15`
4. Disable cursor trail on mobile

### Conflicts with existing code?
All animations use namespaced global variables:
- `window.particlesBackground`
- `window.clickSpark`
- `window.cursorTrail`
- `window.blurTextAnimator`
- `window.microInteractions`
- `window.animationsController`

---

## 📱 Mobile Support

Most animations work great on mobile, but some adjustments are recommended:

```javascript
// Detect mobile and adjust
if (window.innerWidth <= 768) {
    window.animationsController.toggle('cursorTrail', false);
    window.animationsController.updateConfig('particles', {
        particleCount: 50,
        showConnections: false
    });
}
```

---

## 🎓 Credits

- **Inspired by**: [ReactBits.dev](https://reactbits.dev/) by David Haz
- **Adapted for**: Vanilla JavaScript
- **Designed for**: RoAssistant AI Chat Interface

---

## 📝 License

These animations are adaptations of ReactBits components. ReactBits is MIT licensed.

---

## 🚀 Next Steps

Want more animations? Check out ReactBits.dev for inspiration:

- **Aurora Background** - WebGL animated gradient
- **Beams** - Light beam effects
- **Text Effects** - More text animations
- **Glow Effects** - Enhanced hover effects
- **3D Elements** - Three.js integrations

---

**Enjoy your enhanced AI assistant! ✨**

For questions or issues, check the browser console or review individual animation files.
