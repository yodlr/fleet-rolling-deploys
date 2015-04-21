var Fleetctl = require('fleetctl');
var fleetctl;
var async = require('async');
var _ = require('lodash');

var api = module.exports = {};

var ACTIVE_TIMEOUT = 300000; // 5 minutes

api.deploy = function(unit, etcdKey, count, sidekick, endpoint) {

  var opts = {
    binary: process.env.FLEET_BINARY || '/usr/bin/fleetctl',
    endpoint: process.env.FLEET_ENDPOINT || endpoint || 'http://172.17.42.1:4001'
  }
  fleetctl = new Fleetctl(opts);

  if (sidekick) {
    sidekick = unit + '-sk';
  }

  async.waterfall([
    function(callback) {
      return startThisService(unit, sidekick, count, callback);
    },
    function(callback) {
      return waitForActive(unit, count, callback);
    },
    function(callback) {
      return getUnitsToDestroy(unit, callback);
    },
    function(destroy, callback) {
      return destroyUnits(destroy, callback);
    }
    //getAllUnits,
  ], function(err, success) {
    if (err) {
      console.error(err);
    }
  })
};

/*
 1) Start new instances
 2) Wait for new instances to all be active
 3) Check etcd keys for all instances
 4) Destroy old instances, but leave templates
*/

function getUnitsToDestroy(unitName, callback) {
  var prefix = unitName.slice(0, unitName.lastIndexOf('-'));
  fleetctl.list_units(function(err, units) {
    if (err) {
      return callback(err);
    }
    var destroy = units.filter(function(unit) {
      if (unit.unit.indexOf(unitName) === -1 && unit.unit.indexOf(prefix) === 0) {
        return true;
      }
      return false;
    });
    return callback(null, destroy);
  });
}

function destroyUnits(units, callback) {
  units = _.pluck(units, 'unit');
  console.log('about to destroy old units', units);
  fleetctl.destroy(units, function(err) {
    if (err) {
      console.log('error destroying old units');
      return callback(err);
    }
    console.log('Old units successfully destroyed');
    return callback();
  });
}

// waits for all service to be active
function waitForActive(unit, count, callback) {
  var units = getUnits(unit, count);
  var allActive = false;
  var startTime = new Date().getTime();
  async.doWhilst(
    function getStatus(callback) {
      setTimeout(function() {
        var countActive = 0;
        fleetctl.list_units(function(err, fltUnits) {
          if (err) {
            return callback(err);
          }
          units.forEach(function(unit) {
            var item = _.find(fltUnits, function(u) {
              return u.unit === unit+'.service';
            })
            if (item && item.active === 'active' && item.sub === 'running') {
              countActive++;
            }
            else {
              console.log('Service not active', item.unit, item.active, item.sub);
            }
          });
          console.log(countActive, 'services are active of expected ', count);
          if (countActive === count) {
            allActive = true;
          }
          return callback();
        })
      }, 1000);
    },
    function checkStatus() {
      var now = new Date().getTime();
      if (now - startTime > ACTIVE_TIMEOUT) {
        return false;
      }
      return !allActive;
    },
    function() {
      if (!allActive) {
        return callback(new Error('Failed to start all units'));
      }
      else {
        console.log('All services have been started');
        return callback();
      }
    }
  );
}

function getUnits(unit, count, sidekick) {
  var units = _.chain(_.range(0, count))
    .map(function(iter) {
      return unit + '@' + iter;
    })
    .value();
  var sidekicks = _.chain(_.range(0, count))
    .map(function(iter) {
      return unit + '-sk@' + iter;
    })
    .value();
  if (sidekick) {
    units = units.concat(sidekicks);
  }
  return units;
}

function startThisService(unit, sidekick, count, callback) {
  var units = getUnits(unit, count, sidekick);
  console.log('Starting these units:', units);
  fleetctl.start(units, callback);
}

// function getAllUnits(service, environment, callback) {
//   fleetctl.list_units(function(err, units) {
//     if (err) {
//       return callback(err);
//     }
//     return callback(null, units);
//   })
// }
