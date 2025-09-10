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
const sessions = new Map();
const userChats = new Map();
const dailyUsage = new Map();
const userUsage = new Map();
const guestUsage = new Map();

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

// Guest usage limits
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

// Email setup
let emailTransporter = null;

async function initializeEmailTransporter() {
    console.log('\n[EMAIL INIT] Initializing Email System...');
    
    if (!nodemailer) {
        console.log('[WARNING] Nodemailer not available!');
        return false;
    }
    
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
        console.log('[WARNING] Email configuration missing - email verification disabled');
        return false;
    }

    try {
        console.log('[EMAIL] Creating Gmail SMTP transporter...');
        
        emailTransporter = nodemailer.createTransporter({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD
            },
            tls: {
                rejectUnauthorized: false
            },
            secure: false,
            requireTLS: true
        });

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
        console.error('[ERROR] Failed to send verification email:', error);
        throw new Error('Failed to send verification email. Please try again.');
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
            google: !(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
            redirectUri: `${getBaseUrl()}/auth/google/callback`
        },
        subscriptionPlans: Object.keys(SUBSCRIPTION_PLANS),
        activeUsers: users.size,
        activeGuests: guestUsage.size
    });
});

// User signup - ALWAYS require email verification
app.post("/auth/signup", async (req, res) => {
    try {
        const { email, password, name } = req.body;

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

        // ALWAYS require email verification - no bypass
        if (!emailTransporter) {
            return res.status(503).json({ 
                error: 'Email verification system is currently unavailable. Please try again later or contact support.',
                requiresVerification: true
            });
        }

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
            expires: Date.now() + (15 * 60 * 1000),
            attempts: 0
        });

        await sendVerificationEmail(email, verificationCode, name);
        
        res.json({
            message: 'Verification code sent to your email. Please check your inbox and spam folder.',
            email: email,
            requiresVerification: true,
            expiresIn: '15 minutes'
        });

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
            return res.status(503).json({ 
                error: 'Email system is not available. Please try again later.'
            });
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

        const user = users.get(email);
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        if (!user.emailVerified) {
            return res.status(403).json({ 
                error: 'Email not verified. Please check your email for verification instructions.',
                requiresVerification: true,
                email: email
            });
        }

        user.lastLogin = new Date();
        users.set(email, user);

        invalidateUserSessions(user.id);

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
                lastLogin: user.lastLogin,
                emailVerified: user.emailVerified,
                subscription: user.subscription || { plan: 'free', status: 'active' }
            },
            message: 'Login successful!'
        });

    } catch (error) {
        console.error("[ERROR] Login error:", error);
        res.status(500).json({ error: 'Login failed. Please try again.' });
    }
});

