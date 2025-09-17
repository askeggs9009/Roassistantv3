#!/usr/bin/env python3
"""
reCAPTCHA Selenium Bot Testing Script

This script uses Selenium to automate a real browser and test how reCAPTCHA v3
detects automated browser behavior vs human behavior.

Install requirements:
pip install selenium webdriver-manager

Expected results:
- Selenium automation: Usually gets 0.1-0.4 scores (detected as bot)
- Normal browser: Gets 0.7-0.9 scores (detected as human)
"""

import time
import random
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager

# Configuration
LOGIN_URL = "https://roassistantv3-production.up.railway.app/login.html"
TEST_EMAIL = "askeggs9008@gmail.com"  # Use your test account
TEST_PASSWORD = "your_password_here"  # Add your password

def create_bot_driver():
    """Create a Chrome driver configured to look like a bot"""
    options = Options()

    # Bot-like settings
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option('useAutomationExtension', False)

    # Make it obvious it's automated
    options.add_argument("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 BotTest/1.0")

    # Optional: Run headless (more bot-like)
    # options.add_argument("--headless")

    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=options)

    return driver

def bot_login_attempt(driver, attempt_number):
    """Simulate a bot login attempt"""
    print(f"\n🤖 Bot Login Attempt #{attempt_number}")

    try:
        # Navigate to login page
        driver.get(LOGIN_URL)

        # Wait for page to load
        wait = WebDriverWait(driver, 10)

        # Find and fill email field (bot-like: no delays)
        email_field = wait.until(EC.presence_of_element_located((By.ID, "email")))
        email_field.clear()
        email_field.send_keys(TEST_EMAIL)

        # Find and fill password field (bot-like: immediate action)
        password_field = driver.find_element(By.ID, "password")
        password_field.clear()
        password_field.send_keys(TEST_PASSWORD)

        # Click submit immediately (no human-like hesitation)
        submit_button = driver.find_element(By.ID, "submitButton")
        submit_button.click()

        # Wait for response
        time.sleep(3)

        # Check for error messages or success
        try:
            error_element = driver.find_element(By.ID, "errorMessage")
            if error_element.text:
                print(f"   ❌ Error: {error_element.text}")
                if "reCAPTCHA" in error_element.text or "Security" in error_element.text:
                    print(f"   ✅ Bot detected by reCAPTCHA!")
        except:
            # Check if login was successful
            current_url = driver.current_url
            if "index.html" in current_url or current_url.endswith("/"):
                print(f"   ⚠️ Login successful - bot not detected!")
            else:
                print(f"   🔄 Login page still shown")

    except Exception as e:
        print(f"   ❌ Bot attempt failed: {e}")

def human_like_login_attempt(driver, attempt_number):
    """Simulate more human-like behavior"""
    print(f"\n👤 Human-like Attempt #{attempt_number}")

    try:
        driver.get(LOGIN_URL)
        wait = WebDriverWait(driver, 10)

        # Human-like delays and behavior
        time.sleep(random.uniform(1, 3))  # Think time

        # Scroll around like a human might
        driver.execute_script("window.scrollBy(0, 100);")
        time.sleep(random.uniform(0.5, 1.5))
        driver.execute_script("window.scrollBy(0, -50);")

        # Fill email with human-like typing delays
        email_field = wait.until(EC.presence_of_element_located((By.ID, "email")))
        email_field.clear()
        for char in TEST_EMAIL:
            email_field.send_keys(char)
            time.sleep(random.uniform(0.05, 0.2))  # Typing speed variation

        time.sleep(random.uniform(0.5, 2))  # Pause between fields

        # Fill password with delays
        password_field = driver.find_element(By.ID, "password")
        password_field.clear()
        for char in TEST_PASSWORD:
            password_field.send_keys(char)
            time.sleep(random.uniform(0.05, 0.15))

        # Human hesitation before clicking
        time.sleep(random.uniform(1, 3))

        submit_button = driver.find_element(By.ID, "submitButton")
        submit_button.click()

        time.sleep(3)

        # Check results
        try:
            error_element = driver.find_element(By.ID, "errorMessage")
            if error_element.text:
                print(f"   ❌ Error: {error_element.text}")
        except:
            current_url = driver.current_url
            if "index.html" in current_url:
                print(f"   ✅ Human-like login successful!")

    except Exception as e:
        print(f"   ❌ Human-like attempt failed: {e}")

def run_bot_tests():
    """Run comprehensive bot testing"""
    print("🧪 reCAPTCHA Selenium Bot Testing")
    print("==================================")
    print("This script tests reCAPTCHA v3 detection using real browser automation.\n")

    if TEST_PASSWORD == "your_password_here":
        print("❌ Please update TEST_PASSWORD in the script with your actual password")
        return

    driver = create_bot_driver()

    try:
        print("📋 Expected Results:")
        print("   - Bot attempts: Should get low reCAPTCHA scores (0.1-0.4)")
        print("   - Human-like attempts: Should get higher scores (0.6-0.9)")
        print("   - Check admin dashboard for score comparison\n")

        # Test 1: Rapid bot attempts
        print("🔥 Test 1: Rapid Bot Attempts")
        for i in range(3):
            bot_login_attempt(driver, i + 1)
            time.sleep(1)  # Minimal delay between attempts

        time.sleep(5)  # Break between test types

        # Test 2: Human-like attempts
        print("\n🧠 Test 2: Human-like Attempts")
        for i in range(2):
            human_like_login_attempt(driver, i + 1)
            time.sleep(random.uniform(3, 7))  # Human-like break

        print("\n✅ Testing complete!")
        print("📊 Check admin dashboard: /admin.html")
        print("📋 Check Railway logs for reCAPTCHA score differences")

    finally:
        input("\nPress Enter to close browser...")
        driver.quit()

if __name__ == "__main__":
    run_bot_tests()