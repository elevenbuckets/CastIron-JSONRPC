'use strict';

const fs = require('fs');
const jayson = require('jayson/promise');

let buff = fs.readFileSync('../.local/config.json');
let cfgobj = JSON.parse(buff.toString());

// create a client
const client = jayson.client.http({
  port: 3000
});

client.request('initialize', cfgobj)
    .then((rc) => {
	console.log(rc);
	return client.request('accounts', []);
    })
    .then((results) => {
	console.log(JSON.stringify(results,0,2));
    })
    .catch((err) => { client.close(); throw(err); });
