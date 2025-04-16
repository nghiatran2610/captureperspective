import UI from "./ui/index.js";
import * as events from "./events.js";
import { handleError } from "./errors.js";

/**
 * VisualLoginHandler - Provides a simpler visual approach to authentication
 * Shows the login process in a visible iframe so users can see what's happening
 */
class VisualLoginHandler {
  constructor() {
    this.loginUrl = "http://localhost:8088/data/perspective/login/RF_Main_STG/Admin?forceAuth=true";
    this.defaultCredentials = {
      username: "Nghia.Tran",
      password: "tn@123",
    };
    this.isLoggedIn = false;
    this.loginStatusElement = null;
    this.loginFrame = null;
    this.loginFrameContainer = null;
  }

  /**
   * Initialize the login handler UI elements
   */
  initialize() {
    // Create login UI components for Simple Mode
    this.addLoginUI();

    // Add event listener for mode change to show/hide login UI
    const modeSimple = document.getElementById("modeSimple");
    const modeAdvanced = document.getElementById("modeAdvanced");

    if (modeSimple) {
      modeSimple.addEventListener("change", () =>
        this.updateLoginVisibility(true)
      );
    }

    if (modeAdvanced) {
      modeAdvanced.addEventListener("change", () =>
        this.updateLoginVisibility(false)
      );
    }

    // Initial visibility based on current mode
    this.updateLoginVisibility(document.body.classList.contains("simple-mode"));

    console.log("Visual Login Handler initialized");
  }

  /**
   * Add login UI components to the page
   */
  addLoginUI() {
    // Find the container to insert login UI before URL selection
    const captureForm = document.getElementById("captureForm");
    if (!captureForm) {
      console.error("Cannot find captureForm element");
      return;
    }

    // Create login section container
    const loginSection = document.createElement("div");
    loginSection.id = "loginSection";
    loginSection.className = "card";
    loginSection.style.marginBottom = "15px";

    // Create login section content with enhanced design - add status indicator
    loginSection.innerHTML = `
      <div class="login-header">
        <h2 style="margin: 0; font-size: 1.3em;">
          Authentication
        </h2>
        <div id="loginStatus" class="login-status logged-out">
          <span class="login-status-icon">⚪</span>
          <span class="login-status-text">Not authenticated</span>
        </div>
      </div>
      
      <div id="loginFrameContainer" class="login-frame-container">
      
        <iframe id="loginFrame" class="login-frame" src="about:blank"></iframe>
      </div>
    `;

    // Insert login section before capture form
    captureForm.parentNode.insertBefore(loginSection, captureForm);

    // Add event listener for closing the login frame
    const closeLoginFrame = document.getElementById("closeLoginFrame");
    this.loginStatusElement = document.getElementById("loginStatus");
    this.loginFrame = document.getElementById("loginFrame");
    this.loginFrameContainer = document.getElementById("loginFrameContainer");

    if (closeLoginFrame) {
      closeLoginFrame.addEventListener("click", () => this.hideLoginFrame());
    }

    // Display login frame by default (since user is not logged in)
    this.showLoginFrame();

    // Add some CSS for the login section
    this.addLoginStyles();
  }

