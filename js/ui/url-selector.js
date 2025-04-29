// js/ui/url-selector.js
import { elements } from "./elements.js";
import { utils } from "./utils.js";
import urlFetcher from "../url-fetcher.js";
import * as events from "../events.js";

export const urlSelector = {
  selectedUrls: new Set(),
  baseUrlInput: null, // Added reference

  /**
   * Initialize the URL selector UI
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      // Create URL selector container
      this.createSelectorContainer();

      // Show initial state - waiting for URLs to be fetched after login option selection
      this.categoriesContainer.innerHTML = `
        <div class="url-selector-initial">
          <p>Available pages will load here after selecting a login option.</p>
        </div>
      `;

      // Add event listeners for selection
      this.setupEventListeners();

    } catch (error) {
      console.error("Failed to initialize URL selector:", error);
      utils.showStatus(`Failed to initialize URL selector: ${error.message}`, true);

      // Show fallback textarea
      this.showFallbackUI();
    }
  },

  /**
   * Create the URL selector container
   */
  createSelectorContainer() {
    // Find URL list and its container
    const urlList = elements.urlList;
    const parentElement = urlList.parentElement;

    // Save reference to the original elements
    this.originalUrlList = urlList;
    this.originalUrlListParent = parentElement;
    this.urlHelpText = document.getElementById("urlHelpText");

    // Create container for the URL selector
    this.container = document.createElement("div");
    this.container.id = "urlSelectorContainer";
    this.container.className = "url-selector-container";

    // --- Base URL input is now moved to index.html and handled by app.js ---
    // --- Remove base URL input creation and fetch button ---
    // const baseUrlContainer = document.createElement("div"); ...
    // const baseUrlLabel = ...
    // this.baseUrlInput = document.createElement("input"); ... // Keep reference if needed
    // const updateUrlBtn = document.createElement("button"); ...
    // updateUrlBtn.addEventListener("click", ... ); // REMOVE LISTENER
    // REMOVE adding these to this.container

    // --- Keep Toolbar Creation ---
    const toolbar = document.createElement("div");
    toolbar.className = "url-selector-toolbar";

    // Add search box
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search pages...";
    searchInput.className = "url-selector-search";
    searchInput.id = "urlSearch";
    toolbar.appendChild(searchInput);

    // Add actions container
    const actionsContainer = document.createElement("div");
    actionsContainer.className = "url-selector-actions";

    // Add select all button
    const selectAllBtn = document.createElement("button");
    selectAllBtn.textContent = "Select All";
    selectAllBtn.className = "btn btn-small";
    selectAllBtn.id = "selectAllBtn";
    actionsContainer.appendChild(selectAllBtn);

    // Add clear selection button
    const clearSelectionBtn = document.createElement("button");
    clearSelectionBtn.textContent = "Clear Selection";
    clearSelectionBtn.className = "btn btn-small";
    clearSelectionBtn.id = "clearSelectionBtn";
    actionsContainer.appendChild(clearSelectionBtn);

    // Add selection counter
    const selectionCounter = document.createElement("div");
    selectionCounter.className = "selection-counter";
    selectionCounter.id = "selectionCounter";
    selectionCounter.textContent = "0 selected";
    actionsContainer.appendChild(selectionCounter);

    toolbar.appendChild(actionsContainer);
    this.container.appendChild(toolbar); // Add toolbar to container

    // Create URL categories container
    const categoriesContainer = document.createElement("div");
    categoriesContainer.className = "url-categories-container";
    categoriesContainer.id = "urlCategoriesContainer";
    this.container.appendChild(categoriesContainer);

    // Replace the original textarea with our container
    // Ensure parentElement is valid before replacing
     if (parentElement && urlList && urlList.parentNode === parentElement) {
        parentElement.replaceChild(this.container, urlList);
     } else if (parentElement) {
        // Fallback if urlList was already removed or structure changed
        parentElement.appendChild(this.container);
        console.warn("URL list textarea not found for replacement, appending URL selector.");
     } else {
         console.error("Parent element for URL list not found. Cannot add URL selector.");
         return; // Stop initialization if parent is missing
     }


    // Keep a reference to these elements
    // this.baseUrlInput = baseUrlInput; // Reference removed as it's outside now
    this.categoriesContainer = categoriesContainer;
    this.searchInput = searchInput;
    this.selectionCounter = selectionCounter;
    this.selectAllBtn = selectAllBtn;
    this.clearSelectionBtn = clearSelectionBtn;

    // Initially disable buttons and search until URLs are loaded
    this.selectAllBtn.disabled = true;
    this.clearSelectionBtn.disabled = true;
    this.searchInput.disabled = true;
  },

  /**
   * Show loading state while fetching URLs
   */
  showLoadingState() {
    if (!this.categoriesContainer) return; // Add guard clause
    this.categoriesContainer.innerHTML = `
      <div class="url-selector-loading">
        <div class="loading-spinner"></div>
        <p>Loading available pages...</p>
      </div>
    `;
    // Disable controls during load
    if (this.searchInput) this.searchInput.disabled = true;
    if (this.selectAllBtn) this.selectAllBtn.disabled = true;
    if (this.clearSelectionBtn) this.clearSelectionBtn.disabled = true;
  },

  /**
   * Show fallback text area when URL fetching fails
   */
  showFallbackUI() {
    if (!this.container || !this.container.parentElement) return;

    // Remove our container
    const parentElement = this.container.parentElement;
    parentElement.removeChild(this.container);

    // Restore original textarea
    if (this.originalUrlList) {
      parentElement.appendChild(this.originalUrlList);
      this.originalUrlList.style.display = "block"; // Make it visible

      // Update title
      if (elements.urlInputTitle) {
        elements.urlInputTitle.textContent =
          "Enter URLs to Capture (one per line)"; // Revert title
      }

      // Add a note about the failure
      const fallbackNote = document.createElement("div");
      fallbackNote.className = "help-text";
      fallbackNote.style.color = "#dc3545";
      fallbackNote.textContent =
        "Failed to load URLs from server. Please enter URLs manually.";
      parentElement.insertBefore(fallbackNote, this.originalUrlList);

       // Ensure the manual textarea is used for capture if fallback occurs
        UI.elements.urlList = this.originalUrlList; // Restore reference in UI elements
    }
  },

  /**
   * Clean up the URL selector
   */
  cleanup() {
    // Only perform cleanup if our container exists
    if (this.container && this.container.parentElement) {
      // Get the parent element that contains our container
      const parentElement = this.container.parentElement;

      // Remove our container
      parentElement.removeChild(this.container);

      // If we have a reference to the original textarea
      if (this.originalUrlList) {
        // Find the help text element to insert after
        const urlHelpText = document.getElementById("urlHelpText");

        if (urlHelpText && urlHelpText.parentElement) {
          // Insert the textarea right after the help text
          urlHelpText.parentElement.insertBefore(
            this.originalUrlList,
            urlHelpText.nextSibling
          );
        } else {
          // Fallback: just append to the parent
          parentElement.appendChild(this.originalUrlList);
        }

        // Make sure it's visible
        this.originalUrlList.style.display = "block";
      }
    }

    // Clear selected URLs
    this.selectedUrls.clear();

    // Clear references
    this.container = null;
    this.categoriesContainer = null;
    this.searchInput = null;
    this.selectionCounter = null;
    this.selectAllBtn = null;
    this.clearSelectionBtn = null;
  },

  /**
   * Render URL categories
   * @param {Object} categorizedUrls - URLs organized by category
   */
  renderUrlCategories(categorizedUrls) {
     if (!this.categoriesContainer) return; // Guard clause

    if (!categorizedUrls || Object.keys(categorizedUrls).length === 0) {
      this.categoriesContainer.innerHTML = "<p>No URLs available for the specified project.</p>";
      // Keep controls disabled
      if (this.searchInput) this.searchInput.disabled = true;
      if (this.selectAllBtn) this.selectAllBtn.disabled = true;
      if (this.clearSelectionBtn) this.clearSelectionBtn.disabled = true;
      return;
    }

    this.categoriesContainer.innerHTML = ""; // Clear previous content (like loading spinner)

    // Sort categories alphabetically
    const sortedCategories = Object.keys(categorizedUrls).sort();

    sortedCategories.forEach((category) => {
      const urls = categorizedUrls[category];

      // Create category section
      const categorySection = document.createElement("div");
      categorySection.className = "url-category";
      categorySection.dataset.category = category;

      // Create category header
      const categoryHeader = document.createElement("div");
      categoryHeader.className = "url-category-header";

      // Add category selection checkbox
      const categoryCheckbox = document.createElement("input");
      categoryCheckbox.type = "checkbox";
      categoryCheckbox.className = "category-checkbox";
      categoryCheckbox.dataset.category = category;
      categoryHeader.appendChild(categoryCheckbox);

      // Add category title with URL count
      const categoryTitle = document.createElement("h3");
      categoryTitle.textContent = `${category} (${urls.length})`;
      categoryHeader.appendChild(categoryTitle);

      // Add expand/collapse toggle
      const toggleIcon = document.createElement("span");
      toggleIcon.className = "toggle-icon";
      toggleIcon.innerHTML = "▼"; // Default to expanded
      toggleIcon.title = "Expand/collapse category";
      categoryHeader.appendChild(toggleIcon);

      // Create URLs container
      const urlsContainer = document.createElement("div");
      urlsContainer.className = "url-items-container"; // Default to expanded

      // Add URL items
      urls.forEach((url) => {
        const urlItem = document.createElement("div");
        urlItem.className = "url-item";
        urlItem.dataset.path = url.path; // Store path without base URL

        // Add URL checkbox
        const urlCheckbox = document.createElement("input");
        urlCheckbox.type = "checkbox";
        urlCheckbox.className = "url-checkbox";
        urlCheckbox.dataset.path = url.path; // Store path without base URL
        urlItem.appendChild(urlCheckbox);

        // Add URL title
        const urlTitle = document.createElement("span");
        urlTitle.className = "url-title";
        urlTitle.textContent = url.title || url.path; // Use title, fallback to path
        urlTitle.title = url.path; // Tooltip shows the path
        urlItem.appendChild(urlTitle);

        // Add URL path as subtitle (relative path)
        const urlPath = document.createElement("span");
        urlPath.className = "url-path";
        urlPath.textContent = url.path; // Show relative path
        urlItem.appendChild(urlPath);

        urlsContainer.appendChild(urlItem);
      });

      // Assemble category section
      categorySection.appendChild(categoryHeader);
      categorySection.appendChild(urlsContainer);

      this.categoriesContainer.appendChild(categorySection);
    });

    // Enable search and buttons now that we have URLs
    if (this.searchInput) this.searchInput.disabled = false;
    if (this.selectAllBtn) this.selectAllBtn.disabled = false;
    // clearSelectionBtn is enabled/disabled based on selection count later
  },

  /**
   * Set up event listeners for the URL selector
   */
  setupEventListeners() {
    // Ensure container exists before adding listeners
    if (!this.container) {
        console.warn("URL Selector container not ready, skipping event listeners setup.");
        return;
    }
    // Category toggle
    this.categoriesContainer.addEventListener("click", (event) => {
      const toggleIcon = event.target.closest(".toggle-icon");
      if (toggleIcon) {
        const category = toggleIcon.closest(".url-category");
        const urlsContainer = category.querySelector(".url-items-container");

        // Toggle expanded/collapsed state
        const isExpanded = !urlsContainer.classList.contains("collapsed");

        if (isExpanded) {
          urlsContainer.classList.add("collapsed");
          toggleIcon.innerHTML = "►";
        } else {
          urlsContainer.classList.remove("collapsed");
          toggleIcon.innerHTML = "▼";
        }

        event.stopPropagation();
        return;
      }

      // URL item selection (when clicking anywhere except checkbox)
      const urlItem = event.target.closest(".url-item");
      if (urlItem && !event.target.classList.contains("url-checkbox")) {
        const checkbox = urlItem.querySelector(".url-checkbox");
        checkbox.checked = !checkbox.checked;
        this.handleUrlSelection(checkbox);
        event.stopPropagation();
      }

      // Category header click (outside of checkbox and toggle)
      const categoryHeader = event.target.closest(".url-category-header");
      if (
        categoryHeader &&
        !event.target.classList.contains("category-checkbox") &&
        !event.target.classList.contains("toggle-icon")
      ) {
        const checkbox = categoryHeader.querySelector(".category-checkbox");
        checkbox.checked = !checkbox.checked;
        this.handleCategorySelection(checkbox);
        event.stopPropagation();
      }
    });

    // URL checkbox selection
    this.categoriesContainer.addEventListener("change", (event) => {
      if (event.target.classList.contains("url-checkbox")) {
        this.handleUrlSelection(event.target);
      } else if (event.target.classList.contains("category-checkbox")) {
        this.handleCategorySelection(event.target);
      }
    });

    // Search functionality
    this.searchInput.addEventListener("input", (event) => {
      this.filterUrls(event.target.value);
    });

    // Select all button
    this.selectAllBtn.addEventListener("click", () => {
      this.selectAll();
    });

    // Clear selection button
    this.clearSelectionBtn.addEventListener("click", () => {
      this.clearSelection();
    });
  },

  /**
   * Handle URL checkbox selection
   * @param {HTMLInputElement} checkbox - The checkbox that was toggled
   */
  handleUrlSelection(checkbox) {
    const path = checkbox.dataset.path;

    if (checkbox.checked) {
      this.selectedUrls.add(path);
    } else {
      this.selectedUrls.delete(path);
    }

    // Update category checkbox state
    this.updateCategoryCheckboxes();

    // Update selection counter
    this.updateSelectionCounter();

    // Update capture button state (emit event)
    this.updateCaptureButtonState();
  },

  /**
   * Handle category checkbox selection
   * @param {HTMLInputElement} checkbox - The category checkbox that was toggled
   */
  handleCategorySelection(checkbox) {
    const category = checkbox.dataset.category;
    const urlCheckboxes = this.categoriesContainer.querySelectorAll(
      `.url-category[data-category="${category}"] .url-checkbox`
    );

    // Set all URL checkboxes to the same state as the category checkbox
    urlCheckboxes.forEach((urlCheckbox) => {
      urlCheckbox.checked = checkbox.checked;
      const path = urlCheckbox.dataset.path;

      if (checkbox.checked) {
        this.selectedUrls.add(path);
      } else {
        this.selectedUrls.delete(path);
      }
    });

    // Update selection counter
    this.updateSelectionCounter();

    // Update capture button state
    this.updateCaptureButtonState();
  },

  /**
   * Update category checkboxes based on URL selections
   */
  updateCategoryCheckboxes() {
     if (!this.categoriesContainer) return; // Guard clause
    const categories =
      this.categoriesContainer.querySelectorAll(".url-category");

    categories.forEach((category) => {
      const categoryName = category.dataset.category;
      const categoryCheckbox = category.querySelector(".category-checkbox");
       if (!categoryCheckbox) return; // Skip if checkbox not found

      const urlCheckboxes = category.querySelectorAll(".url-checkbox");
      const checkedCount = Array.from(urlCheckboxes).filter(
        (cb) => cb.checked
      ).length;

      // Set category checkbox state based on URL selections
      if (checkedCount === 0) {
        categoryCheckbox.checked = false;
        categoryCheckbox.indeterminate = false;
      } else if (checkedCount === urlCheckboxes.length) {
        categoryCheckbox.checked = true;
        categoryCheckbox.indeterminate = false;
      } else {
        categoryCheckbox.checked = false;
        categoryCheckbox.indeterminate = true;
      }
    });
  },

  /**
   * Update the selection counter
   */
  updateSelectionCounter() {
     if (!this.selectionCounter) return; // Guard clause
    const count = this.selectedUrls.size;
    this.selectionCounter.textContent = `${count} selected`;

    // Update buttons state - check if elements exist first
    if (this.selectAllBtn) {
         this.selectAllBtn.disabled = count === urlFetcher.urlsList.length && urlFetcher.urlsList.length > 0; // Only disable if all are selected and list isn't empty
    }
     if (this.clearSelectionBtn) {
        this.clearSelectionBtn.disabled = count === 0;
     }
  },

  /**
   * Update the capture button state based on selections
   */
  updateCaptureButtonState() {
    const count = this.selectedUrls.size;

    // Emit event to notify app.js about selection changes
    events.emit("URL_SELECTION_CHANGED", {
      count,
      selectedUrls: Array.from(this.selectedUrls),
    });
  },

  /**
   * Filter URLs based on search term
   * @param {string} searchTerm - The search term
   */
  filterUrls(searchTerm) {
     if (!this.categoriesContainer) return; // Guard clause

    // Remove existing no results message if present
    if (this.noResultsMessage && this.noResultsMessage.parentNode) {
        this.noResultsMessage.remove();
        this.noResultsMessage = null;
    }

    const term = searchTerm.toLowerCase().trim();
    let visibleCount = 0;

    // Hide or show URLs based on search term
    this.categoriesContainer.querySelectorAll(".url-item").forEach((item) => {
        if (!term) {
            // If search term is empty, show all items
            item.style.display = "";
            visibleCount++;
        } else {
            const path = (item.dataset.path || "").toLowerCase();
            const title = (item.querySelector(".url-title")?.textContent || "").toLowerCase();

            if (path.includes(term) || title.includes(term)) {
                item.style.display = "";
                visibleCount++;
            } else {
                item.style.display = "none";
            }
        }
    });


    // Update category headers based on visible URLs
    this.updateCategoryVisibility();

    // If no results found after filtering, show a message
    if (term && visibleCount === 0) { // Only show if actively filtering
        this.noResultsMessage = document.createElement("div");
        this.noResultsMessage.className = "no-results-message";
        this.noResultsMessage.textContent = "No matching URLs found.";
        this.categoriesContainer.appendChild(this.noResultsMessage);
    }
  },

  /**
   * Update category visibility based on visible URLs
   */
  updateCategoryVisibility() {
     if (!this.categoriesContainer) return; // Guard clause
    const categories =
      this.categoriesContainer.querySelectorAll(".url-category");

    categories.forEach((category) => {
      const visibleItems = Array.from(
        category.querySelectorAll(".url-item")
      ).filter((item) => item.style.display !== "none").length;

      if (visibleItems === 0) {
        category.style.display = "none";
      } else {
        category.style.display = ""; // Ensure category is visible

        // Update category header to show visible count
        const categoryName = category.dataset.category;
        const totalCount = urlFetcher.categorizedUrls[categoryName]?.length || 0; // Use optional chaining and fallback
        const categoryTitle = category.querySelector("h3");

        if (categoryTitle) { // Check if title element exists
            if (visibleItems < totalCount && totalCount > 0) { // Only show "(x of y)" if different and total > 0
              categoryTitle.textContent = `${categoryName} (${visibleItems} of ${totalCount})`;
            } else if (totalCount > 0) {
              categoryTitle.textContent = `${categoryName} (${totalCount})`;
            } else {
                 categoryTitle.textContent = categoryName; // Fallback if total count is 0
            }
        }
      }
    });
  },

  /**
   * Select all visible URLs
   */
  selectAll() {
     if (!this.categoriesContainer) return; // Guard clause
    // Get all visible URL checkboxes
    const visibleCheckboxes = Array.from(
      this.categoriesContainer.querySelectorAll(".url-item")
    )
      .filter((item) => item.style.display !== "none")
      .map((item) => item.querySelector(".url-checkbox"));

    visibleCheckboxes.forEach((checkbox) => {
       if (checkbox) { // Check if checkbox exists
        checkbox.checked = true;
        this.selectedUrls.add(checkbox.dataset.path);
       }
    });

    // Update UI
    this.updateCategoryCheckboxes();
    this.updateSelectionCounter();
    this.updateCaptureButtonState();
  },

  /**
   * Clear all URL selections
   */
  clearSelection() {
     if (!this.categoriesContainer) return; // Guard clause
    // Uncheck all URL checkboxes
    this.categoriesContainer
      .querySelectorAll(".url-checkbox")
      .forEach((checkbox) => {
         if (checkbox) checkbox.checked = false;
      });

    // Clear the selected URLs set
    this.selectedUrls.clear();

    // Update UI
    this.updateCategoryCheckboxes();
    this.updateSelectionCounter();
    this.updateCaptureButtonState();
  },

  /**
   * Get the list of selected URLs in full format
   * @returns {Array} - List of full URLs ready for capture
   */
  getSelectedUrlsForCapture() {
    return urlFetcher.generateFullUrls(Array.from(this.selectedUrls));
  },
};

export default urlSelector;