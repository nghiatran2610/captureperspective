// js/login-debug.js
// js/login-debug.js - A utility to help debug login form issues

/**
 * Utility to help debug login form detection issues
 */
export function debugLoginForm(iframe) {
  try {
    console.group("Login Form Debug Information");

    if (!iframe || !iframe.contentDocument) {
      console.error("Invalid iframe or contentDocument is null");
      console.groupEnd();
      return;
    }

    const doc = iframe.contentDocument;

    // Log URL
    console.log("Current iframe URL:", iframe.contentWindow.location.href);

    // Check readyState
    console.log("Document readyState:", doc.readyState);

    // Check for username fields
    const usernameFields = doc.querySelectorAll(
      'input[type="text"], input.username-field, input[name="username"]'
    );
    console.log("Potential username fields found:", usernameFields.length);

    Array.from(usernameFields).forEach((field, i) => {
      console.log(`Username field #${i + 1}:`, {
        tagName: field.tagName,
        type: field.type,
        id: field.id,
        name: field.name,
        class: field.className,
        visible: field.offsetParent !== null,
        attributes: Array.from(field.attributes)
          .map((attr) => `${attr.name}="${attr.value}"`)
          .join(", "),
      });
    });

    // Check for password fields
    const passwordFields = doc.querySelectorAll(
      'input[type="password"], input.password-field, input[name="password"]'
    );
    console.log("Potential password fields found:", passwordFields.length);

    Array.from(passwordFields).forEach((field, i) => {
      console.log(`Password field #${i + 1}:`, {
        tagName: field.tagName,
        type: field.type,
        id: field.id,
        name: field.name,
        class: field.className,
        visible: field.offsetParent !== null,
        attributes: Array.from(field.attributes)
          .map((attr) => `${attr.name}="${attr.value}"`)
          .join(", "),
      });
    });

    // Check for submit buttons or divs
    const potentialSubmitElements = [
      ...Array.from(
        doc.querySelectorAll('button[type="submit"], input[type="submit"]')
      ),
      ...Array.from(
        doc.querySelectorAll(
          'button, div.submit-button, div[role="button"], a.btn'
        )
      ),
      ...Array.from(
        doc.querySelectorAll("div:has(span.button-message), div[tabindex]")
      ),
    ];

    console.log(
      "Potential submit elements found:",
      potentialSubmitElements.length
    );

    potentialSubmitElements.forEach((el, i) => {
      console.log(`Submit element #${i + 1}:`, {
        tagName: el.tagName,
        type: el.type,
        id: el.id,
        class: el.className,
        tabIndex: el.tabIndex,
        textContent: el.textContent.trim(),
        childElements: Array.from(el.children)
          .map(
            (child) =>
              `<${child.tagName.toLowerCase()} class="${child.className}">`
          )
          .join(", "),
        visible: el.offsetParent !== null,
        attributes: Array.from(el.attributes)
          .map((attr) => `${attr.name}="${attr.value}"`)
          .join(", "),
      });
    });

    // Check for form elements
    const forms = doc.querySelectorAll("form");
    console.log("Forms found:", forms.length);

    Array.from(forms).forEach((form, i) => {
      console.log(`Form #${i + 1}:`, {
        id: form.id,
        name: form.name,
        action: form.action,
        method: form.method,
        elements: form.elements.length,
        attributes: Array.from(form.attributes)
          .map((attr) => `${attr.name}="${attr.value}"`)
          .join(", "),
      });
    });

    // Take a screenshot of the login form for debugging if domtoimage is available
    if (
      typeof domtoimage !== "undefined" &&
      typeof domtoimage.toPng === "function"
    ) {
      domtoimage
        .toPng(doc.body, { bgcolor: "#ffffff" }) // Added bgcolor for safety
        .then(function (dataUrl) {
          console.log("Login form screenshot (dom-to-image):", dataUrl);
        })
        .catch(function (error) {
          console.error("dom-to-image error capturing form screenshot:", error);
        });
    } else {
      console.warn(
        "dom-to-image library not found. Cannot capture login form screenshot for debug."
      );
    }

    // Print out login form structure as HTML
    console.log("Login form HTML structure:");
    const loginFormContainer = doc.querySelector("form") || doc.body;
    console.log(loginFormContainer.outerHTML.substring(0, 1000) + "...");

    console.groupEnd();
  } catch (error) {
    console.error("Error in debugLoginForm:", error);
    console.groupEnd();
  }
}

/**
 * Add a debug button to the UI
 */
export function addDebugButton(loginHandler) {
  const loginSection = document.getElementById("loginSection");
  if (!loginSection) return;

  let debugButton = document.getElementById("debugLoginBtn");
  if (debugButton) return; // Already exists

  debugButton = document.createElement("button");
  debugButton.id = "debugLoginBtn";
  debugButton.textContent = "Debug Login Form";
  debugButton.className = "btn btn-small";
  debugButton.style.backgroundColor = "#17a2b8";
  debugButton.style.marginLeft = "10px"; // Keep some spacing

  debugButton.addEventListener("click", () => {
    const iframe = document.getElementById("screenshotIframe");
    if (!iframe) {
      console.error("Screenshot iframe not found");
      return;
    }

    if (!loginHandler || !loginHandler.loginUrl) {
      console.error("Login handler or login URL not available for debug.");
      alert("Login URL not set. Cannot debug login form yet.");
      return;
    }

    // Load login page first
    iframe.src = loginHandler.loginUrl;

    // Add load event listener
    iframe.addEventListener(
      "load",
      () => {
        // Ensure dom-to-image is available before debugging
        if (typeof domtoimage !== "undefined") {
          debugLoginForm(iframe);
        } else {
          console.error(
            "dom-to-image library is not loaded. Cannot execute full debugLoginForm."
          );
          alert("Screenshot library (dom-to-image) not found. Debug limited.");
        }
      },
      { once: true }
    );
  });

  // Try to append it to a more specific container if available, e.g., next to other login controls.
  // For now, appending to loginSection if no better place is found.
  const loginHeader = loginSection.querySelector(".login-header"); // Example: append after header
  if (loginHeader && loginHeader.parentNode === loginSection) {
    loginHeader.appendChild(debugButton); // Append to the header for better placement
  } else {
    loginSection.appendChild(debugButton); // Fallback
  }
}

export default {
  debugLoginForm,
  addDebugButton,
};
