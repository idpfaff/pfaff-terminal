// Pfaff Terminal Login Handler
document.addEventListener('DOMContentLoaded', function() {
    console.log('Pfaff Terminal Login - Initializing...');
    
    // Check if already authenticated
    checkAuthStatus();
    
    // Set up login button handler
    const loginButton = document.getElementById('loginButton');
    
    if (loginButton) {
        loginButton.addEventListener('click', handleLogin);
    }
    
    // Handle Enter key in form fields
    const usernameField = document.getElementById('username');
    const passwordField = document.getElementById('password');
    
    if (usernameField) {
        usernameField.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleLogin();
            }
        });
    }
    
    if (passwordField) {
        passwordField.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleLogin();
            }
        });
    }
    
    // Clear messages when typing
    if (usernameField) {
        usernameField.addEventListener('input', clearMessages);
    }
    if (passwordField) {
        passwordField.addEventListener('input', clearMessages);
    }
});

async function checkAuthStatus() {
    try {
        const response = await fetch('/auth/status', {
            method: 'GET',
            credentials: 'same-origin'
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.authenticated) {
                console.log('Already authenticated, redirecting...');
                window.location.href = '/';
                return;
            }
        }
    } catch (error) {
        console.log('Auth check failed, continuing with login form');
    }
}

async function handleLogin() {
    console.log('Login attempt started...');
    
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    // Validate inputs
    if (!username || !password) {
        showMessage('USERNAME AND PASSWORD REQUIRED', 'error');
        return;
    }

    // Disable form and show loading
    setFormState(true);
    showMessage('VERIFYING CREDENTIALS...', 'loading');

    try {
        console.log('Sending login request...');
        
        const response = await fetch('/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ 
                username: username, 
                password: password 
            }),
            credentials: 'same-origin'
        });

        console.log('Login response status:', response.status);
        
        let data;
        try {
            data = await response.json();
        } catch (parseError) {
            console.error('Failed to parse response JSON:', parseError);
            throw new Error('Invalid server response');
        }

        if (response.ok && data.success) {
            console.log('Login successful!');
            showMessage('ACCESS GRANTED - LOADING PFAFF TERMINAL...', 'success');
            
            // Redirect after brief delay
            setTimeout(() => {
                console.log('Redirecting to dashboard...');
                window.location.href = '/';
            }, 1500);
        } else {
            console.log('Login failed:', data.error);
            showMessage(data.error || 'ACCESS DENIED - INVALID CREDENTIALS', 'error');
            setFormState(false);
            clearPasswordField();
        }
    } catch (error) {
        console.error('Login error:', error);
        showMessage('CONNECTION ERROR - PLEASE TRY AGAIN', 'error');
        setFormState(false);
        clearPasswordField();
    }
}

function showMessage(text, type) {
    const message = document.getElementById('message');
    if (!message) return;
    
    let className = '';
    switch(type) {
        case 'error':
            className = 'error-message';
            break;
        case 'success':
            className = 'success-message';
            break;
        case 'loading':
            className = 'loading';
            break;
        default:
            className = 'error-message';
    }
    
    message.innerHTML = `<div class="${className}">${text}</div>`;
}

function clearMessages() {
    const message = document.getElementById('message');
    if (message) {
        message.innerHTML = '';
    }
}

function setFormState(disabled) {
    const button = document.getElementById('loginButton');
    const username = document.getElementById('username');
    const password = document.getElementById('password');
    
    if (button) {
        button.disabled = disabled;
        button.textContent = disabled ? 'AUTHENTICATING...' : 'ACCESS TERMINAL';
    }
    
    if (username) username.disabled = disabled;
    if (password) password.disabled = disabled;
}

function clearPasswordField() {
    const password = document.getElementById('password');
    if (password) {
        password.value = '';
    }
}