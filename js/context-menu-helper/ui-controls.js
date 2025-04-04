// js/context-menu-helper/ui-controls.js

import UI from "../ui/index.js";
import { waitForIframeLoad } from "./element-utils.js";
import { generateContextAwareMenuActions } from "./action-generator.js";
import { emit } from "../events.js"; // Import emit

// --- createMenuSelectionDialog function ---
function createMenuSelectionDialog(menuItems) {
  return new Promise((resolve) => {
    // Create modal backdrop
    const backdrop = document.createElement("div");
    backdrop.style.position = "fixed";
    backdrop.style.top = "0";
    backdrop.style.left = "0";
    backdrop.style.width = "100%";
    backdrop.style.height = "100%";
    backdrop.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
    backdrop.style.zIndex = "10000";
    backdrop.style.display = "flex";
    backdrop.style.justifyContent = "center";
    backdrop.style.alignItems = "center";

    // Create modal container
    const modal = document.createElement("div");
    modal.style.backgroundColor = "white";
    modal.style.borderRadius = "8px";
    modal.style.boxShadow = "0 2px 10px rgba(0, 0, 0, 0.2)";
    modal.style.width = "400px";
    modal.style.maxHeight = "80vh";
    modal.style.overflowY = "auto";
    modal.style.padding = "20px";

    // Create modal header
    const header = document.createElement("h3");
    header.textContent = "Select Menu Items";
    header.style.marginTop = "0";
    header.style.marginBottom = "15px";

    // Create checkbox container
    const checkboxContainer = document.createElement("div");
    checkboxContainer.style.maxHeight = "300px";
    checkboxContainer.style.overflowY = "auto";
    checkboxContainer.style.marginBottom = "15px";
    checkboxContainer.style.border = "1px solid #eee";
    checkboxContainer.style.padding = "10px";

    // "Select All" option
    const selectAllContainer = document.createElement("div");
    selectAllContainer.style.marginBottom = "10px";
    selectAllContainer.style.paddingBottom = "10px";
    selectAllContainer.style.borderBottom = "1px solid #eee";

    const selectAllCheckbox = document.createElement("input");
    selectAllCheckbox.type = "checkbox";
    selectAllCheckbox.id = "select-all-menu-items";

    const selectAllLabel = document.createElement("label");
    selectAllLabel.htmlFor = "select-all-menu-items";
    selectAllLabel.textContent = "Select All";
    selectAllLabel.style.fontWeight = "bold";
    selectAllLabel.style.marginLeft = "5px";

    selectAllContainer.appendChild(selectAllCheckbox);
    selectAllContainer.appendChild(selectAllLabel);
    checkboxContainer.appendChild(selectAllContainer);

    // Create a checkbox for each menu item
    const checkboxes = [];
    menuItems.forEach((item, index) => {
      const itemContainer = document.createElement("div");
      itemContainer.style.marginBottom = "8px";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = `menu-item-${index}`;
      checkbox.value = item;
      checkboxes.push(checkbox);

      const label = document.createElement("label");
      label.htmlFor = `menu-item-${index}`;
      label.textContent = item;
      label.style.marginLeft = "5px";

      itemContainer.appendChild(checkbox);
      itemContainer.appendChild(label);
      checkboxContainer.appendChild(itemContainer);
    });

    // Add select all functionality
    selectAllCheckbox.addEventListener("change", () => {
      const isChecked = selectAllCheckbox.checked;
      checkboxes.forEach((checkbox) => {
        checkbox.checked = isChecked;
      });
    });

    // Create button container
    const buttonContainer = document.createElement("div");
    buttonContainer.style.display = "flex";
    buttonContainer.style.justifyContent = "flex-end";
    buttonContainer.style.gap = "10px";

    // Create cancel button
    const cancelButton = document.createElement("button");
    cancelButton.textContent = "Cancel";
    cancelButton.className = "btn btn-small";
    cancelButton.style.backgroundColor = "#f2f2f2";
    cancelButton.style.color = "#333";

    // Create generate button
    const generateButton = document.createElement("button");
    generateButton.textContent = "Generate Actions";
    generateButton.className = "btn btn-small";

    // Add event listeners to buttons
    cancelButton.addEventListener("click", () => {
      if (backdrop.parentNode) {
        document.body.removeChild(backdrop);
      }
      resolve([]);
    });

    generateButton.addEventListener("click", () => {
      const selectedItems = checkboxes
        .filter((checkbox) => checkbox.checked)
        .map((checkbox) => checkbox.value);

      if (backdrop.parentNode) {
        document.body.removeChild(backdrop);
      }
      resolve(selectedItems);
    });

    // Assemble modal
    buttonContainer.appendChild(cancelButton);
    buttonContainer.appendChild(generateButton);

    modal.appendChild(header);
    modal.appendChild(checkboxContainer);
    modal.appendChild(buttonContainer);

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
  });
}
// --- End createMenuSelectionDialog ---

