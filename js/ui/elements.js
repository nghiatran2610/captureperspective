export const elements = {
    urlList: document.getElementById('urlList'),
    capturePreset: document.getElementById('capturePreset'),
    waitTime: document.getElementById('waitTime'),
    namingPattern: document.getElementById('namingPattern'),
    customText: document.getElementById('customText'),
    urlRegex: document.getElementById('urlRegex'),
    actionsField: document.getElementById('actionsField'),
    toggleAdvanced: document.getElementById('toggleAdvanced'),
    advancedOptions: document.getElementById('advancedOptions'),
    captureBtn: document.getElementById('captureBtn'),
    retryFailedBtn: document.getElementById('retryFailedBtn'),
    progress: document.getElementById('progress'),
    progressBar: document.getElementById('progressBar'),
    output: document.getElementById('output'),
    iframe: document.getElementById('screenshotIframe'),
    totalCount: document.getElementById('totalCount'),
    processedCount: document.getElementById('processedCount'),
    failedCount: document.getElementById('failedCount'),
    totalTime: document.getElementById('totalTime'),
    liveThumbnails: null  // Will be created dynamically
  };
  
  // ui/progress.js - Progress reporting functionality
  export const progress = {
    /**
     * Update progress bar
     * @param {number} completed - Number of completed operations
     * @param {number} total - Total number of operations
     */
    updateProgress(completed, total) {
      elements.progressBar.style.width = `${(completed / total) * 100}%`;
    },
    
    /**
     * Update statistics display
     * @param {number} total - Total number of URLs
     * @param {number} processed - Number of successfully processed URLs
     * @param {number} failed - Number of failed URLs
     * @param {number} time - Total time taken in seconds
     */
    updateStats(total, processed, failed, time) {
      elements.totalCount.textContent = total;
      elements.processedCount.textContent = processed;
      elements.failedCount.textContent = failed;
      elements.totalTime.textContent = `${time}s`;
    },
    
    /**
     * Update progress message
     * @param {string} message - Progress message to display
     */
    updateProgressMessage(message) {
      elements.progress.innerHTML = message;
    }
  };
  