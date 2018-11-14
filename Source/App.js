// globals
let G = {};

(function() {
  "use strict";

  ////////////////////////////
  // Panorama Rendering
  ////////////////////////////

  const degToRad = deg => (deg * Math.PI) / 180.0;
  const mat4FromQuaternion = quaternion =>
    Cesium.Matrix4.fromRotationTranslation(
      Cesium.Matrix3.fromQuaternion(quaternion, new Cesium.Matrix3()),
      Cesium.Cartesian3.ZERO,
      new Cesium.Matrix4()
    );

  // add a panorama rendering in post processing
  function addOrUpdatePostProcessing(idx) {
    const index = idx || 0;
    const meta = G.metaData[index];

    const destination = meta.cartesianPos;
    const orientation = meta.cameraOrientation;
    const duration = 0.5; // seconds

    const scene = G.viewer.scene;
    const camera = scene.camera;
    const canvas = scene.canvas;
    const stages = scene.postProcessStages;

    const addStage = (fragmentShader, imagePath) => {
      const computeCameraRotation = () => {
        let cameraQuaternion = Cesium.Quaternion.fromAxisAngle(
          Cesium.Cartesian3.UNIT_Y,
          -meta.cameraOrientation.heading + G.rotationOffset.heading
        );
        const pitchQuaternion = Cesium.Quaternion.fromAxisAngle(
          Cesium.Cartesian3.UNIT_Z,
          meta.cameraOrientation.pitch + G.rotationOffset.pitch
        );
        const rollQuaternion = Cesium.Quaternion.fromAxisAngle(
          Cesium.Cartesian3.UNIT_X,
          -meta.cameraOrientation.roll + G.rotationOffset.roll
        );
        Cesium.Quaternion.multiply(
          cameraQuaternion,
          rollQuaternion,
          cameraQuaternion
        );
        Cesium.Quaternion.multiply(
          cameraQuaternion,
          pitchQuaternion,
          cameraQuaternion
        );
        const cameraRotation = mat4FromQuaternion(cameraQuaternion);
        return cameraRotation;
      };

      const uniforms = {
        u_panorama: imagePath,

        u_cameraRotation: () => computeCameraRotation(),
        u_inverseCameraTranform: () =>
          Cesium.Matrix4.inverse(
            Cesium.Transforms.eastNorthUpToFixedFrame(
              camera.positionWC,
              Cesium.Ellipsoid.WGS84,
              new Cesium.Matrix4()
            ),
            new Cesium.Matrix4()
          ),

        u_interpolation: () => G.interpolation
      };

      G.postProcessStage = stages.add(
        new Cesium.PostProcessStage({
          fragmentShader,
          uniforms
        })
      );
    };

    const transitionToPanorama = (shader, imagePath) => {
      G.currentPanoramaImage = imagePath;
      camera.flyTo({ destination, orientation, duration });
      stages.removeAll();
      addStage(shader, imagePath);
    };

    // use existing shader, if present
    if (Cesium.defined(G.postProcessStage)) {
      transitionToPanorama(G.postProcessStage.fragmentShader, meta.imagePath);
      return;
    }

    fetch("data/projectionShader.fs.glsl")
      .then(res => res.text())
      .then(shader => transitionToPanorama(shader, meta.imagePath))
      .catch(err => console.error(err));
  }

  function addPanoramaSphere(idx) {
    const index = idx || 0;
    const meta = G.metaData[index];
    const camera = G.viewer.scene.camera;

    G.currentPanoramaImage = meta.imagePath;

    const position = meta.cartesianPos;

    // TODO: check for end of array
    const nextPos = G.metaData[index + 1].cartesianPos;
    // const direction = Cesium.Cartesian3.subtract(
    //   nextPos,
    //   position,
    //   new Cesium.Cartesian3()
    // );
    // const spherical = Cesium.Spherical.fromCartesian3(direction);
    // const hpr = new Cesium.HeadingPitchRoll(spherical.cone, spherical.clock, 0);
    // const orientation = Cesium.Transforms.headingPitchRollQuaternion(
    //   position,
    //   hpr
    // );
    const orientation = Cesium.Quaternion.fromHeadingPitchRoll(
      new Cesium.HeadingPitchRoll()
    );

    const size = 50;
    // remove old sphere
    if (Cesium.defined(G.panoramaSphere)) {
      G.viewer.entities.remove(G.panoramaSphere);
      G.panoramaSphere = undefined;
    }
    G.panoramaSphere = G.viewer.entities.add({
      name: meta.image,
      position,
      orientation,
      ellipsoid: {
        radii: { x: size, y: size, z: size },
        material: new Cesium.ImageMaterialProperty({
          image: meta.imagePath,
          color: new Cesium.Color(1, 1, 1, 0.99)
        })
      },
      properties: {
        index
      }
    });

    camera.flyTo({
      destination: position,
      orientation: meta.cameraOrientation,
      duration: 0.5
    });
    return;
  }

  function addImageRectangle(idx) {
    const index = idx || 0;
    const meta = G.metaData[index];
    const camera = G.viewer.scene.camera;

    const destination = meta.cartesianPos;
    const orientation = meta.cameraOrientation;
    const duration = 0.5; // seconds

    camera.flyTo({ destination, orientation, duration });

    const rect = meta.rectangle;

    const bottomCenter = Cesium.Cartesian3.midpoint(
      rect.bottomLeft,
      rect.bottomRight,
      new Cesium.Cartesian3()
    );
    const topCenter = Cesium.Cartesian3.midpoint(
      rect.topLeft,
      rect.topRight,
      new Cesium.Cartesian3()
    );
    const center = Cesium.Cartesian3.midpoint(
      topCenter,
      bottomCenter,
      new Cesium.Cartesian3()
    );

    const v1 = Cesium.Cartesian3.subtract(
      rect.bottomLeft,
      rect.bottomRight,
      new Cesium.Cartesian3()
    );
    const v2 = Cesium.Cartesian3.subtract(
      rect.bottomLeft,
      rect.topLeft,
      new Cesium.Cartesian3()
    );

    let scratch = new Cesium.Cartesian3();
    const normal = Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.cross(v1, v2, scratch),
      scratch
    );

    let panoramaPlane = G.viewer.entities.add({
      name: "Panorama plane",
      position: center,
      plane: {
        plane: new Cesium.Plane(normal, 0.0),
        dimensions: new Cesium.Cartesian2(
          Cesium.Cartesian3.magnitude(v1),
          Cesium.Cartesian3.magnitude(v2)
        ),
        material: Cesium.Color.BLUE
      }
    });
  }

  ///////////////////////
  // Data Processing
  ///////////////////////
  function utmToCartographic(position, utmZone) {
    const steinwegUTMzone = 32;
    utmZone = utmZone || steinwegUTMzone;

    const utm = new UTMConv.UTMCoords(steinwegUTMzone, position.x, position.y);
    const degrees = utm.to_deg("wgs84");
    const height = position.z;
    return Cesium.Cartographic.fromDegrees(degrees.lngd, degrees.latd, height);
  }

  function utmToCartesian(x, y, z) {
    return Cesium.Cartographic.toCartesian(utmToCartographic({ x, y, z }));
  }

  function origToCartographic(meta) {
    return utmToCartographic({
      x: meta["X-Sensor"],
      y: meta["Y-Sensor"],
      z: meta["Z-Sensor"]
    });
  }

  function headingPitchRoll(meta, suffix) {
    return Cesium.HeadingPitchRoll.fromDegrees(
      meta["H-" + suffix],
      meta["P-" + suffix],
      meta["R-" + suffix]
    );
  }

  function processData(originalJson) {
    return _.map(originalJson, (meta, index) => {
      const cartographicPos = origToCartographic(meta);
      const cartesianPos = Cesium.Cartographic.toCartesian(cartographicPos);

      return {
        index,

        // positioning
        cartographicPos,
        cartesianPos,
        cameraOrientation: headingPitchRoll(meta, "Sensor"),
        vehicleOrientation: headingPitchRoll(meta, "Veh"),

        image: meta.ImageName,
        imagePath: "images/" + meta.ImageName,

        rectangle: {
          bottomLeft: utmToCartesian(meta.lbx, meta.lby, meta.lbz),
          topLeft: utmToCartesian(meta.ltx, meta.lty, meta.ltz),
          topRight: utmToCartesian(meta.rtx, meta.rty, meta.rtz),
          bottomRight: utmToCartesian(meta.rbx, meta.rby, meta.rbz)
        },

        orig: meta
      };
    });
  }

  ///////////////////////
  // Interaction Setup
  ///////////////////////
  function look(which) {
    const camera = G.viewer.scene.camera;
    const rotation = Cesium.Math.toRadians(4.5); // degrees

    if (which === 39) {
      // right arrow
      const worldUp = Cesium.Matrix4.multiplyByPoint(
        camera.inverseTransform,
        camera.positionWC,
        new Cesium.Cartesian3()
      );
      camera.look(worldUp, rotation);
    } else if (which === 37) {
      // left arrow
      const worldUp = Cesium.Matrix4.multiplyByPoint(
        camera.inverseTransform,
        camera.positionWC,
        new Cesium.Cartesian3()
      );
      camera.look(worldUp, -rotation);
    } else if (which === 38) {
      // up arrow
      camera.lookUp(rotation);
    } else if (which === 40) {
      // down arrow
      camera.lookDown(rotation);
    }
  }

  function move(code) {
    const camera = G.viewer.scene.camera;
    const defaultSpeed = 0.12; // meters

    // https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code
    if (code === "KeyA") {
      camera.moveLeft(defaultSpeed);
    } else if (code === "KeyD") {
      camera.moveRight(defaultSpeed);
    } else if (code === "KeyW") {
      camera.moveForward(defaultSpeed);
    } else if (code === "KeyS") {
      camera.moveBackward(defaultSpeed);
    } else if (code === "KeyQ") {
      camera.moveUp(defaultSpeed);
    } else if (code === "KeyE") {
      camera.moveDown(defaultSpeed);
    }
  }

  function rotateOffset(code) {
    const defaultAmount = 0.002;

    if (code === "KeyJ") {
      G.rotationOffset.heading -= defaultAmount;
    } else if (code === "KeyL") {
      G.rotationOffset.heading += defaultAmount;
    } else if (code === "KeyI") {
      G.rotationOffset.pitch -= defaultAmount;
    } else if (code === "KeyK") {
      G.rotationOffset.pitch += defaultAmount;
    } else if (code === "KeyU") {
      G.rotationOffset.roll += defaultAmount;
    } else if (code === "KeyO") {
      G.rotationOffset.roll -= defaultAmount;
    }
  }

  function keyDownListener(event) {
    // https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/which
    // [37;40] == arrow keys
    if (event.which <= 40 && event.which >= 37) {
      look(event.which);
    }
    move(event.code);
    rotateOffset(event.code);
  }

  document.addEventListener("keydown", keyDownListener, false);

  ///////////////////////
  // Globals
  ///////////////////////
  G = {
    // viewers
    viewer: undefined,

    // meta data for the panoramas
    metaData: processData(steinwegMetaJson),

    radarLocations: undefined,

    rotationOffset: new Cesium.HeadingPitchRoll(),

    // cesium 3D tileset
    tileset: undefined,

    // for selecting panoramas
    lastPicked: undefined,
    currentPanoramaImage: undefined,

    // post-processing stage
    postProcessStage: undefined,
    // [-1, 1] how much to prioritize the pointcloud (-1) or panorama (1) when interpolating
    interpolation: 0.2,

    fn: {
      addOrUpdatePostProcessing,
      addPanoramaSphere,
      addImageRectangle
    }
  };

  // Cesium Ion
  Cesium.Ion.defaultAccessToken =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIzZmEzMjQwMi00MjQ0LTRmZjgtODhlOS0zNDI5ZmU3NGRkODQiLCJpZCI6MTQ5MywiaWF0IjoxNTI4NzE4Mzg0fQ.4h4xuSeZTaiBGtv4sHA7WN6D1eIedRHw-6rFls9QMsQ";

  //////////////////////////////////////////////////////////////////////////
  // Creating the Viewer
  //////////////////////////////////////////////////////////////////////////

  G.viewer = new Cesium.Viewer("cesiumContainer", {
    scene3DOnly: true,
    selectionIndicator: false,
    baseLayerPicker: false
  });

  // setup scene
  const scene = G.viewer.scene;
  scene.globe.show = false;
  // G.viewer.scene.debugShowFrustumPlanes = true; // show frustums

  //////////////////////////////////////////////////////////////////////////
  // Loading Imagery
  //////////////////////////////////////////////////////////////////////////

  // Remove default base layer
  G.viewer.imageryLayers.remove(G.viewer.imageryLayers.get(0));

  // Add Sentinel-2 imagery
  // viewer.imageryLayers.addImageryProvider(new Cesium.IonImageryProvider({ assetId: 3954 }));

  // Add Bing Maps
  // G.viewer.imageryLayers.addImageryProvider(
  //   new Cesium.IonImageryProvider({ assetId: 4 })
  // );

  //////////////////////////////////////////////////////////////////////////
  // Loading Terrain
  //////////////////////////////////////////////////////////////////////////

  // Load Cesium World Terrain
  // G.viewer.terrainProvider = Cesium.createWorldTerrain({
  //   requestWaterMask: true, // required for water effects
  //   requestVertexNormals: true // required for terrain lighting
  // });
  // Enable depth testing so things behind the terrain disappear.
  // G.viewer.scene.globe.depthTestAgainstTerrain = true;

  //////////////////////////////////////////////////////////////////////////
  // Configuring the Scene
  //////////////////////////////////////////////////////////////////////////

  // Enable lighting based on sun/moon positions
  G.viewer.scene.globe.enableLighting = true;

  // Set the initial view
  const birdsEye = new Cesium.Cartesian3(3961538.873, 482335.1824, 4958890.174);
  const startOfStreetView = {
    destination: { x: 3961452.238, y: 482230.0739, z: 4958837.392 },
    orientation: {
      direction: { x: 0.107284457, y: 0.92035867, z: -0.376071 },
      up: { x: 0.6698224, y: 0.212619, z: 0.711428 }
    }
  };
  const homeCameraView = {
    destination: {
      x: 3961467.55,
      y: 482298.086,
      z: 4958811.655
    },
    orientation: {
      direction: {
        x: 0.0286422,
        y: 0.9168583,
        z: -0.398183
      },
      up: {
        x: 0.6449769,
        y: 0.2873771,
        z: 0.7081095
      }
    }
  };
  const furtherDownTheStreetView = {
    destination: {
      x: 3961456.72,
      y: 482483.041,
      z: 4958797.78
    },
    orientation: {
      direction: {
        x: 0.4530828,
        y: 0.2137075,
        z: -0.8654738
      },
      up: {
        x: 0.864637,
        y: 0.1310491,
        z: 0.485004
      }
    }
  };
  G.viewer.scene.camera.flyTo({ duration: 0, ...startOfStreetView });

  // Override the default home button
  G.viewer.homeButton.viewModel.command.beforeExecute.addEventListener(e => {
    e.cancel = true;
    G.viewer.scene.camera.flyTo({ duration: 0.5, ...startOfStreetView });
  });

  let tileset = G.viewer.scene.primitives.add(
    new Cesium.Cesium3DTileset({
      url: "http://localhost:8080/data/pointcloud/tileset.json",
      skipLevelOfDetail: true,
      baseScreenSpaceError: 1024,
      skipScreenSpaceErrorFactor: 16,
      skipLevels: 1
    })
  );

  // let tileset = G.viewer.scene.primitives.add(
  //   new Cesium.Cesium3DTileset({
  //     url: "http://localhost:8080/data/pointcloud_langenbeck/tileset.json",
  //     skipLevelOfDetail: true,
  //     baseScreenSpaceError: 1024,
  //     skipScreenSpaceErrorFactor: 16,
  //     skipLevels: 1
  //   })
  // );
  G.tileset = tileset;

  // tileset.readyPromise.then(tileset => {
  //   G.viewer.scene.camera.flyToBoundingSphere(tileset.boundingSphere);
  // });

  // TODO: how to keep default shading and add color?
  // tileset.pointCloudShading.maximumAttenuation = 4.0; // Don't allow points larger than 8 pixels.
  // tileset.pointCloudShading.baseResolution = 0.1; // Assume an original capture resolution of 5 centimeters between neighboring points.
  // tileset.pointCloudShading.geometricErrorScale = 1.0; // Applies to both geometric error and the base resolution.
  // tileset.pointCloudShading.attenuation = true;
  // tileset.pointCloudShading.eyeDomeLighting = true;
  //
  // tileset.style = new Cesium.Cesium3DTileStyle({
  //   color: 'color("red")'
  // });

  // G.tileset.style.color.evaluateColor = (frameState, feature, result) => {
  //   if (Cesium.defined(feature)) {
  //     console.log(feature);
  //     return Cesium.Color.clone(Cesium.Color.WHITE, result);
  //   }
  // };

  // place spheres representing the panorama pictures
  G.metaData.forEach(m => {
    G.viewer.entities.add({
      name: m.image,
      position: m.cartesianPos,
      ellipsoid: {
        radii: { x: 1, y: 1, z: 1 },
        material: Cesium.Color.DARKGREEN
      },
      properties: {
        index: m.index
      }
    });
  });

  fetch("data/radar_gps_steinweg_filtered.json")
    .then(res => res.json())
    .then(radarData => {
      // DZG files have the most inconvenient latitude longitude format ever :-/
      // see here: https://www.manualslib.com/manual/1265713/Gssi-Sir-4000.html?page=126#manual
      const stringToDegrees = (string, degLength, negative) => {
        const deg = Number(string.slice(0, degLength));
        const min = Number(string.slice(degLength));
        const sign = negative ? -1 : 1;
        return sign * (deg + min / 60.0);
      };

      G.radarLocations = radarData.map(datum => {
        console.assert(datum["E or W"] === "E" || datum["E or W"] === "W", {
          "E or W": datum["E or W"],
          errorMsg: "must be E(ast) or W(est)"
        });
        console.assert(datum["N or S"] === "N" || datum["N or S"] === "S", {
          "N or S": datum["N or S"],
          errorMsg: "must be N(orth) or S(outh)"
        });
        let lon = stringToDegrees(
          datum["Longitude"],
          3,
          datum["E or W"] === "W"
        ); // example: { ... "Longitude":"00656.67239","E or W":"E" ... }
        let lat = stringToDegrees(
          datum["Latitude"],
          2,
          datum["N or S"] === "S"
        ); // example: { ... "Latitude":"5121.66311","N or S":"N" ... }
        const height = Number(datum["Antenna altitude"]);
        return Cesium.Cartographic.toCartesian(
          Cesium.Cartographic.fromDegrees(lon, lat, height)
        );
      });

      _.sample(G.radarLocations, G.radarLocations.length / 15).forEach(
        location => {
          G.viewer.entities.add({
            name: "radar datum",
            position: location,
            ellipsoid: {
              radii: { x: 0.1, y: 0.1, z: 0.1 },
              material: Cesium.Color.ORANGE
            }
          });
        }
      );
    })
    .catch(err => console.error(err));

  let handler = new Cesium.ScreenSpaceEventHandler(G.viewer.scene.canvas);
  handler.setInputAction(e => {
    let pickedPrimitive = G.viewer.scene.pick(e.position);
    let pickedEntity = Cesium.defined(pickedPrimitive)
      ? pickedPrimitive.id
      : undefined;

    if (Cesium.defined(G.lastPicked)) {
      G.lastPicked.show = true;
    }
    if (
      Cesium.defined(pickedEntity) &&
      Cesium.defined(pickedEntity.properties.index)
    ) {
      const index = pickedEntity.properties.index.getValue();
      const meta = G.metaData[index];
      console.log("picked image: ", meta.image);

      addOrUpdatePostProcessing(index);

      // hide next spheres
      const hide = entity => {
        if (Cesium.defined(entity)) {
          entity.show = false;
        }
      };
      hide(pickedEntity);
      hide(G.viewer.entities.values[index + 1]);
      hide(G.viewer.entities.values[index + 2]);
      G.lastPicked = pickedEntity;
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
})();
