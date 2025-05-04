// js/url-fetcher.js
import config from './config.js';
import { URLProcessingError } from './errors.js';
import * as events from './events.js';

/**
 * A utility class to fetch URLs from an endpoint or use provided data
 */
class URLFetcher {
  constructor() {
    this.urlsData = null;
    this.urlsList = [];
    this.categorizedUrls = {};
    this.isLoading = false;
    this.error = null;
    this.baseClientUrl = ''; // Target perspective client URL (from input)
    this.projectName = '';   // Target project name (from input)
    this.apiBasePath = '';   // Base path for API calls (derived from window.location)
    this.urlEndpoint = '';   // The final constructed API endpoint
    this.dataLoadedDirectly = false;

    // --- Determine API base path ONCE on initialization ---
    this._determineApiBasePath();
  }

  /**
   * Determines the base path for API calls from the current window URL.
   * Example: If window URL is http://host/system/webdev/ProjectA/tool/index.html,
   * this should extract "http://host/system/webdev/ProjectA/"
   * Adjust the regex if your tool's path structure is different.
   */
  _determineApiBasePath() {
    try {
      const currentHref = window.location.href;
      // Regex to capture the part up to and including /system/webdev/ProjectName/
      // Assumes the tool path follows the project name segment.
      const match = currentHref.match(/^(.*\/system\/webdev\/[^\/]+\/)/);
      if (match && match[1]) {
        this.apiBasePath = match[1]; // Store the extracted base path
        console.log(`API Base Path determined from window.location: ${this.apiBasePath}`);
      } else {
        console.warn('Could not determine API base path from window.location.href:', currentHref);
        this.apiBasePath = ''; // Fallback or indicate error
      }
    } catch (e) {
      console.error('Error determining API base path:', e);
      this.apiBasePath = '';
    }
  }

  /**
   * Sets the target client URL and extracts the project name from user input.
   * Constructs the final API endpoint using the determined apiBasePath and the extracted projectName.
   * @param {string} url - e.g. http://localhost:8088/data/perspective/client/ProjectName
   * @returns {boolean} - True if project name extraction was successful.
   */
  setBaseClientUrl(url) {
    if (!url || typeof url !== 'string') {
      console.error('Invalid base client URL provided');
      this.projectName = '';
      this.urlEndpoint = '';
      return false;
    }

    try {
      // Store the target client URL (from input)
      this.baseClientUrl = url.endsWith('/') ? url.slice(0, -1) : url;
      console.log(`Target Base client URL set to: ${this.baseClientUrl}`);

      // Extract project name from the target client URL (this is for the query parameter)
      const match = this.baseClientUrl.match(/\/client\/([^\/]+)/);
      if (match && match[1]) {
        this.projectName = match[1]; // This projectName is from the INPUT field
        console.log(`Target Project name extracted (for query param): ${this.projectName}`);

        // --- Construct the API endpoint using apiBasePath (from window.location) and projectName (from input) ---
        if (this.apiBasePath && this.projectName) {
           // Combine the base path from window.location with the fixed API route and the project parameter from input
           this.urlEndpoint = `${this.apiBasePath}PerspectiveCapture/getUrls?projectName=${encodeURIComponent(this.projectName)}`;
           console.log(`API URL endpoint constructed: ${this.urlEndpoint}`); // Check this log carefully
        } else {
             console.warn(`Cannot construct API endpoint. API Base Path: '${this.apiBasePath}', Project Name: '${this.projectName}'`);
             this.urlEndpoint = '';
        }
        // --- End Endpoint Construction ---

        return true; // Project name extracted successfully
      } else {
        console.warn('Could not extract project name from base client URL input');
        this.projectName = '';
        this.urlEndpoint = '';
        return false;
      }
    } catch (e) {
      console.error('Error processing base client URL input:', e);
      this.projectName = '';
      this.urlEndpoint = '';
      return false;
    }
  }

