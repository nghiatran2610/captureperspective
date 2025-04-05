// action-generator.js - Functions for generating action sequences

import UI from "../ui/index.js";
import { waitForIframeLoad, waitForSubmenu } from "./element-utils.js";
import {
  waitForToolbar,
  getToolbarButtonSelectors,
} from "./toolbar-detector.js";
import {
  parseUrlContext,
  constructPageUrl,
  convertDisplayNameToUrlSegment,
} from "./url-context-parser.js";

/**
 * Generate context-aware menu actions based on current URL context.
 * Now accepts a specific menuItem parameter to skip the prompt.
 * @param {string} currentUrl - The current URL.
 * @param {number} [waitTime=2000] - Wait time after each click.
 * @param {boolean} [includeToolbarButtons=true] - Whether to include toolbar actions (default true).
 * @param {string} [specificMenuItem=null] - Optional specific menu item to use (instead of prompting)
 * @returns {Promise<Array>} - Array of action sequences.
 */
export function generateContextAwareMenuActions(
  currentUrl,
  waitTime = 2000,
  includeToolbarButtons = true,
  specificMenuItem = null
) {
  return new Promise(async (resolve, reject) => {
    try {
      const iframe = UI.elements.iframe;
      if (!iframe.contentDocument) {
        UI.utils.showStatus("Error: Iframe document not accessible.", true);
        return reject("iframe not loaded or accessible");
      }
      await waitForIframeLoad(iframe);

      const mainMenuElements = iframe.contentDocument.querySelectorAll(
        ".menu-wrapper.wrapper-root > .menu-option"
      );
      const mainMenuItems = Array.from(mainMenuElements)
        .map((item) => item.getAttribute("data-label"))
        .filter((label) => label);
      if (mainMenuItems.length === 0) {
        UI.utils.showStatus("No main menu items found.", true);
        return resolve([]);
      }

      // Use the provided menu item if specified, otherwise prompt the user
      let userSelection = specificMenuItem;

      if (!userSelection) {
        // Fall back to the original prompt behavior for backward compatibility
        userSelection = prompt(
          "Select a main menu item from the following list:\n" +
            mainMenuItems.join("\n")
        );
      }

      if (!userSelection || !mainMenuItems.includes(userSelection)) {
        UI.utils.showStatus("Invalid selection. No actions generated.", true);
        return resolve([]);
      }

      const urlContext = parseUrlContext(currentUrl);
      const actionSequences = await generateActionsForSelectedMainMenu(
        userSelection,
        waitTime,
        includeToolbarButtons,
        urlContext
      );
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
}

/**
 * Generate actions for the current context (module/page level) from the selected main menu item.
 * @param {Object} urlContext - URL context object with project, module, page
 * @param {number} waitTime - Wait time between actions
 * @param {boolean} includeToolbarButtons - Whether to include toolbar button actions
 * @returns {Promise<Array>} - Array of action sequences
 */
export async function generateActionsForCurrentContext(
  urlContext,
  waitTime,
  includeToolbarButtons = false
) {
  const iframe = UI.elements.iframe;
  let actions = [];
  console.log("Generating actions for URL context:", urlContext);
  if (urlContext.module) {
    try {
      const moduleMenuItem = iframe.contentDocument.querySelector(
        `.menu-option[data-label="${urlContext.module}"]`
      );
      if (moduleMenuItem) {
        console.log(`Found module menu item for ${urlContext.module}`);
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
        if (includeToolbarButtons) {
          try {
            const originalUrl = iframe.contentWindow.location.href;
            moduleMenuItem.click();
            await new Promise((r) => setTimeout(r, waitTime));
            await waitForIframeLoad(iframe);
            const moduleUrl = iframe.contentWindow.location.href;
            console.log(`Successfully navigated to module URL: ${moduleUrl}`);
            const toolbar = await waitForToolbar(iframe);
            if (toolbar) {
              console.log(
                `Found toolbar for module ${urlContext.module} at URL: ${moduleUrl}`
              );
              const buttonSelectors = getToolbarButtonSelectors(iframe);
              if (buttonSelectors && buttonSelectors.length > 0) {
                buttonSelectors.forEach((button) => {
                  const actionsWithButton = JSON.parse(
                    JSON.stringify(moduleAction.actions)
                  );
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
              await waitForIframeLoad(iframe);
            }
          } catch (toolbarError) {
            console.warn(
              `Error generating toolbar actions for ${urlContext.module}:`,
              toolbarError
            );
          }
        }
        const hasSubmenu =
          moduleMenuItem.querySelector(
            '.nav-icon svg[data-icon*="chevron_right"]'
          ) !== null;
        if (hasSubmenu) {
          console.log(`${urlContext.module} has submenu, opening it...`);
          moduleMenuItem.click();
          await new Promise((r) => setTimeout(r, waitTime / 2));
          const submenuItems = await waitForSubmenu(iframe);
          console.log(
            `Found ${submenuItems.length} submenu items under ${urlContext.module}`
          );
          // Use a Set to filter duplicate submenu labels
          const seenSubmenuLabels = new Set();
          for (const subItem of submenuItems) {
            const subLabel = subItem.getAttribute("data-label");
            if (
              !subLabel ||
              subItem.classList.contains("menu-header") ||
              subItem.classList.contains("menu-back-action")
            ) {
              continue;
            }
            if (seenSubmenuLabels.has(subLabel)) continue;
            seenSubmenuLabels.add(subLabel);
            const submenuActions = await processSubmenuItem(
              subItem,
              urlContext.module,
              waitTime,
              iframe,
              includeToolbarButtons
            );
            if (submenuActions.length > 0) {
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
      console.error(
        `Error processing module ${urlContext.module}:`,
        moduleError
      );
    }
  } else {
    console.log("No specific module in URL, generating generic actions");
    try {
      const mainMenuItems = iframe.contentDocument.querySelectorAll(
        ".menu-wrapper.wrapper-root > .menu-option"
      );
      const originalUrl = iframe.contentWindow.location.href;
      for (const item of Array.from(mainMenuItems).slice(0, 5)) {
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
          if (includeToolbarButtons) {
            try {
              item.click();
              await new Promise((r) => setTimeout(r, waitTime));
              await waitForIframeLoad(iframe);
              const menuUrl = iframe.contentWindow.location.href;
              console.log(
                `Successfully navigated to menu URL for ${label}: ${menuUrl}`
              );
              const toolbar = await waitForToolbar(iframe);
              if (toolbar) {
                const buttonSelectors = getToolbarButtonSelectors(iframe);
                if (buttonSelectors && buttonSelectors.length > 0) {
                  buttonSelectors.forEach((button) => {
                    const actionsWithButton = JSON.parse(
                      JSON.stringify(menuAction.actions)
                    );
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
                  console.log(
                    `No toolbar buttons found for menu ${label} at URL: ${menuUrl}`
                  );
                }
              } else {
                console.log(
                  `No toolbar found for menu ${label} at URL: ${menuUrl}`
                );
              }
              iframe.src = originalUrl;
              await new Promise((r) => setTimeout(r, waitTime));
              await waitForIframeLoad(iframe);
            } catch (toolbarError) {
              console.warn(
                `Error generating toolbar actions for ${label}:`,
                toolbarError
              );
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
}

/**
 * Process a submenu item and generate actions for it.
 * Performs direct navigation to ensure toolbar detection occurs at the right URL.
 * @param {Element} subItem - Submenu DOM element
 * @param {string} moduleLabel - Parent module label
 * @param {number} waitTime - Wait time between actions
 * @param {HTMLIFrameElement} iframe - The iframe element
 * @param {boolean} includeToolbarButtons - Whether to include toolbar button actions
 * @returns {Promise<Array>} - Array of action sequences
 */
export async function processSubmenuItem(
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
      subItem.querySelector('.nav-icon svg[data-icon*="chevron_right"]') !==
      null;
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

    if (includeToolbarButtons) {
      try {
        console.log(
          `===== PROCESSING SUBMENU TOOLBAR: ${moduleLabel} - ${subLabel} =====`
        );
        const originalUrl = iframe.contentWindow.location.href;
        console.log(`Original URL before navigation: ${originalUrl}`);
        const urlContext = parseUrlContext(originalUrl);
        const projectName = urlContext.project;

        // Click the submenu item to navigate to its page
        console.log(`Clicking submenu item: ${subLabel}`);
        subItem.click();
        await new Promise((r) => setTimeout(r, waitTime));
        await waitForIframeLoad(iframe);

        // Get the actual submenu URL after clicking
        const submenuUrl = iframe.contentWindow.location.href;
        console.log(`Successfully navigated to submenu URL: ${submenuUrl}`);

        // IMPORTANT: First check for toolbar on the original submenu URL
        console.log(
          `Detecting toolbar on original submenu page: ${submenuUrl}`
        );
        let toolbar = await waitForToolbar(iframe);
        let buttonSelectors = [];

        // If toolbar found on original URL, get its buttons
        if (toolbar) {
          console.log(
            `Found toolbar for ${moduleLabel} - ${subLabel} at original URL: ${submenuUrl}`
          );
          buttonSelectors = getToolbarButtonSelectors(iframe);
        }
        // If no toolbar found on original URL, try constructed URL
        else {
          console.log(
            `No toolbar found at original URL. Checking if URL needs correction...`
          );

          // Check if we need to use a constructed URL instead
          if (
            !submenuUrl.includes(convertDisplayNameToUrlSegment(moduleLabel))
          ) {
            // Construct the expected URL
            const constructedUrl = constructPageUrl(
              projectName,
              moduleLabel,
              subLabel
            );
            if (constructedUrl) {
              console.log(
                `URL needs correction, trying constructed URL: ${constructedUrl}`
              );
              iframe.src = constructedUrl;
              await new Promise((r) => setTimeout(r, waitTime));
              await waitForIframeLoad(iframe);
              const constructedPageUrl = iframe.contentWindow.location.href;
              console.log(`Loaded constructed URL: ${constructedPageUrl}`);

              // Try to find toolbar on constructed URL
              console.log(
                `Detecting toolbar on constructed submenu page: ${constructedPageUrl}`
              );
              toolbar = await waitForToolbar(iframe);

              if (toolbar) {
                console.log(
                  `Found toolbar for ${moduleLabel} - ${subLabel} at constructed URL: ${constructedPageUrl}`
                );
                buttonSelectors = getToolbarButtonSelectors(iframe);
              } else {
                console.log(
                  `No toolbar found for ${moduleLabel} - ${subLabel} at constructed URL: ${constructedPageUrl}`
                );
              }
            }
          } else {
            console.log(
              `URL appears correct, but no toolbar found for ${moduleLabel} - ${subLabel} at: ${submenuUrl}`
            );
          }
        }

        // Process any found toolbar buttons
        if (buttonSelectors && buttonSelectors.length > 0) {
          console.log(
            `Found ${buttonSelectors.length} toolbar buttons for ${moduleLabel} - ${subLabel}`
          );
          buttonSelectors.forEach((button) => {
            // Create a named action sequence for this button
            const actionName = `${moduleLabel} - ${subLabel} - ${button.name}`;

            // For disabled buttons, just add the name without actions
            if (button.disabled || button.skipActions) {
              actions.push({
                name: actionName,
                actions: [
                  // Just include the navigation to the page, but no button click
                  ...JSON.parse(JSON.stringify(submenuAction.actions)),
                ],
              });
            } else {
              // For enabled buttons, include the button click
              const actionsWithButton = JSON.parse(
                JSON.stringify(submenuAction.actions)
              );
              actionsWithButton.push(
                { type: "click", selector: button.selector },
                { type: "wait", duration: 2000 } // Fixed duration of 2000ms for all toolbar buttons
              );
              actions.push({
                name: actionName,
                actions: actionsWithButton,
              });
            }
          });
        } else {
          console.log(
            `No usable toolbar buttons found for ${moduleLabel} - ${subLabel}`
          );
        }
      } catch (toolbarError) {
        console.warn(
          `Error generating toolbar actions for ${moduleLabel} - ${subLabel}:`,
          toolbarError
        );
      }
    }

    if (hasSubSubmenu) {
      console.log(
        `Found sub-submenu for ${subLabel}, but not exploring it for now.`
      );
    }
  } catch (error) {
    console.warn("Error processing submenu item:", error);
  }
  return actions;
}

/**
 * Generate actions for a selected main menu item and its submenu.
 * @param {string} selectedModule - The selected main menu module name
 * @param {number} waitTime - Wait time between actions
 * @param {boolean} includeToolbarButtons - Whether to include toolbar button actions
 * @param {Object} urlContext - URL context object with project, module, page
 * @returns {Promise<Array>} - Array of action sequences
 */
export async function generateActionsForSelectedMainMenu(
  selectedModule,
  waitTime,
  includeToolbarButtons,
  urlContext
) {
  const iframe = UI.elements.iframe;
  const mainMenuItem = iframe.contentDocument.querySelector(
    `.menu-option[data-label="${selectedModule}"]`
  );
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
    urlParts: [],
  };
  const actionsForModule = await generateActionsForCurrentContext(
    newUrlContext,
    waitTime,
    includeToolbarButtons
  );
  return actionsForModule;
}

export default {
  generateContextAwareMenuActions,
  generateActionsForCurrentContext,
  generateActionsForSelectedMainMenu,
  processSubmenuItem,
};
