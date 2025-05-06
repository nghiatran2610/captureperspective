// js/ui/progress.js
import { elements } from './elements.js';

export const progress = {
    /**
     * Update progress bar
     * @param {number} completed - Number of completed operations
     * @param {number} total - Total number of operations
     */
    updateProgress(completed, total) {
      if (elements.progressBar) { // Add null check for robustness
        elements.progressBar.style.width = `${(completed / total) * 100}%`;
      }
    },
    
    /**
     * Update statistics display
     * @param {number} total - Total number of URLs
     * @param {number} processed - Number of successfully processed URLs
     * @param {number} failed - Number of failed URLs
     * @param {number} time - Total time taken in seconds
     */
    updateStats(total, processed, failed, time) {
      if (elements.totalCount) elements.totalCount.textContent = total;
      if (elements.processedCount) elements.processedCount.textContent = processed;
      if (elements.failedCount) elements.failedCount.textContent = failed;
      if (elements.totalTime) elements.totalTime.textContent = `${time}s`;
    },
    
    /**
     * Update progress message in the #progress element.
     * This function now ensures the message is visible and clears previous timers.
     * @param {string} message - Progress message to display.
     */
    updateProgressMessage(message) {
      if (elements.progress) { // Ensure the #progress element exists
        elements.progress.innerHTML = message;

        // Clear any pending auto-remove or fade-out timers from previous UI.utils.showStatus calls
        if (elements.progress.autoRemoveTimer) {
          clearTimeout(elements.progress.autoRemoveTimer);
          elements.progress.autoRemoveTimer = null;
        }
        if (elements.progress.fadeoutTimer) {
          clearTimeout(elements.progress.fadeoutTimer);
          elements.progress.fadeoutTimer = null;
        }

        // Ensure the progress message area is visible and styled neutrally
        elements.progress.style.transition = 'none'; // Remove transition before immediate style changes
        elements.progress.style.opacity = '1';       // Make it visible
        
        // Reset class to base 'status-message' to remove 'success'/'error' if they were set
        // and ensure it's not hidden by '.status-message:empty' if message is brief
        if (message && message.trim() !== "") {
            elements.progress.className = 'status-message'; 
        } else {
            // If setting an empty message, behave like UI.utils.showStatus(null)
            elements.progress.textContent = '';
            elements.progress.className = 'status-message';
            elements.progress.style.opacity = '0';
        }

      } else {
        console.warn("Cannot update progress message: #progress element not found in UI.elements.");
      }
    }
};