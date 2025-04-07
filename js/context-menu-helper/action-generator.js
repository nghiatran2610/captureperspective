// js/context-menu-helper/action-generator.js - Functions for generating action sequences

import UI from "../ui/index.js";
// ** FIX START: Use default import and prefix calls below **
import elementUtils from "./element-utils.js";
// ** FIX END **
import {
  waitForToolbar,
  getToolbarButtonSelectors,
} from "./toolbar-detector.js";
import {
  parseUrlContext,
  constructPageUrl, // Keep this if needed for toolbar URL correction
} from "./url-context-parser.js";

/**
 * Generate context-aware menu actions based on the text content of a specific menu item.
 * @param {string} currentUrl - The current URL (used for context, less critical now).
 * @param {number} [waitTime=2000] - Wait time after each click.
 * @param {boolean} [includeToolbarButtons=true] - Whether to include toolbar actions.
 * @param {string} specificMenuItemText - The text of the specific menu item to process.
 * @returns {Promise<Array>} - Array of action sequences.
 */
export function generateContextAwareMenuActions(
  currentUrl, // Keep for context parsing if needed elsewhere, but not for finding the item
  waitTime = 2000,
  includeToolbarButtons = true,
  specificMenuItemText // Changed parameter name
) {
  return new Promise(async (resolve, reject) => {
    try {
      console.log(
        `Generating actions for menu item text: "${specificMenuItemText}"`
      );
      const iframe = UI.elements.iframe;
      if (!iframe.contentDocument) {
        UI.utils.showStatus("Error: Iframe document not accessible.", true);
        return reject("iframe not loaded or accessible");
      }
      await elementUtils.waitForIframeLoad(iframe); // Use prefix

      const urlContext = parseUrlContext(currentUrl); // Parse context for potential use (e.g., toolbar URL correction)

      // Find the specific main menu item by its text
      const mainMenuElements = elementUtils.findMenuElements(
        iframe.contentDocument
      ); // Use prefix
      const targetMenuItem = mainMenuElements.find(
        (item) => item.text === specificMenuItemText
      );

      if (!targetMenuItem) {
        UI.utils.showStatus(
          `Menu item "${specificMenuItemText}" not found in main menu.`,
          true
        );
        console.warn(
          `Could not find menu item with text: "${specificMenuItemText}". Available items:`,
          mainMenuElements.map((i) => i.text)
        );
        // Attempt to find ANY menu item if the specific one isn't found initially, might be a timing issue
        const allMenuItems = iframe.contentDocument.querySelectorAll(
          ".menu-option, [class*='menu-item']"
        );
        console.log("All potential menu items found:", allMenuItems.length);
        allMenuItems.forEach((el) =>
          console.log(" - ", elementUtils.getElementText(el))
        ); // Use prefix

        return resolve([]); // Resolve with empty if not found
      }

      console.log(`Found target menu item: "${targetMenuItem.text}"`);

      const actionSequences = await generateActionsForSelectedMainMenu(
        targetMenuItem.text, // Pass the text identifier
        waitTime,
        includeToolbarButtons,
        urlContext // Pass context for potential toolbar URL construction
      );

      console.log("Generated action sequences:", actionSequences.length);
      if (actionSequences.length === 0) {
        // Check if it was just the main item click
        const mainItemAction = {
          name: targetMenuItem.text,
          actions: [
            {
              type: "click",
              selector: elementUtils.getElementXPathByText(
                "div",
                targetMenuItem.text,
                "menu-option"
              ),
            }, // Use prefix
            { type: "wait", duration: waitTime },
          ],
        };
        console.log(
          "No submenu actions generated, returning main item action only."
        );
        resolve([mainItemAction]); // Return at least the action for the main item itself
      } else {
        resolve(actionSequences);
      }
    } catch (error) {
      console.error(
        `Error generating context-aware menu actions for "${specificMenuItemText}":`,
        error
      );
      UI.utils.showStatus(
        `Error generating actions for "${specificMenuItemText}": ${error.message}`,
        true
      );
      reject(error);
    }
  });
}

/**
 * Generate actions for the current context (module/page level) from the selected main menu item text.
 * This function might be less relevant now if generateActionsForSelectedMainMenu handles everything.
 * Kept for potential broader context generation if needed in the future.
 * @param {Object} urlContext - URL context object (less critical now).
 * @param {number} waitTime - Wait time between actions.
 * @param {boolean} includeToolbarButtons - Whether to include toolbar button actions.
 * @returns {Promise<Array>} - Array of action sequences.
 */
