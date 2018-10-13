'use strict';

const jayson = require('jayson/promise');
const Web3   = require('web3');
const net    = require('net');
const os     = require('os');
const path   = require('path');
const fs     = require('fs');
const uuid  = require('uuid/v4');
const bcup  = require('buttercup');
const { createCredentials, FileDatasource } = bcup;
const masterpw = new WeakMap();

const web3EthFulfill = require( __dirname + '/conditions/Web3/Fulfill.js' );
const web3EthSanity  = require( __dirname + '/conditions/Web3/Sanity.js' );

const allConditions  = { ...web3EthSanity, ...web3EthFulfill };

class BladeIron {
	constructor() 
	{
		masterpw.set(this, {passwd: null});

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
	                this.condition = this.configs.condition || null; // 'sanity' or 'fulfill'
	                this.archfile  = this.configs.passVault || null;

			if (this.archfile !== null) {
	                        this.ds = new FileDatasource(this.archfile);
        	        } else {
                	        this.ds = {};
                	}
		}

		this.password = (value) => { masterpw.get(this).passwd = value };

		this.validPass = () =>
	        {
	               let pw = masterpw.get(this).passwd;
	               return this.ds.load(createCredentials.fromPassword(pw)).then( (myArchive) =>
	                      {
	                         return true;
	                      })
	                      .catch( (err) =>
	                      {
	                         return false;
	                      });
	        }

		this.managedAddress = (address) =>
	        {
	               let pw = masterpw.get(this).passwd;
	               return this.ds.load(createCredentials.fromPassword(pw)).then( (myArchive) =>
	                      {
	                        let vaults = myArchive.findGroupsByTitle("ElevenBuckets")[0];
	                        let passes = undefined;
	
	                        try {
	                                passes = vaults.findEntriesByProperty('username', address)[0].getProperty('password');
	                        } catch(err) {
	                                console.log(err);
	                                passes = undefined;
	                        }
	
	                        return typeof(passes) === 'undefined' ? {[address]: false} : {[address]: true};
	                      })
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

		this.ethNetStatus = () =>
	        {
	                if (this.web3.net.peerCount === 0 && this.web3.eth.mining === false) {
	                        return {blockHeight: 0, blockTime: 0, highestBlock: 0};
	                }
	
	                let sync = this.web3.eth.syncing;
	
	                if (sync === false) {
	                        let blockHeight = this.web3.eth.blockNumber;
	                        let blockTime;
	
	                        try {
	                                blockTime = this.web3.eth.getBlock(blockHeight).timestamp;
	                        } catch(err) {
	                                blockTime = 0;
	                                blockHeight = 0;
	                        }
	
	                        return {blockHeight, blockTime, highestBlock: blockHeight};
	                } else {
	                        let blockHeight = sync.currentBlock;
	                        let highestBlock = sync.highestBlock;
	                        let blockTime;
	                        try {
	                                blockTime = this.web3.eth.getBlock(blockHeight).timestamp;
	                        } catch(err) {
	                                blockTime = 0;
	                                blockHeight = 0;
	                                highestBlock = 0;
	                        }
	
	                        return {blockHeight, blockTime, highestBlock};
	                }
	        }

		this.addrEtherBalance = addr => { return this.web3.eth.getBalance(addr); }
		this.byte32ToAddress = (b) => { return this.web3.toAddress(this.web3.toHex(this.web3.toBigNumber(String(b)))); };
	        this.byte32ToDecimal = (b) => { return this.web3.toDecimal(this.web3.toBigNumber(String(b))); };
        	this.byte32ToBigNumber = (b) => { return this.web3.toBigNumber(String(b)); };

		this.unlockViaIPC = passwd => addr =>
	        {
	                const __unlockToExec = (resolve, reject) => {
	                        this.ipc3.personal.unlockAccount(addr, passwd, 120, (error, result) => {
	                                if (error) {
	                                        reject(error);
	                                } else if (result != true) {
	                                        setTimeout( () => __unlockToExec(resolve, reject), 500 );
	                                } else {
	                                        resolve(true);
	                                }
	                        });
	                };
	
	                return new Promise(__unlockToExec);
	        }

		this.configured = () => 
		{
                	if (this.networkID === 'NO_CONFIG') {
                        	return false;
                	} else {
                        	return true;
                	}
        	}

		this.closeIPC = () =>
	        {
	                const __closeIPC = (resolve, reject) => {
	                        try {
	                                if (
	                                    this.ipc3 instanceof Web3
	                                 && this.ipc3.net._requestManager.provider instanceof Web3.providers.IpcProvider
	                                ) {
	                                        console.log("Shutdown ipc connection!!!");
	                                        resolve(this.ipc3.net._requestManager.provider.connection.destroy());
	                                } else if (this.ipc3 instanceof Web3) {
	                                        console.log("Still pending to shutdown ipc connection!!!");
	                                        setTimeout( () => __closeIPC(resolve, reject), 500 );
	                                }
	                        } catch (err) {
	                                console.log("Uh Oh...... (closeIPC)" + err);
	                                reject(false);
	                        }
	                };
	
	                return new Promise(__closeIPC);
	        }

		this.connected = () => 
		{
	                if (!this.configured()) return false;
	
	                let live;
	                try {
	                        live = this.web3 instanceof Web3 && this.web3.net._requestManager.provider instanceof Web3.providers.HttpProvider;
	                        this.web3.net.listening
	                } catch(err) {
	                        live = false;
	                }
	
	                return live;
	        }

		this.getReceipt = (txHash, interval) =>
	        {
	                if (txHash === '0x0000000000000000000000000000000000000000000000000000000000000000') {
	                        return Promise.resolve({transactionHash: txHash});
	                }
	
	                const transactionReceiptAsync = (resolve, reject) => {
	                        this.web3.eth.getTransactionReceipt(txHash, (error, receipt) => {
	                                if (error) {
	                                        reject(error);
	                                } else if (receipt == null) {
	                                        setTimeout( () => transactionReceiptAsync(resolve, reject), interval ? interval : 500);
	                                } else {
	                                        resolve(receipt);
	                                }
	                        });
	                };
	
	                if (Array.isArray(txHash)) {
	                        return Promise.all( txHash.map(oneTxHash => this.getReceipt(oneTxHash, interval)) );
	                } else if (typeof txHash === "string") {
	                        return new Promise(transactionReceiptAsync);
	                } else {
	                        throw new Error("Invalid Type: " + txHash);
	                }
	        }

		this.gasCostEst = (addr, txObj) =>
	        {
	                if (
	                        txObj.hasOwnProperty('gas') == false
	                     || txObj.hasOwnProperty('gasPrice') == false
	                ) { throw new Error("txObj does not contain gas-related information"); }
	
	                let gasBN = this.web3.toBigNumber(txObj.gas);
	                let gasPriceBN = this.web3.toBigNumber(txObj.gasPrice);
	                let gasCost = gasBN.mul(gasPriceBN);
	
	                return gasCost;
	        }

		this.version = '1.0'; // API version
                this.jobQ = {}; // Should use setter / getter
                this.rcdQ = {}; // Should use setter / getter
		
	  			
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
