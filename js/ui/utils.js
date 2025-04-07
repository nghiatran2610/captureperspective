import { elements } from "./elements.js";
import { progress } from "./progress.js";

export const utils = {
  // In ui/utils.js, update the showStatus function:

  /**
   * Show status message in the output area with auto-removal for success messages
   * @param {string} message - Message to display
   * @param {boolean} isError - Whether this is an error message
   * @param {number} [autoRemoveDelay=5000] - Time in ms before removing success messages (0 to keep permanently)
   */
  showStatus(message, isError = false, autoRemoveDelay = 5000) {
    const status = document.createElement("div");
    status.className = `status-message ${isError ? "error" : "success"}`;
    status.textContent = message;
    elements.output.appendChild(status);

    // Auto-remove success messages after delay (if delay > 0)
    if (!isError && autoRemoveDelay > 0) {
      setTimeout(() => {
        // Check if element still exists before trying to remove it
        if (status.parentElement) {
          // Add fade-out animation
          status.style.transition = "opacity 0.5s ease-out";
          status.style.opacity = "0";

          // Remove from DOM after animation completes
          setTimeout(() => {
            if (status.parentElement) {
              status.parentElement.removeChild(status);
            }
          }, 500); // Animation duration
        }
      }, autoRemoveDelay);
    }
  },
  /**
   * Create a button element
   * @param {string} text - Button text
   * @param {string} title - Button tooltip
   * @param {Function} onClick - Click event handler
   * @returns {HTMLButtonElement} - Created button
   */
  createButton(text, title, onClick) {
    const button = document.createElement("button");
    button.className = "btn btn-small";
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
    if (text.length <= maxLength) return text;
    return text.substr(0, maxLength - 3) + "...";
  },

  /**
   * Reset UI for a new capture session
   */
  resetUI() {
    elements.progress.innerHTML = "";
    elements.progressBar.style.width = "0%";
    elements.output.innerHTML = "";
    progress.updateStats(0, 0, 0, 0);

    // Remove existing live thumbnails container if it exists
    if (elements.liveThumbnails) {
      elements.liveThumbnails.remove();
      elements.liveThumbnails = null;
    }

    // Remove download all button if it exists
    const downloadAllBtn = document.getElementById("downloadAllBtn");
    if (downloadAllBtn) {
      downloadAllBtn.remove();
    }

    // Ensure stats visibility matches the current mode
    if (document.body.classList.contains("advanced-mode") && elements.stats) {
      elements.stats.style.display = "none";
    } else if (elements.stats) {
      elements.stats.style.display = "";
    }
  },
};
