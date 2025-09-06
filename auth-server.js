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

// Create require function for CommonJS modules
const require = createRequire(import.meta.url);

// Import nodemailer using CommonJS
let nodemailer = null;
try {
    nodemailer = require('nodemailer');
    console.log('[SUCCESS] Nodemailer imported successfully');
} catch (error) {
    console.log('[ERROR] Failed to import nodemailer:', error.message);
    console.log('[INFO] Install nodemailer with: npm install nodemailer');
}

// Fix for ES modules __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';
const users = new Map();
const pendingVerifications = new Map();

// Dynamic base URL configuration for Railway
const getBaseUrl = () => {
    // Railway sets RAILWAY_STATIC_URL for the deployed app
    if (process.env.RAILWAY_STATIC_URL) {
        return `https://${process.env.RAILWAY_STATIC_URL}`;
    }
    
    // Fallback to custom base URL or localhost
    if (process.env.BASE_URL) {
        return process.env.BASE_URL;
    }
    
    // For local development
    const port = process.env.PORT || 3000;
    return `http://localhost:${port}`;
};

// Google OAuth2 client with dynamic redirect URI
const getGoogleClient = () => {
    const baseUrl = getBaseUrl();
    console.log(`[OAUTH] Using base URL: ${baseUrl}`);
    
    return new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        `${baseUrl}/auth/google/callback`
    );
};

// Usage limits configuration
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

// Store for tracking guest usage
const guestUsage = new Map();

// Helper function to get user identifier
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
    
    // For guests, use IP + simplified user agent hash
    const ip = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'] || '';
    const hash = crypto
        .createHash('md5')
        .update(ip + userAgent)
        .digest('hex')
        .substring(0, 8);
    
    return `guest_${hash}`;
}

// Function to check if user is within usage limits
function checkUsageLimit(userIdentifier, model) {
    const limits = USAGE_LIMITS[model];
    if (!limits) {
        return { allowed: false, error: "Invalid model" };
    }
    
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const oneDay = 24 * oneHour;
    
    // Initialize user usage tracking
    if (!guestUsage.has(userIdentifier)) {
        guestUsage.set(userIdentifier, {
            hourlyUsage: [],
            dailyUsage: [],
            totalUsage: 0
        });
    }
    
    const usage = guestUsage.get(userIdentifier);
    
    // Clean old entries
    usage.hourlyUsage = usage.hourlyUsage.filter(timestamp => now - timestamp < oneHour);
    usage.dailyUsage = usage.dailyUsage.filter(timestamp => now - timestamp < oneDay);
    
    // Check hourly limit
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
    
    // Check daily limit
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

// Function to record usage
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

// Middleware to check usage limits
function checkUsageLimits(req, res, next) {
    const userIdentifier = getUserIdentifier(req);
    const isAuthenticated = req.user !== null;
    const model = req.body.model || "gpt-4o-mini";
    
    console.log(`[USAGE CHECK] User: ${userIdentifier}, Model: ${model}, Auth: ${isAuthenticated}`);
    
    // Apply limits to guests only
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
        
        // Record this usage
        recordUsage(userIdentifier, model);
        console.log(`[USAGE RECORDED] Guest user: ${userIdentifier}`);
        
        // Add usage info to response headers
        res.set({
            'X-Usage-Hourly': `${limitCheck.limitsInfo.hourlyUsed + 1}/${limitCheck.limitsInfo.hourlyLimit}`,
            'X-Usage-Daily': `${limitCheck.limitsInfo.dailyUsed + 1}/${limitCheck.limitsInfo.dailyLimit}`,
            'X-Rate-Limit-Model': model,
            'X-User-Type': 'guest'
        });
    }
    
    next();
}

// Email transporter
let emailTransporter = null;

