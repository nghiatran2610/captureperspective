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
   * Expected URL structure: http://localhost:8088/data/perspective/client/PROJECT/MODULE/PAGE
   * @param {string} url - The current URL
   * @returns {Object} - URL parts including project, module, page
   */
  parseUrlContext(url) {
    const urlParts = url.split("/");
    const context = {
      isValid: false,
      project: null,
      module: null,
      page: null,
      depth: 0,
      urlParts,
    };

    const clientIndex = urlParts.indexOf("client");
    if (clientIndex === -1) return context;

    if (urlParts.length > clientIndex + 1) {
      context.project = urlParts[clientIndex + 1];
      context.isValid = true;
      context.depth = 1;
    }
    if (urlParts.length > clientIndex + 2) {
      context.module = urlParts[clientIndex + 2];
      context.depth = 2;
    }
    if (urlParts.length > clientIndex + 3) {
      context.page = urlParts[clientIndex + 3];
      context.depth = 3;
    }
    return context;
  },

  /**
   * Wait for the iframe to fully load.
   * @param {HTMLIFrameElement} iframe - The iframe element.
   * @returns {Promise<void>}
   */
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
   * Helper function to convert display name to URL segment.
   * Handles spaces and special characters.
   * @param {string} displayName - The display name shown in the UI.
   * @returns {string} URL-friendly segment.
   */
  convertDisplayNameToUrlSegment(displayName) {
    if (!displayName) return "";
    let urlSegment = displayName.trim();
    urlSegment = urlSegment.replace(/\s+/g, "");
    urlSegment = urlSegment.replace(/[^a-zA-Z0-9_-]/g, "");
    return urlSegment;
  },

  /**
   * Construct a page URL based on the project, module and optional page names.
   * @param {string} projectName - The project name.
   * @param {string} moduleName - The module name.
   * @param {string} [pageName=null] - Optional page name.
   * @param {string} [baseUrl=null] - Optional base URL.
   * @returns {string} The constructed URL.
   */
  constructPageUrl(projectName, moduleName, pageName = null, baseUrl = null) {
    if (!projectName || !moduleName) {
      console.warn("Cannot construct URL without project and module names");
      return null;
    }
    if (!baseUrl) {
      const currentUrl = window.location.href;
      const clientIndex = currentUrl.indexOf("/client/");
      baseUrl = clientIndex !== -1 ? currentUrl.substring(0, clientIndex) : "http://localhost:8088/data/perspective";
    }
    const moduleUrlSegment = this.convertDisplayNameToUrlSegment(moduleName);
    let url = `${baseUrl}/client/${projectName}/${moduleUrlSegment}`;
    if (pageName) {
      const pageUrlSegment = this.convertDisplayNameToUrlSegment(pageName);
      url += `/${pageUrlSegment}`;
    }
    console.log(`Constructed URL for "${moduleName}"${pageName ? ` - "${pageName}"` : ""}: ${url}`);
    return url;
  },

  /**
   * Wait for submenu items to load in the iframe.
   * @param {HTMLIFrameElement} iframe - The iframe element.
   * @param {number} [maxAttempts=10] - Maximum attempts.
   * @param {number} [interval=500] - Interval in ms.
   * @returns {Promise<Array>} - Array of submenu elements.
   */
  async waitForSubmenu(iframe, maxAttempts = 10, interval = 500) {
    for (let i = 0; i < maxAttempts; i++) {
      const submenuItems = iframe.contentDocument.querySelectorAll(".submenu-group .menu-option");
      if (submenuItems.length > 0) {
        console.log(`Submenu items found after ${i + 1} attempts:`, submenuItems);
        return Array.from(submenuItems);
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
    console.log("No submenu items found after maximum attempts.");
    return [];
  },

  /**
   * Wait for a toolbar to load using only the fixed XPath.
   * @param {HTMLIFrameElement} iframe - The iframe element.
   * @param {number} [maxAttempts=10] - Maximum attempts.
   * @param {number} [interval=500] - Interval in ms.
   * @returns {Promise<Element|null>} - The toolbar element, or null.
   */
  async waitForToolbar(iframe, maxAttempts = 10, interval = 500) {
    const fixedXPath = '//*[@id="app-container"]/div/div[3]/div[2]/div[2]/div[1]/div[1]/div/div[1]/div';
    console.log("Checking for toolbar in URL:", iframe.contentWindow.location.href);
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const toolbar = iframe.contentDocument.evaluate(
          fixedXPath,
          iframe.contentDocument,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        ).singleNodeValue;
        if (toolbar) {
          const buttons = toolbar.querySelectorAll("button");
          if (buttons.length > 0) {
            console.log(`Toolbar found using fixed XPath with ${buttons.length} buttons after ${i + 1} attempts`);
            return toolbar;
          }
        }
        console.log(`Attempt ${i + 1}: No toolbar found using fixed XPath, waiting ${interval}ms...`);
        await new Promise((resolve) => setTimeout(resolve, interval));
      } catch (error) {
        console.warn(`Error in toolbar detection attempt ${i + 1}:`, error);
        await new Promise((resolve) => setTimeout(resolve, interval));
      }
    }
    console.log("No toolbar found after maximum attempts using fixed XPath in URL:", iframe.contentWindow.location.href);
    return null;
  },

  /**
   * Generate context-aware menu actions based on current URL context.
   * Always prompts the user to select a main menu item.
   * @param {string} currentUrl - The current URL.
   * @param {number} [waitTime=2000] - Wait time after each click.
   * @param {boolean} [includeToolbarButtons=false] - Whether to include toolbar actions.
   * @returns {Promise<Array>} - Array of action sequences.
   */
  generateContextAwareMenuActions(currentUrl, waitTime = 2000, includeToolbarButtons = false) {
    return new Promise(async (resolve, reject) => {
      try {
        const iframe = UI.elements.iframe;
        if (!iframe.contentDocument) {
          UI.utils.showStatus("Error: Iframe document not accessible.", true);
          return reject("iframe not loaded or accessible");
        }
        await this.waitForIframeLoad(iframe);

        const mainMenuElements = iframe.contentDocument.querySelectorAll(".menu-wrapper.wrapper-root > .menu-option");
        const mainMenuItems = Array.from(mainMenuElements)
          .map(item => item.getAttribute("data-label"))
          .filter(label => label);
        if (mainMenuItems.length === 0) {
          UI.utils.showStatus("No main menu items found.", true);
          return resolve([]);
        }
        const userSelection = prompt("Select a main menu item from the following list:\n" + mainMenuItems.join("\n"));
        if (!userSelection || !mainMenuItems.includes(userSelection)) {
          UI.utils.showStatus("Invalid selection. No actions generated.", true);
          return resolve([]);
        }
        const urlContext = this.parseUrlContext(currentUrl);
        const actionSequences = await this.generateActionsForSelectedMainMenu(userSelection, waitTime, includeToolbarButtons, urlContext);
        console.log("Generated action sequences:", actionSequences);
        if (actionSequences.length === 0) {
          UI.utils.showStatus("No menu items found. Try adjusting the URL or wait for the page to fully load.", true);
        }
        resolve(actionSequences);
      } catch (error) {
        console.error("Error generating context-aware menu actions:", error);
        UI.utils.showStatus(`Error generating context menu actions: ${error.message}`, true);
        reject(error);
      }
    });
  },

  /**
   * Generate actions for the current context (module/page level) from the selected main menu item.
   */
  async generateActionsForCurrentContext(urlContext, waitTime, includeToolbarButtons = false) {
    const iframe = UI.elements.iframe;
    let actions = [];
    console.log("Generating actions for URL context:", urlContext);
    if (urlContext.module) {
      try {
        const moduleMenuItem = iframe.contentDocument.querySelector(`.menu-option[data-label="${urlContext.module}"]`);
        if (moduleMenuItem) {
          console.log(`Found module menu item for ${urlContext.module}`);
          const moduleAction = {
            name: urlContext.module,
            actions: [
              { type: "click", selector: `.menu-option[data-label="${urlContext.module}"]` },
              { type: "wait", duration: waitTime },
            ],
          };
          actions.push(moduleAction);
          if (includeToolbarButtons) {
            try {
              const originalUrl = iframe.contentWindow.location.href;
              moduleMenuItem.click();
              await new Promise((r) => setTimeout(r, waitTime));
              await this.waitForIframeLoad(iframe);
              const moduleUrl = iframe.contentWindow.location.href;
              console.log(`Successfully navigated to module URL: ${moduleUrl}`);
              const toolbar = await this.waitForToolbar(iframe);
              if (toolbar) {
                console.log(`Found toolbar for module ${urlContext.module} at URL: ${moduleUrl}`);
                const buttonSelectors = this.getToolbarButtonSelectors(iframe);
                if (buttonSelectors && buttonSelectors.length > 0) {
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
                  console.log(`No toolbar buttons found for module ${urlContext.module} at URL: ${moduleUrl}`);
                }
              } else {
                console.log(`No toolbar found for module ${urlContext.module} at URL: ${moduleUrl}`);
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
          const hasSubmenu = moduleMenuItem.querySelector('.nav-icon svg[data-icon*="chevron_right"]') !== null;
          if (hasSubmenu) {
            console.log(`${urlContext.module} has submenu, opening it...`);
            moduleMenuItem.click();
            await new Promise((r) => setTimeout(r, waitTime / 2));
            const submenuItems = await this.waitForSubmenu(iframe);
            console.log(`Found ${submenuItems.length} submenu items under ${urlContext.module}`);
            for (const subItem of submenuItems) {
              if (!subItem.getAttribute("data-label") || subItem.classList.contains("menu-header") || subItem.classList.contains("menu-back-action")) {
                continue;
              }
              const submenuActions = await this.processSubmenuItem(subItem, urlContext.module, waitTime, iframe, includeToolbarButtons);
              if (submenuActions.length > 0) {
                actions = actions.concat(submenuActions);
              }
            }
            try {
              const backButton = iframe.contentDocument.querySelector(".submenu-group .menu-back-action");
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
        const mainMenuItems = iframe.contentDocument.querySelectorAll(".menu-wrapper.wrapper-root > .menu-option");
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
                  const buttonSelectors = this.getToolbarButtonSelectors(iframe);
                  if (buttonSelectors && buttonSelectors.length > 0) {
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
            console.warn("Error processing main menu item:", itemError);
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
   * Performs direct navigation to ensure toolbar detection occurs at the right URL.
   */
  async processSubmenuItem(subItem, moduleLabel, waitTime, iframe, includeToolbarButtons) {
    const actions = [];
    try {
      const subLabel = subItem.getAttribute("data-label");
      if (!subLabel || subItem.classList.contains("menu-header") || subItem.classList.contains("menu-back-action"))
        return actions;

      console.log(`Processing submenu item: ${moduleLabel} - ${subLabel}`);
      const hasSubSubmenu = subItem.querySelector('.nav-icon svg[data-icon*="chevron_right"]') !== null;
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

          if (submenuUrl === originalUrl || !submenuUrl.includes(this.convertDisplayNameToUrlSegment(moduleLabel))) {
            const constructedUrl = this.constructPageUrl(projectName, moduleLabel, subLabel);
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
      console.warn("Error processing submenu item:", error);
    }
    return actions;
  },

  /**
   * Generate actions for a selected main menu item and its submenu.
   */
  async generateActionsForSelectedMainMenu(selectedModule, waitTime, includeToolbarButtons, urlContext) {
    const iframe = UI.elements.iframe;
    const mainMenuItem = iframe.contentDocument.querySelector(`.menu-option[data-label="${selectedModule}"]`);
    if (!mainMenuItem) {
      UI.utils.showStatus(`Main menu item "${selectedModule}" not found.`, true);
      return [];
    }
    mainMenuItem.click();
    await new Promise((r) => setTimeout(r, waitTime / 2));
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
   * Get toolbar button selectors by inspecting the toolbar element using only the fixed XPath.
   */
  getToolbarButtonSelectors(iframe) {
    try {
      console.log("Getting toolbar buttons for URL:", iframe.contentWindow.location.href);
      const fixedXPath = '//*[@id="app-container"]/div/div[3]/div[2]/div[2]/div[1]/div[1]/div/div[1]/div';
      const toolbar = iframe.contentDocument.evaluate(
        fixedXPath,
        iframe.contentDocument,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      ).singleNodeValue;
      let buttons = [];
      if (toolbar) {
        buttons = toolbar.querySelectorAll("button");
        console.log(`Found toolbar with ${buttons.length} buttons using fixed XPath`);
      } else {
        console.log("No toolbar found using fixed XPath.");
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
        if (btn.hasAttribute("disabled")) return;
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
        if (isHidden) return;
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
          const sameTypeButtons = Array.from(iframe.contentDocument.querySelectorAll(`[data-component="${componentType}"]`));
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
      return [];
    }
  },

  /**
   * Helper function to get the XPath of an element.
   */
  getElementXPath(element, document) {
    if (!element) return "";
    if (element === document) return "/";
    let comp, comps = [];
    let getPos = function (element) {
      let position = 1, curNode;
      if (element.nodeType === Node.ATTRIBUTE_NODE) return null;
      for (curNode = element.previousSibling; curNode; curNode = curNode.previousSibling) {
        if (curNode.nodeName === element.nodeName) {
          ++position;
        }
      }
      return position;
    };
    if (element instanceof Attr) {
      return `//@${element.nodeName}`;
    }
    for (; element && element.nodeType === Node.ELEMENT_NODE; element = element.parentNode) {
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
   * Add context-aware UI controls.
   * Combines the "Load First URL" with "Generate Context Actions" into one button.
   * Always prompts the user to select a main menu item.
   * Toolbar interactions default to enabled.
   */
  addUIControls() {
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
    generateContextButton.title = "Load first URL if needed, then prompt for main menu item, then generate actions.";

    generateContextButton.onclick = async () => {
      try {
        const iframe = UI.elements.iframe;
        // If no URL is loaded, automatically load the first URL from the list.
        if (!iframe.src || iframe.src === "about:blank") {
          const urlListElement = document.getElementById("urlList");
          const urlListValue = urlListElement.value;
          const urls = urlListValue.trim().split("\n").filter(url => url.trim() !== "");
          if (urls.length === 0) {
            alert("Please enter at least one URL.");
            return;
          }
          const firstUrl = urls[0].trim();
          UI.elements.progress.innerHTML = `Automatically loading first URL: ${firstUrl}...`;
          iframe.src = firstUrl;
          await this.waitForIframeLoad(iframe);
          // Wait an extra 5 seconds for dynamic content
          await new Promise(resolve => setTimeout(resolve, 5000));
          UI.elements.progress.innerHTML = `${firstUrl} loaded. Ready for action generation.`;
        }
        generateContextButton.disabled = true;
        generateContextButton.textContent = "Generating...";

        // Get the includeToolbarButtons value; default to true if not found.
        const toolbarCheckbox = document.getElementById("includeToolbarButtons");
        const includeToolbar = toolbarCheckbox ? toolbarCheckbox.checked : true;

        const actions = await this.generateContextAwareMenuActions(iframe.src, undefined, includeToolbar);
        if (actions.length > 0) {
          document.getElementById("actionsField").value = JSON.stringify(actions, null, 2);
          UI.utils.showStatus(`Generated ${actions.length} context-aware menu actions`, false);
        } else {
          alert("No menu items found. Try adjusting the URL or wait for the page to fully load.");
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
  },
};

export default ContextMenuActionsHelper;
