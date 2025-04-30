// index.js - Main application entry point
import config from './config.js';
import App from './app.js';
import * as events from './events.js';
import { handleError } from './errors.js';
import ContextMenuActionsHelper from './context-menu-actions-helper.js';
import LoginHandler from './login-handler.js';

/**
 * Initialize the application
 */
function initializeApp() {
    try {
        // Create and initialize the application
        const app = new App();
        app.initialize();

        // Log success
        console.log('Ignition Perspective Screenshot Capture initialized successfully');

        // Expose app to window for debugging if needed
        if (config.debug) {
            window.screenshotApp = app;
            window.loginHandler = LoginHandler;

        }

        // Initialize UI controls from ContextMenuActionsHelper
        // This is the only place where UI controls should be initialized
        ContextMenuActionsHelper.addUIControls();

        // Return app instance
        return app;
    } catch (error) {
        handleError(error, {
            logToConsole: true,
            showToUser: true,
            reportToAnalytics: false
        });

        console.error('Failed to initialize the application', error);
    }
}

// Check if the document is already loaded
if (document.readyState === 'loading') {
    // Document still loading, wait for DOMContentLoaded
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    // DOM is already ready, initialize immediately
    initializeApp();
}

// Listen for unhandled promise rejections
window.addEventListener('unhandledrejection', event => {
    handleError(event.reason || new Error('Unhandled Promise rejection'), {
        logToConsole: true,
        showToUser: true
    });

    // Prevent the default browser handling
    event.preventDefault();
});

// Listen for uncaught errors
window.addEventListener('error', event => {
    handleError(event.error || new Error(event.message), {
        logToConsole: true,
        showToUser: true
    });

    // Prevent the default browser handling
    event.preventDefault();
});