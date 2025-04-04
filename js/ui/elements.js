// js/ui/elements.js

export const elements = {
  // Mode Selection
  modeAdvanced: document.getElementById('modeAdvanced'),
  modeSimple: document.getElementById('modeSimple'),
  captureForm: document.getElementById('captureForm'), // Main form container
  progressOutput: document.getElementById('progressOutput'), // Container for progress/stats/output
  urlInputTitle: document.getElementById('urlInputTitle'),
  buttonContainer: document.getElementById('buttonContainer'), // Container for buttons

  // Existing elements
  urlList: document.getElementById('urlList'),
  capturePreset: document.getElementById('capturePreset'),
  waitTime: document.getElementById('waitTime'),
  actionsField: document.getElementById('actionsField'),
  advancedOptions: document.getElementById('advancedOptions'),
  captureBtn: document.getElementById('captureBtn'),
  retryFailedBtn: document.getElementById('retryFailedBtn'),
  progress: document.getElementById('progress'),
  progressBar: document.getElementById('progressBar'),
  output: document.getElementById('output'),
  iframe: document.getElementById('screenshotIframe'),
  stats: document.getElementById('stats'), // Container for stats
  totalCount: document.getElementById('totalCount'),
  processedCount: document.getElementById('processedCount'),
  failedCount: document.getElementById('failedCount'),
  totalTime: document.getElementById('totalTime'),
  liveThumbnails: null, // Will be created dynamically
  includeToolbarButtons: document.getElementById('includeToolbarButtons')
};;

// Add default export if not already present
export default elements;
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
  },
};
