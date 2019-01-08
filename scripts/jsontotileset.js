"use strict";

const fs = require("fs");

// Converts from degrees to radians.
Math.radians = function(degrees) {
  return (degrees * Math.PI) / 180;
};

// Converts from radians to degrees.
Math.degrees = function(radians) {
  return (radians * 180) / Math.PI;
};

const BRANCHING_FACTOR = 4;
const LEAF_SIZE = 5;

////////////////////////////////
// script

const args = process.argv.slice(2);
console.assert(args.length === 2, "provide exactly 2 arguments");
const [source, destination] = args;

const json = JSON.parse(fs.readFileSync(source, "utf8"));

const rootRegion = calculateRegion(json);
const [minLon, minLat, maxLon, maxLat, ...rest] = rootRegion;
// use the size of the region as geometric error
const geometricError = distance(minLat, minLon, maxLat, maxLon);
let tileset = {
  asset: {
    version: "1.0",
    tilesetVersion: "0.2"
  },
  geometricError,
  root: newNode(rootRegion, [json.shift()], geometricError, {
    refine: "ADD",
    children: []
  }),
  extras: {
    metaData: []
  }
};

splitAndInsert(json, tileset.root);

writeJson(tileset, destination, true);

////////////////////////////////
// functions

function writeJson(json, destination, pretty) {
  if (pretty) {
    fs.writeFileSync(destination, JSON.stringify(json, undefined, 2), "utf8");
  } else {
    fs.writeFileSync(destination, JSON.stringify(json), "utf8");
  }
}

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

function degreesToRadianPosition({ longitude, latitude, height }) {
  return {
    longitude: Math.radians(longitude),
    latitude: Math.radians(latitude),
    height
  };
}

function calculateRegion(metaDataArray) {
  const cartographics = metaDataArray.map(meta =>
    degreesToRadianPosition(meta.position)
  );

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

// returns the distance between points on earth via the Haversine formula
// adapted from here: https://stackoverflow.com/a/27943/6597519
// coordinates in radians
function distance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Radius of the earth in m
  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in m
}

function splitAndInsert(
  array,
  parent,
  {
    branchingFactor = BRANCHING_FACTOR,
    leafSize = LEAF_SIZE
  } = {}
) {
  const maxLeafSize = branchingFactor * leafSize - 1;
  console.assert(array.length > 0, "cannot work with empty array");
  const region = calculateRegion(array);
  if (array.length <= maxLeafSize) {
    parent.children.push(newNode(region, array));
  } else {
    const [minLon, minLat, maxLon, maxLat, ...rest] = region;
    // use the size of the region as geometric error
    const geometricError = Math.min(
      parent.geometricError,
      distance(minLat, minLon, maxLat, maxLon)
    );
    const node = newNode(region, [array.shift()], geometricError, {
      children: []
    });
    parent.children.push(node);
    for (let i = 0; i < branchingFactor - 1; i++) {
      console.assert(array.length > 0, "cannot splice empty array");
      const size = Math.max(
        leafSize,
        Math.floor(array.length / branchingFactor)
      );
      const slice = array.splice(0, size);
      splitAndInsert(slice, node);
    }
    // this should always be true, but better safe than sorry
    if (array.length > 0) {
      splitAndInsert(array, node);
    }
  }
}
