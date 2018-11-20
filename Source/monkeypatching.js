Cesium.Camera.prototype.headingPitchRoll = function(result) {
  if (!Cesium.defined(result)) {
    result = new Cesium.HeadingPitchRoll();
  }
  result.heading = this.heading;
  result.pitch = this.pitch;
  result.roll = this.roll;
  return result;
};

Cesium.HeadingPitchRoll.add = function(left, right, result) {
  if (!Cesium.defined(result)) {
    result = new Cesium.HeadingPitchRoll();
  }
  result.heading = left.heading + right.heading;
  result.pitch = left.pitch + right.pitch;
  result.roll = left.roll + right.roll;
  return result;
};