// Initialize email transporter
async function initializeEmailTransporter() {
    console.log('\n[EMAIL INIT] Initializing Email System...');
    
    if (!nodemailer) {
        console.log('[CRITICAL] Nodemailer not available!');
        return false;
    }
    
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
        console.log('[WARNING] Email configuration missing!');
        console.log('[INFO] Email verification will be disabled');
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

        console.log('[EMAIL] Testing connection...');
        
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Connection test timeout (10 seconds)'));
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

// Generate verification code
function generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send verification email
async function sendVerificationEmail(email, code, name = null) {
    if (!emailTransporter) {
        throw new Error('Email system not configured.');
    }

    const mailOptions = {
        from: `"Roblox Luau AI" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Verify Your Roblox Luau AI Assistant Account',
        html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa;">
                <div style="background: linear-gradient(135deg, #0d1117 0%, #161b22 50%, #21262d 100%); color: white; padding: 30px; border-radius: 12px; text-align: center;">
                    <div style="width: 60px; height: 60px; background: linear-gradient(45deg, #00d4ff, #9d4edd); border-radius: 15px; display: inline-flex; align-items: center; justify-content: center; font-weight: bold; font-size: 24px; margin-bottom: 20px;">
                        RL
                    </div>
                    <h1 style="margin: 0; font-size: 24px; font-weight: 600;">Welcome to Roblox Luau AI!</h1>
                    <p style="margin: 10px 0 0 0; color: #8b949e; font-size: 16px;">Your intelligent assistant for Roblox game development</p>
                </div>
                
                <div style="background: white; padding: 30px; border-radius: 12px; margin-top: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
                    <h2 style="color: #0d1117; margin-top: 0; font-size: 20px;">Verify Your Email Address</h2>
                    <p style="color: #586069; line-height: 1.6; font-size: 16px;">
                        ${name ? `Hi ${name}, t` : 'T'}hanks for signing up! Please enter the verification code below:
                    </p>
                    
                    <div style="background: linear-gradient(135deg, #f6f8fa 0%, #e1e4e8 100%); border: 2px solid #d0d7de; border-radius: 12px; padding: 25px; text-align: center; margin: 25px 0;">
                        <div style="font-size: 36px; font-weight: bold; color: #0d1117; letter-spacing: 4px; font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace; margin-bottom: 8px;">
                            ${code}
                        </div>
                        <p style="margin: 0; color: #656d76; font-size: 14px; font-weight: 500;">This code expires in 15 minutes</p>
                    </div>
                </div>
            </div>
        `
    };

    try {
        console.log(`[EMAIL] Sending verification to ${email}...`);
        const result = await emailTransporter.sendMail(mailOptions);
        console.log('[SUCCESS] Verification email sent!');
        return true;
    } catch (error) {
        console.error('[ERROR] Failed to send verification email:', error.message);
        throw error;
    }
}

// Available model configurations
const MODEL_CONFIGS = {
    "gpt-4o-mini": {
        model: "gpt-4o-mini",
        requiresAuth: false
    },
    "gpt-4.1": {
        model: "gpt-4",
        requiresAuth: false
    },
    "gpt-5": {
        model: "gpt-4",
        requiresAuth: false
    }
};

// System prompt
const SYSTEM_PROMPT = `You are a helpful Roblox Luau scripting assistant. You specialize in:

1. Creating Roblox Luau scripts for various game mechanics
2. Debugging existing Roblox code
3. Explaining Roblox Studio concepts and best practices
4. Helping with game development workflows
5. Providing optimized and clean code solutions

When providing code, always use proper Luau syntax and follow Roblox scripting best practices. Include comments to explain complex logic and suggest where scripts should be placed (ServerScriptService, StarterPlayerScripts, etc.).

Be helpful, clear, and provide working examples when possible.`;

// Middleware functions
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

// User registration
app.post("/auth/signup", async (req, res) => {
    try {
        const { email, password, name } = req.body;

        console.log(`\n[SIGNUP] Attempt for: ${email}`);

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

        if (!emailTransporter) {
            console.log('[ERROR] Email verification attempted but email system not configured');
            return res.status(503).json({ 
                error: 'Email verification system is not configured. Please contact the administrator.',
                details: 'The server needs email configuration to send verification codes.'
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

        console.log(`[SIGNUP] Generated verification code for ${email}`);

        pendingVerifications.set(email, {
            email,
            password: hashedPassword,
            name,
            verificationCode,
            timestamp: Date.now(),
            expires: Date.now() + (15 * 60 * 1000),
            attempts: 0
        });

        try {
            await sendVerificationEmail(email, verificationCode, name);
            
            console.log(`[SUCCESS] Verification email sent to ${email}`);
            
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
                details: 'There was an issue with our email service. Please check your email address and try again.'
            });
        }

    } catch (error) {
        console.error("[ERROR] Signup error:", error);
        res.status(500).json({ error: 'Internal server error occurred during signup' });
    }
});

// Email verification
app.post("/auth/verify-email", async (req, res) => {
    try {
        const { email, verificationCode } = req.body;

        console.log(`\n[VERIFY] Email verification attempt for: ${email}`);

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
            console.log(`[ERROR] Verification code expired for ${email}`);
            pendingVerifications.delete(email);
            return res.status(400).json({ 
                error: 'Verification code has expired. Please sign up again.',
                action: 'signup_required'
            });
        }

        pendingVerification.attempts = (pendingVerification.attempts || 0) + 1;
        
        if (pendingVerification.attempts > 5) {
            console.log(`[ERROR] Too many verification attempts for ${email}`);
            pendingVerifications.delete(email);
            return res.status(429).json({ 
                error: 'Too many failed attempts. Please sign up again.',
                action: 'signup_required'
            });
        }

        if (pendingVerification.verificationCode !== verificationCode) {
            console.log(`[ERROR] Invalid verification code for ${email}. Attempt ${pendingVerification.attempts}/5`);
            return res.status(400).json({ 
                error: `Invalid verification code. ${5 - pendingVerification.attempts} attempts remaining.`,
                attemptsRemaining: 5 - pendingVerification.attempts
            });
        }

        console.log(`[SUCCESS] Email verification successful for ${email}`);

        const user = {
            id: Date.now().toString(),
            email: pendingVerification.email,
            password: pendingVerification.password,
            name: pendingVerification.name,
            createdAt: new Date(),
            provider: 'email',
            emailVerified: true,
            lastLogin: new Date()
        };

        users.set(email, user);
        pendingVerifications.delete(email);

        const token = jwt.sign(
            { id: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        console.log(`[SUCCESS] User account created for ${email}`);

        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                createdAt: user.createdAt,
                emailVerified: user.emailVerified
            },
            message: 'Account created and verified successfully! Welcome to Roblox Luau AI!'
        });

    } catch (error) {
        console.error("[ERROR] Email verification error:", error);
        res.status(500).json({ error: 'Internal server error during email verification' });
    }
});

