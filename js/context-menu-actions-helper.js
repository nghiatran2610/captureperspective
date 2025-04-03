// Import dependencies
import UI from "./ui/index.js";
import MenuActionsHelper from "./menu-actions-helper.js";

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
    const urlParts = url.split("/");
    const context = {
      isValid: false,
      project: null,
      module: null,
      page: null,
      depth: 0,
      urlParts: urlParts,
    };

    // Find the 'client' part in the URL to align our parsing
    const clientIndex = urlParts.indexOf("client");
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
   * @param {boolean} includeToolbarButtons - Whether to include actions for toolbar buttons
   * @returns {Promise<Array>} - Promise resolving to array of menu action sequences
   */
  generateContextAwareMenuActions(
    currentUrl,
    waitTime = 2000,
    includeToolbarButtons = false
  ) {
    return new Promise(async (resolve, reject) => {
      try {
        const iframe = UI.elements.iframe;
        if (!iframe.contentDocument) {
          return reject("iframe not loaded or accessible");
        }

        const urlContext = this.parseUrlContext(currentUrl);
        console.log("Current URL context:", urlContext);

        // Strategy changes based on URL depth
        let actionSequences = [];

        // If we're at a deep URL (module/page level), focus on generating actions for siblings and children
        if (urlContext.depth >= 2) {
          actionSequences = await this.generateActionsForCurrentContext(
            urlContext,
            waitTime,
            includeToolbarButtons
          );
        } else {
          // For project-level URLs, we'll generate a more comprehensive menu action set
          actionSequences = await this.generateFullHierarchyActions(
            waitTime,
            includeToolbarButtons
          );
        }

        resolve(actionSequences);
      } catch (error) {
        console.error("Error generating context-aware menu actions:", error);
        reject(error);
      }
    });
  },

  /**
   * Generate a list of toolbar button selectors
   * @returns {Array} Array of toolbar button selectors and their names
   */
  getToolbarButtonSelectors() {
    return [
      {
        name: "Layout Button",
        selector:
          ".flex-container.responsive-container.ia_container--primary.view > button:nth-child(1)",
      },
      {
        name: "Settings Button",
        selector:
          ".flex-container.responsive-container.ia_container--primary.view > button:nth-child(2)",
      },
      {
        name: "System Button",
        selector:
          ".flex-container.responsive-container.ia_container--primary.view > button:nth-child(3)",
      },
      {
        name: "Graph Button",
        selector:
          ".flex-container.responsive-container.ia_container--primary.view > button:nth-child(5)",
      },
      {
        name: "Alert Button",
        selector:
          ".flex-container.responsive-container.ia_container--primary.view > button:nth-child(6)",
      },
      {
        name: "Expand Button",
        selector:
          ".flex-container.responsive-container.ia_container--primary.view > button:nth-child(8)",
      },
      {
        name: "Collapse Button",
        selector:
          ".flex-container.responsive-container.ia_container--primary.view > button:nth-child(9)",
      },
    ];
  },

  /**
   * Generate toolbar button actions for a specific page navigation
   * @param {Array} baseActions - Base actions to navigate to a page
   * @param {string} pageName - Name of the page for action naming
   * @param {number} waitTime - Time to wait after each action
   * @returns {Array} - Array of action sequences for toolbar buttons
   */
  generateToolbarButtonActions(baseActions, pageName, waitTime) {
    const toolbarActions = [];
    const buttons = this.getToolbarButtonSelectors();

    // For each button, create an action sequence
    buttons.forEach((button) => {
      // Create a deep copy of base actions
      const actionsWithButton = JSON.parse(JSON.stringify(baseActions));

      // Add button click action
      actionsWithButton.push(
        { type: "click", selector: button.selector },
        { type: "wait", duration: waitTime }
      );

      // Create the action sequence
      toolbarActions.push({
        name: `${pageName} - ${button.name}`,
        actions: actionsWithButton,
      });
    });

    return toolbarActions;
  },

  /**
   * Generate actions specifically for the current context (focused on current module/page)
   * @param {Object} urlContext - The parsed URL context
   * @param {number} waitTime - Time to wait after each click (ms)
   * @param {boolean} includeToolbarButtons - Whether to include actions for toolbar buttons
   * @returns {Promise<Array>} - Promise resolving to array of menu action sequences
   */
  async generateActionsForCurrentContext(
    urlContext,
    waitTime,
    includeToolbarButtons = false
  ) {
    const iframe = UI.elements.iframe;
    const actions = [];

    console.log("Generating actions for URL context:", urlContext);

    // First, check if we're on a module page that might have submenus
    if (urlContext.module) {
      // Find the module menu item
      const moduleMenuItem = iframe.contentDocument.querySelector(
        `.menu-option[data-label="${urlContext.module}"]`
      );

      if (moduleMenuItem) {
        console.log(`Found module menu item for ${urlContext.module}`);

        // Add the module main page action
        const moduleAction = {
          name: urlContext.module,
          actions: [
            {
              type: "click",
              selector: `.menu-option[data-label="${urlContext.module}"]`,
            },
            { type: "wait", duration: waitTime },
          ],
        };

        actions.push(moduleAction);

        // Add toolbar button actions for the module page if requested
        if (includeToolbarButtons) {
          const moduleToolbarActions = this.generateToolbarButtonActions(
            moduleAction.actions,
            urlContext.module,
            waitTime
          );
          actions.push(...moduleToolbarActions);
        }

        // Check if this module has a submenu by looking for the chevron icon
        const hasSubmenu =
          moduleMenuItem.querySelector(
            '.nav-icon svg[data-icon*="chevron_right"]'
          ) !== null;

        if (hasSubmenu) {
          console.log(`${urlContext.module} has submenu, opening it...`);
          // Click to open the submenu
          moduleMenuItem.click();

          // Wait for the submenu to appear
          await new Promise((r) => setTimeout(r, waitTime / 2));

          // Find all submenu items
          const submenuWrapper = iframe.contentDocument.querySelector(
            ".submenu-group .wrapper-submenu"
          );
          if (submenuWrapper) {
            const submenuItems =
              submenuWrapper.querySelectorAll(".menu-option");
            console.log(
              `Found ${submenuItems.length} submenu items under ${urlContext.module}`
            );

            // Process each submenu item
            Array.from(submenuItems).forEach((subItem) => {
              const subLabel = subItem.getAttribute("data-label");

              // Skip items without data-label, menu headers, or back buttons
              if (
                !subLabel ||
                subItem.classList.contains("menu-header") ||
                subItem.classList.contains("menu-back-action")
              )
                return;

              // Check if this submenu item has its own submenu
              const hasSubSubmenu =
                subItem.querySelector(
                  '.nav-icon svg[data-icon*="chevron_right"]'
                ) !== null;

              // Create base action sequence for this submenu item
              const submenuAction = {
                name: `${urlContext.module} - ${subLabel}`,
                actions: [
                  {
                    type: "click",
                    selector: `.menu-option[data-label="${urlContext.module}"]`,
                  },
                  { type: "wait", duration: waitTime / 2 },
                  {
                    type: "click",
                    selector: `.submenu-group .menu-option[data-label="${subLabel}"]`,
                  },
                  { type: "wait", duration: waitTime },
                ],
              };

              actions.push(submenuAction);

              // Add toolbar button actions for this submenu page if requested
              if (includeToolbarButtons) {
                const submenuToolbarActions = this.generateToolbarButtonActions(
                  submenuAction.actions,
                  `${urlContext.module} - ${subLabel}`,
                  waitTime
                );
                actions.push(...submenuToolbarActions);
              }

              // If there's potentially another level of submenu, recursively explore it
              if (hasSubSubmenu) {
                console.log(
                  `Found sub-submenu for ${subLabel}, will explore it...`
                );
                // This would require more complex handling to click through multiple levels
                // which we could implement if needed
              }
            });

            // Click the back button to return to main menu
            const backButton = iframe.contentDocument.querySelector(
              ".submenu-group .menu-back-action"
            );
            if (backButton) {
              console.log("Clicking back button to return to main menu");
              backButton.click();
              await new Promise((r) => setTimeout(r, waitTime / 2));
            }
          } else {
            console.log("No submenu wrapper found after opening submenu");
          }
        } else {
          console.log(`${urlContext.module} doesn't have a submenu`);
        }
      }

      // We're NOT adding sibling modules anymore - focus only on the current module and its children
      // This removes the part that was adding "Overview", "Alarms", "Trends" etc.
    } else {
      // If we don't have a specific module in the URL, fall back to a more general approach
      console.log("No specific module in URL, generating generic actions");

      // Find the main menu items for basic navigation
      const mainMenuItems = iframe.contentDocument.querySelectorAll(
        ".menu-wrapper.wrapper-root > .menu-option"
      );
      console.log(`Found ${mainMenuItems.length} main menu items`);

      // Just add the top-level navigation items
      Array.from(mainMenuItems)
        .slice(0, 5)
        .forEach((item) => {
          // Limit to first 5 for simplicity
          const label = item.getAttribute("data-label");
          if (!label) return;

          const menuAction = {
            name: label,
            actions: [
              {
                type: "click",
                selector: `.menu-option[data-label="${label}"]`,
              },
              { type: "wait", duration: waitTime },
            ],
          };

          actions.push(menuAction);

          // Add toolbar button actions for this main menu page if requested
          if (includeToolbarButtons) {
            const menuToolbarActions = this.generateToolbarButtonActions(
              menuAction.actions,
              label,
              waitTime
            );
            actions.push(...menuToolbarActions);
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
    const tabElements = document.querySelectorAll(
      '.tab-nav li, .tab-button, [role="tab"]'
    );
    if (tabElements.length > 0) {
      // Create actions to click each tab
      Array.from(tabElements).forEach((tab, index) => {
        // Try to get a label from the tab
        let tabLabel = tab.textContent.trim();
        if (!tabLabel) tabLabel = `Tab ${index + 1}`;

        // Generate a unique selector for this tab
        let selector = "";
        if (tab.id) {
          selector = `#${tab.id}`;
        } else if (tab.classList.length > 0) {
          selector = `.${Array.from(tab.classList).join(".")}:nth-child(${
            index + 1
          })`;
        } else {
          selector = `[role="tab"]:nth-child(${index + 1})`;
        }

        // Add the tab click action
        actions.push({
          name: `${urlContext.module} - ${urlContext.page || ""} - ${tabLabel}`,
          actions: [
            // First navigate to the page
            {
              type: "click",
              selector: `.menu-option[data-label="${urlContext.module}"]`,
            },
            { type: "wait", duration: waitTime / 2 },
            ...(urlContext.page
              ? [
                  {
                    type: "click",
                    selector: `.submenu-group .menu-option[data-label="${urlContext.page}"]`,
                  },
                  { type: "wait", duration: waitTime },
                ]
              : []),
            // Then click the tab
            { type: "click", selector: selector },
            { type: "wait", duration: waitTime / 2 },
          ],
        });
      });
    }

    return actions;
  },

  /**
   * Generate comprehensive menu actions for the entire hierarchy
   * This is similar to the original generateMenuActions but optimized
   * @param {number} waitTime - Time to wait after each click (ms)
   * @param {boolean} includeToolbarButtons - Whether to include actions for toolbar buttons
   * @returns {Promise<Array>} - Promise resolving to array of menu action sequences
   */
  async generateFullHierarchyActions(waitTime, includeToolbarButtons = false) {
    // This can reuse most of the code from MenuActionsHelper.generateMenuActionsWithSubmenus
    // We'll adapt it for better performance
    const baseActions = await MenuActionsHelper.generateMenuActionsWithSubmenus(
      waitTime
    );

    // If we don't need toolbar buttons, just return the base actions
    if (!includeToolbarButtons) {
      return baseActions;
    }

    // If we do need toolbar buttons, add them for each page
    const allActions = [...baseActions]; // Start with the original actions

    for (const action of baseActions) {
      // Generate toolbar actions for this page
      const toolbarActions = this.generateToolbarButtonActions(
        action.actions,
        action.name,
        waitTime
      );

      // Add them to our results
      allActions.push(...toolbarActions);
    }

    return allActions;
  },

  /**
   * Add context-aware UI controls (COMBINED and REFACTORED)
   */
  addUIControls() {
    // Create a container for the helper buttons
    const container = document.createElement("div");
    container.className = "menu-actions-buttons";
    container.style.marginTop = "10px";
    container.style.marginBottom = "10px";
    container.style.display = "flex";
    container.style.gap = "10px";

    // Create "Load URL" button (reused from original - ONLY ONCE)
    const loadButton = document.createElement("button");
    loadButton.className = "btn btn-small";
    loadButton.textContent = "Load First URL";
    loadButton.title = "Load the first URL from the list into the iframe";
    /**
     * Enhanced loadButton.onclick function with 10s wait period
     * This should replace the existing loadButton.onclick in context-menu-actions-helper.js
     */
    loadButton.onclick = async () => {
      const urlList = document.getElementById("urlList");
      const urls = urlList.value.trim().split("\n");
      if (urls.length > 0) {
        const firstUrl = urls[0].trim();
        if (firstUrl) {
          const iframe = UI.elements.iframe;

          // Show loading status
          const progressElement = UI.elements.progress;
          const originalText = progressElement.innerHTML;
          progressElement.innerHTML = `Loading ${firstUrl} in iframe... (waiting 10s for complete load)`;

          // Disable the button during loading
          loadButton.disabled = true;
          loadButton.textContent = "Loading...";

          // Load the URL
          iframe.src = firstUrl;

          // Wait for the iframe to load
          await new Promise((resolve) => {
            const handleLoad = () => {
              iframe.removeEventListener("load", handleLoad);
              resolve();
            };
            iframe.addEventListener("load", handleLoad);

            // In case the load event doesn't fire, resolve anyway after a timeout
            setTimeout(resolve, 5000);
          });

          // Show countdown for 10 seconds
          for (let i = 10; i > 0; i--) {
            progressElement.innerHTML = `Loading ${firstUrl} in iframe... (waiting ${i}s for complete load)`;
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }

          // Update status to show load is complete
          progressElement.innerHTML = `${firstUrl} loaded. Ready for action generation.`;

          // Re-enable the button
          loadButton.disabled = false;
          loadButton.textContent = "Load First URL";
        }
      }
    };

    // Create "Generate Context Actions" button
    const generateContextButton = document.createElement("button");
    generateContextButton.className = "btn btn-small";
    generateContextButton.textContent = "Generate Context Actions";
    generateContextButton.title =
      "Generate actions based on current page context";
    generateContextButton.onclick = () => {
      const iframe = UI.elements.iframe;
      if (!iframe.src || iframe.src === "about:blank") {
        alert('Please load a URL first using the "Load First URL" button');
        return;
      }

      // Disable button during generation
      generateContextButton.disabled = true;
      generateContextButton.textContent = "Generating...";

      // Get the include toolbar buttons option
      const includeToolbar = document.getElementById(
        "includeToolbarButtons"
      ).checked;

      // Call the context-aware action generation method
      this.generateContextAwareMenuActions(
        iframe.src,
        undefined,
        includeToolbar
      )
        .then((actions) => {
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
        })
        .catch((error) => {
          console.error("Error generating context menu actions:", error);
          alert("Error generating context menu actions: " + error.message);
        })
        .finally(() => {
          // Re-enable button
          generateContextButton.disabled = false;
          generateContextButton.textContent = "Generate Context Actions";
        });
    };

    // Add ALL actions button (original behavior from MenuActionsHelper)
    const generateAllButton = document.createElement("button");
    generateAllButton.className = "btn btn-small";
    generateAllButton.textContent = "Generate All Actions";
    generateAllButton.title =
      "Generate actions for all menu items (original behavior)";
    generateAllButton.onclick = () => {
      const iframe = UI.elements.iframe;
      if (!iframe.src || iframe.src === "about:blank") {
        alert('Please load a URL first using the "Load First URL" button');
        return;
      }

      // Disable button during generation
      generateAllButton.disabled = true;
      generateAllButton.textContent = "Generating...";

      // Get the include toolbar buttons option
      const includeToolbar = document.getElementById(
        "includeToolbarButtons"
      ).checked;

      // Call the original action generation method (from MenuActionsHelper)
      (includeToolbar
        ? this.generateFullHierarchyActions(undefined, true)
        : MenuActionsHelper.generateMenuActionsWithSubmenus()
      )
        .then((actions) => {
          if (actions.length > 0) {
            document.getElementById("actionsField").value = JSON.stringify(
              actions,
              null,
              2
            );
            UI.utils.showStatus(
              `Generated actions for ${actions.length} menu items (including submenus)`,
              false
            );
          } else {
            alert(
              "No menu items found. Try adjusting the URL or wait for the page to fully load."
            );
          }
        })
        .catch((error) => {
          console.error("Error generating menu actions:", error);
          alert("Error generating menu actions: " + error.message);
        })
        .finally(() => {
          // Re-enable button
          generateAllButton.disabled = false;
          generateAllButton.textContent = "Generate All Actions";
        });
    };

    // Create checkbox for including toolbar buttons
    const toolbarCheckboxContainer = document.createElement("div");
    toolbarCheckboxContainer.style.display = "flex";
    toolbarCheckboxContainer.style.alignItems = "center";
    toolbarCheckboxContainer.style.marginLeft = "10px";

    const toolbarCheckbox = document.createElement("input");
    toolbarCheckbox.type = "checkbox";
    toolbarCheckbox.id = "includeToolbarButtons";
    toolbarCheckbox.style.marginRight = "5px";

    const toolbarLabel = document.createElement("label");
    toolbarLabel.htmlFor = "includeToolbarButtons";
    toolbarLabel.textContent = "Include Toolbar Interactions";
    toolbarLabel.style.fontSize = "14px";

    toolbarCheckboxContainer.appendChild(toolbarCheckbox);
    toolbarCheckboxContainer.appendChild(toolbarLabel);

    // Add buttons to container
    container.appendChild(loadButton);
    container.appendChild(generateContextButton);
    container.appendChild(generateAllButton);
    container.appendChild(toolbarCheckboxContainer);

    // Add container to page
    const actionsField = document.getElementById("actionsField");
    if (actionsField) {
      actionsField.parentNode.insertBefore(container, actionsField);
    }
  },
};

// Add default export
export default ContextMenuActionsHelper;