  /**
   * Add CSS styles for login UI components
   */
  addLoginStyles() {
    const style = document.createElement("style");
    style.textContent = `
      .login-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
      }
      
      .auth-icon {
        font-size: 0.9em;
        margin-right: 5px;
      }
      
      .login-status {
        display: flex;
        align-items: center;
        font-size: 13px;
        background-color: #f8f9fa;
        padding: 3px 10px;
        border-radius: 4px;
        border: 1px solid #e2e8f0;
        transition: all 0.3s ease;
      }
      
      .login-status.logged-in {
        background-color: #d4edda;
        border-color: #c3e6cb;
      }
      
      .login-status.logged-out {
        background-color: #f8d7da;
        border-color: #f5c6cb;
      }
      
      .login-status.checking {
        background-color: #fff3cd;
        border-color: #ffeeba;
      }
      
      .login-status-icon {
        margin-right: 5px;
        font-size: 12px;
      }
      
      .login-frame-container {
        margin: 10px 0;
        border: 1px solid #ddd;
        border-radius: 4px;
        overflow: hidden;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      }
      
      .login-frame-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background-color: #f5f7fa;
        padding: 6px 10px;
        border-bottom: 1px solid #ddd;
        font-size: 14px;
      }
      
      .close-login-frame {
        background: none;
        border: none;
        font-size: 18px;
        cursor: pointer;
        color: #666;
        padding: 0 5px;
      }
      
      .close-login-frame:hover {
        color: #333;
      }
      
      .login-frame {
        width: 100%;
        height: 350px;
        border: none;
      }
      
      /* Styling for username display */
      .login-status-text {
        font-weight: 500;
      }
      
      .login-status.logged-in .login-status-text {
        color: #155724;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Update login section visibility based on mode
   * @param {boolean} isSimpleMode - Whether simple mode is active
   */
  updateLoginVisibility(isSimpleMode) {
    const loginSection = document.getElementById("loginSection");
    if (loginSection) {
      loginSection.style.display = isSimpleMode ? "block" : "none";
    }
  }

  /**
   * Show login frame with the login URL
   */
  showLoginFrame() {
    const frameContainer = document.getElementById("loginFrameContainer");
    if (frameContainer) {
      frameContainer.style.display = "block";
    }

    if (this.loginFrame) {
      this.loginFrame.src = this.loginUrl;
      
      // Set up event listener to detect successful login
      this.loginFrame.addEventListener("load", () => {
        // Check if the current URL indicates successful login
        try {
          const currentUrl = this.loginFrame.contentWindow.location.href;
          if (currentUrl && !currentUrl.includes("login")) {
            // Successfully logged in - frame navigated to a non-login page
            this.isLoggedIn = true;

            // Try to find username on the page
            let username = this.defaultCredentials.username;
            try {
              const usernameElement = this.loginFrame.contentDocument.querySelector(
                '.username, .user-info, .user-name, [id*="username"]'
              );
              if (usernameElement && usernameElement.textContent.trim()) {
                username = usernameElement.textContent.trim();
              }
            } catch (e) {
              console.warn("Could not extract username:", e);
            }

            // Update status with username
            this.updateLoginStatus("logged-in", `Logged in as ${username}`);

            // Emit login event
            events.emit("LOGIN_SUCCESSFUL", { username });

            // Hide the frame after successful login
            this.hideLoginFrame();
          }
        } catch (e) {
          // Ignore cross-origin errors
          console.warn("Could not check frame URL:", e);
        }
      });

      // Listen for messages from the iframe to detect login success
      window.addEventListener("message", this.handleLoginMessage.bind(this), false);
    }
  }

  /**
   * Hide login frame (used when user manually closes or after successful login)
   */
  hideLoginFrame() {
    const frameContainer = document.getElementById("loginFrameContainer");
    if (frameContainer) {
      frameContainer.style.display = "none";
    }
  }

  /**
   * Handle messages from the login iframe
   * @param {MessageEvent} event - Message event from iframe
   */
  handleLoginMessage(event) {
    // Check if the message indicates successful login
    if (event.data && event.data.type === "loginSuccess") {
      // Extract username if available
      const username = event.data.username || this.defaultCredentials.username;
      
      // Update login status
      this.isLoggedIn = true;
      this.updateLoginStatus("logged-in", `Logged in as ${username}`);

      // Hide the login frame
      this.hideLoginFrame();

      // Emit login event
      events.emit("LOGIN_SUCCESSFUL", { username });

      // Remove the message listener
      window.removeEventListener("message", this.handleLoginMessage.bind(this));
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
    this.loginStatusElement.classList.remove("logged-in", "logged-out", "checking");

    // Add new status class
    this.loginStatusElement.classList.add(status);

    // Update icon
    const iconElement = this.loginStatusElement.querySelector(".login-status-icon");
    if (iconElement) {
      iconElement.textContent = 
        status === "logged-in" ? "✅" : 
        status === "logged-out" ? "⚪" : 
        "⏳";
    }

    // Update text
    const textElement = this.loginStatusElement.querySelector(".login-status-text");
    if (textElement) {
      textElement.textContent = message;
    }
  }

  /**
   * Get the current login status
   * @returns {boolean} - Whether the user is logged in
   */
  getLoginStatus() {
    return this.isLoggedIn;
  }

  /**
   * Get the login URL for the iframe
   * @returns {string} - Login URL
   */
  getLoginUrl() {
    return this.loginUrl;
  }
}

export default new VisualLoginHandler();