// synonym for look
Cesium.Camera.prototype.rotateView = function(rotation) {
  let { heading, pitch, roll } = rotation;
  heading = this.heading + (heading || 0);
  pitch = this.pitch + (pitch || 0);
  roll = this.roll + (roll || 0);
  const destination = this.position;
  this.setView({
    destination,
    orientation: {
      heading,
      pitch,
      roll
    }
  });
};
