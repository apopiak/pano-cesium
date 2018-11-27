// Camera
Cesium.Camera.prototype.headingPitchRoll = function(result) {
  if (!Cesium.defined(result)) {
    result = new Cesium.HeadingPitchRoll();
  }
  result.heading = this.heading;
  result.pitch = this.pitch;
  result.roll = this.roll;
  return result;
};

// Cartesian3
Cesium.Cartesian3.prototype.add = function(other, result) {
  if (!Cesium.defined(result)) {
    result = new Cesium.Cartesian3();
  }
  return Cesium.Cartesian3.add(this, other, result);
};

Cesium.Cartesian3.prototype.multiplyByScalar = function(scalar) {
  return Cesium.Cartesian3.multiplyByScalar(this, scalar, this);
}

Cesium.Cartesian3.prototype.subtract = function(other, result) {
  if (!Cesium.defined(result)) {
    result = new Cesium.Cartesian3();
  }
  return Cesium.Cartesian3.subtract(this, other, result);
}

// HeadingPitchRoll
Cesium.HeadingPitchRoll.add = function(left, right, result) {
  if (!Cesium.defined(result)) {
    result = new Cesium.HeadingPitchRoll();
  }
  result.heading = left.heading + right.heading;
  result.pitch = left.pitch + right.pitch;
  result.roll = left.roll + right.roll;
  return result;
};

// Matrix3
Cesium.Matrix3.prototype.multiplyByVector = function(vector, result) {
  if (!Cesium.defined(result)) {
    result = new Cesium.Cartesian3();
  }
  return Cesium.Matrix3.multiplyByVector(this, vector, result);
}
