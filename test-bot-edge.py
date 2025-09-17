#!/usr/bin/env python3
"""
reCAPTCHA Edge Bot Testing Script (Windows-friendly alternative)

This script uses Microsoft Edge instead of Chrome, which is more compatible with Windows systems.
Edge WebDriver is usually more reliable on Windows than ChromeDriver.

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
from selenium.webdriver.edge.service import Service
from selenium.webdriver.edge.options import Options
from webdriver_manager.microsoft import EdgeChromiumDriverManager

# Configuration
LOGIN_URL = "https://roassistantv3-production.up.railway.app/login.html"
ADMIN_URL = "https://roassistantv3-production.up.railway.app/admin.html"
TEST_EMAIL = "askeggs9008@gmail.com"
TEST_PASSWORD = input("Enter password for askeggs9008@gmail.com: ")

def create_bot_driver():
    """Create an Edge driver configured to look like a bot"""
    print("🔧 Setting up Microsoft Edge WebDriver...")

    options = Options()

    # Bot-like settings
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option('useAutomationExtension', False)

    # Make it obvious it's automated
    options.add_argument("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 BotTest/1.0")

    # Windows compatibility
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")

    try:
        # Download and setup Edge WebDriver
        driver_path = EdgeChromiumDriverManager().install()
        print(f"✅ Edge WebDriver installed at: {driver_path}")

        service = Service(driver_path)
        driver = webdriver.Edge(service=service, options=options)

        print("✅ Microsoft Edge browser opened successfully")
        return driver

    except Exception as e:
        print(f"❌ Edge setup failed: {e}")
        print("\n🔧 Troubleshooting Tips:")
        print("1. Make sure Microsoft Edge is installed (should be on Windows 10/11)")
        print("2. Try running as administrator")
        print("3. Try: pip install --upgrade selenium webdriver-manager")
        raise

def bot_login_attempt(driver, attempt_number):
    """Simulate a bot login attempt"""
    print(f"\n🤖 Bot Login Attempt #{attempt_number}")

    try:
        driver.get(LOGIN_URL)
        wait = WebDriverWait(driver, 10)

        # Bot behavior: immediate actions, no delays
        email_field = wait.until(EC.presence_of_element_located((By.ID, "email")))
        email_field.clear()
        email_field.send_keys(TEST_EMAIL)

        password_field = driver.find_element(By.ID, "password")
        password_field.clear()
        password_field.send_keys(TEST_PASSWORD)

        # Click immediately (bot-like)
        submit_button = driver.find_element(By.ID, "submitButton")
        submit_button.click()

        time.sleep(3)

        # Check results
        try:
            error_element = driver.find_element(By.ID, "errorMessage")
            if error_element.text:
                print(f"   ❌ Error: {error_element.text}")
                if "reCAPTCHA" in error_element.text or "Security" in error_element.text:
                    print(f"   ✅ Bot detected by reCAPTCHA!")
        except:
            current_url = driver.current_url
            if "index.html" in current_url or current_url.endswith("/"):
                print(f"   ⚠️ Login successful - bot not detected!")

    except Exception as e:
        print(f"   ❌ Bot attempt failed: {e}")

def human_like_login_attempt(driver, attempt_number):
    """Simulate more human-like behavior"""
    print(f"\n👤 Human-like Attempt #{attempt_number}")

    try:
        driver.get(LOGIN_URL)
        wait = WebDriverWait(driver, 10)

        # Human-like delays
        time.sleep(random.uniform(1, 3))

        # Simulate reading the page
        driver.execute_script("window.scrollBy(0, 100);")
        time.sleep(random.uniform(0.5, 1.5))

        # Human-like typing with delays
        email_field = wait.until(EC.presence_of_element_located((By.ID, "email")))
        email_field.clear()
        for char in TEST_EMAIL:
            email_field.send_keys(char)
            time.sleep(random.uniform(0.05, 0.2))

        time.sleep(random.uniform(0.5, 2))

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
    """Run comprehensive bot testing with Edge"""
    print("🧪 reCAPTCHA Edge Bot Testing")
    print("=============================")
    print("Using Microsoft Edge for better Windows compatibility.\n")

    if not TEST_PASSWORD or len(TEST_PASSWORD) < 3:
        print("❌ Password cannot be empty")
        return

    driver = create_bot_driver()

    try:
        print("\n📋 Expected Results:")
        print("   - Bot attempts: Should get low reCAPTCHA scores (0.1-0.4)")
        print("   - Human-like attempts: Should get higher scores (0.6-0.9)")
        print("   - Check admin dashboard for score comparison\n")

        # Test 1: Bot attempts
        print("🔥 Test 1: Bot Attempts (Rapid & Robotic)")
        for i in range(3):
            bot_login_attempt(driver, i + 1)
            time.sleep(1)

        time.sleep(5)

        # Test 2: Human-like attempts
        print("\n🧠 Test 2: Human-like Attempts (Delays & Natural)")
        for i in range(2):
            human_like_login_attempt(driver, i + 1)
            time.sleep(random.uniform(3, 7))

        print("\n✅ Testing complete!")
        print("📊 Opening admin dashboard to view results...")

        # Open admin dashboard
        driver.get(ADMIN_URL)
        time.sleep(3)

        print("📋 Admin dashboard opened")
        print("🔍 You should see different reCAPTCHA scores:")
        print("   - Bot attempts: Low scores (0.1-0.4)")
        print("   - Human-like: Higher scores (0.6-0.9)")

    finally:
        input("\n✨ Check the admin dashboard scores, then press Enter to close browser...")
        driver.quit()

if __name__ == "__main__":
    run_bot_tests()