// js/context-menu-helper/ui-controls.js

import UI from "../ui/index.js";
import { waitForIframeLoad, findMenuElements } from "./element-utils.js"; // Import findMenuElements
import { generateContextAwareMenuActions } from "./action-generator.js";
import { emit } from "../events.js";

// --- createMenuSelectionDialog function ---
// Creates a modal dialog for selecting menu items based on their text.
function createMenuSelectionDialog(menuItemsWithText) {
  // Accepts array of {element, text}
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
    header.textContent = "Select Menu Items to Generate Actions"; // More descriptive title
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

    // Create a checkbox for each menu item using its text
    const checkboxes = [];
    menuItemsWithText.forEach((item, index) => {
      // Iterate through {element, text} objects
      const itemContainer = document.createElement("div");
      itemContainer.style.marginBottom = "8px";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = `menu-item-${index}`;
      checkbox.value = item.text; // Store the text as the value
      checkboxes.push(checkbox);

      const label = document.createElement("label");
      label.htmlFor = `menu-item-${index}`;
      label.textContent = item.text; // Display the text
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
    buttonContainer.style.marginTop = "15px"; // Add margin

    // Create cancel button
    const cancelButton = document.createElement("button");
    cancelButton.textContent = "Cancel";
    cancelButton.className = "btn btn-small";
    cancelButton.style.backgroundColor = "#f2f2f2";
    cancelButton.style.color = "#333";
    cancelButton.style.border = "1px solid #ccc"; // Add border

    // Create generate button
    const generateButton = document.createElement("button");
    generateButton.textContent = "Generate Actions";
    generateButton.className = "btn btn-small"; // Use primary button style from styles.css if available

    // Add event listeners to buttons
    cancelButton.addEventListener("click", () => {
      if (backdrop.parentNode) {
        document.body.removeChild(backdrop);
      }
      resolve([]); // Resolve with empty array on cancel
    });

    generateButton.addEventListener("click", () => {
      const selectedItemsTexts = checkboxes // Get the text values of selected items
        .filter((checkbox) => checkbox.checked)
        .map((checkbox) => checkbox.value);

      if (backdrop.parentNode) {
        document.body.removeChild(backdrop);
      }
      resolve(selectedItemsTexts); // Resolve with array of selected texts
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
 * Process one menu item (identified by text) at a time with a fresh iframe state.
 * @param {string} url - URL to load initially.
 * @param {string} menuItemText - Text of the menu item to process.
 * @param {boolean} includeToolbar - Whether to include toolbar buttons.
 * @returns {Promise<Array>} - Array of action sequences for this item.
 */
async function processMenuItemWithFreshState(
  url,
  menuItemText,
  includeToolbar
) {
  const iframe = UI.elements.iframe;
  const messagesContainer = document.getElementById("actionItemMessages");
  let messageEl = null;

  // Add status message
  if (messagesContainer) {
    messageEl = document.createElement("div");
    messageEl.className = "action-message";
    messageEl.textContent = `Processing: ${menuItemText}...`;
    messagesContainer.appendChild(messageEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight; // Scroll to show
  }

  try {
    // Load the URL fresh to reset any state from previous processing
    console.log(`Reloading iframe with ${url} for item: "${menuItemText}"`);
    iframe.src = url; // Ensure src is set before awaiting load
    await waitForIframeLoad(iframe);
    console.log(`Iframe loaded for item: "${menuItemText}"`);

    // Generate actions for this specific menu item text
    const actions = await generateContextAwareMenuActions(
      iframe.contentWindow.location.href, // Use the actual URL loaded
      undefined, // Use default wait time
      includeToolbar,
      menuItemText // Pass the specific menu item text
    );

    // Update status message to success
    if (messageEl) {
      messageEl.textContent = `✓ Generated ${
        actions ? actions.length : 0
      } actions for ${menuItemText}`;
      messageEl.classList.add("success");
    }
    console.log(
      `Successfully generated ${
        actions?.length || 0
      } actions for "${menuItemText}"`
    );
    return actions || []; // Return empty array if null/undefined
  } catch (error) {
    console.error(`Error generating actions for ${menuItemText}:`, error);
    // Update status message to error
    if (messageEl) {
      // Check if the error indicates the item wasn't found
      const itemNotFoundError = error.message.includes(
        "not found in main menu"
      );
      messageEl.textContent = itemNotFoundError
        ? `✗ Menu item "${menuItemText}" not found.`
        : `✗ Error for ${menuItemText}`; // Keep error concise: ${error.message}
      messageEl.classList.add("error");
    }
    return []; // Return empty array on error
  } finally {
    // Ensure iframe is ready for the next iteration if possible
    // Optionally navigate back to main menu or reload original URL if needed,
    // but the current loop structure reloads the original URL anyway.
    console.log(`Finished processing item: "${menuItemText}"`);
  }
}
// --- End processMenuItemWithFreshState ---

// --- createSelectionBadges function ---
// Creates badges for selected items, limiting display if many items are selected.
function createSelectionBadges(selectedItemsTexts) {
  const badgesContainer = document.createElement("div");
  badgesContainer.id = "menu-selection-badges"; // Use the ID targeted by CSS

  const maxBadgesToShow = 5; // Show up to 5 badges initially
  const showCountBadge = selectedItemsTexts.length > maxBadgesToShow;

  // Function to render badges (either limited or full list)
  const renderBadges = (showAll = false) => {
    badgesContainer.innerHTML = ""; // Clear previous badges
    const limit = showAll ? selectedItemsTexts.length : maxBadgesToShow;

    for (let i = 0; i < Math.min(limit, selectedItemsTexts.length); i++) {
      const badge = document.createElement("div");
      badge.className = "menu-selection-badge";
      badge.title = selectedItemsTexts[i]; // Tooltip for full text
      // Truncate long text in the badge itself
      badge.textContent =
        selectedItemsTexts[i].length > 20
          ? selectedItemsTexts[i].substring(0, 18) + "..."
          : selectedItemsTexts[i];
      badgesContainer.appendChild(badge);
    }

    if (!showAll && showCountBadge) {
      const remainingCount = selectedItemsTexts.length - maxBadgesToShow;
      const countBadge = document.createElement("div");
      countBadge.className = "menu-selection-badge count-badge";
      countBadge.textContent = `+${remainingCount}`;
      countBadge.title = `Click to see all ${selectedItemsTexts.length} selected items`; // Tooltip for count badge
      countBadge.style.cursor = "pointer";
      countBadge.addEventListener("click", (e) => {
        e.stopPropagation(); // Prevent accidental clicks elsewhere
        renderBadges(true); // Re-render showing all badges
      });
      badgesContainer.appendChild(countBadge);
    } else if (showAll) {
      // Add a "Collapse" badge when showing all
      const collapseBadge = document.createElement("div");
      collapseBadge.className = "menu-selection-badge collapse-badge";
      collapseBadge.textContent = "Collapse";
      collapseBadge.title = "Show fewer badges";
      collapseBadge.style.cursor = "pointer";
      collapseBadge.addEventListener("click", (e) => {
        e.stopPropagation();
        renderBadges(false); // Re-render showing limited badges
      });
      badgesContainer.appendChild(collapseBadge);
    }
  };

  renderBadges(false); // Initial render (limited view)
  return badgesContainer;
}
// --- End createSelectionBadges ---

// --- toggleActionElements function ---
// Shows or hides the main capture/retry button container.
function toggleActionElements(visible) {
  const buttonContainer = document.getElementById("buttonContainer");
  const captureBtn = document.getElementById("captureBtn");
  const retryBtn = document.getElementById("retryFailedBtn");

  if (buttonContainer) {
    buttonContainer.style.display = visible ? "" : "none"; // Show/hide container
    buttonContainer.classList.toggle("hidden", !visible);
    // Explicitly show/hide buttons within if needed, though container display should suffice
    if (captureBtn) captureBtn.style.display = visible ? "" : "none";
    if (retryBtn) retryBtn.style.display = visible ? "" : "none"; // Assuming retry follows same visibility
  }
}
// --- End toggleActionElements ---

// --- The main function to add UI controls ---
// Adds the "Generate", "Load", "Save" buttons and handles the generation process.
export function addUIControls() {
  const actionsLabel = UI.elements.actionsLabel; // Original label element
  if (!actionsLabel) {
    console.warn("Cannot add UI controls: 'actionsLabel' element not found.");
    return;
  }
  const parentNode = actionsLabel.parentNode;
  if (!parentNode) {
    console.warn(
      "Cannot add UI controls: Parent node of 'actionsLabel' not found."
    );
    return;
  }
  // Avoid adding controls multiple times
  if (document.getElementById("generateContextActions")) {
    console.log("UI controls already added.");
    return;
  }

  // --- Create Header Structure ---
  const contextActionsHeader = document.createElement("div");
  contextActionsHeader.className = "context-actions-header";

  const contextActionsLabel = document.createElement("label"); // Create a new label
  contextActionsLabel.className = "context-actions-label";
  contextActionsLabel.htmlFor = UI.elements.actionsField?.id || ""; // Link to the textarea
  contextActionsLabel.textContent = "Context Actions (JSON format):"; // Set text explicitly
  contextActionsLabel.title =
    actionsLabel.title ||
    "Generate or enter menu navigation actions in JSON format"; // Copy title

  const contextActionsButtons = document.createElement("div");
  contextActionsButtons.className = "context-actions-buttons";

  // --- Create Buttons ---
  // Generate Button
  const generateContextButton = document.createElement("button");
  generateContextButton.id = "generateContextActions";
  generateContextButton.className = "action-btn generate-btn";
  generateContextButton.title =
    "Generate actions based on menu items in the loaded URL";
  generateContextButton.innerHTML = `<span class="action-icon">⚙️</span><span class="action-text">Generate</span>`;

  // Load Button (Disabled)
  const loadContextButton = document.createElement("button");
  loadContextButton.id = "loadContextActions";
  loadContextButton.className = "action-btn load-btn";
  loadContextButton.disabled = true;
  loadContextButton.title = "Load saved JSON actions (coming soon)";
  loadContextButton.innerHTML = `<span class="action-icon">📂</span><span class="action-text">Load</span>`;

  // Save Button (Disabled)
  const saveContextButton = document.createElement("button");
  saveContextButton.id = "saveContextActions";
  saveContextButton.className = "action-btn save-btn";
  saveContextButton.disabled = true;
  saveContextButton.title = "Save current JSON actions (coming soon)";
  saveContextButton.innerHTML = `<span class="action-icon">💾</span><span class="action-text">Save</span>`;

  contextActionsButtons.appendChild(generateContextButton);
  contextActionsButtons.appendChild(loadContextButton);
  contextActionsButtons.appendChild(saveContextButton);

  contextActionsHeader.appendChild(contextActionsLabel); // Add the new label
  contextActionsHeader.appendChild(contextActionsButtons);

  // --- Insert Header ---
  // Insert the new header *before* the original label's position, then remove original label
  parentNode.insertBefore(contextActionsHeader, actionsLabel);
  // Note: actionsLabel itself might be removed if not needed elsewhere,
  // or kept if other code references it. Assuming it's safe to remove based on structure.
  // If removing causes issues, hide it instead: actionsLabel.style.display = 'none';
  // Let's try removing it:
  try {
    // parentNode.removeChild(actionsLabel); // Remove the original label node
    actionsLabel.style.display = "none"; // Safer: just hide the original label
    console.log("Original actionsLabel hidden.");
  } catch (e) {
    console.warn("Could not remove or hide original actionsLabel:", e);
  }

  // --- Initial State & Event Listener ---
  const isAdvancedInitial = document.getElementById("modeAdvanced")?.checked;
  if (isAdvancedInitial) {
    toggleActionElements(false); // Hide capture button initially in advanced mode
  }

  generateContextButton.onclick = async () => {
    const actionsField = UI.elements.actionsField;
    const statusDiv = UI.elements.actionsGenerationStatus;
    const messagesContainer = document.getElementById("actionItemMessages"); // Get messages container

    if (!actionsField || !statusDiv || !messagesContainer) {
      console.error(
        "Required elements for generation not found (actionsField, statusDiv, or actionItemMessages)!"
      );
      alert("UI Error: Cannot start generation. Required elements missing.");
      return;
    }

    const generateButtonIcon =
      generateContextButton.querySelector(".action-icon");
    const generateButtonText =
      generateContextButton.querySelector(".action-text");

    try {
      // --- UI Setup for Generation ---
      generateContextButton.disabled = true;
      if (generateButtonIcon) generateButtonIcon.textContent = "⏳";
      if (generateButtonText) generateButtonText.textContent = "Loading...";
      toggleActionElements(false); // Hide capture button
      actionsField.value = ""; // Clear previous actions
      actionsField.style.display = "none"; // Hide textarea
      statusDiv.innerHTML = "Initializing generation..."; // Show initial status
      statusDiv.className = "generation-status active"; // Make status visible and neutral
      statusDiv.style.display = "block";
      messagesContainer.innerHTML = ""; // Clear previous item messages
      messagesContainer.style.display = "block"; // Show item messages container

      // Clean up any existing selection badges/lists
      document.getElementById("selection-list-container")?.remove();
      document.querySelector("#menu-selection-badges")?.remove();

      // --- Load Iframe if Necessary ---
      const iframe = UI.elements.iframe;
      const urlListElement = document.getElementById("urlList");
      const urlListValue = urlListElement ? urlListElement.value : "";
      const urls = urlListValue
        .trim()
        .split("\n")
        .filter((url) => url.trim() !== "");
      const targetUrl = urls.length > 0 ? urls[0].trim() : iframe.src;

      if (!targetUrl || targetUrl === "about:blank") {
        throw new Error(
          "Please enter a valid URL in the URL input field first."
        );
      }

      // Load or ensure the target URL is loaded
      if (
        iframe.src !== targetUrl ||
        iframe.contentDocument?.readyState !== "complete"
      ) {
        if (generateButtonText)
          generateButtonText.textContent = "Loading URL...";
        statusDiv.innerHTML = "Loading target URL in iframe...";
        iframe.src = targetUrl;
        await waitForIframeLoad(iframe); // Wait for load
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Extra wait after load
      }
      const originalUrl = iframe.contentWindow.location.href; // Get URL after loading

      // --- Get Menu Items ---
      if (generateButtonText)
        generateButtonText.textContent = "Finding Menus...";
      statusDiv.innerHTML = "Searching for menu items in iframe...";
      const menuItemsWithText = findMenuElements(iframe.contentDocument); // Use updated function

      if (menuItemsWithText.length === 0) {
        throw new Error(
          "No menu items found in the loaded URL. Check the page structure or wait longer."
        );
      }
      console.log(
        `Found ${menuItemsWithText.length} menu items:`,
        menuItemsWithText.map((i) => i.text)
      );

      // --- User Selection ---
      if (generateButtonText) generateButtonText.textContent = "Selecting...";
      statusDiv.innerHTML = "Waiting for menu item selection...";
      const selectedItemsTexts = await createMenuSelectionDialog(
        menuItemsWithText
      );

      if (selectedItemsTexts.length === 0) {
        throw new Error("Menu selection cancelled by user.");
      }

      // --- Display Selection & Prepare for Generation ---
      const selectionBadges = createSelectionBadges(selectedItemsTexts);
      contextActionsHeader.appendChild(selectionBadges); // Add badges to header

      const toolbarCheckbox = document.getElementById("includeToolbarButtons");
      const includeToolbar = toolbarCheckbox ? toolbarCheckbox.checked : true;

      if (generateButtonText)
        generateButtonText.textContent = `Generating (0/${selectedItemsTexts.length})`;
      statusDiv.innerHTML = `Starting generation for ${selectedItemsTexts.length} items...`;

      // --- Process Each Selected Item ---
      let allActions = [];
      for (let i = 0; i < selectedItemsTexts.length; i++) {
        const menuItemText = selectedItemsTexts[i];
        const progressPercentage = Math.round(
          ((i + 1) / selectedItemsTexts.length) * 100
        );

        // Update progress indicator
        if (generateButtonText)
          generateButtonText.textContent = `Generating (${i + 1}/${
            selectedItemsTexts.length
          })`;
        statusDiv.innerHTML = `
                    <div style="font-weight:bold; margin-bottom: 5px;">Processing item ${
                      i + 1
                    } of ${
          selectedItemsTexts.length
        } (${progressPercentage}%)</div>
                    <div class="status-progress-bar-container">
                        <div class="status-progress-bar" style="width: ${progressPercentage}%;"></div>
                    </div>`;

        // Process the item (this function now handles iframe reload internally)
        const actionsForItem = await processMenuItemWithFreshState(
          originalUrl, // Pass the base URL to reload each time
          menuItemText,
          includeToolbar
        );

        if (actionsForItem && actionsForItem.length > 0) {
          allActions = allActions.concat(actionsForItem);
        }
        // Small delay between processing items to avoid overwhelming the browser/target
        await new Promise((r) => setTimeout(r, 250));
      }

      // --- Finalize ---
      statusDiv.innerHTML = `Generation complete. Found ${allActions.length} total actions.`;
      statusDiv.className = "generation-status active success"; // Mark as success

      if (allActions.length > 0) {
        // Sort actions alphabetically by name for better readability
        allActions.sort((a, b) => a.name.localeCompare(b.name));
        actionsField.value = JSON.stringify(allActions, null, 2); // Pretty print JSON
        console.log("Generated JSON:", actionsField.value);
      } else {
        actionsField.value = "[]"; // Output empty array if no actions generated
        // Update status to warning if nothing was generated but selection was made
        statusDiv.innerHTML = `No actions generated for the selected items. Check console logs.`;
        statusDiv.className = "generation-status active warning";
      }
      emit("CONTEXT_ACTIONS_GENERATED"); // Emit event to update main capture button state
    } catch (error) {
      console.error("Error during context action generation:", error);
      statusDiv.innerHTML = `Error: ${error.message}`;
      statusDiv.className = "generation-status active error"; // Mark as error
      actionsField.value = ""; // Clear field on error
      emit("CONTEXT_ACTIONS_GENERATED"); // Still emit to update button state (likely hide capture button)
    } finally {
      // Around line 514 in the previous version
      // --- UI Cleanup ---
      generateContextButton.disabled = false; // Re-enable button
      // Use querySelector inside the finally block to ensure elements are referenced correctly
      const finalGenerateButtonIcon =
        generateContextButton.querySelector(".action-icon");
      const finalGenerateButtonText =
        generateContextButton.querySelector(".action-text");

      if (finalGenerateButtonIcon) finalGenerateButtonIcon.textContent = "⚙️"; // Reset icon
      if (finalGenerateButtonText)
        finalGenerateButtonText.textContent = "Generate"; // Reset text

      if (actionsField) actionsField.style.display = ""; // Show textarea again

      // Optionally hide status/messages after a delay
      setTimeout(() => {
        // ** FIX START **
        // Check if elements exist before accessing properties
        if (statusDiv) {
          statusDiv.style.display = "none";
        }
        const finalMessagesContainer =
          document.getElementById("actionItemMessages"); // Re-fetch in case it was removed
        if (finalMessagesContainer) {
          finalMessagesContainer.style.display = "none"; // Hide item messages too
        }
        // ** FIX END **
      }, 5000); // Hide after 5 seconds
    }
  };

  // Placeholder listeners for Load/Save
  loadContextButton.addEventListener("click", () =>
    alert("Load functionality not yet implemented.")
  );
  saveContextButton.addEventListener("click", () =>
    alert("Save functionality not yet implemented.")
  );

  console.log("Context menu helper UI controls added.");
}

export default {
  addUIControls,
};
