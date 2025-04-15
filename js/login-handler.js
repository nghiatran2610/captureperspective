// js/visual-login-handler.js - Simpler visual approach with visible iframe

import UI from './ui/index.js';
import * as events from './events.js';
import { handleError } from './errors.js';

/**
 * VisualLoginHandler - Provides a simpler visual approach to authentication
 * Shows the login process in a visible iframe so users can see what's happening
 */
class VisualLoginHandler {
  constructor() {
    this.loginUrl = "http://localhost:8088/data/perspective/login/RF_Main_STG/Admin?forceAuth=true";
    this.defaultCredentials = {
      username: "Nghia.Tran",
      password: "tn@123"
    };
    this.isLoggedIn = false;
    this.loginStatusElement = null;
    this.loginFrame = null;
  }

  /**
   * Initialize the login handler UI elements
   */
  initialize() {
    // Create login UI components for Simple Mode
    this.addLoginUI();
    
    // Add event listener for mode change to show/hide login UI
    const modeSimple = document.getElementById('modeSimple');
    const modeAdvanced = document.getElementById('modeAdvanced');
    
    if (modeSimple) {
      modeSimple.addEventListener('change', () => this.updateLoginVisibility(true));
    }
    
    if (modeAdvanced) {
      modeAdvanced.addEventListener('change', () => this.updateLoginVisibility(false));
    }
    
    // Initial visibility based on current mode
    this.updateLoginVisibility(document.body.classList.contains('simple-mode'));
    
    console.log('Visual Login Handler initialized');
  }

  /**
   * Add login UI elements to the page
   */
  addLoginUI() {
    // Find the container to insert login UI before URL selection
    const captureForm = document.getElementById('captureForm');
    if (!captureForm) {
      console.error('Cannot find captureForm element');
      return;
    }

    // Create login section container
    const loginSection = document.createElement('div');
    loginSection.id = 'loginSection';
    loginSection.className = 'card';
    loginSection.style.display = 'none'; // Initially hidden

    // Create login section content
    loginSection.innerHTML = `
      <h2>Authentication</h2>
      <div id="loginStatus" class="status-message">
        <span class="login-status-icon">⚪</span> 
        <span class="login-status-text">Not logged in</span>
      </div>
      
      <div class="login-options">
        <p class="login-instructions">Click "Show Login Page" to display the authentication page. Once you've logged in successfully, click "Check Login Status" to verify.</p>
        
        <div class="login-credentials">
          <p>Default credentials: <strong>${this.defaultCredentials.username} / ${this.defaultCredentials.password}</strong></p>
        </div>
      </div>
      
      <div id="loginFrameContainer" class="login-frame-container" style="display: none;">
        <div class="login-frame-header">
          <span>Authentication Page</span>
          <button id="closeLoginFrame" class="close-login-frame">×</button>
        </div>
        <iframe id="loginFrame" class="login-frame" src="about:blank"></iframe>
      </div>
      
      <div class="login-buttons">
        <button id="showLoginBtn" class="btn">Show Login Page</button>
        <button id="checkLoginButton" class="btn">Check Login Status</button>
      </div>
    `;

    // Insert login section before capture form
    captureForm.parentNode.insertBefore(loginSection, captureForm);

    // Add event listeners
    const showLoginBtn = document.getElementById('showLoginBtn');
    const checkLoginButton = document.getElementById('checkLoginButton');
    const closeLoginFrame = document.getElementById('closeLoginFrame');
    this.loginStatusElement = document.getElementById('loginStatus');
    this.loginFrame = document.getElementById('loginFrame');

    if (showLoginBtn) {
      showLoginBtn.addEventListener('click', () => this.showLoginFrame());
    }

    if (checkLoginButton) {
      checkLoginButton.addEventListener('click', () => this.checkLoginStatus());
    }

    if (closeLoginFrame) {
      closeLoginFrame.addEventListener('click', () => this.hideLoginFrame());
    }

    // Add some CSS for the login section
    this.addLoginStyles();
  }

