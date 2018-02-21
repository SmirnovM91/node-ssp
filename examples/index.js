"use strict";
var ssp = require('../');
import essp from '../essp';
var notes = {
    1: "1USD",
    2: "5USD",
    3: "10USD",
    4: "20USD",
    5: "50USD",
    6: "100USD"
};
var esspInstance = new essp()
esspInstance.initialize({
    device: 'COM1', //device address
    type: "nv200", //device type
    currencies: [1, 1, 1, 1, 1, 1] //currencies types acceptable. Here all but 100USD
})
esspInstance.on("ready", async()=> {
    esspInstance.poll()
})
esspInstance.on('read_note', function (note) {
    if (note > 0) {
        console.log("GOT", notes[note]);

    }
});
esspInstance.on('disabled', function () {
    console.log("disabled");
});
esspInstance.on('note_cleared_from_front', function (note) {
    console.log("note_cleared_from_front");
});
esspInstance.on('note_cleared_to_cashbox', function (note) {
    console.log("note_cleared_to_cashbox");
});
esspInstance.on('credit_note', function (note) {
    console.log("CREDIT", notes[note]);
});
esspInstance.on("safe_note_jam", function (note) {
    console.log("Jammed", note);
});
esspInstance.on("unsafe_note_jam", function (note) {
    console.log("Jammed inside", note);
});
esspInstance.on("fraud_attempt", function (note) {
    console.log("Fraud!", note);
});
esspInstance.on("stacker_full", function (note) {
    console.log("I'm full, do something!");
    esspInstance.disable();
});
esspInstance.on("note_rejected", function (reason) {
    console.log("Rejected!", reason);
});
esspInstance.on("error", function (err) {
    console.log(err.code, err.message);
});
esspInstance.on("setup_request", function (data) {
    console.log("data", data);
});


setTimeout(async()=> {
    await esspInstance.sync()
    await esspInstance.initiateKeys()

    await esspInstance.enable()
    await esspInstance.setup_request()
}, 200)


process.on('SIGINT', function () {
    process.exit(0);
});

process.on('uncaughtException', function (err) {
    console.log(err.stack);
    setTimeout(function () {
        process.exit(1);
    }, 500);
});

process.on('exit', function () {
    ssp.port && ssp.port.isOpened && ssp.disable();
    esspInstance.port && esspInstance.port.isOpened && esspInstance.disable();
});