export async function generateActionsForCurrentContext(
  urlContext, // Context might still be useful for URL construction later
  waitTime,
  includeToolbarButtons = false
) {
  // This function might need refactoring or removal if generateActionsForSelectedMainMenu
  // covers the primary use case driven by ui-controls.
  // If kept, it needs similar updates to use text identifiers and XPath.
  console.warn(
    "generateActionsForCurrentContext might need updates to use text identifiers if still used."
  );
  const iframe = UI.elements.iframe;
  let actions = [];

  // Example: Find module by text if urlContext.module exists
  if (urlContext.module) {
    const moduleMenuItem = elementUtils
      .findMenuElements(iframe.contentDocument)
      .find((item) => item.text === urlContext.module); // Use prefix
    if (moduleMenuItem) {
      // ... rest of the logic using text and XPath ...
      console.log("Processing based on URL context module:", urlContext.module);
      // This part requires significant rewrite to match generateActionsForSelectedMainMenu logic
      // For now, let's assume it delegates or is replaced.
    }
  } else {
    // Generate for top-level items (example, limit to 5)
    const mainMenuItems = elementUtils.findMenuElements(iframe.contentDocument); // Use prefix
    for (const item of mainMenuItems.slice(0, 5)) {
      const itemText = item.text;
      const itemSelector = elementUtils.getElementXPathByText(
        "div",
        itemText,
        "menu-option"
      ); // Use prefix
      actions.push({
        name: itemText,
        actions: [
          { type: "click", selector: itemSelector },
          { type: "wait", duration: waitTime },
        ],
      });
      // Add toolbar logic here if needed, similar to processSubmenuItem
    }
  }

  return actions;
}

/**
 * Process a submenu item (identified by its element) and generate actions for it.
 * Uses text content for naming and XPath for selectors.
 * @param {Element} subItemElement - Submenu DOM element.
 * @param {string} moduleText - Parent module's text content.
 * @param {number} waitTime - Wait time between actions.
 * @param {HTMLIFrameElement} iframe - The iframe element.
 * @param {boolean} includeToolbarButtons - Whether to include toolbar button actions.
 * @returns {Promise<Array>} - Array of action sequences.
 */
