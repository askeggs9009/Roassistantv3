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

// TESTING: Usage limits configuration - SET TO 1 FOR TESTING - APPLIES TO ALL USERS
const USAGE_LIMITS = {
    "gpt-4o-mini": {
        dailyLimit: 1,         // TESTING: 1 message per day for ALL users
        hourlyLimit: 1,        // TESTING: 1 message per hour for ALL users
        cost: 0.15,           // $0.15 per 1M input tokens
        description: "Basic AI model - Testing limits"
    },
    "gpt-4.1": {
        dailyLimit: 1,         // TESTING: 1 message per day for ALL users
        hourlyLimit: 1,        // TESTING: 1 message per hour for ALL users
        cost: 2.00,           // $2.00 per 1M input tokens
        description: "Advanced AI model - Testing limits"
    },
    "gpt-5": {
        dailyLimit: 1,         // TESTING: 1 message per day for ALL users
        hourlyLimit: 1,        // TESTING: 1 message per hour for ALL users
        cost: 3.00,           // Estimated $3.00+ per 1M tokens
        description: "Premium AI model - Testing limits"
    }
};

// Store for tracking guest usage (in production, use Redis or database)
const guestUsage = new Map();

// Helper function to get user identifier (IP + User Agent hash for guests)
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

// Middleware to check usage limits for ALL users (including authenticated)
function checkUsageLimits(req, res, next) {
    const userIdentifier = getUserIdentifier(req);
    const isAuthenticated = req.user !== null;
    const model = req.body.model || "gpt-4o-mini";
    
    console.log(`[USAGE CHECK] User: ${userIdentifier}, Model: ${model}, Auth: ${isAuthenticated}`);
    
    // CHANGED: Apply limits to ALL users (including authenticated ones)
    const limitCheck = checkUsageLimit(userIdentifier, model);
    
    if (!limitCheck.allowed) {
        console.log(`[LIMIT REACHED] ${limitCheck.error}`);
        return res.status(429).json({
            error: limitCheck.error,
            resetTime: limitCheck.resetTime,
            limitsInfo: limitCheck.limitsInfo,
            upgradeMessage: isAuthenticated ? 
                "Even premium users have limits during testing. Contact support for unlimited access." :
                "Sign up for unlimited access to all models!",
            requiresAuth: !isAuthenticated,
            signUpUrl: "/login.html",
            userType: isAuthenticated ? "authenticated" : "guest"
        });
    }
    
    // Record this usage
    recordUsage(userIdentifier, model);
    console.log(`[USAGE RECORDED] User: ${userIdentifier} (${isAuthenticated ? 'authenticated' : 'guest'})`);
    
    // Add usage info to response headers
    res.set({
        'X-Usage-Hourly': `${limitCheck.limitsInfo.hourlyUsed + 1}/${limitCheck.limitsInfo.hourlyLimit}`,
        'X-Usage-Daily': `${limitCheck.limitsInfo.dailyUsed + 1}/${limitCheck.limitsInfo.dailyLimit}`,
        'X-Rate-Limit-Model': model,
        'X-User-Type': isAuthenticated ? 'authenticated' : 'guest'
    });
    
    next();
}

// Email transporter
let emailTransporter = null;

console.log('[EMAIL CONFIG CHECK]');
console.log('EMAIL_USER:', process.env.EMAIL_USER ? `${process.env.EMAIL_USER.substring(0, 3)}***@${process.env.EMAIL_USER.split('@')[1]}` : '[NOT SET]');
console.log('EMAIL_PASSWORD:', process.env.EMAIL_PASSWORD ? `[SET] (${process.env.EMAIL_PASSWORD.length} characters)` : '[NOT SET]');
console.log('EMAIL_FROM:', process.env.EMAIL_FROM ? `${process.env.EMAIL_FROM.substring(0, 3)}***@${process.env.EMAIL_FROM.split('@')[1]}` : '[Will use EMAIL_USER]');

