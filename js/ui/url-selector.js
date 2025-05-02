// perspective_capture/js/ui/url-selector.js
import { elements } from "./elements.js";
import { utils } from "./utils.js";
import urlFetcher from "../url-fetcher.js"; // Needed for getSelectedUrlsForCapture context
import * as events from "../events.js";

export const urlSelector = {
  selectedUrls: new Set(),       // Stores paths of selected URLs
  toggleSelectionBtn: null,      // Button for Select/Deselect All
  container: null,               // Reference to the main #urlSelectorContainer div
  categoriesContainer: null,     // Reference to #urlCategoriesContainer where list is rendered
  searchInput: null,             // Reference to #urlSearch input
  selectionCounter: null,        // Reference to #selectionCounter div
  originalUrlList: null,         // Reference to original <textarea> (if replaced, for fallback)
  originalUrlListParent: null,   // Reference to original parent of textarea

  /**
   * Initialize the URL selector UI. Creates the container if it doesn't exist.
   * Sets up internal element references and attaches event listeners once.
   * @returns {Promise<void>} Resolves when initialization is complete or fails gracefully.
   */
  async initialize() {
      // Use try-catch for robust initialization
      try {
        // Find the main container element by ID
        this.container = document.getElementById("urlSelectorContainer");

        // If the container doesn't exist in the DOM, create it
        if (!this.container) {
          console.log("URL Selector container not found, creating it...");
          this.createSelectorContainer();
          // createSelectorContainer now sets internal refs like this.categoriesContainer etc.
        } else {
           // If container already exists, ensure internal references are up-to-date
           console.log("URL Selector container found, ensuring references are set.");
           this.categoriesContainer = document.getElementById("urlCategoriesContainer");
           this.searchInput = document.getElementById("urlSearch");
           this.selectionCounter = document.getElementById("selectionCounter");
           this.toggleSelectionBtn = document.getElementById("toggleSelectionBtn");
        }

         // Show initial placeholder text if the categories area is empty
         if (this.categoriesContainer && !this.categoriesContainer.hasChildNodes()) {
             this.categoriesContainer.innerHTML = `<div class="url-selector-initial"><p>Select a page source option above.</p></div>`;
         }

         // Attach event listeners only once using a data attribute as a flag
         if (this.container && !this.container.dataset.listenersAttached) {
           this.setupEventListeners();
           this.container.dataset.listenersAttached = "true"; // Mark listeners as attached
         } else if (this.container) {
             console.log("URL Selector listeners already attached.");
         } else {
             console.error("URL Selector container reference is null after init/create attempt.");
         }

      } catch (error) {
            // Log initialization errors and try to show a fallback
            console.error("Failed to initialize URL selector:", error);
            utils.showStatus(`Failed to initialize URL selector: ${error.message}`, true);
            if (typeof this.showFallbackUI === 'function') {
                 this.showFallbackUI();
            }
      }
  },

  /**
   * Creates the main container (#urlSelectorContainer) and its internal structure
   * (toolbar, categories area). Replaces the #urlSelectorPlaceholder div.
   */
  createSelectorContainer() {
    // Find the placeholder div where the selector UI should be inserted
    const placeholder = document.getElementById('urlSelectorPlaceholder');
    if (!placeholder || !placeholder.parentElement) {
        console.error("#urlSelectorPlaceholder or its parent not found. Cannot create selector UI.");
        // Optionally, try finding the old #urlList as a fallback insertion point
        const urlList = document.getElementById("urlList");
        const parentElement = urlList?.parentElement;
        if (!parentElement) {
             console.error("Fallback: Cannot find parent for old #urlList either. Aborting UI creation.");
             return; // Cannot proceed without a parent
        }
        console.warn("Using #urlList parent as insertion point (placeholder not found).");
        // If using fallback, make sure to handle potential replacement later
    }

    const parentElement = placeholder?.parentElement || urlList?.parentElement;

    // Create the main container div
    this.container = document.createElement("div");
    this.container.id = "urlSelectorContainer";
    this.container.className = "url-selector-container";
    // Start hidden; app.js logic will show it when appropriate
    this.container.style.display = 'none';


    // --- Toolbar ---
    const toolbar = document.createElement("div");
    toolbar.className = "url-selector-toolbar";

        const searchInput = document.createElement("input");
        searchInput.type = "text"; searchInput.placeholder = "Search pages...";
        searchInput.className = "url-selector-search"; searchInput.id = "urlSearch";
        toolbar.appendChild(searchInput);

        const actionsContainer = document.createElement("div");
        actionsContainer.className = "url-selector-actions";

            const toggleSelectionBtn = document.createElement("button");
            toggleSelectionBtn.textContent = "Select All";
            toggleSelectionBtn.className = "btn btn-small toggle-select-btn";
            toggleSelectionBtn.id = "toggleSelectionBtn";
            actionsContainer.appendChild(toggleSelectionBtn);

            const selectionCounter = document.createElement("div");
            selectionCounter.className = "selection-counter";
            selectionCounter.id = "selectionCounter";
            selectionCounter.textContent = "0 selected";
            actionsContainer.appendChild(selectionCounter);

        toolbar.appendChild(actionsContainer);
    this.container.appendChild(toolbar);


    // --- Categories Area ---
    const categoriesContainer = document.createElement("div");
    categoriesContainer.className = "url-categories-container";
    categoriesContainer.id = "urlCategoriesContainer"; // Need this ID
    this.container.appendChild(categoriesContainer);


    // --- Replace Placeholder/Textarea ---
    if (placeholder && placeholder.parentElement === parentElement) {
        parentElement.replaceChild(this.container, placeholder);
    } else if (urlList && urlList.parentElement === parentElement) {
        // Fallback if placeholder missing
        parentElement.replaceChild(this.container, urlList);
        this.originalUrlList = urlList; // Keep ref for potential fallback
        this.originalUrlListParent = parentElement;
    } else {
         console.error("Cannot find suitable element to replace. Appending selector UI.");
         parentElement.appendChild(this.container); // Last resort: append
    }


    // Store references to internal elements
    this.categoriesContainer = categoriesContainer;
    this.searchInput = searchInput;
    this.selectionCounter = selectionCounter;
    this.toggleSelectionBtn = toggleSelectionBtn;

    // Disable controls initially
    this.toggleSelectionBtn.disabled = true;
    this.searchInput.disabled = true;
  },

  /**
   * Displays a loading message within the URL selector categories area.
   * @param {string} [message="Loading available pages..."] - Optional message.
   */
  showLoadingState(message = "Loading available pages...") {
    if (!this.container) this.initialize(); // Ensure UI structure exists
    if (!this.categoriesContainer) {
        console.error("Cannot show loading state: Categories container not found.");
        return;
    }

    this.container.style.display = ''; // Make the main container visible
    this.categoriesContainer.innerHTML = `
      <div class="url-selector-loading">
        <div class="loading-spinner"></div>
        <p>${message}</p>
      </div>
    `;
    // Disable controls and clear selection state
    if (this.searchInput) this.searchInput.disabled = true;
    if (this.toggleSelectionBtn) this.toggleSelectionBtn.disabled = true;
    this.selectedUrls.clear();
    this.updateSelectionCounter();
    this.updateCaptureButtonState(); // Notify app to disable main capture button
  },

   /**
    * Clears the rendered URL list, resets controls and internal state, and hides the container.
    */
   clearRenderedUrls() {
        if (!this.container) {
            console.log("Clear request ignored: URL Selector not initialized.");
            return; // Do nothing if not initialized
        }
        console.log("Clearing rendered URLs and resetting selector state.");

        // Clear the visual list area and show placeholder text
        if (this.categoriesContainer) {
            this.categoriesContainer.innerHTML = `<div class="url-selector-initial"><p>Select a page source option above.</p></div>`;
        }
        // Reset internal selection
        this.selectedUrls.clear();
        // Reset UI controls within the selector
        if(this.searchInput) {
            this.searchInput.value = '';
            this.searchInput.disabled = true;
        }
        if (this.toggleSelectionBtn) {
            this.toggleSelectionBtn.disabled = true;
            this.toggleSelectionBtn.textContent = "Select All"; // Reset text
            this.toggleSelectionBtn.classList.remove("clear-mode");
        }
        this.updateSelectionCounter(); // Updates counter to "0 selected"
        this.updateCaptureButtonState(); // Notifies app, likely disables capture button

        // Hide the main URL selector container
        this.container.style.display = 'none';
   },


   /**
    * Attempts to restore the original manual URL input textarea if the selector fails or is removed.
    */
    showFallbackUI() {
        console.warn("Attempting to show fallback UI (manual textarea).");
        if (!this.container?.parentElement && !this.originalUrlListParent) {
            console.error("Cannot show fallback UI: No parent element reference available.");
            return;
        }
        const parentElement = this.container?.parentElement || this.originalUrlListParent;

        // Remove the selector container if it exists
        if (this.container && this.container.parentElement === parentElement) {
            parentElement.removeChild(this.container);
        }

        // Restore the original textarea if possible
        if (this.originalUrlList && this.originalUrlListParent === parentElement) {
            // Append is generally safer than trying to insert at a specific point
            parentElement.appendChild(this.originalUrlList);
            this.originalUrlList.style.display = "block"; // Make it visible
            console.log("Restored original URL list textarea.");

            // Update the main title to reflect manual input mode
            const urlInputTitle = document.getElementById('urlInputTitle');
            if (urlInputTitle) { urlInputTitle.textContent = "Enter URLs Manually (Fallback)"; }

        } else {
            // If original cannot be restored, show an error message
            console.error("Could not restore original textarea. Fallback UI incomplete.");
            const fallbackMsg = document.createElement('p');
            fallbackMsg.textContent = "Error: Failed to load pages automatically. Manual input area could not be restored.";
            fallbackMsg.style.color = 'red';
            parentElement.appendChild(fallbackMsg);
        }
        // Clear internal state related to the dynamic selector
        this.cleanup(); // Call cleanup to clear references
    },

    /**
     * Cleans up the URL selector UI, removes container, and clears state.
     */
    cleanup() {
        console.log("Cleaning up URL Selector.");
        this.clearRenderedUrls(); // Clear list, reset state, hide container first

         // Remove the main container from the DOM if it exists and has a parent
         if (this.container && this.container.parentElement) {
             this.container.parentElement.removeChild(this.container);
         } else if (document.getElementById("urlSelectorContainer")) {
             // Attempt to find and remove if ref was lost
             document.getElementById("urlSelectorContainer").remove();
         }

        // Clear all internal references
        this.container = null;
        this.categoriesContainer = null;
        this.searchInput = null;
        this.selectionCounter = null;
        this.toggleSelectionBtn = null;
        this.originalUrlList = null;
        this.originalUrlListParent = null;
        // Note: Event listeners are assumed removed when the container is removed from DOM.
   },

  /**
   * Renders the categorized URLs into the #urlCategoriesContainer.
   * @param {Object} categorizedUrls - URLs organized by category { categoryName: [urlInfo, ...] }
   */
  renderUrlCategories(categorizedUrls) {
      // Ensure the UI is initialized before rendering
      if (!this.container || !this.categoriesContainer) {
           console.warn("Attempted to render URLs, but selector UI not ready. Trying to initialize...");
           this.initialize(); // Attempt initialization
           // Re-check after initialization attempt
           if (!this.container || !this.categoriesContainer) {
                console.error("Cannot render URLs: Selector UI initialization failed.");
                return;
           }
       }

       // Make the main selector container visible now that we have data
       this.container.style.display = '';

       // Handle case where no URLs are provided or found
       if (!categorizedUrls || Object.keys(categorizedUrls).length === 0) {
         this.categoriesContainer.innerHTML = "<p>No pages found or provided.</p>";
         // Disable controls as there's nothing to select/search
         if (this.searchInput) this.searchInput.disabled = true;
         if (this.toggleSelectionBtn) this.toggleSelectionBtn.disabled = true;
         this.selectedUrls.clear(); // Ensure selection state is clear
         this.updateSelectionCounter(); // Update counter and button text
         this.updateCaptureButtonState(); // Notify app to update main capture button
         return;
       }

       // Clear previous content (loading message or old list)
       this.categoriesContainer.innerHTML = "";
       // Sort categories alphabetically for consistent display order
       const sortedCategories = Object.keys(categorizedUrls).sort();

       // --- Create HTML for each category and its URLs ---
       sortedCategories.forEach((category) => {
            const urls = categorizedUrls[category];
            if (!urls || urls.length === 0) return; // Skip rendering empty categories

            const categorySection = document.createElement("div");
            categorySection.className = "url-category"; categorySection.dataset.category = category;

            const categoryHeader = document.createElement("div");
            categoryHeader.className = "url-category-header";
                const categoryCheckbox = document.createElement("input");
                categoryCheckbox.type = "checkbox"; categoryCheckbox.className = "category-checkbox";
                categoryCheckbox.dataset.category = category;
                categoryHeader.appendChild(categoryCheckbox);
                const categoryTitle = document.createElement("h3");
                categoryTitle.textContent = `${category} (${urls.length})`;
                categoryHeader.appendChild(categoryTitle);

            const urlsContainer = document.createElement("div");
            urlsContainer.className = "url-items-container";

            urls.forEach((url) => {
                const urlItem = document.createElement("div");
                urlItem.className = "url-item"; urlItem.dataset.path = url.path;
                    const urlCheckbox = document.createElement("input");
                    urlCheckbox.type = "checkbox"; urlCheckbox.className = "url-checkbox";
                    urlCheckbox.dataset.path = url.path;
                    urlCheckbox.checked = this.selectedUrls.has(url.path); // Preserve selection state
                    urlItem.appendChild(urlCheckbox);
                    const urlTitle = document.createElement("span");
                    urlTitle.className = "url-title"; urlTitle.textContent = url.title || url.path;
                    urlTitle.title = url.path; urlItem.appendChild(urlTitle);
                    const urlPath = document.createElement("span");
                    urlPath.className = "url-path"; urlPath.textContent = url.path;
                    urlItem.appendChild(urlPath);
                urlsContainer.appendChild(urlItem);
            });

            categorySection.appendChild(categoryHeader);
            categorySection.appendChild(urlsContainer);
            this.categoriesContainer.appendChild(categorySection);
       }); // --- End category loop ---

       // Enable controls now that URLs are rendered
       if (this.searchInput) this.searchInput.disabled = false;
       if (this.toggleSelectionBtn) this.toggleSelectionBtn.disabled = false;

       // Update checkbox states and counters based on current (potentially preserved) selection
       this.updateCategoryCheckboxes();
       this.updateSelectionCounter();
       this.updateCaptureButtonState();

       // Reset scroll position of the categories container
       this.categoriesContainer.scrollTop = 0;
       console.log("URL categories rendered.");
  },

  /** Sets up delegated event listeners for the URL selector UI */
   setupEventListeners() {
       // Ensure elements are ready before attaching listeners
       if (!this.container || !this.categoriesContainer || !this.searchInput || !this.toggleSelectionBtn) {
           console.warn("URL Selector elements not ready for event listeners setup.");
           return;
       }

       // --- Click Delegation on Categories Container ---
       this.categoriesContainer.addEventListener("click", (event) => {
         // Toggle URL checkbox if item area (not checkbox itself) is clicked
         const urlItem = event.target.closest(".url-item");
         if (urlItem && event.target.type !== 'checkbox') {
           const checkbox = urlItem.querySelector(".url-checkbox");
           if (checkbox) { checkbox.checked = !checkbox.checked; this.handleUrlSelection(checkbox); }
           event.stopPropagation(); return;
         }
         // Toggle Category checkbox if header area (not checkbox itself) is clicked
         const categoryHeader = event.target.closest(".url-category-header");
         if (categoryHeader && event.target.type !== 'checkbox') {
           const checkbox = categoryHeader.querySelector(".category-checkbox");
           if (checkbox) { checkbox.checked = !checkbox.checked; this.handleCategorySelection(checkbox); }
           event.stopPropagation();
         }
       });

       // --- Change Event Listener (for direct checkbox clicks) ---
       this.categoriesContainer.addEventListener("change", (event) => {
         if (event.target.classList.contains("url-checkbox")) { this.handleUrlSelection(event.target); }
         else if (event.target.classList.contains("category-checkbox")) { this.handleCategorySelection(event.target); }
       });

       // --- Search Input Listeners ---
       this.searchInput.addEventListener("input", (event) => { this.filterUrls(event.target.value); });
       this.searchInput.addEventListener("search", (event) => { this.filterUrls(event.target.value); }); // Handle clear button

       // --- Toggle Select/Deselect All Button Listener ---
       this.toggleSelectionBtn.addEventListener("click", () => { this.handleToggleSelection(); });

       console.log("URL Selector event listeners attached.");
   },

   /** Handles selection/deselection of an individual URL checkbox */
   handleUrlSelection(checkbox) {
       const path = checkbox.dataset.path; if (!path) return;
       if (checkbox.checked) { this.selectedUrls.add(path); }
       else { this.selectedUrls.delete(path); }
       this.updateCategoryCheckboxes(); this.updateSelectionCounter(); this.updateCaptureButtonState();
   },

   /** Handles selection/deselection of a category checkbox */
   handleCategorySelection(categoryCheckbox) {
       const category = categoryCheckbox.dataset.category; if (!category || !this.categoriesContainer) return;
       // Select only *visible* checkboxes within the category
       const urlCheckboxes = this.categoriesContainer.querySelectorAll(
         `.url-category[data-category="${category}"] .url-item:not([style*="display: none"]) .url-checkbox`
       );
       urlCheckboxes.forEach((urlCheckbox) => {
         urlCheckbox.checked = categoryCheckbox.checked;
         const path = urlCheckbox.dataset.path; if (!path) return;
         if (categoryCheckbox.checked) { this.selectedUrls.add(path); }
         else { this.selectedUrls.delete(path); }
       });
       this.updateSelectionCounter(); this.updateCaptureButtonState();
       // No need to call updateCategoryCheckboxes as we directly set the state
   },

   /** Updates category checkboxes (checked/indeterminate) based on individual URL selections */
   updateCategoryCheckboxes() {
      if (!this.categoriesContainer) return;
       const categories = this.categoriesContainer.querySelectorAll(".url-category");
       categories.forEach((category) => {
         const categoryCheckbox = category.querySelector(".category-checkbox"); if (!categoryCheckbox) return;
         // Check state based on *visible* items only
         const urlCheckboxes = category.querySelectorAll(".url-item:not([style*='display: none']) .url-checkbox");
         if (urlCheckboxes.length === 0) { categoryCheckbox.checked = false; categoryCheckbox.indeterminate = false; return; }
         const checkedCount = Array.from(urlCheckboxes).filter(cb => cb.checked).length;
         if (checkedCount === 0) { categoryCheckbox.checked = false; categoryCheckbox.indeterminate = false; }
         else if (checkedCount === urlCheckboxes.length) { categoryCheckbox.checked = true; categoryCheckbox.indeterminate = false; }
         else { categoryCheckbox.checked = false; categoryCheckbox.indeterminate = true; }
       });
   },

   /** Updates the "X selected" counter and the Select/Deselect All button state */
   updateSelectionCounter() {
       if (!this.selectionCounter || !this.toggleSelectionBtn || !this.categoriesContainer) return;
       const selectedCount = this.selectedUrls.size;
       this.selectionCounter.textContent = `${selectedCount} selected`;
       // Base state on *visible* items
       const totalVisibleUrls = this.categoriesContainer.querySelectorAll(
           '.url-item:not([style*="display: none"]) .url-checkbox'
       ).length;
       if (totalVisibleUrls === 0) { this.toggleSelectionBtn.disabled = true; this.toggleSelectionBtn.textContent = "Select All"; this.toggleSelectionBtn.classList.remove("clear-mode"); }
       else if (selectedCount === totalVisibleUrls && selectedCount > 0) { this.toggleSelectionBtn.disabled = false; this.toggleSelectionBtn.textContent = "Deselect All"; this.toggleSelectionBtn.classList.add("clear-mode"); }
       else { this.toggleSelectionBtn.disabled = false; this.toggleSelectionBtn.textContent = "Select All"; this.toggleSelectionBtn.classList.remove("clear-mode"); }
   },

   /** Emits an event to notify the main app to update the capture button state */
   updateCaptureButtonState() {
       events.emit("URL_SELECTION_CHANGED", {
         count: this.selectedUrls.size,
         selectedUrls: Array.from(this.selectedUrls),
       });
   },

   /** Filters the displayed URLs based on the search term */
   filterUrls(searchTerm) {
      if (!this.categoriesContainer) return;
       const existingNoResults = this.categoriesContainer.querySelector(".no-results-message");
       if (existingNoResults) existingNoResults.remove();
       const term = searchTerm.toLowerCase().trim();
       let visibleCount = 0;
       this.categoriesContainer.querySelectorAll(".url-item").forEach((item) => {
           const path = (item.dataset.path || "").toLowerCase();
           const title = (item.querySelector(".url-title")?.textContent || "").toLowerCase();
           const isMatch = !term || path.includes(term) || title.includes(term);
           item.style.display = isMatch ? "" : "none";
           if (isMatch) visibleCount++;
       });
       this.updateCategoryVisibility(); // Hide/show empty categories
       this.updateCategoryCheckboxes(); // Update parent checkbox states
       this.updateSelectionCounter(); // Update counter and Select All button based on visible items
        // Display "No results" message if needed
       if (term && visibleCount === 0 && this.categoriesContainer) {
            const noResultsMessage = document.createElement("div");
            noResultsMessage.className = "no-results-message";
            noResultsMessage.textContent = "No matching URLs found.";
            this.categoriesContainer.appendChild(noResultsMessage);
        }
   },

   /** Updates category visibility and header counts based on visible filtered items */
   updateCategoryVisibility() {
      if (!this.categoriesContainer) return;
       const categories = this.categoriesContainer.querySelectorAll(".url-category");
       categories.forEach((category) => {
         const visibleItemsCount = Array.from(category.querySelectorAll(".url-item")).filter(item => item.style.display !== "none").length;
         // Hide the entire category section if no items within it are visible
         category.style.display = visibleItemsCount === 0 ? "none" : "";
          // Update category header count (optional: show filtered count)
          const categoryName = category.dataset.category;
          const totalCountInCategory = urlFetcher?.categorizedUrls?.[categoryName]?.length || 0; // Get total from fetcher
          const categoryTitle = category.querySelector(".url-category-header h3");
           if (categoryTitle) {
               const searchTerm = this.searchInput?.value.trim() || "";
               // Show "X of Y" only when filtering and not all items are shown
               if (searchTerm && visibleItemsCount !== totalCountInCategory && totalCountInCategory > 0) {
                    categoryTitle.textContent = `${categoryName} (${visibleItemsCount} of ${totalCountInCategory})`;
               } else if (totalCountInCategory > 0) {
                    categoryTitle.textContent = `${categoryName} (${totalCountInCategory})`; // Show total count normally
               } else {
                    categoryTitle.textContent = categoryName; // Just name if somehow empty
               }
           }
       });
   },

   /** Selects all *visible* URLs */
   selectAll() {
      if (!this.categoriesContainer) return;
       const visibleCheckboxes = Array.from(this.categoriesContainer.querySelectorAll(".url-item"))
         .filter((item) => item.style.display !== "none") // Only visible items
         .map((item) => item.querySelector(".url-checkbox"));

       visibleCheckboxes.forEach((checkbox) => {
          if (checkbox && !checkbox.checked) { // Check only if not already checked
            checkbox.checked = true;
            const path = checkbox.dataset.path; if (path) this.selectedUrls.add(path);
          }
       });
       this.updateCategoryCheckboxes(); this.updateSelectionCounter(); this.updateCaptureButtonState();
   },

   /** Clears selection for all URLs (visible or not) */
   clearSelection() {
      if (!this.categoriesContainer) return;
       this.categoriesContainer.querySelectorAll(".url-checkbox").forEach((checkbox) => {
            if (checkbox.checked) { checkbox.checked = false; } // Uncheck if checked
       });
       this.selectedUrls.clear(); // Clear the selection set
       this.updateCategoryCheckboxes(); this.updateSelectionCounter(); this.updateCaptureButtonState();
   },

   /** Handles click on the Select/Deselect All toggle button */
   handleToggleSelection() {
       if (!this.toggleSelectionBtn || !this.categoriesContainer) return;
       // Determine action based on current state relative to *visible* items
       const selectedCount = this.selectedUrls.size;
       const totalVisibleUrls = this.categoriesContainer.querySelectorAll(
           '.url-item:not([style*="display: none"]) .url-checkbox'
       ).length;

       if (totalVisibleUrls === 0) return; // Do nothing if no items are visible

       if (selectedCount === totalVisibleUrls) {
           this.clearSelection(); // If all visible are selected, clear selection
       } else {
           this.selectAll(); // Otherwise, select all visible
       }
   },

   /** Generates full URLs for the currently selected paths using urlFetcher */
   getSelectedUrlsForCapture() {
      if (!urlFetcher || typeof urlFetcher.generateFullUrls !== 'function') {
          console.error("URL Fetcher not available for generating full URLs.");
          return [];
      }
      // Get the array of selected paths from the Set and generate full URLs
      return urlFetcher.generateFullUrls(Array.from(this.selectedUrls));
   },

};

export default urlSelector;