// Google OAuth routes
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
        
        const { tokens } = await googleClient.getToken(code);
        googleClient.setCredentials(tokens);
        
        const oauth2 = google.oauth2({ version: 'v2', auth: googleClient });
        const { data } = await oauth2.userinfo.get();
        
        console.log('[OAUTH] User data received:', data.email);
        
        let user = users.get(data.email);
        
        if (!user) {
            user = {
                id: Date.now().toString(),
                email: data.email,
                name: data.name,
                picture: data.picture,
                provider: 'google',
                emailVerified: true,
                createdAt: new Date(),
                lastLogin: new Date(),
                subscription: { plan: 'free', status: 'active' }
            };
            
            users.set(data.email, user);
            console.log('[OAUTH] New user created:', data.email);
        } else {
            user.lastLogin = new Date();
            if (data.picture) user.picture = data.picture;
            users.set(data.email, user);
            console.log('[OAUTH] Existing user logged in:', data.email);
        }
        
        const token = jwt.sign(
            { id: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        const sessionId = createSession(user.id, token);
        
        res.redirect(`${frontendUrl}/?token=${token}&sessionId=${sessionId}`);
        
    } catch (error) {
        console.error('[ERROR] Google OAuth callback failed:', error);
        res.redirect(`${frontendUrl}/login.html?error=oauth_failed`);
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

app.post("/auth/logout", authenticateToken, async (req, res) => {
    try {
        const { sessionId } = req.body;
        
        if (sessionId) {
            sessions.delete(sessionId);
        } else {
            invalidateUserSessions(req.user.id);
        }

        res.json({ 
            message: 'Logged out successfully',
            clearStorage: true
        });

    } catch (error) {
        console.error("[ERROR] Logout error:", error);
        res.status(500).json({ error: 'Logout failed' });
    }
});

app.get("/api/user", authenticateToken, async (req, res) => {
    try {
        const user = req.userData;
        const subscription = user.subscription || { plan: 'free', status: 'active' };
        const plan = SUBSCRIPTION_PLANS[subscription.plan] || SUBSCRIPTION_PLANS.free;
        
        const today = new Date().toISOString().split('T')[0];
        const usageKey = `${user.id}_${today}`;
        const usage = dailyUsage.get(usageKey) || 0;
        
        res.json({
            id: user.id,
            email: user.email,
            name: user.name,
            picture: user.picture,
            createdAt: user.createdAt,
            lastLogin: user.lastLogin,
            emailVerified: user.emailVerified,
            provider: user.provider || 'email',
            subscription: {
                plan: subscription.plan,
                status: subscription.status,
                limits: plan.limits,
                usage: {
                    daily_messages: usage,
                    daily_limit: plan.limits.daily_messages
                }
            }
        });

    } catch (error) {
        console.error("[ERROR] Get user error:", error);
        res.status(500).json({ error: 'Failed to get user information' });
    }
});

app.get("/api/user-subscription", authenticateToken, async (req, res) => {
    try {
        const user = users.get(req.user.email);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const subscription = user.subscription || { plan: 'free', status: 'active' };
        const plan = SUBSCRIPTION_PLANS[subscription.plan] || SUBSCRIPTION_PLANS.free;
        
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

app.post("/api/upgrade-subscription", authenticateToken, async (req, res) => {
    try {
        const { plan, paymentMethod } = req.body;
        const user = req.userData;

        if (!SUBSCRIPTION_PLANS[plan]) {
            return res.status(400).json({ error: 'Invalid subscription plan' });
        }

        if (plan === 'free') {
            return res.status(400).json({ error: 'Cannot upgrade to free plan' });
        }

        const updatedSubscription = {
            plan: plan,
            status: 'active',
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            cancelAtPeriodEnd: false,
            paymentMethod: paymentMethod || 'card'
        };

        user.subscription = updatedSubscription;
        users.set(user.email, user);

        const today = new Date().toISOString().split('T')[0];
        const usageKey = `${user.id}_${today}`;
        dailyUsage.delete(usageKey);

        console.log(`[UPGRADE] User ${user.email} upgraded to ${plan} plan`);

        res.json({
            message: `Successfully upgraded to ${SUBSCRIPTION_PLANS[plan].name} plan!`,
            subscription: {
                plan: plan,
                status: 'active',
                limits: SUBSCRIPTION_PLANS[plan].limits,
                currentPeriodEnd: updatedSubscription.currentPeriodEnd
            }
        });

    } catch (error) {
        console.error("[ERROR] Subscription upgrade error:", error);
        res.status(500).json({ error: 'Failed to upgrade subscription' });
    }
});

app.post("/api/manual-upgrade", async (req, res) => {
    try {
        const email = "askeggs9009@gmail.com";
        const user = users.get(email);
        
        if (user) {
            user.subscription = {
                plan: 'pro',
                stripeCustomerId: 'cus_T1dVj5PQvUNMVh',
                stripeSubscriptionId: 'sub_1S5aFY30DH9fxKOMBY5CtdOY',
                status: 'active',
                currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                cancelAtPeriodEnd: false
            };
            
            users.set(email, user);
            console.log(`[MANUAL] User ${email} manually upgraded to pro`);
            
            res.json({
                message: 'Manual upgrade successful',
                user: {
                    email: user.email,
                    subscription: user.subscription
                }
            });
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    } catch (error) {
        console.error('[ERROR] Manual upgrade failed:', error);
        res.status(500).json({ error: 'Manual upgrade failed' });
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
            cost: config.cost,
            description: config.description
        };
    });

    res.json({
        isAuthenticated,
        userIdentifier: isAuthenticated ? req.user.email : userIdentifier,
        limits,
        subscriptionPlans: SUBSCRIPTION_PLANS
    });
});

app.get("/api/chats", authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const chats = userChats.get(userId) || [];
        
        res.json({
            chats: chats.map(chat => ({
                id: chat.id,
                title: chat.title,
                createdAt: chat.createdAt,
                updatedAt: chat.updatedAt,
                messageCount: chat.messages ? chat.messages.length : 0
            }))
        });

    } catch (error) {
        console.error("[ERROR] Get chats error:", error);
        res.status(500).json({ error: 'Failed to get chats' });
    }
});

app.post("/api/chats", authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { title } = req.body;
        
        const newChat = {
            id: Date.now().toString(),
            title: title || 'New Chat',
            createdAt: new Date(),
            updatedAt: new Date(),
            messages: []
        };

        const userChatsList = userChats.get(userId) || [];
        userChatsList.unshift(newChat);
        userChats.set(userId, userChatsList);

        res.json({
            message: 'Chat created successfully',
            chat: newChat
        });

    } catch (error) {
        console.error("[ERROR] Create chat error:", error);
        res.status(500).json({ error: 'Failed to create chat' });
    }
});

