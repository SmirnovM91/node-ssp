"use strict";
var aesjs = require("aes-js")
var Class = require('./class');

var Commands = Class.extend({
    command_list: null,
    exec_stack: [],
    keys: null,
    count: 0,
    setKeys: function (keys) {
        var self = this;
        self.keys = keys
        console.log(keys)
    },
    initialize: function (socket, type, ID, sequence) {
        var self = this;
        this.exec_stack = [];
        this.client = socket;
        this.command_list = require('./commands/' + type);
        //map commands for better use
        for (var cmd in this.command_list) {
            (function (command) {
                self[command] = function () {
                    var args = Array.prototype.slice.call(arguments);
                    args.unshift(command);
                    return self.stack.apply(self, args);
                };
            }(cmd));
        }
        this.ID = ID || 0;
        this.sequence = this.sequenceNumber = sequence || 0x80;
    },
    getSequence: function () {
        var seq = this.ID | (this.sequence = (this.sequence === this.sequenceNumber ? 0x00 : this.sequenceNumber));
        return seq
    },
    crcTable: [0x0000, 0x1021, 0x2042, 0x3063, 0x4084, 0x50a5,
        0x60c6, 0x70e7, 0x8108, 0x9129, 0xa14a, 0xb16b,
        0xc18c, 0xd1ad, 0xe1ce, 0xf1ef, 0x1231, 0x0210,
        0x3273, 0x2252, 0x52b5, 0x4294, 0x72f7, 0x62d6,
        0x9339, 0x8318, 0xb37b, 0xa35a, 0xd3bd, 0xc39c,
        0xf3ff, 0xe3de, 0x2462, 0x3443, 0x0420, 0x1401,
        0x64e6, 0x74c7, 0x44a4, 0x5485, 0xa56a, 0xb54b,
        0x8528, 0x9509, 0xe5ee, 0xf5cf, 0xc5ac, 0xd58d,
        0x3653, 0x2672, 0x1611, 0x0630, 0x76d7, 0x66f6,
        0x5695, 0x46b4, 0xb75b, 0xa77a, 0x9719, 0x8738,
        0xf7df, 0xe7fe, 0xd79d, 0xc7bc, 0x48c4, 0x58e5,
        0x6886, 0x78a7, 0x0840, 0x1861, 0x2802, 0x3823,
        0xc9cc, 0xd9ed, 0xe98e, 0xf9af, 0x8948, 0x9969,
        0xa90a, 0xb92b, 0x5af5, 0x4ad4, 0x7ab7, 0x6a96,
        0x1a71, 0x0a50, 0x3a33, 0x2a12, 0xdbfd, 0xcbdc,
        0xfbbf, 0xeb9e, 0x9b79, 0x8b58, 0xbb3b, 0xab1a,
        0x6ca6, 0x7c87, 0x4ce4, 0x5cc5, 0x2c22, 0x3c03,
        0x0c60, 0x1c41, 0xedae, 0xfd8f, 0xcdec, 0xddcd,
        0xad2a, 0xbd0b, 0x8d68, 0x9d49, 0x7e97, 0x6eb6,
        0x5ed5, 0x4ef4, 0x3e13, 0x2e32, 0x1e51, 0x0e70,
        0xff9f, 0xefbe, 0xdfdd, 0xcffc, 0xbf1b, 0xaf3a,
        0x9f59, 0x8f78, 0x9188, 0x81a9, 0xb1ca, 0xa1eb,
        0xd10c, 0xc12d, 0xf14e, 0xe16f, 0x1080, 0x00a1,
        0x30c2, 0x20e3, 0x5004, 0x4025, 0x7046, 0x6067,
        0x83b9, 0x9398, 0xa3fb, 0xb3da, 0xc33d, 0xd31c,
        0xe37f, 0xf35e, 0x02b1, 0x1290, 0x22f3, 0x32d2,
        0x4235, 0x5214, 0x6277, 0x7256, 0xb5ea, 0xa5cb,
        0x95a8, 0x8589, 0xf56e, 0xe54f, 0xd52c, 0xc50d,
        0x34e2, 0x24c3, 0x14a0, 0x0481, 0x7466, 0x6447,
        0x5424, 0x4405, 0xa7db, 0xb7fa, 0x8799, 0x97b8,
        0xe75f, 0xf77e, 0xc71d, 0xd73c, 0x26d3, 0x36f2,
        0x0691, 0x16b0, 0x6657, 0x7676, 0x4615, 0x5634,
        0xd94c, 0xc96d, 0xf90e, 0xe92f, 0x99c8, 0x89e9,
        0xb98a, 0xa9ab, 0x5844, 0x4865, 0x7806, 0x6827,
        0x18c0, 0x08e1, 0x3882, 0x28a3, 0xcb7d, 0xdb5c,
        0xeb3f, 0xfb1e, 0x8bf9, 0x9bd8, 0xabbb, 0xbb9a,
        0x4a75, 0x5a54, 0x6a37, 0x7a16, 0x0af1, 0x1ad0,
        0x2ab3, 0x3a92, 0xfd2e, 0xed0f, 0xdd6c, 0xcd4d,
        0xbdaa, 0xad8b, 0x9de8, 0x8dc9, 0x7c26, 0x6c07,
        0x5c64, 0x4c45, 0x3ca2, 0x2c83, 0x1ce0, 0x0cc1,
        0xef1f, 0xff3e, 0xcf5d, 0xdf7c, 0xaf9b, 0xbfba,
        0x8fd9, 0x9ff8, 0x6e17, 0x7e36, 0x4e55, 0x5e74,
        0x2e93, 0x3eb2, 0x0ed1, 0x1ef0],

    crc16_CCIT: function (command) {

        var crc = 0xFFFF;
        var j, i;


        for (var i = 0; i < command.length; i++) {
            var c = command[i];
            if (c > 255) {
                throw new RangeError();
            }
            j = (c ^ (crc >> 8)) & 0xFF;
            crc = this.crcTable[j] ^ (crc << 8);
        }


        return ((crc ^ 0) & 0xFFFF);
    },
    CRC16: function (command) {
        var length = command.length,
            seed = 0xFFFF,
            poly = 0x8005,
            crc = seed;


        for (var i = 0; i < length; i++) {
            crc ^= (command[i] << 8);

            for (var j = 0; j < 8; j++) {

                if (crc & 0x8000) {
                    crc = (crc << 1) ^ poly;
                } else {
                    crc <<= 1;
                }

            }
        }
        console.log("CRC", crc)
        var response = [(crc & 0xFF), ((crc >> 8) & 0xFF)]
        console.log("response", response)
        return response;
    },
    stack: function (commandName) {
        var self = this;
        var command,
            commandLine,
            args = Array.prototype.slice.call(arguments, 1);
        if (!this.command_list.hasOwnProperty(commandName)) {
            throw new Error("Unknown command '" + commandName + "'");
        }
        if (commandName instanceof Array) {
            console.log("commandName", commandName)
            for (var i in commandName) {
                this.stack(commandName[i]);
            }
        } else {
            commandName = commandName.toLowerCase();
            if ("function" === typeof this.command_list[commandName]) {
                command = this.command_list[commandName].call(this);
            } else {
                command = this.command_list[commandName];
            }
            var STX = 0x7F
            var LENGTH = args.length + 1
            var SEQ_SLAVE_ID = this.getSequence()
            var DATA = [command].concat(args)

            commandLine = [SEQ_SLAVE_ID, LENGTH].concat(DATA);
            var crc = this.CRC16(commandLine);

            console.log(crc, this.crc16_CCIT(commandLine))
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
            this.exec_stack.push(commandLine);
        }
        return this;
    },
    exec: function (command, cb) {
        var typeCmd = typeof command;
        if ("function" === typeCmd) {
            cb = command;
            command = null;
        } else if ("string" === typeCmd) {
            this.stack(command);
        } else if (command instanceof Array) {
            this.exec_stack.push(command);
        }
        if (this.exec_stack.length === 0) {
            cb && cb();
        } else {
            var buf = new Buffer(this.exec_stack.shift()), self = this;
            this.client.write(buf, function () {
                self.client.drain(function () {
                    setTimeout(function () {
                        self.exec(cb);
                    }, 100);
                });
            });
        }
    },
    byteToHexString: function (uint8arr) {

        var hexStr = '';
        for (var i = 0; i < uint8arr.length; i++) {
            var hex = (uint8arr[i] & 0xff).toString(16);
            hex = (hex.length === 1) ? '0' + hex : hex;
            hexStr += hex;
        }
        return hexStr.toUpperCase();
    },
    parseHexString: function (str, count) {
        var a = [];
        for (var i = str.length; i > 0; i -= 2) {
            a.push(parseInt(str.substr(i - 2, 2), 16));
        }
        for (var i = a.length; i < count; i++) {
            a.push(0)
        }
        return a;
    },
    parseHexStringReverse: function (str, count) {
        var a = [];
        for (var i = str.length; i > 0; i -= 2) {
            a.push(parseInt(str.substr(i - 2, 2), 16));
        }
        for (var i = a.length; i < count; i++) {
            a.push(0)
        }
        return a;
    }
});

module.exports = Commands;