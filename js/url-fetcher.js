// js/url-fetcher.js
import config from "./config.js";
import { URLProcessingError } from "./errors.js";
import * as events from "./events.js";

/**
 * A utility class to fetch URLs from an endpoint or use provided data
 */
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
    this.dataLoadedDirectly = false;

    this._determineApiEndpoints(); // Renamed for clarity
  }

  // Corrected method to determine the FULL endpoint paths
  _determineApiEndpoints() {
    try {
      const currentHref = window.location.href;
      // Regex to capture:
      // 1. The full base URL up to and including the webdev project name and trailing slash (e.g., http://host/system/webdev/PerspectiveCapture/)
      // 2. The webdev project name itself (e.g., PerspectiveCapture)
      const match = currentHref.match(/^(.*\/system\/webdev\/([^\/]+)\/)/);

      if (match && match[1] && match[2]) {
        this.apiEndpointBase = match[1]; // e.g., http://host/system/webdev/PerspectiveCapture/
        const toolProjectName = match[2]; // e.g., PerspectiveCapture (The project this tool runs under)

        // --- Construct Endpoints ---
        // Assuming your Python backend script routes are mounted directly under the tool's project name
        const backendRouteBase = toolProjectName; // Often the same as the tool's project name

        // Project List Endpoint
        this.projectListEndpoint = `${this.apiEndpointBase}${backendRouteBase}/listProjects`;

        // Page List Endpoint (Base part, query param added later in setBaseClientUrl)
        // Storing the base path here, the full endpoint is constructed when a target project is known
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
        this.pageListEndpointBase = ""; // Ensure this is also cleared
        // Consider throwing an error or displaying a UI message here as this is critical
        UI.utils.showStatus(
          "Error: Could not determine API paths. Tool may not function.",
          true,
          0
        );
      }
    } catch (e) {
      console.error("Error determining API endpoints:", e);
      this.apiEndpointBase = "";
      this.projectListEndpoint = "";
      this.pageListEndpointBase = "";
      UI.utils.showStatus("Error: Failed to configure API paths.", true, 0);
    }
  }

  setBaseClientUrl(url) {
    // This method remains largely the same, but uses this.pageListEndpointBase
    if (!url || typeof url !== "string") {
      console.error("Invalid base client URL provided");
      this.projectName = "";
      this.pageListEndpoint = ""; // Clear the final page list endpoint
      return false;
    }

    try {
      this.baseClientUrl = url.endsWith("/") ? url.slice(0, -1) : url;
      console.log(`Target Base client URL set to: ${this.baseClientUrl}`);

      const match = this.baseClientUrl.match(/\/client\/([^\/]+)/);
      if (match && match[1]) {
        this.projectName = match[1]; // This is the TARGET project name
        console.log(
          `Target Project name extracted (for page query param): ${this.projectName}`
        );

        // Construct the final page list endpoint using the base path and the target project name
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

    // Use the already constructed projectListEndpoint
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
    // No changes needed here
    this.urlsData = data;
    if (data && data.pages && typeof data.pages === "object") {
      this.urlsList = Object.entries(data.pages).map(([path, details]) => ({
        path,
        title: details.title || path,
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
      const endpointDesc = this.dataLoadedDirectly
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
    // No changes needed here
    this.isLoading = true;
    this.error = null;
    this.dataLoadedDirectly = false;

    return new Promise((resolve, reject) => {
      try {
        let dataObject = jsonData;
        if (typeof jsonData === "string") {
          try {
            dataObject = JSON.parse(jsonData);
          } catch (parseError) {
            throw new URLProcessingError(
              "Failed to parse provided JSON string",
              "Direct Data",
              parseError
            );
          }
        }
        if (typeof dataObject !== "object" || dataObject === null) {
          throw new URLProcessingError(
            "Provided data is not a valid object",
            "Direct Data"
          );
        }
        console.log("Setting page data directly:", dataObject);
        events.emit(events.events.URL_PROCESSING_STARTED, {
          message: "Processing provided page JSON...",
        });

        if (this._processData(dataObject)) {
          this.dataLoadedDirectly = true;
          this.isLoading = false;
          resolve(this.urlsList);
        } else {
          this.isLoading = false;
          resolve([]);
        }
      } catch (error) {
        console.error("Error setting data directly:", error);
        this.error =
          error instanceof URLProcessingError
            ? error
            : new URLProcessingError(error.message, "Direct Data");
        events.emit(events.events.CAPTURE_FAILED, {
          url: "Direct Data",
          error: this.error,
        });
        this.isLoading = false;
        reject(this.error);
      }
    });
  }

  async loadUrls() {
    // This loads PAGES for the selected project
    // No changes needed here, uses this.pageListEndpoint constructed by setBaseClientUrl
    if (this.dataLoadedDirectly) {
      console.log("Using directly loaded page data (loadUrls).");
      return Promise.resolve(this.urlsList);
    }

    this.isLoading = true;
    this.error = null;
    this.dataLoadedDirectly = false;

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
          this.isLoading = false;
          resolve(this.urlsList);
        } else {
          this.isLoading = false;
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
    // No changes needed here
    this.categorizedUrls = {};
    this.urlsList.forEach((urlInfo) => {
      const firstSegment = urlInfo.path.split("/").filter(Boolean)[0] || "Home";
      if (!this.categorizedUrls[firstSegment]) {
        this.categorizedUrls[firstSegment] = [];
      }
      this.categorizedUrls[firstSegment].push(urlInfo);
    });
    console.log("Pages categorized:", Object.keys(this.categorizedUrls));
  }

  generateFullUrls(selectedPaths) {
    // No changes needed here
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
    // No changes needed here
    return this.projectName || null;
  }
}

export default new URLFetcher();
