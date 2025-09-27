import express from "express";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { google } from "googleapis";
import path from "path";
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import crypto from 'crypto';
import Stripe from 'stripe';

// Load environment variables FIRST
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config();

// Import Resend for email functionality
import { sendVerificationEmailWithResend, testResendConnection } from './resend-email.js';

// Email service status
let emailServiceAvailable = true;

// Initialize Resend email service
async function initializeEmailService() {
    try {
        if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 'YOUR_API_KEY_HERE') {
            console.log('❌ Resend API key missing or invalid in .env file');
            console.log('💡 Sign up at https://resend.com and add your API key to RESEND_API_KEY');
            return false;
        }

        // Test Resend connection
        console.log('🔍 Testing Resend API connection...');
        await testResendConnection();

        emailServiceAvailable = true;
        console.log('✅ Resend email service is ready!');
        return true;
    } catch (error) {
        console.log('❌ Failed to initialize Resend:', error.message);
        console.log('⚠️ Disabling email verification due to Resend connection issues');
        emailServiceAvailable = false;
        return false;
    }
}

// Initialize email service when server starts
initializeEmailService().catch(err => {
    console.error('Failed to initialize email service:', err.message);
});

// reCAPTCHA v2 verification function
async function verifyRecaptcha(token) {
    if (!token) {
        return { success: false, error: 'reCAPTCHA verification is required' };
    }

    if (!process.env.RECAPTCHA_SECRET_KEY || process.env.RECAPTCHA_SECRET_KEY === 'YOUR_SECRET_KEY_HERE') {
        console.log('⚠️ reCAPTCHA secret key not configured, skipping verification');
        return { success: true }; // Skip verification in development
    }

    try {
        const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${token}`
        });

        const data = await response.json();

        if (!data.success) {
            console.log('reCAPTCHA v2 verification failed:', data['error-codes']);
            return { success: false, error: 'reCAPTCHA verification failed. Please try again.' };
        }

        console.log('✅ reCAPTCHA v2 verification passed');
        return { success: true };

    } catch (error) {
        console.error('reCAPTCHA verification error:', error);
        return { success: false, error: 'reCAPTCHA verification service unavailable' };
    }
}

// Debug email configuration
console.log('🔍 Debug Email Config:');
console.log('RESEND_API_KEY:', process.env.RESEND_API_KEY ? 'Set (length: ' + process.env.RESEND_API_KEY.length + ')' : 'Missing');
console.log('EMAIL_FROM:', process.env.EMAIL_FROM ? 'Set' : 'Missing (will use onboarding@resend.dev)');


const app = express();

// Enhanced CORS configuration to fix OAuth issues
app.use(cors({
    origin: [
        'https://www.roassistant.me',
        'https://roassistant.me',
        'https://www.roassistant.me',
        'http://localhost:3000',
        'http://localhost:5000',
        'http://127.0.0.1:5500',
        process.env.FRONTEND_URL
    ].filter(Boolean),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Stripe webhook handler function
async function handleStripeWebhook(req, res) {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    if (!endpointSecret) {
        console.log('[STRIPE] No webhook secret configured, parsing webhook directly (DEVELOPMENT ONLY)');
        try {
            event = JSON.parse(req.body.toString());
        } catch (err) {
            console.error('[STRIPE] Failed to parse webhook body:', err.message);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }
    } else {
        try {
            event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
        } catch (err) {
            console.error('[STRIPE] Webhook signature verification failed:', err.message);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }
    }

    console.log(`[STRIPE] Received event: ${event.type}`);

    // Handle the event
    switch (event.type) {
        case 'checkout.session.completed':
            const session = event.data.object;
            console.log('[STRIPE] Checkout session completed:', session.id);
            await handleSuccessfulSubscription(session);
            break;

        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
            const subscription = event.data.object;
            console.log(`[STRIPE] Subscription ${event.type}:`, subscription.id);
            await handleSubscriptionChange(subscription, event.type);
            break;

        case 'invoice.payment_succeeded':
            const invoice = event.data.object;
            console.log('[STRIPE] Invoice payment succeeded:', invoice.id);
            if (invoice.subscription) {
                const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
                await handleSubscriptionChange(subscription, 'payment_success');
            }
            break;

        case 'invoice.payment_failed':
            const failedInvoice = event.data.object;
            console.log('[STRIPE] Invoice payment failed:', failedInvoice.id);
            if (failedInvoice.subscription) {
                await handlePaymentFailure(failedInvoice);
            }
            break;

        default:
            console.log(`[STRIPE] Unhandled event type ${event.type}`);
    }

    res.json({received: true});
}

// Stripe webhook MUST come before express.json() to receive raw body
// Support both /webhook/stripe and /stripe/webhook endpoints
app.post('/webhook/stripe', express.raw({type: 'application/json'}), handleStripeWebhook);
app.post('/stripe/webhook', express.raw({type: 'application/json'}), handleStripeWebhook);

app.use(express.json());
app.use(express.static(__dirname));

// Trust proxy for accurate IP detection
app.set('trust proxy', 1);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Claude/Anthropic API
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(e => e);

// Session tracking for CCU
const sessionHeartbeats = new Map();
const activeSessions = new Map();

// Get current concurrent users
function getCurrentCCU() {
    const now = Date.now();
    const timeout = 60000;

    for (const [sessionId, lastHeartbeat] of sessionHeartbeats.entries()) {
        if (now - lastHeartbeat > timeout) {
            sessionHeartbeats.delete(sessionId);
            activeSessions.delete(sessionId);
        }
    }

    return activeSessions.size;
}

// MongoDB Database
import { connectToDatabase, DatabaseManager, User, PendingVerification } from './models/database.js';

// Initialize database connection
await connectToDatabase();

// Get initial user count
const userCount = await DatabaseManager.getUserCount();
console.log(`[DATABASE] Connected to MongoDB with ${userCount} existing users`);

// Subscription Plans Configuration
const SUBSCRIPTION_PLANS = {
    free: {
        name: 'Free',
        limits: {
            daily_messages: 10,
            models: ['claude-4-sonnet'],  // Free: Only RoCode 3, limited
            max_file_size: 1048576, // 1MB
            scripts_storage: 5,
            projects: 0,
            support: 'community'
        },
        features: ['Basic AI assistant', 'GPT-4.1 access', 'Limited daily messages', 'Community support']
    },
    pro: {
        name: 'Pro',
        limits: {
            daily_messages: 200,  // Pro: 200 messages/day = ~$4-6 cost for 70%+ profit
            models: ['claude-4-sonnet', 'claude-4-opus'],
            max_file_size: 10485760, // 10MB
            scripts_storage: -1, // unlimited
            projects: 5,
            support: 'email',
            daily_tokens: 150000  // ~150k tokens/day = $3-4.50 cost
        },
        stripe_price_ids: {
            monthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
            annual: process.env.STRIPE_PRO_ANNUAL_PRICE_ID
        },
        features: ['Advanced AI models', 'Claude 3 Haiku', '500 messages/day', 'Priority support', 'No ads']
    },
    enterprise: {
        name: 'Enterprise',
        limits: {
            daily_messages: 1000,  // Enterprise: 1000 messages/day = ~$15-20 cost for 60%+ profit
            models: ['claude-4-sonnet', 'claude-4-opus', 'rocode-studio'],
            max_file_size: 52428800, // 50MB
            scripts_storage: -1, // unlimited
            projects: -1, // unlimited
            support: 'priority',
            daily_tokens: 600000,  // ~600k tokens/day = $12-18 cost
            daily_studio: 50  // RoCode Studio: 50 messages/day = $10-15 cost
        },
        stripe_price_ids: {
            monthly: process.env.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID,
            annual: process.env.STRIPE_ENTERPRISE_ANNUAL_PRICE_ID
        },
        features: ['All AI models', 'Claude 3 Sonnet & Opus', 'Unlimited messages', 'Premium support', 'Custom integrations']
    }
};

// Usage tracking
const userUsage = new Map();
const guestUsage = new Map();
const dailyUsage = new Map();
const dailyTokenUsage = new Map();  // Track daily token usage
const dailyOpusUsage = new Map();  // Track daily Opus usage for free users
const pendingVerifications = new Map();

async function getUserPlan(userId) {
    const user = await DatabaseManager.findUserById(userId);
    if (!user) return SUBSCRIPTION_PLANS.free;

    const plan = user.subscription?.plan || 'free';
    return SUBSCRIPTION_PLANS[plan] || SUBSCRIPTION_PLANS.free;
}

// Reset daily usage at midnight
function resetDailyUsage() {
    dailyUsage.clear();
    dailyTokenUsage.clear();
    dailyOpusUsage.clear();
    console.log('[USAGE] Daily usage, token counts, and Opus usage reset');
}

// Schedule daily reset (runs at midnight)
setInterval(() => {
    const now = new Date();
    if (now.getHours() === 0 && now.getMinutes() === 0) {
        resetDailyUsage();
    }
}, 60000); // Check every minute

// FIXED: Improved base URL detection to prevent OAuth redirect URI issues
const getBaseUrl = () => {
    // Remove trailing slash if present in BASE_URL
    if (process.env.BASE_URL) {
        return process.env.BASE_URL.replace(/\/$/, '');
    }
    
    if (process.env.RAILWAY_STATIC_URL) {
        return `https://${process.env.RAILWAY_STATIC_URL}`;
    }
    
    const port = process.env.PORT || 3000;
    return `http://localhost:${port}`;
};

// FIXED: Enhanced Google OAuth client with proper error handling
const getGoogleClient = () => {
    const baseUrl = getBaseUrl();
    const redirectUri = `${baseUrl}/auth/google/callback`;
    
    console.log(`[OAUTH] Base URL: ${baseUrl}`);
    console.log(`[OAUTH] Redirect URI: ${redirectUri}`);
    
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        console.error('[ERROR] Google OAuth credentials missing!');
        throw new Error('Google OAuth credentials not configured');
    }
    
    try {
        const client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            redirectUri
        );
        
        console.log('[SUCCESS] Google OAuth client created');
        return client;
    } catch (error) {
        console.error('[ERROR] Failed to create Google OAuth client:', error);
        throw error;
    }
};

const USAGE_LIMITS = {
    "gpt-4.1": {
        dailyLimit: 5,
        hourlyLimit: 2,
        cost: 2.00,
        description: "Advanced AI model"
    },
    "gpt-5": {
        dailyLimit: 3,
        hourlyLimit: 1,
        cost: 3.00,
        description: "Premium AI model"
    },
    "claude-3-5-haiku": {
        dailyLimit: 10,
        hourlyLimit: 5,
        cost: 0.25,
        description: "Fast and efficient Claude 3.5 model"
    },
    "claude-3-7-sonnet": {
        dailyLimit: 8,
        hourlyLimit: 3,
        cost: 3.00,
        description: "Advanced Claude 3.7 model with extended thinking"
    },
    "claude-4-sonnet": {
        dailyLimit: 10,  // Free users: 10 per day
        hourlyLimit: 3,
        cost: 3.00,
        description: "RoCode 3 - Intelligent Roblox development assistant"
    },
    "claude-4-opus": {
        dailyLimit: 3,  // Free users: none, Pro: handled by subscription
        hourlyLimit: 1,
        cost: 15.00,
        description: "RoCode Nexus 3 - Most capable Roblox development assistant"
    },
    "rocode-studio": {
        dailyLimit: 1,  // Enterprise only
        hourlyLimit: 1,
        cost: 25.00,
        description: "RoCode Studio - Most advanced AI development assistant"
    }
};

function getUserIdentifier(req) {
    const token = req.headers['authorization']?.split(' ')[1];
    
    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            return `user_${decoded.id}`;
        } catch (error) {
            // Invalid token, treat as guest
        }
    }
    
    const ip = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'] || '';
    const hash = crypto
        .createHash('md5')
        .update(ip + userAgent)
        .digest('hex')
        .substring(0, 8);
    
    return `guest_${hash}`;
}

