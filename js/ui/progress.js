import { elements } from './elements.js';

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