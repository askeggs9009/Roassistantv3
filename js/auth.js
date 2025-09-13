// Authentication Module
class AuthManager {
    constructor() {
        this.isLoggedIn = false;
        this.authToken = null;
    }

    // Check authentication status
    checkAuth() {
        // Check for multiple possible token names
        this.authToken = localStorage.getItem('authToken') || localStorage.getItem('token');
        const user = localStorage.getItem('user');

        if (this.authToken && user) {
            try {
                const userData = JSON.parse(user);
                this.showLoggedInUser(userData);
                this.isLoggedIn = true;
                console.log('User authenticated:', userData.email);
            } catch (error) {
                console.log('Auth check failed, showing guest user');
                this.showGuestUser();
                this.isLoggedIn = false;
            }