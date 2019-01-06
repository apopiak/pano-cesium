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

const DEFAULT_UTM_ZONE = 32; // Steinweg utm zone
function utmToCartographic(
  { east, north, altitude },
  utmZone = DEFAULT_UTM_ZONE
) {
  const utmProj = `+proj=utm +zone=${utmZone}`;
  const [longitude, latitude] = proj4(utmProj, "WGS84", [east, north]);
  return {
    longitude: Math.radians(longitude),
    latitude: Math.radians(latitude),
    height: altitude
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
  const cartographics = metaDataArray.map(meta => {
    // TODO: find better way to determine meta data format
    if (meta.file_name) {
      // wroclaw
      const { east, north, altitude } = meta;
      return epsg2177ToCartographic({ east, north, altitude });
    } else if (meta.ImageName) {
      // emscher, steinweg, langenbeck
      return utmToCartographic({
        east: meta["X-Sensor"],
        north: meta["Y-Sensor"],
        altitude: meta["Z-Sensor"]
      });
    } else {
      console.assert(
        false,
        "Meta data format not supported. Only 'Wroclaw' and 'Steinweg' formats supported."
      );
    }
  });

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
  root: newNode(wholeRegion, [json.shift()], 80, {
    refine: "ADD",
    children: []
  }),
  extras: {
    metaData: []
  }
};

console.log(JSON.stringify(tileset, undefined, 2));

const BRANCHING_FACTOR = 4;
const LEAF_SIZE = 5;
const MAX_LEAF_SIZE = BRANCHING_FACTOR * LEAF_SIZE - 1;

function splitAndInsert(array, parent) {
  console.assert(array.length > 0, "cannot work with empty array");
  const region = calculateRegion(array);
  if (array.length <= MAX_LEAF_SIZE) {
    parent.children.push(newNode(region, array));
  } else {
    // TODO: make the geometric error calculation more sophisticated
    const geometricError = Math.max(0, parent.geometricError - 10);
    const node = newNode(region, [array.shift()], geometricError, {
      children: []
    });
    parent.children.push(node);
    for (let i = 0; i < BRANCHING_FACTOR - 1; i++) {
      console.assert(array.length > 0, "cannot splice empty array");
      const size = Math.max(LEAF_SIZE, Math.floor(array.length / BRANCHING_FACTOR));
      const slice = array.splice(0, size);
      splitAndInsert(slice, node);
    }
    // this should always be true, but better safe than sorry
    if (array.length > 0) {
      splitAndInsert(array, node);
    }
  }
}

splitAndInsert(json, tileset.root);

fs.writeFileSync(destination, JSON.stringify(tileset, undefined, 2), "utf8");
