// js/url-fetcher.js
import config from "./config.js";
import { URLProcessingError } from "./errors.js";
import * as events from "./events.js";

class URLFetcher {
  constructor() {
    this.urlsData = null;
    this.urlsList = []; // List of pages within a selected project
    this.projectList = []; // List of available project names
    this.categorizedUrls = {};
    this.isLoading = false;
    this.error = null;
    this.baseClientUrl = ""; // Target perspective client URL (from input or dropdown)
    this.projectName = ""; // Target project name (from input or dropdown)
    this.apiEndpointBase = ""; // Base URL up to the webdev project root (e.g., http://.../system/webdev/PerspectiveCapture/)
    this.projectListEndpoint = ""; // Endpoint for fetching project names
    this.pageListEndpoint = ""; // The final constructed API endpoint for fetching pages of a project
    this.dataLoadedDirectly = false; // This flag will be used by the new mode too

    this._determineApiEndpoints();
  }

  _determineApiEndpoints() {
    try {
      const currentHref = window.location.href;
      const match = currentHref.match(/^(.*\/system\/webdev\/([^\/]+)\/)/);

      if (match && match[1] && match[2]) {
        this.apiEndpointBase = match[1];
        const toolProjectName = match[2];
        const backendRouteBase = toolProjectName;

        this.projectListEndpoint = `${this.apiEndpointBase}${backendRouteBase}/listProjects`;
        this.pageListEndpointBase = `${this.apiEndpointBase}${backendRouteBase}/getUrls`;

        console.log(`API Endpoint Base determined: ${this.apiEndpointBase}`);
        console.log(
          `Project list endpoint set to: ${this.projectListEndpoint}`
        );
        console.log(
          `Page list endpoint base set to: ${this.pageListEndpointBase}`
        );
      } else {
        console.error(
          "CRITICAL: Could not determine API endpoints from window.location.href:",
          currentHref
        );
        this.apiEndpointBase = "";
        this.projectListEndpoint = "";
        this.pageListEndpointBase = "";
        // Consider UI.utils.showStatus for critical errors if UI is available
      }
    } catch (e) {
      console.error("Error determining API endpoints:", e);
      this.apiEndpointBase = "";
      this.projectListEndpoint = "";
      this.pageListEndpointBase = "";
      // Consider UI.utils.showStatus for critical errors
    }
  }

  setBaseClientUrl(url) {
    if (!url || typeof url !== "string") {
      console.error("Invalid base client URL provided");
      this.projectName = "";
      this.pageListEndpoint = "";
      return false;
    }

    try {
      this.baseClientUrl = url.endsWith("/") ? url.slice(0, -1) : url;
      console.log(`Target Base client URL set to: ${this.baseClientUrl}`);

      const match = this.baseClientUrl.match(/\/client\/([^\/]+)/);
      if (match && match[1]) {
        this.projectName = match[1];
        console.log(
          `Target Project name extracted (for page query param): ${this.projectName}`
        );

        if (this.pageListEndpointBase && this.projectName) {
          this.pageListEndpoint = `${
            this.pageListEndpointBase
          }?projectName=${encodeURIComponent(this.projectName)}`;
          console.log(
            `Page list API URL endpoint constructed: ${this.pageListEndpoint}`
          );
        } else {
          console.warn(
            `Cannot construct page list API endpoint. API Base: '${this.pageListEndpointBase}', Target Project Name: '${this.projectName}'`
          );
          this.pageListEndpoint = "";
        }
        return true;
      } else {
        console.warn(
          "Could not extract project name from base client URL input"
        );
        this.projectName = "";
        this.pageListEndpoint = "";
        return false;
      }
    } catch (e) {
      console.error("Error processing base client URL input:", e);
      this.projectName = "";
      this.pageListEndpoint = "";
      return false;
    }
  }

