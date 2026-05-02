// filter/filterClient.js
// Holds a reference to the Discord client so filter modules can send report
// pings without needing a message object in scope. Set once in ready.js.

let _client = null;

export function setClient(client) {
  _client = client;
}

export function getClient() {
  return _client;
}
