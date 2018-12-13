#!/bin/bash
set -ex

# convert from Wroclaw panorama meta data in csv to json

IMAGEPATH=$1
CSV=$2

csvtojson "${IMAGEPATH}/$CSV" \
  --delimiter=auto \
  --colParser='{"file_name":"string","file_type":"string","sequence_id":"number","timestamp":"number","GPS_time(s)":"number","east":"number","north":"number","altitude":"number","attitude(x)=roll":"number","attitude(y)=pitch":"number","attitude(z)=pan":"number","frame_id":"number"}' \
  > "${IMAGEPATH}/meta.json"
