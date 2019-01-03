"use strict";

const fs = require("fs");
const proj4 = require("../node_modules/proj4/dist/proj4.js");
proj4.defs(
  "EPSG:2177",
  "+proj=tmerc +lat_0=0 +lon_0=18 +k=0.999923 +x_0=6500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs"
);

// <functions>
// Converts from degrees to radians.
Math.radians = function(degrees) {
  return (degrees * Math.PI) / 180;
};

// Converts from radians to degrees.
Math.degrees = function(radians) {
  return (radians * 180) / Math.PI;
};

function newNode(region, metaData, geometricError = 0, otherKeys = {}) {
  return {
    boundingVolume: {
      region
    },
    content: { uri: "box.b3dm" },
    geometricError,
    extras: {
      metaData
    },
    ...otherKeys
  };
}

function epsg2177ToCartographic({ east, north, altitude }) {
  const [longitude, latitude] = proj4("EPSG:2177", "WGS84", [east, north]);
  return {
    longitude: Math.radians(longitude),
    latitude: Math.radians(latitude),
    height: altitude
  };
}

function calculateRegion(metaDataArray) {
  const cartographics = metaDataArray
    .map(o => {
      const { east, north, altitude } = o;
      return { east, north, altitude };
    })
    .map(epsg2177ToCartographic);

  const maxLon = cartographics.reduce(
    (max, cur) => (cur.longitude > max ? cur.longitude : max),
    Number.MIN_VALUE
  );
  const maxLat = cartographics.reduce(
    (max, cur) => (cur.latitude > max ? cur.latitude : max),
    Number.MIN_VALUE
  );
  const maxHeight = cartographics.reduce(
    (max, cur) => (cur.height > max ? cur.height : max),
    Number.MIN_VALUE
  );
  const minLon = cartographics.reduce(
    (min, cur) => (cur.longitude < min ? cur.longitude : min),
    Number.MAX_VALUE
  );
  const minLat = cartographics.reduce(
    (min, cur) => (cur.latitude < min ? cur.latitude : min),
    Number.MAX_VALUE
  );
  const minHeight = cartographics.reduce(
    (min, cur) => (cur.height < min ? cur.height : min),
    Number.MAX_VALUE
  );
  // 3D tiles spec: https://github.com/AnalyticalGraphicsInc/3d-tiles/tree/master/specification#region
  // [west, south, east, north, minimum height, maximum height]
  return [minLon, minLat, maxLon, maxLat, minHeight, maxHeight];
}
// <\function>

const args = process.argv.slice(2);
console.assert(args.length === 2);
const [source, destination] = args;

const text = fs.readFileSync(source, "utf8");
const json = JSON.parse(text);

const wholeRegion = calculateRegion(json);
let tileset = {
  asset: {
    version: "1.0"
  },
  geometricError: 100,
  root: newNode(wholeRegion, [], 80, { refine: "ADD", children: [] }),
  extras: {
    metaData: []
  }
};
tileset.extras.metaData.push(json.shift());

console.log(JSON.stringify(tileset));

while (json.length > 15) {
  const slice = json.splice(0, 14);
  const region = calculateRegion(slice);
  tileset.root.children.push(newNode(region, slice));
}
const region = calculateRegion(json);
tileset.root.children.push(newNode(region, json));

fs.writeFileSync(destination, JSON.stringify(tileset), "utf8");
