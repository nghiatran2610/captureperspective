// ui-controls.js - UI functions for context menu helper

import UI from '../ui/index.js';
import { waitForIframeLoad } from './element-utils.js';
import { generateContextAwareMenuActions } from './action-generator.js';

/**
 * Create a menu selection dialog with checkboxes
 * @param {Array} menuItems - Array of menu item labels
 * @returns {Promise<Array>} - Promise resolving to array of selected menu items
 */
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
      document.body.removeChild(backdrop);
      resolve([]);
    });
    
    generateButton.addEventListener('click', () => {
      const selectedItems = checkboxes
        .filter(checkbox => checkbox.checked)
        .map(checkbox => checkbox.value);
      
      document.body.removeChild(backdrop);
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

/**
 * Process one menu item at a time with a fresh iframe state
 * @param {string} url - URL to load
 * @param {string} menuItem - Menu item to process
 * @param {boolean} includeToolbar - Whether to include toolbar buttons
 * @returns {Promise<Array>} - Array of action sequences
 */
async function processMenuItemWithFreshState(url, menuItem, includeToolbar) {
  const iframe = UI.elements.iframe;
  const originalSrc = iframe.src;
  
  // Load the URL fresh to reset any state from previous processing
  iframe.src = url;
  await waitForIframeLoad(iframe);
  
  // Wait for dynamic content to load
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  UI.utils.showStatus(`Generating actions for ${menuItem}...`, false);
  
  try {
    // Generate actions for this menu item
    const actions = await generateContextAwareMenuActions(
      url,
      undefined,  // default wait time
      includeToolbar,
      menuItem    // specific menu item
    );
    
    return actions || [];
  } catch (error) {
    console.error(`Error generating actions for ${menuItem}:`, error);
    UI.utils.showStatus(`Error generating actions for ${menuItem}: ${error.message}`, true);
    return [];
  }
}

/**
 * Add context-aware UI controls.
 * Uses checkbox selection for menu items instead of prompt.
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
    "Load first URL if needed, then select menu items to generate actions.";

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
      
      // Store the original URL
      const originalUrl = iframe.src;
      
      generateContextButton.disabled = true;
      generateContextButton.textContent = "Loading Menu Items...";

      // Find all available menu items
      await waitForIframeLoad(iframe);
      const mainMenuElements = iframe.contentDocument.querySelectorAll(
        ".menu-wrapper.wrapper-root > .menu-option"
      );
      const mainMenuItems = Array.from(mainMenuElements)
        .map((item) => item.getAttribute("data-label"))
        .filter((label) => label);
      
      if (mainMenuItems.length === 0) {
        UI.utils.showStatus("No main menu items found.", true);
        generateContextButton.disabled = false;
        generateContextButton.textContent = "Generate Context Actions";
        return;
      }
      
      // Display the menu selection dialog
      generateContextButton.textContent = "Waiting for Selection...";
      const selectedItems = await createMenuSelectionDialog(mainMenuItems);
      
      if (selectedItems.length === 0) {
        // User cancelled or didn't select anything
        generateContextButton.disabled = false;
        generateContextButton.textContent = "Generate Context Actions";
        return;
      }
      
      // Get the includeToolbarButtons value; default to true if not found.
      const toolbarCheckbox = document.getElementById(
        "includeToolbarButtons"
      );
      const includeToolbar = toolbarCheckbox ? toolbarCheckbox.checked : true;
      
      // Clear the existing actions field
      const actionsField = document.getElementById("actionsField");
      if (actionsField) {
        // Always clear the actions field before generating new actions
        actionsField.value = "";
      }
      
      // Generate actions for each selected menu item one at a time with fresh iframe state
      generateContextButton.textContent = `Generating Actions (0/${selectedItems.length})...`;
      let allActions = [];
      
      for (let i = 0; i < selectedItems.length; i++) {
        const menuItem = selectedItems[i];
        generateContextButton.textContent = `Generating Actions (${i+1}/${selectedItems.length})...`;
        
        // Process each menu item with a fresh iframe state
        const actions = await processMenuItemWithFreshState(originalUrl, menuItem, includeToolbar);
        
        if (actions && actions.length > 0) {
          allActions = allActions.concat(actions);
        }
      }
      
      // Update the actions field with all generated actions
      if (allActions.length > 0) {
        actionsField.value = JSON.stringify(allActions, null, 2);
        UI.utils.showStatus(
          `Generated ${allActions.length} context-aware menu actions for ${selectedItems.length} menu items`,
          false
        );
      } else {
        UI.utils.showStatus(
          "No actions were generated. Try adjusting the URL or wait for the page to fully load.",
          true
        );
      }
      
      // Restore original URL
      iframe.src = originalUrl;
      await waitForIframeLoad(iframe);
      
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