// Initialize email transporter
async function initializeEmailTransporter() {
    console.log('\n[EMAIL INIT] Initializing Email System...');
    
    if (!nodemailer) {
        console.log('[CRITICAL] Nodemailer not available!');
        console.log('[INFO] Please install nodemailer: npm install nodemailer');
        console.log('[INFO] Then restart the server');
        return false;
    }
    
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
        console.log('[CRITICAL] Email configuration missing!');
        console.log('[INFO] Email verification is REQUIRED for this application');
        console.log('\n[CONFIG] Add these to your .env file:');
        console.log('EMAIL_USER=your-email@gmail.com');
        console.log('EMAIL_PASSWORD=your-gmail-app-password');
        console.log('EMAIL_FROM=your-email@gmail.com  # Optional');
        console.log('\n[HELP] For Gmail App Password:');
        console.log('1. Enable 2-factor authentication');
        console.log('2. Visit: https://myaccount.google.com/apppasswords');
        console.log('3. Generate App Password for "Mail"');
        console.log('4. Use the 16-character password (no spaces)');
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
                rejectUnauthorized: false // Accept self-signed certificates
            },
            secure: false, // Use STARTTLS instead of direct SSL
            requireTLS: true // Require TLS encryption
        });

        console.log('[EMAIL] Testing connection...');
        
        // Test the connection
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
        console.log(`[EMAIL] Emails will be sent from: ${process.env.EMAIL_FROM || process.env.EMAIL_USER}`);
        return true;

    } catch (error) {
        console.log('[ERROR] Email system failed:', error.message);
        
        if (error.code === 'EAUTH' || error.responseCode === 535) {
            console.log('\n[AUTH ERROR SOLUTIONS]');
            console.log('1. Verify 2-factor authentication is enabled');
            console.log('2. Generate new App Password at: https://myaccount.google.com/apppasswords');
            console.log('3. Copy the 16-character password exactly (no spaces)');
            console.log('4. Do NOT use your regular Gmail password');
        } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            console.log('\n[CONNECTION ERROR] Check:');
            console.log('1. Internet connection');
            console.log('2. Firewall settings');
            console.log('3. VPN/proxy settings');
        }
        
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
        throw new Error('Email system not configured. Please check server logs for email setup instructions.');
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
                        ${name ? `Hi ${name}, t` : 'T'}hanks for signing up! To complete your account setup and start using the AI assistant with unlimited access, please enter the verification code below:
                    </p>
                    
                    <div style="background: linear-gradient(135deg, #f6f8fa 0%, #e1e4e8 100%); border: 2px solid #d0d7de; border-radius: 12px; padding: 25px; text-align: center; margin: 25px 0;">
                        <div style="font-size: 36px; font-weight: bold; color: #0d1117; letter-spacing: 4px; font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace; margin-bottom: 8px;">
                            ${code}
                        </div>
                        <p style="margin: 0; color: #656d76; font-size: 14px; font-weight: 500;">This code expires in 15 minutes</p>
                    </div>
                    
                    <div style="background: #fff8c5; border: 1px solid #d4ac0d; border-radius: 8px; padding: 12px; margin: 20px 0;">
                        <p style="margin: 0; color: #7d6608; font-size: 14px; line-height: 1.4;">
                            <strong>Security Note:</strong> If you didn't create this account, you can safely ignore this email.
                        </p>
                    </div>
                    
                    <div style="text-align: center; margin-top: 25px;">
                        <p style="color: #656d76; font-size: 14px; margin: 0;">
                            Having trouble? Check your spam folder or contact support.
                        </p>
                    </div>
                </div>
                
                <div style="text-align: center; padding: 20px; color: #656d76; font-size: 12px;">
                    <p style="margin: 0;">This email was sent by Roblox Luau AI Assistant</p>
                    <p style="margin: 5px 0 0 0;">© 2024 - Powered by AI for Roblox Development</p>
                </div>
            </div>
        `
    };

    try {
        console.log(`[EMAIL] Sending verification to ${email}...`);
        const result = await emailTransporter.sendMail(mailOptions);
        console.log('[SUCCESS] Verification email sent!');
        console.log(`[EMAIL] Message ID: ${result.messageId}`);
        return true;
    } catch (error) {
        console.error('[ERROR] Failed to send verification email:', error.message);
        throw error;
    }
}

// Google OAuth2 client
const googleClient = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.BASE_URL || 'http://localhost:3000'}/auth/google/callback`
);

// Available model configurations
const MODEL_CONFIGS = {
    "gpt-4o-mini": {
        model: "gpt-4o-mini",
        requiresAuth: false
    },
    "gpt-4.1": {
        model: "gpt-4",
        requiresAuth: false  // Available to guests with limits
    },
    "gpt-5": {
        model: "gpt-4",
        requiresAuth: false  // Available to guests with limits
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

        res.redirect(`/login-success.html?token=${token}&user=${encodeURIComponent(JSON.stringify({
            id: user.id,
            email: user.email,
            name: user.name,
            picture: user.picture
        }))}`);
    } catch (error) {
        console.error("[ERROR] Google auth error:", error);
        res.redirect('/login.html?error=google_auth_failed');
    }
});

// TESTING: Reset all usage data for testing
app.post("/reset-usage", (req, res) => {
    guestUsage.clear();
    console.log('[TESTING] All usage data cleared (affects all users)');
    res.json({ 
        message: "Usage data cleared successfully",
        note: "All users (guests and authenticated) can now use models again"
    });
});

// TESTING: Debug current usage
app.get("/debug-usage", optionalAuthenticateToken, (req, res) => {
    const userIdentifier = getUserIdentifier(req);
    const usage = guestUsage.get(userIdentifier);
    const isAuthenticated = req.user !== null;
    
    res.json({
        userIdentifier: userIdentifier,
        userType: isAuthenticated ? "authenticated" : "guest",
        usage: usage || "No usage data found",
        totalActiveUsers: guestUsage.size,
        limits: USAGE_LIMITS,
        note: "All users have limits during testing"
    });
});

