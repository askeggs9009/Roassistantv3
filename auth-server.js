import express from "express";
import OpenAI from "openai";
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

const require = createRequire(import.meta.url);

let nodemailer = null;
try {
    nodemailer = require('nodemailer');
    console.log('[SUCCESS] Nodemailer imported successfully');
} catch (error) {
    console.log('[ERROR] Failed to import nodemailer:', error.message);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();

// Enhanced CORS configuration to fix OAuth issues
app.use(cors({
    origin: [
        'https://musical-youtiao-b05928.netlify.app',
        'http://localhost:3000',
        'http://localhost:5000',
        'http://127.0.0.1:5500',
        process.env.FRONTEND_URL
    ].filter(Boolean),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json());
app.use(express.static(__dirname));

// Trust proxy for accurate IP detection
app.set('trust proxy', 1);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';
const users = new Map();
const pendingVerifications = new Map();

// Subscription Plans Configuration
const SUBSCRIPTION_PLANS = {
    free: {
        name: 'Free',
        limits: {
            daily_messages: 10,
            models: ['gpt-4o-mini'],
            max_file_size: 1048576, // 1MB
            scripts_storage: 5,
            projects: 0,
            support: 'community'
        },
        features: ['Basic AI assistant', 'Limited daily messages', 'Community support']
    },
    pro: {
        name: 'Pro',
        limits: {
            daily_messages: 500,
            models: ['gpt-4o-mini', 'gpt-4.1'],
            max_file_size: 10485760, // 10MB
            scripts_storage: -1, // unlimited
            projects: 5,
            support: 'email'
        },
        stripe_price_ids: {
            monthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
            annual: process.env.STRIPE_PRO_ANNUAL_PRICE_ID
        },
        features: ['Advanced AI models', '500 messages/day', 'Priority support', 'No ads']
    },
    enterprise: {
        name: 'Enterprise',
        limits: {
            daily_messages: -1, // unlimited
            models: ['gpt-4o-mini', 'gpt-4.1', 'gpt-5'],
            max_file_size: 52428800, // 50MB
            scripts_storage: -1, // unlimited
            projects: -1, // unlimited
            support: 'priority'
        },
        stripe_price_ids: {
            monthly: process.env.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID,
            annual: process.env.STRIPE_ENTERPRISE_ANNUAL_PRICE_ID
        },
        features: ['All AI models', 'Unlimited messages', 'Premium support', 'Custom integrations']
    }
};

// Usage tracking
const userUsage = new Map();
const guestUsage = new Map();
const dailyUsage = new Map();

function getUserPlan(userId) {
    const user = users.get(userId);
    if (!user) return SUBSCRIPTION_PLANS.free;
    
    const plan = user.subscription?.plan || 'free';
    return SUBSCRIPTION_PLANS[plan] || SUBSCRIPTION_PLANS.free;
}

// Reset daily usage at midnight
function resetDailyUsage() {
    dailyUsage.clear();
    console.log('[USAGE] Daily usage reset');
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
    "gpt-4o-mini": {
        dailyLimit: 10,
        hourlyLimit: 5,
        cost: 0.15,
        description: "Basic AI model"
    },
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

// Increment user's daily usage
function incrementUserUsage(user) {
    if (!user) return;
    
    const today = new Date().toISOString().split('T')[0];
    const usageKey = `${user.id}_${today}`;
    const currentUsage = dailyUsage.get(usageKey) || 0;
    dailyUsage.set(usageKey, currentUsage + 1);
    
    console.log(`[USAGE] User ${user.email} usage: ${currentUsage + 1}`);
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
        requiresPlan: 'free'
    },
    "gpt-4.1": {
        model: "gpt-4",
        requiresPlan: 'pro'
    },
    "gpt-5": {
        model: "gpt-4-turbo-preview",
        requiresPlan: 'enterprise'
    }
};

const SYSTEM_PROMPT = `You are a helpful Roblox Luau scripting assistant. You specialize in:

1. Creating Roblox Luau scripts for various game mechanics
2. Debugging existing Roblox code
3. Explaining Roblox Studio concepts and best practices
4. Helping with game development workflows
5. Providing optimized and clean code solutions

When providing code, always use proper Luau syntax and follow Roblox scripting best practices. Include comments to explain complex logic and suggest where scripts should be placed (ServerScriptService, StarterPlayerScripts, etc.).

Be helpful, clear, and provide working examples when possible.`;

function checkUsageLimits(req, res, next) {
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
        const user = users.get(req.user.email);
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

let emailTransporter = null;

// FIXED: Enhanced email transporter initialization with proper Gmail App Password support
async function initializeEmailTransporter() {
    console.log('\n[EMAIL INIT] Initializing Email System...');
    
    if (!nodemailer) {
        console.log('[WARNING] Nodemailer not available!');
        return false;
    }
    
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
        console.log('[WARNING] Email configuration missing - email verification disabled');
        console.log('[INFO] To enable email verification:');
        console.log('  1. Go to https://myaccount.google.com/security');
        console.log('  2. Enable 2-Step Verification');
        console.log('  3. Generate App Password for Mail');
        console.log('  4. Set EMAIL_USER and EMAIL_PASSWORD in .env');
        return false;
    }

    try {
        console.log('[EMAIL] Creating Gmail SMTP transporter...');
        
        // FIXED: Updated to use proper Gmail configuration
        emailTransporter = nodemailer.createTransport({
            service: 'gmail',
            host: 'smtp.gmail.com',
            port: 587,
            secure: false, // Use TLS
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD // Should be App Password, not regular password
            },
            tls: {
                rejectUnauthorized: false
            }
        });

        // Test the connection
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Connection test timeout'));
            }, 10000);

            emailTransporter.verify((error, success) => {
                clearTimeout(timeout);
                if (error) {
                    reject(error);
                } else {
                    resolve(success);
                }
            });
        });
        
        console.log('[SUCCESS] Email system verified and ready!');
        return true;

    } catch (error) {
        console.log('[ERROR] Email system failed:', error.message);
        console.log('[HINT] Make sure you are using a Gmail App Password, not your regular password');
        console.log('[HINT] Generate one at: https://myaccount.google.com/apppasswords');
        emailTransporter = null;
        return false;
    }
}

function generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerificationEmail(email, code, name = null) {
    if (!emailTransporter) {
        throw new Error('Email system not configured.');
    }

    const mailOptions = {
        from: `"Roblox Luau AI" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
        to: email,
        subject: '🔐 Your Verification Code - Roblox Luau AI',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px; border-radius: 10px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #343a40; margin: 0;">Welcome to Roblox Luau AI! 🎮</h1>
                </div>
                
                <div style="background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                    <h2 style="color: #495057; margin-top: 0;">Verify Your Email Address</h2>
                    <p style="color: #6c757d; line-height: 1.5;">
                        Hi ${name || 'there'}! 👋<br><br>
                        Thank you for signing up! To complete your registration, please use the verification code below:
                    </p>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <div style="display: inline-block; background: #007bff; color: white; font-size: 24px; font-weight: bold; padding: 15px 30px; border-radius: 8px; letter-spacing: 3px;">
                            ${code}
                        </div>
                    </div>
                    
                    <p style="color: #6c757d; line-height: 1.5;">
                        This code will expire in <strong>15 minutes</strong>. If you didn't create an account, you can safely ignore this email.
                    </p>
                    
                    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; color: #6c757d; font-size: 14px;">
                        <p>Need help? Contact us at <a href="mailto:${process.env.EMAIL_FROM}" style="color: #007bff;">${process.env.EMAIL_FROM}</a></p>
                    </div>
                </div>
            </div>
        `
    };

    try {
        console.log(`[EMAIL] Sending verification to ${email}...`);
        await emailTransporter.sendMail(mailOptions);
        console.log('[SUCCESS] Verification email sent!');
        return true;
    } catch (error) {
        console.error('[ERROR] Failed to send verification email:', error.message);
        throw error;
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

// FIXED: Stripe Webhook Handler - Now properly handles subscription updates
app.post('/webhook/stripe', express.raw({type: 'application/json'}), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
        console.error('[STRIPE] Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
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
});

// FIXED: Enhanced subscription handling
async function handleSuccessfulSubscription(session) {
    try {
        console.log('[STRIPE] Processing successful subscription...');
        
        const userEmail = session.customer_email || session.customer_details?.email;
        if (!userEmail) {
            console.error('[STRIPE] No customer email found in session');
            return;
        }

        // Find user by email
        let user = null;
        for (const [email, userData] of users.entries()) {
            if (email === userEmail) {
                user = userData;
                break;
            }
        }

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
        
        // Find user by Stripe customer ID
        let userEmail = null;
        for (const [email, user] of users.entries()) {
            if (user.subscription?.stripeCustomerId === subscription.customer) {
                userEmail = email;
                break;
            }
        }

        if (!userEmail) {
            // If we don't have the customer ID stored, try to get it from Stripe
            try {
                const customer = await stripe.customers.retrieve(subscription.customer);
                userEmail = customer.email;
                
                // Find user by email
                if (!users.has(userEmail)) {
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
    const user = users.get(userEmail);
    if (!user) {
        console.error(`[STRIPE] User not found: ${userEmail}`);
        return;
    }

    // Determine plan based on price ID
    let plan = 'free';
    if (subscription.items && subscription.items.data.length > 0) {
        const priceId = subscription.items.data[0].price.id;
        
        if (priceId === process.env.STRIPE_PRO_MONTHLY_PRICE_ID || 
            priceId === process.env.STRIPE_PRO_ANNUAL_PRICE_ID) {
            plan = 'pro';
        } else if (priceId === process.env.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID || 
                   priceId === process.env.STRIPE_ENTERPRISE_ANNUAL_PRICE_ID) {
            plan = 'enterprise';
        }
    }

    // Handle different subscription statuses
    let finalPlan = plan;
    let status = subscription.status;

    if (subscription.status === 'canceled' || subscription.status === 'unpaid' || 
        subscription.status === 'past_due' || eventType === 'customer.subscription.deleted') {
        finalPlan = 'free';
        status = 'canceled';
    } else if (subscription.status === 'active' || subscription.status === 'trialing') {
        status = 'active';
    }

    // Update user subscription
    user.subscription = {
        plan: finalPlan,
        stripeCustomerId: subscription.customer,
        stripeSubscriptionId: subscription.id,
        status: status,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
        updatedAt: new Date()
    };

    users.set(userEmail, user);
    console.log(`[SUBSCRIPTION] User ${userEmail} updated to ${finalPlan} (${status})`);
}

// FIXED: New function to handle payment failures
async function handlePaymentFailure(invoice) {
    try {
        if (invoice.customer_email) {
            const user = users.get(invoice.customer_email);
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
            configured: !!(process.env.EMAIL_USER && process.env.EMAIL_PASSWORD),
            transporter: !!emailTransporter
        },
        stripe: {
            configured: !!process.env.STRIPE_SECRET_KEY,
            webhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET
        },
        subscriptionPlans: Object.keys(SUBSCRIPTION_PLANS),
        activeUsers: users.size,
        activeGuests: guestUsage.size
    });
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
        const frontendUrl = process.env.FRONTEND_URL || 'https://musical-youtiao-b05928.netlify.app';
        res.redirect(`${frontendUrl}/login.html?error=oauth_setup_failed`);
    }
});

app.get("/auth/google/callback", async (req, res) => {
    const frontendUrl = process.env.FRONTEND_URL || 'https://musical-youtiao-b05928.netlify.app';
    
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
        let user = users.get(data.email);
        if (!user) {
            user = {
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
            users.set(data.email, user);
            console.log('[OAUTH] New user created:', data.email);
        } else {
            user.lastLogin = new Date();
            // FIXED: Ensure chats and scripts arrays exist for existing users
            if (!user.chats) user.chats = [];
            if (!user.scripts) user.scripts = [];
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
        const user = users.get(req.user.email);
        
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
        const user = users.get(req.user.email);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const subscription = user.subscription || { plan: 'free', status: 'active' };
        const plan = SUBSCRIPTION_PLANS[subscription.plan] || SUBSCRIPTION_PLANS.free;
        
        // Get current usage
        const today = new Date().toISOString().split('T')[0];
        const usageKey = `${user.id}_${today}`;
        const usage = dailyUsage.get(usageKey) || 0;
        
        res.json({
            plan: subscription.plan,
            status: subscription.status,
            limits: plan.limits,
            usage: {
                daily_messages: usage,
                daily_limit: plan.limits.daily_messages
            },
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd
        });
    } catch (error) {
        console.error('[ERROR] Failed to get subscription:', error);
        res.status(500).json({ error: 'Failed to get subscription status' });
    }
});

// Cancel Subscription
app.post("/api/cancel-subscription", authenticateToken, async (req, res) => {
    try {
        const user = users.get(req.user.email);
        
        if (!user || !user.subscription?.stripeSubscriptionId) {
            return res.status(400).json({ error: 'No active subscription found' });
        }
        
        const subscription = await stripe.subscriptions.update(
            user.subscription.stripeSubscriptionId,
            { cancel_at_period_end: true }
        );
        
        user.subscription.cancelAtPeriodEnd = true;
        users.set(req.user.email, user);
        
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

// Get available subscription plans
app.get("/api/subscription-plans", (req, res) => {
    res.json(SUBSCRIPTION_PLANS);
});

// FIXED: Enhanced signup with proper email verification
app.post("/auth/signup", async (req, res) => {
    try {
        const { email, password, name } = req.body;

        console.log(`[SIGNUP] Attempt for: ${email}`);

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters long' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Please enter a valid email address' });
        }

        if (users.has(email)) {
            return res.status(400).json({ error: 'An account with this email already exists' });
        }

        // FIXED: Always require email verification if email is configured
        if (!emailTransporter) {
            console.log('[SIGNUP] Email not configured, creating account directly');
            // If email not configured, create account directly
            const hashedPassword = await bcrypt.hash(password, 10);
            const user = {
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
            
            users.set(email, user);
            
            const token = jwt.sign(
                { id: user.id, email: user.email },
                JWT_SECRET,
                { expiresIn: '7d' }
            );
            
            return res.json({
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    createdAt: user.createdAt,
                    subscription: user.subscription
                },
                message: 'Account created successfully! (Email verification not available)'
            });
        }

        // Check for existing pending verification
        if (pendingVerifications.has(email)) {
            const existing = pendingVerifications.get(email);
            const timeSinceLastRequest = Date.now() - existing.timestamp;
            
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

        pendingVerifications.set(email, {
            email,
            password: hashedPassword,
            name,
            verificationCode,
            timestamp: Date.now(),
            expires: Date.now() + (15 * 60 * 1000), // 15 minutes
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
        res.status(500).json({ error: 'Internal server error occurred during signup' });
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

        const pendingVerification = pendingVerifications.get(email);

        if (!pendingVerification) {
            return res.status(400).json({ 
                error: 'No pending verification found for this email. Please sign up again.',
                action: 'signup_required'
            });
        }

        if (Date.now() > pendingVerification.expires) {
            pendingVerifications.delete(email);
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
        const user = {
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

        users.set(email, user);
        pendingVerifications.delete(email);

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
            message: 'Account created and verified successfully! Welcome to Roblox Luau AI!'
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

        if (!emailTransporter) {
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
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const user = users.get(email);
        if (!user) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }

        user.lastLogin = new Date();
        
        // FIXED: Ensure user has chats and scripts arrays
        if (!user.chats) user.chats = [];
        if (!user.scripts) user.scripts = [];

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

app.get("/auth/verify", authenticateToken, (req, res) => {
    const user = users.get(req.user.email);
    res.json({ 
        valid: true, 
        user: {
            ...req.user,
            subscription: user?.subscription || { plan: 'free', status: 'active' }
        }
    });
});

// FIXED: New endpoints for user-specific chats and scripts
app.get("/api/user-chats", authenticateToken, (req, res) => {
    try {
        const user = users.get(req.user.email);
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

app.post("/api/user-chats", authenticateToken, (req, res) => {
    try {
        const user = users.get(req.user.email);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const { chat } = req.body;
        if (!chat) {
            return res.status(400).json({ error: 'Chat data is required' });
        }

        if (!user.chats) user.chats = [];
        user.chats.push(chat);
        users.set(req.user.email, user);

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

app.put("/api/user-chats/:chatId", authenticateToken, (req, res) => {
    try {
        const user = users.get(req.user.email);
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
        users.set(req.user.email, user);

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

app.delete("/api/user-chats/:chatId", authenticateToken, (req, res) => {
    try {
        const user = users.get(req.user.email);
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
        users.set(req.user.email, user);

        res.json({ 
            success: true, 
            message: 'Chat deleted successfully'
        });
    } catch (error) {
        console.error('[ERROR] Failed to delete chat:', error);
        res.status(500).json({ error: 'Failed to delete chat' });
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
        const { prompt, model = "gpt-4o-mini" } = req.body;
        const isAuthenticated = req.user !== null;

        // Check if authenticated user can use this model
        if (isAuthenticated) {
            const user = users.get(req.user.email);
            const subscription = getUserSubscription(user);
            
            if (!subscription.limits.models.includes(model)) {
                return res.status(403).json({ 
                    error: `Model ${model} requires a higher subscription plan.`,
                    availableModels: subscription.limits.models,
                    subscription: subscription,
                    upgradeUrl: "/pricing.html"
                });
            }
        }

        const config = MODEL_CONFIGS[model];
        if (!config) {
            return res.status(400).json({ error: "Invalid model selected" });
        }

        const response = await openai.chat.completions.create({
            model: config.model,
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: prompt }
            ],
            max_tokens: 2000,
            temperature: 0.7
        });

        const userIdentifier = getUserIdentifier(req);
        let responseData = { 
            reply: response.choices[0].message.content, 
            model: model
        };

        if (isAuthenticated) {
            // Increment user usage for authenticated users
            const user = users.get(req.user.email);
            incrementUserUsage(user);
            
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

        res.json(responseData);
    } catch (error) {
        console.error("[ERROR] AI Error:", error);
        
        if (error.status === 401) {
            res.status(500).json({ error: "OpenAI API key is invalid or expired" });
        } else if (error.status === 429) {
            res.status(500).json({ error: "OpenAI API rate limit exceeded. Please try again later." });
        } else if (error.status === 402) {
            res.status(500).json({ error: "OpenAI API quota exceeded. Please check your billing." });
        } else {
            res.status(500).json({ error: error.message || "An error occurred while processing your request" });
        }
    }
});

app.get("/models", optionalAuthenticateToken, (req, res) => {
    const isAuthenticated = req.user !== null;
    const userIdentifier = getUserIdentifier(req);
    
    let availableModels = ['gpt-4o-mini']; // Default for guests
    
    if (isAuthenticated) {
        const user = users.get(req.user.email);
        const subscription = getUserSubscription(user);
        availableModels = subscription.limits.models;
    }
    
    const models = Object.keys(MODEL_CONFIGS).map(key => {
        const modelInfo = {
            name: key,
            model: MODEL_CONFIGS[key].model,
            requiresAuth: !availableModels.includes(key)
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

async function startServer() {
    console.log('\n[INIT] Starting Roblox Luau AI Server with Subscription System...');
    
    await initializeEmailTransporter();
    
    const port = process.env.PORT || 3000;
    const baseUrl = getBaseUrl();
    
    app.listen(port, '0.0.0.0', () => {
        console.log("\n" + "=".repeat(60));
        console.log("[SUCCESS] Roblox Luau AI Server Running");
        console.log(`[PORT] ${port}`);
        console.log(`[BASE_URL] ${baseUrl}`);
        console.log(`[HEALTH] ${baseUrl}/health`);
        console.log(`[EMAIL] ${emailTransporter ? "ENABLED" : "DISABLED"}`);
        console.log(`[STRIPE] ${process.env.STRIPE_SECRET_KEY ? "CONFIGURED" : "NOT CONFIGURED"}`);
        
        if (emailTransporter) {
            console.log('[EMAIL] Email verification is working!');
        } else {
            console.log('[EMAIL] To enable email verification:');
            console.log('   1. Go to https://myaccount.google.com/security');
            console.log('   2. Enable 2-Step Verification');
            console.log('   3. Go to App Passwords');
            console.log('   4. Generate password for "Mail"');
            console.log('   5. Set EMAIL_PASSWORD to the 16-character code');
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
            console.log(`   ${model}: ${limits.dailyLimit}/day, ${limits.hourlyLimit}/hour`);
        });
        
        console.log("\n[GOOGLE OAUTH]");
        console.log(`   Client ID: ${process.env.GOOGLE_CLIENT_ID ? 'CONFIGURED' : 'MISSING'}`);
        console.log(`   Client Secret: ${process.env.GOOGLE_CLIENT_SECRET ? 'CONFIGURED' : 'MISSING'}`);
        console.log(`   Redirect URI: ${baseUrl}/auth/google/callback`);
        
        console.log("=".repeat(60) + "\n");
    });
}

startServer().catch(error => {
    console.error('[FATAL] Server startup failed:', error);
    process.exit(1);
});
