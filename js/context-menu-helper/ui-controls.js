// ui-controls.js - UI functions for context menu helper

import UI from '../ui/index.js';
import { waitForIframeLoad } from './element-utils.js';
import { generateContextAwareMenuActions } from './action-generator.js';

/**
 * Add context-aware UI controls.
 * Combines the "Load First URL" with "Generate Context Actions" into one button.
 * Always prompts the user to select a main menu item.
 * Toolbar interactions default to enabled.
 */
export function addUIControls() {
  const container = document.createElement("div");
  container.className = "menu-actions-buttons";
  container.style.marginTop = "10px";
  container.style.marginBottom = "10px";
  container.style.display = "flex";
  container.style.gap = "10px";

  // Remove any existing container
  const existingContainer = document.querySelector(".menu-actions-buttons");
  if (existingContainer) {
    existingContainer.remove();
  }

  // Create single button "Generate Context Actions"
  const generateContextButton = document.createElement("button");
  generateContextButton.id = "generateContextActions";
  generateContextButton.className = "btn btn-small";
  generateContextButton.textContent = "Generate Context Actions";
  generateContextButton.title =
    "Load first URL if needed, then prompt for main menu item, then generate actions.";

  generateContextButton.onclick = async () => {
    try {
      const iframe = UI.elements.iframe;
      // If no URL is loaded, automatically load the first URL from the list.
      if (!iframe.src || iframe.src === "about:blank") {
        const urlListElement = document.getElementById("urlList");
        const urlListValue = urlListElement.value;
        const urls = urlListValue
          .trim()
          .split("\n")
          .filter((url) => url.trim() !== "");
        if (urls.length === 0) {
          alert("Please enter at least one URL.");
          return;
        }
        const firstUrl = urls[0].trim();
        UI.elements.progress.innerHTML = `Automatically loading first URL: ${firstUrl}...`;
        iframe.src = firstUrl;
        await waitForIframeLoad(iframe);
        // Wait an extra 5 seconds for dynamic content
        await new Promise((resolve) => setTimeout(resolve, 5000));
        UI.elements.progress.innerHTML = `${firstUrl} loaded. Ready for action generation.`;
      }
      generateContextButton.disabled = true;
      generateContextButton.textContent = "Generating...";

      // Get the includeToolbarButtons value; default to true if not found.
      const toolbarCheckbox = document.getElementById(
        "includeToolbarButtons"
      );
      const includeToolbar = toolbarCheckbox ? toolbarCheckbox.checked : true;

      const actions = await generateContextAwareMenuActions(
        iframe.src,
        undefined,
        includeToolbar
      );
      if (actions.length > 0) {
        document.getElementById("actionsField").value = JSON.stringify(
          actions,
          null,
          2
        );
        UI.utils.showStatus(
          `Generated ${actions.length} context-aware menu actions`,
          false
        );
      } else {
        alert(
          "No menu items found. Try adjusting the URL or wait for the page to fully load."
        );
      }
    } catch (error) {
      console.error("Error generating context menu actions:", error);
      alert("Error generating context menu actions: " + error.message);
    } finally {
      generateContextButton.disabled = false;
      generateContextButton.textContent = "Generate Context Actions";
    }
  };

  container.appendChild(generateContextButton);
  const actionsField = document.getElementById("actionsField");
  if (actionsField) {
    actionsField.parentNode.insertBefore(container, actionsField);
  }
}

export default {
  addUIControls
};