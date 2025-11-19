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
  "105": {
    url: "http://105.XXX.XXX.XXX:PORT/login_en.html", // <-- UPDATE THIS URL
    password: "gw1053356"
  },
  "106": {
    url: "http://106.XXX.XXX.XXX:PORT/login_en.html", // <-- UPDATE THIS URL
    password: "gw1063356"
  },
  "107": {
    url: "http://107.230.216.39:50932/login_en.html", // This one should be correct
    password: "gw1073356"
  },
  "108": {
    url: "http://108.XXX.XXX.XXX:PORT/login_en.html", // <-- UPDATE THIS URL
    password: "gw1083356"
  },
   "109": {
    url: "http://109.XXX.XXX.XXX:PORT/login_en.html", // This one should be correct
    password: "gw1093356"
  },
  "110": {
    url: "http://110.XXX.XXX.XXX:PORT/login_en.html", // <-- UPDATE THIS URL
    password: "gw1103356"
  },
};

// This is a type helper, no need to edit
export type GatewayId = keyof typeof GATEWAY_CONFIGS;