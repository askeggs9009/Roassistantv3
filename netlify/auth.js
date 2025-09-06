// 1. Create netlify/functions/auth.js (NEW FILE)
const express = require('express');
const serverless = require('serverless-http');
const OpenAI = require('openai').default;
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { google } = require('googleapis');
const path = require('path');
const crypto = require('crypto');

// Create require function for CommonJS modules
const { createRequire } = require('module');
const require2 = createRequire(import.meta.url || __filename);

// Import nodemailer using CommonJS
let nodemailer = null;
try {
    nodemailer = require2('nodemailer');
    console.log('[SUCCESS] Nodemailer imported successfully');
} catch (error) {
    console.log('[ERROR] Failed to import nodemailer:', error.message);
}

dotenv.config();

const app = express();
app.use(cors({
    origin: ['https://musical-youtiao-b05928.netlify.app', 'http://localhost:3000'],
    credentials: true
}));
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';
const users = new Map();
const pendingVerifications = new Map();

// TESTING: Usage limits configuration
const USAGE_LIMITS = {
    "gpt-4o-mini": {
        dailyLimit: 1,
        hourlyLimit: 1,
        cost: 0.15,
        description: "Basic AI model - Testing limits"
    },
    "gpt-4.1": {
        dailyLimit: 1,
        hourlyLimit: 1,
        cost: 2.00,
        description: "Advanced AI model - Testing limits"
    },
    "gpt-5": {
        dailyLimit: 1,
        hourlyLimit: 1,
        cost: 3.00,
        description: "Premium AI model - Testing limits"
    }
};

const guestUsage = new Map();

// Google OAuth2 client - UPDATED for Netlify
const googleClient = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'https://musical-youtiao-b05928.netlify.app/.netlify/functions/auth/auth/google/callback'
);

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
        console.log('[CRITICAL] Email configuration missing!');
        return false;
    }

    try {
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

// Helper functions (getUserIdentifier, checkUsageLimit, etc. - same as before)
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
                    <h1 style="margin: 0; font-size: 24px; font-weight: 600;">Welcome to Roblox Luau AI!</h1>
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

// Routes
app.post("/auth/signup", async (req, res) => {
    try {
        const { email, password, name } = req.body;

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
            return res.status(503).json({ 
                error: 'Email verification system is not configured.',
                details: 'The server needs email configuration to send verification codes.'
            });
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
            message: 'Verification code sent to your email.',
            email: email,
            requiresVerification: true,
            expiresIn: '15 minutes'
        });

    } catch (error) {
        console.error("[ERROR] Signup error:", error);
        res.status(500).json({ error: 'Internal server error occurred during signup' });
    }
});

app.post("/auth/verify-email", async (req, res) => {
    try {
        const { email, verificationCode } = req.body;

        if (!email || !verificationCode) {
            return res.status(400).json({ error: 'Email and verification code are required' });
        }

        const pendingVerification = pendingVerifications.get(email);

        if (!pendingVerification) {
            return res.status(400).json({ 
                error: 'No pending verification found for this email.',
                action: 'signup_required'
            });
        }

        if (Date.now() > pendingVerification.expires) {
            pendingVerifications.delete(email);
            return res.status(400).json({ 
                error: 'Verification code has expired.',
                action: 'signup_required'
            });
        }

        if (pendingVerification.verificationCode !== verificationCode) {
            return res.status(400).json({ 
                error: 'Invalid verification code.',
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
            lastLogin: new Date()
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
                emailVerified: user.emailVerified
            },
            message: 'Account created and verified successfully!'
        });

    } catch (error) {
        console.error("[ERROR] Email verification error:", error);
        res.status(500).json({ error: 'Internal server error during email verification' });
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

// Google OAuth - UPDATED for Netlify
app.get("/auth/google", (req, res) => {
    const scopes = ['email', 'profile'];
    const authUrl = googleClient.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
    });
    res.redirect(authUrl);
});

// UPDATED Google OAuth callback for Netlify
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

        // UPDATED redirect URL for Netlify
        res.redirect(`https://musical-youtiao-b05928.netlify.app/login-success.html?token=${token}&user=${encodeURIComponent(JSON.stringify({
            id: user.id,
            email: user.email,
            name: user.name,
            picture: user.picture
        }))}`);
    } catch (error) {
        console.error("[ERROR] Google auth error:", error);
        res.redirect('https://musical-youtiao-b05928.netlify.app/login.html?error=google_auth_failed');
    }
});

// AI chat endpoint
app.post("/ask", optionalAuthenticateToken, async (req, res) => {
    try {
        const { prompt, model = "gpt-4o-mini" } = req.body;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "You are a helpful Roblox Luau scripting assistant." },
                { role: "user", content: prompt }
            ],
            max_tokens: 2000,
            temperature: 0.7
        });

        res.json({ 
            reply: response.choices[0].message.content, 
            model: model
        });
    } catch (error) {
        console.error("[ERROR] AI Error:", error);
        res.status(500).json({ error: error.message || "An error occurred" });
    }
});

// Initialize email on startup
initializeEmailTransporter();

module.exports.handler = serverless(app);