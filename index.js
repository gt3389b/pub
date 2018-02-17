'use strict';

const lwm2mid = require('lwm2m-id');
const _ = require('underscore');
const fs = require('fs');
const parser = require('xml2json');
const async = require('async');

var DEFS = {};

function addOid(key, value) {
   oidd = {}
   oidd[key] = value;
   lwm2mid.addOid(oidd);
   console.log("Add Oid: ",key, value);
}

//{ ID: '5850',
//Name: 'On/Off',
//Operations: 'RW',
//MultipleInstances: 'Single',
//Mandatory: 'Optional',
//Type: 'Boolean',
//RangeEnumeration: {},
//Units: {},
//Description: 'On/Off control for the stopwatch, True=ON, False=OFF.' }
function createResource(item) {
   //"dInState": { "access": "R", "multi": false, "mand": true, "type": "boolean", "range": null, "init": false },
   resource = {};
   attribs = {};
   attribs['access'] = item['Operations'];
   attribs['mand'] = item['Mandatory'] == 'Optional' ? false : true;
   attribs['multi'] = item['MultipleInstances'] == 'Single' ? false : true;
   if (typeof item['Type'] === 'string')
      attribs['type'] = item['Type'].toLowerCase();
   else
      attribs['type'] = 'execute';

   attribs['range'] = null;
   attribs['init'] = null;

   resource[item['Name']] = attribs;
   return resource;
}


function processPrivateDefs(defs) {
	console.log("Adding Oids");
	_.each(defs.oid, function(v,k) {
		//console.log(k,v);
      addOid(k,v);
		lwm2mid.addOid(oidd);
	});

	console.log("Adding Object Specific");
	_.each(defs.objectSpec, function(v,k) {
      lwm2mid._defs.objectSpec[k] = v;
   })

	console.log("Adding Specific Resource Ids");
	_.each(defs.specificRid, function(v,k) {
		//console.log(k,v);
		lwm2mid.addSpecificRid(k,v);
	});

	console.log("Adding Specific Resource Characteristics");
	_.each(defs.specificResrcChar, function(v,k) {
		//console.log(k,v);
		lwm2mid.addSpecificResrcChar(k,v);
	});
}

function processPubResource(oid,oname, resource) {

   //console.log(resource);
   fres = createResource(resource);

   var rid = resource['ID'];

   // Specific rids are those who are limited to the object
   //2048 - 26240
   if (parseInt(rid) < 2048) {
      var rd = {}
      rd[resource['Name']] = resource['ID'];
      lwm2mid.addSpecificRid(oname, rd);
      console.log("Added specific RID ",oid, rd);
   }
   // Unique rids are those who shared between objects
   else {
      try {
         var rd = {}
         rd[resource['Name']] = resource['ID'] ? resource['ID'] : resource['ResourceID'];
         try {
            lwm2mid.addUniqueRid(rd);
            console.log("Added unique RID ",resource['Name'], rd[resource['Name']]);
         } catch (ex) {
         }

         if (oname) {
            lwm2mid.addSpecificRid(oname, rd);
            console.log("  Add resource: ",resource['Name']);
         }
      } catch (ex) {
         console.log("Error adding unique Rid",ex);
      }
   }

   // if we're given an object, add the resource description to it
   if(oname)
      lwm2mid.addSpecificResrcChar(oname, fres);
}


function processPubDefs(item) {
   if (!lwm2mid.getOid(item['ObjectID'])) {
      //console.log("Adding", item['ObjectID'], item['Name']);

      var oid = item['ObjectID'];

      // add the Oid
      addOid(item['Name'], oid);

      // add the object spec
      ospecd = {}
      if (item['MultipleInstances'] == 'Multiple') {
         ospecd['multi'] = true;
      }
         
      if (item['Mandatory'] == 'Optional') {
         ospecd['mand'] = false;
      }
      lwm2mid.objectSpec[item['Name']] = ospecd;

      _.each(item['Resources']['Item'], function(resource) {
         processPubResource(oid, item['Name'], resource);
      });
      //console.log(lwm2mid.objectSpec);
   }
   else {
      //console.log("Object exists ", item['ObjectID']);
   }
}

function processPrivObjs(callback) {
   //
   // Process private objects
   //
   try {
      var defs = require('./eaton-defs.json');
      processPrivateDefs(defs);
      // do stuff
   } catch (ex) {
      console.log("No private definitions found");
   }
   callback();
}

function processRegObjs(callback) {
   //
   // Process Misc
   //
   var path = 'reg/xml'
   var files = fs.readdirSync(path);

   async.each(files, function(filename, cb) {
      if (filename)
         fs.readFile(path+"/"+filename, function(err, data) {
            var json = JSON.parse(parser.toJson(data));
            var item = json['LWM2M']['Object'];
            processPubDefs(item);
            cb();
         });
      else
         cb();
   }, function(err) {
      callback()
   });
}


function processLightingRes(callback) {
   //
   // Process Lighting Resoures
   //
   var path = 'lighting-objects/resources/json'
   var files = fs.readdirSync(path);

   async.each(files, function(filename, cb) {
      if (filename)
         fs.readFile(path+"/"+filename, function(err, data) {
            items = JSON.parse(data)['Resources'];
            _.each(items['Item'], function(item) {
               processPubResource(null, null, item);
            });
            cb();
         });
      else
         cb();
   }, function(err) {
      callback();
   });
};

function processLightingObjs(callback) {
   //
   //
   // Process Lighting Objects
   //
   //
   path = 'lighting-objects/objects/json';
   var files = fs.readdirSync(path);

   async.each(files, function(filename, cb) {
      if (filename)
         fs.readFile(path+"/"+filename, function(err, data) {
            item = JSON.parse(data)['LWM2M']['Object'];
            processPubDefs(item);
            cb();
         });
      else
         cb();
   }, function(err) {
      callback();
   });
};

function printObjs(callback) {
   console.log('\n*****************************************');
   console.log('Oid count: ',Object.keys(lwm2mid.Oid._enumMap).length);
   console.log('Unique Rid count: ',Object.keys(lwm2mid.UniqueRid._enumMap).length);
   console.log('Specific Rid Oid count: ',Object.keys(lwm2mid.SpecificRid).length);
   console.log('*****************************************');
   callback();
}

DEFS.processPrivateDefsFile = function (filename, callback) {
   //
   // Process private objects
   //
   try {
      var defs = require(filename);
      processPrivateDefs(defs);
      // do stuff
   } catch (ex) {
      console.log("No private definitions found: ",filename);
   }
   callback();
}

async.series([
   printObjs,
   processRegObjs,
   printObjs,
   processLightingRes,
   processLightingObjs,
   printObjs,
   async.apply(processPrivObjs, './eaton-defs.json'),
   printObjs
]);

module.exports = DEFS;
