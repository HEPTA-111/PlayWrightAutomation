/**
 * Central configuration for all gateways.
 * This is the single source of truth for URLs and passwords.
 */
export const GATEWAY_CONFIGS = {
  "101": {
    url: "http://192.168.1.101/login_en.html", // <-- UPDATE THIS URL
    password: "gw1013356"
  },
  "102": {
    url: "http://192.168.1.102/login_en.html", // <-- UPDATE THIS URL
    password: "gw1023356"
  },
  "103": {
    url: "http://103.230.216.39:50932/login_en.html", // This one should be correct
    password: "gw1033356"
  },
  "104": {
    url: "http://192.168.1.104/login_en.html", // <-- UPDATE THIS URL
    password: "gw1043356"
  },
  "105": {
    url: "http://192.168.1.105/login_en.html", // <-- UPDATE THIS URL
    password: "gw1053356"
  },
  "106": {
    url: "http://192.168.1.106/login_en.html", // <-- UPDATE THIS URL
    password: "gw1063356"
  },
  "107": {
    url: "http://192.168.1.107/login_en.html", // This one should be correct
    password: "gw1073356"
  },
  "108": {
    url: "http://192.168.1.108/login_en.html", // <-- UPDATE THIS URL
    password: "gw1083356"
  },
   "109": {
    url: "http://192.168.1.109/login_en.html", // This one should be correct
    password: "gw1093356"
  },
  "110": {
    url: "http://192.168.1.110/login_en.html", // <-- UPDATE THIS URL
    password: "gw1103356"
  },
};

// This is a type helper, no need to edit
export type GatewayId = keyof typeof GATEWAY_CONFIGS;