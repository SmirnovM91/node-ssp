var ssp = require('../');
var describe = require("describe")

describe('NV9 device test', function() {
  it('should initialize properly', function(done) {
    ssp = new ssp({
      // device: __dirname + '/ttyEMU', //device address
      type: "nv9usb", //device type
      currencies:[0,1,1,1,1,0] //currencies types acceptable. Here all but 200KZT
    });

    ssp.init(function(){
      console.log("test")
      done();
    });
    ssp.on('error', done);
  });
});