export async function processSubmenuItem(
  subItemElement, // Pass the element directly
  moduleText,
  waitTime,
  iframe,
  includeToolbarButtons
) {
  const actions = [];
  try {
    if (subItemElement.classList.contains("item-invisible")) {
      console.log(`Skipping invisible submenu item in ${moduleText}`);
      return actions;
    }
    const subItemText = elementUtils.getElementText(subItemElement); // Use prefix
    if (
      !subItemText ||
      subItemElement.classList.contains("menu-header") ||
      subItemElement.classList.contains("menu-back-action")
    ) {
      return actions; // Skip if no text or is header/back
    }

    console.log(`Processing submenu item: ${moduleText} - ${subItemText}`);

    // Generate selectors using text
    const moduleSelector = elementUtils.getElementXPathByText(
      "div",
      moduleText,
      "menu-option"
    ); // Use prefix
    const subItemSelector = elementUtils.getElementXPathByText(
      "div",
      subItemText,
      "menu-option"
    ); // Use prefix // Assume div, adjust if needed

    const submenuAction = {
      name: `${moduleText} - ${subItemText}`,
      actions: [
        { type: "click", selector: moduleSelector },
        { type: "wait", duration: waitTime / 2 },
        { type: "click", selector: subItemSelector }, // Use text-based XPath
        { type: "wait", duration: waitTime },
      ],
    };
    actions.push(submenuAction); // Add the base action for navigating to the submenu item

    // --- Toolbar Button Logic (using text-based navigation) ---
    if (includeToolbarButtons) {
      try {
        console.log(
          `===== PROCESSING SUBMENU TOOLBAR: ${moduleText} - ${subItemText} =====`
        );
        const originalUrl = iframe.contentWindow.location.href;
        console.log(`Original URL before submenu navigation: ${originalUrl}`);

        // Navigate using the generated selectors
        const moduleElement = iframe.contentDocument.evaluate(
          moduleSelector,
          iframe.contentDocument,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        ).singleNodeValue;
        if (moduleElement) moduleElement.click();
        await new Promise((r) => setTimeout(r, waitTime / 2));

        const subElement = iframe.contentDocument.evaluate(
          subItemSelector,
          iframe.contentDocument,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        ).singleNodeValue;
        if (subElement) subElement.click();
        await new Promise((r) => setTimeout(r, waitTime)); // Wait for navigation
        await elementUtils.waitForIframeLoad(iframe); // Use prefix // Wait for page load

        const submenuUrl = iframe.contentWindow.location.href;
        console.log(`Successfully navigated to submenu URL: ${submenuUrl}`);

        console.log(`Detecting toolbar on submenu page: ${submenuUrl}`);
        const toolbar = await waitForToolbar(iframe);
        let buttonSelectors = [];

        if (toolbar) {
          console.log(
            `Found toolbar for ${moduleText} - ${subItemText} at URL: ${submenuUrl}`
          );
          buttonSelectors = getToolbarButtonSelectors(iframe); // This function needs no changes if it returns robust selectors (like XPath or data-component-path)
        } else {
          console.log(
            `No toolbar found for ${moduleText} - ${subItemText} at URL: ${submenuUrl}`
          );
          // Optional: Try URL construction/correction if needed, similar to previous version
          // const urlContext = parseUrlContext(originalUrl);
          // const constructedUrl = constructPageUrl(urlContext.project, moduleText, subItemText);
          // ... logic to load constructedUrl and check toolbar again ...
        }

        // Process found toolbar buttons
        if (buttonSelectors && buttonSelectors.length > 0) {
          console.log(
            `Found ${buttonSelectors.length} toolbar buttons for ${moduleText} - ${subItemText}`
          );
          buttonSelectors.forEach((button) => {
            const actionName = `${moduleText} - ${subItemText} - ${button.name}`;

            if (button.disabled || button.skipActions) {
              // Add action sequence just for navigation, no button click
              actions.push({
                name: actionName,
                actions: JSON.parse(JSON.stringify(submenuAction.actions)), // Copy base nav actions
              });
            } else {
              // Add action sequence including the button click
              const actionsWithButton = JSON.parse(
                JSON.stringify(submenuAction.actions)
              );
              actionsWithButton.push(
                { type: "click", selector: button.selector }, // Use the selector from getToolbarButtonSelectors
                { type: "wait", duration: 2000 }
              );
              actions.push({ name: actionName, actions: actionsWithButton });
            }
          });
        } else {
          console.log(
            `No usable toolbar buttons found for ${moduleText} - ${subItemText}`
          );
        }

        // --- IMPORTANT: Navigate back to the original state (main menu) ---
        // This is crucial for the loop in ui-controls to work correctly
        console.log(
          `Attempting to navigate back to original state from ${submenuUrl}`
        );
        iframe.src = originalUrl; // Go back to the URL before processing this item
        await elementUtils.waitForIframeLoad(iframe); // Use prefix
        await new Promise((r) => setTimeout(r, waitTime / 2)); // Allow main menu to settle
        console.log("Navigated back to original state.");
      } catch (toolbarError) {
        console.warn(
          `Error generating toolbar actions for ${moduleText} - ${subItemText}:`,
          toolbarError
        );
        // Attempt to navigate back even if toolbar detection failed
        try {
          const originalUrl = iframe.contentWindow.location.href; // May have changed
          const urlContext = parseUrlContext(originalUrl);
          const mainMenuUrl = `${urlContext.urlParts
            .slice(0, urlContext.urlParts.indexOf("client") + 2)
            .join("/")}/${urlContext.project}`; // Basic main menu URL guess
          console.warn(
            `Toolbar error, attempting basic nav back to ${mainMenuUrl}`
          );
          iframe.src = mainMenuUrl;
          await elementUtils.waitForIframeLoad(iframe); // Use prefix
          await new Promise((r) => setTimeout(r, waitTime));
        } catch (navBackError) {
          console.error(
            "Failed to navigate back after toolbar error",
            navBackError
          );
        }
      }
    }

    // Check for sub-submenu (visual indicator) - logic remains the same
    const hasSubSubmenu =
      subItemElement.querySelector(
        '.nav-icon svg[data-icon*="chevron_right"]'
      ) !== null;
    if (hasSubSubmenu) {
      console.log(
        `Found sub-submenu for ${subItemText}, but not exploring it.`
      );
      // Add logic here if sub-submenus need processing
    }
  } catch (error) {
    console.warn(`Error processing submenu item: ${error.message}`, error);
  }
  return actions;
}

/**
 * Generate actions for a selected main menu item (identified by text) and its submenu.
 * @param {string} selectedModuleText - The text of the selected main menu item.
 * @param {number} waitTime - Wait time between actions.
 * @param {boolean} includeToolbarButtons - Whether to include toolbar button actions.
 * @param {Object} urlContext - URL context object (used for potential URL construction).
 * @returns {Promise<Array>} - Array of action sequences.
 */
