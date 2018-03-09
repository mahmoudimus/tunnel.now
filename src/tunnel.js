#!/usr/bin/env node

const yargs = require("yargs");
const WebSocket = require("ws");
const { default: fetch, Headers } = require("node-fetch");

const {
  request: { decode: decodeRequest },
  response: { encode: encodeResponse }
} = require("./codec");


const { _: [ remoteHostname, localPort ] } = yargs
  .usage('tunnel.now <remote-hostname> <local-port>')
  .help()
  .argv;

if (!remoteHostname) {
  console.error("You must supply a name for a remote host, listening on port 443.");
  process.exit(1);
}
if (!localPort) {
  console.error("You must indicate which local port that requests should be forwarded to.");
  process.exit(1);
}

const baseTargetUrl = `http://localhost:${localPort}`;

const uri = `wss://${remoteHostname}:443`;
const socket = new WebSocket(uri);

socket.addEventListener("open", () => {
  console.log(`Connected to ${uri}.`);
  console.log(`Tunneling requests to ${baseTargetUrl}...`);
});

socket.addEventListener("message", ev => {
  const {
    id,
    url,
    method,
    headers,
    body
  } = decodeRequest(ev.data);

  console.log(`> ${method} ${url}`);

  const response = fetch(`${baseTargetUrl}${url}`, {
      method,
      headers,
      // Alternately, `Buffer.from(body.slice().buffer)`.
      body: Buffer.from(body.buffer, body.byteOffset, body.length),
      redirect: "follow"
  });
    /*
      var buffer = resp.buffer();
      return new Promise(function(resolve, reject) {
      resolve([buffer, resp]);
      });
      })

*/
    response
        .then((resp) => new Promise(function(resolve, reject) {
            resp.buffer().then(function(x) {
                resolve({x: x, resp: resp});
            });
        }))
        .then(resp => {
            return new Promise(function(resolve, reject) {
                var encoded = encodeResponse({
                    id: id,
                    statusCode: resp.resp.status,
                    headers: resp.resp.headers,
                    body: resp.x
                });
                console.log(resp.x);
                socket.send(encoded);
                resolve(encoded);
            });
        })
        .catch(err => {
            console.error('dang it');
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
