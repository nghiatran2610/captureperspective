// Import UI if it's not available globally
import UI from './ui/index.js';
import MenuActionsHelper from './menu-actions-helper.js';

/**
 * Context-Aware Menu Actions Helper Module
 * Handles smart generation of menu navigation actions based on current URL context
 */
const ContextMenuActionsHelper = {
    /**
     * Parse the current URL to determine context
     * @param {string} url - The current URL
     * @returns {Object} - URL parts including project, module, page
     */
    parseUrlContext(url) {
      // Default structure: http://localhost:8088/data/perspective/client/PROJECT/MODULE/PAGE
      const urlParts = url.split('/');
      const context = {
        isValid: false,
        project: null,
        module: null,
        page: null,
        depth: 0,
        urlParts: urlParts
      };
      
      // Find the 'client' part in the URL to align our parsing
      const clientIndex = urlParts.indexOf('client');
      if (clientIndex === -1) return context;
      
      // Extract project name (required)
      if (urlParts.length > clientIndex + 1) {
        context.project = urlParts[clientIndex + 1];
        context.isValid = true;
        context.depth = 1;
      }
      
      // Extract module name (optional)
      if (urlParts.length > clientIndex + 2) {
        context.module = urlParts[clientIndex + 2];
        context.depth = 2;
      }
      
      // Extract page name (optional)
      if (urlParts.length > clientIndex + 3) {
        context.page = urlParts[clientIndex + 3];
        context.depth = 3;
      }
      
      return context;
    },
    
    /**
     * Generate menu actions based on current URL context
     * @param {string} currentUrl - The current URL
     * @param {number} waitTime - Time to wait after each click (ms)
     * @returns {Promise<Array>} - Promise resolving to array of menu action sequences
     */
    generateContextAwareMenuActions(currentUrl, waitTime = 2000) {
      return new Promise(async (resolve, reject) => {
        try {
          const iframe = UI.elements.iframe;
          if (!iframe.contentDocument) {
            return reject('iframe not loaded or accessible');
          }
          
          const urlContext = this.parseUrlContext(currentUrl);
          console.log('Current URL context:', urlContext);
          
          // Strategy changes based on URL depth
          let actionSequences = [];
          
          // If we're at a deep URL (module/page level), focus on generating actions for siblings and children
          if (urlContext.depth >= 2) {
            actionSequences = await this.generateActionsForCurrentContext(urlContext, waitTime);
          } else {
            // For project-level URLs, we'll generate a more comprehensive menu action set
            actionSequences = await this.generateFullHierarchyActions(waitTime);
          }
          
          resolve(actionSequences);
        } catch (error) {
          console.error('Error generating context-aware menu actions:', error);
          reject(error);
        }
      });
    },
    
    /**
     * Generate actions specifically for the current context (focused on current module/page)
     * @param {Object} urlContext - The parsed URL context
     * @param {number} waitTime - Time to wait after each click (ms)
     * @returns {Promise<Array>} - Promise resolving to array of menu action sequences
     */
    async generateActionsForCurrentContext(urlContext, waitTime) {
      const iframe = UI.elements.iframe;
      const actions = [];
      
      // First, check if we're on a module page with submenus
      if (urlContext.module) {
        // Find the module menu item
        const moduleMenuItem = iframe.contentDocument.querySelector(`.menu-option[data-label="${urlContext.module}"]`);
        
        if (moduleMenuItem) {
          // Add the module main page action
          actions.push({
            name: urlContext.module,
            actions: [
              { type: 'click', selector: `.menu-option[data-label="${urlContext.module}"]` },
              { type: 'wait', duration: waitTime }
            ]
          });
          
          // Check if this module has a submenu by looking for the chevron icon
          const hasSubmenu = moduleMenuItem.querySelector('.nav-icon svg[data-icon*="chevron_right"]') !== null;
          
          if (hasSubmenu) {
            // Click to open the submenu
            moduleMenuItem.click();
            
            // Wait for the submenu to appear
            await new Promise(r => setTimeout(r, waitTime / 2));
            
            // Find all submenu items
            const submenuWrapper = iframe.contentDocument.querySelector('.submenu-group .wrapper-submenu');
            if (submenuWrapper) {
              const submenuItems = submenuWrapper.querySelectorAll('.menu-option');
              
              // Process each submenu item
              Array.from(submenuItems).forEach(subItem => {
                const subLabel = subItem.getAttribute('data-label');
                
                // Skip items without data-label, menu headers, or back buttons
                if (!subLabel || 
                    subItem.classList.contains('menu-header') || 
                    subItem.classList.contains('menu-back-action')) return;
                
                // Add action sequence for this submenu item
                actions.push({
                  name: `${urlContext.module} - ${subLabel}`,
                  actions: [
                    { type: 'click', selector: `.menu-option[data-label="${urlContext.module}"]` },
                    { type: 'wait', duration: waitTime / 2 },
                    { type: 'click', selector: `.submenu-group .menu-option[data-label="${subLabel}"]` },
                    { type: 'wait', duration: waitTime }
                  ]
                });
                
                // If this is the current page, check for further submenus or page-specific actions
                if (urlContext.page && subLabel === urlContext.page) {
                  // This could include page-specific actions like tab navigation, form interactions, etc.
                  // For example, if the page has tabs, you could add actions to click each tab
                  // We'll leave this empty for now, as it would be application-specific
                }
              });
              
              // Click the back button to return to main menu
              const backButton = iframe.contentDocument.querySelector('.submenu-group .menu-back-action');
              if (backButton) {
                backButton.click();
                await new Promise(r => setTimeout(r, waitTime / 2));
              }
            }
          }
        }
        
        // Also add sibling modules that might be relevant
        const mainMenuItems = iframe.contentDocument.querySelectorAll('.menu-wrapper.wrapper-root > .menu-option');
        
        // Find modules that are related to the current one (optional)
        // For example, if we're in "Refrigeration", we might want "Cool Rooms" too
        // This is a simple implementation - you can improve the relatedness logic
        Array.from(mainMenuItems).forEach(item => {
          const label = item.getAttribute('data-label');
          if (!label || label === urlContext.module) return;
          
          // You could implement a relatedness check here
          // For now, we'll just add a few important ones that should always be included
          const alwaysInclude = ['Overview', 'Alarms', 'Trends'];
          if (alwaysInclude.includes(label)) {
            actions.push({
              name: label,
              actions: [
                { type: 'click', selector: `.menu-option[data-label="${label}"]` },
                { type: 'wait', duration: waitTime }
              ]
            });
          }
        });
      }
      
      return actions;
    },
    
    /**
     * Look for page-specific elements that can be interacted with
     * @param {Document} document - The iframe content document
     * @param {Object} urlContext - The parsed URL context
     * @param {number} waitTime - Time to wait after each action
     * @returns {Array} - Array of action sequences for the page elements
     */
    findPageSpecificInteractions(document, urlContext, waitTime) {
      const actions = [];
      
      // This is where you could add code to detect and interact with:
      // - Tabs (ul/li based tab systems)
      // - Accordion panels
      // - Form elements
      // - Buttons
      // - Data grid controls
      // etc.
      
      // For example, to find tabs:
      const tabElements = document.querySelectorAll('.tab-nav li, .tab-button, [role="tab"]');
      if (tabElements.length > 0) {
        // Create actions to click each tab
        Array.from(tabElements).forEach((tab, index) => {
          // Try to get a label from the tab
          let tabLabel = tab.textContent.trim();
          if (!tabLabel) tabLabel = `Tab ${index + 1}`;
          
          // Generate a unique selector for this tab
          let selector = '';
          if (tab.id) {
            selector = `#${tab.id}`;
          } else if (tab.classList.length > 0) {
            selector = `.${Array.from(tab.classList).join('.')}:nth-child(${index + 1})`;
          } else {
            selector = `[role="tab"]:nth-child(${index + 1})`;
          }
          
          // Add the tab click action
          actions.push({
            name: `${urlContext.module} - ${urlContext.page || ''} - ${tabLabel}`,
            actions: [
              // First navigate to the page
              { type: 'click', selector: `.menu-option[data-label="${urlContext.module}"]` },
              { type: 'wait', duration: waitTime / 2 },
              ...(urlContext.page ? [
                { type: 'click', selector: `.submenu-group .menu-option[data-label="${urlContext.page}"]` },
                { type: 'wait', duration: waitTime }
              ] : []),
              // Then click the tab
              { type: 'click', selector: selector },
              { type: 'wait', duration: waitTime / 2 }
            ]
          });
        });
      }
      
      return actions;
    },
    
    /**
     * Generate comprehensive menu actions for the entire hierarchy
     * This is similar to the original generateMenuActions but optimized
     * @param {number} waitTime - Time to wait after each click (ms)
     * @returns {Promise<Array>} - Promise resolving to array of menu action sequences
     */
    async generateFullHierarchyActions(waitTime) {
      // This can reuse most of the code from MenuActionsHelper.generateMenuActionsWithSubmenus
      // We'll adapt it for better performance
      return MenuActionsHelper.generateMenuActionsWithSubmenus(waitTime);
    },
    
    /**
     * Add context-aware UI controls (COMBINED and REFACTORED)
     */
    addUIControls() {
        // Create a container for the helper buttons
        const container = document.createElement('div');
        container.className = 'menu-actions-buttons';
        container.style.marginTop = '10px';
        container.style.marginBottom = '10px';
        container.style.display = 'flex';
        container.style.gap = '10px';

        // Create "Load URL" button (reused from original - ONLY ONCE)
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
                    UI.progress.updateProgressMessage(`Loading ${firstUrl} in iframe...`);
                }
            }
        };

        // Create "Generate Context Actions" button
        const generateContextButton = document.createElement('button');
        generateContextButton.className = 'btn btn-small';
        generateContextButton.textContent = 'Generate Context Actions';
        generateContextButton.title = 'Generate actions based on current page context';
        generateContextButton.onclick = () => {
            const iframe = UI.elements.iframe;
            if (!iframe.src || iframe.src === 'about:blank') {
                alert('Please load a URL first using the "Load First URL" button');
                return;
            }

            // Disable button during generation
            generateContextButton.disabled = true;
            generateContextButton.textContent = 'Generating...';

            // Call the context-aware action generation method
            this.generateContextAwareMenuActions(iframe.src)
                .then(actions => {
                    if (actions.length > 0) {
                        document.getElementById('actionsField').value = JSON.stringify(actions, null, 2);
                        UI.utils.showStatus(`Generated ${actions.length} context-aware menu actions`, false);
                    } else {
                        alert('No menu items found. Try adjusting the URL or wait for the page to fully load.');
                    }
                })
                .catch(error => {
                    console.error('Error generating context menu actions:', error);
                    alert('Error generating context menu actions: ' + error.message);
                })
                .finally(() => {
                    // Re-enable button
                    generateContextButton.disabled = false;
                    generateContextButton.textContent = 'Generate Context Actions';
                });
        };

        // Add ALL actions button (original behavior from MenuActionsHelper)
        const generateAllButton = document.createElement('button');
        generateAllButton.className = 'btn btn-small';
        generateAllButton.textContent = 'Generate All Actions';
        generateAllButton.title = 'Generate actions for all menu items (original behavior)';
        generateAllButton.onclick = () => {
            const iframe = UI.elements.iframe;
            if (!iframe.src || iframe.src === 'about:blank') {
                alert('Please load a URL first using the "Load First URL" button');
                return;
            }

            // Disable button during generation
            generateAllButton.disabled = true;
            generateAllButton.textContent = 'Generating...';

            // Call the original action generation method (from MenuActionsHelper)
            MenuActionsHelper.generateMenuActionsWithSubmenus()
                .then(actions => {
                    if (actions.length > 0) {
                        document.getElementById('actionsField').value = JSON.stringify(actions, null, 2);
                        UI.utils.showStatus(`Generated actions for ${actions.length} menu items (including submenus)`, false);
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
                    generateAllButton.disabled = false;
                    generateAllButton.textContent = 'Generate All Actions';
                });
        };

        // Add buttons to container
        container.appendChild(loadButton);
        container.appendChild(generateContextButton);
        container.appendChild(generateAllButton);

        // Add container to page
        const actionsField = document.getElementById('actionsField');
        if (actionsField) {
            actionsField.parentNode.insertBefore(container, actionsField);
        }
    }
};

// Add default export
export default ContextMenuActionsHelper;