// --- processMenuItemWithFreshState function definition ---
/**
 * Process one menu item at a time with a fresh iframe state
 * @param {string} url - URL to load
 * @param {string} menuItem - Menu item to process
 * @param {boolean} includeToolbar - Whether to include toolbar buttons
 * @returns {Promise<Array>} - Array of action sequences
 */
async function processMenuItemWithFreshState(url, menuItem, includeToolbar) {
  const iframe = UI.elements.iframe;

  // Load the URL fresh to reset any state from previous processing
  iframe.src = url;
  await waitForIframeLoad(iframe);

  // Wait for dynamic content to potentially load after iframe reports loaded
  await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 second wait

  // Log status in the main UI if possible
  if (UI.utils && UI.utils.showStatus) {
    UI.utils.showStatus(`Generating actions for ${menuItem}...`, false);
  } else {
    console.log(`Generating actions for ${menuItem}...`);
  }

  try {
    // Generate actions for this menu item using the imported function
    // It needs the current URL, optional wait time, toolbar flag, and the specific menu item
    const actions = await generateContextAwareMenuActions(
      iframe.src, // Use the currently loaded URL in the iframe
      undefined, // Use default wait time from action-generator
      includeToolbar,
      menuItem // Pass the specific menu item
    );

    return actions || []; // Return empty array if null/undefined
  } catch (error) {
    console.error(`Error generating actions for ${menuItem}:`, error);
    if (UI.utils && UI.utils.showStatus) {
      UI.utils.showStatus(
        `Error generating actions for ${menuItem}: ${error.message}`,
        true
      );
    }
    return []; // Return empty array on error
  }
  // No finally block needed here to restore URL, as the main loop does that
}
// --- End processMenuItemWithFreshState ---

// --- createSelectionBadge and toggleSelectionList ---
function createSelectionBadge(selectedItems) {
  const badge = document.createElement("div");
  badge.id = "menu-selection-badge";
  badge.style.display = "inline-block";
  badge.style.padding = "5px 10px";
  badge.style.backgroundColor = "#e9f5ff";
  badge.style.color = "#0066cc";
  badge.style.borderRadius = "15px";
  badge.style.fontSize = "14px";
  badge.style.fontWeight = "normal";
  badge.style.marginLeft = "10px";
  badge.style.boxShadow = "0 1px 2px rgba(0,0,0,0.1)";
  badge.style.border = "1px solid #cce4ff";

  if (selectedItems.length === 1) {
    badge.textContent = selectedItems[0];
  } else if (selectedItems.length > 1) {
    badge.textContent = `${selectedItems.length} menus selected`;
    badge.title = selectedItems.join(", ");
    badge.style.cursor = "pointer";
    badge.addEventListener("click", () => {
      toggleSelectionList(selectedItems);
    });
  }
  return badge;
}

