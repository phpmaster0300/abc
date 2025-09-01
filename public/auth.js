// Authentication JavaScript
class AuthManager {
    constructor() {
        this.init();
    }

    init() {
        // Check if we're on login or register page
        const loginForm = document.getElementById('loginForm');
        const registerForm = document.getElementById('registerForm');

        if (loginForm) {
            this.initLogin();
        }

        if (registerForm) {
            this.initRegister();
        }
    }

    initLogin() {
        const form = document.getElementById('loginForm');
        const emailInput = document.getElementById('email');
        const passwordInput = document.getElementById('password');

        // Real-time validation
        emailInput.addEventListener('blur', () => this.validateEmail(emailInput));
        passwordInput.addEventListener('blur', () => this.validatePassword(passwordInput, false));

        // Form submission
        form.addEventListener('submit', (e) => this.handleLogin(e));
    }

    initRegister() {
        const form = document.getElementById('registerForm');
        const fullNameInput = document.getElementById('fullName');
        const emailInput = document.getElementById('email');
        const passwordInput = document.getElementById('password');
        const confirmPasswordInput = document.getElementById('confirmPassword');

        // Real-time validation
        fullNameInput.addEventListener('blur', () => this.validateFullName(fullNameInput));
        emailInput.addEventListener('blur', () => this.validateEmail(emailInput));
        passwordInput.addEventListener('input', () => this.validatePassword(passwordInput, true));
        confirmPasswordInput.addEventListener('blur', () => this.validateConfirmPassword(passwordInput, confirmPasswordInput));

        // Form submission
        form.addEventListener('submit', (e) => this.handleRegister(e));
    }

    validateFullName(input) {
        const value = input.value.trim();
        const errorElement = document.getElementById('fullNameError');

        if (value.length < 2) {
            this.showError(input, errorElement, 'Full name must be at least 2 characters long');
            return false;
        }

        if (!/^[a-zA-Z\s]+$/.test(value)) {
            this.showError(input, errorElement, 'Full name can only contain letters and spaces');
            return false;
        }

        this.hideError(input, errorElement);
        return true;
    }

    validateEmail(input) {
        const value = input.value.trim();
        const errorElement = document.getElementById('emailError');
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegex.test(value)) {
            this.showError(input, errorElement, 'Please enter a valid email address');
            return false;
        }