  async fetchProjectList() {
    this.isLoading = true;
    this.error = null;
    events.emit(events.events.PROJECT_LIST_LOADING_STARTED, {
      message: "Fetching project list...",
    });

    if (!this.projectListEndpoint) {
      const errorMsg = "Project list API endpoint is not configured.";
      console.error(errorMsg);
      this.error = new URLProcessingError(errorMsg, "Project List Fetch");
      events.emit(events.events.PROJECT_LIST_LOADING_FAILED, {
        error: this.error,
      });
      this.isLoading = false;
      return Promise.reject(this.error);
    }

    try {
      console.log(
        `Workspaceing project list from: ${this.projectListEndpoint}`
      );
      const response = await fetch(this.projectListEndpoint);
      if (!response.ok) {
        throw new URLProcessingError(
          `Failed to fetch project list: ${response.status} ${response.statusText}`,
          this.projectListEndpoint
        );
      }
      const projectNames = await response.json();
      if (!Array.isArray(projectNames)) {
        throw new URLProcessingError(
          "Invalid project list format received. Expected an array of strings.",
          this.projectListEndpoint
        );
      }
      this.projectList = projectNames.sort();
      console.log("Fetched project list:", this.projectList);
      events.emit(events.events.PROJECT_LIST_LOADING_COMPLETED, {
        projects: this.projectList,
      });
      this.isLoading = false;
      return this.projectList;
    } catch (error) {
      console.error("Error fetching project list:", error);
      this.error =
        error instanceof URLProcessingError
          ? error
          : new URLProcessingError(error.message, this.projectListEndpoint);
      events.emit(events.events.PROJECT_LIST_LOADING_FAILED, {
        error: this.error,
      });
      this.isLoading = false;
      return Promise.reject(this.error);
    }
  }

  _processData(data) {
    this.urlsData = data;
    if (data && data.pages && typeof data.pages === "object") {
      this.urlsList = Object.entries(data.pages).map(([path, details]) => ({
        path,
        title: details.title || path, // Ensure title defaults to path if not provided
        viewPath: details.viewPath,
      }));
      this.categorizeUrls();
      console.log(
        `Processed ${this.urlsList.length} pages for project ${this.projectName}.`
      );
      events.emit(events.events.URL_PROCESSING_COMPLETED, {
        message: `Processed ${this.urlsList.length} pages`,
        urls: this.urlsList,
      });
      return true;
    } else {
      console.error(
        'Invalid page data format received. Expected { "pages": { ... } }:',
        data
      );
      const endpointDesc = this.dataLoadedDirectly // Check current state before this processing
        ? "Direct Data"
        : this.pageListEndpoint;
      this.error = new URLProcessingError(
        "Invalid page data format",
        endpointDesc
      );
      events.emit(events.events.CAPTURE_FAILED, {
        url: endpointDesc,
        error: this.error,
      });
      return false;
    }
  }

  async setDataDirectly(jsonData) {
    this.isLoading = true;
    this.error = null;
    this.dataLoadedDirectly = false; // Reset before processing

    return new Promise((resolve, reject) => {
      try {
        let dataObject = jsonData;
        if (typeof jsonData === "string") {
          try {
            dataObject = JSON.parse(jsonData);
          } catch (parseError) {
            throw new URLProcessingError(
              "Failed to parse provided JSON string",
              "Direct Data (JSON)",
              parseError
            );
          }
        }
        if (typeof dataObject !== "object" || dataObject === null) {
          throw new URLProcessingError(
            "Provided JSON data is not a valid object",
            "Direct Data (JSON)"
          );
        }
        console.log("Setting page data directly from JSON:", dataObject);
        events.emit(events.events.URL_PROCESSING_STARTED, {
          message: "Processing provided page JSON...",
        });

        if (this._processData(dataObject)) {
          this.dataLoadedDirectly = true;
          this.isLoading = false;
          resolve(this.urlsList);
        } else {
          this.isLoading = false;
          // _processData would have set this.error and emitted events
          resolve([]); // Resolve with empty on processing failure
        }
      } catch (error) {
        console.error("Error setting data directly (JSON):", error);
        this.error =
          error instanceof URLProcessingError
            ? error
            : new URLProcessingError(error.message, "Direct Data (JSON)");
        events.emit(events.events.CAPTURE_FAILED, {
          url: "Direct Data (JSON)",
          error: this.error,
        });
        this.isLoading = false;
        reject(this.error);
      }
    });
  }