// Get user's current subscription
function getUserSubscription(user) {
    if (!user) {
        return {
            plan: 'free',
            ...SUBSCRIPTION_PLANS.free,
            usage: {
                daily_messages: 0,
                daily_limit: 10
            }
        };
    }

    const plan = user.subscription?.plan || 'free';
    const planConfig = SUBSCRIPTION_PLANS[plan];
    
    if (!planConfig) {
        console.error(`[SUBSCRIPTION] Invalid plan: ${plan}`);
        return getUserSubscription(null); // Return free plan as fallback
    }

    // Get today's usage
    const today = new Date().toISOString().split('T')[0];
    const usageKey = `${user.id}_${today}`;
    const todayUsage = dailyUsage.get(usageKey) || 0;

    return {
        plan: plan,
        ...planConfig,
        usage: {
            daily_messages: todayUsage,
            daily_limit: planConfig.limits.daily_messages
        }
    };
}

// Check if user can send message
function canUserSendMessage(user) {
    const subscription = getUserSubscription(user);
    
    // Unlimited plan
    if (subscription.limits.daily_messages === -1) {
        return { allowed: true };
    }
    
    // Check daily limit
    if (subscription.usage.daily_messages >= subscription.limits.daily_messages) {
        return {
            allowed: false,
            error: `Daily message limit reached (${subscription.limits.daily_messages} messages). Upgrade your plan for more messages.`,
            subscription: subscription
        };
    }
    
    return { allowed: true };
}

// Legacy function - kept for compatibility but not used

// Increment user's daily usage
function incrementUserUsage(user) {
    if (!user) return;

    const today = new Date().toISOString().split('T')[0];
    const usageKey = `${user.id}_${today}`;
    const currentUsage = dailyUsage.get(usageKey) || 0;
    dailyUsage.set(usageKey, currentUsage + 1);

    console.log(`[USAGE] User ${user.email} usage: ${currentUsage + 1}`);
}

// Increment free user's Opus usage (now used for Studio tracking too)
function incrementSpecialUsage(user, model) {
    if (!user) return;

    const today = new Date().toISOString().split('T')[0];

    if (model === 'rocode-studio') {
        const studioKey = `studio_${user.id}_${today}`;
        const currentStudioUsage = dailyOpusUsage.get(studioKey) || 0;
        dailyOpusUsage.set(studioKey, currentStudioUsage + 1);
        console.log(`[ROCODE STUDIO] User ${user.email} RoCode Studio usage: ${currentStudioUsage + 1}`);
    } else if (model === 'claude-4-opus') {
        const nexusKey = `nexus_${user.id}_${today}`;
        const currentNexusUsage = dailyOpusUsage.get(nexusKey) || 0;
        dailyOpusUsage.set(nexusKey, currentNexusUsage + 1);
        console.log(`[ROCODE NEXUS] User ${user.email} RoCode Nexus 3 usage: ${currentNexusUsage + 1}`);
    }
}

// Check if authenticated user's usage is within limits
function checkAuthenticatedUserLimits(user, subscription, model) {
    if (!user) return { allowed: false, error: 'User not found' };

    const today = new Date().toISOString().split('T')[0];
    const usageKey = `${user.id}_${today}`;
    const currentUsage = dailyUsage.get(usageKey) || 0;

    // Check daily message limit
    if (currentUsage >= subscription.limits.daily_messages) {
        return {
            allowed: false,
            error: `Daily message limit reached (${subscription.limits.daily_messages}). Resets at midnight.`,
            upgradeUrl: subscription.plan === 'free' ? '/pricing.html' : null,
            resetTime: 'Tomorrow at midnight'
        };
    }

    // Check token limits if defined
    if (subscription.limits.daily_tokens) {
        const tokenUsageKey = `tokens_${user.id}_${today}`;
        const currentTokenUsage = dailyTokenUsage.get(tokenUsageKey) || 0;

        if (currentTokenUsage >= subscription.limits.daily_tokens) {
            return {
                allowed: false,
                error: `Daily token limit reached (${subscription.limits.daily_tokens.toLocaleString()}). Resets at midnight.`,
                upgradeUrl: subscription.plan !== 'enterprise' ? '/pricing.html' : null,
                resetTime: 'Tomorrow at midnight'
            };
        }
    }

    // Check RoCode Studio specific limits
    if (model === 'rocode-studio' && subscription.limits.daily_studio) {
        const studioUsageKey = `studio_${user.id}_${today}`;
        const currentStudioUsage = dailyOpusUsage.get(studioUsageKey) || 0;

        if (currentStudioUsage >= subscription.limits.daily_studio) {
            return {
                allowed: false,
                error: `Daily RoCode Studio limit reached (${subscription.limits.daily_studio}). Resets at midnight.`,
                resetTime: 'Tomorrow at midnight'
            };
        }
    }

    return { allowed: true };
}

function checkUsageLimit(userIdentifier, model) {
    const limits = USAGE_LIMITS[model];
    if (!limits) {
        return { allowed: false, error: "Invalid model" };
    }
    
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const oneDay = 24 * oneHour;
    
    if (!guestUsage.has(userIdentifier)) {
        guestUsage.set(userIdentifier, {
            hourlyUsage: [],
            dailyUsage: [],
            totalUsage: 0
        });
    }
    
    const usage = guestUsage.get(userIdentifier);
    
    usage.hourlyUsage = usage.hourlyUsage.filter(timestamp => now - timestamp < oneHour);
    usage.dailyUsage = usage.dailyUsage.filter(timestamp => now - timestamp < oneDay);
    
    if (usage.hourlyUsage.length >= limits.hourlyLimit) {
        const oldestRequest = Math.min(...usage.hourlyUsage);
        const resetTime = new Date(oldestRequest + oneHour);
        return {
            allowed: false,
            error: `Hourly limit reached for ${model}. You can use this model ${limits.hourlyLimit} times per hour.`,
            resetTime: resetTime,
            limitsInfo: {
                hourlyUsed: usage.hourlyUsage.length,
                hourlyLimit: limits.hourlyLimit,
                dailyUsed: usage.dailyUsage.length,
                dailyLimit: limits.dailyLimit
            }
        };
    }
    
    if (usage.dailyUsage.length >= limits.dailyLimit) {
        const oldestRequest = Math.min(...usage.dailyUsage);
        const resetTime = new Date(oldestRequest + oneDay);
        return {
            allowed: false,
            error: `Daily limit reached for ${model}. You can use this model ${limits.dailyLimit} times per day.`,
            resetTime: resetTime,
            limitsInfo: {
                hourlyUsed: usage.hourlyUsage.length,
                hourlyLimit: limits.hourlyLimit,
                dailyUsed: usage.dailyUsage.length,
                dailyLimit: limits.dailyLimit
            }
        };
    }
    
    return {
        allowed: true,
        limitsInfo: {
            hourlyUsed: usage.hourlyUsage.length,
            hourlyLimit: limits.hourlyLimit,
            dailyUsed: usage.dailyUsage.length,
            dailyLimit: limits.dailyLimit
        }
    };
}

function recordUsage(userIdentifier, model) {
    const now = Date.now();
    
    if (!guestUsage.has(userIdentifier)) {
        guestUsage.set(userIdentifier, {
            hourlyUsage: [],
            dailyUsage: [],
            totalUsage: 0
        });
    }
    
    const usage = guestUsage.get(userIdentifier);
    usage.hourlyUsage.push(now);
    usage.dailyUsage.push(now);
    usage.totalUsage++;
    
    guestUsage.set(userIdentifier, usage);
}

const MODEL_CONFIGS = {
    "gpt-4o-mini": {
        model: "gpt-4o-mini",
        requiresPlan: 'free',
        provider: 'openai'
    },
    "gpt-4.1": {
        model: "gpt-4",
        requiresPlan: 'pro',
        provider: 'openai'
    },
    "gpt-5": {
        model: "gpt-4-turbo-preview",
        requiresPlan: 'enterprise',
        provider: 'openai'
    },
    "claude-3-5-haiku": {
        model: "claude-3-5-haiku-20241022",
        requiresPlan: 'free',
        provider: 'anthropic'
    },
    "claude-3-7-sonnet": {
        model: "claude-3-7-sonnet-20250219",
        requiresPlan: 'pro',
        provider: 'anthropic'
    },
    "claude-4-sonnet": {
        model: "claude-sonnet-4-20250514",
        requiresPlan: 'free',
        provider: 'anthropic'
    },
    "claude-4-opus": {
        model: "claude-opus-4-20250514",
        requiresPlan: 'pro',  // Pro and Enterprise only
        provider: 'anthropic'
    },
    "rocode-studio": {
        model: "claude-opus-4-1-20250805",
        requiresPlan: 'enterprise',
        provider: 'anthropic'
    }
};

function getSystemPrompt(modelName) {
    let modelIdentity = '';

    if (modelName.startsWith('claude-3-5-haiku')) {
        modelIdentity = 'I am Claude 3.5 Haiku, Anthropic\'s fast and efficient AI model.';
    } else if (modelName.startsWith('claude-3-7-sonnet')) {
        modelIdentity = 'I am Claude 3.7 Sonnet, Anthropic\'s advanced AI model with extended thinking capabilities.';
    } else if (modelName.startsWith('claude-4-sonnet')) {
        modelIdentity = 'I am RoCode 3, your intelligent Roblox development assistant powered by Claude 4 Sonnet.';
    } else if (modelName.startsWith('claude-4-opus')) {
        modelIdentity = 'I am RoCode Nexus 3, your most capable Roblox development assistant powered by Claude 4 Opus.';
    } else if (modelName.startsWith('rocode-studio')) {
        modelIdentity = 'I am RoCode Studio, powered by Claude 4.1 Opus - the most advanced AI development assistant for Roblox creators.';
    } else if (modelName === 'gpt-4o-mini') {
        modelIdentity = 'I am GPT-4o mini, OpenAI\'s efficient language model.';
    } else if (modelName === 'gpt-4.1' || modelName === 'gpt-4') {
        modelIdentity = 'I am GPT-4, OpenAI\'s advanced language model.';
    } else if (modelName === 'gpt-5' || modelName === 'gpt-4-turbo-preview') {
        modelIdentity = 'I am GPT-4 Turbo, OpenAI\'s latest and most advanced model.';
    } else {
        modelIdentity = `I am ${modelName}, an AI language model.`;
    }

    return `${modelIdentity} I am a helpful Roblox Luau scripting assistant. I specialize in:

1. Creating Roblox Luau scripts for various game mechanics
2. Debugging existing Roblox code
3. Explaining Roblox Studio concepts and best practices
4. Helping with game development workflows
5. Providing optimized and clean code solutions

When providing code, always use proper Luau syntax and follow Roblox scripting best practices. Include comments to explain complex logic and suggest where scripts should be placed (ServerScriptService, StarterPlayerScripts, etc.).

Be helpful, clear, and provide working examples when possible.`;
}

async function checkUsageLimits(req, res, next) {
    const userIdentifier = getUserIdentifier(req);
    const isAuthenticated = req.user !== null;
    const model = req.body.model || "gpt-4o-mini";
    
    console.log(`[USAGE CHECK] User: ${userIdentifier}, Model: ${model}, Auth: ${isAuthenticated}`);
    
    if (!isAuthenticated) {
        const limitCheck = checkUsageLimit(userIdentifier, model);
        
        if (!limitCheck.allowed) {
            console.log(`[LIMIT REACHED] ${limitCheck.error}`);
            return res.status(429).json({
                error: limitCheck.error,
                resetTime: limitCheck.resetTime,
                limitsInfo: limitCheck.limitsInfo,
                upgradeMessage: "Sign up for unlimited access to all models!",
                requiresAuth: true,
                signUpUrl: "/login.html",
                userType: "guest"
            });
        }
        
        recordUsage(userIdentifier, model);
        console.log(`[USAGE RECORDED] Guest user: ${userIdentifier}`);
        
        res.set({
            'X-Usage-Hourly': `${limitCheck.limitsInfo.hourlyUsed + 1}/${limitCheck.limitsInfo.hourlyLimit}`,
            'X-Usage-Daily': `${limitCheck.limitsInfo.dailyUsed + 1}/${limitCheck.limitsInfo.dailyLimit}`,
            'X-Rate-Limit-Model': model,
            'X-User-Type': 'guest'
        });
    } else {
        // Check subscription limits for authenticated users
        const user = await DatabaseManager.findUserByEmail(req.user.email);
        const canSend = canUserSendMessage(user);

        if (!canSend.allowed) {
            return res.status(429).json({
                error: canSend.error,
                subscription: canSend.subscription,
                upgradeMessage: "Upgrade your plan for more messages!",
                upgradeUrl: "/pricing.html"
            });
        }
    }
    
    next();
}

function generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send verification email using Resend
async function sendVerificationEmail(email, code, name = null) {
    if (!emailServiceAvailable) {
        console.error('Resend email service not available');
        return false;
    }

    try {
        await sendVerificationEmailWithResend(email, code, name || '');
        console.log('✅ Verification email sent successfully via Resend!');
        return true;
    } catch (error) {
        console.error('Resend email sending error:', error.message);
        
        // If Resend fails, disable email service for future requests
        if (error.message.includes('timeout') || error.message.includes('API') || error.message.includes('domain') || error.message.includes('testing emails')) {
            console.log('⚠️ Resend error detected - temporarily disabling email verification');
            emailServiceAvailable = false;
        }
        
        return false;
    }
}

function optionalAuthenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        req.user = null;
        return next();
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        req.user = err ? null : user;
        next();
    });
}

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
}

// Admin authentication middleware
async function authenticateAdmin(req, res, next) {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({ error: 'Access token required' });
        }

        jwt.verify(token, JWT_SECRET, async (err, decoded) => {
            if (err) {
                return res.status(403).json({ error: 'Invalid or expired token' });
            }

            req.user = decoded;
            const user = await DatabaseManager.findUserByEmail(decoded.email);

            if (!user || (!user.isAdmin && !ADMIN_EMAILS.includes(user.email))) {
                // Log unauthorized admin access attempt
                await DatabaseManager.logAdminAction(
                    decoded.id || 'unknown',
                    decoded.email,
                    'UNAUTHORIZED_ADMIN_ACCESS',
                    { path: req.path, ip: req.ip }
                );

                return res.status(403).json({
                    error: 'Admin access required',
                    message: 'You do not have permission to access this resource'
                });
            }

            req.admin = user;
            next();
        });
    } catch (error) {
        console.error('[AUTH] Admin authentication error:', error);
        res.status(500).json({ error: 'Authentication error' });
    }
}

// FIXED: Stripe Webhook Handler - Now properly handles subscription updates

// FIXED: Enhanced subscription handling
async function handleSuccessfulSubscription(session) {
    try {
        console.log('[STRIPE] Processing successful subscription...');
        
        const userEmail = session.customer_email || session.customer_details?.email;
        if (!userEmail) {
            console.error('[STRIPE] No customer email found in session');
            return;
        }

        // Find user by email in database
        const user = await DatabaseManager.findUserByEmail(userEmail);
        if (!user) {
            console.error(`[STRIPE] User not found: ${userEmail}`);
            return;
        }

        // Get subscription details
        if (session.subscription) {
            const subscription = await stripe.subscriptions.retrieve(session.subscription);
            await updateUserSubscription(userEmail, subscription, 'checkout_completed');
        }
        
        console.log(`[STRIPE] Successfully processed subscription for ${userEmail}`);
    } catch (error) {
        console.error('[STRIPE] Error handling successful subscription:', error);
    }
}

// FIXED: Enhanced subscription change handling
async function handleSubscriptionChange(subscription, eventType) {
    try {
        console.log(`[STRIPE] Processing subscription change: ${eventType}`);
        
        // Find user by Stripe customer ID in database
        const allUsers = await DatabaseManager.getAllUsers();
        let userEmail = null;

        for (const user of allUsers) {
            if (user.subscription?.stripeCustomerId === subscription.customer) {
                userEmail = user.email;
                break;
            }
        }

        if (!userEmail) {
            // If we don't have the customer ID stored, try to get it from Stripe
            try {
                const customer = await stripe.customers.retrieve(subscription.customer);
                userEmail = customer.email;

                // Find user by email in database
                const user = await DatabaseManager.findUserByEmail(userEmail);
                if (!user) {
                    console.error(`[STRIPE] User not found: ${userEmail}`);
                    return;
                }
            } catch (error) {
                console.error('[STRIPE] Could not retrieve customer:', error);
                return;
            }
        }

        await updateUserSubscription(userEmail, subscription, eventType);
        console.log(`[STRIPE] Successfully updated subscription for ${userEmail}`);
    } catch (error) {
        console.error('[STRIPE] Error handling subscription change:', error);
    }
}

// FIXED: New function to properly update user subscriptions
async function updateUserSubscription(userEmail, subscription, eventType) {
    const user = await DatabaseManager.findUserByEmail(userEmail);
    if (!user) {
        console.error(`[STRIPE] User not found: ${userEmail}`);
        return;
    }

    console.log(`[STRIPE DEBUG] Processing subscription for ${userEmail}`);
    console.log(`[STRIPE DEBUG] Event type: ${eventType}`);
    console.log(`[STRIPE DEBUG] Subscription status: ${subscription.status}`);
    console.log(`[STRIPE DEBUG] Subscription ID: ${subscription.id}`);

    // Determine plan based on price ID
    let plan = 'free';
    if (subscription.items && subscription.items.data.length > 0) {
        const priceId = subscription.items.data[0].price.id;
        console.log(`[STRIPE DEBUG] Price ID received: ${priceId}`);
        console.log(`[STRIPE DEBUG] Expected Pro Monthly: ${process.env.STRIPE_PRO_MONTHLY_PRICE_ID}`);
        console.log(`[STRIPE DEBUG] Expected Pro Annual: ${process.env.STRIPE_PRO_ANNUAL_PRICE_ID}`);
        console.log(`[STRIPE DEBUG] Expected Enterprise Monthly: ${process.env.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID}`);
        console.log(`[STRIPE DEBUG] Expected Enterprise Annual: ${process.env.STRIPE_ENTERPRISE_ANNUAL_PRICE_ID}`);

        if (priceId === process.env.STRIPE_PRO_MONTHLY_PRICE_ID ||
            priceId === process.env.STRIPE_PRO_ANNUAL_PRICE_ID) {
            plan = 'pro';
            console.log(`[STRIPE DEBUG] Matched Pro plan`);
        } else if (priceId === process.env.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID ||
                   priceId === process.env.STRIPE_ENTERPRISE_ANNUAL_PRICE_ID) {
            plan = 'enterprise';
            console.log(`[STRIPE DEBUG] Matched Enterprise plan`);
        } else {
            console.log(`[STRIPE DEBUG] No plan match found - defaulting to free`);
        }
    } else {
        console.log(`[STRIPE DEBUG] No subscription items found`);
    }

    // Handle different subscription statuses
    let finalPlan = plan;
    let status = subscription.status;

    if (subscription.status === 'canceled' || subscription.status === 'unpaid' ||
        subscription.status === 'past_due' || eventType === 'customer.subscription.deleted') {
        finalPlan = 'free';
        status = 'canceled';
        console.log(`[STRIPE DEBUG] Setting to free plan due to status: ${subscription.status}`);
    } else if (subscription.status === 'active' || subscription.status === 'trialing') {
        status = 'active';
        console.log(`[STRIPE DEBUG] Setting status to active`);
    }

    console.log(`[STRIPE DEBUG] Final plan: ${finalPlan}, Final status: ${status}`);

    // Update user subscription
    const subscriptionUpdate = {
        subscription: {
            plan: finalPlan,
            stripeCustomerId: subscription.customer,
            stripeSubscriptionId: subscription.id,
            status: status,
            currentPeriodStart: subscription.current_period_start ? new Date(subscription.current_period_start * 1000) : new Date(),
            currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Default to 30 days from now
            cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
            updatedAt: new Date()
        }
    };

    console.log(`[STRIPE DEBUG] Subscription update object:`, JSON.stringify(subscriptionUpdate, null, 2));

    await DatabaseManager.updateUser(userEmail, subscriptionUpdate);
    console.log(`[SUBSCRIPTION] User ${userEmail} updated to ${finalPlan} (${status})`);

    // Verify the update worked
    const updatedUser = await DatabaseManager.findUserByEmail(userEmail);
    console.log(`[STRIPE DEBUG] User after update - Plan: ${updatedUser.subscription?.plan}, Status: ${updatedUser.subscription?.status}`);
}

// FIXED: New function to handle payment failures
async function handlePaymentFailure(invoice) {
    try {
        if (invoice.customer_email) {
            const user = await DatabaseManager.findUserByEmail(invoice.customer_email);
            if (user && user.subscription) {
                // You can implement logic here to handle failed payments
                // For example, send an email notification or temporarily suspend service
                console.log(`[STRIPE] Payment failed for user: ${invoice.customer_email}`);
            }
        }
    } catch (error) {
        console.error('[STRIPE] Error handling payment failure:', error);
    }
}

// Health check endpoint with enhanced OAuth info
app.get("/health", (req, res) => {
    res.status(200).json({ 
        status: "healthy", 
        timestamp: new Date().toISOString(),
        baseUrl: getBaseUrl(),
        oauth: {
            configured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
            redirectUri: `${getBaseUrl()}/auth/google/callback`
        },
        email: {
            service: 'resend',
            configured: !!(process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== 'YOUR_API_KEY_HERE'),
            available: emailServiceAvailable
        },
        stripe: {
            configured: !!process.env.STRIPE_SECRET_KEY,
            webhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET
        },
        ai: {
            openai: !!process.env.OPENAI_API_KEY,
            claude: !!process.env.ANTHROPIC_API_KEY
        },
        subscriptionPlans: Object.keys(SUBSCRIPTION_PLANS),
        activeGuests: guestUsage.size
    });
});

// Session tracking endpoint
app.post('/api/session/heartbeat', authenticateToken, async (req, res) => {
    try {
        const { sessionId } = req.body;
        const userId = req.user.id;
        const userEmail = req.user.email;

        if (!sessionId) {
            return res.status(400).json({ error: 'Session ID required' });
        }

        // Update session heartbeat
        sessionHeartbeats.set(sessionId, Date.now());
        activeSessions.set(sessionId, { userId, userEmail, lastActive: Date.now() });

        // Update database session
        await DatabaseManager.updateSession(sessionId, {
            lastActivity: new Date(),
            isActive: true
        });

        // Update user's lastActive
        await DatabaseManager.updateUser(userEmail, {
            lastActive: new Date()
        });

        res.json({
            success: true,
            ccu: getCurrentCCU()
        });
    } catch (error) {
        console.error('[SESSION] Heartbeat error:', error);
        res.status(500).json({ error: 'Failed to update session' });
    }
});

// Create new session
app.post('/api/session/create', authenticateToken, async (req, res) => {
    try {
        const { sessionId } = req.body;
        const userId = req.user.id;
        const userEmail = req.user.email;

        if (!sessionId) {
            return res.status(400).json({ error: 'Session ID required' });
        }

        // Create database session
        await DatabaseManager.createSession({
            userId,
            userEmail,
            sessionId,
            ip: req.ip,
            userAgent: req.headers['user-agent']
        });

        // Track in memory
        activeSessions.set(sessionId, { userId, userEmail, lastActive: Date.now() });
        sessionHeartbeats.set(sessionId, Date.now());

        // Update user stats
        await DatabaseManager.updateUser(userEmail, {
            $inc: { sessionCount: 1 },
            lastActive: new Date()
        });

        // Update analytics
        const today = new Date();
        await DatabaseManager.updateAnalytics(today, 'daily', {
            totalSessions: 1,
            activeUsers: 1
        });

        res.json({
            success: true,
            ccu: getCurrentCCU()
        });
    } catch (error) {
        console.error('[SESSION] Create error:', error);
        res.status(500).json({ error: 'Failed to create session' });
    }
});

