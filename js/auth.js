// Authentication Module
class AuthManager {
    constructor() {
        this.isLoggedIn = false;
        this.authToken = null;
    }

    // Check authentication status
    checkAuth() {
        this.authToken = localStorage.getItem('authToken');
        const user = localStorage.getItem('user');

        if (this.authToken && user) {
            try {
                const userData = JSON.parse(user);
                this.showLoggedInUser(userData);
                this.isLoggedIn = true;
            } catch (error) {
                this.showGuestUser();
                this.isLoggedIn = false;
            }