function toggleSelectionList(selectedItems) {
  let listContainer = document.getElementById("selection-list-container");
  if (listContainer) {
    listContainer.style.display =
      listContainer.style.display === "none" ? "block" : "none";
    return;
  }
  listContainer = document.createElement("div");
  listContainer.id = "selection-list-container";
  listContainer.style.position = "absolute";
  listContainer.style.zIndex = "1000";
  listContainer.style.backgroundColor = "white";
  listContainer.style.boxShadow = "0 2px 10px rgba(0,0,0,0.2)";
  listContainer.style.borderRadius = "4px";
  listContainer.style.padding = "5px 0";
  listContainer.style.marginTop = "5px";
  listContainer.style.maxWidth = "300px";
  listContainer.style.maxHeight = "300px";
  listContainer.style.overflowY = "auto";
  const badge = document.getElementById("menu-selection-badge");
  if (!badge) return; // Exit if badge not found
  const badgeRect = badge.getBoundingClientRect();
  listContainer.style.left = `${badgeRect.left}px`;
  listContainer.style.top = `${badgeRect.bottom + window.scrollY + 5}px`;
  const header = document.createElement("div");
  header.textContent = "Selected Menus:";
  header.style.padding = "5px 10px";
  header.style.fontWeight = "bold";
  header.style.borderBottom = "1px solid #eee";
  listContainer.appendChild(header);
  selectedItems.forEach((item, index) => {
    const itemElement = document.createElement("div");
    itemElement.textContent = item;
    itemElement.style.padding = "5px 15px";
    itemElement.style.borderBottom =
      index < selectedItems.length - 1 ? "1px solid #f5f5f5" : "none";
    listContainer.appendChild(itemElement);
  });
  const closeButton = document.createElement("div");
  closeButton.textContent = "✕";
  closeButton.style.position = "absolute";
  closeButton.style.top = "5px";
  closeButton.style.right = "8px";
  closeButton.style.cursor = "pointer";
  closeButton.style.color = "#999";
  closeButton.style.fontSize = "12px";
  closeButton.addEventListener("click", (e) => {
    e.stopPropagation();
    listContainer.style.display = "none";
  });
  listContainer.appendChild(closeButton);

  // Define the click outside handler separately to remove it later
  const clickOutsideHandler = (e) => {
    if (
      listContainer &&
      listContainer.style.display !== "none" &&
      !listContainer.contains(e.target) &&
      e.target !== badge
    ) {
      listContainer.style.display = "none";
      // Remove the listener after it's used
      document.removeEventListener("click", clickOutsideHandler);
    }
  };
  // Add the listener
  document.addEventListener("click", clickOutsideHandler);

  document.body.appendChild(listContainer);
}
// --- End createSelectionBadge and toggleSelectionList ---

// --- toggleActionElements function ---
function toggleActionElements(visible) {
  const buttonContainer = document.getElementById("buttonContainer"); // Target container
  if (buttonContainer) {
    buttonContainer.style.display = visible ? "" : "none";
    if (visible) {
      buttonContainer.classList.remove("hidden");
    } else {
      buttonContainer.classList.add("hidden");
    }
  }
}
// --- End toggleActionElements ---

