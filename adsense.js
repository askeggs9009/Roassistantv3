// AdSense Configuration and Management
class AdSenseManager {
    constructor() {
        this.adClientId = 'ca-pub-XXXXXXXXXXXXXXXXX'; // Replace with your AdSense publisher ID
        this.isAdBlockDetected = false;
        this.consentGiven = false;
        this.adUnits = {
            banner: 'XXXXXXXXXX',      // Replace with your ad unit IDs
            sidebar: 'XXXXXXXXXX',
            footer: 'XXXXXXXXXX',
            mobile: 'XXXXXXXXXX'
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
        };
        document.head.appendChild(script);
    }

    // Initialize ads after script loads
    initializeAds() {
        try {
            // Push ads to AdSense queue
            (window.adsbygoogle = window.adsbygoogle || []).push({});
            console.log('[AdSense] Ads initialized');
        } catch (error) {
            console.error('[AdSense] Error initializing ads:', error);
        }
    }

    // Create an ad unit
    createAdUnit(containerId, adUnitId, adFormat = 'auto', adStyle = {}) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error(`[AdSense] Container ${containerId} not found`);
            return;
        }

        // Create ad element
        const adElement = document.createElement('ins');
        adElement.className = 'adsbygoogle';
        adElement.style.display = 'block';
        adElement.setAttribute('data-ad-client', this.adClientId);
        adElement.setAttribute('data-ad-slot', adUnitId);
        adElement.setAttribute('data-ad-format', adFormat);
        
        // Apply custom styles
        Object.keys(adStyle).forEach(key => {
            adElement.style[key] = adStyle[key];
        });

        // Add to container
        container.appendChild(adElement);

        // Initialize the ad
        try {
            (window.adsbygoogle = window.adsbygoogle || []).push({});
            console.log(`[AdSense] Ad unit ${adUnitId} created in ${containerId}`);
        } catch (error) {
            console.error(`[AdSense] Error creating ad unit ${adUnitId}:`, error);
        }
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
            

                

                    🍪 We use cookies and ads to support our service
                

                

                    We use Google AdSense to show relevant ads that help keep this AI assistant free. 
                    By continuing, you consent to cookies and data processing. 
                    Privacy Policy
                

            

            
Accept & Continue
Decline

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
        testAd.innerHTML = ' ';
        testAd.className = 'adsbox';
        testAd.style.cssText = 'position: absolute; left: -10000px; top: -10000px;';
        document.body.appendChild(testAd);

        setTimeout(() => {
            const isBlocked = testAd.offsetHeight === 0;
            document.body.removeChild(testAd);
            
            if (isBlocked) {
                this.isAdBlockDetected = true;
                this.showAdBlockMessage();
            }
        }, 100);
    }

    // Show ad block message
    showAdBlockMessage() {
        const message = document.createElement('div');
        message.style.cssText = `
            background: rgba(248, 81, 73, 0.1);
            border: 1px solid #f85149;
            border-radius: 8px;
            padding: 1rem;
            margin: 1rem;
            color: #f85149;
            text-align: center;
        `;
        message.innerHTML = `
            
📛 Ad Blocker Detected

            

                We use ads to keep this AI assistant free. Please consider disabling your ad blocker or 
                support us directly.
            

        `;
        
        // Insert after header
        const header = document.querySelector('.main-header');
        if (header) {
            header.parentNode.insertBefore(message, header.nextSibling);
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
            

                ❤️ Support Our Free AI Assistant
            

            

                Since you've opted out of ads, consider supporting us through:
            

            
❤️ GitHub Sponsors
☕ Buy us a Coffee

        `;
        
        const header = document.querySelector('.main-header');
        if (header) {
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
                        const adUnitId = container.getAttribute('data-ad-unit');
                        const adFormat = container.getAttribute('data-ad-format') || 'auto';
                        
                        this.createAdUnit(container.id, adUnitId, adFormat);
                        adObserver.unobserve(container);
                    }
                });
            }, { threshold: 0.1 });

            adContainers.forEach(container => adObserver.observe(container));
        }
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
        

            
Support Our Project

            

                Help us keep the AI assistant free and continuously improve it!
            


            
❤️ GitHub Sponsors
☕ Buy us a Coffee

            Close
        

    `;
    
    document.body.appendChild(modal);
}

// Initialize AdSense when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.adSenseManager = new AdSenseManager();
});