// API endpoint to get current usage limits for ALL users
app.get("/usage-limits", optionalAuthenticateToken, (req, res) => {
    const userIdentifier = getUserIdentifier(req);
    const isAuthenticated = req.user !== null;
    
    // CHANGED: Show limits for all users, not just guests
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
        type: isAuthenticated ? "authenticated_with_limits" : "guest",
        limits: limits,
        message: isAuthenticated ? 
            "Testing mode: All users have limits. Contact support for unlimited access." :
            "Sign up to track your usage and get priority support",
        upgradeIncentive: isAuthenticated ? {
            testing: true,
            contactSupport: true,
            features: ["Priority Support", "Account Management", "Usage Analytics"]
        } : {
            unlimited: false, // Changed during testing
            noWaiting: false,
            priority: true,
            features: ["Account Management", "Usage Analytics", "Priority Support"]
        }
    });
});

// AI chat endpoint with usage limits for ALL users
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

        // Add usage info to response for ALL users
        const userIdentifier = getUserIdentifier(req);
        const limitCheck = checkUsageLimit(userIdentifier, model);
        
        let responseData = { 
            reply: response.choices[0].message.content, 
            model: model,
            usageInfo: {
                dailyUsed: limitCheck.limitsInfo.dailyUsed,
                dailyLimit: USAGE_LIMITS[model].dailyLimit,
                hourlyUsed: limitCheck.limitsInfo.hourlyUsed,
                hourlyLimit: USAGE_LIMITS[model].hourlyLimit,
                userType: isAuthenticated ? "authenticated" : "guest",
                upgradeMessage: limitCheck.limitsInfo.dailyUsed >= USAGE_LIMITS[model].dailyLimit - 1 ? 
                    (isAuthenticated ? 
                        "Testing mode: Contact support for unlimited access." :
                        "You're almost out! Sign up for account management.") : null
            }
        };

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

// Get available models with usage info for ALL users
app.get("/models", optionalAuthenticateToken, (req, res) => {
    const isAuthenticated = req.user !== null;
    const userIdentifier = getUserIdentifier(req);
    
    const models = Object.keys(MODEL_CONFIGS).map(key => {
        const modelInfo = {
            name: key,
            model: MODEL_CONFIGS[key].model,
            requiresAuth: false // Changed: no auth required, but all have limits
        };

        // Show limits for ALL users
        const limitCheck = checkUsageLimit(userIdentifier, key);
        const limits = USAGE_LIMITS[key];
        
        modelInfo.limits = {
            dailyUsed: limitCheck.limitsInfo ? limitCheck.limitsInfo.dailyUsed : 0,
            dailyLimit: limits.dailyLimit,
            hourlyUsed: limitCheck.limitsInfo ? limitCheck.limitsInfo.hourlyUsed : 0,
            hourlyLimit: limits.hourlyLimit,
            description: limits.description
        };

        return modelInfo;
    });
    
    res.json({ 
        models,
        isAuthenticated,
        allUsersHaveLimits: true, // New flag
        message: isAuthenticated ? 
            "Testing mode: All users have usage limits" : 
            "Sign up for account management and priority support"
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

// Start server
async function startServer() {
    if (!nodemailer) {
        console.log('[CRITICAL] Nodemailer could not be imported');
        console.log('[INFO] Please install nodemailer: npm install nodemailer');
        console.log('[INFO] Then restart the server');
    }
    
    await initializeEmailTransporter();
    
    app.listen(3000, () => {
        console.log("\n" + "=".repeat(50));
        console.log("[SUCCESS] Roblox Luau AI Server Running");
        console.log("[URL] http://localhost:3000");
        console.log("[LOGIN] http://localhost:3000/login.html");
        console.log("[CHAT] http://localhost:3000/index.html");
        console.log(`[EMAIL] ${emailTransporter ? "ENABLED" : "DISABLED"}`);
        console.log("[LIMITS] ENABLED FOR ALL USERS (TESTING MODE)");
        
        console.log("\n[TESTING USAGE LIMITS] (ALL USERS):");
        Object.entries(USAGE_LIMITS).forEach(([model, limits]) => {
            console.log(`   ${model}: ${limits.dailyLimit}/day, ${limits.hourlyLimit}/hour`);
        });
        
        console.log("\n[TESTING NOTES]");
        console.log("   - Both guests AND authenticated users have limits");
        console.log("   - Use POST /reset-usage to clear all usage data");
        console.log("   - Use GET /debug-usage to check current usage");
        
        console.log("\n[TESTING ENDPOINTS]");
        console.log("   POST /reset-usage - Clear all usage data");
        console.log("   GET /debug-usage - Check current usage");
        console.log("   GET /usage-limits - Check limits status");
        
        if (!emailTransporter) {
            console.log("\n[WARNING] Email verification is REQUIRED!");
            if (!nodemailer) {
                console.log("[INSTALL] npm install nodemailer");
            } else {
                console.log("[CONFIG] Configure email in .env file to enable signups");
            }
        }
        
        console.log("=".repeat(50) + "\n");
    });
}

startServer();