
var SSPClass = require('../');
const notes = {
    1: '5EUR',
    2: '10EUR',
    3: '20EUR',
    4: '50EUR',
    5: '100EUR',
    6: '200EUR',
    7: '500EUR',
}

const ssp = new SSPClass({
    device: '/dev/tty6 ', // device address
    type: 'nv9usb', // device type
    currencies: [1, 1, 1, 1, 1, 1, 1], // currencies types acceptable. Here all but 100USD
})

ssp.init(function () {
    ssp.on('ready', function () {
        console.log('Device is ready')
        ssp.enable()
        ssp.commands.exec('hold')

    })
    ssp.on('read_note', function (note) {
        if (note > 0) {
            console.log('GOT', notes[note])
        }
    })
    ssp.on('disable', function () {
        console.log('disabled')
    })
    ssp.on('note_cleared_from_front', function (note) {
        console.log('note_cleared_from_front')
    })
    ssp.on('note_cleared_to_cashbox', function (note) {
        console.log('note_cleared_to_cashbox')
    })
    ssp.on('credit_note', function (note) {
        console.log('CREDIT', notes[note])
    })
    ssp.on('safe_note_jam', function (note) {
        console.log('Jammed', note)
        //TODO: some notifiaction, recording, etc.
    })
    ssp.on('unsafe_note_jam', function (note) {
        console.log('Jammed inside', note)
        //TODO: some notifiaction, recording, etc.
    })
    ssp.on('fraud_attempt', function (note) {
        console.log('Fraud!', note)
        //TODO: some notifiaction, recording, etc.
    })
    ssp.on('stacker_full', function (note) {
        console.log('I\'m full, do something!')
        ssp.disable()
        //TODO: some notifiaction, recording, etc.
    })
    ssp.on('note_rejected', function (reason) {
        console.log('Rejected!', reason)
    })
    ssp.on('error', function (err) {
        console.log(err)
    })
})

process.on('SIGINT', function () {
    process.exit(0)
})

process.on('uncaughtException', function (err) {
    console.log(err.stack)
    setTimeout(function () {
        process.exit(1)
    }, 500)
})

process.on('exit', function () {
    ssp.port && ssp.port.isOpened && ssp.disable()
})
