#!/bin/bash
set -e

sed "1~2d" "$1" > radar_gps.csv
sed -i "1iSentence Identifier,Time of Position,Latitude,N or S,Longitude,E or W,Fix Quality,Number of Satellites,Horizontal Dilution of Position(HDOP),Antenna altitude,M,Geoidal separation,M,Age in seconds,Differential reference station and checksum" radar_gps.csv
xsv select 2-6,10 radar_gps.csv -o radar_gps_filtered.csv
csvtojson radar_gps_filtered.csv > radar_gps.json
