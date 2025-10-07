// server.js - Node.js/Express backend for Stripe integration
const express = require('express');
const stripe = require('stripe')('sk_test_your_stripe_secret_key_here'); // Replace with your secret key
const cors = require('cors');

const app = express();

// Middleware
app.use(express.json());
app.use(cors());
app.use(express.static('public')); // Serve static files

// Stripe price IDs - Create these in your Stripe Dashboard
const PRICE_IDS = {
    pro_monthly: 'price_1SFjvnGsDklELrgDQ5jpu4ml',     // $19/month
    pro_annual: 'price_1SFjwRGsDklELrgDrBstTq4R',       // $182/year (20% discount)
    max_monthly: 'price_1SFjxPGsDklELrgDBWICQ6lZ',     // $37/month
    max_annual: 'price_1SFjxtGsDklELrgD3ELTVyEI',       // $355/year (20% discount)
    studio_monthly: 'price_1SFjzWGsDklELrgDX2jdvdTN', // $87/month
    studio_annual: 'price_1SFk04GsDklELrgDrDn4XKQM'    // $835/year (20% discount)
};

// Create Checkout Session
app.post('/api/create-checkout-session', async (req, res) => {
    try {
        const { plan, billing } = req.body;

        // Map plan and billing to price ID
        const priceKey = `${plan}_${billing}`;
        const priceId = PRICE_IDS[priceKey];

        if (!priceId) {
            return res.status(400).json({ error: 'Invalid plan or billing cycle' });
        }

        // Validate the price ID has been configured
        if (priceId.startsWith('price_REPLACE_')) {
            return res.status(500).json({
                error: 'Stripe prices not configured. Please set up price IDs in server.js'
            });
        }

        // Create Stripe checkout session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            success_url: `${req.headers.origin}/success.html?session_id={CHECKOUT_SESSION_ID}&plan=${plan}&billing=${billing}`,
            cancel_url: `${req.headers.origin}/pricing.html`,
            metadata: {
                plan: plan,
                billing: billing
            },
            // Optional: Collect customer information
            customer_email: req.body.email, // If you want to pre-fill email
            billing_address_collection: 'required',
            // Optional: Add customer portal for subscription management
            subscription_data: {
                metadata: {
                    plan: plan,
                    billing_cycle: billing
                }
            }
        });

        res.json({ sessionId: session.id });

    } catch (error) {
        console.error('Error creating checkout session:', error);
        res.status(500).json({ error: 'Failed to create checkout session' });
    }
});

// Webhook to handle Stripe events (important for security)
app.post('/api/stripe-webhook', express.raw({type: 'application/json'}), (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = 'whsec_your_webhook_secret_here'; // Replace with your webhook secret

    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
        console.log(`Webhook signature verification failed.`, err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
        case 'checkout.session.completed':
            const session = event.data.object;
            console.log('Payment successful:', session);
            
            // TODO: 
            // 1. Create user account in your database
            // 2. Activate subscription
            // 3. Send welcome email
            // 4. Grant access to paid features
            
            break;
        
        case 'customer.subscription.updated':
            const subscription = event.data.object;
            console.log('Subscription updated:', subscription);
            
            // TODO: Handle subscription changes (upgrades, downgrades)
            
            break;
            
        case 'customer.subscription.deleted':
            const deletedSubscription = event.data.object;
            console.log('Subscription cancelled:', deletedSubscription);
            
            // TODO: Revoke access when subscription is cancelled
            
            break;

        default:
            console.log(`Unhandled event type ${event.type}`);
    }

    res.json({received: true});
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

module.exports = app;