  // --- Methods _processData, setDataDirectly, loadUrls, categorizeUrls, generateFullUrls, extractProjectNameFromBaseUrl remain unchanged from the previous correct version ---
  // (Code for these methods omitted for brevity, ensure they are the same as in the previous response where they were confirmed correct)


  /**
   * Process the raw page data (either fetched or provided directly)
   * @param {Object} data - The raw JSON data object containing a 'pages' property
   * @returns {boolean} - True if processing was successful, false otherwise
   */
  _processData(data) {
    this.urlsData = data;
    // Validate the expected structure
    if (data && data.pages && typeof data.pages === 'object') {
      // Process the pages object into the urlsList array
      this.urlsList = Object.entries(data.pages).map(([path, details]) => ({
        path, // e.g., "/Overview" or "Section/Page"
        title: details.title || path, // Use title if available, otherwise path
        viewPath: details.viewPath // Keep viewPath if needed elsewhere
      }));

      this.categorizeUrls(); // Group URLs by category
      console.log(`Processed ${this.urlsList.length} URLs.`);
      events.emit(events.events.URL_PROCESSING_COMPLETED, {
        message: `Processed ${this.urlsList.length} URLs`,
        urls: this.urlsList
      });
      return true; // Indicate success
    } else {
      // Handle invalid data format
      console.error('Invalid data format received. Expected { "pages": { ... } }:', data);
      this.error = new URLProcessingError('Invalid URL data format', this.dataLoadedDirectly ? 'Direct Data' : this.urlEndpoint);
      events.emit(events.events.CAPTURE_FAILED, {
        url: this.dataLoadedDirectly ? 'Direct Data' : this.urlEndpoint,
        error: this.error
      });
      return false; // Indicate failure
    }
  }

  /**
   * Set URL data directly, bypassing the fetch mechanism.
   * Accepts either a pre-parsed JSON object or a JSON string.
   * @param {Object|string} jsonData - The JSON object or string containing page data (e.g., { pages: { "/path": { title: "Title" } } }).
   * @returns {Promise<Array>} - List of URL objects ({path, title, viewPath}), or empty array on failure.
   */
  async setDataDirectly(jsonData) {
    this.isLoading = true; // Mimic loading state
    this.error = null;
    this.dataLoadedDirectly = false; // Reset flag initially

    // Wrap in promise for consistent async behavior with loadUrls
    return new Promise((resolve, reject) => {
        try {
          let dataObject = jsonData;
          // If input is a string, try to parse it as JSON
          if (typeof jsonData === 'string') {
            try {
              dataObject = JSON.parse(jsonData);
            } catch (parseError) {
              // If parsing fails, throw specific error
              throw new URLProcessingError('Failed to parse provided JSON string', 'Direct Data', parseError);
            }
          }

          // Basic validation of the parsed/provided object
          if (typeof dataObject !== 'object' || dataObject === null) {
              throw new URLProcessingError('Provided data is not a valid object', 'Direct Data');
          }

          console.log('Setting URL data directly:', dataObject);
          events.emit(events.events.URL_PROCESSING_STARTED, { message: 'Processing provided URLs...' });

          // Use the common processing function
          if (this._processData(dataObject)) {
            this.dataLoadedDirectly = true; // Set flag on successful processing
            this.isLoading = false;
            resolve(this.urlsList); // Resolve with the processed list
          } else {
            // _processData handles error reporting via events
            this.isLoading = false;
            // Resolve with empty array to indicate processing failure but keep promise resolved
            resolve([]);
          }

        } catch (error) {
          console.error('Error setting data directly:', error);
          // Ensure the error is an instance of URLProcessingError for consistent handling
          this.error = error instanceof URLProcessingError ? error : new URLProcessingError(error.message, 'Direct Data');
          events.emit(events.events.CAPTURE_FAILED, {
            url: 'Direct Data',
            error: this.error
          });
          this.isLoading = false;
          reject(this.error); // Reject the promise on error
        }
    });
  }


