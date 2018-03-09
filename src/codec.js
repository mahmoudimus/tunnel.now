const { codec, uint, string, json, u8 } = require('cereal-box');


exports.request = codec({
    id: uint,
    url: string,
    method: string,
    headers: json,
    body: u8
});

exports.response = codec({
    id: uint,
    statusCode: uint,
    headers: json,
    body: u8
});
