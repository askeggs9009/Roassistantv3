#!/usr/bin/env python3
"""
Simple reCAPTCHA Testing Script (No Browser Required)

This script sends HTTP requests directly to test how reCAPTCHA handles different scenarios:
1. Valid login attempts
2. Invalid reCAPTCHA tokens (simulates bot behavior)
3. Missing reCAPTCHA tokens

No browser automation needed - just pure HTTP requests.
"""

import requests
import time
import json

# Configuration
API_BASE_URL = "https://roassistantv3-production.up.railway.app"
TEST_EMAIL = "askeggs9008@gmail.com"
TEST_PASSWORD = input("Enter password for askeggs9008@gmail.com: ")

def test_invalid_recaptcha():
    """Test with invalid reCAPTCHA tokens (simulates bot behavior)"""
    print("\n🤖 Testing Invalid reCAPTCHA Tokens (Bot Simulation)")
    print("=" * 50)

    invalid_tokens = [
        "",                           # Empty token
        "fake-bot-token",            # Obviously fake token
        "invalid" * 100,             # Very long fake token
        "12345",                     # Simple fake token
        "bot-attempt-" + str(time.time()),  # Timestamped fake token
    ]

    for i, token in enumerate(invalid_tokens, 1):
        print(f"\n🤖 Bot Test #{i}: {token[:20]}{'...' if len(token) > 20 else ''}")

        try:
            response = requests.post(f"{API_BASE_URL}/auth/login",
                json={
                    "email": TEST_EMAIL,
                    "password": TEST_PASSWORD,
                    "recaptchaToken": token
                },
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "BotTest/1.0 (Automated Testing)"
                },
                timeout=10
            )

            data = response.json()
            print(f"   Status: {response.status_code}")
            print(f"   Response: {data}")

            if response.status_code == 400 and "reCAPTCHA" in str(data):
                print(f"   ✅ Bot correctly detected and blocked!")
            else:
                print(f"   ⚠️ Unexpected response")

        except requests.RequestException as e:
            print(f"   ❌ Request failed: {e}")

        # Small delay between attempts
        time.sleep(1)

def test_missing_recaptcha():
    """Test with completely missing reCAPTCHA token"""
    print("\n🚫 Testing Missing reCAPTCHA Token")
    print("=" * 35)

    try:
        response = requests.post(f"{API_BASE_URL}/auth/login",
            json={
                "email": TEST_EMAIL,
                "password": TEST_PASSWORD
                # No recaptchaToken field at all
            },
            headers={
                "Content-Type": "application/json",
                "User-Agent": "BotTest/1.0 (No reCAPTCHA)"
            },
            timeout=10
        )

        data = response.json()
        print(f"Status: {response.status_code}")
        print(f"Response: {data}")

        if response.status_code == 400:
            print("✅ Missing reCAPTCHA correctly rejected!")

    except requests.RequestException as e:
        print(f"❌ Request failed: {e}")

def test_rapid_requests():
    """Test rapid-fire requests (bot-like behavior)"""
    print("\n🚀 Testing Rapid-Fire Requests")
    print("=" * 30)

    # Send 3 rapid requests
    for i in range(3):
        print(f"\n⚡ Rapid Request #{i+1}")
        try:
            response = requests.post(f"{API_BASE_URL}/auth/login",
                json={
                    "email": TEST_EMAIL,
                    "password": TEST_PASSWORD,
                    "recaptchaToken": f"rapid-bot-{i}-{time.time()}"
                },
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "RapidBot/1.0"
                },
                timeout=5
            )

            data = response.json()
            print(f"   Status: {response.status_code}")
            print(f"   Response: {data.get('error', data)}")

        except requests.RequestException as e:
            print(f"   ❌ Request failed: {e}")

    print("\n✅ Rapid requests completed")

def check_admin_dashboard():
    """Instructions for checking results"""
    print("\n📊 Checking Results")
    print("=" * 20)
    print("1. Visit the admin dashboard: https://roassistantv3-production.up.railway.app/admin.html")
    print("2. Log in with your admin account")
    print("3. Look for entries with very low reCAPTCHA scores")
    print("4. Check Railway logs for reCAPTCHA verification messages")
    print("\nExpected results:")
    print("   - All test requests should be rejected with reCAPTCHA errors")
    print("   - Server logs should show very low scores (0.0-0.3)")
    print("   - Admin dashboard should track these suspicious attempts")

def main():
    """Run all reCAPTCHA tests"""
    print("🧪 Simple reCAPTCHA Testing Suite")
    print("==================================")
    print("Testing how reCAPTCHA handles various bot-like scenarios.\n")

    if not TEST_PASSWORD or len(TEST_PASSWORD) < 3:
        print("❌ Password cannot be empty")
        return

    print(f"🎯 Target: {API_BASE_URL}")
    print(f"📧 Test Account: {TEST_EMAIL}")
    print("\n🔍 This script will test various bot scenarios:")
    print("   1. Invalid reCAPTCHA tokens")
    print("   2. Missing reCAPTCHA tokens")
    print("   3. Rapid-fire requests")
    print("\nAll requests should be rejected by reCAPTCHA security.")

    input("\nPress Enter to start testing...")

    # Run tests
    test_invalid_recaptcha()
    test_missing_recaptcha()
    test_rapid_requests()

    # Instructions for viewing results
    check_admin_dashboard()

    print("\n✅ Testing complete!")
    print("📋 Check Railway logs and admin dashboard for reCAPTCHA scores")

if __name__ == "__main__":
    main()