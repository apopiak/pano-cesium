#!/bin/bash
set -ex

# convert from panorama json meta data to custom tileset.json meta data

IMAGEPATH=$1

node scripts/externaltointernaljson.js "${IMAGEPATH}/meta.json" "${IMAGEPATH}/processedMeta.json"
node scripts/jsontotileset.js "${IMAGEPATH}/processedMeta.json" "${IMAGEPATH}/tileset.json"