// Admin endpoint to view user activity (enhanced)
app.get('/admin/user-activity', authenticateAdmin, async (req, res) => {
    try {
        const userEmail = req.user.email;
        const currentUser = await DatabaseManager.findUserByEmail(userEmail);

        if (!ADMIN_EMAILS.includes(userEmail) && !currentUser?.isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const users = await DatabaseManager.getAllUsers();

        const userActivity = users.map(user => {
            return {
                email: user.email,
                name: user.name,
                provider: user.provider || 'email',
                emailVerified: user.emailVerified || false,
                createdAt: user.createdAt,
                lastActivity: user.lastLogin,
                subscription: user.subscription?.plan || 'free'
            };
        }).sort((a, b) => {
            // Sort by most recent activity
            if (!a.lastActivity) return 1;
            if (!b.lastActivity) return -1;
            return new Date(b.lastActivity) - new Date(a.lastActivity);
        });

        res.json({
            totalUsers: users.length,
            verifiedUsers: users.filter(u => u.emailVerified).length,
            userActivity
        });

    } catch (error) {
        console.error('[ADMIN] Error fetching user activity:', error);
        res.status(500).json({ error: 'Failed to fetch user activity' });
    }
});

// Admin analytics endpoints
app.get('/admin/analytics/summary', authenticateAdmin, async (req, res) => {
    try {
        const { period = 'week' } = req.query;
        const now = new Date();
        const users = await DatabaseManager.getAllUsers();

        // Calculate date ranges
        const today = new Date(now.setHours(0, 0, 0, 0));
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
        const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

        // Get users by time period
        const todayUsers = users.filter(u => new Date(u.lastActive || u.lastLogin) >= today);
        const weekUsers = users.filter(u => new Date(u.lastActive || u.lastLogin) >= weekAgo);
        const monthUsers = users.filter(u => new Date(u.lastActive || u.lastLogin) >= monthAgo);

        // Get analytics data
        const weeklyAnalytics = await DatabaseManager.getAnalytics(weekAgo, today, 'daily');
        const monthlyAnalytics = await DatabaseManager.getAnalytics(monthAgo, today, 'daily');

        // Calculate stats
        const stats = {
            ccu: getCurrentCCU(),
            today: {
                activeUsers: todayUsers.length,
                newUsers: users.filter(u => new Date(u.createdAt) >= today).length,
                messages: weeklyAnalytics.reduce((sum, a) => sum + (a.totalMessages || 0), 0)
            },
            week: {
                activeUsers: weekUsers.length,
                newUsers: users.filter(u => new Date(u.createdAt) >= weekAgo).length,
                totalSessions: weeklyAnalytics.reduce((sum, a) => sum + (a.totalSessions || 0), 0),
                totalMessages: weeklyAnalytics.reduce((sum, a) => sum + (a.totalMessages || 0), 0),
                avgSessionsPerDay: weeklyAnalytics.length > 0 ?
                    Math.round(weeklyAnalytics.reduce((sum, a) => sum + (a.totalSessions || 0), 0) / weeklyAnalytics.length) : 0
            },
            month: {
                activeUsers: monthUsers.length,
                newUsers: users.filter(u => new Date(u.createdAt) >= monthAgo).length,
                totalSessions: monthlyAnalytics.reduce((sum, a) => sum + (a.totalSessions || 0), 0),
                totalMessages: monthlyAnalytics.reduce((sum, a) => sum + (a.totalMessages || 0), 0)
            },
            allTime: {
                totalUsers: users.length,
                verifiedUsers: users.filter(u => u.emailVerified).length,
                totalMessages: users.reduce((sum, u) => sum + (u.totalMessages || 0), 0)
            },
            usersByPlan: {
                free: users.filter(u => !u.subscription?.plan || u.subscription.plan === 'free').length,
                pro: users.filter(u => u.subscription?.plan === 'pro').length,
                enterprise: users.filter(u => u.subscription?.plan === 'enterprise').length
            },
            chartData: {
                daily: weeklyAnalytics.map(a => ({
                    date: a.date,
                    users: a.activeUsers || 0,
                    sessions: a.totalSessions || 0,
                    messages: a.totalMessages || 0
                }))
            }
        };

        // Log admin access
        await DatabaseManager.logAdminAction(
            req.admin.id,
            req.admin.email,
            'VIEW_ANALYTICS',
            { period, ip: req.ip }
        );

        res.json(stats);
    } catch (error) {
        console.error('[ADMIN] Error fetching analytics:', error);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

// Admin chat logs endpoint
app.get('/admin/chat-logs', authenticateAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 50, userId, userEmail, startDate, endDate } = req.query;

        // Build filter
        const filter = {};
        if (userId) filter.userId = userId;
        if (userEmail) filter.userEmail = new RegExp(userEmail, 'i');
        if (startDate || endDate) {
            filter.timestamp = {};
            if (startDate) filter.timestamp.$gte = new Date(startDate);
            if (endDate) filter.timestamp.$lte = new Date(endDate);
        }

        const result = await DatabaseManager.getChatLogs(filter, {
            page: parseInt(page),
            limit: parseInt(limit),
            sort: { timestamp: -1 }
        });

        // Log admin access
        await DatabaseManager.logAdminAction(
            req.admin.id,
            req.admin.email,
            'VIEW_CHAT_LOGS',
            { filter, page, limit, ip: req.ip }
        );

        res.json(result);
    } catch (error) {
        console.error('[ADMIN] Error fetching chat logs:', error);
        res.status(500).json({ error: 'Failed to fetch chat logs' });
    }
});

// Admin CCU endpoint
app.get('/admin/analytics/ccu', authenticateAdmin, async (req, res) => {
    try {
        const activeSessions = await DatabaseManager.getActiveSessions();
        const ccu = getCurrentCCU();

        const sessionDetails = activeSessions.map(session => ({
            userId: session.userId,
            userEmail: session.userEmail,
            sessionId: session.sessionId,
            startTime: session.startTime,
            lastActivity: session.lastActivity,
            duration: Math.round((Date.now() - new Date(session.startTime).getTime()) / 60000) // minutes
        }));

        res.json({
            currentCCU: ccu,
            sessions: sessionDetails,
            timestamp: new Date()
        });
    } catch (error) {
        console.error('[ADMIN] Error fetching CCU:', error);
        res.status(500).json({ error: 'Failed to fetch CCU data' });
    }
});

// Admin user details endpoint
app.get('/admin/user/:userId', authenticateAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await DatabaseManager.findUserById(userId);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Get recent chat logs for this user
        const recentChats = await DatabaseManager.getChatLogs(
            { userId },
            { page: 1, limit: 10 }
        );

        // Log admin access
        await DatabaseManager.logAdminAction(
            req.admin.id,
            req.admin.email,
            'VIEW_USER_DETAILS',
            { targetUserId: userId, ip: req.ip }
        );

        res.json({
            user: {
                ...user.toObject(),
                password: undefined // Remove password from response
            },
            recentChats: recentChats.logs
        });
    } catch (error) {
        console.error('[ADMIN] Error fetching user details:', error);
        res.status(500).json({ error: 'Failed to fetch user details' });
    }
});

// Admin action logs endpoint
app.get('/admin/logs', authenticateAdmin, async (req, res) => {
    try {
        const { limit = 100 } = req.query;
        const logs = await DatabaseManager.getAdminLogs({}, parseInt(limit));

        res.json(logs);
    } catch (error) {
        console.error('[ADMIN] Error fetching admin logs:', error);
        res.status(500).json({ error: 'Failed to fetch admin logs' });
    }
});

// FIXED: Enhanced Google OAuth routes with comprehensive error handling
app.get("/auth/google", (req, res) => {
    try {
        const googleClient = getGoogleClient();
        const scopes = ['email', 'profile'];
        
        const authUrl = googleClient.generateAuthUrl({
            access_type: 'offline',
            scope: scopes,
            prompt: 'consent',
            include_granted_scopes: true
        });
        
        console.log('[OAUTH] Redirecting to Google auth URL');
        res.redirect(authUrl);
    } catch (error) {
        console.error('[ERROR] Google auth initiation failed:', error);
        const frontendUrl = process.env.FRONTEND_URL || 'https://www.roassistant.me';
        res.redirect(`${frontendUrl}/login.html?error=oauth_setup_failed`);
    }
});

app.get("/auth/google/callback", async (req, res) => {
    const frontendUrl = process.env.FRONTEND_URL || 'https://www.roassistant.me';
    
    try {
        const { code, error: oauthError } = req.query;
        
        if (oauthError) {
            console.error('[ERROR] OAuth error from Google:', oauthError);
            return res.redirect(`${frontendUrl}/login.html?error=oauth_denied`);
        }
        
        if (!code) {
            console.error('[ERROR] No authorization code received');
            return res.redirect(`${frontendUrl}/login.html?error=no_code`);
        }
        
        console.log('[OAUTH] Processing callback with code:', code.substring(0, 20) + '...');
        
        const googleClient = getGoogleClient();
        
        // Exchange code for tokens
        const { tokens } = await googleClient.getToken(code);
        googleClient.setCredentials(tokens);
        
        console.log('[OAUTH] Tokens received, fetching user info');
        
        // Get user information
        const oauth2 = google.oauth2({ version: 'v2', auth: googleClient });
        const { data } = await oauth2.userinfo.get();
        
        console.log('[OAUTH] User info retrieved:', data.email);
        
        // Create or update user
        let user = await DatabaseManager.findUserByEmail(data.email);
        if (!user) {
            const userData = {
                id: Date.now().toString(),
                email: data.email,
                name: data.name,
                picture: data.picture,
                createdAt: new Date(),
                provider: 'google',
                emailVerified: true,
                lastLogin: new Date(),
                subscription: { plan: 'free', status: 'active' },
                chats: [], // FIXED: Initialize user-specific chats
                scripts: [] // FIXED: Initialize user-specific scripts
            };
            user = await DatabaseManager.createUser(userData);
            console.log('[OAUTH] New user created:', data.email);
        } else {
            // Update last login
            await DatabaseManager.updateUser(data.email, {
                lastLogin: new Date(),
                picture: data.picture, // Update profile picture if changed
                name: data.name // Update name if changed
            });
            console.log('[OAUTH] Existing user logged in:', data.email);
        }
        
        // Generate JWT token
        const token = jwt.sign(
            { id: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        console.log('[OAUTH] JWT token generated, redirecting to frontend');
        
        // Redirect with token and user data
        const userDataEncoded = encodeURIComponent(JSON.stringify({
            id: user.id,
            email: user.email,
            name: user.name,
            picture: user.picture,
            subscription: user.subscription
        }));
        
        res.redirect(`${frontendUrl}/login-success.html?token=${token}&user=${userDataEncoded}`);
        
    } catch (error) {
        console.error("[ERROR] Google OAuth callback error:", error);
        console.error("[ERROR] Error details:", {
            message: error.message,
            stack: error.stack,
            code: error.code
        });
        
        res.redirect(`${frontendUrl}/login.html?error=google_auth_failed&details=${encodeURIComponent(error.message)}`);
    }
});

// Create Stripe Checkout Session
app.post("/api/create-checkout-session", authenticateToken, async (req, res) => {
    try {
        const { plan, billing } = req.body;
        const user = await DatabaseManager.findUserByEmail(req.user.email);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const planConfig = SUBSCRIPTION_PLANS[plan];
        if (!planConfig || !planConfig.stripe_price_ids) {
            return res.status(400).json({ error: 'Invalid plan selected' });
        }
        
        const priceId = planConfig.stripe_price_ids[billing];
        if (!priceId) {
            return res.status(400).json({ error: 'Invalid billing period' });
        }
        
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price: priceId,
                quantity: 1,
            }],
            mode: 'subscription',
            success_url: `${getBaseUrl()}/subscription-success.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${getBaseUrl()}/pricing.html`,
            customer_email: user.email,
            metadata: {
                userId: user.id,
                plan: plan
            },
            allow_promotion_codes: true,
            billing_address_collection: 'auto',
        });
        
        res.json({ sessionId: session.id });
    } catch (error) {
        console.error('[ERROR] Failed to create checkout session:', error);
        res.status(500).json({ error: 'Failed to create checkout session' });
    }
});

