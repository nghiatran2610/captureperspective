/**
 * Application State Management Module
 * Handles the state of screenshots, URLs, and failures
 */
const AppState = {
  screenshots: new Map(),
  orderedUrls: [],
  failedUrls: [],
  
  /**
   * Reset the state to initial values
   */
  reset() {
    this.screenshots.clear();
    this.orderedUrls = [];
    this.failedUrls = [];
  },
  
  /**
   * Add a screenshot to the state
   * @param {string} url - The URL of the page that was captured
   * @param {Object} data - Screenshot data object containing screenshot, thumbnail and timeTaken
   */
  addScreenshot(url, data) {
    this.screenshots.set(url, data);
    if (!this.orderedUrls.includes(url)) {
      this.orderedUrls.push(url);
    }
  },
  
  /**
   * Add a URL to the failed list
   * @param {string} url - The URL that failed during screenshot capture
   */
  addFailedUrl(url) {
    if (!this.failedUrls.includes(url)) {
      this.failedUrls.push(url);
    }
  },
  
  /**
   * Remove a URL from the failed list
   * @param {string} url - The URL to remove from failed list
   */
  removeFailedUrl(url) {
    this.failedUrls = this.failedUrls.filter(u => u !== url);
  }
};

// Add default export
export default AppState;