  /**
   * Load URLs from the constructed endpoint or use already set data.
   * @returns {Promise<Array>} List of URL objects ({path, title, viewPath})
   */
  async loadUrls() {
    // If data was successfully loaded directly earlier, return the existing list
    if (this.dataLoadedDirectly) {
      console.log("Using directly loaded URL data (loadUrls).");
      return Promise.resolve(this.urlsList);
    }

    // Proceed with fetching if data wasn't loaded directly
    this.isLoading = true;
    this.error = null;
    this.dataLoadedDirectly = false; // Ensure flag is false when fetching

    // Wrap fetch logic in a promise
    return new Promise(async (resolve, reject) => {
        try {
          // Check if the FINAL urlEndpoint is constructed
          if (!this.urlEndpoint) {
            throw new Error('API URL endpoint has not been constructed yet. Ensure Base URL is set and API path was determined.');
          }

          events.emit(events.events.URL_PROCESSING_STARTED, { message: 'Fetching available URLs...' });
          // --- Corrected Log Message ---
          console.log(`Workspaceing URLs from endpoint: ${this.urlEndpoint}`);
          // --- End Correction ---


          // Perform the fetch request
          const response = await fetch(this.urlEndpoint);

          // Check if the response was successful
          if (!response.ok) {
            throw new URLProcessingError(`Failed to fetch URLs: ${response.status} ${response.statusText}`, this.urlEndpoint);
          }

          // Parse the JSON response
          const data = await response.json();
          console.log('Received data from fetch:', data);

          // Process the fetched data using the common function
          if (this._processData(data)) {
             this.isLoading = false;
            resolve(this.urlsList); // Resolve with processed list
          } else {
             this.isLoading = false;
             resolve([]); // Resolve with empty array on processing failure
          }

        } catch (error) {
          console.error('Error loading URLs via fetch:', error);
          this.error = error instanceof URLProcessingError ? error : new URLProcessingError(error.message, this.urlEndpoint || 'Fetch Error');
          events.emit(events.events.CAPTURE_FAILED, {
            url: this.urlEndpoint || 'Fetch Error',
            error: this.error
          });
          this.isLoading = false;
          reject(this.error); // Reject the promise on fetch error
        }
    });
  }

  /**
   * Categorize URLs by their section (first path segment)
   */
  categorizeUrls() {
    this.categorizedUrls = {};
    this.urlsList.forEach(urlInfo => {
      const firstSegment = urlInfo.path.split('/').filter(Boolean)[0] || 'Home';
      if (!this.categorizedUrls[firstSegment]) {
        this.categorizedUrls[firstSegment] = [];
      }
      this.categorizedUrls[firstSegment].push(urlInfo);
    });
    console.log('URLs categorized:', Object.keys(this.categorizedUrls));
  }

  /**
   * Transform selected URLs into full perspective client URLs for the tool
   * @param {Array} selectedPaths - Array of page paths (e.g., ["/Overview", "Section/Page"])
   * @returns {Array<string>} - Array of full target perspective client URLs
   */
  generateFullUrls(selectedPaths) {
    // Ensure input is valid and baseClientUrl (target URL) is set
    if (!Array.isArray(selectedPaths) || selectedPaths.length === 0 || !this.baseClientUrl) {
        return [];
    }

    return selectedPaths.map(path => {
      const processedPath = path.replace(/\/:[^\/]+/g, '/PARAM');
      if (path === '/' || path === '') {
         return this.baseClientUrl;
      }
      const pathSegment = processedPath.startsWith('/') ? processedPath.substring(1) : processedPath;
      return `${this.baseClientUrl}/${pathSegment}`;
    });
  }


  /**
   * Get the detected project name (from target URL input)
   * @returns {string|null}
   */
  extractProjectNameFromBaseUrl() {
    return this.projectName || null;
  }

}

export default new URLFetcher();