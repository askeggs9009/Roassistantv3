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

console.log('[INIT] Starting Roblox Luau AI Server with Subscription System...');

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

// Trust proxy for accurate IP detection
app.set('trust proxy', 1);

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

// Storage maps
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

// CRITICAL: Stripe Webhook Handler MUST come BEFORE express.json() middleware
app.post('/webhook/stripe', express.raw({type: 'application/json'}), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
        console.log('[STRIPE] Webhook event received:', event.type);
    } catch (err) {
        console.error('[STRIPE] Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    try {
        switch (event.type) {
            case 'checkout.session.completed':
                const session = event.data.object;
                console.log('[STRIPE] Processing checkout session:', session.id);
                await handleSuccessfulSubscription(session);
                break;
                
            case 'customer.subscription.updated':
                const updatedSubscription = event.data.object;
                console.log('[STRIPE] Subscription updated:', updatedSubscription.id);
                await handleSubscriptionUpdate(updatedSubscription);
                break;
                
            case 'customer.subscription.deleted':
                const deletedSubscription = event.data.object;
                console.log('[STRIPE] Subscription cancelled:', deletedSubscription.id);
                await handleSubscriptionCancellation(deletedSubscription);
                break;
                
            case 'invoice.payment_succeeded':
                const invoice = event.data.object;
                console.log('[STRIPE] Payment succeeded for invoice:', invoice.id);
                await handleSuccessfulPayment(invoice);
                break;
                
            case 'invoice.payment_failed':
                const failedInvoice = event.data.object;
                console.log('[STRIPE] Payment failed for invoice:', failedInvoice.id);
                await handleFailedPayment(failedInvoice);
                break;

            default:
                console.log('[STRIPE] Unhandled event type:', event.type);
        }

        res.json({received: true});
    } catch (error) {
        console.error('[STRIPE] Error processing webhook:', error);
        res.status(500).json({error: 'Webhook processing failed'});
    }
});

// NOW add the JSON middleware AFTER the webhook
app.use(express.json());
app.use(express.static(__dirname));

// Enhanced function to handle successful subscription
async function handleSuccessfulSubscription(session) {
    try {
        console.log('[SUBSCRIPTION] Processing successful subscription...');
        console.log('[SUBSCRIPTION] Customer email:', session.customer_details?.email);
        console.log('[SUBSCRIPTION] Subscription ID:', session.subscription);
        
        const customerEmail = session.customer_details?.email;
        if (!customerEmail) {
            console.error('[SUBSCRIPTION] No customer email found in session');
            return;
        }

        // Find user by email
        const user = users.get(customerEmail);
        if (!user) {
            console.error(`[SUBSCRIPTION] User not found with email: ${customerEmail}`);
            return;
        }

        // Get subscription details from Stripe
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        console.log('[SUBSCRIPTION] Retrieved subscription details:', subscription.id);

        // Determine plan based on price ID
        let plan = 'free';
        const priceId = subscription.items.data[0]?.price?.id;
        
        console.log('[SUBSCRIPTION] Price ID:', priceId);
        console.log('[SUBSCRIPTION] Expected Pro Monthly:', process.env.STRIPE_PRO_MONTHLY_PRICE_ID);
        console.log('[SUBSCRIPTION] Expected Pro Annual:', process.env.STRIPE_PRO_ANNUAL_PRICE_ID);
        
        if (priceId === process.env.STRIPE_PRO_MONTHLY_PRICE_ID || 
            priceId === process.env.STRIPE_PRO_ANNUAL_PRICE_ID) {
            plan = 'pro';
        } else if (priceId === process.env.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID || 
                   priceId === process.env.STRIPE_ENTERPRISE_ANNUAL_PRICE_ID) {
            plan = 'enterprise';
        }

        // Update user subscription
        user.subscription = {
            plan: plan,
            stripeCustomerId: session.customer,
            stripeSubscriptionId: session.subscription,
            status: subscription.status,
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
            priceId: priceId
        };

        users.set(customerEmail, user);
        console.log(`[SUBSCRIPTION] User ${customerEmail} upgraded to ${plan} plan`);

        // Send confirmation email (optional)
        if (nodemailer && process.env.EMAIL_ENABLED === 'true') {
            try {
                await sendSubscriptionConfirmationEmail(customerEmail, plan);
            } catch (emailError) {
                console.error('[EMAIL] Failed to send confirmation:', emailError.message);
            }
        }

    } catch (error) {
        console.error('[SUBSCRIPTION] Error handling successful subscription:', error);
        throw error;
    }
}

