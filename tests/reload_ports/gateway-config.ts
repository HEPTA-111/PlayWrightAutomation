/**
 * Central configuration for all gateways.
 * This is the single source of truth for URLs and passwords.
 */
export const GATEWAY_CONFIGS = {
  "101": {
    url: "http://101.XXX.XXX.XXX:PORT/login_en.html", // <-- UPDATE THIS URL
    password: "gw1013356"
  },
  "102": {
    url: "http://102.XXX.XXX.XXX:PORT/login_en.html", // <-- UPDATE THIS URL
    password: "gw1023356"
  },
  "103": {
    url: "http://103.230.216.39:50932/login_en.html", // This one should be correct
    password: "gw1033356"
  },
  "104": {
    url: "http://104.XXX.XXX.XXX:PORT/login_en.html", // <-- UPDATE THIS URL
    password: "gw1043356"
  },
  // Add 105-110 here when you are ready
};

// This is a type helper, no need to edit
export type GatewayId = keyof typeof GATEWAY_CONFIGS;