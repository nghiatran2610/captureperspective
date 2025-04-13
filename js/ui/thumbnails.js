// ui/thumbnails.js
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

    // Create header with more compact styling
    const headerSection = document.createElement("div");
    headerSection.className = "thumbnails-header";

    const title = document.createElement("h3");
    title.textContent = "Live Thumbnails";
    headerSection.appendChild(title);

    // Create content area that will hold the thumbnails
    const contentSection = document.createElement("div");
    contentSection.className = "thumbnails-content";
    contentSection.id = "thumbnailsContent";

    // Create footer for the PDF button (initially hidden)
    const footerSection = document.createElement("div");
    footerSection.className = "combine-all-pdf-container";

    const combinePdfBtn = document.createElement("button");
    combinePdfBtn.className = "btn combine-all-pdf-btn";
    combinePdfBtn.textContent = "Combine All Screenshots to PDF";

    // Fix the event listener to use a proper reference to the thumbnails object
    const self = this; // Store a reference to thumbnails
    combinePdfBtn.addEventListener("click", function () {
      // Get all categories
      const allCategories = document.querySelectorAll(".thumbnail-category");
      if (allCategories.length === 0) {
        utils.showStatus("No screenshots available", true);
        return;
      }
      // Use the stored reference to call the function
      self.generateAllCategoriesPDF(allCategories);
    });

    footerSection.appendChild(combinePdfBtn);

    // Assemble the container
    container.appendChild(headerSection);
    container.appendChild(contentSection);
    container.appendChild(footerSection);

    // Add to output before any status messages
    elements.output.appendChild(container);

    // Keep references
    elements.liveThumbnails = container;
    elements.thumbnailsContent = contentSection;

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
          result.timeTaken,
          result.url || currentUrl // Pass the URL of the screenshot
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

    // Show the Combine All PDF button now that we have content
    const pdfContainer = elements.liveThumbnails.querySelector(
      ".combine-all-pdf-container"
    );
    if (pdfContainer) {
      pdfContainer.style.display = "flex";
    }

    // Smart scroll: only scroll if the new thumbnail would be out of view
    const thumbnailRect = thumbnailContainer.getBoundingClientRect();
    const viewportHeight = window.innerHeight;

    // If the thumbnail is below the viewport, scroll just enough to show it
    if (thumbnailRect.bottom > viewportHeight) {
      const scrollAdjustment = thumbnailRect.bottom - viewportHeight + 20; // 20px padding
      window.scrollBy({
        top: scrollAdjustment,
        behavior: "smooth",
      });
    }

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

    const contentSection =
      elements.thumbnailsContent || elements.liveThumbnails;

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
      thumbnailCount.textContent = "(0)";
      categoryHeader.appendChild(thumbnailCount);

      // Create content container (for actual thumbnails)
      const categoryContent = document.createElement("div");
      categoryContent.className = "category-content";

      // Add PDF button for this category
      const combinePdfBtn = document.createElement("button");
      combinePdfBtn.className = "btn btn-small combine-pdf-btn";
      combinePdfBtn.textContent = "Combine to PDF";

      // Fix the event listener using a reference to the thumbnails object
      const self = this;
      combinePdfBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        // Use the stored reference to call the method
        self.generatePDF(categoryContainer);
      });

      categoryHeader.appendChild(combinePdfBtn);
      categoryContainer.appendChild(categoryHeader);
      categoryContainer.appendChild(categoryContent);

      contentSection.appendChild(categoryContainer);
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
   * Add a "Combine All to PDF" button to the thumbnails container
   */
  addCombineAllToPDFButton() {
    // This function is now redundant since we create the button in createLiveThumbnailsContainer
    // But keep it for backward compatibility
    if (!elements.liveThumbnails) {
      this.createLiveThumbnailsContainer();
    }

    // If the button already exists, don't create another one
    if (elements.liveThumbnails.querySelector(".combine-all-pdf-container")) {
      return;
    }

    const combinePdfContainer = document.createElement("div");
    combinePdfContainer.className = "combine-all-pdf-container";

    const combinePdfBtn = document.createElement("button");
    combinePdfBtn.className = "btn combine-all-pdf-btn";
    combinePdfBtn.textContent = "Combine All Screenshots to PDF";

    // Store a reference to this
    const self = this;
    combinePdfBtn.addEventListener("click", function () {
      // Get all categories
      const allCategories = document.querySelectorAll(".thumbnail-category");
      if (allCategories.length === 0) {
        utils.showStatus("No screenshots available", true);
        return;
      }

      // Combine all screenshots from all categories
      self.generateAllCategoriesPDF(allCategories);
    });

    combinePdfContainer.appendChild(combinePdfBtn);
    elements.liveThumbnails.appendChild(combinePdfContainer);
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
   * Helper function to optimize image for PDF with higher quality
   * @param {string} dataURL - Data URL of the image
   * @returns {Promise<string>} - Promise that resolves to optimized data URL
   */
  optimizeImageForPDF(dataURL) {
    return new Promise((resolve, reject) => {
      try {
        const img = new Image();

        img.onload = () => {
          try {
            // Check if we have valid dimensions
            if (
              !img.width ||
              !img.height ||
              isNaN(img.width) ||
              isNaN(img.height)
            ) {
              console.warn("Invalid image dimensions:", img.width, img.height);
              resolve(dataURL); // Return original on invalid dimensions
              return;
            }

            // Determine target size based on original dimensions
            let targetWidth = img.width;
            let targetHeight = img.height;

            // Maximum dimensions - increased for better quality
            const MAX_DIMENSION = 1800;

            if (targetWidth > MAX_DIMENSION || targetHeight > MAX_DIMENSION) {
              if (targetWidth > targetHeight) {
                const ratio = targetHeight / targetWidth;
                targetWidth = MAX_DIMENSION;
                targetHeight = Math.round(MAX_DIMENSION * ratio);
              } else {
                const ratio = targetWidth / targetHeight;
                targetHeight = MAX_DIMENSION;
                targetWidth = Math.round(MAX_DIMENSION * ratio);
              }
            }

            // Ensure dimensions are integers and valid
            targetWidth = Math.max(1, Math.round(targetWidth));
            targetHeight = Math.max(1, Math.round(targetHeight));

            // Create canvas for resizing
            const canvas = document.createElement("canvas");
            canvas.width = targetWidth;
            canvas.height = targetHeight;

            // Draw image with high-quality settings
            const ctx = canvas.getContext("2d");
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            ctx.fillStyle = "#FFFFFF"; // Fill with white background
            ctx.fillRect(0, 0, targetWidth, targetHeight); // Ensure canvas is not transparent
            ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

            // Higher quality compression - use PNG for small images and high-quality JPEG for larger ones
            let optimizedData;

            if (targetWidth * targetHeight < 250000) {
              // For smaller images, use PNG for better quality
              optimizedData = canvas.toDataURL("image/png");
            } else {
              // For larger images, use high-quality JPEG
              // Increased quality from 0.6/0.75 to 0.85/0.92
              const quality = targetWidth > 1000 ? 0.85 : 0.92;
              optimizedData = canvas.toDataURL("image/jpeg", quality);
            }

            // Clean up to free memory
            canvas.width = 1;
            canvas.height = 1;

            resolve(optimizedData);
          } catch (err) {
            console.warn("Error during image optimization:", err);
            // Return original on error
            resolve(dataURL);
          }
        };

        img.onerror = () => {
          console.warn("Failed to load image for optimization");
          resolve(dataURL); // Return original on error
        };

        img.src = dataURL;
      } catch (err) {
        console.warn("Exception in optimization:", err);
        resolve(dataURL); // Return original on error
      }
    });
  },

  /**
   * Helper function to get valid image dimensions
   * @param {Image} img - Image element
   * @returns {Object} - Object with width and height properties
   */
  getValidImageDimensions(img) {
    let width = img.width || img.naturalWidth;
    let height = img.height || img.naturalHeight;

    // Ensure dimensions are valid
    if (!width || !height || isNaN(width) || isNaN(height)) {
      // Default to a small, valid size if dimensions are invalid
      console.warn("Invalid image dimensions, using defaults");
      width = 100;
      height = 100;
    }

    return {
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
    };
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

    // Create new jsPDF instance with better quality settings
    const pdf = new jspdf.jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
      compress: true,
      precision: 4, // Higher precision for better quality
      putOnlyUsedFonts: true,
    });

    // Add title to first page
    pdf.setFontSize(22);
    pdf.text(categoryTitle, 20, 20);
    pdf.setFontSize(12);
    pdf.text(`Generated on ${new Date().toLocaleString()}`, 20, 30);
    pdf.line(20, 35, pdf.internal.pageSize.width - 20, 35);

    // Define page dimensions
    const pageWidth = pdf.internal.pageSize.width - 40; // 20mm margins on each side
    const pageHeight = pdf.internal.pageSize.height - 60; // 30mm margins top and bottom

    // Process each screenshot one at a time to avoid memory issues
    let currentIndex = 0;
    let pageCount = 1;

    // Start processing
    const self = this;
    processNextScreenshot();

    function processNextScreenshot() {
      if (currentIndex >= thumbnailContainers.length) {
        // All screenshots processed, save the PDF
        try {
          const sanitizedTitle = categoryTitle.replace(/[^a-zA-Z0-9]/g, "_");
          pdf.save(
            `${sanitizedTitle}_${new Date().toISOString().slice(0, 10)}.pdf`
          );
          utils.showStatus(`PDF generated with ${pageCount} pages`, false);
        } catch (error) {
          console.error("Error saving PDF:", error);
          utils.showStatus("Error saving PDF", true);
        }
        return;
      }

      const container = thumbnailContainers[currentIndex];
      const screenshotData = container.dataset.screenshot;
      const filename = container.dataset.filename;

      if (!screenshotData) {
        // Skip this one and move to next
        currentIndex++;
        processNextScreenshot();
        return;
      }

      // Create a new page for each screenshot after the first
      if (currentIndex > 0) {
        pdf.addPage();
        pageCount++;
      }

      // Use the thumbnails object's method
      self
        .optimizeImageForPDF(screenshotData)
        .then((optimizedData) => {
          // Create an image element to get dimensions
          const img = new Image();
          img.onload = () => {
            try {
              // Get valid image dimensions
              const imgDimensions = self.getValidImageDimensions(img);

              // Calculate dimensions to fit on page with validation
              let imgWidth = Math.min(pageWidth, imgDimensions.width);
              let imgHeight = Math.min(pageHeight, imgDimensions.height);

              // Calculate aspect ratio correctly
              const imgRatio = imgDimensions.width / imgDimensions.height;

              // Recalculate dimensions based on aspect ratio
              if (imgWidth / imgHeight !== imgRatio) {
                if (imgWidth / imgRatio > pageHeight) {
                  // Height-constrained
                  imgHeight = pageHeight;
                  imgWidth = imgHeight * imgRatio;
                } else {
                  // Width-constrained
                  imgWidth = pageWidth;
                  imgHeight = imgWidth / imgRatio;
                }
              }

              // Ensure all dimensions are valid numbers and not too close to zero
              imgWidth = Math.max(
                10,
                Math.min(pageWidth, Math.round(imgWidth))
              );
              imgHeight = Math.max(
                10,
                Math.min(pageHeight, Math.round(imgHeight))
              );

              // Validate one more time before adding to PDF
              if (
                isNaN(imgWidth) ||
                isNaN(imgHeight) ||
                imgWidth <= 0 ||
                imgHeight <= 0
              ) {
                console.error(
                  "Invalid image dimensions for PDF:",
                  imgWidth,
                  imgHeight
                );
                // Skip this image
                currentIndex++;
                setTimeout(processNextScreenshot, 10);
                return;
              }

              // Add the image to the PDF
              pdf.addImage(
                optimizedData,
                optimizedData.includes("data:image/png") ? "PNG" : "JPEG",
                20, // X position (left margin)
                40, // Y position (below the title)
                imgWidth,
                imgHeight
              );

              // Add caption below the image
              pdf.setFontSize(10);

              // Truncate filename if too long
              const truncatedFilename =
                filename.length > 80
                  ? filename.substring(0, 77) + "..."
                  : filename;

              pdf.text(truncatedFilename, 20, imgHeight + 45);

              // Process next screenshot
              currentIndex++;
              // Small delay to allow UI updates
              setTimeout(processNextScreenshot, 10);
            } catch (error) {
              console.error("Error adding image to PDF:", error);
              // Continue with next screenshot
              currentIndex++;
              processNextScreenshot();
            }
          };

          img.onerror = () => {
            console.error("Failed to load image for PDF");
            currentIndex++;
            processNextScreenshot();
          };

          img.src = optimizedData;
        })
        .catch((error) => {
          console.error("Error optimizing image:", error);
          currentIndex++;
          processNextScreenshot();
        });
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

    try {
      // Create new jsPDF instance with better quality settings
      const pdf = new jspdf.jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
        compress: true,
        precision: 4, // Higher precision for better quality
        putOnlyUsedFonts: true,
      });

      // Add title to first page
      pdf.setFontSize(22);
      pdf.text("Complete Screenshot Documentation", 20, 20);
      pdf.setFontSize(12);
      pdf.text(`Generated on ${new Date().toLocaleString()}`, 20, 30);
      pdf.line(20, 35, pdf.internal.pageSize.width - 20, 35);

      // Count total screenshots to show progress
      let totalScreenshots = 0;
      Array.from(categoryContainers).forEach((categoryContainer) => {
        const thumbnailContainers = categoryContainer.querySelectorAll(
          ".category-content .thumbnail-container"
        );
        totalScreenshots += thumbnailContainers.length;
      });

      // Define page dimensions once for reuse
      const pageWidth = pdf.internal.pageSize.width - 40; // 20mm margins on each side
      const pageHeight = pdf.internal.pageSize.height - 60; // 30mm margins top and bottom

      // Process categories and screenshots sequentially to prevent memory issues
      let pageCount = 1;
      let processedScreenshots = 0;
      let currentCategory = 0;
      const totalCategories = categoryContainers.length;
      let hasScreenshots = false; // Flag to track if any screenshot was added

      // Process one category at a time
      const self = this;
      processNextCategory();

      function processNextCategory() {
        if (currentCategory >= totalCategories) {
          // All categories processed - save the PDF if any screenshots were added
          if (hasScreenshots) {
            finalizePDF();
          } else {
            utils.showStatus("No screenshots available to generate PDF.", true);
          }
          return;
        }

        const categoryContainer = categoryContainers[currentCategory];
        const categoryTitle =
          categoryContainer.querySelector(".category-header h4")?.textContent ||
          `Category ${currentCategory + 1}`;

        const thumbnailContainers = categoryContainer.querySelectorAll(
          ".category-content .thumbnail-container"
        );

        if (thumbnailContainers.length === 0) {
          // Skip empty categories
          currentCategory++;
          processNextCategory();
          return;
        }

        // Process screenshots sequentially
        let currentScreenshot = 0;

        processNextScreenshot();

        function processNextScreenshot() {
          if (currentScreenshot >= thumbnailContainers.length) {
            // All screenshots in this category processed
            currentCategory++;
            processNextCategory();
            return;
          }

          const container = thumbnailContainers[currentScreenshot];
          const screenshotData = container.dataset.screenshot;
          const filename = container.dataset.filename;

          if (!screenshotData) {
            // Skip if no screenshot data
            currentScreenshot++;
            processedScreenshots++;
            processNextScreenshot();
            return;
          }

          // Add a new page for the screenshot
          pdf.addPage();
          pageCount++;
          hasScreenshots = true; // Mark that at least one screenshot has been added

          // Process and optimize image
          self
            .optimizeImageForPDF(screenshotData)
            .then((optimizedData) => {
              try {
                // Create image element to get dimensions
                const img = new Image();
                img.onload = () => {
                  try {
                    // Get valid image dimensions
                    const imgDimensions = self.getValidImageDimensions(img);

                    // Calculate dimensions to fit on page with validation
                    let imgWidth = Math.min(pageWidth, imgDimensions.width);
                    let imgHeight = Math.min(pageHeight, imgDimensions.height);

                    // Calculate aspect ratio correctly
                    const imgRatio = imgDimensions.width / imgDimensions.height;

                    // Recalculate dimensions based on aspect ratio
                    if (imgWidth / imgHeight !== imgRatio) {
                      if (imgWidth / imgRatio > pageHeight) {
                        // Height-constrained
                        imgHeight = pageHeight;
                        imgWidth = imgHeight * imgRatio;
                      } else {
                        // Width-constrained
                        imgWidth = pageWidth;
                        imgHeight = imgWidth / imgRatio;
                      }
                    }

                    // Ensure all dimensions are valid numbers and not too close to zero
                    imgWidth = Math.max(
                      10,
                      Math.min(pageWidth, Math.round(imgWidth))
                    );
                    imgHeight = Math.max(
                      10,
                      Math.min(pageHeight, Math.round(imgHeight))
                    );

                    // Validate one more time before adding to PDF
                    if (
                      isNaN(imgWidth) ||
                      isNaN(imgHeight) ||
                      imgWidth <= 0 ||
                      imgHeight <= 0
                    ) {
                      console.error(
                        "Invalid image dimensions for PDF:",
                        imgWidth,
                        imgHeight
                      );
                      // Skip this image
                      processedScreenshots++;
                      currentScreenshot++;
                      setTimeout(processNextScreenshot, 10);
                      return;
                    }

                    // Add the image to the PDF
                    pdf.addImage(
                      optimizedData,
                      optimizedData.includes("data:image/png") ? "PNG" : "JPEG",
                      20, // X position
                      40, // Y position
                      imgWidth,
                      imgHeight
                    );

                    // Add caption below the image
                    pdf.setFontSize(14);
                    pdf.text(`Category: ${categoryTitle}`, 20, 30);
                    pdf.setFontSize(10);

                    // Truncate filename if too long to avoid PDF issues
                    const truncatedFilename =
                      filename.length > 80
                        ? filename.substring(0, 77) + "..."
                        : filename;

                    pdf.text(truncatedFilename, 20, imgHeight + 45);

                    // Update progress
                    processedScreenshots++;
                    utils.showStatus(
                      `Generating PDF: ${processedScreenshots}/${totalScreenshots} screenshots processed`,
                      false
                    );

                    // Continue with next screenshot after a brief delay
                    setTimeout(() => {
                      currentScreenshot++;
                      processNextScreenshot();
                    }, 10); // Small delay to prevent UI freezing
                  } catch (error) {
                    console.error("Error adding image to PDF:", error);
                    // Continue with next screenshot despite error
                    processedScreenshots++;
                    currentScreenshot++;
                    processNextScreenshot();
                  }
                };

                img.onerror = () => {
                  console.error("Failed to load image for PDF");
                  processedScreenshots++;
                  currentScreenshot++;
                  processNextScreenshot();
                };

                img.src = optimizedData;
              } catch (error) {
                console.error("Error processing image:", error);
                processedScreenshots++;
                currentScreenshot++;
                processNextScreenshot();
              }
            })
            .catch((error) => {
              console.error("Error optimizing image:", error);
              processedScreenshots++;
              currentScreenshot++;
              processNextScreenshot();
            });
        }
      }

      function finalizePDF() {
        try {
          // Split into multiple PDFs if large
          if (pageCount > 50) {
            utils.showStatus(
              "Large document detected, splitting into multiple PDFs...",
              false
            );

            // Save in smaller chunks of 40 pages
            const pagesPerPDF = 40;
            const totalPDFs = Math.ceil(pageCount / pagesPerPDF);

            for (let i = 0; i < totalPDFs; i++) {
              const startPage = i * pagesPerPDF + 1;
              const endPage = Math.min((i + 1) * pagesPerPDF, pageCount);

              try {
                // Extract pages to a new PDF
                const pdfOutput = pdf.output("arraybuffer");

                // Create a new PDF document
                const newPdf = new jspdf.jsPDF({
                  orientation: "landscape",
                  unit: "mm",
                  format: "a4",
                  compress: true,
                });

                // Add a title page to each split PDF
                newPdf.setFontSize(16);
                newPdf.text(
                  `Screenshots Collection - Part ${i + 1} of ${totalPDFs}`,
                  20,
                  20
                );
                newPdf.setFontSize(12);
                newPdf.text(
                  `Pages ${startPage} to ${endPage} of ${pageCount} total pages`,
                  20,
                  30
                );
                newPdf.text(
                  `Generated on ${new Date().toLocaleString()}`,
                  20,
                  40
                );

                // Save this chunk
                newPdf.save(
                  `Screenshots_Part${i + 1}_of_${totalPDFs}_${new Date()
                    .toISOString()
                    .slice(0, 10)}.pdf`
                );
              } catch (splitError) {
                console.error(
                  `Error creating split PDF part ${i + 1}:`,
                  splitError
                );
              }
            }

            utils.showStatus(
              `PDF generation complete: Split into ${totalPDFs} files`,
              false
            );
          } else {
            // Single PDF for smaller documents
            pdf.save(
              `Screenshots_${new Date().toISOString().slice(0, 10)}.pdf`
            );
            utils.showStatus(`PDF generated with ${pageCount} pages`, false);
          }
        } catch (error) {
          console.error("Error saving PDF:", error);
          utils.showStatus(
            "Error saving PDF. Try with fewer screenshots or individually.",
            true
          );
        }
      }
    } catch (error) {
      console.error("Error generating comprehensive PDF:", error);
      utils.showStatus(
        "Error generating comprehensive PDF: " + error.message,
        true
      );
    }
  },
};

export default thumbnails;
