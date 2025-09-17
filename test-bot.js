#!/usr/bin/env node

/**
 * reCAPTCHA Bot Testing Script
 *
 * This script simulates automated login attempts to test how reCAPTCHA v3
 * detects and scores bot-like behavior vs human behavior.
 *
 * Expected results:
 * - Human-like requests: Score 0.7-1.0
 * - Bot-like requests: Score 0.0-0.3
 * - Automated scripts: Usually get very low scores
 */

import fetch from 'node-fetch';

const API_BASE_URL = 'https://roassistantv3-production.up.railway.app';

// Test credentials - use a test account
const TEST_CREDENTIALS = {
    email: 'test-bot@example.com',
    password: 'testpassword123',
    name: 'Test Bot'
};

/**
 * Simulate a bot login attempt
 */
async function botLoginAttempt(attemptNumber) {
    console.log(`\n🤖 Bot Attempt #${attemptNumber}`);

    try {
        // Bot behavior: Immediate request without any delays
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Bot indicators:
                'User-Agent': 'Bot-Test/1.0 (Automated Testing)',
            },
            body: JSON.stringify({
                email: TEST_CREDENTIALS.email,
                password: TEST_CREDENTIALS.password,
                // Invalid reCAPTCHA token (bots can't get real ones)
                recaptchaToken: 'fake-bot-token-' + Date.now()
            })
        });

        const data = await response.json();

        console.log(`   Status: ${response.status}`);
        console.log(`   Response:`, data);

        if (data.error && data.error.includes('reCAPTCHA')) {
            console.log(`   ✅ Bot detected! reCAPTCHA blocked the request`);
        } else {
            console.log(`   ⚠️ Bot not detected - this shouldn't happen`);
        }

    } catch (error) {
        console.error(`   ❌ Request failed:`, error.message);
    }
}

/**
 * Simulate rapid-fire bot attacks
 */
async function rapidFireAttack(count = 5) {
    console.log(`\n🚀 Rapid Fire Attack (${count} requests in quick succession)`);

    const promises = [];
    for (let i = 1; i <= count; i++) {
        promises.push(botLoginAttempt(i));
    }

    await Promise.all(promises);
}

/**
 * Simulate slow, steady bot behavior
 */
async function slowBotAttack(count = 3, delayMs = 2000) {
    console.log(`\n🐌 Slow Bot Attack (${count} requests with ${delayMs}ms delays)`);

    for (let i = 1; i <= count; i++) {
        await botLoginAttempt(i);
        if (i < count) {
            console.log(`   ⏱️ Waiting ${delayMs}ms...`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
}

/**
 * Test different bot behaviors
 */
async function runBotTests() {
    console.log('🧪 reCAPTCHA Bot Testing Suite');
    console.log('=====================================');
    console.log('This script tests how reCAPTCHA v3 detects automated behavior.\n');

    console.log('📋 Expected Results:');
    console.log('   - All bot requests should be rejected');
    console.log('   - reCAPTCHA should return "verification failed" errors');
    console.log('   - Server logs should show very low scores (0.0-0.3)');
    console.log('   - Admin dashboard should track these suspicious attempts\n');

    // Test 1: Rapid fire attack
    await rapidFireAttack(3);

    // Wait between tests
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Test 2: Slow attack
    await slowBotAttack(3, 1500);

    console.log('\n✅ Bot testing complete!');
    console.log('📊 Check your admin dashboard at: /admin.html');
    console.log('📋 Check Railway logs for reCAPTCHA scores');
}

// Run the tests
runBotTests().catch(console.error);