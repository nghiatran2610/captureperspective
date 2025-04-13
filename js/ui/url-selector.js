// js/ui/url-selector.js
import { elements } from "./elements.js";
import { utils } from "./utils.js";
import urlFetcher from "../url-fetcher.js";
import * as events from "../events.js";

export const urlSelector = {
  selectedUrls: new Set(),

  /**
   * Initialize the URL selector UI
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      // Create URL selector container
      this.createSelectorContainer();

      // Show loading indicator
      this.showLoadingState();

      // Load URLs from the server
      await urlFetcher.loadUrls();

      // Render URL categories
      this.renderUrlCategories(urlFetcher.categorizedUrls);

      // Add event listeners for selection
      this.setupEventListeners();

      // Show success message
      utils.showStatus(
        `Loaded ${urlFetcher.urlsList.length} URLs from server`,
        false
      );
    } catch (error) {
      console.error("Failed to initialize URL selector:", error);
      utils.showStatus(`Failed to load URLs: ${error.message}`, true);

      // Show fallback textarea
      this.showFallbackUI();
    }
  },

  /**
   * Create the URL selector container
   */
  // Update to url-selector.js - Add baseUrl input field

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

    // Add base URL input field
    const baseUrlContainer = document.createElement("div");
    baseUrlContainer.className = "base-url-container";

    const baseUrlLabel = document.createElement("label");
    baseUrlLabel.textContent = "Base Client URL:";
    baseUrlLabel.className = "base-url-label";
    baseUrlContainer.appendChild(baseUrlLabel);

    const baseUrlInput = document.createElement("input");
    baseUrlInput.type = "text";
    baseUrlInput.value = urlFetcher.baseClientUrl;
    baseUrlInput.placeholder =
      "http://localhost:8088/data/perspective/client/PROJECT_NAME";
    baseUrlInput.className = "base-url-input";
    baseUrlInput.id = "baseUrlInput";
    baseUrlContainer.appendChild(baseUrlInput);

    // Add update button
    const updateUrlBtn = document.createElement("button");
    updateUrlBtn.textContent = "Update";
    updateUrlBtn.className = "btn btn-small";
    updateUrlBtn.id = "updateUrlBtn";

    // Add event listener for updating base URL
    updateUrlBtn.addEventListener("click", () => {
      urlFetcher.setBaseClientUrl(baseUrlInput.value);
      utils.showStatus(
        `Base URL updated to: ${baseUrlInput.value}`,
        false,
        2000
      );
    });

    baseUrlContainer.appendChild(updateUrlBtn);
    this.container.appendChild(baseUrlContainer);

    // Create toolbar with search and actions
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
    this.container.appendChild(toolbar);

    // Create URL categories container
    const categoriesContainer = document.createElement("div");
    categoriesContainer.className = "url-categories-container";
    categoriesContainer.id = "urlCategoriesContainer";
    this.container.appendChild(categoriesContainer);

    // Replace the textarea with our container
    parentElement.replaceChild(this.container, urlList);

    // Keep a reference to these elements
    this.baseUrlInput = baseUrlInput;
    this.categoriesContainer = categoriesContainer;
    this.searchInput = searchInput;
    this.selectionCounter = selectionCounter;
    this.selectAllBtn = selectAllBtn;
    this.clearSelectionBtn = clearSelectionBtn;

    // Initially disable buttons
    this.selectAllBtn.disabled = false;
    this.clearSelectionBtn.disabled = true;
  },

  /**
   * Show loading state while fetching URLs
   */
  showLoadingState() {
    this.categoriesContainer.innerHTML = `
      <div class="url-selector-loading">
        <div class="loading-spinner"></div>
        <p>Loading available pages...</p>
      </div>
    `;
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
      this.originalUrlList.style.display = "block";

      // Update title
      if (elements.urlInputTitle) {
        elements.urlInputTitle.textContent =
          "Enter URLs to Capture (one per line)";
      }

      // Add a note about the failure
      const fallbackNote = document.createElement("div");
      fallbackNote.className = "help-text";
      fallbackNote.style.color = "#dc3545";
      fallbackNote.textContent =
        "Failed to load URLs from server. Please enter URLs manually.";
      parentElement.insertBefore(fallbackNote, this.originalUrlList);
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
    if (!categorizedUrls || Object.keys(categorizedUrls).length === 0) {
      this.categoriesContainer.innerHTML = "<p>No URLs available</p>";
      return;
    }

    this.categoriesContainer.innerHTML = "";

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
      toggleIcon.innerHTML = "▼";
      toggleIcon.title = "Expand/collapse category";
      categoryHeader.appendChild(toggleIcon);

      // Create URLs container
      const urlsContainer = document.createElement("div");
      urlsContainer.className = "url-items-container";

      // Add URL items
      urls.forEach((url) => {
        const urlItem = document.createElement("div");
        urlItem.className = "url-item";
        urlItem.dataset.path = url.path;

        // Add URL checkbox
        const urlCheckbox = document.createElement("input");
        urlCheckbox.type = "checkbox";
        urlCheckbox.className = "url-checkbox";
        urlCheckbox.dataset.path = url.path;
        urlItem.appendChild(urlCheckbox);

        // Add URL title
        const urlTitle = document.createElement("span");
        urlTitle.className = "url-title";
        urlTitle.textContent = url.title || url.path;
        urlTitle.title = url.path;
        urlItem.appendChild(urlTitle);

        // Add URL path as subtitle
        const urlPath = document.createElement("span");
        urlPath.className = "url-path";
        urlPath.textContent = url.path;
        urlItem.appendChild(urlPath);

        urlsContainer.appendChild(urlItem);
      });

      // Assemble category section
      categorySection.appendChild(categoryHeader);
      categorySection.appendChild(urlsContainer);

      this.categoriesContainer.appendChild(categorySection);
    });
  },

  /**
   * Set up event listeners for the URL selector
   */
  setupEventListeners() {
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
    const categories =
      this.categoriesContainer.querySelectorAll(".url-category");

    categories.forEach((category) => {
      const categoryName = category.dataset.category;
      const categoryCheckbox = category.querySelector(".category-checkbox");
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
    const count = this.selectedUrls.size;
    this.selectionCounter.textContent = `${count} selected`;

    // Update buttons state
    this.selectAllBtn.disabled = count === urlFetcher.urlsList.length;
    this.clearSelectionBtn.disabled = count === 0;
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
    if (!searchTerm) {
      // Reset all visibility
      this.categoriesContainer.querySelectorAll(".url-item").forEach((item) => {
        item.style.display = "";
      });

      // Reset category headers
      this.updateCategoryVisibility();

      // Remove no results message if it exists
      if (this.noResultsMessage) {
        this.noResultsMessage.style.display = "none";
      }
      return;
    }

    const term = searchTerm.toLowerCase();
    let visibleCount = 0;

    // Hide or show URLs based on search term
    this.categoriesContainer.querySelectorAll(".url-item").forEach((item) => {
      const path = item.dataset.path.toLowerCase();
      const title = item.querySelector(".url-title").textContent.toLowerCase();

      if (path.includes(term) || title.includes(term)) {
        item.style.display = "";
        visibleCount++;
      } else {
        item.style.display = "none";
      }
    });

    // Update category headers based on visible URLs
    this.updateCategoryVisibility();

    // If no results found, show a message
    if (visibleCount === 0) {
      if (!this.noResultsMessage) {
        this.noResultsMessage = document.createElement("div");
        this.noResultsMessage.className = "no-results-message";
        this.noResultsMessage.textContent = "No matching URLs found.";
        this.categoriesContainer.appendChild(this.noResultsMessage);
      }
      this.noResultsMessage.style.display = "block";
    } else if (this.noResultsMessage) {
      this.noResultsMessage.style.display = "none";
    }
  },

  /**
   * Update category visibility based on visible URLs
   */
  updateCategoryVisibility() {
    const categories =
      this.categoriesContainer.querySelectorAll(".url-category");

    categories.forEach((category) => {
      const visibleItems = Array.from(
        category.querySelectorAll(".url-item")
      ).filter((item) => item.style.display !== "none").length;

      if (visibleItems === 0) {
        category.style.display = "none";
      } else {
        category.style.display = "";

        // Update category header to show visible count
        const categoryName = category.dataset.category;
        const totalCount = urlFetcher.categorizedUrls[categoryName].length;
        const categoryTitle = category.querySelector("h3");

        if (visibleItems < totalCount) {
          categoryTitle.textContent = `${categoryName} (${visibleItems} of ${totalCount})`;
        } else {
          categoryTitle.textContent = `${categoryName} (${totalCount})`;
        }
      }
    });
  },

  /**
   * Select all visible URLs
   */
  selectAll() {
    // Get all visible URL checkboxes
    const visibleCheckboxes = Array.from(
      this.categoriesContainer.querySelectorAll(".url-item")
    )
      .filter((item) => item.style.display !== "none")
      .map((item) => item.querySelector(".url-checkbox"));

    visibleCheckboxes.forEach((checkbox) => {
      checkbox.checked = true;
      this.selectedUrls.add(checkbox.dataset.path);
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
    // Uncheck all URL checkboxes
    this.categoriesContainer
      .querySelectorAll(".url-checkbox")
      .forEach((checkbox) => {
        checkbox.checked = false;
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
