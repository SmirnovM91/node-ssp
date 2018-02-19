"use strict";
import fs from 'fs'
import serialport from 'serialport'
import Commands from './commands'
import forge from 'node-forge'
import convertHex from "convert-hex"
import bigInt from "big-integer"
import EventEmitter from "event-emitter-es6"
import chalk from 'chalk'
import moment from 'moment'
import aesjs from 'aes-js';

export default class eSSP extends EventEmitter {
    constructor() {
        super()
        this.options = {};
        this.port = null;
        this.commands = null
        this.count = 0
        this.sequence = 0x80;
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

        var port = new serialport.SerialPort(options.device, {
            baudrate: options.baudrate,
            databits: options.databits,
            stopbits: options.stopbits,
            parity: options.parity,
            parser: serialport.parsers.raw
        }, false);


        port.open(() => {
            let parseBuffer = async(buffer) => {
                var data, buf, error, crc;
                if (buffer[0] === 0x7F) {
                    buf = buffer.toJSON();
                    if (buf.data) {
                        buf = buf.data;
                    }
                    data = buf.slice(3, 3 + buffer[2]);
                    crc = this.CRC16(buf.slice(1, buf[2] + 3));
                    if (buf[buf.length - 2] !== crc[0] && buf[buf.length - 1] !== crc[1]) {
                        console.log(chalk.red('Wrong CRC from validator'))
                        return;
                    }

                    let date = moment(new Date()).format('HH:mm:ss.SSS');
                    console.log(chalk.cyan(date), "COM1 <= ", chalk.green(Array.prototype.slice.call(buffer, 0).map(function (item) {
                        return item.toString(16).toUpperCase()
                    })), "|", chalk.magenta(data))
                    if (!this.keys.finishEncryption && data.length == 9) {
                        this.createHostEncryptionKeys(data)
                    }
                } else {
                    self.emit('unregistered_data', buffer);
                }
            }

            port.on('data', function (buffer) {
                var ix = 0;
                do {
                    var len = buffer[2] + 5;
                    var buf = new Buffer(len);
                    buffer.copy(buf, 0, ix, ix + len);
                    parseBuffer(buf);
                    ix += len;
                } while (ix < buffer.length);
            });

        })
        port.on('error', (err) => {
            console.log(chalk.red(err));
        });

        this.port = port;
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
        this.keys.negotiateKeys = true;

        console.log(this.keys)
        let data = await this.sync()
        this.sequence = 0x80
        data = await this.sendGenerator()
        data = await this.sendModulus()
        data = await this.sendRequestKeyExchange()
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

    disable() {
        var packet = this.toPackets(0x09)
        var buff = new Buffer(packet)
        return new Promise((resolve, reject) => {
            setTimeout(()=> {
                console.log("COM1 => ", chalk.blue(Array.prototype.slice.call(buff, 0).map(function (item) {
                    return item.toString(16).toUpperCase()
                })))
                this.port.write(buff, ()=> {
                    this.port.drain()
                })
            }, 200)
        });
    }

    poll() {
        return new Promise((resolve, reject) => {
            setTimeout(()=> {
                var packet = this.toPackets(0x07,[], "POLL")
                var buff = new Buffer(packet)
                this.port.write(buff, ()=> {
                    this.port.drain()
                    resolve(true)
                })
            }, 200)
        });
    }
    enable() {
        return new Promise((resolve, reject) => {
            setTimeout(()=> {
                var packet = this.toPackets(0x0A,[], "ENABLE")
                var buff = new Buffer(packet)
                this.port.write(buff, ()=> {
                    this.port.drain()
                    resolve(true)

                })
            }, 200)
        });
    }

    enablePayoutDevice() {
        return new Promise((resolve, reject) => {
            setTimeout(()=> {
                var packet = this.toPackets(0x5C,[], "ENABLE_PAYOUT_DEVICE")
                var buff = new Buffer(packet)
                this.port.write(buff, ()=> {
                    this.port.drain()
                    resolve(true)

                })
            }, 200)
        });
    }

    sync() {
        return new Promise((resolve, reject) => {
            setTimeout(()=> {
                var packet = this.toPackets(0x11, [], "SYNC")
                var buff = new Buffer(packet)
                this.port.write(buff, ()=> {
                    this.port.drain()
                    resolve(true)
                })
            }, 200)


        });
    }

    sendGenerator() {
        return new Promise((resolve, reject) => {
            setTimeout(()=> {
                var generatorArray = this.parseHexString(this.keys.generatorKey.toString(16), 8)
                var packet = this.toPackets(0x4A, generatorArray, "SET GENERATOR")
                var buff = new Buffer(packet)
                this.port.write(buff, ()=> {
                    this.keys.set_generator = true
                    this.port.drain()
                    resolve(true)
                })
            }, 200)
        });
    }

    sendModulus() {

        return new Promise((resolve, reject) => {
            setTimeout(()=> {
                var modulusArray = this.parseHexString(this.keys.modulusKey.toString(16), 8)
                var packet = this.toPackets(0x4B, modulusArray, "SET MODULUS")
                var buff = new Buffer(packet)
                this.port.write(buff, ()=> {
                    this.keys.set_modulus = true
                    this.port.drain()
                    resolve(true)
                })
            }, 200)
        });
    }

    sendRequestKeyExchange() {

        return new Promise((resolve, reject) => {
            setTimeout(()=> {
                var hostIntArray = this.parseHexString(this.keys.hostIntKey.toString(16), 8)
                var packet = this.toPackets(0x4C, hostIntArray, "REQUEST KEY EXCHANGE")
                var buff = new Buffer(packet)
                this.port.write(buff, ()=> {
                    this.keys.request_key_exchange = true
                    this.port.drain()
                    resolve(true)
                })
            }, 200)
        });
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
            this.keys.variableKey = this.keys.key
            this.keys.finishEncryption = true
            this.emit("ready");
        }
    }

