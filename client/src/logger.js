function _getPrefix(prefix) {
  return `[${prefix} ${new Date().toLocaleTimeString()}]`;
}

let logger = {
  debug: (caller, ...args) => {
    if (document.debugLogEnabled) {
      console.debug(_getPrefix(caller.constructor.name), ...args);
    }
  },
  info: (caller, ...args) => {
    if (document.infoLogEnabled) {
      console.log(_getPrefix(caller.constructor.name), ...args);
    }
  },
  error: (caller, ...args) => {
    console.error(_getPrefix(caller.constructor.name), ...args);
  }
}

export { logger };
