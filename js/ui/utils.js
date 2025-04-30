// js/ui/utils.js
import { elements } from "./elements.js";
import { progress as progressUpdater } from "./progress.js"; // Alias import to avoid conflict

export const utils = {
  /**
   * Show status message in the dedicated #progress element.
   * Handles auto-removal for non-error messages.
   * @param {string} message - Message to display. Empty string or null clears the message.
   * @param {boolean} isError - Whether this is an error message (affects styling and auto-removal).
   * @param {number} [autoRemoveDelay=5000] - Time in ms before removing non-error messages (0 or negative to keep permanently).
   */
  showStatus(message, isError = false, autoRemoveDelay = 5000) {
      const statusContainer = elements.progress; // Target the #progress element
       if (!statusContainer) {
           console.error("Cannot show status: #progress element not found.");
           return;
        }

       // Clear previous auto-remove timeouts if any
       if (statusContainer.autoRemoveTimer) {
           clearTimeout(statusContainer.autoRemoveTimer);
           statusContainer.autoRemoveTimer = null;
       }
       // Clear previous fade-out timeout
       if (statusContainer.fadeoutTimer) {
           clearTimeout(statusContainer.fadeoutTimer);
            statusContainer.fadeoutTimer = null;
       }

        // Reset transition immediately if needed
       statusContainer.style.transition = 'none';
       statusContainer.style.opacity = '1'; // Ensure visible before setting content

       if (!message) {
           // If message is empty or null, clear and hide the container
           statusContainer.textContent = '';
           statusContainer.className = 'status-message'; // Reset class
           statusContainer.style.opacity = '0'; // Hide it
       } else {
           // Set message and style
           statusContainer.textContent = message;
           statusContainer.className = `status-message ${isError ? "error" : "success"}`;

           // Auto-remove non-error messages after delay (if delay > 0)
           if (!isError && autoRemoveDelay > 0) {
               statusContainer.autoRemoveTimer = setTimeout(() => {
                   // Start fade out
                   statusContainer.style.transition = 'opacity 0.5s ease-out';
                   statusContainer.style.opacity = '0';

                   // Optional: Clear text after fade out
                   statusContainer.fadeoutTimer = setTimeout(() => {
                       // Check if it's still hidden (didn't get replaced by another message)
                       if (statusContainer.style.opacity === '0') {
                           statusContainer.textContent = ''; // Clear text
                           statusContainer.className = 'status-message'; // Reset class
                       }
                   }, 500); // Match transition duration
               }, autoRemoveDelay);
           }
           // If isError or autoRemoveDelay <= 0, the message persists until replaced or reset.
       }
  },

  /**
   * Create a button element (Helper function, potentially unused if buttons defined in HTML)
   * @param {string} text - Button text
   * @param {string} title - Button tooltip
   * @param {Function} onClick - Click event handler
   * @returns {HTMLButtonElement} - Created button
   */
  createButton(text, title, onClick) {
    const button = document.createElement("button");
    button.className = "btn btn-small"; // Default class
    button.textContent = text;
    button.title = title;
    button.onclick = onClick;
    return button;
  },

  /**
   * Truncate text with ellipsis if it's too long
   * @param {string} text - Text to truncate
   * @param {number} maxLength - Maximum length before truncating
   * @returns {string} - Truncated text
   */
  truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) return text || "";
    return text.substr(0, maxLength - 3) + "...";
  },

  /**
   * Reset UI state for a new capture session
   */
  resetUI() {
    console.log("Resetting UI..."); // Log when reset happens
    // Clear status message area (#progress)
    if(elements.progress) {
        // Clear any pending timeouts associated with the status element
        if (elements.progress.autoRemoveTimer) clearTimeout(elements.progress.autoRemoveTimer);
        if (elements.progress.fadeoutTimer) clearTimeout(elements.progress.fadeoutTimer);
        elements.progress.textContent = '';
        elements.progress.className = 'status-message';
        elements.progress.style.opacity = '0'; // Ensure it's hidden
        elements.progress.style.transition = 'none'; // Reset transition
    }
    // Reset progress bar
    if(elements.progressBar) elements.progressBar.style.width = "0%";
    // Clear the main output area (which contains the thumbnail container)
    if(elements.output) elements.output.innerHTML = "";
    // Reset stats display
    progressUpdater.updateStats(0, 0, 0, 0); // Use aliased import

    // Clear dynamic element references
    elements.liveThumbnails = null;
    elements.thumbnailsContent = null;

    // Reset Combine PDF button state (find it dynamically as it's inside #output)
     const combineAllPdfBtn = document.querySelector(".combine-all-pdf-btn");
     if (combineAllPdfBtn && combineAllPdfBtn.parentElement) {
         // Hide the container it's in, or just the button
         const pdfContainer = combineAllPdfBtn.closest(".combine-all-pdf-container");
         if (pdfContainer) {
             pdfContainer.style.display = "none";
         } else {
             combineAllPdfBtn.style.display = "none";
         }
         combineAllPdfBtn.disabled = true;
     }


    // Ensure stats visibility matches the mode (always hidden in simple mode)
     if (elements.stats) {
         elements.stats.style.display = 'none';
     }
     console.log("UI Reset complete.");
  },
};