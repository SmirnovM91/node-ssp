"use strict";
var ssp = require('../');
var notes = {
    1: "1USD",
    2: "5USD",
    3: "10USD",
    4: "20USD",
    5: "50USD",
    6: "100USD"
};
ssp = new ssp({
    device: 'COM1', //device address
    type: "nv200", //device type
    currencies: [1, 1, 1, 1, 1, 1] //currencies types acceptable. Here all but 100USD
});

ssp.init(function () {
    console.log("init")
    ssp.on('ready', function () {
        console.log("Device is ready");
        setTimeout(function () {
            // ssp.commands.setup_request()
            ssp.commands.set_denomination_route(0x00, 0x64, 0x00, 0x00, 0x00, 0x55, 0x53, 0x44)
            // ssp.commands.enable_payout_device()
            // ssp.enable();
            // ssp.commands.get_denomination_level(0x64, 0x00, 0x00, 0x00, 0x55, 0x53, 0x44)
        }, 3000);

        // ssp.commands.get_denomination_route(0x64, 0x00, 0x00, 0x00, 0x55, 0x53, 0x44)
        // ssp.commands.get_denomination_level(0x64, 0x00, 0x00, 0x00, 0x55, 0x53, 0x44)
        // ssp.commands.payout_amount(0x64, 0x00, 0x00, 0x00, 0x55, 0x53, 0x44, 0x58)
        // ssp.commands.sync().smart_empty();
        // ssp.commands.sync().cashbox_payout_operation_data();

    });
    ssp.on('read_note', function (note) {
        if (note > 0) {
            console.log("GOT", notes[note]);
            if (note === 3) {
                // suddenly we decided that we don't need 1000 KZT
                ssp.commands.exec("reject_banknote");
            }
        }
    });
    ssp.on('disabled', function () {
        console.log("disabled");
    });
    ssp.on('note_cleared_from_front', function (note) {
        console.log("note_cleared_from_front");
    });
    ssp.on('note_cleared_to_cashbox', function (note) {
        console.log("note_cleared_to_cashbox");
    });
    ssp.on('credit_note', function (note) {
        console.log("CREDIT", notes[note]);
    });
    ssp.on("safe_note_jam", function (note) {
        console.log("Jammed", note);
        //TODO: some notifiaction, recording, etc.
    });
    ssp.on("unsafe_note_jam", function (note) {
        console.log("Jammed inside", note);
        //TODO: some notifiaction, recording, etc.
    });
    ssp.on("fraud_attempt", function (note) {
        console.log("Fraud!", note);
        //TODO: some notifiaction, recording, etc.
    });
    ssp.on("stacker_full", function (note) {
        console.log("I'm full, do something!");
        ssp.disable();
        //TODO: some notifiaction, recording, etc.
    });
    ssp.on("note_rejected", function (reason) {
        console.log("Rejected!", reason);
    });
    ssp.on("error", function (err) {
        console.log(err.code, err.message);
    });
});

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
});