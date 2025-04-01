/**
 * Menu Actions Helper Module
 * Handles generation of menu navigation actions
 */
const MenuActionsHelper = {
  /**
   * Automatically generate action sequences from menu items in iframe
   * @param {string} menuSelector - Selector for the menu container
   * @param {string} itemSelector - Selector for individual menu items
   * @param {number} waitTime - Time to wait after each click (ms)
   * @param {boolean} includeSubmenus - Whether to include submenu items
   * @returns {Array} - Array of action sequences
   */
  generateMenuActions(menuSelector = '.menu-wrapper.wrapper-root', itemSelector = '.menu-option', waitTime = 2000, includeSubmenus = true) {
    try {
      const iframe = UI.elements.iframe;
      if (!iframe.contentDocument) {
        console.error('iframe not loaded or accessible');
        return [];
      }
      
      // Find all menu items in the main menu
      const menuItems = iframe.contentDocument.querySelectorAll(`${menuSelector} > ${itemSelector}`);
      if (!menuItems || menuItems.length === 0) {
        console.error(`No menu items found with selector: ${menuSelector} > ${itemSelector}`);
        return [];
      }
      
      console.log(`Found ${menuItems.length} main menu items`);
      
      const actionSequences = [];
      
      // Process main menu items
      Array.from(menuItems).forEach(item => {
        // Get the data-label attribute as the identifier
        const label = item.getAttribute('data-label');
        
        if (!label) {
          console.warn('Menu item without data-label attribute found, skipping');
          return;
        }
        
        // Check if this item has a submenu (indicated by the nav-icon with chevron_right)
        const hasSubmenu = item.querySelector('.nav-icon svg[data-icon*="chevron_right"]') !== null;
        
        // Create action for this main menu item
        actionSequences.push({
          name: label,
          actions: [
            // Use selector targeting the data-label attribute
            { type: 'click', selector: `.menu-option[data-label="${label}"]` },
            { type: 'wait', duration: waitTime }
          ]
        });
        
        // If this item has a submenu and we want to include submenus
        if (hasSubmenu && includeSubmenus) {
          // Add a small delay to ensure submenu loads before accessing it
          setTimeout(() => {
            try {
              // Select the submenu wrapper that appears after clicking the main item
              const submenuWrapper = iframe.contentDocument.querySelector('.submenu-group .wrapper-submenu');
              
              if (submenuWrapper) {
                // Find all menu items in the submenu
                const submenuItems = submenuWrapper.querySelectorAll(itemSelector);
                
                // Process each submenu item
                Array.from(submenuItems).forEach(subItem => {
                  const subLabel = subItem.getAttribute('data-label');
                  
                  // Skip items without data-label
                  if (!subLabel) return;
                  
                  // Skip the menu header or back button
                  if (subItem.classList.contains('menu-header') || 
                      subItem.classList.contains('menu-back-action')) return;
                  
                  // Add action sequence for this submenu item
                  actionSequences.push({
                    name: `${label} - ${subLabel}`,
                    actions: [
                      // First click the main menu item
                      { type: 'click', selector: `.menu-option[data-label="${label}"]` },
                      { type: 'wait', duration: waitTime / 2 },
                      // Then click the submenu item
                      { type: 'click', selector: `.submenu-group .menu-option[data-label="${subLabel}"]` },
                      { type: 'wait', duration: waitTime }
                    ]
                  });
                });
              }
            } catch (e) {
              console.warn(`Error processing submenu for ${label}:`, e);
            }
          }, waitTime);
        }
      });
      
      return actionSequences;
    } catch (error) {
      console.error('Error generating menu actions:', error);
      return [];
    }
  },
  
  /**
   * Generate menu actions with a two-pass approach for submenus
   * This is more reliable for capturing submenus
   */
  generateMenuActionsWithSubmenus(waitTime = 2000) {
    return new Promise((resolve, reject) => {
      try {
        const iframe = UI.elements.iframe;
        if (!iframe.contentDocument) {
          return reject('iframe not loaded or accessible');
        }
        
        // Find all main menu items
        const menuItems = iframe.contentDocument.querySelectorAll('.menu-wrapper.wrapper-root > .menu-option');
        if (!menuItems || menuItems.length === 0) {
          return reject('No main menu items found');
        }
        
        console.log(`Found ${menuItems.length} main menu items`);
        
        const allActions = [];
        const mainItemsWithSubmenus = [];
        
        // First pass: Add main menu items and identify those with submenus
        Array.from(menuItems).forEach(item => {
          const label = item.getAttribute('data-label');
          if (!label) return;
          
          // Check if this item has a submenu (indicated by the nav-icon with chevron_right)
          const hasSubmenu = item.querySelector('.nav-icon svg[data-icon*="chevron_right"]') !== null;
          
          // Add action for this main menu item
          allActions.push({
            name: label,
            actions: [
              { type: 'click', selector: `.menu-option[data-label="${label}"]` },
              { type: 'wait', duration: waitTime }
            ]
          });
          
          // Track items with submenus for second pass
          if (hasSubmenu) {
            mainItemsWithSubmenus.push(label);
          }
        });
        
        console.log(`Found ${mainItemsWithSubmenus.length} main items with potential submenus`);
        
        // If no submenus to process, return just the main items
        if (mainItemsWithSubmenus.length === 0) {
          return resolve(allActions);
        }
        
        // Second pass: Process each item with a submenu
        const processSubmenus = async () => {
          for (const mainLabel of mainItemsWithSubmenus) {
            // Click the main menu item to reveal its submenu
            const mainMenuItem = iframe.contentDocument.querySelector(`.menu-option[data-label="${mainLabel}"]`);
            if (mainMenuItem) {
              console.log(`Clicking main menu item: ${mainLabel} to reveal submenu`);
              mainMenuItem.click();
              
              // Wait for submenu to appear
              await new Promise(r => setTimeout(r, waitTime / 2));
              
              // Find submenu items
              const submenuWrapper = iframe.contentDocument.querySelector('.submenu-group .wrapper-submenu');
              if (submenuWrapper) {
                const submenuItems = submenuWrapper.querySelectorAll('.menu-option');
                console.log(`Found ${submenuItems.length} submenu items for ${mainLabel}`);
                
                // Process each submenu item
                Array.from(submenuItems).forEach(subItem => {
                  const subLabel = subItem.getAttribute('data-label');
                  
                  // Skip items without data-label
                  if (!subLabel) return;
                  
                  // Skip the menu header or back button
                  if (subItem.classList.contains('menu-header') || 
                      subItem.classList.contains('menu-back-action')) return;
                  
                  // Add action sequence for this submenu item
                  allActions.push({
                    name: `${mainLabel} - ${subLabel}`,
                    actions: [
                      // First click the main menu item
                      { type: 'click', selector: `.menu-option[data-label="${mainLabel}"]` },
                      { type: 'wait', duration: waitTime / 2 },
                      // Then click the submenu item
                      { type: 'click', selector: `.submenu-group .menu-option[data-label="${subLabel}"]` },
                      { type: 'wait', duration: waitTime }
                    ]
                  });
                });
              }
              
              // Click the back button to return to main menu
              const backButton = iframe.contentDocument.querySelector('.submenu-group .menu-back-action');
              if (backButton) {
                console.log(`Clicking back button to return to main menu`);
                backButton.click();
                
                // Wait for main menu to reappear
                await new Promise(r => setTimeout(r, waitTime / 2));
              }
            }
          }
          
          resolve(allActions);
        };
        
        // Start processing submenus
        processSubmenus().catch(error => {
          console.error('Error processing submenus:', error);
          // If submenu processing fails, at least return the main menu items
          resolve(allActions);
        });
        
      } catch (error) {
        console.error('Error in menu action generation:', error);
        reject(error);
      }
    });
  },
  
  /**
   * Add menu action generator UI controls
   */
  addUIControls() {
    // Create a container for the helper buttons
    const container = document.createElement('div');
    container.className = 'menu-actions-buttons';
    container.style.marginTop = '10px';
    container.style.marginBottom = '10px';
    container.style.display = 'flex';
    container.style.gap = '10px';
    
    // Create "Load URL" button
    const loadButton = document.createElement('button');
    loadButton.className = 'btn btn-small';
    loadButton.textContent = 'Load First URL';
    loadButton.title = 'Load the first URL from the list into the iframe';
    loadButton.onclick = () => {
      const urlList = document.getElementById('urlList');
      const urls = urlList.value.trim().split('\n');
      if (urls.length > 0) {
        const firstUrl = urls[0].trim();
        if (firstUrl) {
          const iframe = UI.elements.iframe;
          iframe.src = firstUrl;
          UI.updateProgressMessage(`Loading ${firstUrl} in iframe...`);
        }
      }
    };
    
    // Create "Generate Menu Actions" button
    const generateButton = document.createElement('button');
    generateButton.className = 'btn btn-small';
    generateButton.textContent = 'Generate Menu Actions';
    generateButton.title = 'Automatically generate actions for menu items';
    generateButton.onclick = () => {
      const iframe = UI.elements.iframe;
      if (!iframe.src || iframe.src === 'about:blank') {
        alert('Please load a URL first using the "Load First URL" button');
        return;
      }
      
      // Disable button during generation
      generateButton.disabled = true;
      generateButton.textContent = 'Generating...';
      
      // Call the enhanced submenu generation method
      MenuActionsHelper.generateMenuActionsWithSubmenus()
        .then(actions => {
          if (actions.length > 0) {
            document.getElementById('actionsField').value = JSON.stringify(actions, null, 2);
            UI.showStatus(`Generated actions for ${actions.length} menu items (including submenus)`, false);
          } else {
            alert('No menu items found. Try adjusting the URL or wait for the page to fully load.');
          }
        })
        .catch(error => {
          console.error('Error generating menu actions:', error);
          alert('Error generating menu actions: ' + error.message);
        })
        .finally(() => {
          // Re-enable button
          generateButton.disabled = false;
          generateButton.textContent = 'Generate Menu Actions';
        });
    };
    
    // Add buttons to container
    container.appendChild(loadButton);
    container.appendChild(generateButton);
    
    // Add container to page
    const actionsField = document.getElementById('actionsField');
    if (actionsField) {
      actionsField.parentNode.insertBefore(container, actionsField);
    }
  }
};

// Initialize the UI controls when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  MenuActionsHelper.addUIControls();
});
