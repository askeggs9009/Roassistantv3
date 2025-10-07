# Stripe Setup Instructions

The Stripe MCP had authentication issues, so you'll need to manually create the products and prices in your Stripe Dashboard.

## Products to Create

Go to https://dashboard.stripe.com/products and create the following products:

### 1. Pro Plan
- **Name:** Pro Plan
- **Description:** Ideal for serious developers - 500 AI requests per month with advanced features

### 2. Max Plan
- **Name:** Max Plan
- **Description:** For power users and small teams - 2,000 AI requests per month with team collaboration

### 3. Studio Plan
- **Name:** Studio Plan
- **Description:** For teams and studios - Unlimited AI requests with custom AI models and integrations

## Prices to Create

For each product, create TWO prices (monthly and annual):

### Pro Plan Prices
1. **Monthly:** $19.00 USD, recurring monthly
2. **Annual:** $182.00 USD, recurring yearly (20% discount from $228)

### Max Plan Prices
1. **Monthly:** $37.00 USD, recurring monthly
2. **Annual:** $355.00 USD, recurring yearly (20% discount from $444)

### Studio Plan Prices
1. **Monthly:** $87.00 USD, recurring monthly
2. **Annual:** $835.00 USD, recurring yearly (20% discount from $1,044)

## Update server.js

After creating the prices in Stripe, copy the price IDs (they start with `price_`) and update `server.js` line 14-21:

```javascript
const PRICE_IDS = {
    pro_monthly: 'price_xxxxxxxxxxxxxxxxxxxxx',     // Replace with actual Pro monthly price ID
    pro_annual: 'price_xxxxxxxxxxxxxxxxxxxxx',       // Replace with actual Pro annual price ID
    max_monthly: 'price_xxxxxxxxxxxxxxxxxxxxx',     // Replace with actual Max monthly price ID
    max_annual: 'price_xxxxxxxxxxxxxxxxxxxxx',       // Replace with actual Max annual price ID
    studio_monthly: 'price_xxxxxxxxxxxxxxxxxxxxx',   // Replace with actual Studio monthly price ID
    studio_annual: 'price_xxxxxxxxxxxxxxxxxxxxx'     // Replace with actual Studio annual price ID
};
```

## Testing

Make sure to:
1. Use test mode while testing (test price IDs start with `price_test_`)
2. Test with Stripe test card: 4242 4242 4242 4242
3. Switch to live mode when ready to accept real payments
4. Update the Stripe publishable key in pricing.html if needed

## Notes
- The Free plan doesn't require Stripe (no payment)
- Annual prices save exactly 20% compared to monthly × 12
- Make sure to remove any old test products/prices to keep your dashboard clean
