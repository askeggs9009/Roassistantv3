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
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

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
        }
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
        }
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
        }
    }
};

// Usage tracking with subscription tiers
const userUsage = new Map();

function getUserPlan(userId) {
    const user = users.get(userId);
    if (!user) return SUBSCRIPTION_PLANS.free;
    
    const plan = user.subscription?.plan || 'free';
    return SUBSCRIPTION_PLANS[plan] || SUBSCRIPTION_PLANS.free;
}

function checkSubscriptionLimits(userId, model) {
    const userPlan = getUserPlan(userId);
    const limits = userPlan.limits;
    
    // Check if model is allowed in plan
    if (!limits.models.includes(model)) {
        return {
            allowed: false,
            error: `${model} is not available in your ${userPlan.name} plan. Please upgrade to access this model.`,
            requiresUpgrade: true,
            availableModels: limits.models
        };
    }
    
    // Check daily message limit
    if (limits.daily_messages !== -1) {
        const today = new Date().toDateString();
        if (!userUsage.has(userId)) {
            userUsage.set(userId, {});
        }
        
        const usage = userUsage.get(userId);
        if (!usage[today]) {
            usage[today] = 0;
        }
        
        if (usage[today] >= limits.daily_messages) {
            return {
                allowed: false,
                error: `Daily message limit reached (${limits.daily_messages} messages). Upgrade for more messages!`,
                requiresUpgrade: true,
                resetTime: new Date(new Date().setHours(24, 0, 0, 0))
            };
        }
    }
    
    return { allowed: true };
}

function recordUserUsage(userId) {
    const today = new Date().toDateString();
    if (!userUsage.has(userId)) {
        userUsage.set(userId, {});
    }
    
    const usage = userUsage.get(userId);
    if (!usage[today]) {
        usage[today] = 0;
    }
    usage[today]++;
    
    userUsage.set(userId, usage);
}

const getBaseUrl = () => {
    if (process.env.RAILWAY_STATIC_URL) {
        return `https://${process.env.RAILWAY_STATIC_URL}`;
    }
    if (process.env.BASE_URL) {
        return process.env.BASE_URL;
    }
    const port = process.env.PORT || 3000;
    return `http://localhost:${port}`;
};

const getGoogleClient = () => {
    const baseUrl = getBaseUrl();
    console.log(`[OAUTH] Using base URL: ${baseUrl}`);
    
    return new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        `${baseUrl}/auth/google/callback`
    );
};

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
        subject: 'Verify Your Roblox Luau AI Assistant Account',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h1>Welcome to Roblox Luau AI!</h1>
                <p>Thanks for signing up! Please enter this verification code:</p>
                <div style="background: #f0f0f0; padding: 20px; text-align: center; font-size: 24px; font-weight: bold; margin: 20px 0;">
                    ${code}
                </div>
                <p>This code expires in 15 minutes.</p>
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

// Stripe Webhook Handler
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

    // Handle the event
    switch (event.type) {
        case 'checkout.session.completed':
            const session = event.data.object;
            await handleSuccessfulSubscription(session);
            break;
            
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
            const subscription = event.data.object;
            await handleSubscriptionChange(subscription);
            break;
            
        default:
            console.log(`[STRIPE] Unhandled event type ${event.type}`);
    }

    res.json({received: true});
});

async function handleSuccessfulSubscription(session) {
    const userEmail = session.customer_email;
    const user = users.get(userEmail);
    
    if (user) {
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        const priceId = subscription.items.data[0].price.id;
        
        // Determine plan based on price ID
        let plan = 'free';
        if (priceId === process.env.STRIPE_PRO_MONTHLY_PRICE_ID || 
            priceId === process.env.STRIPE_PRO_ANNUAL_PRICE_ID) {
            plan = 'pro';
        } else if (priceId === process.env.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID || 
                   priceId === process.env.STRIPE_ENTERPRISE_ANNUAL_PRICE_ID) {
            plan = 'enterprise';
        }
        
        user.subscription = {
            plan: plan,
            stripeCustomerId: session.customer,
            stripeSubscriptionId: session.subscription,
            status: 'active',
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            cancelAtPeriodEnd: subscription.cancel_at_period_end
        };
        
        users.set(userEmail, user);
        console.log(`[SUBSCRIPTION] User ${userEmail} upgraded to ${plan}`);
    }
}

async function handleSubscriptionChange(subscription) {
    // Find user by Stripe customer ID
    for (const [email, user] of users.entries()) {
        if (user.subscription?.stripeCustomerId === subscription.customer) {
            if (subscription.status === 'canceled' || subscription.status === 'unpaid') {
                user.subscription.status = 'canceled';
                user.subscription.plan = 'free';
            } else {
                user.subscription.status = subscription.status;
                user.subscription.currentPeriodEnd = new Date(subscription.current_period_end * 1000);
                user.subscription.cancelAtPeriodEnd = subscription.cancel_at_period_end;
            }
            
            users.set(email, user);
            console.log(`[SUBSCRIPTION] Updated subscription for ${email}: ${subscription.status}`);
            break;
        }
    }
}

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
        const today = new Date().toDateString();
        const usage = userUsage.get(user.email)?.[today] || 0;
        
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

