// __Dependencies__
var mongoose = require('mongoose');
var express = require('express');
var async = require('async');
var es = require('event-stream');
var baucis = require('../..');
var config = require('./config');

// __Private Module Members__
var app;
var server;
var controller;
var subcontroller;

// __Fixture Schemata__
var Schema = mongoose.Schema;
var Fungus = new Schema({ 'hyphenated-field-name': String });
var Mineral = new Schema({ color: String });
var Vegetable = new Schema({
  name: { type: String, required: true },
  lastModified: { type: Date, required: true, default: Date.now },
  diseases: { type: [ String ], select: false },
  species: { type: String, default: 'n/a', select: false },
  related: { type: Schema.ObjectId, ref: 'vegetable' },
  score: { type: Number, min: 1 }
});

Vegetable.pre('save', function (next) {
  this.set('related', this._id);
  next();
});

Vegetable.pre('save', function (next) {
  this.set('lastModified', new Date());
  next();
});

Vegetable.pre('save', function (next) {
  fixture.saveCount += 1;
  next();
});

Vegetable.pre('remove', function (next) {
  fixture.removeCount += 1;
  next();
});

// __Module Definition__
var fixture = module.exports = {
  init: function (done) {
    mongoose.connect(config.mongo.url);

    if (!mongoose.models['vegetable']) mongoose.model('vegetable', Vegetable);
    if (!mongoose.models['fungus']) mongoose.model('fungus', Fungus);
    if (!mongoose.models['mineral']) mongoose.model('mineral', Mineral);

    fixture.saveCount = 0;
    fixture.removeCount = 0;

    baucis.rest({
      singular: 'fungus',
      plural: 'fungi',
      select: '-hyphenated-field-name'
    });

    baucis.rest({
      singular: 'mineral',
      relations: true
    });

    controller = fixture.controller = baucis.rest({
      singular: 'vegetable',
      lastModified: 'lastModified',
      relations: false,
      'allow hints': true,
      'allow comments': true
    });

    controller.request(function (request, response, next) {
      if (request.query.block === 'true') return response.send(401);
      next();
    });

    controller.query(function (request, response, next) {
      if (request.query.testQuery !== 'true') return next();
      request.baucis.query.select('_id lastModified');
      next();
    });

    controller.documents(function (request, response, next) {
      if (request.query.testDocuments !== 'true') return next();
      var transformation = JSON.stringify(request.baucis.documents).substring(0, 6).split('');
      request.baucis.documents = transformation;
      next();
    });

    // Test streaming in through custom handler
    controller.request(function (request, response, next) {
      if (request.query.streamIn !== 'true') return next();
      request.baucis.incoming(es.map(function (doc, callback) {
        doc.name = 'boom';
        callback(null, doc);
      }));
      next();
    });

    // Test streaming in through custom handler
    controller.request(function (request, response, next) {
      if (request.query.streamInFunction !== 'true') return next();
      request.baucis.incoming(function (doc, callback) {
        doc.name = 'bimm';
        callback(null, doc);
      });
      next();
    });

    // Test streaming out through custom handler
    controller.request(function (request, response, next) {
      if (request.query.streamOut !== 'true') return next();
      request.baucis.outgoing(es.map(function (doc, callback) {
        doc.name = 'beam';
        callback(null, doc);
      }));
      next();
    });

    // Test that parsed body is respected
    controller.request(function (request, response, next) {
      if (request.query.parse !== 'true') return next();
      express.json()(request, response, next);
    });

    // Test arbitrary documents
    controller.request(function (request, response, next) {
      if (request.query.creamIt !== 'true') return next();
      request.baucis.documents = 'Devonshire Clotted Cream.';
      next();
    });

    // Test 404 for documents
    controller.request(function (request, response, next) {
      if (request.query.emptyIt !== 'true') return next();
      request.baucis.documents = 0;
      next();
    });

    app = express();
    app.use('/api', baucis());

    server = app.listen(8012);

    done();
  },
  deinit: function (done) {
    server.close();
    mongoose.disconnect();
    done();
  },
  create: function (done) {
    var Vegetable = mongoose.model('vegetable');
    var Mineral = mongoose.model('mineral');
    var mineralColors = [ 'Blue', 'Green', 'Pearlescent', 'Red', 'Orange', 'Yellow', 'Indigo', 'Violet' ];
    var vegetableNames = [ 'Turnip', 'Spinach', 'Pea', 'Shitake', 'Lima Bean', 'Carrot', 'Zucchini', 'Radicchio' ];
    var minerals = mineralColors.map(function (color) {
      return new Mineral({ color: color });
    });
    vegetables = vegetableNames.map(function (name) { // TODO leaked global
      return new Vegetable({ name: name });
    });
    var deferred = [
      Vegetable.remove.bind(Vegetable),
      Mineral.remove.bind(Mineral)
    ];

    deferred = deferred.concat(vegetables.map(function (vegetable) {
      return vegetable.save.bind(vegetable);
    }));

    deferred = deferred.concat(minerals.map(function (mineral) {
      return mineral.save.bind(mineral);
    }));

    async.series(deferred, done);
  }
};
