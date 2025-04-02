// errors.js - Custom Error classes and centralized error handling

/**
 * Base application error class
 */
export class AppError extends Error {
    constructor(message, code = 'APP_ERROR') {
      super(message);
      this.name = this.constructor.name;
      this.code = code;
    }
  }
  
  /**
   * Error for URL processing issues
   */
  export class URLProcessingError extends AppError {
    constructor(message, url) {
      super(message, 'URL_PROCESSING_ERROR');
      this.url = url;
    }
  }
  
  /**
   * Error for screenshot capture issues
   */
  export class ScreenshotError extends AppError {
    constructor(message, url, reason) {
      super(message, 'SCREENSHOT_ERROR');
      this.url = url;
      this.reason = reason;
    }
  }
  
  /**
   * Error for issues with action sequences
   */
  export class ActionError extends AppError {
    constructor(message, action, element) {
      super(message, 'ACTION_ERROR');
      this.action = action;
      this.element = element;
    }
  }
  
  /**
   * Centralized error handler function
   * @param {Error} error - The error to handle
   * @param {Object} options - Handler options
   */
  export function handleError(error, { logToConsole = true, showToUser = true, reportToAnalytics = false } = {}) {
    // 1. Always create a standardized error object
    const errorInfo = {
      message: error.message || 'An unknown error occurred',
      code: error.code || 'UNKNOWN_ERROR',
      timestamp: new Date().toISOString(),
      name: error.name || 'Error'
    };
    
    // 2. Add type-specific properties to the error info
    if (error instanceof URLProcessingError) {
      errorInfo.url = error.url;
    } else if (error instanceof ScreenshotError) {
      errorInfo.url = error.url;
      errorInfo.reason = error.reason;
    } else if (error instanceof ActionError) {
      errorInfo.action = error.action;
      errorInfo.element = error.element;
    }
    
    // 3. Log to console if enabled
    if (logToConsole) {
      console.error('Error occurred:', errorInfo);
      console.error('Original error:', error);
    }
    
    // 4. Show to user if enabled
    if (showToUser && typeof UI !== 'undefined') {
      UI.showStatus(`Error: ${errorInfo.message}`, true);
    }
    
    // 5. Report to analytics if enabled (future enhancement)
    if (reportToAnalytics) {
      // Placeholder for future analytics implementation
      console.log('Would report to analytics:', errorInfo);
    }
    
    return errorInfo;
  }
  
  export default {
    AppError,
    URLProcessingError,
    ScreenshotError,
    ActionError,
    handleError
  };