// Change Plan (Upgrade/Downgrade)
app.post("/api/change-plan", authenticateToken, async (req, res) => {
    try {
        const { plan } = req.body;
        const user = users.get(req.user.email);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        if (plan === 'free') {
            // Downgrade to free - cancel subscription
            if (user.subscription?.stripeSubscriptionId) {
                await stripe.subscriptions.cancel(user.subscription.stripeSubscriptionId);
            }
            
            user.subscription = { plan: 'free', status: 'active' };
            users.set(req.user.email, user);
            
            return res.json({ success: true, message: 'Downgraded to free plan' });
        }
        
        // For upgrades, redirect to checkout
        res.json({ 
            success: false, 
            redirect: true,
            message: 'Please use the checkout process to upgrade your plan'
        });
    } catch (error) {
        console.error('[ERROR] Failed to change plan:', error);
        res.status(500).json({ error: 'Failed to change plan' });
    }
});

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

        if (!emailTransporter) {
            // If email not configured, create account directly
            const hashedPassword = await bcrypt.hash(password, 10);
            const user = {
                id: Date.now().toString(),
                email: email,
                password: hashedPassword,
                name: name,
                createdAt: new Date(),
                provider: 'email',
                emailVerified: false,
                lastLogin: new Date(),
                subscription: { plan: 'free', status: 'active' }
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
                message: 'Account created successfully!'
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
                error: 'Failed to send verification email. Please try again later.'
            });
        }

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
                emailVerified: user.emailVerified,
                subscription: user.subscription
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
                lastLogin: new Date(),
                subscription: { plan: 'free', status: 'active' }
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

        const frontendUrl = process.env.FRONTEND_URL || 'https://musical-youtiao-b05928.netlify.app';
        res.redirect(`${frontendUrl}/login-success.html?token=${token}&user=${encodeURIComponent(JSON.stringify({
            id: user.id,
            email: user.email,
            name: user.name,
            picture: user.picture,
            subscription: user.subscription
        }))}`);
    } catch (error) {
        console.error("[ERROR] Google auth error:", error);
        const frontendUrl = process.env.FRONTEND_URL || 'https://musical-youtiao-b05928.netlify.app';
        res.redirect(`${frontendUrl}/login.html?error=google_auth_failed`);
    }
});

app.post("/ask", authenticateToken, async (req, res) => {
    try {
        const { prompt, model = "gpt-4o-mini" } = req.body;
        const userId = req.user.email;

        // Check subscription limits
        const limitCheck = checkSubscriptionLimits(userId, model);
        if (!limitCheck.allowed) {
            return res.status(403).json(limitCheck);
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

        // Record usage
        recordUserUsage(userId);

        // Get updated usage info
        const userPlan = getUserPlan(userId);
        const today = new Date().toDateString();
        const usage = userUsage.get(userId)?.[today] || 0;

        res.json({ 
            reply: response.choices[0].message.content, 
            model: model,
            usageInfo: {
                messagesUsed: usage,
                dailyLimit: userPlan.limits.daily_messages,
                plan: userPlan.name
            }
        });
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

app.get("/models", authenticateToken, (req, res) => {
    const userId = req.user.email;
    const userPlan = getUserPlan(userId);
    
    const models = Object.keys(MODEL_CONFIGS).map(key => {
        const modelInfo = {
            name: key,
            model: MODEL_CONFIGS[key].model,
            available: userPlan.limits.models.includes(key),
            requiresPlan: MODEL_CONFIGS[key].requiresPlan
        };
        
        return modelInfo;
    });
    
    res.json({ 
        models,
        currentPlan: userPlan.name,
        limits: userPlan.limits
    });
});

// Usage statistics endpoint
app.get("/api/usage-stats", authenticateToken, (req, res) => {
    const userId = req.user.email;
    const userPlan = getUserPlan(userId);
    
    // Get usage for different time periods
    const today = new Date().toDateString();
    const usage = userUsage.get(userId) || {};
    
    const stats = {
        today: usage[today] || 0,
        dailyLimit: userPlan.limits.daily_messages,
        plan: userPlan.name,
        models: userPlan.limits.models,
        scriptsLimit: userPlan.limits.scripts_storage,
        projectsLimit: userPlan.limits.projects
    };
    
    res.json(stats);
});

// Cleanup expired data periodically
setInterval(() => {
    const now = Date.now();
    
    // Clean expired verifications
    for (const [email, verification] of pendingVerifications.entries()) {
        if (now > verification.expires) {
            pendingVerifications.delete(email);
        }
    }
    
    // Clean old usage data (keep only last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    for (const [userId, usage] of userUsage.entries()) {
        const dates = Object.keys(usage);
        dates.forEach(date => {
            if (new Date(date) < sevenDaysAgo) {
                delete usage[date];
            }
        });
        
        if (Object.keys(usage).length === 0) {
            userUsage.delete(userId);
        } else {
            userUsage.set(userId, usage);
        }
    }
}, 60 * 60 * 1000); // Run every hour

app.get("/", (req, res) => {
    res.redirect('/index.html');
});

app.get("/health", (req, res) => {
    res.status(200).json({ 
        status: "healthy", 
        timestamp: new Date().toISOString(),
        baseUrl: getBaseUrl()
    });
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
        
        console.log("\n[SUBSCRIPTION PLANS]:");
        Object.entries(SUBSCRIPTION_PLANS).forEach(([plan, config]) => {
            console.log(`   ${plan}: ${config.limits.daily_messages === -1 ? 'Unlimited' : config.limits.daily_messages} messages/day`);
        });
        
        console.log("=".repeat(60) + "\n");
    });
}

startServer().catch(error => {
    console.error('[FATAL] Server startup failed:', error);
    process.exit(1);
});