  /**
   * NEW METHOD: Process a list of relative paths.
   * @param {string[]} pathsArray - An array of relative path strings.
   * @returns {Promise<Array>} - Promise resolving to the list of processed URLs.
   */
  async setPathsDirectly(pathsArray) {
    this.isLoading = true;
    this.error = null;
    this.dataLoadedDirectly = false; // Reset before processing

    return new Promise((resolve, reject) => {
      try {
        if (!Array.isArray(pathsArray)) {
          throw new URLProcessingError(
            "Provided paths data is not a valid array.",
            "Direct Data (Path List)"
          );
        }

        console.log("Setting page data directly from path list:", pathsArray);
        events.emit(events.events.URL_PROCESSING_STARTED, {
          message: "Processing provided relative path list...",
        });

        // Transform the array of paths into the structure _processData expects
        const pagesObject = {};
        pathsArray.forEach((path) => {
          const cleanedPath = path.trim();
          if (cleanedPath) {
            // Use the path itself as the title and viewPath for simplicity
            pagesObject[cleanedPath] = {
              title: cleanedPath,
              viewPath: cleanedPath,
            };
          }
        });

        const dataObject = { pages: pagesObject };

        if (this._processData(dataObject)) {
          this.dataLoadedDirectly = true; // Mark that data was loaded directly
          this.isLoading = false;
          resolve(this.urlsList);
        } else {
          this.isLoading = false;
          // _processData would have set this.error and emitted events
          resolve([]); // Resolve with empty on processing failure
        }
      } catch (error) {
        console.error("Error setting data directly (Path List):", error);
        this.error =
          error instanceof URLProcessingError
            ? error
            : new URLProcessingError(error.message, "Direct Data (Path List)");
        events.emit(events.events.CAPTURE_FAILED, {
          url: "Direct Data (Path List)",
          error: this.error,
        });
        this.isLoading = false;
        reject(this.error);
      }
    });
  }

  async loadUrls() {
    // This loads PAGES for the selected project
    if (this.dataLoadedDirectly) {
      console.log(
        "Using directly loaded page data (loadUrls called, but data was direct)."
      );
      return Promise.resolve(this.urlsList);
    }

    this.isLoading = true;
    this.error = null;
    // this.dataLoadedDirectly = false; // Ensure this is false if we are actually fetching

    return new Promise(async (resolve, reject) => {
      try {
        if (!this.pageListEndpoint) {
          // Check the FINAL page list endpoint
          throw new Error(
            "Page list API URL endpoint has not been constructed yet. Ensure Base URL (Project) is set."
          );
        }
        events.emit(events.events.URL_PROCESSING_STARTED, {
          message: `Workspaceing pages for project ${this.projectName}...`,
        });
        console.log(
          `Workspaceing page list from endpoint: ${this.pageListEndpoint}`
        );

        const response = await fetch(this.pageListEndpoint);
        if (!response.ok) {
          throw new URLProcessingError(
            `Failed to fetch page list: ${response.status} ${response.statusText}`,
            this.pageListEndpoint
          );
        }
        const data = await response.json();
        console.log("Received page data from fetch:", data);

        if (this._processData(data)) {
          this.dataLoadedDirectly = false; // Explicitly set: data was fetched, not loaded directly by user input
          this.isLoading = false;
          resolve(this.urlsList);
        } else {
          this.isLoading = false;
          // _processData would have set this.error and emitted events
          resolve([]);
        }
      } catch (error) {
        console.error("Error loading page list via fetch:", error);
        this.error =
          error instanceof URLProcessingError
            ? error
            : new URLProcessingError(
                error.message,
                this.pageListEndpoint || "Page Fetch Error"
              );
        events.emit(events.events.CAPTURE_FAILED, {
          url: this.pageListEndpoint || "Page Fetch Error",
          error: this.error,
        });
        this.isLoading = false;
        reject(this.error);
      }
    });
  }

  categorizeUrls() {
    this.categorizedUrls = {};
    this.urlsList.forEach((urlInfo) => {
      // Ensure urlInfo.path is a string before splitting
      const pathString =
        typeof urlInfo.path === "string" ? urlInfo.path : String(urlInfo.path);
      const firstSegment = pathString.split("/").filter(Boolean)[0] || "Home";
      if (!this.categorizedUrls[firstSegment]) {
        this.categorizedUrls[firstSegment] = [];
      }
      this.categorizedUrls[firstSegment].push(urlInfo);
    });
    console.log("Pages categorized:", Object.keys(this.categorizedUrls));
  }

  generateFullUrls(selectedPaths) {
    if (
      !Array.isArray(selectedPaths) ||
      selectedPaths.length === 0 ||
      !this.baseClientUrl
    ) {
      return [];
    }
    return selectedPaths.map((path) => {
      const processedPath = path.replace(/\/:[^\/]+/g, "/PARAM");
      if (path === "/" || path === "") {
        return this.baseClientUrl;
      }
      const pathSegment = processedPath.startsWith("/")
        ? processedPath.substring(1)
        : processedPath;
      return `${this.baseClientUrl}/${pathSegment}`;
    });
  }

  extractProjectNameFromBaseUrl() {
    return this.projectName || null;
  }
}

export default new URLFetcher();
