#!/bin/bash
set -ex

# convert from panorama json meta data to custom tileset.json meta data

IMAGEPATH=$1
CSV=$2

scripts/csvToJson.sh "$IMAGEPATH" "$CSV"
node scripts/externalToInternalJson.js "${IMAGEPATH}/meta.json" "${IMAGEPATH}/processedMeta.json"
node scripts/jsonToTileset.js "${IMAGEPATH}/processedMeta.json" "${IMAGEPATH}/tileset.json"
