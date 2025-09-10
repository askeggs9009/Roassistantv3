import express from "express";
import OpenAI from "openai";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { google } from "googleapis";
import path from "path";
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import Stripe from 'stripe';

// Fixed nodemailer import - try both methods
let nodemailer;
try {
    // Method 1: Direct import
    nodemailer = await import('nodemailer');
    if (nodemailer.default) {
        nodemailer = nodemailer.default;
    }
    console.log('[SUCCESS] Nodemailer imported via ES6 import');
} catch (importError) {
    try {
        // Method 2: Using createRequire as fallback
        import { createRequire } from 'module';
        const require = createRequire(import.meta.url);
        nodemailer = require('nodemailer');
        console.log('[SUCCESS] Nodemailer imported via require');
    } catch (requireError) {
        console.log('[ERROR] Failed to import nodemailer:', requireError.message);
        nodemailer = null;
    }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();

// Enhanced CORS configuration
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
app.set('trust proxy', 1);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

// Storage
const users = new Map();
const pendingVerifications = new Map();
const sessions = new Map();
const userChats = new Map();
const dailyUsage = new Map();
const userUsage = new Map();
const guestUsage = new Map();

// Subscription Plans
const SUBSCRIPTION_PLANS = {
    free: {
        name: 'Free',
        limits: {
            daily_messages: 10,
            models: ['gpt-4o-mini'],
            max_file_size: 1048576,
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
            max_file_size: 10485760,
            scripts_storage: -1,
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
            daily_messages: -1,
            models: ['gpt-4o-mini', 'gpt-4.1', 'gpt-5'],
            max_file_size: 52428800,
            scripts_storage: -1,
            projects: -1,
            support: 'priority'
        },
        stripe_price_ids: {
            monthly: process.env.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID,
            annual: process.env.STRIPE_ENTERPRISE_ANNUAL_PRICE_ID
        },
        features: ['All AI models', 'Unlimited messages', 'Premium support', 'Custom integrations']
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

// Fixed Email Setup with better debugging
let emailTransporter = null;

async function initializeEmailTransporter() {
    console.log('\n[EMAIL INIT] Initializing Email System...');
    
    // Check if nodemailer is available
    if (!nodemailer) {
        console.log('[ERROR] Nodemailer not available!');
        return false;
    }

    // Debug nodemailer object
    console.log('[DEBUG] Nodemailer object type:', typeof nodemailer);
    console.log('[DEBUG] Nodemailer has createTransporter:', typeof nodemailer.createTransporter);
    
    // Check for required email configuration
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
        console.log('[WARNING] Email configuration missing:');
        console.log(`  EMAIL_USER: ${process.env.EMAIL_USER ? 'SET' : 'MISSING'}`);
        console.log(`  EMAIL_PASSWORD: ${process.env.EMAIL_PASSWORD ? 'SET' : 'MISSING'}`);
        return false;
    }

    try {
        console.log('[EMAIL] Creating Gmail SMTP transporter...');
        console.log(`[EMAIL] Using email: ${process.env.EMAIL_USER}`);
        
        // Check if createTransporter exists
        if (typeof nodemailer.createTransporter !== 'function') {
            console.log('[ERROR] nodemailer.createTransporter is not a function');
            console.log('[DEBUG] Available methods:', Object.keys(nodemailer));
            return false;
        }
        
        // Create transporter
        emailTransporter = nodemailer.createTransporter({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD
            },
            tls: {
                rejectUnauthorized: false
            }
        });

        // Test the connection
        console.log('[EMAIL] Testing connection...');
        await emailTransporter.verify();
        
        console.log('[SUCCESS] Email system verified and ready!');
        return true;

    } catch (error) {
        console.log('[ERROR] Email system failed:', error.message);
        emailTransporter = null;
        return false;
    }
}

function generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerificationEmail(email, code, name = null) {
    if (!emailTransporter) {
        throw new Error('Email system not configured. Please contact support.');
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
                        <p>Need help? Contact us at <a href="mailto:${process.env.EMAIL_FROM || process.env.EMAIL_USER}" style="color: #007bff;">${process.env.EMAIL_FROM || process.env.EMAIL_USER}</a></p>
                    </div>
                </div>
            </div>
        `,
        text: `
Welcome to Roblox Luau AI!

Hi ${name || 'there'}!

Thank you for signing up! To complete your registration, please use this verification code: ${code}

This code will expire in 15 minutes.

If you didn't create an account, you can safely ignore this email.

Need help? Contact us at ${process.env.EMAIL_FROM || process.env.EMAIL_USER}
        `
    };

    try {
        console.log(`[EMAIL] Sending verification to ${email}...`);
        const info = await emailTransporter.sendMail(mailOptions);
        console.log('[SUCCESS] Verification email sent!', info.messageId);
        return true;
    } catch (error) {
        console.error('[ERROR] Failed to send verification email:', error);
        throw new Error(`Failed to send verification email: ${error.message}`);
    }
}

// Utility functions
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
        return getUserSubscription(null);
    }

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

function canUserSendMessage(user) {
    const subscription = getUserSubscription(user);
    
    if (subscription.limits.daily_messages === -1) {
        return { allowed: true };
    }
    
    if (subscription.usage.daily_messages >= subscription.limits.daily_messages) {
        return {
            allowed: false,
            error: `Daily message limit reached (${subscription.limits.daily_messages} messages).`,
            subscription: subscription
        };
    }
    
    return { allowed: true };
}

const getBaseUrl = () => {
    if (process.env.BASE_URL) {
        return process.env.BASE_URL.replace(/\/$/, '');
    }
    
    if (process.env.RAILWAY_STATIC_URL) {
        return `https://${process.env.RAILWAY_STATIC_URL}`;
    }
    
    const port = process.env.PORT || 3000;
    return `http://localhost:${port}`;
};

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

function recordUsage(userId, model = 'default') {
    const today = new Date().toISOString().split('T')[0];
    const usageKey = `${userId}_${today}`;
    const currentUsage = dailyUsage.get(usageKey) || 0;
    dailyUsage.set(usageKey, currentUsage + 1);
}

function checkUsageLimit(userIdentifier, model) {
    const limits = USAGE_LIMITS[model];
    if (!limits) {
        return { allowed: false, reason: 'Model not found' };
    }

    const today = new Date().toISOString().split('T')[0];
    const hour = new Date().getHours();
    
    const dailyKey = `${userIdentifier}_${today}`;
    const hourlyKey = `${userIdentifier}_${today}_${hour}`;
    
    const dailyUsed = guestUsage.get(dailyKey) || 0;
    const hourlyUsed = guestUsage.get(hourlyKey) || 0;

    if (dailyUsed >= limits.dailyLimit) {
        return {
            allowed: false,
            reason: 'Daily limit exceeded',
            limitsInfo: {
                dailyUsed,
                dailyLimit: limits.dailyLimit,
                hourlyUsed,
                hourlyLimit: limits.hourlyLimit
            }
        };
    }

    if (hourlyUsed >= limits.hourlyLimit) {
        return {
            allowed: false,
            reason: 'Hourly limit exceeded',
            limitsInfo: {
                dailyUsed,
                dailyLimit: limits.dailyLimit,
                hourlyUsed,
                hourlyLimit: limits.hourlyLimit
            }
        };
    }

    return {
        allowed: true,
        limitsInfo: {
            dailyUsed,
            dailyLimit: limits.dailyLimit,
            hourlyUsed,
            hourlyLimit: limits.hourlyLimit
        }
    };
}

function resetDailyUsage() {
    dailyUsage.clear();
    guestUsage.clear();
    console.log('[USAGE] Daily usage reset');
}

setInterval(() => {
    const now = new Date();
    if (now.getHours() === 0 && now.getMinutes() === 0) {
        resetDailyUsage();
    }
}, 60000);

function createSession(userId, token) {
    const sessionId = Date.now().toString() + Math.random().toString(36);
    sessions.set(sessionId, {
        userId,
        token,
        createdAt: new Date(),
        lastActivity: new Date()
    });
    return sessionId;
}

function invalidateUserSessions(userId) {
    for (const [sessionId, session] of sessions.entries()) {
        if (session.userId === userId) {
            sessions.delete(sessionId);
        }
    }
}

// Middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token.' });
        }

        const userData = users.get(user.email);
        if (!userData) {
            return res.status(404).json({ error: 'User not found.' });
        }

        req.user = user;
        req.userData = userData;
        next();
    });
}

function optionalAuthenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
        jwt.verify(token, JWT_SECRET, (err, user) => {
            if (!err) {
                const userData = users.get(user.email);
                if (userData) {
                    req.user = user;
                    req.userData = userData;
                }
            }
        });
    }

    next();
}

function checkUsageLimits(req, res, next) {
    const { model } = req.body;
    const userIdentifier = getUserIdentifier(req);
    
    if (!req.user) {
        const limitCheck = checkUsageLimit(userIdentifier, model);
        
        if (!limitCheck.allowed) {
            return res.status(429).json({
                error: limitCheck.reason,
                limits: limitCheck.limitsInfo,
                upgradeMessage: "Sign up for unlimited access!",
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

// Routes
app.get("/health", (req, res) => {
    res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        version: "1.0.0",
        email: emailTransporter ? "enabled" : "disabled",
        oauth: {
            google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
            redirectUri: `${getBaseUrl()}/auth/google/callback`
        },
        subscriptionPlans: Object.keys(SUBSCRIPTION_PLANS),
        activeUsers: users.size,
        activeGuests: guestUsage.size
    });
});

// Test email endpoint with better debugging
app.post("/test-email", async (req, res) => {
    try {
        console.log('[TEST] Testing email system...');
        
        if (!nodemailer) {
            return res.status(503).json({ 
                error: 'Nodemailer not imported',
                debug: 'Nodemailer module not available'
            });
        }

        if (!emailTransporter) {
            console.log('[TEST] Email transporter not available, initializing...');
            const initialized = await initializeEmailTransporter();
            if (!initialized) {
                return res.status(503).json({ 
                    error: 'Email system not configured',
                    details: {
                        EMAIL_USER: process.env.EMAIL_USER ? 'SET' : 'MISSING',
                        EMAIL_PASSWORD: process.env.EMAIL_PASSWORD ? 'SET' : 'MISSING',
                        nodemailer: nodemailer ? 'AVAILABLE' : 'NOT_AVAILABLE'
                    }
                });
            }
        }

        const testCode = generateVerificationCode();
        await sendVerificationEmail(
            process.env.EMAIL_USER,
            testCode,
            'Test User'
        );

        res.json({ 
            success: true, 
            message: 'Test email sent successfully',
            code: testCode 
        });
    } catch (error) {
        console.error('[TEST] Email test failed:', error);
        res.status(500).json({ 
            error: 'Failed to send test email',
            details: error.message 
        });
    }
});

// Enhanced signup
app.post("/auth/signup", async (req, res) => {
    try {
        const { email, password, name } = req.body;

        console.log(`[SIGNUP] Attempt for: ${email}`);

        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Email, password, and name are required' });
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

        // Check if email system is working
        if (!emailTransporter) {
            console.log('[SIGNUP] Email system not available, initializing...');
            const emailInitialized = await initializeEmailTransporter();
            
            if (!emailInitialized) {
                return res.status(503).json({ 
                    error: 'Email verification system is currently unavailable. Please try again later or contact support.',
                    requiresVerification: true,
                    details: 'Email service configuration failed'
                });
            }
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

        // Store pending verification
        pendingVerifications.set(email, {
            email,
            password: hashedPassword,
            name,
            verificationCode,
            timestamp: Date.now(),
            expires: Date.now() + (15 * 60 * 1000),
            attempts: 0
        });

        // Try to send verification email
        try {
            await sendVerificationEmail(email, verificationCode, name);
            
            console.log(`[SIGNUP] Verification email sent to ${email}`);
            
            res.json({
                message: 'Verification code sent to your email. Please check your inbox and spam folder.',
                email: email,
                requiresVerification: true,
                expiresIn: '15 minutes'
            });
        } catch (emailError) {
            console.error('[SIGNUP] Failed to send verification email:', emailError);
            
            // Remove pending verification if email failed
            pendingVerifications.delete(email);
            
            res.status(500).json({ 
                error: 'Failed to send verification email. Please check your email address and try again.',
                details: emailError.message
            });
        }

    } catch (error) {
        console.error("[ERROR] Signup error:", error);
        res.status(500).json({ 
            error: 'Registration failed. Please try again.',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

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

        const user = {
            id: Date.now().toString(),
            email: pendingVerification.email,
            password: pendingVerification.password,
            name: pendingVerification.name,
            createdAt: new Date(),
            provider: 'email',
            emailVerified: true,
            lastLogin: new Date(),
            subscription: { plan: 'free', status: 'active' }
        };

        users.set(email, user);
        pendingVerifications.delete(email);

        const token = jwt.sign(
            { id: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        const sessionId = createSession(user.id, token);

        res.json({
            token,
            sessionId,
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
            await initializeEmailTransporter();
            if (!emailTransporter) {
                return res.status(503).json({ 
                    error: 'Email system is not available. Please try again later.'
                });
            }
        }

        const newVerificationCode = generateVerificationCode();
        pendingVerification.verificationCode = newVerificationCode;
        pendingVerification.timestamp = Date.now();
        pendingVerification.expires = Date.now() + (15 * 60 * 1000);
        pendingVerification.attempts = 0;

        await sendVerificationEmail(email, newVerificationCode, pendingVerification.name);
        
        res.json({
            message: 'New verification code sent to your email.',
            expiresIn: '15 minutes'
        });

    } catch (error) {
        console.error("[ERROR] Resend verification error:", error);
        res.status(500).json({ 
            error: 'Failed to send verification email. Please try again later.'
        });
    }
});

app.post("/auth/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }