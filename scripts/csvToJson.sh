#!/bin/bash
set -ex

# convert from panorama meta data in csv to json

IMAGEPATH=$1
CSV=$2

csvtojson "${IMAGEPATH}/$CSV" \
  --delimiter=auto \
  --colParser='{"ImageName":"string","X-Ori":"number","Y-Ori":"number","Z-Ori":"number","H-Veh":"number","R-Veh":"number","P-Veh":"number","X-Sensor":"number","Y-Sensor":"number","Z-Sensor":"number","H-Sensor":"number","R-Sensor":"number","P-Sensor":"number","Dist":"number","ltx":"number","lty":"number","ltz":"number","rtx":"number","rty":"number","rtz":"number","lbx":"number","lby":"number","lbz":"number","rbx":"number","rby":"number","rbz":"number","file_name":"string","file_type":"string","sequence_id":"number","timestamp":"number","GPS_time(s)":"number","east":"number","north":"number","altitude":"number","attitude(x)=roll":"number","attitude(y)=pitch":"number","attitude(z)=pan":"number","frame_id":"number"}' \
  > "${IMAGEPATH}/meta.json"
