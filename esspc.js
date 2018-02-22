"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

require('babel-polyfill');

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _serialport = require('serialport');

var _serialport2 = _interopRequireDefault(_serialport);

var _commands = require('./commands');

var _commands2 = _interopRequireDefault(_commands);

var _nodeForge = require('node-forge');

var _nodeForge2 = _interopRequireDefault(_nodeForge);

var _convertHex = require('convert-hex');

var _convertHex2 = _interopRequireDefault(_convertHex);

var _bigInteger = require('big-integer');

var _bigInteger2 = _interopRequireDefault(_bigInteger);

var _eventEmitterEs = require('event-emitter-es6');

var _eventEmitterEs2 = _interopRequireDefault(_eventEmitterEs);

var _chalk = require('chalk');

var _chalk2 = _interopRequireDefault(_chalk);

var _moment = require('moment');

var _moment2 = _interopRequireDefault(_moment);

var _aesJs = require('aes-js');

var _aesJs2 = _interopRequireDefault(_aesJs);

var _hex2ascii = require('hex2ascii');

var _hex2ascii2 = _interopRequireDefault(_hex2ascii);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var eSSP = function (_EventEmitter) {
    _inherits(eSSP, _EventEmitter);

    function eSSP() {
        _classCallCheck(this, eSSP);

        var _this = _possibleConstructorReturn(this, (eSSP.__proto__ || Object.getPrototypeOf(eSSP)).call(this));

        _this.options = {};
        _this.port = null;
        _this.commands = null;
        _this.count = 0;
        _this.sequence = 0x80;
        _this.currentCommand = "";
        _this.keys = {
            generatorKey: null,
            modulusKey: null,
            hostRandom: null,
            hostIntKey: null,
            slaveIntKey: null,
            fixedKey: Buffer.from("0123456701234567", "hex"),
            key: null
        };
        return _this;
    }

    _createClass(eSSP, [{
        key: 'initialize',
        value: function initialize(opts) {
            var _this2 = this;

            var options = this.options = {
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
            if (_fs2.default.readdirSync(__dirname + '/commands').map(function (item) {
                return item.replace(/\..+$/, '');
            }).indexOf(options.type) === -1) {
                throw new Error("Unknown device type '" + options.type + "'");
            }

            var port = new _serialport2.default.SerialPort(options.device, {
                baudrate: options.baudrate,
                databits: options.databits,
                stopbits: options.stopbits,
                parity: options.parity,
                parser: _serialport2.default.parsers.raw
            }, false);

            port.open(function () {
                port.on('data', function (buffer) {
                    var ix = 0;
                    do {
                        var len = buffer[2] + 5;
                        var buf = new Buffer(len);
                        buffer.copy(buf, 0, ix, ix + len);
                        _this2.parseBuffer(buf);
                        ix += len;
                    } while (ix < buffer.length);
                });
            });
            port.on('error', function (err) {
                console.log(_chalk2.default.red(err));
            });

            this.port = port;
        }
    }, {
        key: 'initiateKeys',
        value: function () {
            var _ref = _asyncToGenerator( /*#__PURE__*/regeneratorRuntime.mark(function _callee() {
                var getRandomInt, keyPair, data;
                return regeneratorRuntime.wrap(function _callee$(_context) {
                    while (1) {
                        switch (_context.prev = _context.next) {
                            case 0:
                                getRandomInt = function getRandomInt(min, max) {
                                    return Math.floor(Math.random() * (max - min)) + min;
                                };

                                keyPair = _nodeForge2.default.pki.rsa.generateKeyPair(64);

                                this.keys.generatorKey = keyPair.privateKey.p;
                                this.keys.modulusKey = keyPair.privateKey.q;
                                this.keys.hostRandom = getRandomInt(1, 5);
                                this.keys.hostIntKey = this.keys.generatorKey ^ this.keys.hostRandom % this.keys.modulusKey;

                                _context.next = 8;
                                return this.sendGenerator();

                            case 8:
                                data = _context.sent;
                                _context.next = 11;
                                return this.sendModulus();

                            case 11:
                                data = _context.sent;
                                _context.next = 14;
                                return this.sendRequestKeyExchange();

                            case 14:
                                data = _context.sent;

                            case 15:
                            case 'end':
                                return _context.stop();
                        }
                    }
                }, _callee, this);
            }));

            function initiateKeys() {
                return _ref.apply(this, arguments);
            }

            return initiateKeys;
        }()
    }, {
        key: 'parseHexString',
        value: function parseHexString(str, count) {
            var a = [];
            for (var i = str.length; i > 0; i -= 2) {
                a.push(parseInt(str.substr(i - 2, 2), 16));
            }
            for (var i = a.length; i < count; i++) {
                a.push(0);
            }
            return a;
        }
    }, {
        key: 'parseCountString',
        value: function parseCountString(str, count) {
            var a = [];
            for (var i = str.length; i > 0; i -= 2) {
                a.unshift(parseInt(str.substr(i - 2, 2), 16));
            }
            for (var i = a.length; i < count; i++) {
                a.unshift(0);
            }
            return a;
        }
    }, {
        key: 'disable',
        value: function disable() {
            var _this3 = this;

            var packet = this.toPackets(0x09);
            var buff = new Buffer(packet);
            return new Promise(function (resolve, reject) {
                setTimeout(function () {
                    console.log("COM1 => ", _chalk2.default.blue(Array.prototype.slice.call(buff, 0).map(function (item) {
                        return item.toString(16).toUpperCase();
                    })));
                    _this3.port.write(buff, function () {
                        _this3.port.drain();
                    });
                }, 200);
            });
        }
    }, {
        key: 'poll',
        value: function poll() {
            var _this4 = this;

            var polling = function () {
                var _ref2 = _asyncToGenerator( /*#__PURE__*/regeneratorRuntime.mark(function _callee2(resolve, reject) {
                    return regeneratorRuntime.wrap(function _callee2$(_context2) {
                        while (1) {
                            switch (_context2.prev = _context2.next) {
                                case 0:
                                    setTimeout(function () {
                                        var packet = _this4.toPackets(0x07, [], "POLL");
                                        var buff = new Buffer(packet);
                                        _this4.port.write(buff, function () {
                                            _this4.port.drain();
                                            polling();
                                        });
                                    }, 1000);

                                case 1:
                                case 'end':
                                    return _context2.stop();
                            }
                        }
                    }, _callee2, _this4);
                }));

                return function polling(_x, _x2) {
                    return _ref2.apply(this, arguments);
                };
            }();
            return new Promise(polling);
        }
    }, {
        key: 'setup_request',
        value: function setup_request() {
            var _this5 = this;

            return new Promise(function (resolve, reject) {
                setTimeout(function () {
                    var packet = _this5.toPackets(0x05, [], "SETUP_REQUEST");
                    var buff = new Buffer(packet);
                    _this5.port.write(buff, function () {
                        _this5.port.drain();
                        resolve(true);
                        _this5.emit("ready");
                    });
                }, 200);
            });
        }
    }, {
        key: 'hold',
        value: function hold() {
            var _this6 = this;

            return new Promise(function (resolve, reject) {
                setTimeout(function () {
                    var packet = _this6.toPackets(0x18, [], "HOLD");
                    var buff = new Buffer(packet);
                    _this6.port.write(buff, function () {
                        _this6.port.drain();
                        resolve(true);
                    });
                }, 200);
            });
        }
    }, {
        key: 'enable',
        value: function enable() {
            var _this7 = this;

            return new Promise(function (resolve, reject) {
                setTimeout(function () {
                    var packet = _this7.toPackets(0x0A, [], "ENABLE");
                    var buff = new Buffer(packet);
                    _this7.port.write(buff, function () {
                        _this7.port.drain();
                        resolve(true);
                    });
                }, 200);
            });
        }
    }, {
        key: 'enablePayoutDevice',
        value: function enablePayoutDevice() {
            var _this8 = this;

            return new Promise(function (resolve, reject) {
                setTimeout(function () {
                    var packet = _this8.toPackets(0x5C, [], "ENABLE_PAYOUT_DEVICE");
                    var buff = new Buffer(packet);
                    _this8.port.write(buff, function () {
                        _this8.port.drain();
                        resolve(true);
                    });
                }, 200);
            });
        }
    }, {
        key: 'sync',
        value: function sync() {
            var _this9 = this;

            return new Promise(function (resolve, reject) {
                setTimeout(function () {
                    var packet = _this9.toPackets(0x11, [], "SYNC");
                    var buff = new Buffer(packet);
                    _this9.port.write(buff, function () {
                        _this9.port.drain();
                        _this9.sequence = 0x80;
                        resolve(true);
                    });
                }, 200);
            });
        }
    }, {
        key: 'sendGenerator',
        value: function sendGenerator() {
            var _this10 = this;

            return new Promise(function (resolve, reject) {
                setTimeout(function () {
                    var generatorArray = _this10.parseHexString(_this10.keys.generatorKey.toString(16), 8);
                    var packet = _this10.toPackets(0x4A, generatorArray, "SET_GENERATOR");
                    var buff = new Buffer(packet);
                    _this10.port.write(buff, function () {
                        _this10.port.drain();
                        resolve(true);
                    });
                }, 200);
            });
        }
    }, {
        key: 'sendModulus',
        value: function sendModulus() {
            var _this11 = this;

            return new Promise(function (resolve, reject) {
                setTimeout(function () {
                    var modulusArray = _this11.parseHexString(_this11.keys.modulusKey.toString(16), 8);
                    var packet = _this11.toPackets(0x4B, modulusArray, "SET_MODULUS");
                    var buff = new Buffer(packet);
                    _this11.port.write(buff, function () {
                        _this11.port.drain();
                        resolve(true);
                    });
                }, 200);
            });
        }
    }, {
        key: 'sendRequestKeyExchange',
        value: function sendRequestKeyExchange() {
            var _this12 = this;

            return new Promise(function (resolve, reject) {
                setTimeout(function () {
                    var hostIntArray = _this12.parseHexString(_this12.keys.hostIntKey.toString(16), 8);
                    var packet = _this12.toPackets(0x4C, hostIntArray, "REQUEST_KEY_EXCHANGE");
                    var buff = new Buffer(packet);
                    _this12.port.write(buff, function () {
                        _this12.port.drain();
                        resolve(true);
                    });
                }, 200);
            });
        }
    }, {
        key: 'setDenominationRoute',
        value: function setDenominationRoute() {
            var _this13 = this;

            return new Promise(function (resolve, reject) {
                setTimeout(function () {
                    var packet = _this13.toPackets(0x3B, [0x00, 0x64, 0x00, 0x00, 0x00, 0x55, 0x53, 0x44], "SET_DENOMINATION_ROUTE");
                    var buff = new Buffer(packet);
                    _this13.port.write(buff, function () {
                        _this13.port.drain();
                        resolve(true);
                    });
                }, 200);
            });
        }
    }, {
        key: 'createHostEncryptionKeys',
        value: function createHostEncryptionKeys(data) {
            if (this.keys.key == null) {
                data.shift();
                var hexString = _convertHex2.default.bytesToHex(data.reverse());

                var slaveIntKey = (0, _bigInteger2.default)(hexString, 16);
                var slaveIntKeyString = "";
                if (!slaveIntKey.isSmall) {
                    var values = slaveIntKey.value.reverse();
                    for (var i = 0; i < values.length; i++) {
                        slaveIntKeyString += "" + values[i];
                    }
                } else {
                    slaveIntKeyString = slaveIntKey.value;
                }
                this.keys.slaveIntKey = slaveIntKeyString;
                this.keys.key2 = this.keys.slaveIntKey ^ this.keys.hostRandom % this.keys.modulusKey;
                this.keys.key = this.XpowYmodN(this.keys.slaveIntKey, this.keys.hostRandom, this.keys.modulusKey);
                console.log(this.keys);
                console.log();
            }
        }
    }, {
        key: 'XpowYmodN',
        value: function XpowYmodN(x, y, N) {
            var result = 1;
            var oneShift63 = 1 << 63;
            for (var i = 0; i < 64; y <<= 1, i++) {
                result = result * result % N;
                if ((y & oneShift63) !== 0) result = result * x % N;
            }
            ;
            return result;
        }
    }, {
        key: 'CRC16',
        value: function CRC16(command) {
            var length = command.length,
                seed = 0xFFFF,
                poly = 0x8005,
                crc = seed;

            for (var i = 0; i < length; i++) {
                crc ^= command[i] << 8;
                for (var j = 0; j < 8; j++) {
                    if (crc & 0x8000) {
                        crc = crc << 1 & 0xffff ^ poly;
                    } else {
                        crc <<= 1;
                    }
                }
            }
            return [crc & 0xFF, crc >> 8 & 0xFF];
        }
    }, {
        key: 'getSequence',
        value: function getSequence() {
            if (this.sequence == 0x80) {
                this.sequence = 0x00;
            } else {
                this.sequence = 0x80;
            }
            return this.sequence;
        }
    }, {
        key: 'generatePacking',
        value: function generatePacking(commandLine) {
            var a = [];
            for (var i = commandLine.length; i < 14; i++) {
                a.push(0);
            }
            return a;
        }
    }, {
        key: 'toPackets',
        value: function toPackets(command) {
            var args = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];
            var commandName = arguments[2];


            this.currentCommand = commandName;
            var commandLine;
            var STX = 0x7F;
            var LENGTH = args.length + 1;
            var SEQ_SLAVE_ID = this.getSequence();
            var DATA = [command].concat(args);

            commandLine = [SEQ_SLAVE_ID, LENGTH].concat(DATA);
            var crc = this.CRC16(commandLine);
            commandLine = [STX].concat(commandLine, crc);

            var date = (0, _moment2.default)(new Date()).format('HH:mm:ss.SSS');
            console.log(_chalk2.default.cyan(date), "COM1 => ", _chalk2.default.yellow(Array.prototype.slice.call(commandLine, 0).map(function (item) {
                return item.toString(16).toUpperCase();
            })), "|", commandName, "|", "unecrypted");

            if (this.keys.key != null) {
                var STEX = 0x7E;
                var eLENGTH = DATA.length;
                this.count++;
                var eCOUNT = this.parseCountString(this.count.toString(16), 4);
                var eDATA = DATA;
                var eCommandLine = [eLENGTH].concat(eCOUNT, eDATA);
                var ePACKING = this.generatePacking(eCommandLine);
                eCommandLine = eCommandLine.concat(ePACKING);
                var eCRC = this.CRC16(eCommandLine);
                eCommandLine = eCommandLine.concat(eCRC);

                var parse = function parse(a, count) {
                    for (var i = a.length; i < count; i++) {
                        a.push(0);
                    }
                    return a;
                };

                console.log(_chalk2.default.cyan(date), "COM1 => ", _chalk2.default.yellow(Array.prototype.slice.call(eCommandLine, 0).map(function (item) {
                    return item.toString(16).toUpperCase();
                })), "|", commandName, "|", "raw");

                var key = parse(Array.prototype.slice.call(this.keys.fixedKey, 0).reverse(), 8).concat(this.parseHexString(this.keys.key.toString(16), 8));

                var aesCtr = new _aesJs2.default.ModeOfOperation.ecb(key);
                var uint8Array = aesCtr.encrypt(eCommandLine);
                var eDATA = [].slice.call(uint8Array);
                eCommandLine = [STEX].concat(eDATA);
                DATA = eCommandLine;
                LENGTH = DATA.length;
            }

            commandLine = [SEQ_SLAVE_ID, LENGTH].concat(DATA);
            crc = this.CRC16(commandLine);
            commandLine = [STX].concat(commandLine, crc);

            if (this.keys.key != null) {
                var _date = (0, _moment2.default)(new Date()).format('HH:mm:ss.SSS');
                console.log(_chalk2.default.cyan(_date), "COM1 => ", _chalk2.default.yellow(Array.prototype.slice.call(commandLine, 0).map(function (item) {
                    return item.toString(16).toUpperCase();
                })), "|", commandName, "|", "encrypted");
            }

            return commandLine;
        }
    }, {
        key: 'parseBuffer',
        value: function parseBuffer(buffer) {
            var data = void 0,
                buf = void 0,
                crc = void 0;
            if (buffer[0] === 0x7F) {
                buf = buffer.toJSON();
                if (buf.data) {
                    buf = buf.data;
                }
                data = buf.slice(3, 3 + buffer[2]);
                crc = this.CRC16(buf.slice(1, buf[2] + 3));
                if (buf[buf.length - 2] !== crc[0] && buf[buf.length - 1] !== crc[1]) {
                    console.log(_chalk2.default.red('Wrong CRC from validator'));
                    return;
                }

                var date = (0, _moment2.default)(new Date()).format('HH:mm:ss.SSS');
                console.log(_chalk2.default.cyan(date), "COM1 <= ", _chalk2.default.green(Array.prototype.slice.call(buffer, 0).map(function (item) {
                    return item.toString(16).toUpperCase();
                })), "|", _chalk2.default.magenta(data), this.currentCommand);
                console.log("");
                if (data[0]) {}
                if (this.currentCommand == "REQUEST_KEY_EXCHANGE") {
                    if (data[0] == 240) this.createHostEncryptionKeys(data);
                } else if (this.currentCommand == "SETUP_REQUEST") {
                    if (data[0] == 240) {
                        var currency = (0, _hex2ascii2.default)(data[6].toString(16) + data[7].toString(16) + data[8].toString(16));
                        var firmwareversion = data[11];
                        var channels = data[12];
                        var denominations = [];
                        for (var i = 0; i < channels * 1; i++) {
                            var denomination = data[13 + i];
                            denominations.push(denomination);
                        }
                        var event = ["setup_request", { currency: currency, firmwareversion: firmwareversion, channels: channels, denominations: denominations }];
                        this.emit.apply(this, event);
                    }
                } else {
                    this.emitEvent(data, buffer);
                }
            } else {
                this.emit('unregistered_data', buffer);
            }
        }
    }, {
        key: 'emitEvent',
        value: function emitEvent(data, buffer) {
            var error = new Error("New error");
            error.code = data[0];
            switch (data[0]) {
                case 0xF2:
                    error.message = "Command not known";
                    break;
                case 0xF3:
                    error.message = "Wrong no parameters";
                    break;
                case 0xF4:
                    error.message = "Parameter out of range";
                    break;
                case 0xF5:
                    error.message = "Command cannot be processed";
                    break;
                case 0xF6:
                    error.message = "Software error";
                    break;
                case 0xF8:
                    error.message = "Fail";
                    break;
                case 0xFA:
                    error.message = "Key not set";
                    break;
                case 0xF0:
                    break;
                default:
                    error.message = "Unknown error";
            }
            if (error.code !== 0xF0) {
                this.emit("error", error, buffer);
            } else if (data.length > 1) {
                var event;
                switch (data[1]) {
                    case 0xF1:
                        //all
                        event = ["slave_reset"];
                        break;
                    case 0xEF:
                        //bv20|bv50|bv100|nv9usb|nv10usb|nv200|SMART Payout|nv11
                        event = ["read_note", data[2]];
                        break;
                    case 0xEE:
                        //bv20|bv50|bv100|nv9usb|nv10usb|nv200|SMART Payout|nv11
                        event = ["credit_note", data[2]];
                        break;
                    case 0xED:
                        //bv20|bv50|bv100|nv9usb|nv10usb|nv200|SMART Payout|nv11
                        event = ["note_rejecting"];
                        break;
                    case 0xEC:
                        //bv20|bv50|bv100|nv9usb|nv10usb|nv200|SMART Payout|nv11
                        //recieve reject code
                        // self.commands.exec("last_reject_code");
                        break;
                    case 0xCC:
                        //bv20|bv50|bv100|nv9usb|nv10usb|nv200|SMART Payout|nv11
                        event = ["note_stacking"];
                        break;
                    case 0xEB:
                        //bv20|bv50|bv100|nv9usb|nv10usb|nv200|SMART Payout|nv11
                        event = ["note_stacked"];
                        break;
                    case 0xEA:
                        //bv20|bv50|bv100|nv9usb|nv10usb|nv200|SMART Payout|nv11
                        event = ["safe_note_jam"];
                        break;
                    case 0xE9:
                        //bv20|bv50|bv100|nv9usb|nv10usb|nv200|SMART Payout|nv11
                        event = ["unsafe_note_jam"];
                        break;
                    case 0xE8:
                        //all
                        event = ["disabled"];
                        break;
                    case 0xE6:
                        //bv20|bv50|bv100|nv9usb|nv10usb|nv200|nv201|SMART Payout|nv11|SMART Hopper
                        event = ["fraud_attempt", data[2]];
                        break;
                    case 0xE7:
                        //bv20|bv50|bv100|nv9usb|nv10usb|nv200|SMART Payout|nv11
                        event = ["stacker_full"];
                        break;
                    case 0xE1:
                        //bv20|bv50|bv100|nv9usb|nv10usb|nv200|nv201|SMART Payout|nv11
                        event = ["note_cleared_from_front", data[2]];
                        break;
                    case 0xE2:
                        //bv20|bv50|bv100|nv9usb|nv10usb|nv200|nv201|SMART Payout|nv11
                        event = ["note_cleared_to_cashbox", data[2]];
                        break;
                    case 0xE3:
                        //bv50|bv100|nv200|SMART Payout|nv11
                        event = ["cashbox_removed"];
                        break;
                    case 0xE4:
                        //bv50|bv100|nv200|SMART Payout|nv11
                        event = ["cashbox_replaced"];
                        break;
                    case 0xE5:
                        //nv200|nv201
                        event = ["barcode_ticket_validated"];
                        break;
                    case 0xD1:
                        //nv200|nv201
                        event = ["barcode_ticket_acknowledge"];
                        break;
                    case 0xE0:
                        //nv200
                        event = ["note_path_open"];
                        break;
                    case 0xB5:
                        //bv20|bv50|bv100|nv9usb|nv10usb|nv200|SMART Payout|nv11
                        event = ["channel_disable"];
                        break;
                    case 0xB6:
                        //bv20|bv50|bv100|nv9usb|nv10usb|nv200|nv201|SMART Payout|nv11|SMART Hopper
                        event = ["initialing"];
                        break;
                    case 0xDA:
                        //SMART payout|SMART Hopper|nv11
                        event = ["dispensing", data[2]];
                        break;
                    case 0xD2:
                        //SMART payout|SMART Hopper|nv11
                        event = ["dispensed", data[2]];
                        break;
                    case 0xD2:
                        //SMART payout|SMART Hopper|nv11
                        event = ["jammed", data[2]];
                        break;
                    case 0xD6:
                        //SMART payout|SMART Hopper|nv11
                        event = ["halted", data[2]];
                        break;
                    case 0xD7:
                        //SMART payout|SMART Hopper
                        event = ["floating", data[2]];
                        break;
                    case 0xD8:
                        //SMART payout|SMART Hopper
                        event = ["floated", data[2]];
                        break;
                    case 0xD9:
                        //SMART payout|SMART Hopper|nv11
                        event = ["timeout", data[2]];
                        break;
                    case 0xDC:
                        //SMART payout|SMART Hopper|nv11
                        event = ["incomplete_payout", data[2]];
                        break;
                    case 0xDD:
                        //SMART payout|SMART Hopper|nv11
                        event = ["incomplete_payout", data[2]];
                        break;
                    case 0xDE:
                        //SMART Hopper
                        event = ["cashbox_paid", data[2]];
                        break;
                    case 0xDF:
                        //SMART Hopper
                        event = ["coin_credit", data[2]];
                        break;
                    case 0xC4:
                        //SMART Hopper
                        event = ["coin_mech_jammed"];
                        break;
                    case 0xC5:
                        //SMART Hopper
                        event = ["coin_mech_return_pressed"];
                        break;
                    case 0xB7:
                        //SMART Hopper
                        event = ["coin_mech_error"];
                        break;
                    case 0xC2:
                        //SMART payout|SMART Hopper|nv11
                        event = ["emptying"];
                        break;
                    case 0xC3:
                        //SMART payout|SMART Hopper|nv11
                        event = ["emptied"];
                        break;
                    case 0xB3:
                        //SMART payout|SMART Hopper|nv11
                        event = ["smart_emptying", data[2]];
                        break;
                    case 0xB4:
                        //SMART payout|SMART Hopper|nv11
                        event = ["smart_emptied", data[2]];
                        break;
                    case 0xDB:
                        //SMART payout|nv11
                        event = ["note_stored_in_payout", data[2]];
                        break;
                    case 0xC6:
                        //SMART payout|nv11
                        event = ["payout_out_of_service"];
                        break;
                    case 0xB0:
                        //SMART payout
                        event = ["jam_recovery"];
                        break;
                    case 0xB1:
                        //SMART payout
                        event = ["error_during_payout"];
                        break;
                    case 0xC9:
                        //SMART payout|nv11
                        event = ["note_transfered to stacker", data[2]];
                        break;
                    case 0xCE:
                        //SMART payout|nv11
                        event = ["note_held_in_bezel", data[2]];
                        break;
                    case 0xCB:
                        //SMART payout|nv11
                        event = ["note_paid_into_store_at_powerup", data[2]];
                        break;
                    case 0xCB:
                        //SMART payout|nv11
                        event = ["note_paid_into_stacker_at_powerup", data[2]];
                        break;
                    case 0xCD:
                        //nv11
                        event = ["note_dispensed_at_powerup", data[2]];
                        break;
                    case 0xC7:
                        //nv11
                        event = ["note_float_removed"];
                        break;
                    case 0xC8:
                        //nv11
                        event = ["note_float_attached"];
                        break;
                    case 0xC9:
                        //nv11
                        event = ["device_full"];
                        break;
                    //Reject reasons
                    case 0x0:
                    case 0x1:
                    case 0x2:
                    case 0x3:
                    case 0x4:
                    case 0x5:
                    case 0x6:
                    case 0x7:
                    case 0x8:
                    case 0x9:
                    case 0xa:
                    case 0xb:
                    case 0xc:
                    case 0xd:
                    case 0xe:
                    case 0xf:
                    case 0x10:
                    case 0x11:
                    case 0x12:
                    case 0x13:
                    case 0x14:
                    case 0x15:
                    case 0x16:
                    case 0x17:
                    case 0x18:
                    case 0x19:
                    case 0x1a:
                    case 0x1b:
                    case 0x1c:
                        event = ["note_rejected", data[1]];
                        break;
                }
                event && this.emit.apply(this, event);
            }
        }
    }]);

    return eSSP;
}(_eventEmitterEs2.default);

exports.default = eSSP;