        this.hideError(input, errorElement);
        return true;
    }

    validatePassword(input, showStrength = false) {
        const value = input.value;
        const errorElement = document.getElementById('passwordError');

        if (value.length < 8) {
            this.showError(input, errorElement, 'Password must be at least 8 characters long');
            if (showStrength) this.updatePasswordStrength(0);
            return false;
        }

        if (showStrength) {
            this.updatePasswordStrength(this.calculatePasswordStrength(value));
        }

        this.hideError(input, errorElement);
        return true;
    }

    validateConfirmPassword(passwordInput, confirmInput) {
        const password = passwordInput.value;
        const confirmPassword = confirmInput.value;
        const errorElement = document.getElementById('confirmPasswordError');

        if (password !== confirmPassword) {
            this.showError(confirmInput, errorElement, 'Passwords do not match');
            return false;
        }

        this.hideError(confirmInput, errorElement);
        return true;
    }

    calculatePasswordStrength(password) {
        let strength = 0;
        
        // Length check
        if (password.length >= 8) strength += 1;
        if (password.length >= 12) strength += 1;
        
        // Character variety checks
        if (/[a-z]/.test(password)) strength += 1;
        if (/[A-Z]/.test(password)) strength += 1;
        if (/[0-9]/.test(password)) strength += 1;
        if (/[^A-Za-z0-9]/.test(password)) strength += 1;
        
        return Math.min(strength, 4);
    }

    updatePasswordStrength(strength) {
        const strengthFill = document.querySelector('.strength-fill');
        const strengthText = document.querySelector('.strength-text');
        
        if (!strengthFill || !strengthText) return;

        // Remove all strength classes
        strengthFill.classList.remove('weak', 'fair', 'good', 'strong');
        
        const strengthLevels = ['', 'weak', 'fair', 'good', 'strong'];
        const strengthTexts = ['', 'Weak', 'Fair', 'Good', 'Strong'];
        
        if (strength > 0) {
            strengthFill.classList.add(strengthLevels[strength]);
            strengthText.textContent = `Password strength: ${strengthTexts[strength]}`;
        } else {
            strengthText.textContent = 'Password strength';
        }
    }

    showError(input, errorElement, message) {
        input.classList.add('error');
        errorElement.textContent = message;
        errorElement.classList.add('show');
    }

    hideError(input, errorElement) {
        input.classList.remove('error');
        errorElement.classList.remove('show');
    }

    async handleLogin(e) {
        e.preventDefault();
        
        const form = e.target;
        const formData = new FormData(form);
        const loginBtn = document.getElementById('loginBtn');
        const btnText = loginBtn.querySelector('.btn-text');
        const btnLoader = loginBtn.querySelector('.btn-loader');
        
        // Validate form
        const email = document.getElementById('email');
        const password = document.getElementById('password');
        
        const isEmailValid = this.validateEmail(email);
        const isPasswordValid = this.validatePassword(password);
        
        if (!isEmailValid || !isPasswordValid) {
            return;
        }
        
        // Show loading state
        loginBtn.disabled = true;
        btnText.style.display = 'none';
        btnLoader.style.display = 'flex';
        
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: formData.get('email'),
                    password: formData.get('password'),
                    rememberMe: formData.get('rememberMe') === 'on'
                })
            });
            
            const result = await response.json();
            
            if (response.ok) {
                // Show success message
                this.showSuccessMessage('Login successful! Redirecting...');
                
                // Redirect to main app
                setTimeout(() => {
                    window.location.href = '/dashboard';
                }, 1500);
            } else {
                this.showError(email, document.getElementById('emailError'), result.message || 'Login failed');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showError(email, document.getElementById('emailError'), 'Network error. Please try again.');
        } finally {
            // Hide loading state
            loginBtn.disabled = false;
            btnText.style.display = 'block';
            btnLoader.style.display = 'none';
        }
    }

    async handleRegister(e) {
        e.preventDefault();
        console.log('Registration form submitted');
        
        const form = e.target;
        const formData = new FormData(form);
        const registerBtn = document.getElementById('registerBtn');
        const btnText = registerBtn.querySelector('.btn-text');
        const btnLoader = registerBtn.querySelector('.btn-loader');
        
        // Validate form
        const fullName = document.getElementById('fullName');
        const email = document.getElementById('email');
        const password = document.getElementById('password');
        const confirmPassword = document.getElementById('confirmPassword');
        const agreeTerms = document.getElementById('agreeTerms');
        
        const isFullNameValid = this.validateFullName(fullName);
        const isEmailValid = this.validateEmail(email);
        const isPasswordValid = this.validatePassword(password);
        const isConfirmPasswordValid = this.validateConfirmPassword(password, confirmPassword);
        
        if (!agreeTerms.checked) {
            alert('Please agree to the Terms of Service and Privacy Policy');
            return;
        }
        
        if (!isFullNameValid || !isEmailValid || !isPasswordValid || !isConfirmPasswordValid) {
            return;
        }
        
        // Show loading state
        registerBtn.disabled = true;
        btnText.style.display = 'none';
        btnLoader.style.display = 'flex';
        
        try {
            console.log('Sending registration request...');
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    fullName: formData.get('fullName'),
                    email: formData.get('email'),
                    password: formData.get('password'),
                    confirmPassword: formData.get('confirmPassword')
                })
            });
            console.log('Response received:', response.status);
            
            const result = await response.json();
            console.log('Response data:', result);
            
            if (response.ok) {
                // Show success message
                console.log('Registration successful!');
                this.showSuccessMessage('Account created successfully! Redirecting to login...');
                
                // Redirect to login page
                setTimeout(() => {
                    window.location.href = '/login.html';
                }, 2000);
            } else {
                console.log('Registration failed:', result.message);
                this.showError(email, document.getElementById('emailError'), result.message || 'Registration failed');
            }
        } catch (error) {
            console.error('Registration error:', error);
            this.showError(email, document.getElementById('emailError'), 'Network error. Please try again.');
        } finally {
            // Hide loading state
            registerBtn.disabled = false;
            btnText.style.display = 'block';
            btnLoader.style.display = 'none';
        }
    }

    showSuccessMessage(message) {
        // Create success message element if it doesn't exist
        let successElement = document.querySelector('.success-message');
        if (!successElement) {
            successElement = document.createElement('div');
            successElement.className = 'success-message';
            const form = document.querySelector('.auth-form');
            form.insertBefore(successElement, form.firstChild);
        }
        
        successElement.textContent = message;
        successElement.classList.add('show');
        
        // Hide after 5 seconds
        setTimeout(() => {
            successElement.classList.remove('show');
        }, 5000);
    }
}

// Initialize authentication manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new AuthManager();
});

// Check if user is already logged in
async function checkAuthStatus() {
    const currentPage = window.location.pathname;
    
    try {
        const response = await fetch('/api/auth/me', {
            credentials: 'include'
        });
        const data = await response.json();
        
        if (data.success && data.user) {
            // User is authenticated
            if (currentPage.includes('login.html') || currentPage.includes('register.html')) {
                // Redirect to main app if on auth pages
                window.location.href = '/dashboard';
            }
        } else {
            // User is not authenticated
            if (currentPage.includes('dashboard') || currentPage === '/') {
                // Redirect to login if on main app
                window.location.href = '/login.html';
            }
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        if (currentPage.includes('dashboard') || currentPage === '/') {
            window.location.href = '/login.html';
        }
    }
}

// Check auth status on page load
checkAuthStatus();