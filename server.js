'use strict';

const jayson = require('jayson/promise');
const Web3   = require('web3');
const net    = require('net');
const os     = require('os');
const path   = require('path');
const fs     = require('fs');

const web3EthFulfill = require( __dirname + '/conditions/Web3/Fulfill.js' );
const web3EthSanity  = require( __dirname + '/conditions/Web3/Sanity.js' );

const allConditions  = { ...web3EthSanity, ...web3EthFulfill };

class BladeIron {
	constructor() 
	{
		this.web3 = new Web3();
		this.web3.toAddress = address => {
                        let addr = String(this.web3.toHex(this.web3.toBigNumber(address)));

                        if (addr.length === 42) {
                                return addr
                        } else if (addr.length > 42) {
                                throw "Not valid address";
                        }

                        let pz = 42 - addr.length;
                        addr = addr.replace('0x', '0x' + '0'.repeat(pz));

                        return addr;
                };

		this.ipc3 = new Web3();

		this.CUE = { 'Web3': { 'ETH': {'sendTransaction': this.web3.eth.sendTransaction } } };
                Object.keys(allConditions).map( (f) => { if(typeof(this[f]) === 'undefined') this[f] = allConditions[f] } );

		this.setup = (cfgobj) => {
			this.configs = cfgobj;
	                this.rpcAddr = this.configs.rpcAddr || null;
        	        this.ipcPath = this.configs.ipcPath || null;
			this.networkID = this.configs.networkID || 'NO_CONFIG';
		}
	
		this.connectRPC = () => 
		{
	                const __connectRPC = (resolve, reject) => {
	                        try {
	                                if (
	                                    this.web3 instanceof Web3
	                                 && this.web3.net._requestManager.provider instanceof Web3.providers.HttpProvider
	                                ) {
	
	                                        if (this.networkID === 'NO_CONNECTION') this.networkID = this.configs.networkID; // reconnected
	                                        if (this.web3.version.network != this.networkID) {
	                                                throw(`Connected to network with wrong ID: wants: ${this.networkID}; geth: ${this.web3.net.version}`);
	                                        }
	
	                                        resolve(true);
	                                } else if (this.web3 instanceof Web3) {
	                                        this.web3.setProvider(new Web3.providers.HttpProvider(this.rpcAddr));
	
	                                        if (this.networkID === 'NO_CONNECTION') this.networkID = this.configs.networkID; // reconnected
	                                        if (this.web3.version.network != this.networkID) {
	                                                throw(`Connected to network with wrong ID: wants: ${this.networkID}; geth: ${this.web3.net.version}`);
	                                        }
	
	                                        resolve(true);
	                                } else {
	                                        reject(false);
	                                }
	                        } catch (err) {
	                                console.log(err);
	                                reject(false);
	                        }
	                }
	
	                return new Promise(__connectRPC);
	        }
	
		this.connectIPC = () => 
		{
	                const __connectIPC = (resolve, reject) => {
	                        try {
	                                if (
	                                    this.ipc3 instanceof Web3
	                                 && this.ipc3.net._requestManager.provider instanceof Web3.providers.IpcProvider
	                                ) {
	                                        resolve(true);
	                                } else if (this.ipc3 instanceof Web3) {
	                                        this.ipc3.setProvider(new Web3.providers.IpcProvider(this.ipcPath, net));
	                                        resolve(true);
	                                } else {
	                                        reject(false);
	                                }
	                        } catch (err) {
	                                console.log(err);
	                                reject(false);
	                        }
	                }
	
	                return new Promise(__connectIPC);
	        }	
	
		this.connect = () => {
	                let stage = Promise.resolve();
	
	                stage = stage.then(() => {
	                        return this.connectRPC();
	                })
	                .then((rc) => {
	                        if (rc) {
	                                return this.connectIPC();
	                        } else {
	                                throw("no connection");
	                        }
	                })
	                .catch((err) => {
	                        this.networkID = 'NO_CONNECTION';
	                        return Promise.resolve(false);
	                });
	
	                return stage;
	        }
	
		this.allAccounts = () => { return this.web3.eth.accounts; }
	}
}

const biapi = new BladeIron();

// create a server
var server = jayson.server(
    {
        initialize(obj) { 
		biapi.setup(obj); 
		console.log(obj);
		return biapi.connect(); 
	}, // should be able to sanity check the provided config object
	accounts() { console.log('accounts'); return Promise.resolve(biapi.allAccounts()); }	
    }
);

server.http().listen(3000);
