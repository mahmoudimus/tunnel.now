const { createServer } = require("http");

const yargs = require("yargs");
const WebSocket = require("ws");
const getRawBody = require("raw-body");

const {
  request: { encode: encodeRequest },
  response: { decode: decodeResponse }
} = require("./codec");


const { _: [ port = 8008 ] } = yargs
  .usage('$0 [port]')
  .help()
  .argv;


let activeConnection = null;
let nextId = 0;

const responseRefs = {};
const server = createServer((req, res) => {
  if (!activeConnection) {
    res.statusCode = 503;
    res.end("Tunneling client is not currently connected.");
  }

  getRawBody(req).then(buffer => {
    const id = nextId++;
    responseRefs[id] = res;
    activeConnection.send(encodeRequest({
      id,
      url: req.url,
      method: req.method,
      headers: req.headers,
      // Buffers behave like instances of Uint8Arrays.
      body: buffer
    }));
  });
});

const handleResponse = message => {
  if (message === "PING") { return; }
  const decodedMessage = decodeResponse(message);
  const { id, statusCode, headers, body } = decodedMessage;
  const res = responseRefs[id];
  responseRefs[id] = null;
  res.statusCode = statusCode;
  // sometimes headers is undefined and null, this will crash the server if
  // that's the case
  if(typeof headers !== 'undefined' && headers) {
    Object.keys(headers).forEach(key => res.setHeader(key, headers[key]));
  }

  // Alternately, `Buffer.from(body.slice().buffer)`.
  res.end(Buffer.from(body.buffer, body.byteOffset, body.length));
};

const wsServer = new WebSocket.Server({ server });
wsServer.on("connection", (ws, req) => {
  if (activeConnection) { ws.close("A client is already connected."); }
  const remoteIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  console.log(`Tunnel connected from $${remoteIP}.`);
  activeConnection = ws;
  ws.on("close", () => {
    activeConnection = null;
    console.log(`Tunnel disconnected from $${remoteIP}.`);
  });
  ws.on("message", handleResponse);
});

server.listen(port, () => {
  console.log(`Listening on port ${server.address().port}...`);
});

/* there are some errors that can occur, we should know what they are */
process.on('uncaughtException', function(err) {
  console.log(err.stack);
  throw err;
});