app.post("/api/message", checkUsageLimits, optionalAuthenticateToken, async (req, res) => {
    try {
        const { message, model, chatId } = req.body;
        const userIdentifier = getUserIdentifier(req);

        if (req.user) {
            const user = req.userData;
            recordUsage(user.id, model);

            if (chatId) {
                const userChatsList = userChats.get(user.id) || [];
                const chatIndex = userChatsList.findIndex(chat => chat.id === chatId);
                
                if (chatIndex !== -1) {
                    userChatsList[chatIndex].messages = userChatsList[chatIndex].messages || [];
                    userChatsList[chatIndex].messages.push({
                        id: Date.now().toString(),
                        content: message,
                        role: 'user',
                        timestamp: new Date()
                    });
                    userChatsList[chatIndex].updatedAt = new Date();
                    userChats.set(user.id, userChatsList);
                }
            }

            const today = new Date().toISOString().split('T')[0];
            const usageKey = `${user.id}_${today}`;
            const currentUsage = dailyUsage.get(usageKey) || 0;
            const userPlan = SUBSCRIPTION_PLANS[user.subscription?.plan || 'free'];

            const aiResponse = `Echo: ${message} (Model: ${model}, User: ${user.name})`;
            
            res.json({
                response: aiResponse,
                model: model,
                usage: {
                    daily_used: currentUsage,
                    daily_limit: userPlan.limits.daily_messages
                }
            });
        } else {
            const today = new Date().toISOString().split('T')[0];
            const hour = new Date().getHours();
            const dailyKey = `${userIdentifier}_${today}`;
            const hourlyKey = `${userIdentifier}_${today}_${hour}`;
            
            const dailyUsed = (guestUsage.get(dailyKey) || 0) + 1;
            const hourlyUsed = (guestUsage.get(hourlyKey) || 0) + 1;
            
            guestUsage.set(dailyKey, dailyUsed);
            guestUsage.set(hourlyKey, hourlyUsed);

            const aiResponse = `Echo: ${message} (Model: ${model}, Guest User)`;
            
            res.json({
                response: aiResponse,
                model: model,
                usage: {
                    daily_used: dailyUsed,
                    daily_limit: USAGE_LIMITS[model].dailyLimit,
                    hourly_used: hourlyUsed,
                    hourly_limit: USAGE_LIMITS[model].hourlyLimit
                }
            });
        }

    } catch (error) {
        console.error("[ERROR] Message error:", error);
        res.status(500).json({ error: 'Failed to process message' });
    }
});

app.post("/api/switch-account", async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({ error: 'Token required for account switching' });
        }

        jwt.verify(token, JWT_SECRET, (err, decoded) => {
            if (err) {
                return res.status(403).json({ error: 'Invalid token for account switching' });
            }

            const user = users.get(decoded.email);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            const sessionId = createSession(user.id, token);

            res.json({
                message: 'Account switched successfully',
                sessionId,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    subscription: user.subscription
                },
                clearPreviousData: true
            });
        });

    } catch (error) {
        console.error("[ERROR] Account switch error:", error);
        res.status(500).json({ error: 'Failed to switch accounts' });
    }
});

app.get("/api/admin/users", (req, res) => {
    const userList = Array.from(users.values()).map(user => ({
        id: user.id,
        email: user.email,
        name: user.name,
        provider: user.provider,
        subscription: user.subscription,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
    }));
    
    res.json({
        total: userList.length,
        users: userList
    });
});

app.get("/api/admin/stats", (req, res) => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    let totalDailyUsage = 0;
    let activeUsersToday = 0;
    
    for (const [key, usage] of dailyUsage.entries()) {
        if (key.includes(today)) {
            totalDailyUsage += usage;
            activeUsersToday++;
        }
    }
    
    res.json({
        totalUsers: users.size,
        activeUsersToday,
        totalDailyUsage,
        pendingVerifications: pendingVerifications.size,
        activeSessions: sessions.size,
        subscriptionBreakdown: {
            free: Array.from(users.values()).filter(u => (u.subscription?.plan || 'free') === 'free').length,
            pro: Array.from(users.values()).filter(u => u.subscription?.plan === 'pro').length,
            enterprise: Array.from(users.values()).filter(u => u.subscription?.plan === 'enterprise').length
        }
    });
});

// Static file serving
app.use(express.static(__dirname));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

async function startServer() {
    console.log("=".repeat(60));
    console.log('🚀 Starting Roblox Luau AI Server...');
    console.log("=".repeat(60));
    
    await initializeEmailTransporter();
    
    const baseUrl = getBaseUrl();
    const PORT = process.env.PORT || 3000;
    
    app.listen(PORT, () => {
        console.log(`\n✅ Server running on port ${PORT}`);
        console.log(`🌐 Base URL: ${baseUrl}`);
        console.log(`📧 Email verification: ${emailTransporter ? "ENABLED" : "DISABLED"}`);
        console.log(`🔒 JWT Secret: ${JWT_SECRET ? "CONFIGURED" : "USING DEFAULT"}`);
        console.log(`💳 Stripe: ${process.env.STRIPE_SECRET_KEY ? "CONFIGURED" : "NOT CONFIGURED"}`);
        
        if (process.env.RAILWAY_STATIC_URL) {
            console.log(`🚂 Railway: https://${process.env.RAILWAY_STATIC_URL}`);
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