  /**
   * Add CSS styles for login UI components
   */
  addLoginStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #loginSection {
        margin-bottom: var(--spacing-xl);
        transition: all 0.3s ease;
      }
      
      #loginSection h2 {
        margin-bottom: 15px;
        display: flex;
        align-items: center;
      }
      
      #loginSection h2::before {
        content: "🔒";
        margin-right: 10px;
        font-size: 18px;
      }
      
      #loginStatus {
        display: flex;
        align-items: center;
        padding: 12px 15px;
        margin-bottom: 15px;
        background-color: #f8f9fa;
        border-radius: 6px;
        border-left: 3px solid #6c757d;
        transition: all 0.3s ease;
      }
      
      #loginStatus.logged-in {
        background-color: #d4edda;
        border-left-color: #28a745;
      }
      
      #loginStatus.logged-out {
        background-color: #f8d7da;
        border-left-color: #dc3545;
      }
      
      #loginStatus.checking {
        background-color: #fff3cd;
        border-left-color: #ffc107;
      }
      
      .login-status-icon {
        font-size: 18px;
        margin-right: 10px;
      }
      
      .login-options {
        background-color: #f8f9fa;
        padding: 15px;
        border-radius: 6px;
        margin-bottom: 15px;
        border: 1px solid #e9ecef;
      }
      
      .login-instructions {
        margin-bottom: 10px;
        color: #495057;
      }
      
      .login-credentials {
        background-color: #e9ecef;
        padding: 10px;
        border-radius: 4px;
        margin-top: 10px;
      }
      
      .login-credentials p {
        margin: 0;
        font-size: 14px;
        color: #495057;
      }
      
      .login-frame-container {
        border: 1px solid #ddd;
        border-radius: 6px;
        overflow: hidden;
        margin-bottom: 15px;
        box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
      }
      
      .login-frame-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 15px;
        background-color: #f8f9fa;
        border-bottom: 1px solid #ddd;
      }
      
      .close-login-frame {
        background: none;
        border: none;
        font-size: 20px;
        cursor: pointer;
        color: #6c757d;
      }
      
      .close-login-frame:hover {
        color: #dc3545;
      }
      
      .login-frame {
        width: 100%;
        height: 500px;
        border: none;
        background-color: #fff;
      }
      
      .login-buttons {
        display: flex;
        gap: 10px;
        margin-top: 15px;
      }
      
      #showLoginBtn {
        background-color: #0d6efd;
        border-color: #0d6efd;
        color: #fff;
        padding: 10px 20px;
        flex: 1;
      }
      
      #showLoginBtn:hover {
        background-color: #0b5ed7;
        border-color: #0a58ca;
      }
      
      #checkLoginButton {
        background-color: #28a745;
        border-color: #28a745;
        color: #fff;
        padding: 10px 20px;
        flex: 1;
      }
      
      #checkLoginButton:hover {
        background-color: #218838;
        border-color: #1e7e34;
      }
      
      @keyframes pulse {
        0% { opacity: 0.6; }
        50% { opacity: 1; }
        100% { opacity: 0.6; }
      }
      
      .checking .login-status-icon {
        animation: pulse 1.5s infinite;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Update login section visibility based on mode
   * @param {boolean} isSimpleMode - Whether simple mode is active
   */
  updateLoginVisibility(isSimpleMode) {
    const loginSection = document.getElementById('loginSection');
    if (loginSection) {
      loginSection.style.display = isSimpleMode ? 'block' : 'none';
    }
  }

  /**
   * Show the login frame with the login page
   */
  showLoginFrame() {
    const frameContainer = document.getElementById('loginFrameContainer');
    if (frameContainer) {
      frameContainer.style.display = 'block';
    }

    if (this.loginFrame) {
      this.loginFrame.src = this.loginUrl;
      this.updateLoginStatus('checking', 'Login page loaded. Please complete login in the frame below.');
    }
  }

  /**
   * Hide the login frame
   */
  hideLoginFrame() {
    const frameContainer = document.getElementById('loginFrameContainer');
    if (frameContainer) {
      frameContainer.style.display = 'none';
    }
  }

  /**
   * Check current login status
   */
  async checkLoginStatus() {
    try {
      this.updateLoginStatus('checking', 'Checking login status...');
      
      const iframe = this.loginFrame || UI.elements.iframe;
      
      // Load a page that requires authentication
      iframe.src = 'http://localhost:8088/data/perspective/client/RF_Main_STG';
      
      // Wait for iframe to load
      await this.waitForIframeLoad(iframe);
      
      // Check if we're redirected to login page or already logged in
      const currentUrl = iframe.contentWindow.location.href;
      
      if (currentUrl.includes('login')) {
        // We're on login page, not logged in
        this.isLoggedIn = false;
        this.updateLoginStatus('logged-out', 'Not logged in. Please log in using the frame below.');
        return false;
      } else {
        // Not on login page, logged in
        // Try to find username on the page
        const usernameElement = iframe.contentDocument.querySelector('.username, .user-info, .user-name');
        const username = usernameElement ? usernameElement.textContent.trim() : this.defaultCredentials.username;
        
        this.isLoggedIn = true;
        this.updateLoginStatus('logged-in', `Logged in as ${username}`);
        this.hideLoginFrame(); // Hide the login frame since we're now logged in
        
        // Emit event for successful login
        events.emit('LOGIN_SUCCESSFUL', { username });
        
        return true;
      }
    } catch (error) {
      console.error('Error checking login status:', error);
      this.updateLoginStatus('logged-out', `Status check error: ${error.message}`);
      return false;
    }
  }

  /**
   * Update login status UI
   * @param {string} status - Status class: 'logged-in', 'logged-out', or 'checking'
   * @param {string} message - Status message to display
   */
  updateLoginStatus(status, message) {
    if (!this.loginStatusElement) return;
    
    // Remove previous status classes
    this.loginStatusElement.classList.remove('logged-in', 'logged-out', 'checking');
    
    // Add new status class
    this.loginStatusElement.classList.add(status);
    
    // Update icon
    const iconElement = this.loginStatusElement.querySelector('.login-status-icon');
    if (iconElement) {
      iconElement.textContent = status === 'logged-in' ? '✅' : status === 'logged-out' ? '❌' : '⏳';
    }
    
    // Update text
    const textElement = this.loginStatusElement.querySelector('.login-status-text');
    if (textElement) {
      textElement.textContent = message;
    }
  }

  /**
   * Wait for iframe to load
   * @param {HTMLIFrameElement} iframe - The iframe element
   * @returns {Promise<void>}
   */
  waitForIframeLoad(iframe) {
    return new Promise((resolve) => {
      const handleLoad = () => {
        iframe.removeEventListener('load', handleLoad);
        // Add a small delay to ensure everything is loaded
        setTimeout(resolve, 1000);
      };
      
      iframe.addEventListener('load', handleLoad);
      
      // Already loaded case
      if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
        handleLoad();
      }
    });
  }

  /**
   * Get the current login status
   * @returns {boolean} - Whether the user is logged in
   */
  getLoginStatus() {
    return this.isLoggedIn;
  }
}

export default new VisualLoginHandler();