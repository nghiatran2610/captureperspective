// js/url-fetcher.js
import config from './config.js';
import { URLProcessingError } from './errors.js';
import * as events from './events.js';

/**
 * A utility class to fetch URLs from an endpoint for Simple Mode
 */
class URLFetcher {
  constructor() {
    this.urlsData = null;
    this.urlsList = [];
    this.categorizedUrls = {};
    this.isLoading = false;
    this.error = null;
    this.urlEndpoint = '/system/webdev/RF_Main_STG/getUrls';
    this.baseClientUrl = '';
  }

  /**
   * Load URLs from the endpoint
   * @returns {Promise<Array>} List of URL objects with title and path
   */
  async loadUrls() {
    this.isLoading = true;
    this.error = null;
    
    try {
      events.emit(events.events.URL_PROCESSING_STARTED, { message: 'Fetching available URLs...' });
      
      // Extract project name and base URL from current location
      this.determineBaseUrls();
      
      const response = await fetch(this.urlEndpoint);
      
      if (!response.ok) {
        throw new URLProcessingError(`Failed to fetch URLs: ${response.status} ${response.statusText}`, this.urlEndpoint);
      }
      
      const data = await response.json();
      this.urlsData = data;
      
      // Process URLs from the pages object
      if (data && data.pages) {
        this.urlsList = Object.entries(data.pages).map(([path, details]) => {
          return {
            path,
            title: details.title || path,
            viewPath: details.viewPath
          };
        });
        
        // Categorize URLs by their section (first path segment)
        this.categorizeUrls();
        
        events.emit(events.events.URL_PROCESSING_COMPLETED, { 
          message: `Loaded ${this.urlsList.length} URLs`,
          urls: this.urlsList 
        });
        
        return this.urlsList;
      } else {
        throw new URLProcessingError('Invalid URL data format', this.urlEndpoint);
      }
    } catch (error) {
      this.error = error;
      events.emit(events.events.CAPTURE_FAILED, { 
        url: this.urlEndpoint, 
        error 
      });
      throw error;
    } finally {
      this.isLoading = false;
    }
  }
  
  /**
   * Determine the base URLs based on the current page
   */
  determineBaseUrls() {
    const currentUrl = window.location.href;
    
    // Extract project name for endpoint
    const projectMatch = currentUrl.match(/\/system\/webdev\/([^\/]+)/);
    if (projectMatch && projectMatch[1]) {
      const projectName = projectMatch[1];
      this.urlEndpoint = `/system/webdev/${projectName}/getUrls`;
      
      // Construct base client URL for forming full URLs
      const baseUrlMatch = currentUrl.match(/(https?:\/\/[^\/]+)/);
      if (baseUrlMatch) {
        const baseUrl = baseUrlMatch[1];
        this.baseClientUrl = `${baseUrl}/data/perspective/client/${projectName}`;
        console.log(`Base client URL: ${this.baseClientUrl}`);
      }
    } else {
      // Fallback to using the current URL's origin as the base
      const urlObj = new URL(currentUrl);
      this.baseClientUrl = urlObj.origin;
      console.log(`Using fallback base URL: ${this.baseClientUrl}`);
    }
  }
  
  /**
   * Set the base client URL manually
   * @param {string} url - The base client URL
   */
  setBaseClientUrl(url) {
    // Normalize URL (remove trailing slash if present)
    this.baseClientUrl = url.endsWith('/') ? url.slice(0, -1) : url;
    console.log(`Base client URL set to: ${this.baseClientUrl}`);
  }
  
  /**
   * Categorize URLs by their section (first path segment)
   */
  categorizeUrls() {
    this.categorizedUrls = {};
    
    this.urlsList.forEach(urlInfo => {
      // Get the first segment of the URL path (after the leading slash)
      const pathSegments = urlInfo.path.split('/').filter(Boolean);
      const category = pathSegments[0] || 'Home';
      
      if (!this.categorizedUrls[category]) {
        this.categorizedUrls[category] = [];
      }
      
      this.categorizedUrls[category].push(urlInfo);
    });
  }
  
  /**
   * Transform selected URLs into full URLs for the tool
   * @param {Array} selectedPaths - Selected URL paths
   * @returns {Array} Full URLs ready for the tool
   */
  generateFullUrls(selectedPaths) {
    if (!selectedPaths || !Array.isArray(selectedPaths) || selectedPaths.length === 0) {
      return [];
    }
    
    // Generate full URLs for selected paths
    return selectedPaths.map(path => {
      // Handle route parameters by replacing them with placeholders
      const processedPath = path.replace(/\/:[^\/]+/g, '/PARAM');
      
      // For root path ("/"), don't add an extra slash
      if (path === '/') {
        return this.baseClientUrl;
      }
      
      // Format: baseURL + path (ensuring proper slash handling)
      if (path.startsWith('/')) {
        // Path already has leading slash
        return `${this.baseClientUrl}${path}`;
      } else {
        // Add leading slash to path
        return `${this.baseClientUrl}/${path}`;
      }
    });
  }
}

export default new URLFetcher();