export async function generateActionsForSelectedMainMenu(
  selectedModuleText,
  waitTime,
  includeToolbarButtons,
  urlContext // Keep for potential URL construction
) {
  const iframe = UI.elements.iframe;
  let allActions = [];

  // 1. Find the main menu item element using its text
  const moduleSelector = elementUtils.getElementXPathByText(
    "div",
    selectedModuleText,
    "menu-option"
  ); // Use prefix
  const mainMenuItemElement = iframe.contentDocument.evaluate(
    moduleSelector,
    iframe.contentDocument,
    null,
    XPathResult.FIRST_ORDERED_NODE_TYPE,
    null
  ).singleNodeValue;

  if (!mainMenuItemElement) {
    UI.utils.showStatus(
      `Main menu item "${selectedModuleText}" could not be located via XPath.`,
      true
    );
    console.error(`Failed to find element with XPath: ${moduleSelector}`);
    return []; // Return empty if element not found
  }

  // 2. Add the action for clicking the main menu item itself
  // Note: This action might be duplicated if the item has no submenu,
  // but processSubmenuItem handles adding toolbar actions *after* this click.
  const mainClickAction = {
    name: selectedModuleText,
    actions: [
      { type: "click", selector: moduleSelector },
      { type: "wait", duration: waitTime },
    ],
  };
  // Don't add mainClickAction here yet, add it ONLY if no submenu processing happens.

  // 3. Check if it has a submenu
  const hasSubmenu =
    mainMenuItemElement.querySelector(
      '.nav-icon svg[data-icon*="chevron_right"]'
    ) !== null;

  if (hasSubmenu) {
    console.log(`${selectedModuleText} has submenu, opening it...`);
    mainMenuItemElement.click(); // Click to open submenu
    await new Promise((r) => setTimeout(r, waitTime / 2)); // Wait for submenu to potentially open

    // 4. Wait for and process submenu items
    const submenuItemElements = await elementUtils.waitForSubmenu(iframe); // Use prefix
    console.log(
      `Found ${submenuItemElements.length} submenu items under ${selectedModuleText}`
    );

    if (submenuItemElements.length > 0) {
      // Process each submenu item
      for (const subItemElement of submenuItemElements) {
        const submenuActions = await processSubmenuItem(
          subItemElement,
          selectedModuleText, // Pass parent text
          waitTime,
          iframe,
          includeToolbarButtons
        );
        if (submenuActions.length > 0) {
          allActions = allActions.concat(submenuActions);
        }
      }

      // 5. Navigation back should now happen *inside* processSubmenuItem after toolbar check
    } else {
      console.log(
        `No submenu items found for ${selectedModuleText} after clicking.`
      );
      // If no submenu items were found, add the action for the main click itself
      allActions.push(mainClickAction);
    }
  } else {
    console.log(`${selectedModuleText} does not have a submenu.`);
    // If no submenu, add the action for the main click itself
    allActions.push(mainClickAction);

    // Optionally, check for toolbar buttons directly on the main item's page
    if (includeToolbarButtons) {
      console.log(
        `Checking for toolbar on main item page: ${selectedModuleText}`
      );
      mainMenuItemElement.click(); // Navigate to the page
      await new Promise((r) => setTimeout(r, waitTime));
      await elementUtils.waitForIframeLoad(iframe); // Use prefix
      const mainItemUrl = iframe.contentWindow.location.href;
      const toolbar = await waitForToolbar(iframe);
      if (toolbar) {
        const buttonSelectors = getToolbarButtonSelectors(iframe);
        if (buttonSelectors && buttonSelectors.length > 0) {
          buttonSelectors.forEach((button) => {
            const actionName = `${selectedModuleText} - ${button.name}`;
            if (!button.disabled && !button.skipActions) {
              const actionsWithButton = JSON.parse(
                JSON.stringify(mainClickAction.actions)
              ); // Start with main click
              actionsWithButton.push(
                { type: "click", selector: button.selector },
                { type: "wait", duration: 2000 }
              );
              // Replace the base action with the toolbar-included one? Or add separately?
              // Adding separately seems clearer.
              allActions.push({ name: actionName, actions: actionsWithButton });
            } else {
              // Add action for disabled button (just navigation)
              allActions.push({
                name: actionName,
                actions: JSON.parse(JSON.stringify(mainClickAction.actions)),
              });
            }
          });
          // Remove the basic mainClickAction if we added toolbar actions for it
          const mainActionIndex = allActions.findIndex(
            (a) => a.name === selectedModuleText
          );
          if (mainActionIndex > -1 && allActions.length > 1) {
            // Only remove if toolbar actions were added
            allActions.splice(mainActionIndex, 1);
          }
        }
      }
      // Navigate back after checking toolbar
      const originalUrl =
        urlContext?.urlParts?.join("/") || iframe.contentWindow.location.origin; // Need a way back
      iframe.src = originalUrl; // Attempt basic navigation back
      await elementUtils.waitForIframeLoad(iframe); // Use prefix
    }
  }

  return allActions;
}

export default {
  generateContextAwareMenuActions,
  generateActionsForCurrentContext, // Keep or remove based on usage
  generateActionsForSelectedMainMenu,
  processSubmenuItem,
};
