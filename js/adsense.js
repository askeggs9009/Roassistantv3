// AdSense Configuration and Management - Customized for your account
class AdSenseManager {
    constructor() {
        this.adClientId = 'ca-pub-7434697703458325'; // Your actual Publisher ID
        this.isAdBlockDetected = false;
        this.consentGiven = false;
        this.adUnits = {
            banner: '4559815586',      // Banner ad unit ID
            sidebar: '4894857501',     // Sidebar ad unit ID
            footer: '6391772005',      // Footer ad unit ID
            mobile: '5949467616'       // Mobile ad unit ID
        };
        this.init();
    }

    // Initialize AdSense
    init() {
        console.log('[AdSense] Initializing...');
        
        // Check if user has consented to ads
        this.checkConsent();
        
        // Load AdSense script if consent given
        if (this.consentGiven) {
            this.loadAdSenseScript();
        } else {
            this.showConsentBanner();
        }

        // Detect ad blockers
        this.detectAdBlock();
    }

    // Load Google AdSense script
    loadAdSenseScript() {
        if (document.querySelector('script[src*="pagead/js/adsbygoogle.js"]')) {
            console.log('[AdSense] Script already loaded');
            return;
        }

        const script = document.createElement('script');
        script.async = true;
        script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${this.adClientId}`;
        script.crossOrigin = 'anonymous';
        script.onload = () => {
            console.log('[AdSense] Script loaded successfully');
            this.initializeAds();
        };
        script.onerror = () => {
            console.error('[AdSense] Failed to load AdSense script');
            this.isAdBlockDetected = true;
            this.showAdBlockMessage();
        };
        document.head.appendChild(script);
    }

    // Initialize ads after script loads
    initializeAds() {
        try {
            // Initialize the adsbygoogle array
            (window.adsbygoogle = window.adsbygoogle || []);
            console.log('[AdSense] Ads initialized');
        } catch (error) {
            console.error('[AdSense] Error initializing ads:', error);
        }
    }

    // Create an ad unit with your actual ad codes
    createAdUnit(containerId, adUnitType, customSize = null) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error(`[AdSense] Container ${containerId} not found`);
            return;
        }

        // Clear existing content
        container.innerHTML = '<div class="ad-label">Advertisement</div>';

        // Get ad unit configuration
        const adConfig = this.getAdConfig(adUnitType, customSize);
        if (!adConfig) {
            console.error(`[AdSense] Invalid ad unit type: ${adUnitType}`);
            return;
        }

        // Create ad element
        const adElement = document.createElement('ins');
        adElement.className = 'adsbygoogle';
        adElement.style.display = 'inline-block';
        adElement.style.width = adConfig.width;
        adElement.style.height = adConfig.height;
        adElement.setAttribute('data-ad-client', this.adClientId);
        adElement.setAttribute('data-ad-slot', adConfig.slot);

        // Add responsive attributes if needed
        if (adConfig.responsive) {
            adElement.setAttribute('data-ad-format', 'auto');
            adElement.setAttribute('data-full-width-responsive', 'true');
        }

        // Add to container
        container.appendChild(adElement);

        // Initialize the ad
        try {
            (window.adsbygoogle = window.adsbygoogle || []).push({});
            console.log(`[AdSense] Ad unit ${adUnitType} (${adConfig.slot}) created in ${containerId}`);
        } catch (error) {
            console.error(`[AdSense] Error creating ad unit ${adUnitType}:`, error);
        }
    }

    // Get ad configuration based on type
    getAdConfig(adUnitType, customSize = null) {
        const configs = {
            banner: {
                slot: this.adUnits.banner,
                width: '728px',
                height: '90px',
                responsive: false
            },
            sidebar: {
                slot: this.adUnits.sidebar,
                width: '300px',
                height: '250px',
                responsive: false
            },
            footer: {
                slot: this.adUnits.footer,
                width: '970px',
                height: '90px',
                responsive: false
            },
            mobile: {
                slot: this.adUnits.mobile,
                width: '320px',
                height: '50px',
                responsive: false
            },
            responsive: {
                slot: this.adUnits.banner, // Use banner slot for responsive ads
                width: '100%',
                height: 'auto',
                responsive: true
            }
        };

        return configs[adUnitType] || null;
    }

    // Create responsive ad that adapts to screen size
    createResponsiveAd(containerId, primarySlot = 'banner') {
        const isMobile = window.innerWidth <= 768;
        const adType = isMobile ? 'mobile' : primarySlot;
        this.createAdUnit(containerId, adType);
    }

    // Show consent banner for GDPR compliance
    showConsentBanner() {
        const existingBanner = document.getElementById('adConsentBanner');
        if (existingBanner) return;

        const banner = document.createElement('div');
        banner.id = 'adConsentBanner';
        banner.style.cssText = `
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background: linear-gradient(135deg, #161b22, #21262d);
            border-top: 1px solid #30363d;
            padding: 1rem;
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
            flex-wrap: wrap;
            box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.3);
        `;

        banner.innerHTML = `
            <div style="flex: 1; min-width: 300px;">
                <div style="color: #f0f6fc; font-weight: 600; margin-bottom: 0.5rem;">
                    🍪 We use cookies and ads to support our free AI assistant
                </div>
                <div style="color: #8b949e; font-size: 0.85rem; line-height: 1.4;">
                    We use Google AdSense to show relevant ads that help keep this AI assistant free. 
                    By continuing, you consent to cookies and data processing. 
                    <a href="/privacy-policy.html" style="color: #58a6ff; text-decoration: none;">Privacy Policy</a>
                </div>
            </div>
            <div style="display: flex; gap: 0.5rem; align-items: center;">
                <button id="adConsentAccept" style="
                    background: #238636;
                    border: none;
                    border-radius: 6px;
                    color: white;
                    padding: 0.75rem 1rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                ">Accept & Continue</button>
                <button id="adConsentDecline" style="
                    background: transparent;
                    border: 1px solid #8b949e;
                    border-radius: 6px;
                    color: #8b949e;
                    padding: 0.75rem 1rem;
                    cursor: pointer;
                    transition: all 0.2s ease;
                ">Decline</button>
            </div>
        `;

        document.body.appendChild(banner);

        // Handle consent buttons
        document.getElementById('adConsentAccept').onclick = () => this.giveConsent(true);
        document.getElementById('adConsentDecline').onclick = () => this.giveConsent(false);
    }

    // Handle user consent
    giveConsent(accepted) {
        this.consentGiven = accepted;
        localStorage.setItem('adConsent', accepted ? 'accepted' : 'declined');
        localStorage.setItem('adConsentDate', new Date().toISOString());

        // Remove consent banner
        const banner = document.getElementById('adConsentBanner');
        if (banner) banner.remove();

        if (accepted) {
            this.loadAdSenseScript();
        } else {
            console.log('[AdSense] User declined ad consent');
            this.showAlternativeSupport();
        }
    }

    // Check existing consent
    checkConsent() {
        const consent = localStorage.getItem('adConsent');
        const consentDate = localStorage.getItem('adConsentDate');
        
        // Check if consent is less than 30 days old
        if (consent && consentDate) {
            const consentAge = Date.now() - new Date(consentDate).getTime();
            const thirtyDays = 30 * 24 * 60 * 60 * 1000;
            
            if (consentAge < thirtyDays) {
                this.consentGiven = consent === 'accepted';
                return;
            }
        }
        
        // No valid consent found
        this.consentGiven = false;
    }

    // Detect ad blockers
    detectAdBlock() {
        const testAd = document.createElement('div');
        testAd.innerHTML = '&nbsp;';
        testAd.className = 'adsbox adsbygoogle';
        testAd.style.cssText = 'position: absolute; left: -10000px; top: -10000px; width: 1px; height: 1px;';
        document.body.appendChild(testAd);

        setTimeout(() => {
            const isBlocked = testAd.offsetHeight === 0 || !testAd.innerHTML || 
                           testAd.style.display === 'none' || testAd.style.visibility === 'hidden';
            document.body.removeChild(testAd);
            
            if (isBlocked) {
                this.isAdBlockDetected = true;
                console.log('[AdSense] Ad blocker detected');
                setTimeout(() => this.showAdBlockMessage(), 2000);
            } else {
                console.log('[AdSense] No ad blocker detected');
            }
        }, 100);
    }

    // Show ad block message
    showAdBlockMessage() {
        if (document.getElementById('adBlockMessage')) return;

        const message = document.createElement('div');
        message.id = 'adBlockMessage';
        message.style.cssText = `
            background: rgba(248, 81, 73, 0.1);
            border: 1px solid #f85149;
            border-radius: 8px;
            padding: 1rem;
            margin: 1rem;
            color: #f85149;
            text-align: center;
            position: relative;
            z-index: 999;
        `;
        message.innerHTML = `
            <div style="font-weight: 600; margin-bottom: 0.5rem;">📛 Ad Blocker Detected</div>
            <div style="font-size: 0.85rem; margin-bottom: 1rem;">
                We use ads to keep this AI assistant free. Please consider disabling your ad blocker or 
                <a href="#" onclick="showSupportOptions()" style="color: #58a6ff; text-decoration: none;">support us directly</a>.
            </div>
            <button onclick="this.parentElement.remove()" style="
                background: transparent;
                border: 1px solid #f85149;
                border-radius: 4px;
                color: #f85149;
                padding: 0.25rem 0.5rem;
                cursor: pointer;
                font-size: 0.8rem;
            ">Dismiss</button>
        `;
        
        // Insert after header
        const header = document.querySelector('.main-header');
        if (header && header.parentNode) {
            header.parentNode.insertBefore(message, header.nextSibling);
        } else {
            document.body.appendChild(message);
        }
    }

    // Show alternative support options
    showAlternativeSupport() {
        const supportDiv = document.createElement('div');
        supportDiv.style.cssText = `
            background: rgba(88, 166, 255, 0.1);
            border: 1px solid #58a6ff;
            border-radius: 8px;
            padding: 1rem;
            margin: 1rem;
            text-align: center;
        `;
        supportDiv.innerHTML = `
            <div style="color: #58a6ff; font-weight: 600; margin-bottom: 0.5rem;">
                ❤️ Support Our Free AI Assistant
            </div>
            <div style="color: #8b949e; font-size: 0.85rem; margin-bottom: 1rem;">
                Since you've opted out of ads, consider supporting us through:
            </div>
            <div style="display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap;">
                <button onclick="window.open('https://github.com/sponsors')" style="
                    background: #f78166;
                    border: none;
                    border-radius: 6px;
                    color: white;
                    padding: 0.5rem 1rem;
                    cursor: pointer;
                    font-size: 0.85rem;
                ">❤️ GitHub Sponsors</button>
                <button onclick="window.open('https://ko-fi.com')" style="
                    background: #29abe0;
                    border: none;
                    border-radius: 6px;
                    color: white;
                    padding: 0.5rem 1rem;
                    cursor: pointer;
                    font-size: 0.85rem;
                ">☕ Buy us a Coffee</button>
            </div>
        `;
        
        const header = document.querySelector('.main-header');
        if (header && header.parentNode) {
            header.parentNode.insertBefore(supportDiv, header.nextSibling);
        }
    }

    // Lazy load ads when scrolling
    setupLazyLoading() {
        const adContainers = document.querySelectorAll('[data-ad-lazy]');
        
        if ('IntersectionObserver' in window) {
            const adObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const container = entry.target;
                        const adUnitType = container.getAttribute('data-ad-type') || 'banner';
                        
                        this.createAdUnit(container.id, adUnitType);
                        adObserver.unobserve(container);
                        console.log(`[AdSense] Lazy loaded ad: ${container.id}`);
                    }
                });
            }, { threshold: 0.1 });

            adContainers.forEach(container => {
                adObserver.observe(container);
            });
        } else {
            // Fallback for browsers without Intersection Observer
            adContainers.forEach(container => {
                const adUnitType = container.getAttribute('data-ad-type') || 'banner';
                this.createAdUnit(container.id, adUnitType);
            });
        }
    }

    // Check if user is premium (hide ads)
    checkPremiumStatus() {
        try {
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            if (user.premium || user.plan === 'premium') {
                document.body.classList.add('premium-user');
                console.log('[AdSense] Premium user detected - ads will be hidden');
                return true;
            }
        } catch (error) {
            console.error('[AdSense] Error checking premium status:', error);
        }
        return false;
    }

    // Initialize all ads after page load
    initializeAllAds() {
        if (this.checkPremiumStatus()) {
            console.log('[AdSense] Premium user - skipping ads');
            return;
        }

        if (!this.consentGiven) {
            console.log('[AdSense] No consent given - skipping ads');
            return;
        }

        // Main ads
        setTimeout(() => {
            this.createResponsiveAd('headerBannerAd', 'banner');
            this.createAdUnit('footerAd', 'footer');
            this.createAdUnit('sidebarAd', 'sidebar');
        }, 1000);

        // Setup lazy loading for other ads
        this.setupLazyLoading();
    }
}

// Global support options function
function showSupportOptions() {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10001;
        padding: 2rem;
    `;
    
    modal.innerHTML = `
        <div style="
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 12px;
            padding: 2rem;
            max-width: 400px;
            width: 100%;
            text-align: center;
        ">
            <h2 style="color: #58a6ff; margin-bottom: 1rem;">Support Our Project</h2>
            <p style="color: #8b949e; margin-bottom: 2rem; line-height: 1.5;">
                Help us keep the AI assistant free and continuously improve it!
            </p>
            <div style="display: flex; flex-direction: column; gap: 1rem;">
                <button onclick="window.open('https://github.com/sponsors')" style="
                    background: #238636;
                    border: none;
                    border-radius: 8px;
                    color: white;
                    padding: 1rem;
                    cursor: pointer;
                    font-weight: 600;
                ">❤️ GitHub Sponsors</button>
                <button onclick="window.open('https://ko-fi.com')" style="
                    background: #1f6feb;
                    border: none;
                    border-radius: 8px;
                    color: white;
                    padding: 1rem;
                    cursor: pointer;
                    font-weight: 600;
                ">☕ Buy us a Coffee</button>
            </div>
            <button onclick="this.closest('div').parentElement.remove()" style="
                background: transparent;
                border: 1px solid #8b949e;
                border-radius: 6px;
                color: #8b949e;
                padding: 0.5rem 1rem;
                cursor: pointer;
                margin-top: 1rem;
            ">Close</button>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// Initialize AdSense when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('[AdSense] DOM ready, initializing...');
    window.adSenseManager = new AdSenseManager();
});

// Initialize ads after page fully loads
window.addEventListener('load', () => {
    console.log('[AdSense] Page loaded, initializing ads...');
    if (window.adSenseManager) {
        // Small delay to ensure everything is ready
        setTimeout(() => {
            window.adSenseManager.initializeAllAds();
        }, 2000);
    }
});

// Handle window resize for responsive ads
window.addEventListener('resize', () => {
    if (window.adSenseManager && !window.adSenseManager.checkPremiumStatus()) {
        // Debounce resize events
        clearTimeout(window.adSenseManager.resizeTimeout);
        window.adSenseManager.resizeTimeout = setTimeout(() => {
            console.log('[AdSense] Window resized, reinitializing responsive ads');
            // You could reinitialize responsive ads here if needed
        }, 500);
    }
});