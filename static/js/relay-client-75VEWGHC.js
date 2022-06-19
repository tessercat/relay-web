(() => {
  // src/relay-client.js
  var RelayClient = class {
    call(callee) {
      console.log(callee);
    }
  };
  window.RelayClient = RelayClient;
})();