    setDenominationRoute() {
        return new Promise((resolve, reject) => {
            setTimeout(()=> {
                var packet = this.toPackets(0x3B, [0x00, 0x64, 0x00, 0x00, 0x00, 0x55, 0x53, 0x44], "SET DENOMINATION_ROUTE")
                var buff = new Buffer(packet)
                this.port.write(buff, ()=> {
                    this.port.drain()
                    resolve(true)
                })
            }, 200)
        });
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

    getSequence() {
        if (this.sequence == 0x80) {
            this.sequence = 0x00
        } else {
            this.sequence = 0x80
        }
        return this.sequence
    }

    generatePacking(commandLine){
        var a = [];
        for (var i = commandLine.length; i < 14; i++) {
            a.push(0)
        }
        return a;
    }
    toPackets(command, args = [], commandName) {

        var commandLine
        var STX = 0x7F
        var LENGTH = args.length + 1
        var SEQ_SLAVE_ID = this.getSequence()
        var DATA = [command].concat(args)

        commandLine = [SEQ_SLAVE_ID, LENGTH].concat(DATA);
        var crc = this.CRC16(commandLine);
        commandLine = [STX].concat(commandLine, crc);


        let date = moment(new Date()).format('HH:mm:ss.SSS');
        console.log(chalk.cyan(date), "COM1 => ", chalk.yellow(Array.prototype.slice.call(commandLine, 0).map(function (item) {
            return item.toString(16).toUpperCase()
        })), "|", commandName, "|", "unecrypted")

        if (this.keys.key != null) {
            var STEX = 0x7E
            var eLENGTH = DATA.length;
            this.count++
            var eCOUNT = this.parseHexString(this.count.toString(16), 4)
            var eDATA = DATA
            var eCommandLine = [eLENGTH].concat(eCOUNT, eDATA)
            var ePACKING = this.generatePacking(eCommandLine)
            console.log(eCommandLine, ePACKING)
            eCommandLine = eCommandLine.concat(ePACKING)
            var eCRC = this.CRC16(eCommandLine);
            eCommandLine = eCommandLine.concat(eCRC)

            var parse = function (a, count) {
                for (var i = a.length; i < count; i++) {
                    a.push(0)
                }
                return a;
            }
            var key = parse(Array.prototype.slice.call(this.keys.fixedKey, 0).reverse(), 8).concat(this.parseHexString(this.keys.key, 8))

            var aesCtr = new aesjs.ModeOfOperation.ctr(key);
            var uint8Array = aesCtr.encrypt(eCommandLine);
            eCommandLine = [STEX].concat([].slice.call(uint8Array))
            DATA = eCommandLine
            LENGTH = DATA.length
        }

        commandLine = [SEQ_SLAVE_ID, LENGTH].concat(DATA);
        crc = this.CRC16(commandLine);
        commandLine = [STX].concat(commandLine, crc);

        if (this.keys.key != null) {
            let date = moment(new Date()).format('HH:mm:ss.SSS');
            console.log(chalk.cyan(date), "COM1 => ", chalk.yellow(Array.prototype.slice.call(commandLine, 0).map(function (item) {
                return item.toString(16).toUpperCase()
            })), "|", commandName, "|", "encrypted")
        }

        return commandLine

    }

}