// Get User Subscription Status
app.get("/api/user-subscription", authenticateToken, async (req, res) => {
    try {
        const user = await DatabaseManager.findUserByEmail(req.user.email);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const subscription = user.subscription || { plan: 'free', status: 'active' };
        const plan = SUBSCRIPTION_PLANS[subscription.plan] || SUBSCRIPTION_PLANS.free;
        
        // Get current usage
        const today = new Date().toISOString().split('T')[0];
        const usageKey = `${user.id}_${today}`;
        const usage = dailyUsage.get(usageKey) || 0;
        
        // Get token usage
        const tokenUsageKey = `tokens_${user.id}_${today}`;
        const tokenUsage = dailyTokenUsage.get(tokenUsageKey) || 0;

        // Get Studio usage for enterprise users
        const studioUsageKey = `studio_${user.id}_${today}`;
        const studioUsage = dailyOpusUsage.get(studioUsageKey) || 0;

        res.json({
            plan: subscription.plan,
            status: subscription.status,
            limits: plan.limits,
            usage: {
                daily_messages: usage,
                daily_limit: plan.limits.daily_messages,
                daily_tokens: tokenUsage,
                daily_token_limit: plan.limits.daily_tokens || -1,
                total_tokens: user.totalTokens || 0,
                daily_studio: studioUsage,
                daily_studio_limit: plan.limits.daily_studio || 0
            },
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd
        });
    } catch (error) {
        console.error('[ERROR] Failed to get subscription:', error);
        res.status(500).json({ error: 'Failed to get subscription status' });
    }
});

// Get detailed token usage statistics
app.get("/api/token-usage", authenticateToken, async (req, res) => {
    try {
        const user = await DatabaseManager.findUserByEmail(req.user.email);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const today = new Date().toISOString().split('T')[0];
        const tokenUsageKey = `tokens_${user.id}_${today}`;
        const dailyTokens = dailyTokenUsage.get(tokenUsageKey) || 0;

        // Get recent chat logs to calculate token usage by model
        const recentChats = await DatabaseManager.getChatLogs(
            { userEmail: user.email },
            { page: 1, limit: 100 }
        );

        // Calculate token usage by model for today
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const tokensByModel = {};
        let todayTotalTokens = 0;

        if (recentChats && recentChats.logs) {
            recentChats.logs.forEach(chat => {
                if (new Date(chat.timestamp) >= todayStart) {
                    const model = chat.model || 'unknown';
                    if (!tokensByModel[model]) {
                        tokensByModel[model] = {
                            count: 0,
                            inputTokens: 0,
                            outputTokens: 0,
                            totalTokens: 0
                        };
                    }
                    tokensByModel[model].count++;
                    tokensByModel[model].inputTokens += chat.inputTokens || 0;
                    tokensByModel[model].outputTokens += chat.outputTokens || 0;
                    tokensByModel[model].totalTokens += chat.tokenCount || 0;
                    todayTotalTokens += chat.tokenCount || 0;
                }
            });
        }

        // Get subscription plan token limits (if any)
        const subscription = user.subscription || { plan: 'free' };
        const plan = SUBSCRIPTION_PLANS[subscription.plan] || SUBSCRIPTION_PLANS.free;

        // You can define token limits per plan if needed
        const tokenLimits = {
            free: 10000,      // 10k tokens per day
            pro: 100000,      // 100k tokens per day
            enterprise: -1    // Unlimited
        };

        const dailyTokenLimit = tokenLimits[subscription.plan] || tokenLimits.free;

        res.json({
            usage: {
                daily: dailyTokens,
                dailyByModel: tokensByModel,
                total: user.totalTokens || 0,
                dailyLimit: dailyTokenLimit,
                percentage: dailyTokenLimit === -1 ? 0 : Math.round((dailyTokens / dailyTokenLimit) * 100)
            },
            subscription: {
                plan: subscription.plan,
                status: subscription.status
            },
            costEstimate: {
                daily: calculateTokenCost(dailyTokens, subscription.plan),
                total: calculateTokenCost(user.totalTokens || 0, subscription.plan)
            }
        });
    } catch (error) {
        console.error('[ERROR] Failed to get token usage:', error);
        res.status(500).json({ error: 'Failed to get token usage statistics' });
    }
});

// Helper function to calculate estimated cost
function calculateTokenCost(tokens, plan) {
    // Rough cost estimates per 1M tokens (you can adjust these)
    const costPerMillion = {
        'gpt-4': 30.00,
        'gpt-3.5-turbo': 1.50,
        'claude-3-5-haiku': 0.25,
        'claude-3-7-sonnet': 3.00,
        'claude-4-sonnet': 5.00,
        'claude-4-opus': 15.00,
        'rocode-studio': 25.00
    };

    // For simplicity, using an average cost
    const avgCostPerMillion = 5.00;
    const cost = (tokens / 1000000) * avgCostPerMillion;

    return {
        estimated: cost.toFixed(4),
        currency: 'USD',
        note: plan === 'enterprise' ? 'Included in plan' : 'Estimated cost'
    };
}

// Manual Subscription Verification and Sync
app.post("/api/verify-subscription", authenticateToken, async (req, res) => {
    try {
        const user = await DatabaseManager.findUserByEmail(req.user.email);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        console.log(`[MANUAL SYNC] Verifying subscription for ${req.user.email}`);

        // Get all subscriptions for this customer
        let subscriptions = [];
        if (user.subscription?.stripeCustomerId) {
            const response = await stripe.subscriptions.list({
                customer: user.subscription.stripeCustomerId,
                status: 'all',
                limit: 10
            });
            subscriptions = response.data;
        }

        // Also check by email if no customer ID
        if (subscriptions.length === 0) {
            try {
                const customers = await stripe.customers.list({
                    email: user.email,
                    limit: 1
                });

                if (customers.data.length > 0) {
                    const customerId = customers.data[0].id;
                    const response = await stripe.subscriptions.list({
                        customer: customerId,
                        status: 'all',
                        limit: 10
                    });
                    subscriptions = response.data;
                }
            } catch (error) {
                console.log('[MANUAL SYNC] No customer found in Stripe');
            }
        }

        console.log(`[MANUAL SYNC] Found ${subscriptions.length} subscriptions`);

        // Find the most recent active subscription
        const activeSubscription = subscriptions.find(sub =>
            sub.status === 'active' || sub.status === 'trialing'
        );

        if (activeSubscription) {
            console.log(`[MANUAL SYNC] Found active subscription: ${activeSubscription.id}`);
            await updateUserSubscription(user.email, activeSubscription, 'manual_sync');

            // Return updated user data
            const updatedUser = await DatabaseManager.findUserByEmail(req.user.email);
            res.json({
                success: true,
                message: 'Subscription synchronized successfully',
                subscription: updatedUser.subscription
            });
        } else {
            console.log(`[MANUAL SYNC] No active subscription found`);
            res.json({
                success: false,
                message: 'No active subscription found in Stripe',
                subscriptions: subscriptions.map(sub => ({
                    id: sub.id,
                    status: sub.status,
                    created: sub.created
                }))
            });
        }
    } catch (error) {
        console.error('[ERROR] Manual subscription verification failed:', error);
        res.status(500).json({ error: 'Failed to verify subscription' });
    }
});

// Cancel Subscription
app.post("/api/cancel-subscription", authenticateToken, async (req, res) => {
    try {
        const user = await DatabaseManager.findUserByEmail(req.user.email);

        if (!user || !user.subscription?.stripeSubscriptionId) {
            return res.status(400).json({ error: 'No active subscription found' });
        }

        const subscription = await stripe.subscriptions.update(
            user.subscription.stripeSubscriptionId,
            { cancel_at_period_end: true }
        );

        await DatabaseManager.updateUser(req.user.email, {
            'subscription.cancelAtPeriodEnd': true
        });

        res.json({
            success: true,
            message: 'Subscription will be canceled at the end of the billing period',
            endDate: new Date(subscription.current_period_end * 1000)
        });
    } catch (error) {
        console.error('[ERROR] Failed to cancel subscription:', error);
        res.status(500).json({ error: 'Failed to cancel subscription' });
    }
});

// Get Billing History
app.get("/api/billing-history", authenticateToken, async (req, res) => {
    try {
        const user = await DatabaseManager.findUserByEmail(req.user.email);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        let customerId = user.subscription?.stripeCustomerId;

        // If no customer ID, try to find customer by email
        if (!customerId) {
            try {
                const customers = await stripe.customers.list({
                    email: user.email,
                    limit: 1
                });

                if (customers.data.length > 0) {
                    customerId = customers.data[0].id;
                }
            } catch (error) {
                console.log('[BILLING] No customer found in Stripe');
            }
        }

        if (!customerId) {
            return res.json({
                invoices: [],
                total: 0,
                message: 'No billing history found'
            });
        }

        // Get invoices for this customer
        const invoices = await stripe.invoices.list({
            customer: customerId,
            limit: 50,
            expand: ['data.subscription', 'data.payment_intent']
        });

        // Format invoice data for frontend
        const formattedInvoices = invoices.data.map(invoice => ({
            id: invoice.id,
            amount: invoice.amount_paid,
            currency: invoice.currency,
            status: invoice.status,
            date: new Date(invoice.created * 1000),
            dueDate: invoice.due_date ? new Date(invoice.due_date * 1000) : null,
            paidDate: invoice.status_transitions.paid_at ? new Date(invoice.status_transitions.paid_at * 1000) : null,
            description: invoice.lines.data[0]?.description || 'Subscription payment',
            invoiceUrl: invoice.hosted_invoice_url,
            receiptUrl: invoice.receipt_number,
            subscriptionId: invoice.subscription,
            paymentStatus: invoice.payment_intent?.status || 'unknown',
            period: {
                start: invoice.lines.data[0]?.period?.start ? new Date(invoice.lines.data[0].period.start * 1000) : null,
                end: invoice.lines.data[0]?.period?.end ? new Date(invoice.lines.data[0].period.end * 1000) : null
            }
        }));

        // Calculate total paid
        const totalPaid = invoices.data
            .filter(invoice => invoice.status === 'paid')
            .reduce((sum, invoice) => sum + invoice.amount_paid, 0);

        res.json({
            invoices: formattedInvoices,
            total: formattedInvoices.length,
            totalPaid: totalPaid,
            currency: invoices.data[0]?.currency || 'usd'
        });

    } catch (error) {
        console.error('[ERROR] Failed to get billing history:', error);
        res.status(500).json({ error: 'Failed to retrieve billing history' });
    }
});

// Get User Profile (also available at /api/user/profile)
app.get("/api/user-profile", authenticateToken, async (req, res) => {
    try {
        const user = await DatabaseManager.findUserByEmail(req.user.email);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            id: user.id,
            email: user.email,
            name: user.name,
            picture: user.picture,
            createdAt: user.createdAt,
            lastLogin: user.lastLogin,
            provider: user.provider,
            emailVerified: user.emailVerified,
            subscription: user.subscription || { plan: 'free' },
            preferences: user.preferences || {
                theme: 'dark',
                notifications: true,
                language: 'en'
            }
        });
    } catch (error) {
        console.error('[ERROR] Failed to get user profile:', error);
        res.status(500).json({ error: 'Failed to retrieve user profile' });
    }
});

// Alias for user profile (used by auth.js)
app.get("/api/user/profile", authenticateToken, async (req, res) => {
    try {
        const user = await DatabaseManager.findUserByEmail(req.user.email);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            id: user.id,
            email: user.email,
            name: user.name,
            picture: user.picture,
            createdAt: user.createdAt,
            lastLogin: user.lastLogin,
            provider: user.provider,
            emailVerified: user.emailVerified,
            subscription: user.subscription || { plan: 'free' },
            preferences: user.preferences || {
                theme: 'dark',
                notifications: true,
                language: 'en'
            }
        });
    } catch (error) {
        console.error('[ERROR] Failed to get user profile:', error);
        res.status(500).json({ error: 'Failed to retrieve user profile' });
    }
});

