'use strict';

const fs = require('fs');
const path = require('path');
const rpc = require('jayson/promise');
const web3 = require('web3');
const w = new web3();

// What should options look like:
/* 
 * {
 * 	"appName": "DLogs",
 * 	"artifactDir": "/home/jasonlin/Proj/Playground/dlogs/build/contracts",
 * 	"conditionDir": "/home/jasonlin/Proj/Playground/ethsf_dlogs/conditions",
 * 	"contracts": [{ "ctrName": "DLogs", "conditions": ["Sanity"] }],
 * 	"networkID": 4,
 * 	"version": "1.0"
 * }
 *
 */

class BladeAPI {
	constructor(options) // options is an object 
	{
		// option import + setup
		this.configs = options;
		this.appName = options.appName;
		this.networkID = options.networkID;

		this.ready = false;
		this.client;
		this.ABI = {};

		// special case, should not be needed when UI is migrated to BladeIron
		this.cfgObjs = { geth: {}, ipfs: {} };

		this.connectRPC = (port) => (host = '127.0.0.1') => 
		{
			this.client = rpc.client.http({host, port});
		}

		this._getABI = (ctrName = this.appName) =>
		{
			let artifactPath = path.join(this.configs.artifactDir, ctrName + '.json');
			let Artifact = JSON.parse(fs.readFileSync(artifactPath).toString()); // truffle artifact
			this.ABI[ctrName] = Artifact.abi;
                	//let contractAddress = Artifact.networks[this.networkID].address;

			return [this.appName, this.configs.version, ctrName, path.join(this.configs.artifactDir, ctrName + '.json')]
		}

		this.toAscii = (input) => { return w.toAscii(input) };
		this.toHex   = (input) => { return w.toHex(input) };
		this.toBigNumber = (input) => { return w.toBigNumber(input) };
		this.toDecimal = (input) => { return w.toDecimal(input) };

		this.toAddress = address => {
                        let addr = String(this.toHex(this.toBigNumber(address)));

                        if (addr.length === 42) {
                                return addr
                        } else if (addr.length > 42) {
                                throw "Not valid address";
                        }

                        let pz = 42 - addr.length;
                        addr = addr.replace('0x', '0x' + '0'.repeat(pz));

                        return addr;
                };

		this.byte32ToAddress = (b) => { return this.toAddress(this.toHex(this.toBigNumber(String(b)))); };
        	this.byte32ToDecimal = (b) => { return this.toDecimal(this.toBigNumber(String(b))); };
        	this.byte32ToBigNumber = (b) => { return this.toBigNumber(String(b)); };

		this.getCtrConf = (ctrName = this.appName) => (condType = "Sanity") =>
		{
			let output = this._getABI(ctrName); let condition = {};
			let _c = this.configs.contracts.filter( (c) => { return (c.ctrName === ctrName && c.conditions.indexOf(condType) !== -1) });
			if (_c.length === 1) {
				condition = { [condType]: path.join(this.configs.conditionDir, this.appName, ctrName, condType + '.js') }; 
			}

			return [...output, condition];
		}

		this.init = (masterpass) => 
		{
			// special case here as master awaker. this.init() should not need to pass in master password 
			return this.client.request('connected', [])
		    		.then((rc) => {
		        		if (rc.result !== true) return this.client.request('initialize', this.cfgObjs.geth);
		        		console.log("server already initialized");
		        		return {result: true};
		    		})
				.then((rc) => {
					if (!rc.result) throw "Unconfigured server...";
					return this.client.request('hasPass', []);
				})
				.then((rc) => {
				        if (rc.result === false) {
		                		console.log('server master no set ...');
		                		return this.client.request('unlock', [masterpass]);
		        		} else if (rc.result === true) {
		                		console.log('server master has been awaken');
		                		return {result: true};
		        		} else {
		                		console.log('DEBUG:');
		                		console.log(JSON.stringify(rc,0,2));
		                		return {result: false};
		        		}
		    		})
				.then((rc) => {
					let reqs = this.configs.contracts.map((c) => {
						return this.client.request('newApp', this.getCtrConf(c.ctrName)());
					});
					
					return Promise.all(reqs);
				})
				.then((rc) => {
					console.log(rc);
					return this.client.request('ipfs_connected', []);
				})
				.then((rc) => {
					console.log('IPFS Init:'); console.log(rc);
					if (!rc.result) return this.client.request('ipfs_initialize', this.cfgObjs.ipfs);
					console.log('IPFS already initialized ...');
					return {result: true};
				})
		}

                this.call = (ctrName = this.appName) => (callName) => (...args) =>
                {
                        return this.client.request('call', {appName: this.appName, ctrName, callName, args})
                }

		// This should eventually become standardize, base class function that can handle all kinds of calls 
                // it should learn more from ABI about possible calls. Right now we only have one contract in the app,
                // so the input argument can ignore the ctrName...
                //
                // Usage:
                //
                //      this.sendTk('ctrName')('register')(address, ipfsHash)(); // default amount is set to null
                //
                this.sendTk = (ctrName) => (callName) => (...__args) => (amount = null) =>
                {
                        let gasAmount = 250000; // should have dedicated request for gas estimation

                        let tkObj = {};
                        __args.map((i,j) => { tkObj = { ...tkObj, ['arg'+j]: i } });
                        let args = Object.keys(tkObj).sort();

                        return this.client.request('enqueueTk', [this.appName, ctrName, callName, args, amount, gasAmount, tkObj])
                                   .then((rc) => { let jobObj = rc.result; return this.client.request('processJobs', [jobObj]); });
                }

                this.bytes32ToAscii = (b) => {
                        return this.toAscii(this.toHex(this.toBigNumber(String(b))))
                }
	}
}

module.exports = BladeAPI;
