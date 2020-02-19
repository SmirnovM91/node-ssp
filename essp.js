"use strict";
import "babel-polyfill";
import fs from "fs";
import SerialPort from "serialport";
import Commands from "./commands";
import forge from "node-forge";
import convertHex from "convert-hex";
import bigInt from "big-integer";
import EventEmitter from "event-emitter-es6";
import chalk from "chalk";
import moment from "moment";
import aesjs from "aes-js";
import hex2ascii from "hex2ascii";

export default class eSSP extends EventEmitter {
  constructor() {
    super();
    this.options = {};
    this.port = null;
    this.commands = null;
    this.count = 0;
    this.sequence = 0x80;
    this.currentCommand = "";
    this.held = false;
    this.keys = {
      generatorKey: null,
      modulusKey: null,
      hostRandom: null,
      hostIntKey: null,
      slaveIntKey: null,
      fixedKey: Buffer.from("0123456701234567", "hex"),
      key: null
    };
  }

  initialize(opts) {
    let options = (this.options = {
      device: opts.device || null,
      baudRate: opts.baudRate || 9600,
      dataBits: opts.dataBits || 8,
      stopBits: opts.stopBits || 2,
      parity:
        opts.parity &&
        ["even", "mark", "odd", "space"].indexOf(
          opts.parity.toString().toLowerCase()
        ) > -1
          ? opts.parity
          : "none",
      currencies: opts.currencies || [1, 0, 1],
      type: opts.type || "nv10usb",
      sspID: opts.sspID || 0,
      sequence: opts.sequence || 0x80
    });
    if (
      fs
        .readdirSync(__dirname + "/commands")
        .map(function(item) {
          return item.replace(/\..+$/, "");
        })
        .indexOf(options.type) === -1
    ) {
      throw new Error("Unknown device type '" + options.type + "'");
    }

    var port = new SerialPort(
      options.device,
      {
        baudRate: options.baudRate || 9600,
        dataBits: options.dataBits || 8,
        stopBits: options.stopBits || 2,
        parity: options.parity,
        parser: SerialPort.parsers.raw,
        autoOpen: false
      },
      false
    );

    port.open(() => {
      port.on("data", buffer => {
        var ix = 0;
        do {
          var len = buffer[2] + 5;
          var buf = new Buffer(len);
          buffer.copy(buf, 0, ix, ix + len);
          this.parseBuffer(buf);
          ix += len;
        } while (ix < buffer.length);
      });
    });
    port.on("error", err => {
      console.log(chalk.red(err));
    });

    this.port = port;
  }

  async initiateKeys() {
    var getRandomInt = function(min, max) {
      return Math.floor(Math.random() * (max - min)) + min;
    };

    var keyPair = forge.pki.rsa.generateKeyPair(64);
    this.keys.generatorKey = keyPair.privateKey.p;
    this.keys.modulusKey = keyPair.privateKey.q;
    this.keys.hostRandom = getRandomInt(1, 5);
    this.keys.hostIntKey =
      this.keys.generatorKey ^ this.keys.hostRandom % this.keys.modulusKey;

    let data = await this.sendGenerator();
    data = await this.sendModulus();
    data = await this.sendRequestKeyExchange();
  }

  parseHexString(str, count) {
    var a = [];
    for (var i = str.length; i > 0; i -= 2) {
      a.push(parseInt(str.substr(i - 2, 2), 16));
    }
    for (var i = a.length; i < count; i++) {
      a.push(0);
    }
    return a;
  }

  parseKeyString(str, count) {
    var a = [];
    for (var i = 0; i < str.length; i += 2) {
      a.push(parseInt(str.substr(i, 2), 16));
    }
    for (var i = a.length; i < count; i++) {
      a.push(0);
    }
    return a;
  }

  parseCountString(str, count) {
    var a = [];
    for (var i = str.length; i > 0; i -= 2) {
      a.unshift(parseInt(str.substr(i - 2, 2), 16));
    }
    for (var i = a.length; i < count; i++) {
      a.unshift(0);
    }
    return a;
  }