// Handle subscription updates (plan changes, renewals)
async function handleSubscriptionUpdate(subscription) {
    try {
        console.log('[SUBSCRIPTION] Handling subscription update...');
        
        // Get customer details
        const customer = await stripe.customers.retrieve(subscription.customer);
        const customerEmail = customer.email;
        
        if (!customerEmail) {
            console.error('[SUBSCRIPTION] No customer email found');
            return;
        }

        const user = users.get(customerEmail);
        if (!user) {
            console.error(`[SUBSCRIPTION] User not found: ${customerEmail}`);
            return;
        }

        // Update subscription details
        if (user.subscription) {
            user.subscription.status = subscription.status;
            user.subscription.currentPeriodEnd = new Date(subscription.current_period_end * 1000);
            user.subscription.cancelAtPeriodEnd = subscription.cancel_at_period_end || false;
            
            users.set(customerEmail, user);
            console.log(`[SUBSCRIPTION] Updated subscription for ${customerEmail}`);
        }

    } catch (error) {
        console.error('[SUBSCRIPTION] Error handling subscription update:', error);
    }
}

// Handle subscription cancellations
async function handleSubscriptionCancellation(subscription) {
    try {
        console.log('[SUBSCRIPTION] Handling subscription cancellation...');
        
        const customer = await stripe.customers.retrieve(subscription.customer);
        const customerEmail = customer.email;
        
        if (!customerEmail) {
            console.error('[SUBSCRIPTION] No customer email found');
            return;
        }

        const user = users.get(customerEmail);
        if (!user) {
            console.error(`[SUBSCRIPTION] User not found: ${customerEmail}`);
            return;
        }

        // Downgrade to free plan
        user.subscription = {
            plan: 'free',
            status: 'cancelled',
            cancelledAt: new Date()
        };

        users.set(customerEmail, user);
        console.log(`[SUBSCRIPTION] User ${customerEmail} downgraded to free plan`);

    } catch (error) {
        console.error('[SUBSCRIPTION] Error handling subscription cancellation:', error);
    }
}

// Handle successful payments (renewals)
async function handleSuccessfulPayment(invoice) {
    try {
        console.log('[PAYMENT] Processing successful payment...');
        
        const customer = await stripe.customers.retrieve(invoice.customer);
        const customerEmail = customer.email;
        
        if (!customerEmail) return;

        const user = users.get(customerEmail);
        if (!user || !user.subscription) return;

        // Update subscription status
        user.subscription.status = 'active';
        user.subscription.currentPeriodEnd = new Date(invoice.lines.data[0]?.period?.end * 1000);
        
        users.set(customerEmail, user);
        console.log(`[PAYMENT] Payment processed for ${customerEmail}`);

    } catch (error) {
        console.error('[PAYMENT] Error handling successful payment:', error);
    }
}

// Handle failed payments
async function handleFailedPayment(invoice) {
    try {
        console.log('[PAYMENT] Processing failed payment...');
        
        const customer = await stripe.customers.retrieve(invoice.customer);
        const customerEmail = customer.email;
        
        if (!customerEmail) return;

        const user = users.get(customerEmail);
        if (!user || !user.subscription) return;

        // Mark subscription as past due
        user.subscription.status = 'past_due';
        users.set(customerEmail, user);
        
        console.log(`[PAYMENT] Payment failed for ${customerEmail}`);

    } catch (error) {
        console.error('[PAYMENT] Error handling failed payment:', error);
    }
}

