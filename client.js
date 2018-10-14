'use strict';

const fs = require('fs');
const jayson = require('jayson/promise');

let buff = fs.readFileSync('/home/jasonlin/.rinkeby/config.json');
let cfgobj = JSON.parse(buff.toString());

// create a client
const client = jayson.client.http({
  port: 3000
});

let accounts = [];

client.request('connected', [])
    .then((rc) => {
	if (rc.result !== true) return client.request('initialize', cfgobj);
	console.log("server already initialized");
	return true;
    })
    .then((rc) => {
	return client.request('accounts', []);
    })
    .then((results) => {
	console.log(JSON.stringify(results,0,2));
	accounts = results.result;
	return client.request('hasPass', []);
    })
    .then((rc) => {
	if (rc.result === false) {
		console.log('server master no set ...');
		return client.request('unlock', ['masterpass']);
	} else if (rc.result === true) {
		console.log('server master has been awaken');
		return 'READY';
	} else {
		console.log('DEBUG:');
		console.log(JSON.stringify(rc,0,2));
		return false;
	}
    })
    .then((rc) => {
	if (!rc.result) {
		console.log(JSON.stringify(rc,0,2));
		throw('Wrong master password');
	}

	console.log('server master awaken');
	console.log(JSON.stringify(rc,0,2));

	let myAddr = accounts[0];
	return client.request('setAccount', [myAddr]);
    })
    .then((rc) => {
	let toAddr = accounts[1];
	let gasAmount = '22000';
	let tokenSymbol = 'ETH';
	let amount = '133000000000000000'; // 0.133 eth
        return client.request('sendTx', [tokenSymbol, toAddr, amount, gasAmount]);
    })
    .then((rc) => {
	let QID = rc.result; 
	console.log('QID = ' + QID);
	return client.request('getReceipts', [QID]);
    })
    .then((rc) => {
	console.log(JSON.stringify(rc,0,2));
    })
    .catch((err) => { throw(err); process.exit(1); });
