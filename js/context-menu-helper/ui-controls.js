// js/context-menu-helper/ui-controls.js

import UI from '../ui/index.js';
import { waitForIframeLoad } from './element-utils.js';
// CORRECTED IMPORT: Removed processMenuItemWithFreshState
import { generateContextAwareMenuActions } from './action-generator.js';
import { emit } from '../events.js'; // Import emit

// --- createMenuSelectionDialog function (Keep from previous response) ---
function createMenuSelectionDialog(menuItems) {
  return new Promise((resolve) => {
    // Create modal backdrop
    const backdrop = document.createElement('div');
    backdrop.style.position = 'fixed';
    backdrop.style.top = '0';
    backdrop.style.left = '0';
    backdrop.style.width = '100%';
    backdrop.style.height = '100%';
    backdrop.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    backdrop.style.zIndex = '10000';
    backdrop.style.display = 'flex';
    backdrop.style.justifyContent = 'center';
    backdrop.style.alignItems = 'center';

    // Create modal container
    const modal = document.createElement('div');
    modal.style.backgroundColor = 'white';
    modal.style.borderRadius = '8px';
    modal.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
    modal.style.width = '400px';
    modal.style.maxHeight = '80vh';
    modal.style.overflowY = 'auto';
    modal.style.padding = '20px';

    // Create modal header
    const header = document.createElement('h3');
    header.textContent = 'Select Menu Items';
    header.style.marginTop = '0';
    header.style.marginBottom = '15px';

    // Create checkbox container
    const checkboxContainer = document.createElement('div');
    checkboxContainer.style.maxHeight = '300px';
    checkboxContainer.style.overflowY = 'auto';
    checkboxContainer.style.marginBottom = '15px';
    checkboxContainer.style.border = '1px solid #eee';
    checkboxContainer.style.padding = '10px';

    // "Select All" option
    const selectAllContainer = document.createElement('div');
    selectAllContainer.style.marginBottom = '10px';
    selectAllContainer.style.paddingBottom = '10px';
    selectAllContainer.style.borderBottom = '1px solid #eee';

    const selectAllCheckbox = document.createElement('input');
    selectAllCheckbox.type = 'checkbox';
    selectAllCheckbox.id = 'select-all-menu-items';

    const selectAllLabel = document.createElement('label');
    selectAllLabel.htmlFor = 'select-all-menu-items';
    selectAllLabel.textContent = 'Select All';
    selectAllLabel.style.fontWeight = 'bold';
    selectAllLabel.style.marginLeft = '5px';

    selectAllContainer.appendChild(selectAllCheckbox);
    selectAllContainer.appendChild(selectAllLabel);
    checkboxContainer.appendChild(selectAllContainer);

    // Create a checkbox for each menu item
    const checkboxes = [];
    menuItems.forEach((item, index) => {
      const itemContainer = document.createElement('div');
      itemContainer.style.marginBottom = '8px';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `menu-item-${index}`;
      checkbox.value = item;
      checkboxes.push(checkbox);

      const label = document.createElement('label');
      label.htmlFor = `menu-item-${index}`;
      label.textContent = item;
      label.style.marginLeft = '5px';

      itemContainer.appendChild(checkbox);
      itemContainer.appendChild(label);
      checkboxContainer.appendChild(itemContainer);
    });

    // Add select all functionality
    selectAllCheckbox.addEventListener('change', () => {
      const isChecked = selectAllCheckbox.checked;
      checkboxes.forEach(checkbox => {
        checkbox.checked = isChecked;
      });
    });

    // Create button container
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'flex-end';
    buttonContainer.style.gap = '10px';

    // Create cancel button
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.className = 'btn btn-small';
    cancelButton.style.backgroundColor = '#f2f2f2';
    cancelButton.style.color = '#333';

    // Create generate button
    const generateButton = document.createElement('button');
    generateButton.textContent = 'Generate Actions';
    generateButton.className = 'btn btn-small';

    // Add event listeners to buttons
    cancelButton.addEventListener('click', () => {
      if (backdrop.parentNode) {
          document.body.removeChild(backdrop);
      }
      resolve([]);
    });

    generateButton.addEventListener('click', () => {
      const selectedItems = checkboxes
        .filter(checkbox => checkbox.checked)
        .map(checkbox => checkbox.value);

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
  // Store the original src to restore later if needed, though the main loop handles this too
  // const originalSrc = iframe.src;

  // Load the URL fresh to reset any state from previous processing
  iframe.src = url;
  await waitForIframeLoad(iframe);

  // Wait for dynamic content to potentially load after iframe reports loaded
  await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second wait

  // Log status in the main UI if possible
  if(UI.utils && UI.utils.showStatus) {
    UI.utils.showStatus(`Generating actions for ${menuItem}...`, false);
  } else {
    console.log(`Generating actions for ${menuItem}...`);
  }


  try {
    // Generate actions for this menu item using the imported function
    // It needs the current URL, optional wait time, toolbar flag, and the specific menu item
    const actions = await generateContextAwareMenuActions(
      iframe.src, // Use the currently loaded URL in the iframe
      undefined,  // Use default wait time from action-generator
      includeToolbar,
      menuItem    // Pass the specific menu item
    );

    return actions || []; // Return empty array if null/undefined
  } catch (error) {
    console.error(`Error generating actions for ${menuItem}:`, error);
     if(UI.utils && UI.utils.showStatus) {
        UI.utils.showStatus(`Error generating actions for ${menuItem}: ${error.message}`, true);
     }
    return []; // Return empty array on error
  }
  // No finally block needed here to restore URL, as the main loop does that
}
// --- End processMenuItemWithFreshState ---


// --- createSelectionBadge and toggleSelectionList (Keep from previous response) ---
function createSelectionBadge(selectedItems) {
  const badge = document.createElement('div');
  badge.id = 'menu-selection-badge';
  badge.style.display = 'inline-block';
  badge.style.padding = '5px 10px';
  badge.style.backgroundColor = '#e9f5ff';
  badge.style.color = '#0066cc';
  badge.style.borderRadius = '15px';
  badge.style.fontSize = '14px';
  badge.style.fontWeight = 'normal';
  badge.style.marginLeft = '10px';
  badge.style.boxShadow = '0 1px 2px rgba(0,0,0,0.1)';
  badge.style.border = '1px solid #cce4ff';

  if (selectedItems.length === 1) {
    badge.textContent = selectedItems[0];
  } else if (selectedItems.length > 1) {
    badge.textContent = `${selectedItems.length} menus selected`;
    badge.title = selectedItems.join(', ');
    badge.style.cursor = 'pointer';
    badge.addEventListener('click', () => {
      toggleSelectionList(selectedItems);
    });
  }
  return badge;
}

function toggleSelectionList(selectedItems) {
  let listContainer = document.getElementById('selection-list-container');
  if (listContainer) {
    listContainer.style.display = listContainer.style.display === 'none' ? 'block' : 'none';
    return;
  }
  listContainer = document.createElement('div');
  listContainer.id = 'selection-list-container';
  listContainer.style.position = 'absolute';
  listContainer.style.zIndex = '1000';
  listContainer.style.backgroundColor = 'white';
  listContainer.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
  listContainer.style.borderRadius = '4px';
  listContainer.style.padding = '5px 0';
  listContainer.style.marginTop = '5px';
  listContainer.style.maxWidth = '300px';
  listContainer.style.maxHeight = '300px';
  listContainer.style.overflowY = 'auto';
  const badge = document.getElementById('menu-selection-badge');
  if (!badge) return; // Exit if badge not found
  const badgeRect = badge.getBoundingClientRect();
  listContainer.style.left = `${badgeRect.left}px`;
  listContainer.style.top = `${badgeRect.bottom + window.scrollY + 5}px`;
  const header = document.createElement('div');
  header.textContent = 'Selected Menus:';
  header.style.padding = '5px 10px';
  header.style.fontWeight = 'bold';
  header.style.borderBottom = '1px solid #eee';
  listContainer.appendChild(header);
  selectedItems.forEach((item, index) => {
    const itemElement = document.createElement('div');
    itemElement.textContent = item;
    itemElement.style.padding = '5px 15px';
    itemElement.style.borderBottom = index < selectedItems.length - 1 ? '1px solid #f5f5f5' : 'none';
    listContainer.appendChild(itemElement);
  });
  const closeButton = document.createElement('div');
  closeButton.textContent = '✕';
  closeButton.style.position = 'absolute';
  closeButton.style.top = '5px';
  closeButton.style.right = '8px';
  closeButton.style.cursor = 'pointer';
  closeButton.style.color = '#999';
  closeButton.style.fontSize = '12px';
  closeButton.addEventListener('click', (e) => { e.stopPropagation(); listContainer.style.display = 'none'; });
  listContainer.appendChild(closeButton);

  // Define the click outside handler separately to remove it later
  const clickOutsideHandler = (e) => {
    if (listContainer && listContainer.style.display !== 'none' && !listContainer.contains(e.target) && e.target !== badge) {
      listContainer.style.display = 'none';
      // Remove the listener after it's used
      document.removeEventListener('click', clickOutsideHandler);
    }
  };
  // Add the listener
  document.addEventListener('click', clickOutsideHandler);

  document.body.appendChild(listContainer);
}
// --- End createSelectionBadge and toggleSelectionList ---


// --- toggleActionElements function (Keep from previous response) ---
function toggleActionElements(visible) {
  const buttonContainer = document.getElementById("buttonContainer"); // Target container
  if (buttonContainer) {
      buttonContainer.style.display = visible ? "" : "none";
      if (visible) {
          buttonContainer.classList.remove('hidden');
      } else {
          buttonContainer.classList.add('hidden');
      }
  }
}
// --- End toggleActionElements ---

/**
 * Add context-aware UI controls.
 */
export function addUIControls() {
  const container = document.createElement("div");
  container.className = "menu-actions-buttons";
  container.style.marginTop = "10px";
  container.style.marginBottom = "10px";
  container.style.display = "flex";
  container.style.gap = "10px";
  container.style.alignItems = "center";

  const existingContainer = document.querySelector(".menu-actions-buttons");
  if (existingContainer) {
    existingContainer.remove();
  }

  const generateContextButton = document.createElement("button");
  generateContextButton.id = "generateContextActions";
  generateContextButton.className = "btn btn-small";
  generateContextButton.textContent = "Generate Context Actions";
  generateContextButton.title = "Load first URL if needed, then select menu items to generate actions.";

  // Check initial mode and hide button container if advanced
  const isAdvancedInitial = document.getElementById('modeAdvanced')?.checked;
  if (isAdvancedInitial) {
    toggleActionElements(false); // Hide button container initially
  }

  generateContextButton.onclick = async () => {
    try {
      toggleActionElements(false); // Hide button container during generation

      const existingBadge = document.getElementById('menu-selection-badge');
      if (existingBadge) existingBadge.remove();
      const existingList = document.getElementById('selection-list-container');
      if (existingList) existingList.remove();

      const iframe = UI.elements.iframe;
      if (!iframe.src || iframe.src === "about:blank") {
        const urlListElement = document.getElementById("urlList");
        const urlListValue = urlListElement ? urlListElement.value : '';
        const urls = urlListValue.trim().split("\n").filter((url) => url.trim() !== "");
        if (urls.length === 0) { alert("Please enter at least one URL in the URL list first."); return; }
        const firstUrl = urls[0].trim();
        iframe.src = firstUrl;
        await waitForIframeLoad(iframe);
        await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait for dynamic content
      }

      const originalUrl = iframe.src; // Store URL used for generation

      generateContextButton.disabled = true;
      generateContextButton.textContent = "Loading Menu Items...";

      await waitForIframeLoad(iframe); // Ensure it's loaded again
      const mainMenuElements = iframe.contentDocument.querySelectorAll(".menu-wrapper.wrapper-root > .menu-option");
      const mainMenuItems = Array.from(mainMenuElements).map((item) => item.getAttribute("data-label")).filter((label) => label);

      if (mainMenuItems.length === 0) {
        UI.utils.showStatus("No main menu items found in the loaded URL.", true);
        generateContextButton.disabled = false;
        generateContextButton.textContent = "Generate Context Actions";
        return;
      }

      generateContextButton.textContent = "Waiting for Selection...";
      const selectedItems = await createMenuSelectionDialog(mainMenuItems);

      if (selectedItems.length === 0) {
        generateContextButton.disabled = false;
        generateContextButton.textContent = "Generate Context Actions";
        const actionsField = document.getElementById("actionsField");
        if (actionsField) actionsField.value = "";
        toggleActionElements(false);
        return;
      }

      const selectionBadge = createSelectionBadge(selectedItems);
      const btnContainer = document.querySelector(".menu-actions-buttons");
      if(btnContainer) btnContainer.appendChild(selectionBadge);

      const toolbarCheckbox = document.getElementById("includeToolbarButtons");
      const includeToolbar = toolbarCheckbox ? toolbarCheckbox.checked : true;

      const actionsField = document.getElementById("actionsField");
      if (actionsField) actionsField.value = ""; // Clear existing actions

      generateContextButton.textContent = `Generating Actions (0/${selectedItems.length})...`;
      let allActions = [];

      const statusContainer = document.createElement('div');
      statusContainer.id = 'generation-status-container';
      statusContainer.style.marginTop = '10px';
      statusContainer.style.padding = '8px';
      statusContainer.style.backgroundColor = '#f8f9fa';
      statusContainer.style.borderRadius = '4px';
      statusContainer.style.border = '1px solid #e9ecef';

      const parentToInsert = generateContextButton.closest('.input-row') || generateContextButton.parentNode;
       if (parentToInsert && parentToInsert.parentNode) {
            parentToInsert.parentNode.insertBefore(statusContainer, parentToInsert.nextSibling);
       }

      for (let i = 0; i < selectedItems.length; i++) {
        const menuItem = selectedItems[i];
        generateContextButton.textContent = `Generating Actions (${i+1}/${selectedItems.length})...`;
        statusContainer.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div><strong>Processing:</strong> ${menuItem} (${i+1}/${selectedItems.length})</div>
            <div style="background-color: #e2f3ff; padding: 2px 8px; border-radius: 10px; font-size: 12px;">${Math.round((i+1) / selectedItems.length * 100)}%</div>
          </div>
          <div style="height: 4px; background-color: #dee2e6; border-radius: 2px; margin-top: 8px;">
            <div style="height: 100%; width: ${(i+1) / selectedItems.length * 100}%; background-color: #0d6efd; border-radius: 2px;"></div>
          </div>`;

        // Use the *local* processMenuItemWithFreshState function
        const actions = await processMenuItemWithFreshState(originalUrl, menuItem, includeToolbar);

        if (actions && actions.length > 0) {
          allActions = allActions.concat(actions);
        }
      }

      if (statusContainer.parentNode) statusContainer.parentNode.removeChild(statusContainer);

      if (allActions.length > 0 && actionsField) {
          actionsField.value = JSON.stringify(allActions, null, 2);
          emit('CONTEXT_ACTIONS_GENERATED'); // Notify app
          UI.utils.showStatus(`Generated ${allActions.length} context-aware menu actions for ${selectedItems.length} menu items`, false);
      } else if (actionsField) {
          actionsField.value = "";
          emit('CONTEXT_ACTIONS_GENERATED'); // Notify app even if empty
          UI.utils.showStatus("No actions were generated. Try adjusting the URL or wait for the page to fully load.", true);
      }

      if (iframe.src !== originalUrl) {
          iframe.src = originalUrl;
          await waitForIframeLoad(iframe);
      }

    } catch (error) {
      console.error("Error generating context menu actions:", error);
      alert("Error generating context menu actions: " + error.message);
       toggleActionElements(false);
       const actionsField = document.getElementById("actionsField");
       if (actionsField) actionsField.value = "";
    } finally {
      generateContextButton.disabled = false;
      generateContextButton.textContent = "Generate Context Actions";
      // Final button state check is handled by the emitted event listener
    }
  };

  container.appendChild(generateContextButton);

  // Insertion logic (same as before)
  const actionsFieldLabel = document.querySelector('label[for="actionsField"]');
  const actionsFieldElement = document.getElementById("actionsField");
  const targetElementForInsertion = actionsFieldLabel || actionsFieldElement;

  if (targetElementForInsertion && targetElementForInsertion.parentNode) {
       const insertionPoint = targetElementForInsertion.closest('.input-row') || targetElementForInsertion.parentNode;
       // Make sure insertionPoint and its parentNode exist before inserting
       if (insertionPoint && insertionPoint.parentNode) {
           insertionPoint.parentNode.insertBefore(container, insertionPoint);
       } else {
           console.error("Could not determine insertion point parent for context action buttons.");
           // Fallback append
            const advancedOptionsContainer = document.getElementById("advancedOptions");
            if (advancedOptionsContainer) advancedOptionsContainer.appendChild(container);
       }

   } else {
      console.error("Could not find appropriate insertion point for context action buttons.");
      const advancedOptionsContainer = document.getElementById("advancedOptions");
      if (advancedOptionsContainer) advancedOptionsContainer.appendChild(container);
   }
}

export default {
  addUIControls
};