  disable() {
    var packet = this.toPackets(0x09);
    var buff = new Buffer(packet);
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        console.log(
          "COM1 => ",
          chalk.blue(
            Array.prototype.slice.call(buff, 0).map(function(item) {
              return item.toString(16).toUpperCase();
            })
          )
        );
        this.port.write(buff, () => {
          this.port.drain();
        });
      }, 200);
    });
  }

  poll() {
    let polling = async (resolve, reject) => {
      setTimeout(() => {
        var packet = this.toPackets(0x07, [], "POLL");
        var buff = new Buffer(packet);
        this.port.write(buff, () => {
          this.port.drain();
          if (!this.held) polling();
        });
      }, 1000);
    };
    return new Promise(polling);
  }

  setup_request() {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        var packet = this.toPackets(0x05, [], "SETUP_REQUEST");
        var buff = new Buffer(packet);
        this.port.write(buff, () => {
          this.port.drain();
          resolve(true);
          this.emit("ready");
        });
      }, 200);
    });
  }

  hold() {
    return new Promise((resolve, reject) => {
      this.held = true;
      setTimeout(() => {
        var packet = this.toPackets(0x18, [], "HOLD");
        var buff = new Buffer(packet);
        this.port.write(buff, () => {
          this.port.drain();
          resolve(true);
        });
      }, 200);
    });
  }

  enable() {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        var packet = this.toPackets(0x0a, [], "ENABLE");
        var buff = new Buffer(packet);
        this.port.write(buff, () => {
          this.port.drain();
          resolve(true);
        });
      }, 200);
    });
  }

  enablePayoutDevice() {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        var packet = this.toPackets(0x5c, [], "ENABLE_PAYOUT_DEVICE");
        var buff = new Buffer(packet);
        this.port.write(buff, () => {
          this.port.drain();
          resolve(true);
        });
      }, 200);
    });
  }

  sync() {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        var packet = this.toPackets(0x11, [], "SYNC");
        var buff = new Buffer(packet);
        this.port.write(buff, () => {
          this.port.drain();
          this.sequence = 0x80;
          resolve(true);
        });
      }, 200);
    });
  }

  sendGenerator() {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        var generatorArray = this.parseHexString(
          this.keys.generatorKey.toString(16),
          8
        );
        var packet = this.toPackets(0x4a, generatorArray, "SET_GENERATOR");
        var buff = new Buffer(packet);
        this.port.write(buff, () => {
          this.port.drain();
          resolve(true);
        });
      }, 200);
    });
  }

  sendModulus() {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        var modulusArray = this.parseHexString(
          this.keys.modulusKey.toString(16),
          8
        );
        var packet = this.toPackets(0x4b, modulusArray, "SET_MODULUS");
        var buff = new Buffer(packet);
        this.port.write(buff, () => {
          this.port.drain();
          resolve(true);
        });
      }, 200);
    });
  }

  sendRequestKeyExchange() {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        var hostIntArray = this.parseHexString(
          this.keys.hostIntKey.toString(16),
          8
        );
        var packet = this.toPackets(0x4c, hostIntArray, "REQUEST_KEY_EXCHANGE");
        var buff = new Buffer(packet);
        this.port.write(buff, () => {
          this.port.drain();
          resolve(true);
        });
      }, 200);
    });
  }

  setDenominationRoute() {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        var packet = this.toPackets(
          0x3b,
          [0x00, 0x64, 0x00, 0x00, 0x00, 0x55, 0x53, 0x44],
          "SET_DENOMINATION_ROUTE"
        );
        var buff = new Buffer(packet);
        this.port.write(buff, () => {
          this.port.drain();
          resolve(true);
        });
      }, 200);
    });
  }

  createHostEncryptionKeys(data) {
    if (this.keys.key == null) {
      data.shift();
      var hexString = convertHex.bytesToHex(data.reverse());

      var slaveIntKey = bigInt(hexString, 16);
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
      this.keys.key2 =
        this.keys.slaveIntKey ^ this.keys.hostRandom % this.keys.modulusKey;
      this.keys.key = this.XpowYmodN(
        this.keys.slaveIntKey,
        this.keys.hostRandom,
        this.keys.modulusKey
      );
      console.log(this.keys);
      console.log();
    }
  }

  XpowYmodN(x, y, N) {
    var result = 1;
    var oneShift63 = 1 << 63;
    for (var i = 0; i < 64; y <<= 1, i++) {
      result = (result * result) % N;
      if ((y & oneShift63) !== 0) result = (result * x) % N;
    }
    return result;
  }

  CRC16(command) {
    var length = command.length,
      seed = 0xffff,
      poly = 0x8005,
      crc = seed;

    for (var i = 0; i < length; i++) {
      crc ^= command[i] << 8;
      for (var j = 0; j < 8; j++) {
        if (crc & 0x8000) {
          crc = ((crc << 1) & 0xffff) ^ poly;
        } else {
          crc <<= 1;
        }
      }
    }
    return [crc & 0xff, (crc >> 8) & 0xff];
  }

  getSequence() {
    if (this.sequence == 0x80) {
      this.sequence = 0x00;
    } else {
      this.sequence = 0x80;
    }
    return this.sequence;
  }

  generatePacking(commandLine) {
    var a = [];
    for (var i = commandLine.length; i < 14; i++) {
      a.push(0);
    }
    return a;
  }

  toPackets(command, args = [], commandName) {
    this.currentCommand = commandName;
    var commandLine;
    var STX = 0x7f;
    var LENGTH = args.length + 1;
    var SEQ_SLAVE_ID = this.getSequence();
    var DATA = [command].concat(args);

    commandLine = [SEQ_SLAVE_ID, LENGTH].concat(DATA);
    var crc = this.CRC16(commandLine);
    commandLine = [STX].concat(commandLine, crc);

    let date = moment(new Date()).format("HH:mm:ss.SSS");
    console.log(
      chalk.cyan(date),
      "COM1 => ",
      chalk.yellow(
        Array.prototype.slice.call(commandLine, 0).map(function(item) {
          return item.toString(16).toUpperCase();
        })
      ),
      "|",
      commandName,
      "|",
      "unecrypted"
    );

    if (this.keys.key != null) {
      var STEX = 0x7e;
      var eLENGTH = DATA.length;
      this.count++;
      var eCOUNT = this.parseCountString(this.count.toString(16), 4);
      var eDATA = DATA;
      var eCommandLine = [eLENGTH].concat(eCOUNT, eDATA);
      var ePACKING = this.generatePacking(eCommandLine);
      eCommandLine = eCommandLine.concat(ePACKING);
      var eCRC = this.CRC16(eCommandLine);
      eCommandLine = eCommandLine.concat(eCRC);

      var parse = function(a, count) {
        for (var i = a.length; i < count; i++) {
          a.push(0);
        }
        return a;
      };

      console.log(
        chalk.cyan(date),
        "COM1 => ",
        chalk.yellow(
          Array.prototype.slice.call(eCommandLine, 0).map(function(item) {
            return item.toString(16).toUpperCase();
          })
        ),
        "|",
        commandName,
        "|",
        "raw"
      );

      var key = parse(
        Array.prototype.slice.call(this.keys.fixedKey, 0),
        8
      ).concat(this.parseKeyString(this.keys.key.toString(16), 8));

      console.log(key);
      var aesCtr = new aesjs.ModeOfOperation.ecb(key);
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
      let date = moment(new Date()).format("HH:mm:ss.SSS");
      console.log(
        chalk.cyan(date),
        "COM1 => ",
        chalk.yellow(
          Array.prototype.slice.call(commandLine, 0).map(function(item) {
            return item.toString(16).toUpperCase();
          })
        ),
        "|",
        commandName,
        "|",
        "encrypted"
      );
    }

    return commandLine;
  }

  parseBuffer(buffer) {
    let data, buf, crc;
    if (buffer[0] === 0x7f) {
      buf = buffer.toJSON();
      if (buf.data) {
        buf = buf.data;
      }
      data = buf.slice(3, 3 + buffer[2]);
      crc = this.CRC16(buf.slice(1, buf[2] + 3));
      if (buf[buf.length - 2] !== crc[0] && buf[buf.length - 1] !== crc[1]) {
        console.log(chalk.red("Wrong CRC from validator"));
        return;
      }

      let date = moment(new Date()).format("HH:mm:ss.SSS");
      console.log(
        chalk.cyan(date),
        "COM1 <= ",
        chalk.green(
          Array.prototype.slice.call(buffer, 0).map(function(item) {
            return item.toString(16).toUpperCase();
          })
        ),
        "|",
        chalk.magenta(data),
        this.currentCommand
      );
      console.log("");
      if (data[0]) {
      }
      if (this.currentCommand == "REQUEST_KEY_EXCHANGE") {
        if (data[0] == 240) this.createHostEncryptionKeys(data);
      } else if (this.currentCommand == "SETUP_REQUEST") {
        if (data[0] == 240) {
          let currency = hex2ascii(
            data[6].toString(16) + data[7].toString(16) + data[8].toString(16)
          );
          let firmwareversion = data[11];
          let channels = data[12];
          let denominations = [];
          for (let i = 0; i < channels * 1; i++) {
            let denomination = data[13 + i];
            denominations.push(denomination);
          }
          let event = [
            "setup_request",
            { currency, firmwareversion, channels, denominations }
          ];
          this.emit.apply(this, event);
        }
      } else {
        this.emitEvent(data, buffer);
      }
    } else {
      this.emit("unregistered_data", buffer);
    }
  }

  emitEvent(data, buffer) {
    let error = new Error("New error");
    error.code = data[0];
    switch (data[0]) {
      case 0xf2:
        error.message = "Command not known";
        break;
      case 0xf3:
        error.message = "Wrong no parameters";
        break;
      case 0xf4:
        error.message = "Parameter out of range";
        break;
      case 0xf5:
        error.message = "Command cannot be processed";
        break;
      case 0xf6:
        error.message = "Software error";
        break;
      case 0xf8:
        error.message = "Fail";
        break;
      case 0xfa:
        error.message = "Key not set";
        break;
      case 0xf0:
        break;
      default:
        error.message = "Unknown error";
    }
    if (error.code !== 0xf0) {
      this.emit("error", error, buffer);
    } else if (data.length > 1) {
      var event;
      switch (data[1]) {
        case 0xf1: //all
          event = ["slave_reset"];
          break;
        case 0xef: //bv20|bv50|bv100|nv9usb|nv10usb|nv200|SMART Payout|nv11
          event = ["read_note", data[2]];
          break;
        case 0xee: //bv20|bv50|bv100|nv9usb|nv10usb|nv200|SMART Payout|nv11
          event = ["credit_note", data[2]];
          break;
        case 0xed: //bv20|bv50|bv100|nv9usb|nv10usb|nv200|SMART Payout|nv11
          event = ["note_rejecting"];
          break;
        case 0xec: //bv20|bv50|bv100|nv9usb|nv10usb|nv200|SMART Payout|nv11
          //recieve reject code
          // self.commands.exec("last_reject_code");
          break;
        case 0xcc: //bv20|bv50|bv100|nv9usb|nv10usb|nv200|SMART Payout|nv11
          event = ["note_stacking"];
          break;
        case 0xeb: //bv20|bv50|bv100|nv9usb|nv10usb|nv200|SMART Payout|nv11
          event = ["note_stacked"];
          break;
        case 0xea: //bv20|bv50|bv100|nv9usb|nv10usb|nv200|SMART Payout|nv11
          event = ["safe_note_jam"];
          break;
        case 0xe9: //bv20|bv50|bv100|nv9usb|nv10usb|nv200|SMART Payout|nv11
          event = ["unsafe_note_jam"];
          break;
        case 0xe8: //all
          event = ["disabled"];
          break;
        case 0xe6: //bv20|bv50|bv100|nv9usb|nv10usb|nv200|nv201|SMART Payout|nv11|SMART Hopper
          event = ["fraud_attempt", data[2]];
          break;
        case 0xe7: //bv20|bv50|bv100|nv9usb|nv10usb|nv200|SMART Payout|nv11
          event = ["stacker_full"];
          break;
        case 0xe1: //bv20|bv50|bv100|nv9usb|nv10usb|nv200|nv201|SMART Payout|nv11
          event = ["note_cleared_from_front", data[2]];
          break;
        case 0xe2: //bv20|bv50|bv100|nv9usb|nv10usb|nv200|nv201|SMART Payout|nv11
          event = ["note_cleared_to_cashbox", data[2]];
          break;
        case 0xe3: //bv50|bv100|nv200|SMART Payout|nv11
          event = ["cashbox_removed"];
          break;
        case 0xe4: //bv50|bv100|nv200|SMART Payout|nv11
          event = ["cashbox_replaced"];
          break;
        case 0xe5: //nv200|nv201
          event = ["barcode_ticket_validated"];
          break;
        case 0xd1: //nv200|nv201
          event = ["barcode_ticket_acknowledge"];
          break;
        case 0xe0: //nv200
          event = ["note_path_open"];
          break;
        case 0xb5: //bv20|bv50|bv100|nv9usb|nv10usb|nv200|SMART Payout|nv11
          event = ["channel_disable"];
          break;
        case 0xb6: //bv20|bv50|bv100|nv9usb|nv10usb|nv200|nv201|SMART Payout|nv11|SMART Hopper
          event = ["initialing"];
          break;
        case 0xda: //SMART payout|SMART Hopper|nv11
          event = ["dispensing", data[2]];
          break;
        case 0xd2: //SMART payout|SMART Hopper|nv11
          event = ["dispensed", data[2]];
          break;
        case 0xd2: //SMART payout|SMART Hopper|nv11
          event = ["jammed", data[2]];
          break;
        case 0xd6: //SMART payout|SMART Hopper|nv11
          event = ["halted", data[2]];
          break;
        case 0xd7: //SMART payout|SMART Hopper
          event = ["floating", data[2]];
          break;
        case 0xd8: //SMART payout|SMART Hopper
          event = ["floated", data[2]];
          break;
        case 0xd9: //SMART payout|SMART Hopper|nv11
          event = ["timeout", data[2]];
          break;
        case 0xdc: //SMART payout|SMART Hopper|nv11
          event = ["incomplete_payout", data[2]];
          break;
        case 0xdd: //SMART payout|SMART Hopper|nv11
          event = ["incomplete_payout", data[2]];
          break;
        case 0xde: //SMART Hopper
          event = ["cashbox_paid", data[2]];
          break;
        case 0xdf: //SMART Hopper
          event = ["coin_credit", data[2]];
          break;
        case 0xc4: //SMART Hopper
          event = ["coin_mech_jammed"];
          break;
        case 0xc5: //SMART Hopper
          event = ["coin_mech_return_pressed"];
          break;
        case 0xb7: //SMART Hopper
          event = ["coin_mech_error"];
          break;
        case 0xc2: //SMART payout|SMART Hopper|nv11
          event = ["emptying"];
          break;
        case 0xc3: //SMART payout|SMART Hopper|nv11
          event = ["emptied"];
          break;
        case 0xb3: //SMART payout|SMART Hopper|nv11
          event = ["smart_emptying", data[2]];
          break;
        case 0xb4: //SMART payout|SMART Hopper|nv11
          event = ["smart_emptied", data[2]];
          break;
        case 0xdb: //SMART payout|nv11
          event = ["note_stored_in_payout", data[2]];
          break;
        case 0xc6: //SMART payout|nv11
          event = ["payout_out_of_service"];
          break;
        case 0xb0: //SMART payout
          event = ["jam_recovery"];
          break;
        case 0xb1: //SMART payout
          event = ["error_during_payout"];
          break;
        case 0xc9: //SMART payout|nv11
          event = ["note_transfered to stacker", data[2]];
          break;
        case 0xce: //SMART payout|nv11
          event = ["note_held_in_bezel", data[2]];
          break;
        case 0xcb: //SMART payout|nv11
          event = ["note_paid_into_store_at_powerup", data[2]];
          break;
        case 0xcb: //SMART payout|nv11
          event = ["note_paid_into_stacker_at_powerup", data[2]];
          break;
        case 0xcd: //nv11
          event = ["note_dispensed_at_powerup", data[2]];
          break;
        case 0xc7: //nv11
          event = ["note_float_removed"];
          break;
        case 0xc8: //nv11
          event = ["note_float_attached"];
          break;
        case 0xc9: //nv11
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
}
