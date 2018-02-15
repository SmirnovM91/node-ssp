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
        return this.ID | (this.sequence = (this.sequence === this.sequenceNumber ? 0x00 : this.sequenceNumber));
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
                    crc = ((crc << 1) & 0xffff) ^ poly;
                } else {
                    crc <<= 1;
                }

            }
        }
        return [(crc & 0xFF), ((crc >> 8) & 0xFF)];
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
            var LENGTH = args.length + 1
            var SEQ_SLAVE_ID = this.getSequence()
            var DATA = [command].concat(args)

            if (self.keys != null) {
                var STEX = 0x7E
                var eLENGTH = DATA.length;
                self.count++
                var eCOUNT = this.parseHexString(this.count.toString(16), 4)
                var eDATA = DATA
                var ePACKING = 0x00
                console.log(eLENGTH, eCOUNT, eDATA, ePACKING)
                var eCommandLine = [eLENGTH, eCOUNT].concat(eDATA, ePACKING)
                var eCRC = this.CRC16(eCommandLine);
                eCommandLine = eCommandLine.concat(eCRC)

                console.log(eCommandLine)
                var parse = function (a, count) {
                    for (var i = a.length; i < count; i++) {
                        a.push(0)
                    }
                    return a;
                }
                var key = parse(Array.prototype.slice.call(self.keys.fixedKey, 0), 8).concat(this.parseHexString(self.keys.key, 8))

                console.log(key)
                var aesCtr = new aesjs.ModeOfOperation.ctr(key);
                var uint8Array = aesCtr.encrypt(eCommandLine);
                console.log(uint8Array)
                eCommandLine = [STEX].concat([].slice.call(uint8Array))
                DATA = eCommandLine
                LENGTH = DATA.length
            }

            commandLine = [SEQ_SLAVE_ID, LENGTH].concat(DATA);
            var crc = this.CRC16(commandLine);
            var STX = 0x7F

            commandLine = [STX].concat(commandLine, crc);
            console.log("commandLine", commandLine)
            console.log(arguments)
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