"use strict";

const fs = require("fs");
const proj4 = require("../node_modules/proj4/dist/proj4.js");
proj4.defs(
  "EPSG:2177",
  "+proj=tmerc +lat_0=0 +lon_0=18 +k=0.999923 +x_0=6500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs"
);
const DEFAULT_UTM_ZONE = 32; // Steinweg utm zone

////////////////////////////////
// script
const args = process.argv.slice(2);
console.assert(args.length === 2, "provide exactly 2 arguments");
const [source, destination] = args;

const json = JSON.parse(fs.readFileSync(source, "utf8"));

const output = convertMetaData(json);

writeJson(output, destination, true);

////////////////////////////////
// functions

function writeJson(json, destination, pretty) {
  if (pretty) {
    fs.writeFileSync(destination, JSON.stringify(json, undefined, 2), "utf8");
  } else {
    fs.writeFileSync(destination, JSON.stringify(json), "utf8");
  }
}

function parseIndex(imageName) {
  const [name] = imageName.split(".jpg");
  const parts = name.split("_");
  return Number(parts[parts.length - 1]);
}

function utmToCartographic(
  { east, north, altitude },
  utmZone = DEFAULT_UTM_ZONE
) {
  const utmProj = `+proj=utm +zone=${utmZone}`;
  const [longitude, latitude] = proj4(utmProj, "WGS84", [east, north]);
  return {
    longitude,
    latitude,
    height: altitude
  };
}

function epsg2177ToCartographic({ east, north, altitude }) {
  const [longitude, latitude] = proj4("EPSG:2177", "WGS84", [east, north]);
  return {
    longitude,
    latitude,
    height: altitude
  };
}

function convertWroclawMetaData(meta) {
  const fileName = meta.file_name;
  const index = parseIndex(fileName);

  const { east, north, altitude } = meta;
  const position = epsg2177ToCartographic({ east, north, altitude });

  const heading = meta["attitude(z)=pan"];
  const pitch = meta["attitude(y)=pitch"];
  const roll = meta["attitude(x)=roll"];
  const orientation = {
    heading,
    pitch,
    roll: 180 - roll
  };

  return {
    index,

    // longitude and latitude in degrees (with decimals)
    position,
    // angles in degrees (with decimals)
    orientation,

    fileName,

    _original: meta
  };
}

function convertSteinwegMetaData(meta) {
  const fileName = meta.ImageName;
  const index = parseIndex(fileName);

  const position = utmToCartographic({
    east: meta["X-Sensor"],
    north: meta["Y-Sensor"],
    altitude: meta["Z-Sensor"]
  });

  const orientation = {
    heading: meta["H-Sensor"],
    pitch: meta["P-Sensor"],
    roll: meta["R-Sensor"]
  };

  return {
    index,

    // longitude and latitude in degrees (with decimals)
    position,
    // angles in degrees (with decimals)
    orientation,

    fileName,

    _original: meta
  };
}

function convertMetaData(data) {
  return data.map(meta => {
    // TODO: find better way to determine meta data format
    if (meta.file_name) {
      // wroclaw
      return convertWroclawMetaData(meta);
    } else if (meta.ImageName) {
      // emscher, steinweg, langenbeck
      return convertSteinwegMetaData(meta);
    } else {
      console.assert(
        false,
        "Meta data format not supported. Only 'Wroclaw' and 'Steinweg' formats supported."
      );
    }
  });
}