// Resend verification
app.post("/auth/resend-verification", async (req, res) => {
    try {
        const { email } = req.body;

        console.log(`\n[RESEND] Verification request for: ${email}`);

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
            
            console.log(`[SUCCESS] New verification code sent to ${email}`);
            
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

// User login
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
                emailVerified: user.emailVerified
            }
        });
    } catch (error) {
        console.error("[ERROR] Login error:", error);
        res.status(500).json({ error: 'Internal server error during login' });
    }
});

// Token verification
app.get("/auth/verify", authenticateToken, (req, res) => {
    res.json({ valid: true, user: req.user });
});

// Google OAuth
app.get("/auth/google", (req, res) => {
    const googleClient = getGoogleClient();
    const scopes = ['email', 'profile'];
    const authUrl = googleClient.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
    });
    res.redirect(authUrl);
});

app.get("/auth/google/callback", async (req, res) => {
    try {
        const { code } = req.query;
        const googleClient = getGoogleClient();
        const { tokens } = await googleClient.getToken(code);
        googleClient.setCredentials(tokens);

        const oauth2 = google.oauth2({ version: 'v2', auth: googleClient });
        const { data } = await oauth2.userinfo.get();

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
                lastLogin: new Date()
            };
            users.set(data.email, user);
        } else {
            user.lastLogin = new Date();
        }

        const token = jwt.sign(
            { id: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        const baseUrl = getBaseUrl();
        res.redirect(`${baseUrl}/login-success.html?token=${token}&user=${encodeURIComponent(JSON.stringify({
            id: user.id,
            email: user.email,
            name: user.name,
            picture: user.picture
        }))}`);
    } catch (error) {
        console.error("[ERROR] Google auth error:", error);
        const baseUrl = getBaseUrl();
        res.redirect(`${baseUrl}/login.html?error=google_auth_failed`);
    }
});

// API endpoint to get current usage limits
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
            "Unlimited access to all models" :
            "Sign up for unlimited access to all models",
        upgradeIncentive: isAuthenticated ? null : {
            unlimited: true,
            noWaiting: true,
            priority: true,
            features: ["Unlimited Usage", "All Models", "Priority Support"]
        }
    });
});

