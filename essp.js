"use strict";
import fs from 'fs'
import serialport from 'serialport'
import Commands from './commands'
import forge from 'node-forge'
import convertHex from "convert-hex"
import bigInt from "big-integer"
import EventEmitter from "event-emitter-es6"
export default class eSSP extends EventEmitter {
    constructor() {
        super()
        this.options = {};
        this.port = null;
        this.commands = null
        this.keys = {
            generatorKey: null,
            modulusKey: null,
            hostRandom: null,
            hostIntKey: null,
            slaveIntKey: null,
            fixedKey: Buffer.from("0123456701234567", "hex"),
            variableKey: null,
            key: null,
            negotiateKeys: false,
            set_generator: false,
            set_modulus: false,
            request_key_exchange: false,
            finishEncryption: false
        }
    }

    initialize(opts) {
        let options = this.options = {
            device: opts.device || null,
            baudrate: opts.baudrate || 9600,
            databits: opts.databits || 8,
            stopbits: opts.stopbits || 2,
            parity: opts.parity && ['even', 'mark', 'odd', 'space'].indexOf(opts.parity.toString().toLowerCase()) > -1 ? opts.parity : 'none',
            currencies: opts.currencies || [1, 0, 1],
            type: opts.type || "nv10usb",
            sspID: opts.sspID || 0,
            seqence: opts.sequence || 0x80
        };
        if (fs.readdirSync(__dirname + '/commands').map(function (item) {
                return item.replace(/\..+$/, '');
            }).indexOf(options.type) === -1) {
            throw new Error("Unknown device type '" + options.type + "'");
        }
        this.initializeDevice(options);
    }

    initializeDevice(options) {
        var port = new serialport.SerialPort(options.device, {
            baudrate: options.baudrate,
            databits: options.databits,
            stopbits: options.stopbits,
            parity: options.parity,
            parser: serialport.parsers.raw
        }, false);

        this.port = port;
        port.on('close', function () {
            self.emit('close');
            console.log('close:');
        });
        port.on('error', function (err) {
            self.emit('error', err);
            console.log('error:', err);
        });
        port.on('readable', function () {
            console.log('Data:', port.read());
        });
        port.open(function (err) {
            console.log(err)
        })
    }

    async initiateKeys() {
        var getRandomInt = function (min, max) {
            return Math.floor(Math.random() * (max - min)) + min;
        }

        var keyPair = forge.pki.rsa.generateKeyPair(64);
        this.keys.generatorKey = keyPair.privateKey.p;
        this.keys.modulusKey = keyPair.privateKey.q;
        this.keys.hostRandom = getRandomInt(1, 5);
        this.keys.hostIntKey = this.keys.generatorKey ^ this.keys.hostRandom % this.keys.modulusKey
        this.keys.negotiateKeys = true

        let data = await this.sendGenerator()
        console.log(data)
    }

    CRC16(command) {
        var length = command.length,
            seed = 0xFFFF,
            poly = 0x8005,
            crc = seed;

        for (var i = 0; i < length; i++) {
            crc ^= (command[i] << 8);
            for (var j = 0; j < 8; j++) {
                if (crc & 0x8000) {
                    crc = ((crc << 1) & 0xffff) ^ poly;
                } else {
                    crc <<= 1;
                }
            }
        }
        return [(crc & 0xFF), ((crc >> 8) & 0xFF)];
    }

    exec(command, args) {
        var self = this;
        var commandLine
        var STX = 0x7F
        var LENGTH = args.length + 1
        var SEQ_SLAVE_ID = this.getSequence()
        var DATA = [command].concat(args)

        commandLine = [SEQ_SLAVE_ID, LENGTH].concat(DATA);
        var crc = this.CRC16(commandLine);

        commandLine = [STX].concat(commandLine, crc);
        var hex = commandLine.map(function (item) {
            return item.toString(16).toUpperCase()
        })
        console.log("COM1 => ", hex, "| UNENCRYPTED |", arguments[0])

        if (self.keys != null) {
            var STEX = 0x7E
            var eLENGTH = DATA.length;
            self.count++
            var eCOUNT = this.parseHexString(this.count.toString(16), 4)
            var eDATA = DATA
            var ePACKING = 0x00
            var eCommandLine = [eLENGTH].concat(eCOUNT, eDATA, ePACKING)
            var eCRC = this.CRC16(eCommandLine);
            eCommandLine = eCommandLine.concat(eCRC)

            var parse = function (a, count) {
                for (var i = a.length; i < count; i++) {
                    a.push(0)
                }
                return a;
            }
            var key = parse(Array.prototype.slice.call(self.keys.fixedKey, 0).reverse(), 8).concat(this.parseHexString(self.keys.key, 8))

            var aesCtr = new aesjs.ModeOfOperation.ctr(key);
            var uint8Array = aesCtr.encrypt(eCommandLine);
            eCommandLine = [STEX].concat([].slice.call(uint8Array))
            DATA = eCommandLine
            LENGTH = DATA.length
        }

        commandLine = [SEQ_SLAVE_ID, LENGTH].concat(DATA);
        crc = this.CRC16(commandLine);
        commandLine = [STX].concat(commandLine, crc);

        if (self.keys != null) {
            var hex = commandLine.map(function (item) {
                return item.toString(16).toUpperCase()
            })
            console.log("COM1 =>", hex, "| ENCRYPTED |", arguments[0])
        }
        console.log(commandline)
    }

    parseHexString(str, count) {
        var a = [];
        for (var i = str.length; i > 0; i -= 2) {
            a.push(parseInt(str.substr(i - 2, 2), 16));
        }
        for (var i = a.length; i < count; i++) {
            a.push(0)
        }
        return a;
    }

    async sendGenerator() {
        var generatorArray = this.parseHexString(this.keys.generatorKey.toString(16), 8)
        this.keys.set_generator = true;
        var packet = this.exec(0x11,generatorArray)
        console.log(packet)
        var buf = new Buffer(packet)
        return new Promise((resolve, reject) => {
            port.write(src);
            port.once('data', (data) => {
                resolve(data.toString());
            });

            port.once('error', (err) => {
                reject(err);
            });
        });
    }

    sendModulus() {
        var modulusArray = this.parseHexString(this.keys.modulusKey.toString(16), 8)
        this.keys.set_modulus = true;
    }

    sendRequestKeyExchange() {
        var hostIntArray = this.parseHexString(this.keys.hostIntKey.toString(16), 8)
        this.keys.request_key_exchange = true;
    }

    createHostEncryptionKeys(data) {
        if (this.keys.key == null) {
            data.shift()
            var hexString = convertHex.bytesToHex(data.reverse());

            var slaveIntKey = bigInt(hexString, 16);
            var slaveIntKeyString = ""
            if (!slaveIntKey.isSmall) {
                var values = slaveIntKey.value.reverse();
                for (var i = 0; i < values.length; i++) {
                    slaveIntKeyString += "" + values[i]
                }
            } else {
                slaveIntKeyString = slaveIntKey.value
            }
            this.keys.slaveIntKey = slaveIntKeyString
            this.keys.key = this.keys.slaveIntKey ^ this.keys.hostRandom % this.keys.modulusKey
            this.keys.variableKey = self.keys.key
            this.keys.finishEncryption = true
            this.emit("ready");

        }
    }
}

