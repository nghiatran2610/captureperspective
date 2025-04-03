// context-menu-actions-helper.js

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

  // Helper to wait for iframe to fully load
  async waitForIframeLoad(iframe) {
    return new Promise((resolve) => {
      if (iframe.contentDocument.readyState === "complete") {
        resolve();
      } else {
        iframe.onload = () => resolve();
      }
    });
  },

  /**
   * Helper function to convert display name to URL segment
   * Handles spaces and other special characters in menu item names
   *
   * @param {string} displayName - The display name shown in the UI
   * @returns {string} URL-friendly segment
   */
  convertDisplayNameToUrlSegment(displayName) {
    if (!displayName) return "";

    // First trim any whitespace
    let urlSegment = displayName.trim();

    // Remove spaces
    urlSegment = urlSegment.replace(/\s+/g, "");

    // Remove any special characters not allowed in URL paths
    urlSegment = urlSegment.replace(/[^a-zA-Z0-9_-]/g, "");

    return urlSegment;
  },

  /**
   * Construct a page URL based on the project, module and optional page names
   *
   * @param {string} projectName - The project name
   * @param {string} moduleName - The module name (with potential spaces)
   * @param {string} pageName - Optional page name (with potential spaces)
   * @param {string} baseUrl - Base URL of the application
   * @returns {string} The constructed URL
   */
  constructPageUrl(projectName, moduleName, pageName = null, baseUrl = null) {
    if (!projectName || !moduleName) {
      console.warn("Cannot construct URL without project and module names");
      return null;
    }

    // Get base URL from current location if not provided
    if (!baseUrl) {
      const currentUrl = window.location.href;
      // Extract up to /client/ part
      const clientIndex = currentUrl.indexOf("/client/");
      if (clientIndex !== -1) {
        baseUrl = currentUrl.substring(0, clientIndex);
      } else {
        baseUrl = "http://localhost:8088/data/perspective";
      }
    }

    // Convert menu display names to URL segments
    const moduleUrlSegment = this.convertDisplayNameToUrlSegment(moduleName);

    // Build the URL
    let url = `${baseUrl}/client/${projectName}/${moduleUrlSegment}`;

    // Add page segment if provided
    if (pageName) {
      const pageUrlSegment = this.convertDisplayNameToUrlSegment(pageName);
      url += `/${pageUrlSegment}`;
    }

    console.log(
      `Constructed URL for "${moduleName}"${
        pageName ? ` - "${pageName}"` : ""
      }: ${url}`
    );
    return url;
  },

  // Helper to wait for submenu items to load
  async waitForSubmenu(iframe, maxAttempts = 10, interval = 500) {
    for (let i = 0; i < maxAttempts; i++) {
      const submenuItems = iframe.contentDocument.querySelectorAll(
        ".submenu-group .menu-option"
      );
      if (submenuItems.length > 0) {
        console.log(
          `Submenu items found after ${i + 1} attempts:`,
          submenuItems
        );
        return Array.from(submenuItems);
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
    console.log("No submenu items found after maximum attempts.");
    return [];
  },

  // Helper to wait for toolbar to load using multiple XPath alternatives
  async waitForToolbar(iframe, maxAttempts = 10, interval = 500) {
    console.log(
      "Checking for toolbar in URL:",
      iframe.contentWindow.location.href
    );

    const xpathOptions = [
      '//*[@id="app-container"]/div/div[3]/div[2]/div[2]/div[1]/div[1]/div/div[1]/div',
      "/html/body/div[1]/div/div[3]/div[2]/div[2]/div[1]/div[1]/div/div[1]/div",
      '//div[@data-component="ia.container.flex"]',
      '//div[contains(@class, "flex-container") and .//button]',
      '//div[.//button[@data-component="ia.input.button"]]',
    ];

    for (let i = 0; i < maxAttempts; i++) {
      try {
        for (const xpath of xpathOptions) {
          const toolbar = iframe.contentDocument.evaluate(
            xpath,
            iframe.contentDocument,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
          ).singleNodeValue;

          if (toolbar) {
            const buttons = toolbar.querySelectorAll("button");
            if (buttons.length > 0) {
              console.log(
                `Toolbar found using path: ${xpath} with ${
                  buttons.length
                } buttons after ${i + 1} attempts`
              );
              return toolbar;
            }
          }
        }

        const allButtons = iframe.contentDocument.querySelectorAll(
          'button[data-component="ia.input.button"]'
        );

        if (allButtons.length > 0) {
          console.log(
            `Found ${allButtons.length} buttons directly in the page`
          );
          let commonParent = allButtons[0].parentElement;
          while (
            commonParent &&
            commonParent.tagName !== "BODY" &&
            commonParent.querySelectorAll("button").length < 2
          ) {
            commonParent = commonParent.parentElement;
          }

          if (
            commonParent &&
            commonParent.tagName !== "BODY" &&
            commonParent.querySelectorAll("button").length >= 2
          ) {
            console.log(
              `Found toolbar via button parent detection with ${allButtons.length} buttons`
            );
            return commonParent;
          }
        }

        console.log(
          `Attempt ${
            i + 1
          }: No toolbar found yet, waiting ${interval}ms before next attempt`
        );
        await new Promise((resolve) => setTimeout(resolve, interval));
      } catch (error) {
        console.warn(`Error in toolbar detection attempt ${i + 1}:`, error);
        await new Promise((resolve) => setTimeout(resolve, interval));
      }
    }

    console.log(
      "No toolbar or buttons found after maximum attempts in URL:",
      iframe.contentWindow.location.href
    );
    return null;
  },

  /**
   * Generate menu actions based on current URL context.
   * Modified so that for project-level URLs (depth < 2), it lists all main menu items,
   * prompts the user to select one, and then generates actions for that selection.
   *
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
          UI.utils.showStatus("Error: Iframe document not accessible.", true);
          return reject("iframe not loaded or accessible");
        }

        // Ensure iframe is fully loaded
        await this.waitForIframeLoad(iframe);

        const urlContext = this.parseUrlContext(currentUrl);
        console.log("Current URL context:", urlContext);

        let actionSequences = [];

        if (urlContext.depth >= 2) {
          // If we're at a module/page level, use the existing logic.
          actionSequences = await this.generateActionsForCurrentContext(
            urlContext,
            waitTime,
            includeToolbarButtons
          );
        } else {
          // For project-level URLs: list main menu items and prompt user for selection.
          const mainMenuElements = iframe.contentDocument.querySelectorAll(
            ".menu-wrapper.wrapper-root > .menu-option"
          );
          const mainMenuItems = Array.from(mainMenuElements)
            .map(item => item.getAttribute("data-label"))
            .filter(label => label);

          if (mainMenuItems.length === 0) {
            UI.utils.showStatus("No main menu items found.", true);
            return resolve([]);
          }

          const userSelection = prompt(
            "Select a main menu item from the following list:\n" +
              mainMenuItems.join("\n")
          );
          if (!userSelection || !mainMenuItems.includes(userSelection)) {
            UI.utils.showStatus("Invalid selection. No actions generated.", true);
            return resolve([]);
          }

          // Generate actions based on the user’s selected main menu item.
          actionSequences = await this.generateActionsForSelectedMainMenu(
            userSelection,
            waitTime,
            includeToolbarButtons,
            urlContext
          );
        }

        console.log("Generated action sequences:", actionSequences);

        if (actionSequences.length === 0) {
          UI.utils.showStatus(
            "No menu items found. Try adjusting the URL or wait for the page to fully load.",
            true
          );
        }

        resolve(actionSequences);
      } catch (error) {
        console.error("Error generating context-aware menu actions:", error);
        UI.utils.showStatus(
          `Error generating context menu actions: ${error.message}`,
          true
        );
        reject(error);
      }
    });
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
    let actions = [];

    console.log("Generating actions for URL context:", urlContext);
    console.log("Current iframe URL:", iframe.contentWindow.location.href);

    // First, check if we're on a module page that might have submenus
    if (urlContext.module) {
      try {
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
              { type: "click", selector: `.menu-option[data-label="${urlContext.module}"]` },
              { type: "wait", duration: waitTime },
            ],
          };

          actions.push(moduleAction);

          // Add toolbar button actions for the module page if requested
          if (includeToolbarButtons) {
            try {
              console.log(
                `Detecting toolbar buttons for module: ${urlContext.module}`
              );
              const originalUrl = iframe.contentWindow.location.href;
              moduleMenuItem.click();
              await new Promise((r) => setTimeout(r, waitTime));
              await this.waitForIframeLoad(iframe);
              const moduleUrl = iframe.contentWindow.location.href;
              console.log(`Successfully navigated to module URL: ${moduleUrl}`);
              const toolbar = await this.waitForToolbar(iframe);
              if (toolbar) {
                console.log(
                  `Found toolbar for module ${urlContext.module} at URL: ${moduleUrl}`
                );
                const buttonSelectors = this.getToolbarButtonSelectors(iframe);
                if (buttonSelectors && buttonSelectors.length > 0) {
                  console.log(
                    `Found ${buttonSelectors.length} toolbar buttons for module ${urlContext.module}`
                  );
                  buttonSelectors.forEach((button) => {
                    const actionsWithButton = JSON.parse(JSON.stringify(moduleAction.actions));
                    actionsWithButton.push(
                      { type: "click", selector: button.selector },
                      { type: "wait", duration: waitTime }
                    );
                    actions.push({
                      name: `${urlContext.module} - ${button.name}`,
                      actions: actionsWithButton,
                    });
                  });
                } else {
                  console.log(
                    `No toolbar buttons found for module ${urlContext.module} at URL: ${moduleUrl}`
                  );
                }
              } else {
                console.log(
                  `No toolbar found for module ${urlContext.module} at URL: ${moduleUrl}`
                );
              }
              if (originalUrl !== moduleUrl) {
                console.log(`Navigating back to original URL: ${originalUrl}`);
                iframe.src = originalUrl;
                await new Promise((r) => setTimeout(r, waitTime));
                await this.waitForIframeLoad(iframe);
              }
            } catch (toolbarError) {
              console.warn(`Error generating toolbar actions for ${urlContext.module}:`, toolbarError);
            }
          }

          // Check if this module has a submenu by looking for the chevron icon
          const hasSubmenu =
            moduleMenuItem.querySelector('.nav-icon svg[data-icon*="chevron_right"]') !== null;

          if (hasSubmenu) {
            console.log(`${urlContext.module} has submenu, opening it...`);
            moduleMenuItem.click();
            await new Promise((r) => setTimeout(r, waitTime / 2));
            const submenuItems = await this.waitForSubmenu(iframe);
            console.log(`Found ${submenuItems.length} submenu items under ${urlContext.module}`);
            for (const subItem of submenuItems) {
              if (
                !subItem.getAttribute("data-label") ||
                subItem.classList.contains("menu-header") ||
                subItem.classList.contains("menu-back-action")
              ) {
                continue;
              }
              const submenuActions = await this.processSubmenuItem(
                subItem,
                urlContext.module,
                waitTime,
                iframe,
                includeToolbarButtons
              );
              if (submenuActions && submenuActions.length > 0) {
                actions = actions.concat(submenuActions);
              }
            }
            try {
              const backButton = iframe.contentDocument.querySelector(
                ".submenu-group .menu-back-action"
              );
              if (backButton) {
                console.log("Clicking back button to return to main menu");
                backButton.click();
                await new Promise((r) => setTimeout(r, waitTime / 2));
              }
            } catch (backBtnError) {
              console.warn("Error clicking back button:", backBtnError);
            }
          } else {
            console.log(`${urlContext.module} doesn't have a submenu`);
          }
        }
      } catch (moduleError) {
        console.error(`Error processing module ${urlContext.module}:`, moduleError);
      }
    } else {
      console.log("No specific module in URL, generating generic actions");
      try {
        const mainMenuItems = iframe.contentDocument.querySelectorAll(
          ".menu-wrapper.wrapper-root > .menu-option"
        );
        console.log(`Found ${mainMenuItems.length} main menu items`);
        const originalUrl = iframe.contentWindow.location.href;
        for (const item of Array.from(mainMenuItems).slice(0, 5)) {
          try {
            const label = item.getAttribute("data-label");
            if (!label) continue;
            const menuAction = {
              name: label,
              actions: [
                { type: "click", selector: `.menu-option[data-label="${label}"]` },
                { type: "wait", duration: waitTime },
              ],
            };
            actions.push(menuAction);
            if (includeToolbarButtons) {
              try {
                item.click();
                await new Promise((r) => setTimeout(r, waitTime));
                await this.waitForIframeLoad(iframe);
                const menuUrl = iframe.contentWindow.location.href;
                console.log(`Successfully navigated to menu URL for ${label}: ${menuUrl}`);
                const toolbar = await this.waitForToolbar(iframe);
                if (toolbar) {
                  console.log(`Found toolbar for menu ${label} at URL: ${menuUrl}`);
                  const buttonSelectors = this.getToolbarButtonSelectors(iframe);
                  if (buttonSelectors && buttonSelectors.length > 0) {
                    console.log(`Found ${buttonSelectors.length} toolbar buttons for menu ${label}`);
                    buttonSelectors.forEach((button) => {
                      const actionsWithButton = JSON.parse(JSON.stringify(menuAction.actions));
                      actionsWithButton.push(
                        { type: "click", selector: button.selector },
                        { type: "wait", duration: waitTime }
                      );
                      actions.push({
                        name: `${label} - ${button.name}`,
                        actions: actionsWithButton,
                      });
                    });
                  } else {
                    console.log(`No toolbar buttons found for menu ${label} at URL: ${menuUrl}`);
                  }
                } else {
                  console.log(`No toolbar found for menu ${label} at URL: ${menuUrl}`);
                }
                iframe.src = originalUrl;
                await new Promise((r) => setTimeout(r, waitTime));
                await this.waitForIframeLoad(iframe);
              } catch (toolbarError) {
                console.warn(`Error generating toolbar actions for ${label}:`, toolbarError);
              }
            }
          } catch (itemError) {
            console.warn(`Error processing main menu item:`, itemError);
          }
        }
      } catch (mainMenuError) {
        console.error("Error processing main menu items:", mainMenuError);
      }
    }

    return actions;
  },

  /**
   * Process a submenu item and generate actions for it.
   * This function performs direct navigation to ensure toolbar detection occurs at the right URL.
   *
   * @param {HTMLElement} subItem - The submenu item element
   * @param {string} moduleLabel - The parent module name
   * @param {number} waitTime - Time to wait after each action
   * @param {HTMLIFrameElement} iframe - The iframe containing the page
   * @param {boolean} includeToolbarButtons - Whether to include toolbar actions
   * @returns {Promise<Array>} Array of action sequences
   */
  async processSubmenuItem(
    subItem,
    moduleLabel,
    waitTime,
    iframe,
    includeToolbarButtons
  ) {
    const actions = [];
    try {
      const subLabel = subItem.getAttribute("data-label");
      if (
        !subLabel ||
        subItem.classList.contains("menu-header") ||
        subItem.classList.contains("menu-back-action")
      )
        return actions;

      console.log(`Processing submenu item: ${moduleLabel} - ${subLabel}`);
      const hasSubSubmenu =
        subItem.querySelector('.nav-icon svg[data-icon*="chevron_right"]') !== null;

      const submenuAction = {
        name: `${moduleLabel} - ${subLabel}`,
        actions: [
          { type: "click", selector: `.menu-option[data-label="${moduleLabel}"]` },
          { type: "wait", duration: waitTime / 2 },
          { type: "click", selector: `.submenu-group .menu-option[data-label="${subLabel}"]` },
          { type: "wait", duration: waitTime },
        ],
      };

      actions.push(submenuAction);

      if (includeToolbarButtons) {
        try {
          console.log(`===== PROCESSING SUBMENU TOOLBAR: ${moduleLabel} - ${subLabel} =====`);
          const originalUrl = iframe.contentWindow.location.href;
          console.log(`Original URL before navigation: ${originalUrl}`);
          const urlContext = this.parseUrlContext(originalUrl);
          const projectName = urlContext.project;
          console.log(`Clicking submenu item: ${subLabel}`);
          subItem.click();
          await new Promise((r) => setTimeout(r, waitTime));
          await this.waitForIframeLoad(iframe);
          const submenuUrl = iframe.contentWindow.location.href;
          console.log(`Successfully navigated to submenu URL: ${submenuUrl}`);
          if (
            submenuUrl === originalUrl ||
            !submenuUrl.includes(this.convertDisplayNameToUrlSegment(moduleLabel))
          ) {
            const constructedUrl = this.constructPageUrl(
              projectName,
              moduleLabel,
              subLabel
            );
            if (constructedUrl) {
              console.log(`Direct navigation failed, trying constructed URL: ${constructedUrl}`);
              iframe.src = constructedUrl;
              await new Promise((r) => setTimeout(r, waitTime));
              await this.waitForIframeLoad(iframe);
              console.log(`Loaded constructed URL: ${iframe.contentWindow.location.href}`);
            }
          }
          console.log(`Detecting toolbar on submenu page: ${iframe.contentWindow.location.href}`);
          const toolbar = await this.waitForToolbar(iframe);
          if (toolbar) {
            console.log(`Found toolbar for ${moduleLabel} - ${subLabel} at URL: ${iframe.contentWindow.location.href}`);
            const buttonSelectors = this.getToolbarButtonSelectors(iframe);
            if (buttonSelectors && buttonSelectors.length > 0) {
              console.log(`Found ${buttonSelectors.length} toolbar buttons for ${moduleLabel} - ${subLabel}`);
              buttonSelectors.forEach((button) => {
                const actionsWithButton = JSON.parse(JSON.stringify(submenuAction.actions));
                actionsWithButton.push(
                  { type: "click", selector: button.selector },
                  { type: "wait", duration: waitTime }
                );
                actions.push({
                  name: `${moduleLabel} - ${subLabel} - ${button.name}`,
                  actions: actionsWithButton,
                });
              });
            } else {
              console.log(`No toolbar buttons found for ${moduleLabel} - ${subLabel} at URL: ${iframe.contentWindow.location.href}`);
            }
          } else {
            console.log(`No toolbar found for ${moduleLabel} - ${subLabel} at URL: ${iframe.contentWindow.location.href}`);
          }
        } catch (toolbarError) {
          console.warn(`Error generating toolbar actions for ${moduleLabel} - ${subLabel}:`, toolbarError);
        }
      }

      if (hasSubSubmenu) {
        console.log(`Found sub-submenu for ${subLabel}, but not exploring it for now.`);
      }
    } catch (error) {
      console.warn(`Error processing submenu item:`, error);
    }
    return actions;
  },

  /**
   * Generate comprehensive menu actions for the entire hierarchy.
   * This is similar to the original generateMenuActions but optimized.
   *
   * @param {number} waitTime - Time to wait after each click (ms)
   * @param {boolean} includeToolbarButtons - Whether to include actions for toolbar buttons
   * @returns {Promise<Array>} - Promise resolving to array of menu action sequences
   */
  async generateFullHierarchyActions(waitTime, includeToolbarButtons = false) {
    try {
      const baseActions = await MenuActionsHelper.generateMenuActionsWithSubmenus(waitTime);
      if (!includeToolbarButtons) {
        return baseActions;
      }
      const allActions = [...baseActions];
      const iframe = UI.elements.iframe;
      for (const action of baseActions) {
        try {
          const toolbarActions = await this.generateToolbarButtonActions(
            action.actions,
            action.name,
            waitTime,
            iframe
          );
          if (toolbarActions && toolbarActions.length > 0) {
            allActions.push(...toolbarActions);
          }
        } catch (error) {
          console.warn(`Error generating toolbar actions for ${action.name}:`, error);
        }
      }
      return allActions;
    } catch (error) {
      console.error("Error generating full hierarchy actions:", error);
      return [];
    }
  },

  /**
   * Generate toolbar button actions for a specific page navigation.
   *
   * @param {Array} baseActions - Base actions to navigate to a page
   * @param {string} pageName - Name of the page for action naming
   * @param {number} waitTime - Time to wait after each action
   * @param {HTMLIFrameElement} iframe - The iframe containing the page
   * @returns {Promise<Array>} - Array of toolbar button selectors and their names
   */
  async generateToolbarButtonActions(baseActions, pageName, waitTime, iframe) {
    const toolbarActions = [];
    try {
      const toolbar = await this.waitForToolbar(iframe);
      if (!toolbar) {
        console.log(`Toolbar not available for page: ${pageName}. Skipping toolbar actions.`);
        return [];
      }
      const buttonSelectors = this.getToolbarButtonSelectors(iframe);
      if (buttonSelectors.length === 0) {
        console.log(`No visible/enabled toolbar buttons to interact with for page: ${pageName}`);
        return [];
      }
      buttonSelectors.forEach((button) => {
        const actionsWithButton = JSON.parse(JSON.stringify(baseActions));
        actionsWithButton.push(
          { type: "click", selector: button.selector },
          { type: "wait", duration: waitTime }
        );
        toolbarActions.push({
          name: `${pageName} - ${button.name}`,
          actions: actionsWithButton,
        });
      });
    } catch (error) {
      console.warn(`Error generating toolbar actions for ${pageName}:`, error);
      console.log("Error occurred in URL:", iframe.contentWindow.location.href);
      return [];
    }
    return toolbarActions;
  },

  /**
   * Get toolbar button selectors by inspecting the toolbar element.
   *
   * @param {HTMLIFrameElement} iframe - The iframe containing the page
   * @returns {Array} - Array of objects with button names and selectors
   */
  getToolbarButtonSelectors(iframe) {
    try {
      console.log("Getting toolbar buttons for URL:", iframe.contentWindow.location.href);
      const xpath = '//*[@id="app-container"]/div/div[3]/div[2]/div[2]/div[1]/div[1]/div/div[1]/div';
      const toolbar = iframe.contentDocument.evaluate(
        xpath,
        iframe.contentDocument,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      ).singleNodeValue;
      let buttons = [];
      if (!toolbar) {
        console.log("Primary toolbar not found. Attempting alternative detection methods...");
        const alternativeXpaths = [
          "/html/body/div[1]/div/div[3]/div[2]/div[2]/div[1]/div[1]/div/div[1]/div",
          '//div[@data-component="ia.container.flex" and .//button]',
          '//div[contains(@class, "flex-container") and .//button]',
        ];
        for (const altXpath of alternativeXpaths) {
          const altToolbar = iframe.contentDocument.evaluate(
            altXpath,
            iframe.contentDocument,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
          ).singleNodeValue;
          if (altToolbar) {
            const foundButtons = altToolbar.querySelectorAll("button");
            if (foundButtons.length > 0) {
              console.log(`Found toolbar using alternative XPath: ${altXpath} with ${foundButtons.length} buttons`);
              buttons = foundButtons;
              break;
            }
          }
        }
        if (buttons.length === 0) {
          const directButtons = iframe.contentDocument.querySelectorAll(
            'button[data-component="ia.input.button"]'
          );
          if (directButtons.length > 0) {
            console.log(`Found ${directButtons.length} buttons directly in the page`);
            buttons = directButtons;
          }
        }
      } else {
        buttons = toolbar.querySelectorAll("button");
        console.log(`Found toolbar with ${buttons.length} buttons using primary XPath`);
      }
      if (buttons.length === 0) {
        console.log("No buttons found in page.");
        return [];
      }
      const iconToName = {
        "material/zoom_out_map": "Layout",
        "material/trending_up": "Trends",
        "material/article": "Document",
        "material/report": "Report",
        "material/unfold_less": "Collapse",
        "material/unfold_more": "Expand",
        "material/alarm": "Alarm",
        "material/list": "List",
        "material/view_module": "View Module",
      };
      const buttonList = [];
      Array.from(buttons).forEach((btn, index) => {
        if (btn.hasAttribute("disabled")) {
          console.log(`Skipping disabled button at index ${index}`);
          return;
        }
        let parent = btn;
        let isHidden = false;
        while (parent && parent !== iframe.contentDocument.body) {
          const style = window.getComputedStyle(parent);
          if (style.visibility === "hidden" || style.display === "none") {
            isHidden = true;
            break;
          }
          parent = parent.parentElement;
        }
        if (isHidden) {
          console.log(`Skipping hidden button at index ${index}`);
          return;
        }
        let btnText = "";
        const icon = btn.querySelector("svg")?.getAttribute("data-icon") || "";
        if (icon && iconToName[icon]) {
          btnText = iconToName[icon];
        } else {
          const textElement = btn.querySelector(".text");
          btnText = textElement ? textElement.textContent.trim() : `Button ${index + 1}`;
        }
        let selector;
        if (btn.id) {
          selector = `#${btn.id}`;
        } else if (btn.hasAttribute("data-component")) {
          const componentType = btn.getAttribute("data-component");
          const sameTypeButtons = Array.from(
            iframe.contentDocument.querySelectorAll(
              `[data-component="${componentType}"]`
            )
          );
          const buttonIndex = sameTypeButtons.indexOf(btn) + 1;
          selector = `[data-component="${componentType}"]:nth-of-type(${buttonIndex})`;
        } else {
          const fullXPath = this.getElementXPath(btn, iframe.contentDocument);
          selector = fullXPath;
        }
        buttonList.push({
          name: `${btnText} Button`,
          selector,
        });
      });
      console.log("Detected toolbar buttons:", buttonList);
      return buttonList;
    } catch (error) {
      console.warn("Error getting toolbar button selectors:", error);
      console.log("Error occurred in URL:", iframe.contentWindow.location.href);
      return [];
    }
  },

  /**
   * Helper function to get the XPath of an element.
   * @param {Element} element - The element to get XPath for
   * @param {Document} document - The document containing the element
   * @returns {string} The XPath
   */
  getElementXPath(element, document) {
    if (!element) return "";
    if (element === document) return "/";
    let comp, comps = [];
    let parent = null;
    let xpath = "";
    let getPos = function (element) {
      let position = 1, curNode;
      if (element.nodeType == Node.ATTRIBUTE_NODE) {
        return null;
      }
      for (curNode = element.previousSibling; curNode; curNode = curNode.previousSibling) {
        if (curNode.nodeName == element.nodeName) {
          ++position;
        }
      }
      return position;
    };
    if (element instanceof Attr) {
      return `//@${element.nodeName}`;
    }
    for (; element && element.nodeType == Node.ELEMENT_NODE; element = element.parentNode) {
      comp = element.nodeName.toLowerCase();
      let pos = getPos(element);
      if (pos > 1) {
        comp += `[${pos}]`;
      }
      comps.unshift(comp);
    }
    return `/${comps.join("/")}`;
  },

  /**
   * Generate actions for a selected main menu item and its submenu.
   * @param {string} selectedModule - The data-label of the selected main menu item.
   * @param {number} waitTime - Time to wait after each action.
   * @param {boolean} includeToolbarButtons - Whether to include toolbar actions.
   * @param {Object} urlContext - The original URL context.
   * @returns {Promise<Array>} - Promise resolving to an array of action sequences.
   */
  async generateActionsForSelectedMainMenu(selectedModule, waitTime, includeToolbarButtons, urlContext) {
    const iframe = UI.elements.iframe;
    const mainMenuItem = iframe.contentDocument.querySelector(`.menu-option[data-label="${selectedModule}"]`);
    if (!mainMenuItem) {
      UI.utils.showStatus(`Main menu item "${selectedModule}" not found.`, true);
      return [];
    }
    mainMenuItem.click();
    await new Promise(r => setTimeout(r, waitTime / 2));
    const newUrlContext = {
      isValid: true,
      project: urlContext.project,
      module: selectedModule,
      page: null,
      depth: 2,
      urlParts: []
    };
    const actionsForModule = await this.generateActionsForCurrentContext(newUrlContext, waitTime, includeToolbarButtons);
    return actionsForModule;
  },

  /**
   * Add context-aware UI controls.
   */
  addUIControls() {
    const container = document.createElement("div");
    container.className = "menu-actions-buttons";
    container.style.marginTop = "10px";
    container.style.marginBottom = "10px";
    container.style.display = "flex";
    container.style.gap = "10px";

    const existingContainer = document.querySelector(".menu-actions-buttons");
    if (existingContainer) {
      existingContainer.remove();
    }

    const loadButton = document.createElement("button");
    loadButton.id = "loadFirstUrl";
    loadButton.className = "btn btn-small";
    loadButton.textContent = "Load First URL";
    loadButton.title = "Load the first URL from the list into the iframe";
    loadButton.onclick = async () => {
      try {
        const urlList = document.getElementById("urlList");
        const urls = urlList.value.trim().split("\n");
        if (urls.length > 0) {
          const firstUrl = urls[0].trim();
          if (firstUrl) {
            const iframe = UI.elements.iframe;
            const progressElement = UI.elements.progress;
            progressElement.innerHTML = `Loading ${firstUrl} in iframe... (waiting 10s for complete load)`;
            loadButton.disabled = true;
            loadButton.textContent = "Loading...";
            iframe.src = firstUrl;
            await new Promise((resolve) => {
              const handleLoad = () => {
                iframe.removeEventListener("load", handleLoad);
                resolve();
              };
              iframe.addEventListener("load", handleLoad);
              setTimeout(resolve, 5000);
            });
            for (let i = 5; i > 0; i--) {
              progressElement.innerHTML = `Loading ${firstUrl} in iframe... (waiting ${i}s for complete load)`;
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
            progressElement.innerHTML = `${firstUrl} loaded. Ready for action generation.`;
            loadButton.disabled = false;
            loadButton.textContent = "Load First URL";
          }
        }
      } catch (error) {
        console.error("Error loading first URL:", error);
        UI.utils.showStatus(`Error loading URL: ${error.message}`, true);
        loadButton.disabled = false;
        loadButton.textContent = "Load First URL";
      }
    };

    const generateContextButton = document.createElement("button");
    generateContextButton.id = "generateContextActions";
    generateContextButton.className = "btn btn-small";
    generateContextButton.textContent = "Generate Context Actions";
    generateContextButton.title = "Generate actions based on current page context";
    generateContextButton.onclick = () => {
      try {
        const iframe = UI.elements.iframe;
        if (!iframe.src || iframe.src === "about:blank") {
          alert('Please load a URL first using the "Load First URL" button');
          return;
        }
        generateContextButton.disabled = true;
        generateContextButton.textContent = "Generating...";
        const includeToolbar = document.getElementById("includeToolbarButtons").checked;
        this.generateContextAwareMenuActions(
          iframe.src,
          undefined,
          includeToolbar
        )
          .then((actions) => {
            if (actions.length > 0) {
              document.getElementById("actionsField").value = JSON.stringify(actions, null, 2);
              UI.utils.showStatus(`Generated ${actions.length} context-aware menu actions`, false);
            } else {
              alert("No menu items found. Try adjusting the URL or wait for the page to fully load.");
            }
          })
          .catch((error) => {
            console.error("Error generating context menu actions:", error);
            alert("Error generating context menu actions: " + error.message);
          })
          .finally(() => {
            generateContextButton.disabled = false;
            generateContextButton.textContent = "Generate Context Actions";
          });
      } catch (error) {
        console.error("Error in generate context button handler:", error);
        generateContextButton.disabled = false;
        generateContextButton.textContent = "Generate Context Actions";
        alert("Error: " + error.message);
      }
    };

    container.appendChild(loadButton);
    container.appendChild(generateContextButton);
    const actionsField = document.getElementById("actionsField");
    if (actionsField) {
      actionsField.parentNode.insertBefore(container, actionsField);
    }
  },
};

// Add default export
export default ContextMenuActionsHelper;
