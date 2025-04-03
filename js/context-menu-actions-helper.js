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
    // Log the current URL being checked
    console.log(
      "Checking for toolbar in URL:",
      iframe.contentWindow.location.href
    );

    // Array of possible XPaths for toolbars
    const xpathOptions = [
      '//*[@id="app-container"]/div/div[3]/div[2]/div[2]/div[1]/div[1]/div/div[1]/div', // Original path
      "/html/body/div[1]/div/div[3]/div[2]/div[2]/div[1]/div[1]/div/div[1]/div", // Full XPath you provided
      '//div[@data-component="ia.container.flex"]', // Based on component attribute
      '//div[contains(@class, "flex-container") and .//button]', // Any flex container with buttons
      '//div[.//button[@data-component="ia.input.button"]]', // Container with specific button type
    ];

    for (let i = 0; i < maxAttempts; i++) {
      try {
        // Try each XPath option until one works
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

        // Try a more direct approach - look for groups of buttons
        const allButtons = iframe.contentDocument.querySelectorAll(
          'button[data-component="ia.input.button"]'
        );

        if (allButtons.length > 0) {
          console.log(
            `Found ${allButtons.length} buttons directly in the page`
          );

          // If we found buttons but not the container, let's try to get their common parent
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

        // Wait before trying again
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
          UI.utils.showStatus("Error: Iframe document not accessible.", true);
          return reject("iframe not loaded or accessible");
        }

        // Ensure iframe is fully loaded
        await this.waitForIframeLoad(iframe);

        const urlContext = this.parseUrlContext(currentUrl);
        console.log("Current URL context:", urlContext);

        // Log the URL structure for debugging
        if (urlContext.isValid) {
          console.log(
            `URL Structure: Project=${urlContext.project}, Module=${urlContext.module}, Page=${urlContext.page}`
          );

          if (urlContext.module) {
            // Show URL-friendly version of module name
            const moduleUrlSegment = this.convertDisplayNameToUrlSegment(
              urlContext.module
            );
            console.log(`Module URL segment: ${moduleUrlSegment}`);
          }

          if (urlContext.page) {
            // Show URL-friendly version of page name
            const pageUrlSegment = this.convertDisplayNameToUrlSegment(
              urlContext.page
            );
            console.log(`Page URL segment: ${pageUrlSegment}`);
          }
        }

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

        // Log the generated sequences for debugging
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
   * Generate a list of toolbar button selectors dynamically using XPath
   * @param {HTMLIFrameElement} iframe - The iframe containing the page
   * @returns {Array} Array of toolbar button selectors and their names
   */
  getToolbarButtonSelectors(iframe) {
    try {
      // Log the current URL being checked for toolbar buttons
      console.log(
        "Getting toolbar buttons for URL:",
        iframe.contentWindow.location.href
      );

      // First, get the toolbar dynamically
      const xpath =
        '//*[@id="app-container"]/div/div[3]/div[2]/div[2]/div[1]/div[1]/div/div[1]/div';
      const toolbar = iframe.contentDocument.evaluate(
        xpath,
        iframe.contentDocument,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      ).singleNodeValue;

      // If we didn't find a toolbar using the primary XPath, try alternative approaches
      let buttons = [];
      if (!toolbar) {
        console.log(
          "Primary toolbar not found. Attempting alternative detection methods..."
        );

        // Try alternative XPaths
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
              console.log(
                `Found toolbar using alternative XPath: ${altXpath} with ${foundButtons.length} buttons`
              );
              buttons = foundButtons;
              break;
            }
          }
        }

        // If still no buttons, try finding buttons directly
        if (buttons.length === 0) {
          const directButtons = iframe.contentDocument.querySelectorAll(
            'button[data-component="ia.input.button"]'
          );

          if (directButtons.length > 0) {
            console.log(
              `Found ${directButtons.length} buttons directly in the page`
            );
            buttons = directButtons;
          }
        }
      } else {
        // Get all buttons within the found toolbar
        buttons = toolbar.querySelectorAll("button");
        console.log(
          `Found toolbar with ${buttons.length} buttons using primary XPath`
        );
      }

      if (buttons.length === 0) {
        console.log("No buttons found in page.");
        return [];
      }

      // Map icons to meaningful names
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
        // Skip disabled buttons
        if (btn.hasAttribute("disabled")) {
          console.log(`Skipping disabled button at index ${index}`);
          return;
        }

        // Check if the button or its parent is hidden
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

        // Generate a name for the button
        let btnText = "";
        const icon = btn.querySelector("svg")?.getAttribute("data-icon") || "";
        if (icon && iconToName[icon]) {
          btnText = iconToName[icon];
        } else {
          // Fallback to text content if no icon is present
          const textElement = btn.querySelector(".text");
          btnText = textElement
            ? textElement.textContent.trim()
            : `Button ${index + 1}`;
        }

        // Generate a unique selector for the button
        // Use multiple selector strategies for robustness
        let selector;

        if (btn.id) {
          // If button has ID, use it (most reliable)
          selector = `#${btn.id}`;
        } else if (btn.hasAttribute("data-component")) {
          // Use data-component attribute with nth-of-type for uniqueness
          const componentType = btn.getAttribute("data-component");
          const sameTypeButtons = Array.from(
            iframe.contentDocument.querySelectorAll(
              `[data-component="${componentType}"]`
            )
          );
          const buttonIndex = sameTypeButtons.indexOf(btn) + 1;
          selector = `[data-component="${componentType}"]:nth-of-type(${buttonIndex})`;
        } else {
          // Fall back to XPath as last resort
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
   * Helper function to get the XPath of an element
   * @param {Element} element - The element to get XPath for
   * @param {Document} document - The document containing the element
   * @returns {string} The XPath
   */
  getElementXPath(element, document) {
    if (!element) return "";
    if (element === document) return "/";

    let comp,
      comps = [];
    let parent = null;
    let xpath = "";
    let getPos = function (element) {
      let position = 1,
        curNode;
      if (element.nodeType == Node.ATTRIBUTE_NODE) {
        return null;
      }
      for (
        curNode = element.previousSibling;
        curNode;
        curNode = curNode.previousSibling
      ) {
        if (curNode.nodeName == element.nodeName) {
          ++position;
        }
      }
      return position;
    };

    if (element instanceof Attr) {
      return `//@${element.nodeName}`;
    }

    for (
      ;
      element && element.nodeType == Node.ELEMENT_NODE;
      element = element.parentNode
    ) {
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
   * Generate toolbar button actions for a specific page navigation
   * @param {Array} baseActions - Base actions to navigate to a page
   * @param {string} pageName - Name of the page for action naming
   * @param {number} waitTime - Time to wait after each action
   * @param {HTMLIFrameElement} iframe - The iframe containing the page
   * @returns {Promise<Array>} - Array of action sequences for toolbar buttons
   */
  async generateToolbarButtonActions(baseActions, pageName, waitTime, iframe) {
    const toolbarActions = [];

    try {
      // Wait for the toolbar to load
      const toolbar = await this.waitForToolbar(iframe);
      if (!toolbar) {
        console.log(
          `Toolbar not available for page: ${pageName}. Skipping toolbar actions.`
        );
        return []; // Return empty array, not null or undefined
      }

      // Get the list of visible, enabled buttons
      const buttonSelectors = this.getToolbarButtonSelectors(iframe);
      if (buttonSelectors.length === 0) {
        console.log(
          `No visible/enabled toolbar buttons to interact with for page: ${pageName}`
        );
        return [];
      }

      // For each button, create an action sequence
      buttonSelectors.forEach((button) => {
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
    } catch (error) {
      console.warn(`Error generating toolbar actions for ${pageName}:`, error);
      return []; // Always return an array, even on error
    }

    return toolbarActions;
  },

  /**
   * Process a submenu item and generate actions for it
   * This function performs direct navigation to ensure toolbar detection occurs at the right URL
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

      // Skip items without data-label, menu headers, or back buttons
      if (
        !subLabel ||
        subItem.classList.contains("menu-header") ||
        subItem.classList.contains("menu-back-action")
      )
        return actions;

      console.log(`Processing submenu item: ${moduleLabel} - ${subLabel}`);

      // Check if this submenu item has its own submenu
      const hasSubSubmenu =
        subItem.querySelector('.nav-icon svg[data-icon*="chevron_right"]') !==
        null;

      // Create base action sequence for this submenu item
      const submenuAction = {
        name: `${moduleLabel} - ${subLabel}`,
        actions: [
          {
            type: "click",
            selector: `.menu-option[data-label="${moduleLabel}"]`,
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
        try {
          console.log(
            `===== PROCESSING SUBMENU TOOLBAR: ${moduleLabel} - ${subLabel} =====`
          );

          // Store original URL for reference
          const originalUrl = iframe.contentWindow.location.href;
          console.log(`Original URL before navigation: ${originalUrl}`);

          // Parse the current URL to get the project name
          const urlContext = this.parseUrlContext(originalUrl);
          const projectName = urlContext.project;

          // Try clicking the submenu item first
          console.log(`Clicking submenu item: ${subLabel}`);
          subItem.click();

          // Wait for the page to navigate and load
          await new Promise((r) => setTimeout(r, waitTime));
          await this.waitForIframeLoad(iframe);

          // Get the URL after navigation
          const submenuUrl = iframe.contentWindow.location.href;
          console.log(`Successfully navigated to submenu URL: ${submenuUrl}`);

          // If navigation didn't work properly, we could try direct URL construction
          if (
            submenuUrl === originalUrl ||
            !submenuUrl.includes(
              this.convertDisplayNameToUrlSegment(moduleLabel)
            )
          ) {
            // Construct the expected URL using our helper function
            const constructedUrl = this.constructPageUrl(
              projectName,
              moduleLabel,
              subLabel
            );

            if (constructedUrl) {
              console.log(
                `Direct navigation failed, trying constructed URL: ${constructedUrl}`
              );
              iframe.src = constructedUrl;
              await new Promise((r) => setTimeout(r, waitTime));
              await this.waitForIframeLoad(iframe);
              console.log(
                `Loaded constructed URL: ${iframe.contentWindow.location.href}`
              );
            }
          }

          // Now detect toolbar buttons on the actual submenu page
          console.log(
            `Detecting toolbar on submenu page: ${iframe.contentWindow.location.href}`
          );
          const toolbar = await this.waitForToolbar(iframe);

          if (toolbar) {
            console.log(
              `Found toolbar for ${moduleLabel} - ${subLabel} at URL: ${iframe.contentWindow.location.href}`
            );
            const buttonSelectors = this.getToolbarButtonSelectors(iframe);

            if (buttonSelectors && buttonSelectors.length > 0) {
              console.log(
                `Found ${buttonSelectors.length} toolbar buttons for ${moduleLabel} - ${subLabel}`
              );

              // Create an action for each button
              buttonSelectors.forEach((button) => {
                // Create a deep copy of submenu actions
                const actionsWithButton = JSON.parse(
                  JSON.stringify(submenuAction.actions)
                );

                // Add button click action
                actionsWithButton.push(
                  { type: "click", selector: button.selector },
                  { type: "wait", duration: waitTime }
                );

                // Create the action sequence
                actions.push({
                  name: `${moduleLabel} - ${subLabel} - ${button.name}`,
                  actions: actionsWithButton,
                });
              });
            } else {
              console.log(
                `No toolbar buttons found for ${moduleLabel} - ${subLabel} at URL: ${iframe.contentWindow.location.href}`
              );
            }
          } else {
            console.log(
              `No toolbar found for ${moduleLabel} - ${subLabel} at URL: ${iframe.contentWindow.location.href}`
            );
          }

          // We don't need to navigate back as the parent function will do this
          // The function that calls processSubmenuItem handles returning to the menu
        } catch (toolbarError) {
          console.warn(
            `Error generating toolbar actions for ${moduleLabel} - ${subLabel}:`,
            toolbarError
          );
        }
      }

      // If there's potentially another level of submenu, we could handle it here
      if (hasSubSubmenu) {
        console.log(
          `Found sub-submenu for ${subLabel}, but not exploring it for now.`
        );
        // This would require more complex handling to click through multiple levels
      }
    } catch (error) {
      console.warn(`Error processing submenu item:`, error);
    }

    return actions;
  },

  /**
   * Generate actions specifically for the current context (focused on current module/page)
   * @param {Object} urlContext - The parsed URL context
   * @param {number} waitTime - Time to wait after each click (ms)
   * @param {boolean} includeToolbarButtons - Whether to include actions for toolbar buttons
   * @returns {Promise<Array>} - Promise resolving to array of menu action sequences
   */
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
            try {
              console.log(
                `Detecting toolbar buttons for module: ${urlContext.module}`
              );

              // Store the original URL to go back to later
              const originalUrl = iframe.contentWindow.location.href;

              // First click on the module to navigate to its page
              moduleMenuItem.click();
              await new Promise((r) => setTimeout(r, waitTime));

              // Wait for page to load completely
              await this.waitForIframeLoad(iframe);

              // Get the URL after navigation
              const moduleUrl = iframe.contentWindow.location.href;
              console.log(`Successfully navigated to module URL: ${moduleUrl}`);

              // Now detect toolbar buttons on the actual module page
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

                  // Create an action for each button
                  buttonSelectors.forEach((button) => {
                    // Create a deep copy of module actions
                    const actionsWithButton = JSON.parse(
                      JSON.stringify(moduleAction.actions)
                    );

                    // Add button click action
                    actionsWithButton.push(
                      { type: "click", selector: button.selector },
                      { type: "wait", duration: waitTime }
                    );

                    // Create the action sequence
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

              // Return to the main menu - this is important for the next steps
              // We can use history.back() or reload the original URL
              if (originalUrl !== moduleUrl) {
                console.log(`Navigating back to original URL: ${originalUrl}`);
                iframe.src = originalUrl;
                await new Promise((r) => setTimeout(r, waitTime));
                await this.waitForIframeLoad(iframe);
              }
            } catch (toolbarError) {
              console.warn(
                `Error generating toolbar actions for ${urlContext.module}:`,
                toolbarError
              );
              // Continue processing even if toolbar actions fail
            }
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
            const submenuItems = await this.waitForSubmenu(iframe);
            console.log(
              `Found ${submenuItems.length} submenu items under ${urlContext.module}`
            );

            // Process each submenu item using the dedicated function
            // This is where our toolbar detection now happens
            for (const subItem of submenuItems) {
              // Skip items that aren't actual submenu items
              if (
                !subItem.getAttribute("data-label") ||
                subItem.classList.contains("menu-header") ||
                subItem.classList.contains("menu-back-action")
              ) {
                continue;
              }

              // Use our processSubmenuItem function to handle each submenu item
              const submenuActions = await this.processSubmenuItem(
                subItem,
                urlContext.module,
                waitTime,
                iframe,
                includeToolbarButtons
              );

              // Add the returned actions to our collection
              if (submenuActions && submenuActions.length > 0) {
                actions = actions.concat(submenuActions);
              }
            }

            // Click the back button to return to main menu
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
        console.error(
          `Error processing module ${urlContext.module}:`,
          moduleError
        );
      }
    } else {
      // If we don't have a specific module in the URL, fall back to a more general approach
      console.log("No specific module in URL, generating generic actions");

      try {
        // Find the main menu items for basic navigation
        const mainMenuItems = iframe.contentDocument.querySelectorAll(
          ".menu-wrapper.wrapper-root > .menu-option"
        );
        console.log(`Found ${mainMenuItems.length} main menu items`);

        // Get original URL for returning later
        const originalUrl = iframe.contentWindow.location.href;

        // Just add the top-level navigation items
        for (const item of Array.from(mainMenuItems).slice(0, 5)) {
          // Limit to first 5 for simplicity
          try {
            const label = item.getAttribute("data-label");
            if (!label) continue;

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
              try {
                // Click on the menu item to navigate to its page
                item.click();
                await new Promise((r) => setTimeout(r, waitTime));

                // Wait for the page to load
                await this.waitForIframeLoad(iframe);

                // Get the URL after navigation
                const menuUrl = iframe.contentWindow.location.href;
                console.log(
                  `Successfully navigated to menu URL for ${label}: ${menuUrl}`
                );

                // Detect toolbar buttons on the actual page
                const toolbar = await this.waitForToolbar(iframe);
                if (toolbar) {
                  console.log(
                    `Found toolbar for menu ${label} at URL: ${menuUrl}`
                  );
                  const buttonSelectors =
                    this.getToolbarButtonSelectors(iframe);

                  if (buttonSelectors && buttonSelectors.length > 0) {
                    console.log(
                      `Found ${buttonSelectors.length} toolbar buttons for menu ${label}`
                    );

                    // Create an action for each button
                    buttonSelectors.forEach((button) => {
                      // Create a deep copy of menu actions
                      const actionsWithButton = JSON.parse(
                        JSON.stringify(menuAction.actions)
                      );

                      // Add button click action
                      actionsWithButton.push(
                        { type: "click", selector: button.selector },
                        { type: "wait", duration: waitTime }
                      );

                      // Create the action sequence
                      actions.push({
                        name: `${label} - ${button.name}`,
                        actions: actionsWithButton,
                      });
                    });
                  } else {
                    console.log(
                      `No toolbar buttons found for menu ${label} at URL: ${menuUrl}`
                    );
                  }
                } else {
                  console.log(
                    `No toolbar found for menu ${label} at URL: ${menuUrl}`
                  );
                }

                // Return to original URL before processing next item
                iframe.src = originalUrl;
                await new Promise((r) => setTimeout(r, waitTime));
                await this.waitForIframeLoad(iframe);
              } catch (toolbarError) {
                console.warn(
                  `Error generating toolbar actions for ${label}:`,
                  toolbarError
                );
                // Continue processing other menu items
              }
            }
          } catch (itemError) {
            console.warn(`Error processing main menu item:`, itemError);
            // Continue with next menu item
          }
        }
      } catch (mainMenuError) {
        console.error("Error processing main menu items:", mainMenuError);
      }
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

    try {
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
          try {
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
              name: `${urlContext.module} - ${
                urlContext.page || ""
              } - ${tabLabel}`,
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
          } catch (tabError) {
            console.warn(`Error processing tab element:`, tabError);
            // Continue with next tab
          }
        });
      }
    } catch (error) {
      console.error("Error finding page-specific interactions:", error);
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
    try {
      // This can reuse most of the code from MenuActionsHelper.generateMenuActionsWithSubmenus
      // We'll adapt it for better performance
      const baseActions =
        await MenuActionsHelper.generateMenuActionsWithSubmenus(waitTime);

      // If we don't need toolbar buttons, just return the base actions
      if (!includeToolbarButtons) {
        return baseActions;
      }

      // If we do need toolbar buttons, add them for each page
      const allActions = [...baseActions]; // Start with the original actions
      const iframe = UI.elements.iframe;

      for (const action of baseActions) {
        try {
          // Generate toolbar actions for this page
          const toolbarActions = await this.generateToolbarButtonActions(
            action.actions,
            action.name,
            waitTime,
            iframe
          );

          // Add them to our results if any were found
          if (toolbarActions && toolbarActions.length > 0) {
            allActions.push(...toolbarActions);
          }
        } catch (error) {
          console.warn(
            `Error generating toolbar actions for ${action.name}:`,
            error
          );
          // Continue with next action
        }
      }

      return allActions;
    } catch (error) {
      console.error("Error generating full hierarchy actions:", error);
      return []; // Return empty array on error
    }
  },

  /**
   * Add context-aware UI controls
   */
  addUIControls() {
    // Create a container for the helper buttons
    const container = document.createElement("div");
    container.className = "menu-actions-buttons";
    container.style.marginTop = "10px";
    container.style.marginBottom = "10px";
    container.style.display = "flex";
    container.style.gap = "10px";

    // Remove any existing buttons to avoid duplicates
    const existingContainer = document.querySelector(".menu-actions-buttons");
    if (existingContainer) {
      existingContainer.remove();
    }

    // Create "Load First URL" button
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
            for (let i = 5; i > 0; i--) {
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
      } catch (error) {
        console.error("Error loading first URL:", error);
        UI.utils.showStatus(`Error loading URL: ${error.message}`, true);
        loadButton.disabled = false;
        loadButton.textContent = "Load First URL";
      }
    };

    // Create "Generate Context Actions" button
    const generateContextButton = document.createElement("button");
    generateContextButton.id = "generateContextActions";
    generateContextButton.className = "btn btn-small";
    generateContextButton.textContent = "Generate Context Actions";
    generateContextButton.title =
      "Generate actions based on current page context";
    generateContextButton.onclick = () => {
      try {
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
      } catch (error) {
        console.error("Error in generate context button handler:", error);
        generateContextButton.disabled = false;
        generateContextButton.textContent = "Generate Context Actions";
        alert("Error: " + error.message);
      }
    };

    // Add buttons to container
    container.appendChild(loadButton);
    container.appendChild(generateContextButton);

    // Add container to page
    const actionsField = document.getElementById("actionsField");
    if (actionsField) {
      actionsField.parentNode.insertBefore(container, actionsField);
    }
  },
};

// Add default export
export default ContextMenuActionsHelper;
