import { elements } from "./elements.js";
import { utils } from "./utils.js";
import { modals } from "./modals.js";

export const thumbnails = {
  /**
   * Create container for live thumbnails
   * @returns {HTMLElement} - The created container
   */
  createLiveThumbnailsContainer() {
    const container = document.createElement("div");
    container.id = "liveThumbnails";
    container.className = "live-thumbnails-container";

    const title = document.createElement("h3");
    title.textContent = "Live Thumbnails";
    title.style.width = "100%";
    title.style.marginBottom = "10px";

    container.appendChild(title);

    // Add to output before any status messages
    elements.output.appendChild(container);

    // Keep a reference to the container
    elements.liveThumbnails = container;

    return container;
  },

  /**
   * Add a live thumbnail to the container, organized by category
   * @param {Object} result - Screenshot result object
   * @param {string} fileName - Filename for the screenshot
   * @param {string} sequenceName - Optional name for action sequence
   * @param {boolean} isRetry - Whether this is a retry screenshot
   * @param {boolean} isToolbarAction - Whether this is from a toolbar action
   * @returns {HTMLElement} - The created thumbnail element
   */
  addLiveThumbnail(
    result,
    fileName,
    sequenceName = null,
    isRetry = false,
    isToolbarAction = false
  ) {
    if (!elements.liveThumbnails) {
      this.createLiveThumbnailsContainer();
    }

    // Parse category info from fileName or sequenceName
    const { parentCategory, category } = this.parseCategoryFromFileName(
      sequenceName || fileName
    );

    // Get appropriate category container
    const categoryContainer = this.getCategoryContainer(
      category,
      parentCategory
    );
    const categoryContent =
      categoryContainer.querySelector(".category-content");

    // Create thumbnail container
    const thumbnailContainer = document.createElement("div");
    thumbnailContainer.className = "thumbnail-container";

    if (isToolbarAction) {
      thumbnailContainer.classList.add("toolbar-action");
    }

    if (result.error) {
      thumbnailContainer.classList.add("error-thumbnail");
    }

    // Add retry badge if needed
    if (isRetry) {
      const retryBadge = document.createElement("div");
      retryBadge.textContent = "Retry";
      retryBadge.className = "retry-badge";
      thumbnailContainer.appendChild(retryBadge);
    }

    // Add error badge if this is an error result
    if (result.error) {
      const errorBadge = document.createElement("div");
      errorBadge.textContent = "Error";
      errorBadge.className = "error-badge";
      thumbnailContainer.appendChild(errorBadge);
    }

    // Thumbnail image (or error placeholder)
    const thumbImg = document.createElement("img");

    if (result.error) {
      // Use a placeholder for error thumbnails
      thumbImg.src =
        'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="90" viewBox="0 0 120 90"><rect width="120" height="90" fill="%23f8d7da"/><text x="60" y="45" font-family="Arial" font-size="12" fill="%23721c24" text-anchor="middle">Mount Error</text></svg>';
      thumbImg.className = "thumbnail-image error-image";
    } else {
      thumbImg.src = result.thumbnail;
      thumbImg.className = "thumbnail-image";

      // Make thumbnail clickable to view full screenshot
      thumbImg.addEventListener("click", () => {
        modals.viewScreenshotFromImage(
          result.screenshot,
          fileName,
          result.width,
          result.height,
          result.timeTaken
        );
      });
    }

    // File name label
    const nameLabel = document.createElement("div");
    nameLabel.textContent = utils.truncateText(fileName, 20);
    nameLabel.title = fileName;
    nameLabel.className = "thumbnail-filename";

    // Add sequence name if provided
    if (sequenceName) {
      const seqLabel = document.createElement("div");
      seqLabel.textContent = utils.truncateText(sequenceName, 20);
      seqLabel.title = sequenceName;
      seqLabel.className = "thumbnail-sequence-name";

      thumbnailContainer.appendChild(thumbImg);
      thumbnailContainer.appendChild(seqLabel);
      thumbnailContainer.appendChild(nameLabel);
    } else {
      thumbnailContainer.appendChild(thumbImg);
      thumbnailContainer.appendChild(nameLabel);
    }

    // Add error message if applicable
    if (result.error && result.errorMessage) {
      const errorMsg = document.createElement("div");
      errorMsg.textContent = "No view configured";
      errorMsg.className = "thumbnail-error-message";
      errorMsg.title = result.errorMessage;
      thumbnailContainer.appendChild(errorMsg);
    }

    // Add download button only for non-error thumbnails
    if (!result.error) {
      const downloadBtn = document.createElement("button");
      downloadBtn.className = "thumbnail-download-btn";
      downloadBtn.title = "Download this screenshot";
      downloadBtn.innerHTML =
        '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" fill="currentColor"></path></svg>';
      downloadBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.downloadSingleScreenshot(result.screenshot, fileName);
      });

      thumbnailContainer.appendChild(downloadBtn);

      // Store filename and screenshot data in the container for zip/pdf creation
      thumbnailContainer.dataset.filename = fileName;
      thumbnailContainer.dataset.screenshot = result.screenshot;
    }

    categoryContent.appendChild(thumbnailContainer);

    // Update the count of thumbnails in this category
    const countElement = categoryContainer.querySelector(".thumbnail-count");
    const newCount = categoryContent.querySelectorAll(
      ".thumbnail-container"
    ).length;
    countElement.textContent = `(${newCount})`;

    return thumbnailContainer;
  },

  /**
   * Create or get a category container for organizing thumbnails
   * @param {string} categoryName - Name of the category (page name)
   * @param {string} parentName - Name of the parent category (e.g., module name)
   * @returns {HTMLElement} - The category container
   */
  getCategoryContainer(categoryName, parentName = null) {
    if (!elements.liveThumbnails) {
      this.createLiveThumbnailsContainer();
    }

    const categoryId = `category-${
      parentName ? `${parentName}-` : ""
    }${categoryName}`
      .replace(/\s+/g, "-")
      .toLowerCase();
    let categoryContainer = document.getElementById(categoryId);

    if (!categoryContainer) {
      // Create a new category container
      categoryContainer = document.createElement("div");
      categoryContainer.id = categoryId;
      categoryContainer.className = "thumbnail-category";

      // Create header for the category
      const categoryHeader = document.createElement("div");
      categoryHeader.className = "category-header";

      // Add collapsible functionality
      categoryHeader.addEventListener("click", () => {
        const content = categoryContainer.querySelector(".category-content");
        const isCollapsed = content.style.display === "none";
        content.style.display = isCollapsed ? "flex" : "none";
        categoryHeader.classList.toggle("collapsed", !isCollapsed);
      });

      const categoryTitle = document.createElement("h4");
      categoryTitle.textContent = parentName
        ? `${parentName} - ${categoryName}`
        : categoryName;
      categoryHeader.appendChild(categoryTitle);

      const thumbnailCount = document.createElement("span");
      thumbnailCount.className = "thumbnail-count";
      thumbnailCount.textContent = "0";
      categoryHeader.appendChild(thumbnailCount);

      // Create content container (for actual thumbnails)
      const categoryContent = document.createElement("div");
      categoryContent.className = "category-content";

      // Add PDF button for this category
      const combinePdfBtn = document.createElement("button");
      combinePdfBtn.className = "btn btn-small combine-pdf-btn";
      combinePdfBtn.textContent = "Combine to PDF";
      combinePdfBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.combineToPDF(categoryContainer);
      });

      categoryHeader.appendChild(combinePdfBtn);
      categoryContainer.appendChild(categoryHeader);
      categoryContainer.appendChild(categoryContent);

      elements.liveThumbnails.appendChild(categoryContainer);
    }

    return categoryContainer;
  },

  /**
   * Extract module and page information from filename
   * @param {string} fileName - Filename to parse
   * @returns {Object} - Contains parentCategory and category
   */
  parseCategoryFromFileName(fileName) {
    // Default to 'Other' if no pattern matches
    let parentCategory = "Other";
    let category = "General";

    // Try to extract module and page from the filename
    // Pattern for toolbar button pages: Refrigeration - Fridge 1 - Settings Button_20250403_120000.png
    const toolbarPattern = /^([^-]+)\s*-\s*([^-]+)\s*-\s*([^_]+)/;
    // Pattern for regular pages: Refrigeration - Fridge 1_20250403_120000.png
    const regularPattern = /^([^-]+)\s*-\s*([^_]+)/;
    // Pattern for single page: Refrigeration_20250403_120000.png
    const singlePattern = /^([^_]+)/;

    let match = fileName.match(toolbarPattern);
    if (match && match.length >= 4) {
      parentCategory = match[1].trim();
      category = match[2].trim();
      // We're ignoring the button name for categorization purposes
      return { parentCategory, category };
    }

    match = fileName.match(regularPattern);
    if (match && match.length >= 3) {
      parentCategory = match[1].trim();
      category = match[2].trim();
      return { parentCategory, category };
    }

    match = fileName.match(singlePattern);
    if (match && match.length >= 2) {
      parentCategory = match[1].trim();
      category = "Main";
      return { parentCategory, category };
    }

    return { parentCategory, category };
  },

  /**
   * Add a live thumbnail to the container, organized by category
   * @param {Object} result - Screenshot result object
   * @param {string} fileName - Filename for the screenshot
   * @param {string} sequenceName - Optional name for action sequence
   * @param {boolean} isRetry - Whether this is a retry screenshot
   * @param {boolean} isToolbarAction - Whether this is from a toolbar action
   * @returns {HTMLElement} - The created thumbnail element
   */
  addLiveThumbnail(
    result,
    fileName,
    sequenceName = null,
    isRetry = false,
    isToolbarAction = false
  ) {
    if (!elements.liveThumbnails) {
      this.createLiveThumbnailsContainer();
    }

    // Parse category info from fileName or sequenceName
    const { parentCategory, category } = this.parseCategoryFromFileName(
      sequenceName || fileName
    );

    // Get appropriate category container
    const categoryContainer = this.getCategoryContainer(
      category,
      parentCategory
    );
    const categoryContent =
      categoryContainer.querySelector(".category-content");

    // Create thumbnail container
    const thumbnailContainer = document.createElement("div");
    thumbnailContainer.className = "thumbnail-container";

    if (isToolbarAction) {
      thumbnailContainer.classList.add("toolbar-action");
    }

    // Add retry badge if needed
    if (isRetry) {
      const retryBadge = document.createElement("div");
      retryBadge.textContent = "Retry";
      retryBadge.className = "retry-badge";
      thumbnailContainer.appendChild(retryBadge);
    }

    // Thumbnail image
    const thumbImg = document.createElement("img");
    thumbImg.src = result.thumbnail;
    thumbImg.className = "thumbnail-image";

    // Make thumbnail clickable to view full screenshot
    thumbImg.addEventListener("click", () => {
      modals.viewScreenshotFromImage(
        result.screenshot,
        fileName,
        result.width,
        result.height,
        result.timeTaken
      );
    });

    // File name label
    const nameLabel = document.createElement("div");
    nameLabel.textContent = utils.truncateText(fileName, 20);
    nameLabel.title = fileName;
    nameLabel.className = "thumbnail-filename";

    // Add sequence name if provided
    if (sequenceName) {
      const seqLabel = document.createElement("div");
      seqLabel.textContent = utils.truncateText(sequenceName, 20);
      seqLabel.title = sequenceName;
      seqLabel.className = "thumbnail-sequence-name";

      thumbnailContainer.appendChild(thumbImg);
      thumbnailContainer.appendChild(seqLabel);
      thumbnailContainer.appendChild(nameLabel);
    } else {
      thumbnailContainer.appendChild(thumbImg);
      thumbnailContainer.appendChild(nameLabel);
    }

    // Add download button for individual screenshot
    const downloadBtn = document.createElement("button");
    downloadBtn.className = "thumbnail-download-btn";
    downloadBtn.title = "Download this screenshot";
    downloadBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" fill="currentColor"></path></svg>';
    downloadBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.downloadSingleScreenshot(result.screenshot, fileName);
    });

    thumbnailContainer.appendChild(downloadBtn);

    // Store filename and screenshot data in the container for zip/pdf creation
    thumbnailContainer.dataset.filename = fileName;
    thumbnailContainer.dataset.screenshot = result.screenshot;

    categoryContent.appendChild(thumbnailContainer);

    // Update the count of thumbnails in this category
    const countElement = categoryContainer.querySelector(".thumbnail-count");
    const newCount = categoryContent.querySelectorAll(
      ".thumbnail-container"
    ).length;
    countElement.textContent = `(${newCount})`;

    return thumbnailContainer;
  },

  /**
   * Download a single screenshot
   * @param {string} screenshotData - The Base64 screenshot data
   * @param {string} fileName - The filename for the download
   */
  downloadSingleScreenshot(screenshotData, fileName) {
    const link = document.createElement("a");
    link.href = screenshotData;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Show status message
    utils.showStatus(`Downloaded: ${fileName}`, false);
  },

  /**
   * Combine screenshots in a category to a PDF
   * @param {HTMLElement} categoryContainer - The category container element
   */
  combineToPDF(categoryContainer) {
    // First, check if jsPDF is loaded
    if (typeof jspdf === "undefined") {
      // Load jsPDF dynamically
      this.loadJsPDF()
        .then(() => {
          this.generatePDF(categoryContainer);
        })
        .catch((error) => {
          console.error("Error loading jsPDF:", error);
          utils.showStatus(
            "Error loading PDF library. Please try again.",
            true
          );
        });
    } else {
      // jsPDF is already loaded, generate PDF
      this.generatePDF(categoryContainer);
    }
  },

  /**
   * Load jsPDF library dynamically
   * @returns {Promise} - Resolves when library is loaded
   */
  loadJsPDF() {
    return new Promise((resolve, reject) => {
      // Create script element for jsPDF
      const jsPdfScript = document.createElement("script");
      jsPdfScript.src =
        "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
      jsPdfScript.onload = () => {
        resolve();
      };
      jsPdfScript.onerror = () => {
        reject(new Error("Failed to load jsPDF library"));
      };
      document.head.appendChild(jsPdfScript);
    });
  },

  /**
   * Generate PDF from screenshots in a category
   * @param {HTMLElement} categoryContainer - The category container element
   */
  generatePDF(categoryContainer) {
    // Get category name for PDF title
    const categoryTitle = categoryContainer.querySelector(
      ".category-header h4"
    ).textContent;
    const thumbnailContainers = categoryContainer.querySelectorAll(
      ".category-content .thumbnail-container"
    );

    if (thumbnailContainers.length === 0) {
      utils.showStatus("No screenshots found in this category", true);
      return;
    }

    // Show status message
    utils.showStatus(`Generating PDF for ${categoryTitle}...`, false);

    // Create new jsPDF instance
    const pdf = new jspdf.jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });

    // Add title to first page
    pdf.setFontSize(22);
    pdf.text(categoryTitle, 20, 20);
    pdf.setFontSize(12);
    pdf.text(`Generated on ${new Date().toLocaleString()}`, 20, 30);
    pdf.line(20, 35, pdf.internal.pageSize.width - 20, 35);

    // Process each screenshot
    let currentPromise = Promise.resolve();
    let pageCount = 1;

    Array.from(thumbnailContainers).forEach((container, index) => {
      const screenshotData = container.dataset.screenshot;
      const filename = container.dataset.filename;

      if (!screenshotData) return;

      currentPromise = currentPromise.then(() => {
        return new Promise((resolve) => {
          // Create a new page for each screenshot after the first
          if (index > 0) {
            pdf.addPage();
            pageCount++;
          }

          // Create an image element to get dimensions
          const img = new Image();
          img.onload = () => {
            // Calculate dimensions to fit on page
            const pageWidth = pdf.internal.pageSize.width - 40; // 20mm margins on each side
            const pageHeight = pdf.internal.pageSize.height - 60; // 30mm margins top and bottom

            const imgRatio = img.width / img.height;
            let imgWidth = pageWidth;
            let imgHeight = imgWidth / imgRatio;

            if (imgHeight > pageHeight) {
              imgHeight = pageHeight;
              imgWidth = imgHeight * imgRatio;
            }

            // Add the image to the PDF
            pdf.addImage(
              screenshotData,
              "PNG",
              20, // X position (left margin)
              40, // Y position (below the title)
              imgWidth,
              imgHeight
            );

            // Add caption below the image
            pdf.setFontSize(10);
            pdf.text(filename, 20, imgHeight + 45);

            resolve();
          };

          img.src = screenshotData;
        });
      });
    });

    // When all screenshots are processed, save the PDF
    currentPromise
      .then(() => {
        const sanitizedTitle = categoryTitle.replace(/[^a-zA-Z0-9]/g, "_");
        pdf.save(
          `${sanitizedTitle}_${new Date().toISOString().slice(0, 10)}.pdf`
        );
        utils.showStatus(`PDF generated with ${pageCount} pages`, false);
      })
      .catch((error) => {
        console.error("Error generating PDF:", error);
        utils.showStatus("Error generating PDF", true);
      });
  },

  /**
   * Detect if a screenshot is from a toolbar action based on the filename or sequence name
   * @param {string} name - Filename or sequence name to check
   * @returns {boolean} - True if it's a toolbar action
   */
  isToolbarAction(name) {
    return /Button$/.test(name);
  },

  /**
   * Add a "Combine All to PDF" button to the thumbnails container
   */
  addCombineAllToPDFButton() {
    if (!elements.liveThumbnails) return;

    const combinePdfContainer = document.createElement("div");
    combinePdfContainer.className = "combine-all-pdf-container";

    const combinePdfBtn = document.createElement("button");
    combinePdfBtn.className = "btn combine-all-pdf-btn";
    combinePdfBtn.textContent = "Combine All Screenshots to PDF";
    combinePdfBtn.addEventListener("click", () => {
      // Get all categories
      const allCategories = document.querySelectorAll(".thumbnail-category");
      if (allCategories.length === 0) {
        utils.showStatus("No screenshots available", true);
        return;
      }

      // Combine all screenshots from all categories
      this.combineAllToPDF(allCategories);
    });

    combinePdfContainer.appendChild(combinePdfBtn);
    elements.liveThumbnails.insertBefore(
      combinePdfContainer,
      elements.liveThumbnails.firstChild.nextSibling
    );
  },

  /**
   * Combine all screenshots from all categories to a single PDF
   * @param {NodeList} categoryContainers - All category containers
   */
  combineAllToPDF(categoryContainers) {
    // First, check if jsPDF is loaded
    if (typeof jspdf === "undefined") {
      // Load jsPDF dynamically
      this.loadJsPDF()
        .then(() => {
          this.generateAllCategoriesPDF(categoryContainers);
        })
        .catch((error) => {
          console.error("Error loading jsPDF:", error);
          utils.showStatus(
            "Error loading PDF library. Please try again.",
            true
          );
        });
    } else {
      // jsPDF is already loaded, generate PDF
      this.generateAllCategoriesPDF(categoryContainers);
    }
  },

  /**
   * Generate PDF with all screenshots from all categories
   * @param {NodeList} categoryContainers - All category containers
   */
  generateAllCategoriesPDF(categoryContainers) {
    // Show status message
    utils.showStatus(
      "Generating comprehensive PDF with all screenshots...",
      false
    );

    // Create new jsPDF instance
    const pdf = new jspdf.jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });

    // Add title to first page
    pdf.setFontSize(22);
    pdf.text("Complete Screenshot Documentation", 20, 20);
    pdf.setFontSize(12);
    pdf.text(`Generated on ${new Date().toLocaleString()}`, 20, 30);
    pdf.line(20, 35, pdf.internal.pageSize.width - 20, 35);

    // Process each category
    let currentPromise = Promise.resolve();
    let pageCount = 1;
    let isFirstPage = true;

    Array.from(categoryContainers).forEach((categoryContainer) => {
      const categoryTitle = categoryContainer.querySelector(
        ".category-header h4"
      ).textContent;
      const thumbnailContainers = categoryContainer.querySelectorAll(
        ".category-content .thumbnail-container"
      );

      if (thumbnailContainers.length === 0) return;

      // Add category title page
      currentPromise = currentPromise.then(() => {
        if (!isFirstPage) {
          pdf.addPage();
          pageCount++;
        } else {
          isFirstPage = false;
        }

        pdf.setFontSize(18);
        pdf.text(`Category: ${categoryTitle}`, 20, 50);
        pdf.setFontSize(14);
        pdf.text(`Contains ${thumbnailContainers.length} screenshots`, 20, 60);

        return Promise.resolve();
      });

      // Process each screenshot in this category
      Array.from(thumbnailContainers).forEach((container) => {
        const screenshotData = container.dataset.screenshot;
        const filename = container.dataset.filename;

        if (!screenshotData) return;

        currentPromise = currentPromise.then(() => {
          return new Promise((resolve) => {
            // Add a new page for the screenshot
            pdf.addPage();
            pageCount++;

            // Create an image element to get dimensions
            const img = new Image();
            img.onload = () => {
              // Calculate dimensions to fit on page
              const pageWidth = pdf.internal.pageSize.width - 40; // 20mm margins on each side
              const pageHeight = pdf.internal.pageSize.height - 60; // 30mm margins top and bottom

              const imgRatio = img.width / img.height;
              let imgWidth = pageWidth;
              let imgHeight = imgWidth / imgRatio;

              if (imgHeight > pageHeight) {
                imgHeight = pageHeight;
                imgWidth = imgHeight * imgRatio;
              }

              // Add the image to the PDF
              pdf.addImage(
                screenshotData,
                "PNG",
                20, // X position (left margin)
                40, // Y position (below the title)
                imgWidth,
                imgHeight
              );

              // Add caption below the image
              pdf.setFontSize(14);
              pdf.text(`Category: ${categoryTitle}`, 20, 30);
              pdf.setFontSize(10);
              pdf.text(filename, 20, imgHeight + 45);

              resolve();
            };

            img.src = screenshotData;
          });
        });
      });
    });

    // When all screenshots are processed, save the PDF
    currentPromise
      .then(() => {
        pdf.save(
          `All_Screenshots_${new Date().toISOString().slice(0, 10)}.pdf`
        );
        utils.showStatus(
          `Comprehensive PDF generated with ${pageCount} pages`,
          false
        );
      })
      .catch((error) => {
        console.error("Error generating comprehensive PDF:", error);
        utils.showStatus("Error generating comprehensive PDF", true);
      });
  },
};