// Update User Profile
app.put("/api/user-profile", authenticateToken, async (req, res) => {
    try {
        const { name, picture, preferences } = req.body;
        const user = await DatabaseManager.findUserByEmail(req.user.email);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const updateData = {};

        // Update name if provided
        if (name && name.trim() && name !== user.name) {
            updateData.name = name.trim();
        }

        // Update picture if provided
        if (picture !== undefined && picture !== user.picture) {
            updateData.picture = picture;
        }

        // Update preferences if provided
        if (preferences && typeof preferences === 'object') {
            updateData.preferences = {
                ...user.preferences,
                ...preferences
            };
        }

        if (Object.keys(updateData).length === 0) {
            return res.json({
                success: true,
                message: 'No changes to update',
                user: {
                    name: user.name,
                    picture: user.picture,
                    preferences: user.preferences
                }
            });
        }

        await DatabaseManager.updateUser(req.user.email, updateData);

        res.json({
            success: true,
            message: 'Profile updated successfully',
            user: {
                name: updateData.name || user.name,
                picture: updateData.picture !== undefined ? updateData.picture : user.picture,
                preferences: updateData.preferences || user.preferences
            }
        });

    } catch (error) {
        console.error('[ERROR] Failed to update user profile:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// Get User Preferences
app.get("/api/user-preferences", authenticateToken, async (req, res) => {
    try {
        const user = await DatabaseManager.findUserByEmail(req.user.email);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const defaultPreferences = {
            theme: 'dark',
            notifications: true,
            language: 'en',
            emailNotifications: true,
            marketingEmails: false
        };

        res.json({
            preferences: {
                ...defaultPreferences,
                ...user.preferences
            }
        });
    } catch (error) {
        console.error('[ERROR] Failed to get user preferences:', error);
        res.status(500).json({ error: 'Failed to retrieve preferences' });
    }
});

// Update User Preferences
app.put("/api/user-preferences", authenticateToken, async (req, res) => {
    try {
        const { preferences } = req.body;

        if (!preferences || typeof preferences !== 'object') {
            return res.status(400).json({ error: 'Invalid preferences data' });
        }

        const user = await DatabaseManager.findUserByEmail(req.user.email);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const updatedPreferences = {
            ...user.preferences,
            ...preferences
        };

        await DatabaseManager.updateUser(req.user.email, {
            preferences: updatedPreferences
        });

        res.json({
            success: true,
            message: 'Preferences updated successfully',
            preferences: updatedPreferences
        });

    } catch (error) {
        console.error('[ERROR] Failed to update user preferences:', error);
        res.status(500).json({ error: 'Failed to update preferences' });
    }
});

// Contact Support
app.post("/api/contact-support", authenticateToken, async (req, res) => {
    try {
        const { subject, message, category, priority } = req.body;

        if (!subject || !message) {
            return res.status(400).json({ error: 'Subject and message are required' });
        }

        const user = await DatabaseManager.findUserByEmail(req.user.email);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Create support ticket ID
        const ticketId = `TICKET-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Email content for support team
        const supportEmail = {
            from: process.env.EMAIL_FROM,
            to: process.env.EMAIL_FROM, // Send to support team
            subject: `[Support] ${subject} - ${ticketId}`,
            html: `
                <h2>New Support Ticket</h2>
                <p><strong>Ticket ID:</strong> ${ticketId}</p>
                <p><strong>User:</strong> ${user.name} (${user.email})</p>
                <p><strong>Category:</strong> ${category || 'General'}</p>
                <p><strong>Priority:</strong> ${priority || 'Normal'}</p>
                <p><strong>Subject:</strong> ${subject}</p>

                <h3>Message:</h3>
                <div style="background: #f5f5f5; padding: 15px; border-radius: 5px;">
                    ${message.replace(/\n/g, '<br>')}
                </div>

                <h3>User Details:</h3>
                <ul>
                    <li>Subscription Plan: ${user.subscription?.plan || 'free'}</li>
                    <li>Subscription Status: ${user.subscription?.status || 'N/A'}</li>
                    <li>Account Created: ${user.createdAt}</li>
                    <li>Last Login: ${user.lastLogin}</li>
                </ul>
            `
        };

        // Send email to support team
        const emailService = (await import('./services/email.js')).default;
        await emailService.sendEmail(supportEmail);

        // Send confirmation email to user
        const confirmationEmail = {
            from: process.env.EMAIL_FROM,
            to: user.email,
            subject: `Support Ticket Created - ${ticketId}`,
            html: `
                <h2>Support Ticket Created</h2>
                <p>Hi ${user.name},</p>
                <p>Thank you for contacting our support team. We've received your message and will get back to you as soon as possible.</p>

                <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <p><strong>Ticket ID:</strong> ${ticketId}</p>
                    <p><strong>Subject:</strong> ${subject}</p>
                    <p><strong>Priority:</strong> ${priority || 'Normal'}</p>
                </div>

                <p>Our support team typically responds within 24-48 hours for standard inquiries, or within 4-6 hours for urgent matters.</p>

                <p>Best regards,<br>RoAssistant Support Team</p>
            `
        };

        await emailService.sendEmail(confirmationEmail);

        res.json({
            success: true,
            ticketId: ticketId,
            message: 'Support ticket created successfully. You will receive a confirmation email shortly.'
        });

    } catch (error) {
        console.error('[ERROR] Failed to create support ticket:', error);
        res.status(500).json({ error: 'Failed to create support ticket. Please try again.' });
    }
});

// Debug endpoint to check current user subscription
app.get("/api/debug-user-subscription", authenticateToken, async (req, res) => {
    try {
        const user = await DatabaseManager.findUserByEmail(req.user.email);
        if (!user) {
            return res.json({ error: 'User not found' });
        }

        console.log(`[DEBUG] Current user subscription for ${req.user.email}:`, JSON.stringify(user.subscription, null, 2));

        res.json({
            email: user.email,
            subscription: user.subscription,
            currentPlan: user.subscription?.plan || 'free',
            availableModels: SUBSCRIPTION_PLANS[user.subscription?.plan || 'free']?.limits?.models || ['gpt-4o-mini']
        });
    } catch (error) {
        console.error('[DEBUG] Error checking user subscription:', error);
        res.status(500).json({ error: error.message });
    }
});

// Debug endpoint to test subscription sync
app.get("/api/debug-subscription/:email", async (req, res) => {
    try {
        const { email } = req.params;
        console.log(`[DEBUG] Testing subscription for ${email}`);

        const user = await DatabaseManager.findUserByEmail(email);
        if (!user) {
            return res.json({ error: 'User not found' });
        }

        console.log(`[DEBUG] Current user subscription:`, user.subscription);

        // Check Stripe for subscriptions
        let customerId = user.subscription?.stripeCustomerId;
        console.log(`[DEBUG] Customer ID from DB: ${customerId}`);

        if (!customerId) {
            const customers = await stripe.customers.list({
                email: email,
                limit: 1
            });
            console.log(`[DEBUG] Found ${customers.data.length} customers in Stripe`);
            if (customers.data.length > 0) {
                customerId = customers.data[0].id;
                console.log(`[DEBUG] Found customer ID: ${customerId}`);
            }
        }

        if (customerId) {
            const subscriptions = await stripe.subscriptions.list({
                customer: customerId,
                status: 'all',
                limit: 10
            });

            console.log(`[DEBUG] Found ${subscriptions.data.length} subscriptions`);

            const debugData = {
                user: {
                    email: user.email,
                    currentPlan: user.subscription?.plan || 'free',
                    stripeCustomerId: user.subscription?.stripeCustomerId
                },
                stripe: {
                    customerId,
                    subscriptions: subscriptions.data.map(sub => ({
                        id: sub.id,
                        status: sub.status,
                        priceId: sub.items.data[0]?.price.id,
                        planName: sub.items.data[0]?.price.nickname || 'Unknown'
                    }))
                },
                environment: {
                    proMonthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
                    proAnnual: process.env.STRIPE_PRO_ANNUAL_PRICE_ID,
                    enterpriseMonthly: process.env.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID,
                    enterpriseAnnual: process.env.STRIPE_ENTERPRISE_ANNUAL_PRICE_ID
                }
            };

            return res.json(debugData);
        }

        res.json({ error: 'No customer found in Stripe', user: user.email });

    } catch (error) {
        console.error('[DEBUG] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get available subscription plans
app.get("/api/subscription-plans", (req, res) => {
    res.json(SUBSCRIPTION_PLANS);
});

// FIXED: Enhanced signup with proper email verification
app.post("/auth/signup", async (req, res) => {
    console.log('[SIGNUP] Endpoint hit, processing request...');
    console.log('[SIGNUP] Request body:', JSON.stringify(req.body));

    try {
        const { email, password, name, recaptchaToken } = req.body;

        console.log(`[SIGNUP] Attempt for: ${email}`);

        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Name, email and password are required' });
        }

        // Verify reCAPTCHA v2
        const recaptchaResult = await verifyRecaptcha(recaptchaToken);
        if (!recaptchaResult.success) {
            console.log('[SIGNUP] reCAPTCHA verification failed:', recaptchaResult.error);
            return res.status(400).json({ error: recaptchaResult.error });
        }
        console.log('[SIGNUP] ✅ reCAPTCHA v2 verification passed');

        // reCAPTCHA v2 verified (no score tracking needed)

        if (name.trim().length < 2) {
            return res.status(400).json({ error: 'Name must be at least 2 characters long' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters long' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Please enter a valid email address' });
        }

        const existingUser = await DatabaseManager.findUserByEmail(email);
        if (existingUser) {
            console.log(`[SIGNUP] Account already exists for: ${email}`);
            return res.status(400).json({ error: 'An account with this email already exists' });
        }

        // FIXED: Check if Resend is in testing mode or email service unavailable
        console.log('[DEBUG] emailServiceAvailable status:', emailServiceAvailable);
        if (!emailServiceAvailable) {
            console.log('[SIGNUP] Email not configured, creating account directly');
            // If email not configured, create account directly
            const hashedPassword = await bcrypt.hash(password, 10);
            const userData = {
                id: Date.now().toString(),
                email: email,
                password: hashedPassword,
                name: name,
                createdAt: new Date(),
                provider: 'email',
                emailVerified: false, // Mark as not verified
                lastLogin: new Date(),
                subscription: { plan: 'free', status: 'active' },
                chats: [], // FIXED: Initialize user-specific chats
                scripts: [] // FIXED: Initialize user-specific scripts
            };

            const user = await DatabaseManager.createUser(userData);
            console.log(`[SIGNUP] Account created successfully for: ${email}`);

            const token = jwt.sign(
                { id: user.id, email: user.email },
                JWT_SECRET,
                { expiresIn: '7d' }
            );

            console.log(`[SIGNUP] JWT token generated for: ${email}`);
            return res.json({
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    createdAt: user.createdAt,
                    subscription: user.subscription
                },
                message: 'Account created successfully! (Email verification temporarily disabled)'
            });
        }

        // Check for existing pending verification
        const existing = await DatabaseManager.findPendingVerification(email);
        if (existing) {
            const timeSinceLastRequest = Date.now() - existing.timestamp.getTime();

            if (timeSinceLastRequest < 60000) {
                const waitTime = Math.ceil((60000 - timeSinceLastRequest) / 1000);
                return res.status(429).json({
                    error: `Please wait ${waitTime} seconds before requesting another verification code.`,
                    retryAfter: waitTime
                });
            }
        }

        const verificationCode = generateVerificationCode();
        const hashedPassword = await bcrypt.hash(password, 10);

        await DatabaseManager.createPendingVerification({
            email,
            password: hashedPassword,
            name,
            verificationCode,
            timestamp: new Date(),
            expires: new Date(Date.now() + (15 * 60 * 1000)), // 15 minutes
            attempts: 0
        });

        try {
            await sendVerificationEmail(email, verificationCode, name);
            
            res.json({
                message: 'Verification code sent to your email. Please check your inbox and spam folder.',
                email: email,
                requiresVerification: true,
                expiresIn: '15 minutes'
            });

        } catch (emailError) {
            console.error('[ERROR] Email sending failed:', emailError.message);
            pendingVerifications.delete(email);
            
            res.status(500).json({ 
                error: 'Failed to send verification email. Please try again later.',
                emailError: emailError.message
            });
        }

    } catch (error) {
        console.error("[ERROR] Signup error:", error);
        console.error("[ERROR] Stack trace:", error.stack);
        res.status(500).json({ 
            error: 'Internal server error occurred during signup',
            details: error.message,
            stack: error.stack
        });
    }
});

// FIXED: Email verification endpoint
app.post("/auth/verify-email", async (req, res) => {
    try {
        const { email, verificationCode } = req.body;

        if (!email || !verificationCode) {
            return res.status(400).json({ error: 'Email and verification code are required' });
        }

        if (!/^\d{6}$/.test(verificationCode)) {
            return res.status(400).json({ error: 'Verification code must be 6 digits' });
        }

        const pendingVerification = await DatabaseManager.findPendingVerification(email);

        if (!pendingVerification) {
            return res.status(400).json({
                error: 'No pending verification found for this email. Please sign up again.',
                action: 'signup_required'
            });
        }

        if (Date.now() > pendingVerification.expires.getTime()) {
            await DatabaseManager.deletePendingVerification(email);
            return res.status(400).json({ 
                error: 'Verification code has expired. Please sign up again.',
                action: 'signup_required'
            });
        }

        pendingVerification.attempts = (pendingVerification.attempts || 0) + 1;
        
        if (pendingVerification.attempts > 5) {
            pendingVerifications.delete(email);
            return res.status(429).json({ 
                error: 'Too many failed attempts. Please sign up again.',
                action: 'signup_required'
            });
        }

        if (pendingVerification.verificationCode !== verificationCode) {
            return res.status(400).json({ 
                error: `Invalid verification code. ${5 - pendingVerification.attempts} attempts remaining.`,
                attemptsRemaining: 5 - pendingVerification.attempts
            });
        }

        // FIXED: Create user with proper structure
        const userData = {
            id: Date.now().toString(),
            email: pendingVerification.email,
            password: pendingVerification.password,
            name: pendingVerification.name,
            createdAt: new Date(),
            provider: 'email',
            emailVerified: true,
            lastLogin: new Date(),
            subscription: { plan: 'free', status: 'active' },
            chats: [], // FIXED: Initialize user-specific chats
            scripts: [] // FIXED: Initialize user-specific scripts
        };

        const user = await DatabaseManager.createUser(userData);
        await DatabaseManager.deletePendingVerification(email);

        const token = jwt.sign(
            { id: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                createdAt: user.createdAt,
                emailVerified: user.emailVerified,
                subscription: user.subscription
            },
            message: 'Account created and verified successfully! Welcome to RoAssistant!'
        });

    } catch (error) {
        console.error("[ERROR] Email verification error:", error);
        res.status(500).json({ error: 'Internal server error during email verification' });
    }
});

app.post("/auth/resend-verification", async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email address is required' });
        }

        const pendingVerification = pendingVerifications.get(email);

        if (!pendingVerification) {
            return res.status(400).json({ 
                error: 'No pending verification found for this email. Please sign up again.',
                action: 'signup_required'
            });
        }

        const timeSinceLastRequest = Date.now() - pendingVerification.timestamp;
        if (timeSinceLastRequest < 60000) {
            const waitTime = Math.ceil((60000 - timeSinceLastRequest) / 1000);
            return res.status(429).json({ 
                error: `Please wait ${waitTime} seconds before requesting another verification code.`,
                retryAfter: waitTime
            });
        }

        if (!emailServiceAvailable) {
            return res.status(503).json({ 
                error: 'Email system is not available. Please try again later.' 
            });
        }

        const verificationCode = generateVerificationCode();
        
        pendingVerification.verificationCode = verificationCode;
        pendingVerification.timestamp = Date.now();
        pendingVerification.expires = Date.now() + (15 * 60 * 1000);
        pendingVerification.attempts = 0;

        try {
            await sendVerificationEmail(email, verificationCode, pendingVerification.name);
            
            res.json({
                message: 'New verification code sent to your email.',
                expiresIn: '15 minutes'
            });

        } catch (emailError) {
            console.error('[ERROR] Failed to resend verification email:', emailError.message);
            res.status(500).json({ 
                error: 'Failed to send verification email. Please try again later.' 
            });
        }

    } catch (error) {
        console.error("[ERROR] Resend verification error:", error);
        res.status(500).json({ error: 'Internal server error during resend' });
    }
});

app.post("/auth/login", async (req, res) => {
    try {
        const { email, password, recaptchaToken } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        // Verify reCAPTCHA v2
        const recaptchaResult = await verifyRecaptcha(recaptchaToken);
        if (!recaptchaResult.success) {
            console.log('[LOGIN] reCAPTCHA verification failed:', recaptchaResult.error);
            return res.status(400).json({ error: recaptchaResult.error });
        }
        console.log('[LOGIN] ✅ reCAPTCHA v2 verification passed');

        // reCAPTCHA v2 verified (no score tracking needed)

        const user = await DatabaseManager.findUserByEmail(email);
        if (!user) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }

        // Update last login (no score tracking for reCAPTCHA v2)
        await DatabaseManager.updateUser(email, {
            lastLogin: new Date()
        });

        const token = jwt.sign(
            { id: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                createdAt: user.createdAt,
                emailVerified: user.emailVerified,
                subscription: user.subscription || { plan: 'free', status: 'active' }
            }
        });
    } catch (error) {
        console.error("[ERROR] Login error:", error);
        res.status(500).json({ error: 'Internal server error during login' });
    }
});

app.get("/auth/verify", authenticateToken, async (req, res) => {
    const user = await DatabaseManager.findUserByEmail(req.user.email);
    res.json({
        valid: true,
        user: {
            ...req.user,
            subscription: user?.subscription || { plan: 'free', status: 'active' }
        }
    });
});

// FIXED: New endpoints for user-specific chats and scripts
app.get("/api/user-chats", authenticateToken, async (req, res) => {
    try {
        const user = await DatabaseManager.findUserByEmail(req.user.email);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            chats: user.chats || [],
            total: (user.chats || []).length
        });
    } catch (error) {
        console.error('[ERROR] Failed to get user chats:', error);
        res.status(500).json({ error: 'Failed to retrieve chats' });
    }
});

app.post("/api/user-chats", authenticateToken, async (req, res) => {
    try {
        const user = await DatabaseManager.findUserByEmail(req.user.email);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const { chat } = req.body;
        if (!chat) {
            return res.status(400).json({ error: 'Chat data is required' });
        }

        await DatabaseManager.updateUser(req.user.email, {
            $push: { chats: chat }
        });

        res.json({
            success: true,
            message: 'Chat saved successfully',
            chat: chat
        });
    } catch (error) {
        console.error('[ERROR] Failed to save chat:', error);
        res.status(500).json({ error: 'Failed to save chat' });
    }
});

app.put("/api/user-chats/:chatId", authenticateToken, async (req, res) => {
    try {
        const user = await DatabaseManager.findUserByEmail(req.user.email);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const { chatId } = req.params;
        const { chat } = req.body;

        if (!user.chats) user.chats = [];

        const chatIndex = user.chats.findIndex(c => c.id === chatId);
        if (chatIndex === -1) {
            return res.status(404).json({ error: 'Chat not found' });
        }

        user.chats[chatIndex] = { ...user.chats[chatIndex], ...chat };
        await DatabaseManager.updateUser(req.user.email, { chats: user.chats });

        res.json({ 
            success: true, 
            message: 'Chat updated successfully',
            chat: user.chats[chatIndex]
        });
    } catch (error) {
        console.error('[ERROR] Failed to update chat:', error);
        res.status(500).json({ error: 'Failed to update chat' });
    }
});

app.delete("/api/user-chats/:chatId", authenticateToken, async (req, res) => {
    try {
        const user = await DatabaseManager.findUserByEmail(req.user.email);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const { chatId } = req.params;

        if (!user.chats) user.chats = [];

        const chatIndex = user.chats.findIndex(c => c.id === chatId);
        if (chatIndex === -1) {
            return res.status(404).json({ error: 'Chat not found' });
        }

        user.chats.splice(chatIndex, 1);
        await DatabaseManager.updateUser(req.user.email, { chats: user.chats });

        res.json({ 
            success: true, 
            message: 'Chat deleted successfully'
        });
    } catch (error) {
        console.error('[ERROR] Failed to delete chat:', error);
        res.status(500).json({ error: 'Failed to delete chat' });
    }
});

// Generate chat title from first message
app.post("/api/generate-chat-title", optionalAuthenticateToken, async (req, res) => {
    try {
        const { message } = req.body;

        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // Truncate very long messages to avoid token limits
        const truncatedMessage = message.length > 300 ? message.substring(0, 300) + '...' : message;

        const titlePrompt = `Generate a concise, descriptive title (2-6 words) for a chat that starts with this user message: "${truncatedMessage}"

Requirements:
- Keep it short and clear (2-6 words maximum)
- Capture the main topic or question
- Make it suitable for a chat history list
- Don't include quotes or special characters
- Use title case

Examples:
User: "How do I create a Roblox game?" → Title: "Creating Roblox Games"
User: "What's the best way to learn Luau scripting?" → Title: "Learning Luau Scripting"
User: "I need help with a bug in my code" → Title: "Debugging Code Issues"
User: "Can you explain how DataStores work?" → Title: "DataStore Explanation"

Generate only the title, nothing else:`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini", // Use gpt-4o-mini for title generation
            messages: [
                { role: "user", content: titlePrompt }
            ],
            max_tokens: 20,
            temperature: 0.3 // Lower temperature for more consistent titles
        });

        let title = response.choices[0].message.content.trim();

        // Clean up the title
        title = title.replace(/[""'']/g, ''); // Remove quotes
        title = title.replace(/[^\w\s\-]/g, ''); // Remove special characters except hyphens
        title = title.trim();

        // Fallback if title is empty or too long
        if (!title || title.length === 0) {
            title = 'New Chat';
        } else if (title.length > 50) {
            title = title.substring(0, 47) + '...';
        }

        res.json({ title: title });
    } catch (error) {
        console.error('[ERROR] Failed to generate chat title:', error);
        // Return fallback title on error
        res.json({ title: 'New Chat' });
    }
});

app.get("/usage-limits", optionalAuthenticateToken, (req, res) => {
    const userIdentifier = getUserIdentifier(req);
    const isAuthenticated = req.user !== null;
    
    const limits = {};
    
    Object.entries(USAGE_LIMITS).forEach(([model, config]) => {
        const limitCheck = checkUsageLimit(userIdentifier, model);
        limits[model] = {
            dailyLimit: config.dailyLimit,
            hourlyLimit: config.hourlyLimit,
            dailyUsed: limitCheck.limitsInfo ? limitCheck.limitsInfo.dailyUsed : 0,
            hourlyUsed: limitCheck.limitsInfo ? limitCheck.limitsInfo.hourlyUsed : 0,
            dailyRemaining: config.dailyLimit - (limitCheck.limitsInfo ? limitCheck.limitsInfo.dailyUsed : 0),
            hourlyRemaining: config.hourlyLimit - (limitCheck.limitsInfo ? limitCheck.limitsInfo.hourlyUsed : 0),
            description: config.description,
            cost: config.cost
        };
    });
    
    res.json({
        type: isAuthenticated ? "authenticated" : "guest",
        limits: limits,
        message: isAuthenticated ? 
            "Access based on your subscription plan" :
            "Sign up for access to more models",
        upgradeIncentive: isAuthenticated ? null : {
            unlimited: true,
            noWaiting: true,
            priority: true,
            features: ["Unlimited Usage", "All Models", "Priority Support"]
        }
    });
});

app.post("/ask", optionalAuthenticateToken, checkUsageLimits, async (req, res) => {
    try {
        const { prompt, model = "gpt-4.1" } = req.body;
        const isAuthenticated = req.user !== null;

        // Check if authenticated user can use this model
        if (isAuthenticated) {
            const user = await DatabaseManager.findUserByEmail(req.user.email);
            const subscription = getUserSubscription(user);

            if (!subscription.limits.models.includes(model)) {
                return res.status(403).json({
                    error: `Model ${model} requires a higher subscription plan.`,
                    availableModels: subscription.limits.models,
                    subscription: subscription,
                    upgradeUrl: "/pricing.html"
                });
            }

            // Check comprehensive usage limits
            const limitCheck = checkAuthenticatedUserLimits(user, subscription, model);
            if (!limitCheck.allowed) {
                return res.status(403).json({
                    error: limitCheck.error,
                    upgradeUrl: limitCheck.upgradeUrl || "/pricing.html",
                    resetTime: limitCheck.resetTime,
                    subscription: subscription
                });
            }
        }

        const config = MODEL_CONFIGS[model];
        if (!config) {
            return res.status(400).json({ error: "Invalid model selected" });
        }

        let response;
        let reply;

        const systemPrompt = getSystemPrompt(model);
        console.log(`[DEBUG] Model: ${model}, Provider: ${config.provider}`);
        console.log(`[DEBUG] System prompt starts with: ${systemPrompt.substring(0, 100)}...`);

        let inputTokens = 0;
        let outputTokens = 0;
        let totalTokens = 0;

        if (config.provider === 'anthropic') {
            // Use Claude/Anthropic API
            response = await anthropic.messages.create({
                model: config.model,
                max_tokens: 2000,
                temperature: 0.7,
                system: systemPrompt,
                messages: [
                    { role: "user", content: prompt }
                ]
            });
            reply = response.content[0].text;

            // Extract token usage from Anthropic response
            if (response.usage) {
                inputTokens = response.usage.input_tokens || 0;
                outputTokens = response.usage.output_tokens || 0;
                totalTokens = inputTokens + outputTokens;
                console.log(`[TOKENS] Anthropic - Input: ${inputTokens}, Output: ${outputTokens}, Total: ${totalTokens}`);
            }
        } else {
            // Use OpenAI API
            response = await openai.chat.completions.create({
                model: config.model,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: prompt }
                ],
                max_tokens: 2000,
                temperature: 0.7
            });
            reply = response.choices[0].message.content;

            // Extract token usage from OpenAI response
            if (response.usage) {
                inputTokens = response.usage.prompt_tokens || 0;
                outputTokens = response.usage.completion_tokens || 0;
                totalTokens = response.usage.total_tokens || 0;
                console.log(`[TOKENS] OpenAI - Input: ${inputTokens}, Output: ${outputTokens}, Total: ${totalTokens}`);
            }
        }

        const userIdentifier = getUserIdentifier(req);
        const startTime = Date.now();

        // Log chat to database
        try {
            const chatLogData = {
                userId: isAuthenticated ? req.user.id : 'guest',
                userEmail: isAuthenticated ? req.user.email : 'guest',
                userName: isAuthenticated ? (await DatabaseManager.findUserByEmail(req.user.email))?.name || 'Unknown' : 'Guest User',
                message: prompt,
                response: reply,
                model: model,
                tokenCount: totalTokens || Math.ceil(reply.length / 4), // Use actual tokens or approximate
                inputTokens: inputTokens,
                outputTokens: outputTokens,
                responseTime: Date.now() - startTime,
                timestamp: new Date(),
                ip: req.ip,
                userAgent: req.headers['user-agent'],
                subscription: isAuthenticated ?
                    (await DatabaseManager.findUserByEmail(req.user.email))?.subscription?.plan || 'free' :
                    'guest'
            };

            await DatabaseManager.saveChatLog(chatLogData);

            // Update analytics
            const today = new Date();
            await DatabaseManager.updateAnalytics(today, 'daily', {
                totalMessages: 1
            });
        } catch (logError) {
            console.error('[CHAT LOG] Failed to save chat log:', logError);
            // Continue even if logging fails
        }

        let responseData = {
            reply: reply,
            model: model,
            provider: config.provider,
            tokenUsage: {
                inputTokens: inputTokens,
                outputTokens: outputTokens,
                totalTokens: totalTokens
            }
        };

        if (isAuthenticated) {
            // Increment user usage for authenticated users
            const user = await DatabaseManager.findUserByEmail(req.user.email);
            incrementUserUsage(user);

            // Increment special usage for specific models
            if (model === 'rocode-studio') {
                incrementSpecialUsage(user, model);
            }

            // Track Nexus usage for free users
            const subscription = getUserSubscription(user);
            if (subscription.plan === 'free' && model === 'claude-4-opus') {
                incrementSpecialUsage(user, model);
            }

            // Update user's total messages and token count
            await DatabaseManager.updateUser(req.user.email, {
                $inc: {
                    totalMessages: 1,
                    totalTokens: totalTokens
                },
                lastActive: new Date()
            });

            // Track daily token usage
            const today = new Date().toISOString().split('T')[0];
            const tokenUsageKey = `tokens_${user.id}_${today}`;
            const currentTokenUsage = dailyTokenUsage.get(tokenUsageKey) || 0;
            dailyTokenUsage.set(tokenUsageKey, currentTokenUsage + totalTokens);

            const subscription = getUserSubscription(user);
            responseData.subscription = {
                plan: subscription.plan,
                usage: subscription.usage,
                limits: subscription.limits
            };
        } else {
            const limitCheck = checkUsageLimit(userIdentifier, model);
            responseData.usageInfo = {
                dailyUsed: limitCheck.limitsInfo.dailyUsed,
                dailyLimit: USAGE_LIMITS[model].dailyLimit,
                hourlyUsed: limitCheck.limitsInfo.hourlyUsed,
                hourlyLimit: USAGE_LIMITS[model].hourlyLimit,
                userType: "guest",
                upgradeMessage: limitCheck.limitsInfo.dailyUsed >= USAGE_LIMITS[model].dailyLimit - 1 ?
                    "You're almost out! Sign up for unlimited access." : null
            };
        }

        // Add nexusUsage for free users with RoCode Nexus 3 (after increment)
        if (isAuthenticated) {
            const user = await DatabaseManager.findUserByEmail(req.user.email);
            const userSubscription = getUserSubscription(user);

            if (userSubscription.plan === 'free' && model === 'claude-4-opus') {
                const today = new Date().toISOString().split('T')[0];
                const nexusUsageKey = `nexus_${user.id}_${today}`;
                // Get updated usage after increment
                const currentNexusUsage = dailyOpusUsage.get(nexusUsageKey) || 0;

                responseData.usageInfo = {
                    nexusUsage: currentNexusUsage,
                    nexusLimit: 3
                };
            }
        }

        res.json(responseData);
    } catch (error) {
        console.error("[ERROR] AI Error:", error);

        // Handle both OpenAI and Anthropic errors
        if (error.status === 401) {
            const apiProvider = error.message?.includes('anthropic') || error.name?.includes('Anthropic') ? 'Claude' : 'OpenAI';
            res.status(500).json({ error: `${apiProvider} API key is invalid or expired` });
        } else if (error.status === 429) {
            const apiProvider = error.message?.includes('anthropic') || error.name?.includes('Anthropic') ? 'Claude' : 'OpenAI';
            res.status(500).json({ error: `${apiProvider} API rate limit exceeded. Please try again later.` });
        } else if (error.status === 402) {
            res.status(500).json({ error: "API quota exceeded. Please check your billing." });
        } else {
            res.status(500).json({ error: error.message || "An error occurred while processing your request" });
        }
    }
});

app.get("/models", optionalAuthenticateToken, async (req, res) => {
    const isAuthenticated = req.user !== null;
    const userIdentifier = getUserIdentifier(req);

    let availableModels = []; // No models for guests - require authentication

    if (isAuthenticated) {
        const user = await DatabaseManager.findUserByEmail(req.user.email);
        const subscription = getUserSubscription(user);
        availableModels = subscription.limits.models;
    }
    
    const models = Object.keys(MODEL_CONFIGS).map(key => {
        const modelInfo = {
            name: key,
            model: MODEL_CONFIGS[key].model,
            provider: MODEL_CONFIGS[key].provider,
            requiresAuth: !availableModels.includes(key),
            requiresPlan: MODEL_CONFIGS[key].requiresPlan
        };

        if (!isAuthenticated) {
            const limitCheck = checkUsageLimit(userIdentifier, key);
            const limits = USAGE_LIMITS[key];
            
            modelInfo.limits = {
                dailyUsed: limitCheck.limitsInfo ? limitCheck.limitsInfo.dailyUsed : 0,
                dailyLimit: limits.dailyLimit,
                hourlyUsed: limitCheck.limitsInfo ? limitCheck.limitsInfo.hourlyUsed : 0,
                hourlyLimit: limits.hourlyLimit,
                description: limits.description
            };
        }

        return modelInfo;
    });
    
    res.json({ 
        models,
        isAuthenticated,
        availableModels,
        message: isAuthenticated ? 
            "Access based on your subscription plan" : 
            "Sign up for access to more models"
    });
});

// Clean up expired data periodically
setInterval(() => {
    const now = Date.now();
    
    // Clean up expired verifications
    const expiredVerifications = [];
    for (const [email, verification] of pendingVerifications.entries()) {
        if (now > verification.expires) {
            expiredVerifications.push(email);
        }
    }
    
    expiredVerifications.forEach(email => {
        pendingVerifications.delete(email);
    });
    
    // Clean up old guest usage data
    const oneDay = 24 * 60 * 60 * 1000;
    for (const [userIdentifier, usage] of guestUsage.entries()) {
        usage.hourlyUsage = usage.hourlyUsage.filter(timestamp => now - timestamp < 60 * 60 * 1000);
        usage.dailyUsage = usage.dailyUsage.filter(timestamp => now - timestamp < oneDay);
        
        if (usage.hourlyUsage.length === 0 && usage.dailyUsage.length === 0) {
            guestUsage.delete(userIdentifier);
        } else {
            guestUsage.set(userIdentifier, usage);
        }
    }
}, 60 * 60 * 1000); // Clean up every hour

app.get("/", (req, res) => {
    res.redirect('/index.html');
});

function startServer() {
    console.log('\n[INIT] Starting RoAssistant Server with Subscription System...');
    
    const port = process.env.PORT || 3000;
    const baseUrl = getBaseUrl();
    
    app.listen(port, '0.0.0.0', () => {
        console.log("\n" + "=".repeat(60));
        console.log("[SUCCESS] RoAssistant Server Running");
        console.log(`[PORT] ${port}`);
        console.log(`[BASE_URL] ${baseUrl}`);
        console.log(`[HEALTH] ${baseUrl}/health`);
        console.log(`[EMAIL] ${emailServiceAvailable ? "ENABLED (Resend)" : "DISABLED"}`);
        console.log(`[STRIPE] ${process.env.STRIPE_SECRET_KEY ? "CONFIGURED" : "NOT CONFIGURED"}`);
        
        if (emailServiceAvailable) {
            console.log('[EMAIL] ✅ Resend email service is working!');
            console.log('[EMAIL] From address:', process.env.EMAIL_FROM || 'onboarding@resend.dev');
        } else {
            console.log('[EMAIL] ❌ To enable email verification with Resend:');
            console.log('   1. Sign up at https://resend.com (free tier: 3,000 emails/month)');
            console.log('   2. Get your API key from the dashboard');
            console.log('   3. Add it to your .env file as RESEND_API_KEY=re_...');
            console.log('   4. (Optional) Add and verify your domain at https://resend.com/domains');
            console.log('   5. Set EMAIL_FROM to your verified domain email or use onboarding@resend.dev');
        }
        
        if (process.env.RAILWAY_STATIC_URL) {
            console.log(`[RAILWAY] https://${process.env.RAILWAY_STATIC_URL}`);
        }
        
        console.log("\n[SUBSCRIPTION PLANS]:");
        Object.entries(SUBSCRIPTION_PLANS).forEach(([plan, config]) => {
            const limit = config.limits.daily_messages === -1 ? 'Unlimited' : config.limits.daily_messages;
            console.log(`   ${plan.toUpperCase()}: ${limit} messages/day, ${config.limits.models.length} models`);
        });
        
        console.log("\n[USAGE LIMITS] (Guests Only):");
        Object.entries(USAGE_LIMITS).forEach(([model, limits]) => {
            const provider = MODEL_CONFIGS[model]?.provider || 'unknown';
            console.log(`   ${model} (${provider}): ${limits.dailyLimit}/day, ${limits.hourlyLimit}/hour`);
        });
        
        console.log("\n[GOOGLE OAUTH]");
        console.log(`   Client ID: ${process.env.GOOGLE_CLIENT_ID ? 'CONFIGURED' : 'MISSING'}`);
        console.log(`   Client Secret: ${process.env.GOOGLE_CLIENT_SECRET ? 'CONFIGURED' : 'MISSING'}`);
        console.log(`   Redirect URI: ${baseUrl}/auth/google/callback`);
        
        console.log("=".repeat(60) + "\n");
    });
}

startServer();