// AI chat endpoint with usage limits
app.post("/ask", optionalAuthenticateToken, checkUsageLimits, async (req, res) => {
    try {
        const { prompt, model = "gpt-4o-mini" } = req.body;
        const isAuthenticated = req.user !== null;

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

        // Add usage info to response for guests
        const userIdentifier = getUserIdentifier(req);
        let responseData = { 
            reply: response.choices[0].message.content, 
            model: model
        };

        if (!isAuthenticated) {
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

// Get available models with usage info
app.get("/models", optionalAuthenticateToken, (req, res) => {
    const isAuthenticated = req.user !== null;
    const userIdentifier = getUserIdentifier(req);
    
    const models = Object.keys(MODEL_CONFIGS).map(key => {
        const modelInfo = {
            name: key,
            model: MODEL_CONFIGS[key].model,
            requiresAuth: false
        };

        // Show limits for guests only
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
        message: isAuthenticated ? 
            "Unlimited access to all models" : 
            "Sign up for unlimited access to all models"
    });
});

// Clean up expired verifications and old usage data
setInterval(() => {
    const now = Date.now();
    
    // Clean expired verifications
    const expiredVerifications = [];
    for (const [email, verification] of pendingVerifications.entries()) {
        if (now > verification.expires) {
            expiredVerifications.push(email);
        }
    }
    
    expiredVerifications.forEach(email => {
        pendingVerifications.delete(email);
        console.log(`[CLEANUP] Expired verification for ${email}`);
    });
    
    // Clean old usage data
    const oneDay = 24 * 60 * 60 * 1000;
    for (const [userIdentifier, usage] of guestUsage.entries()) {
        // Remove entries older than 24 hours
        usage.hourlyUsage = usage.hourlyUsage.filter(timestamp => now - timestamp < 60 * 60 * 1000);
        usage.dailyUsage = usage.dailyUsage.filter(timestamp => now - timestamp < oneDay);
        
        // Remove users with no recent activity
        if (usage.hourlyUsage.length === 0 && usage.dailyUsage.length === 0) {
            guestUsage.delete(userIdentifier);
        } else {
            guestUsage.set(userIdentifier, usage);
        }
    }
    
    if (expiredVerifications.length > 0 || guestUsage.size > 0) {
        console.log(`[CLEANUP] ${expiredVerifications.length} expired verifications, ${guestUsage.size} active users`);
    }
}, 60 * 60 * 1000); // Run every hour

// Default route
app.get("/", (req, res) => {
    res.redirect('/index.html');
});

// Health check endpoint for Railway
app.get("/health", (req, res) => {
    res.status(200).json({ 
        status: "healthy", 
        timestamp: new Date().toISOString(),
        baseUrl: getBaseUrl()
    });
});

// Start server
async function startServer() {
    if (!nodemailer) {
        console.log('[CRITICAL] Nodemailer could not be imported');
        console.log('[INFO] Please install nodemailer: npm install nodemailer');
        console.log('[INFO] Then restart the server');
    }
    
    await initializeEmailTransporter();
    
    const port = process.env.PORT || 3000;
    const baseUrl = getBaseUrl();
    
    app.listen(port, '0.0.0.0', () => {
        console.log("\n" + "=".repeat(60));
        console.log("[SUCCESS] Roblox Luau AI Server Running");
        console.log(`[PORT] ${port}`);
        console.log(`[BASE_URL] ${baseUrl}`);
        console.log(`[HEALTH] ${baseUrl}/health`);
        console.log(`[LOGIN] ${baseUrl}/login.html`);
        console.log(`[CHAT] ${baseUrl}/index.html`);
        console.log(`[EMAIL] ${emailTransporter ? "ENABLED" : "DISABLED"}`);
        console.log(`[ENVIRONMENT] ${process.env.NODE_ENV || 'development'}`);
        
        // Railway-specific logs
        if (process.env.RAILWAY_STATIC_URL) {
            console.log(`[RAILWAY] Deployed on Railway`);
            console.log(`[RAILWAY_URL] https://${process.env.RAILWAY_STATIC_URL}`);
        }
        
        console.log("\n[USAGE LIMITS] (Guests Only):");
        Object.entries(USAGE_LIMITS).forEach(([model, limits]) => {
            console.log(`   ${model}: ${limits.dailyLimit}/day, ${limits.hourlyLimit}/hour`);
        });
        
        console.log("\n[GOOGLE OAUTH]");
        console.log(`   Redirect URI: ${baseUrl}/auth/google/callback`);
        console.log(`   Make sure this is added to Google Cloud Console`);
        
        if (!emailTransporter) {
            console.log("\n[WARNING] Email verification is DISABLED!");
            console.log("[INFO] Set EMAIL_USER and EMAIL_PASSWORD environment variables to enable");
        }
        
        console.log("=".repeat(60) + "\n");
    });
}

startServer().catch(error => {
    console.error('[FATAL] Failed to start server:', error);
    process.exit(1);
});
