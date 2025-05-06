// js/ui/progress.js
import { elements } from './elements.js';

export const progress = {
    /**
     * Update progress bar
     * @param {number} completed - Number of completed operations
     * @param {number} total - Total number of operations
     */
    updateProgress(completed, total) {
      if (elements.progressBar) { // Add null check
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
     * Applies a neutral 'progress-update' style.
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

        // Ensure the progress message area is visible and styled
        elements.progress.style.transition = 'none'; // Remove transition before immediate style changes
        elements.progress.style.opacity = '1';       // Make it visible
        
        if (message && message.trim() !== "") {
            // Apply the new neutral style for progress updates
            elements.progress.className = 'status-message progress-update'; 
        } else {
            // If setting an empty message, reset to base and hide
            elements.progress.textContent = '';
            elements.progress.className = 'status-message'; // Base class
            elements.progress.style.opacity = '0'; // Hide if empty
        }

      } else {
        console.warn("Cannot update progress message: #progress element not found in UI.elements.");
      }
    }
};