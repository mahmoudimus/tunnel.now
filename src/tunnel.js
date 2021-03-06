#!/usr/bin/env node

const yargs = require("yargs");
const WebSocket = require("ws");
const { default: fetch, Headers } = require("node-fetch");

const {
  request: { decode: decodeRequest },
  response: { encode: encodeResponse }
} = require("./codec");

const cliArgs = yargs
 .usage('tunnel.now <remote-hostname> <local-port> [debug]')
 .help()
 .argv;

const { _: [remoteHostname, localPort] } = cliArgs;

if (!remoteHostname) {
  let port = cliArgs.debug ? '8008' : '443';
  console.error(`You must supply a name for a remote host, listening on ${port}`);
  process.exit(1);
}
if (!localPort) {
  console.error("You must indicate which local port that requests should be forwarded to.");
  process.exit(1);
}

const baseTargetUrl = `http://localhost:${localPort}`;
const uri = cliArgs.debug ? `ws://${remoteHostname}:8008` : `wss://${remoteHostname}:443`;

const socket = new WebSocket(uri);

socket.addEventListener("open", () => {
  console.log(`Connected to ${uri}.`);
  console.log(`Tunneling requests to ${baseTargetUrl}...`);
});

socket.addEventListener("message", ev => {
  const decodedReq = decodeRequest(ev.data);
  const {
    id,
    url,
    method,
    headers,
    body
  } = decodedReq;

  console.log(`> ${method} ${url}`);
  const response = fetch(`${baseTargetUrl}${url}`, {
    method,
    headers,
    // Alternately, `Buffer.from(body.slice().buffer)`.
    body: Buffer.from(body.buffer, body.byteOffset, body.length),
    redirect: "manual"
  });
  response
    .then((resp) => new Promise(function(resolve, reject) {
      resp.buffer().then(function(buffer) {
        resolve({buffer: buffer, response: resp});
      });
    }))
    .then(resp => {
      return new Promise(function(resolve, reject) {
        let encoded = encodeResponse({
          id: id,
          statusCode: resp.response.status,
          headers: resp.response.headers.raw(),
          body: resp.buffer
        });
        socket.send(encoded);
        resolve(encoded);
      });
    })
    .catch(err => {
      console.error(err);
    });
});

const keepAliveId = setInterval(() => {
  socket.send("PING");
}, 60000);

socket.addEventListener("close", () => {
  clearInterval(keepAliveId);
  console.log("The connection has been terminated.");
});

socket.addEventListener("error", ev => {
  if (ev.code === "ECONNREFUSED") {
    console.log("We were unable to establish a connection with the server.");
  } else {
    console.log(ev.toString());
  }
});

/* there are some errors that can occur, we should know what they are */
process.on('uncaughtException', function(err) {
  console.log(err.stack);
  throw err;
});