// Optional: Send subscription confirmation email
async function sendSubscriptionConfirmationEmail(email, plan) {
    if (!nodemailer || !emailTransporter) return;

    const mailOptions = {
        from: process.env.EMAIL_FROM,
        to: email,
        subject: `Welcome to ${plan.toUpperCase()} Plan! 🚀`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>Welcome to ${plan.toUpperCase()} Plan!</h2>
                <p>Your subscription has been activated successfully.</p>
                <p><strong>Plan:</strong> ${plan.toUpperCase()}</p>
                <p><strong>Benefits:</strong></p>
                <ul>
                    ${plan === 'pro' ? `
                        <li>500 messages per day</li>
                        <li>Access to 2 AI models</li>
                        <li>Priority support</li>
                    ` : plan === 'enterprise' ? `
                        <li>Unlimited messages</li>
                        <li>Access to all AI models</li>
                        <li>Premium support</li>
                        <li>Advanced integrations</li>
                    ` : ''}
                </ul>
                <p>Thank you for upgrading! Start using your new features now.</p>
            </div>
        `
    };

    try {
        await emailTransporter.sendMail(mailOptions);
        console.log(`[EMAIL] Confirmation sent to ${email}`);
    } catch (error) {
        console.error('[EMAIL] Failed to send confirmation:', error);
    }
}

// FIXED: Enhanced Google OAuth client with proper error handling
const getGoogleClient = () => {
    const baseUrl = getBaseUrl();
    const redirectUri = `${baseUrl}/auth/google/callback`;
    
    console.log(`[OAUTH] Base URL: ${baseUrl}`);
    console.log(`[OAUTH] Redirect URI: ${redirectUri}`);
    
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        console.error('[ERROR] Google OAuth credentials missing!');
        return null;
    }
    
    try {
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            redirectUri
        );
        
        console.log('[SUCCESS] Google OAuth client created');
        return oauth2Client;
    } catch (error) {
        console.error('[ERROR] Failed to create Google OAuth client:', error.message);
        return null;
    }
};

// Email configuration
console.log('[EMAIL INIT] Initializing Email System...');
let emailTransporter = null;

if (process.env.EMAIL_ENABLED === 'true') {
    console.log('[EMAIL] Creating Gmail SMTP transporter...');
    try {
        emailTransporter = nodemailer.createTransporter({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS // Use App Password for Gmail
            },
            tls: {
                rejectUnauthorized: false
            }
        });

        // Test the connection
        emailTransporter.verify((error, success) => {
            if (error) {
                console.error('[ERROR] Email system failed:', error.message);
                emailTransporter = null;
            } else {
                console.log('[SUCCESS] Email system ready');
            }
        });
    } catch (error) {
        console.error('[ERROR] Failed to initialize email system:', error.message);
        emailTransporter = null;
    }
} else {
    console.log('[EMAIL] Email system disabled');
}

// Guest usage limits (per IP)
const USAGE_LIMITS = {
    'gpt-4o-mini': { dailyLimit: 10, hourlyLimit: 5 },
    'gpt-4.1': { dailyLimit: 5, hourlyLimit: 2 },
    'gpt-5': { dailyLimit: 3, hourlyLimit: 1 }
};

// Helper functions
function getUserIdentifier(req) {
    return req.user ? req.user.email : getClientIp(req);
}

function getClientIp(req) {
    return req.ip || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
           'unknown';
}

function checkUsageLimit(userIdentifier, model) {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentHour = now.getHours();
    
    const limits = USAGE_LIMITS[model];
    if (!limits) return { allowed: true };
    
    const usage = guestUsage.get(userIdentifier) || {};
    const dailyUsage = usage[today] || {};
    const hourlyUsage = dailyUsage[currentHour] || 0;
    const totalDailyUsage = Object.values(dailyUsage).reduce((sum, count) => sum + count, 0);
    
    const dailyAllowed = totalDailyUsage < limits.dailyLimit;
    const hourlyAllowed = hourlyUsage < limits.hourlyLimit;
    
    return {
        allowed: dailyAllowed && hourlyAllowed,
        limitsInfo: {
            dailyUsed: totalDailyUsage,
            hourlyUsed: hourlyUsage,
            dailyLimit: limits.dailyLimit,
            hourlyLimit: limits.hourlyLimit
        }
    };
}

function incrementUsage(userIdentifier, model) {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentHour = now.getHours();
    
    const usage = guestUsage.get(userIdentifier) || {};
    const dailyUsage = usage[today] || {};
    dailyUsage[currentHour] = (dailyUsage[currentHour] || 0) + 1;
    usage[today] = dailyUsage;
    
    guestUsage.set(userIdentifier, usage);
}

// Email verification function
async function sendVerificationEmail(email, verificationToken) {
    if (!emailTransporter) {
        throw new Error('Email system not available');
    }

    const baseUrl = getBaseUrl();
    const verificationLink = `${baseUrl}/auth/verify-email?token=${verificationToken}`;

    const mailOptions = {
        from: process.env.EMAIL_FROM,
        to: email,
        subject: 'Verify Your Email - Roblox AI Assistant',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #333; margin-bottom: 10px;">Welcome to Roblox AI Assistant!</h1>
                    <p style="color: #666; font-size: 16px;">Please verify your email address to get started</p>
                </div>
                
                <div style="background: #f8f9fa; padding: 30px; border-radius: 10px; margin-bottom: 30px;">
                    <p style="color: #333; font-size: 16px; margin-bottom: 20px;">
                        Hi there! Thanks for signing up. To complete your registration and start using our AI assistant, please click the button below to verify your email address:
                    </p>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${verificationLink}" 
                           style="background: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                            Verify Email Address
                        </a>
                    </div>
                    
                    <p style="color: #666; font-size: 14px; margin-top: 20px;">
                        If the button doesn't work, copy and paste this link into your browser:<br>
                        <span style="word-break: break-all; color: #007bff;">${verificationLink}</span>
                    </p>
                    
                    <p style="color: #666; font-size: 14px; margin-top: 20px;">
                        This verification link will expire in 15 minutes for security reasons.
                    </p>
                </div>
                
                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; color: #6c757d; font-size: 14px;">
                    <p>Need help? Contact us at <a href="mailto:${process.env.EMAIL_FROM}" style="color: #007bff;">${process.env.EMAIL_FROM}</a></p>
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

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        env: process.env.NODE_ENV || 'development'
    });
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

// Temporary manual upgrade endpoint
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
            
            res.json({ success: true, message: 'Account upgraded successfully' });
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
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
            return res.status(400).json({ error: 'User already exists with this email' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const userId = crypto.randomUUID();
        
        const newUser = {
            id: userId,
            email: email.toLowerCase(),
            password: hashedPassword,
            name: name || email.split('@')[0],
            createdAt: new Date(),
            emailVerified: process.env.EMAIL_ENABLED !== 'true', // Auto-verify if email disabled
            subscription: { plan: 'free', status: 'active' }
        };

        users.set(email.toLowerCase(), newUser);

        // Send verification email if email system is enabled
        if (process.env.EMAIL_ENABLED === 'true' && emailTransporter) {
            try {
                const verificationToken = jwt.sign(
                    { email: email.toLowerCase(), purpose: 'email_verification' },
                    JWT_SECRET,
                    { expiresIn: '15m' }
                );

                pendingVerifications.set(verificationToken, {
                    email: email.toLowerCase(),
                    createdAt: new Date()
                });

                await sendVerificationEmail(email, verificationToken);

                res.status(201).json({
                    message: 'Account created successfully! Please check your email to verify your account.',
                    requiresVerification: true,
                    email: email.toLowerCase()
                });

            } catch (emailError) {
                console.error('[ERROR] Failed to send verification email:', emailError.message);
                
                // Remove user if email failed to send
                users.delete(email.toLowerCase());
                
                res.status(500).json({ 
                    error: 'Failed to send verification email. Please try again later.' 
                });
            }
        } else {
            // Email verification disabled, auto-login
            const token = jwt.sign(
                { id: userId, email: email.toLowerCase() },
                JWT_SECRET,
                { expiresIn: '7d' }
            );

            console.log(`[SUCCESS] User created and auto-logged in: ${email}`);

            res.status(201).json({
                message: 'Account created successfully!',
                token,
                user: {
                    id: userId,
                    email: email.toLowerCase(),
                    name: newUser.name,
                    createdAt: newUser.createdAt,
                    emailVerified: true,
                    subscription: newUser.subscription
                }
            });
        }

    } catch (error) {
        console.error("[ERROR] Signup error:", error);
        res.status(500).json({ error: 'Internal server error during signup' });
    }
});

app.get("/auth/verify-email", async (req, res) => {
    try {
        const { token } = req.query;

        if (!token) {
            return res.status(400).json({ error: 'Verification token is required' });
        }

        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (jwtError) {
            return res.status(400).json({ error: 'Invalid or expired verification token' });
        }

        if (decoded.purpose !== 'email_verification') {
            return res.status(400).json({ error: 'Invalid token type' });
        }

        const verification = pendingVerifications.get(token);
        if (!verification) {
            return res.status(400).json({ error: 'Verification token not found or already used' });
        }

        const user = users.get(decoded.email);
        if (!user) {
            return res.status(400).json({ error: 'User not found' });
        }

        // Mark email as verified
        user.emailVerified = true;
        user.verifiedAt = new Date();
        users.set(decoded.email, user);

        // Remove the pending verification
        pendingVerifications.delete(token);

        console.log(`[SUCCESS] Email verified for: ${decoded.email}`);

        // Create login token
        const loginToken = jwt.sign(
            { id: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            message: 'Email verified successfully!',
            token: loginToken,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                createdAt: user.createdAt,
                emailVerified: true,
                subscription: user.subscription || { plan: 'free', status: 'active' }
            }
        });

    } catch (error) {
        console.error("[ERROR] Email verification error:", error);
        res.status(500).json({ error: 'Internal server error during verification' });
    }
});

app.post("/auth/resend-verification", async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        const user = users.get(email.toLowerCase());
        if (!user) {
            return res.status(400).json({ error: 'User not found' });
        }

        if (user.emailVerified) {
            return res.status(400).json({ error: 'Email is already verified' });
        }

        if (!emailTransporter) {
            return res.status(500).json({ error: 'Email system not available' });
        }

        try {
            const verificationToken = jwt.sign(
                { email: email.toLowerCase(), purpose: 'email_verification' },
                JWT_SECRET,
                { expiresIn: '15m' }
            );

            pendingVerifications.set(verificationToken, {
                email: email.toLowerCase(),
                createdAt: new Date()
            });

            await sendVerificationEmail(email, verificationToken);

            res.json({ 
                message: 'Verification email sent successfully!',
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
            canUse: limitCheck.allowed
        };
    });
    
    res.json({
        limits,
        isAuthenticated,
        userIdentifier: isAuthenticated ? req.user.email : 'guest'
    });
});

// Google OAuth Routes
app.get("/auth/google", (req, res) => {
    const oauth2Client = getGoogleClient();
    
    if (!oauth2Client) {
        return res.status(500).json({ error: 'OAuth configuration error' });
    }

    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['email', 'profile'],
        prompt: 'select_account'
    });

    console.log('[OAUTH] Redirecting to Google auth URL');
    res.redirect(authUrl);
});

app.get("/auth/google/callback", async (req, res) => {
    try {
        const { code } = req.query;
        
        if (!code) {
            return res.redirect('/login.html?error=missing_code');
        }

        console.log('[OAUTH] Processing callback with code:', code.substring(0, 20) + '...');

        const oauth2Client = getGoogleClient();
        if (!oauth2Client) {
            return res.redirect('/login.html?error=oauth_config_error');
        }

        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const { data } = await oauth2.userinfo.get();

        const email = data.email.toLowerCase();
        const name = data.name;

        let user = users.get(email);

        if (!user) {
            const userId = crypto.randomUUID();
            user = {
                id: userId,
                email: email,
                name: name,
                createdAt: new Date(),
                emailVerified: true,
                subscription: { plan: 'free', status: 'active' },
                googleId: data.id
            };
            users.set(email, user);
            console.log(`[OAUTH] New user created: ${email}`);
        } else {
            user.lastLogin = new Date();
            user.googleId = data.id;
            console.log(`[OAUTH] Existing user logged in: ${email}`);
        }

        const token = jwt.sign(
            { id: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.redirect(`/login.html?token=${token}&user=${encodeURIComponent(JSON.stringify({
            id: user.id,
            email: user.email,
            name: user.name,
            emailVerified: user.emailVerified,
            subscription: user.subscription
        }))}`);

    } catch (error) {
        console.error('[ERROR] OAuth callback error:', error);
        res.redirect('/login.html?error=oauth_failed');
    }
});

// Main AI Chat Endpoint
app.post("/ask", optionalAuthenticateToken, async (req, res) => {
    try {
        const { prompt, model = 'gpt-4o-mini' } = req.body;
        const userIdentifier = getUserIdentifier(req);
        const isAuthenticated = req.user !== null;

        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        // Check usage limits for guests only
        if (!isAuthenticated) {
            const limitCheck = checkUsageLimit(userIdentifier, model);
            
            if (!limitCheck.allowed) {
                return res.status(429).json({
                    error: `Usage limit exceeded for ${model}`,
                    requiresAuth: true,
                    limits: limitCheck.limitsInfo,
                    suggestion: 'Sign up for unlimited access to all models!'
                });
            }
        } else {
            // Check subscription limits for authenticated users
            const user = users.get(req.user.email);
            const userPlan = getUserPlan(req.user.email);
            
            // Check if user has access to this model
            if (!userPlan.limits.models.includes(model)) {
                return res.status(403).json({
                    error: `${model} is not available in your current plan`,
                    requiresUpgrade: true,
                    currentPlan: userPlan.name,
                    availableModels: userPlan.limits.models
                });
            }

            // Check daily message limits (if not unlimited)
            if (userPlan.limits.daily_messages !== -1) {
                const today = new Date().toISOString().split('T')[0];
                const usageKey = `${user.id}_${today}`;
                const usage = dailyUsage.get(usageKey) || 0;
                
                if (usage >= userPlan.limits.daily_messages) {
                    return res.status(429).json({
                        error: 'Daily message limit reached',
                        requiresUpgrade: true,
                        currentPlan: userPlan.name,
                        limit: userPlan.limits.daily_messages
                    });
                }
            }
        }

        const modelMap = {
            'gpt-4o-mini': 'gpt-4o-mini',
            'gpt-4.1': 'gpt-4',
            'gpt-5': 'gpt-4' // Fallback until GPT-5 is available
        };

        const openaiModel = modelMap[model] || 'gpt-4o-mini';

        const completion = await openai.chat.completions.create({
            model: openaiModel,
            messages: [
                {
                    role: "system",
                    content: "You are a helpful AI assistant specialized in Roblox development, Luau scripting, game design, and general programming. Provide clear, practical advice and code examples when helpful."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            max_tokens: 1000,
            temperature: 0.7
        });

        const reply = completion.choices[0].message.content;

        // Update usage tracking
        if (!isAuthenticated) {
            incrementUsage(userIdentifier, model);
        } else {
            // Update authenticated user's daily usage
            const user = users.get(req.user.email);
            const today = new Date().toISOString().split('T')[0];
            const usageKey = `${user.id}_${today}`;
            const currentUsage = dailyUsage.get(usageKey) || 0;
            dailyUsage.set(usageKey, currentUsage + 1);
        }

        res.json({ 
            reply,
            model: model,
            usageInfo: !isAuthenticated ? checkUsageLimit(userIdentifier, model).limitsInfo : null
        });

    } catch (error) {
        console.error('[ERROR] OpenAI API error:', error);
        
        if (error.code === 'insufficient_quota') {
            res.status(503).json({ 
                error: 'Service temporarily unavailable due to quota limits. Please try again later.' 
            });
        } else if (error.code === 'rate_limit_exceeded') {
            res.status(429).json({ 
                error: 'Rate limit exceeded. Please try again in a moment.' 
            });
        } else {
            res.status(500).json({ 
                error: 'Failed to process your request. Please try again.' 
            });
        }
    }
});

// Serve static files
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/pricing.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'pricing.html'));
});

// Server startup
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
    console.log('============================================================');
    console.log('[SUCCESS] Roblox Luau AI Server Running');
    console.log(`[PORT] ${PORT}`);
    console.log(`[BASE_URL] ${getBaseUrl()}`);
    console.log(`[HEALTH] ${getBaseUrl()}/health`);
    console.log(`[EMAIL] ${process.env.EMAIL_ENABLED === 'true' ? 'ENABLED' : 'DISABLED'}`);
    console.log(`[STRIPE] ${process.env.STRIPE_SECRET_KEY ? 'CONFIGURED' : 'NOT CONFIGURED'}`);
    console.log(`[RAILWAY] ${getBaseUrl()}`);
    console.log('[SUBSCRIPTION PLANS]:');
    Object.entries(SUBSCRIPTION_PLANS).forEach(([key, plan]) => {
        console.log(` ${key.toUpperCase()}: ${plan.limits.daily_messages === -1 ? 'Unlimited' : plan.limits.daily_messages} messages/day, ${plan.limits.models.length} models`);
    });
    console.log('[USAGE LIMITS] (Guests Only):');
    Object.entries(USAGE_LIMITS).forEach(([model, limits]) => {
        console.log(` ${model}: ${limits.dailyLimit}/day, ${limits.hourlyLimit}/hour`);
    });
    
    const oauth2Client = getGoogleClient();
    if (oauth2Client) {
        console.log('[GOOGLE OAUTH]');
        console.log(` Client ID: ${process.env.GOOGLE_CLIENT_ID ? 'CONFIGURED' : 'MISSING'}`);
        console.log(` Client Secret: ${process.env.GOOGLE_CLIENT_SECRET ? 'CONFIGURED' : 'MISSING'}`);
        console.log(` Redirect URI: ${getBaseUrl()}/auth/google/callback`);
    }
    console.log('============================================================');
});