// --- The main function to add UI controls ---
export function addUIControls() {
  // Find the target element to add UI controls
  const actionsLabel = UI.elements.actionsLabel;
  if (!actionsLabel) {
    console.warn('No actionsLabel element found for UI controls');
    return;
  }

  const parentNode = actionsLabel.parentNode;
  if (!parentNode) {
    console.warn('No parent node found for actionsLabel');
    return;
  }
  
  // Create the context actions header container
  const contextActionsHeader = document.createElement("div");
  contextActionsHeader.className = "context-actions-header";

  // Create the label (reuse existing label)
  const contextActionsLabel = actionsLabel.cloneNode(true);
  contextActionsLabel.className = "context-actions-label";

  // Create the buttons container
  const contextActionsButtons = document.createElement("div");
  contextActionsButtons.className = "context-actions-buttons";

  // Create the generate button
  const generateContextButton = document.createElement("button");
  generateContextButton.id = "generateContextActions";
  generateContextButton.className = "action-btn generate-btn";
  generateContextButton.title = "Load first URL if needed, then select menu items to generate actions.";

  // Create the icon and text spans for the generate button
  const generateIconSpan = document.createElement("span");
  generateIconSpan.className = "action-icon";
  generateIconSpan.textContent = "⚙️";

  const generateTextSpan = document.createElement("span");
  generateTextSpan.className = "action-text";
  generateTextSpan.textContent = "Generate";

  // Add the icon and text to the generate button
  generateContextButton.appendChild(generateIconSpan);
  generateContextButton.appendChild(generateTextSpan);

  // Create the load button (disabled)
  const loadContextButton = document.createElement("button");
  loadContextButton.id = "loadContextActions";
  loadContextButton.className = "action-btn load-btn";
  loadContextButton.disabled = true;
  loadContextButton.title = "Load saved JSON actions (coming soon)";

  // Create the icon and text spans for the load button
  const loadIconSpan = document.createElement("span");
  loadIconSpan.className = "action-icon";
  loadIconSpan.textContent = "📂";

  const loadTextSpan = document.createElement("span");
  loadTextSpan.className = "action-text";
  loadTextSpan.textContent = "Load";

  // Add the icon and text to the load button
  loadContextButton.appendChild(loadIconSpan);
  loadContextButton.appendChild(loadTextSpan);

  // Create the save button (disabled)
  const saveContextButton = document.createElement("button");
  saveContextButton.id = "saveContextActions";
  saveContextButton.className = "action-btn save-btn";
  saveContextButton.disabled = true;
  saveContextButton.title = "Save current JSON actions (coming soon)";

  // Create the icon and text spans for the save button
  const saveIconSpan = document.createElement("span");
  saveIconSpan.className = "action-icon";
  saveIconSpan.textContent = "💾";

  const saveTextSpan = document.createElement("span");
  saveTextSpan.className = "action-text";
  saveTextSpan.textContent = "Save";

  // Add the icon and text to the save button
  saveContextButton.appendChild(saveIconSpan);
  saveContextButton.appendChild(saveTextSpan);

  // Add all buttons to the buttons container
  contextActionsButtons.appendChild(generateContextButton);
  contextActionsButtons.appendChild(loadContextButton);
  contextActionsButtons.appendChild(saveContextButton);

  // Add the label and buttons to the header
  contextActionsHeader.appendChild(contextActionsLabel);
  contextActionsHeader.appendChild(contextActionsButtons);

  // Replace the existing label with our new header
  parentNode.replaceChild(contextActionsHeader, actionsLabel);

  // Initial state - check if advanced mode is on
  const isAdvancedInitial = document.getElementById("modeAdvanced")?.checked;
  if (isAdvancedInitial) {
    toggleActionElements(false); // Initially hide button container in advanced mode
  }

  // Add click event handler for Generate Context Actions button
  generateContextButton.onclick = async () => {
    // Get references to elements needed within the handler
    const actionsField = UI.elements.actionsField; // Textarea
    const statusDiv = UI.elements.actionsGenerationStatus; // Status div

    if (!actionsField || !statusDiv) {
      console.error("Actions field or status div not found!");
      return; // Exit if essential elements are missing
    }

    try {
      toggleActionElements(false); // Hide button container during generation
      statusDiv.style.display = "block"; // Show status div
      statusDiv.className = "generation-status active"; // Add active class for styling
      actionsField.style.display = "none"; // Hide textarea
      statusDiv.innerHTML = "Initializing..."; // Initial message

      const existingBadge = document.getElementById("menu-selection-badge");
      if (existingBadge) existingBadge.remove();
      const existingList = document.getElementById("selection-list-container");
      if (existingList) existingList.remove();

      const iframe = UI.elements.iframe;
      if (!iframe.src || iframe.src === "about:blank") {
        const urlListElement = document.getElementById("urlList");
        const urlListValue = urlListElement ? urlListElement.value : "";
        const urls = urlListValue
          .trim()
          .split("\n")
          .filter((url) => url.trim() !== "");
        if (urls.length === 0) {
          alert("Please enter at least one URL in the URL list first.");
          statusDiv.style.display = "none";
          actionsField.style.display = "";
          return;
        } // Show textarea again on error
        const firstUrl = urls[0].trim();
        statusDiv.innerHTML = "Loading initial URL...";
        iframe.src = firstUrl;
        await waitForIframeLoad(iframe);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }

      const originalUrl = iframe.src;

      generateContextButton.disabled = true;
      // Update button appearance during loading
      generateIconSpan.textContent = "⏳";
      generateTextSpan.textContent = "Loading...";

      statusDiv.innerHTML = "Loading menu items..."; // Update status

      await waitForIframeLoad(iframe);
      const mainMenuElements = iframe.contentDocument.querySelectorAll(
        ".menu-wrapper.wrapper-root > .menu-option"
      );
      const mainMenuItems = Array.from(mainMenuElements)
        .map((item) => item.getAttribute("data-label"))
        .filter((label) => label);

      if (mainMenuItems.length === 0) {
        UI.utils.showStatus(
          "No main menu items found in the loaded URL.",
          true
        ); // Show error in main status area
        throw new Error("No main menu items found."); // Throw error to cleanup UI in finally block
      }

      // Update button for selection phase
      generateIconSpan.textContent = "📋";
      generateTextSpan.textContent = "Selecting...";
      statusDiv.innerHTML = "Waiting for menu selection..."; // Update status
      const selectedItems = await createMenuSelectionDialog(mainMenuItems);

      if (selectedItems.length === 0) {
        // User cancelled - Cleanup UI
        throw new Error("Menu selection cancelled."); // Use error to trigger finally block cleanup
      }

      // Append badge to context-actions-header
      const selectionBadge = createSelectionBadge(selectedItems);
      const contextHeaderElement = document.querySelector(".context-actions-header");
      if (contextHeaderElement) {
        contextHeaderElement.appendChild(selectionBadge);
      }

      const toolbarCheckbox = document.getElementById("includeToolbarButtons");
      const includeToolbar = toolbarCheckbox ? toolbarCheckbox.checked : true;

      actionsField.value = ""; // Clear textarea content before generating

      // Update button for generation phase
      generateIconSpan.textContent = "🔄";
      generateTextSpan.textContent = `Generating (0/${selectedItems.length})`;
      
      let allActions = [];

      for (let i = 0; i < selectedItems.length; i++) {
        const menuItem = selectedItems[i];
        // Update button text with progress
        generateTextSpan.textContent = `Generating (${i + 1}/${selectedItems.length})`;

        // Update status IN-PLACE using #actionsGenerationStatus
        const percentage = Math.round(((i + 1) / selectedItems.length) * 100);
        statusDiv.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
            <span><strong>Processing:</strong> ${menuItem} (${i + 1}/${selectedItems.length})</span>
            <span style="font-weight: bold;">${percentage}%</span>
          </div>
          <div class="status-progress-bar-container">
            <div class="status-progress-bar" style="width: ${percentage}%;"></div>
          </div>`;

        const actions = await processMenuItemWithFreshState(
          originalUrl,
          menuItem,
          includeToolbar
        );

        if (actions && actions.length > 0) {
          allActions = allActions.concat(actions);
        }
      }

      // Generation Complete
      statusDiv.innerHTML = `Generated ${allActions.length} actions. Finalizing...`; // Brief final message
      statusDiv.className = "generation-status active success";

      if (allActions.length > 0) {
        actionsField.value = JSON.stringify(allActions, null, 2);
        emit("CONTEXT_ACTIONS_GENERATED");
        UI.utils.showStatus(
          `Generated ${allActions.length} context-aware menu actions for ${selectedItems.length} menu items`,
          false
        );
      } else {
        actionsField.value = "";
        emit("CONTEXT_ACTIONS_GENERATED"); // Emit even if empty
        UI.utils.showStatus(
          "No actions were generated. Try adjusting the URL or wait for the page to fully load.",
          true
        );
      }

      if (iframe.src !== originalUrl) {
        iframe.src = originalUrl;
        await waitForIframeLoad(iframe);
      }
    } catch (error) {
      console.error("Error during context action generation:", error);
      // Don't show alert for cancellation
      if (error.message !== "Menu selection cancelled.") {
        alert("Error generating context menu actions: " + error.message);
      }
      actionsField.value = ""; // Clear actions field on error/cancel
      emit("CONTEXT_ACTIONS_GENERATED"); // Emit to ensure button state is checked (and likely hidden)
    } finally {
      // --- Cleanup UI ---
      generateContextButton.disabled = false;
      generateIconSpan.textContent = "⚙️"; // Reset icon
      generateTextSpan.textContent = "Generate"; // Reset text
      
      // Hide status div and show textarea again
      if (statusDiv) {
        setTimeout(() => {
          statusDiv.style.display = "none";
          statusDiv.className = "generation-status"; // Remove active class
        }, 2000); // Give user time to see final status
      }
      if (actionsField) actionsField.style.display = "";
      // Button container visibility is handled by the emitted event + _checkCaptureButtonState
    }
  };

  // Placeholder listeners for Load/Save buttons
  loadContextButton.addEventListener('click', () => {
    console.log("Load functionality not yet implemented");
  });

  saveContextButton.addEventListener('click', () => {
    console.log("Save functionality not yet implemented");
  });
}

export default {
  addUIControls,
};