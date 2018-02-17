'use strict';

const _ = require('underscore');
const fs = require('fs');
const parser = require('xml2json');
const async = require('async');
const debug = require('debug');
const log =   debug('ipso-pub');
const path_root = __dirname;
const error = console.error; 

var DEFS = {};

DEFS.lwm2mid = require('lwm2m-id');

function addOid(key, value) {
   var oidd = {};
   oidd[key] = value;
   DEFS.lwm2mid.addOid(oidd);
   log("Add Oid: ",key, value);
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
   var resource = {};
   var attribs = {};
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
	log("Adding Oids");
	_.each(defs.oid, function(v,k) {
		//log(k,v);
      addOid(k,v);
	});

	log("Adding Object Specific");
	_.each(defs.objectSpec, function(v,k) {
      DEFS.lwm2mid._defs.objectSpec[k] = v;
   })

	log("Adding Specific Resource Ids");
	_.each(defs.specificRid, function(v,k) {
		//log(k,v);
		DEFS.lwm2mid.addSpecificRid(k,v);
	});

	log("Adding Specific Resource Characteristics");
	_.each(defs.specificResrcChar, function(v,k) {
		//log(k,v);
		DEFS.lwm2mid.addSpecificResrcChar(k,v);
	});
}

function processPubResource(oid,oname, resource) {
   var fres = createResource(resource);
   var rid = resource['ID'];

   // Specific rids are those who are limited to the object
   // 2048 - 26240
   if (parseInt(rid) < 2048) {
      var rd = {}
      rd[resource['Name']] = resource['ID'];
      DEFS.lwm2mid.addSpecificRid(oname, rd);
      log("Added specific RID ",oid, rd);
   }
   // Unique rids are those who shared between objects
   else {
      try {
         var rd = {}
         rd[resource['Name']] = resource['ID'] ? resource['ID'] : resource['ResourceID'];
         try {
            DEFS.lwm2mid.addUniqueRid(rd);
            log("Added unique RID ",resource['Name'], rd[resource['Name']]);
         } catch (ex) {
         }

         if (oname) {
            DEFS.lwm2mid.addSpecificRid(oname, rd);
            log("  Add resource: ",resource['Name']);
         }
      } catch (ex) {
         error("Error adding unique Rid",ex);
      }
   }

   // if we're given an object, add the resource description to it
   if(oname)
      DEFS.lwm2mid.addSpecificResrcChar(oname, fres);
}


function processPubDefs(item) {
   if (!DEFS.lwm2mid.getOid(item['ObjectID'])) {
      //log("Adding", item['ObjectID'], item['Name']);

      var oid = item['ObjectID'];

      // add the Oid
      addOid(item['Name'], oid);

      // add the object spec
      var ospecd = {}
      if (item['MultipleInstances'] == 'Multiple') {
         ospecd['multi'] = true;
      }
         
      if (item['Mandatory'] == 'Optional') {
         ospecd['mand'] = false;
      }
      DEFS.lwm2mid.objectSpec[item['Name']] = ospecd;

      _.each(item['Resources']['Item'], function(resource) {
         processPubResource(oid, item['Name'], resource);
      });
      //log(DEFS.lwm2mid.objectSpec);
   }
   else {
      //log("Object exists ", item['ObjectID']);
   }
}


function processRegObjs(callback) {
   //
   // Process Misc
   //
   var path = path_root + '/reg/xml'
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
   var path = path_root + '/lighting-objects/resources/json'
   var files = fs.readdirSync(path);

   async.each(files, function(filename, cb) {
      if (filename)
         fs.readFile(path+"/"+filename, function(err, data) {
            var items = JSON.parse(data)['Resources'];
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
   var path = path_root + '/lighting-objects/objects/json';
   var files = fs.readdirSync(path);

   async.each(files, function(filename, cb) {
      if (filename)
         fs.readFile(path+"/"+filename, function(err, data) {
            var item = JSON.parse(data)['LWM2M']['Object'];
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
   console.log('Oid count: ',Object.keys(DEFS.lwm2mid.Oid._enumMap).length);
   console.log('Unique Rid count: ',Object.keys(DEFS.lwm2mid.UniqueRid._enumMap).length);
   console.log('Specific Rid Oid count: ',Object.keys(DEFS.lwm2mid.SpecificRid).length);
   console.log('*****************************************');
   callback();
}

// public API:  processPrivateDefsFile
DEFS.processPrivateDefsFile = function (filename, callback) {
   //
   // Process private objects
   //
   try {
      var defs = require(filename);
      // do stuff
   } catch (ex) {
      throw new Error("No private definitions found: "+filename);
      console.log("huh ", filename);
   }

   processPrivateDefs(defs);

   if (callback)
      callback();
}

async.series([
   //printObjs,
   processRegObjs,
   //printObjs,
   processLightingRes,
   processLightingObjs,
   //printObjs
]);

module.exports = DEFS;
