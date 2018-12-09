let globals = {};
(function() {
  "use strict";

  const {
    Cartesian3,
    Cartographic,
    Cesium3DTileset,
    Cesium3DTileStyle,
    Color,
    ColorMaterialProperty,
    ConstantProperty,
    defined,
    Ellipsoid,
    HeadingPitchRoll,
    Ion,
    Matrix3,
    Matrix4,
    PolylineCollection,
    PostProcessStage,
    Quaternion,
    ScreenSpaceEventHandler,
    ScreenSpaceEventType,
    Transforms,
    Viewer
  } = Cesium;

  ////////////////////////////
  // Constants
  ////////////////////////////
  const host = "http://localhost:8080/";
  const streetBasePath = "data/streets/";

  ////////////////////////////
  // Utility Functions
  ////////////////////////////

  const mat4FromQuaternion = quaternion =>
    Matrix4.fromRotationTranslation(
      Matrix3.fromQuaternion(quaternion),
      Cartesian3.ZERO,
      new Matrix4()
    );
  function addC3(left, right) {
    return Cartesian3.add(left, right, new Cartesian3());
  }
  function subC3(left, right) {
    return Cartesian3.subtract(left, right, new Cartesian3());
  }
  function addHPR(left, right) {
    let result = new HeadingPitchRoll();
    result.heading = left.heading + right.heading;
    result.pitch = left.pitch + right.pitch;
    result.roll = left.roll + right.roll;
    return result;
  }

  ////////////////////////////
  // Panorama Rendering
  ////////////////////////////

  // add a panorama rendering in post processing
  function addOrUpdatePostProcessing(streetName = "steinweg", index = 0) {
    const meta = globals.streets[streetName].metaData[index];

    const destination = meta.cartesianPos;
    const orientation = meta.cameraOrientation;
    const duration = 0.5; // seconds

    const scene = globals.scene;
    const camera = scene.camera;
    const stages = scene.postProcessStages;

    const addStage = (fragmentShader, imagePath) => {
      const computeCameraRotation = () => {
        let cameraQuaternion = Quaternion.fromAxisAngle(
          Cartesian3.UNIT_Y,
          meta.cameraOrientation.heading + globals.rotationOffset.heading
        );
        const pitchQuaternion = Quaternion.fromAxisAngle(
          Cartesian3.UNIT_Z,
          meta.cameraOrientation.pitch + globals.rotationOffset.pitch
        );
        const rollQuaternion = Quaternion.fromAxisAngle(
          Cartesian3.UNIT_X,
          meta.cameraOrientation.roll + globals.rotationOffset.roll
        );
        Quaternion.multiply(cameraQuaternion, rollQuaternion, cameraQuaternion);
        Quaternion.multiply(
          cameraQuaternion,
          pitchQuaternion,
          cameraQuaternion
        );
        return Matrix4.inverse(
          mat4FromQuaternion(cameraQuaternion),
          new Matrix4()
        );
      };

      const computeVehicleRotation = () => {
        let vehicleQuaternion = Quaternion.fromAxisAngle(
          Cartesian3.UNIT_Y,
          meta.vehicleOrientation.heading
        );
        return Matrix4.inverse(
          mat4FromQuaternion(vehicleQuaternion),
          new Matrix4()
        );
      };

      const uniforms = {
        u_panorama: imagePath,

        u_cameraRotation: () => computeCameraRotation(),
        u_vehicleRotation: () => computeVehicleRotation(),
        u_inverseCameraTransform: () =>
          Matrix4.inverse(
            Transforms.eastNorthUpToFixedFrame(
              camera.positionWC,
              Ellipsoid.WGS84,
              new Matrix4()
            ),
            new Matrix4()
          ),

        u_interpolation: () => globals.interpolation
      };

      globals.postProcessStage = stages.add(
        new PostProcessStage({
          fragmentShader,
          uniforms
        })
      );
    };

    const transitionToPanorama = (shader, imagePath) => {
      globals.currentPanoramaImage = imagePath;
      // camera.flyTo({ destination, orientation, duration });
      stages.removeAll();
      addStage(shader, imagePath);
    };

    // use existing shader, if present
    if (defined(globals.postProcessStage)) {
      transitionToPanorama(
        globals.postProcessStage.fragmentShader,
        meta.imagePath
      );
      return;
    }

    fetch("data/projectionShader.fs.glsl")
      .then(res => res.text())
      .then(shader => transitionToPanorama(shader, meta.imagePath))
      .catch(err => console.error(err));
  }

  ///////////////////////
  // Data Processing
  ///////////////////////
  const defaultUTMzone = 32; // steinweg utm zone
  function utmToCartographic(position, utmZone = defaultUTMzone) {
    const utm = new UTMConv.UTMCoords(utmZone, position.x, position.y);
    const degrees = utm.to_deg("wgs84");
    const height = position.z;
    return Cartographic.fromDegrees(degrees.lngd, degrees.latd, height);
  }

  function utmToCartesian(x, y, z) {
    return Cartographic.toCartesian(utmToCartographic({ x, y, z }));
  }

  function origToCartographic(meta) {
    return utmToCartographic({
      x: meta["X-Sensor"],
      y: meta["Y-Sensor"],
      z: meta["Z-Sensor"]
    });
  }

  function headingPitchRoll(meta, suffix) {
    return HeadingPitchRoll.fromDegrees(
      meta["H-" + suffix],
      meta["P-" + suffix],
      meta["R-" + suffix]
    );
  }

  function processMetaData(originalJson, street) {
    return _.map(originalJson, (meta, index) => {
      const cartographicPos = origToCartographic(meta);
      const cartesianPos = Cartographic.toCartesian(cartographicPos);

      return {
        index,

        // positioning
        cartographicPos,
        cartesianPos,
        cameraOrientation: headingPitchRoll(meta, "Sensor"),
        vehicleOrientation: headingPitchRoll(meta, "Veh"),

        image: meta.ImageName,
        imagePath: street.panoramaDirPath + meta.ImageName,

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

  // DZG files have the most inconvenient latitude longitude format ever :-/
  // see here: https://www.manualslib.com/manual/1265713/Gssi-Sir-4000.html?page=126#manual
  function stringToDegrees(string, degLength, negative) {
    const deg = Number(string.slice(0, degLength));
    const min = Number(string.slice(degLength));
    const sign = negative ? -1 : 1;
    return sign * (deg + min / 60.0);
  }

  function processRadarData(radarData) {
    return _.map(radarData, datum => {
      console.assert(
        datum["E or W"] === "E" || datum["E or W"] === "W",
        "must be E(ast) or W(est)"
      );
      console.assert(
        datum["N or S"] === "N" || datum["N or S"] === "S",
        "must be N(orth) or S(outh)"
      );
      let lon = stringToDegrees(datum["Longitude"], 3, datum["E or W"] === "W"); // example: { ... "Longitude":"00656.67239","E or W":"E" ... }
      let lat = stringToDegrees(datum["Latitude"], 2, datum["N or S"] === "S"); // example: { ... "Latitude":"5121.66311","N or S":"N" ... }
      const height = Number(datum["Antenna altitude"]);
      return Cartographic.toCartesian(
        Cartographic.fromDegrees(lon, lat, height)
      );
    });
  }

  ///////////////////////
  // Debugging
  ///////////////////////
  function visualizeDirection(
    dir,
    color = Color.WHITE,
    length = 4,
    name = dir.toString()
  ) {
    const directionArray = (dir, length, start) => {
      let array = [start];
      let prev = start;
      let current = null;
      for (let i = 0; i < length - 1; i++) {
        current = addC3(prev, dir);
        array.push(current);
        prev = current;
      }
      const end = addC3(prev, dir);
      array.push(end);
      return array;
    };

    return globals.viewer.entities.add({
      name,
      polyline: {
        positions: directionArray(dir, length, globals.camera.position.clone()),
        followSurface: false,
        width: 3,
        material: color
      }
    });
  }

  function visualizePosition(
    position,
    color = Color.WHITE,
    name = position.toString()
  ) {
    globals.viewer.entities.add({
      name,
      position,
      ellipsoid: {
        radii: { x: 1.5, y: 1.5, z: 1.5 },
        material: color
      }
    });
  }

  ///////////////////////
  // Interaction Setup
  ///////////////////////
  function worldUp(camera) {
    return Matrix4.multiplyByPoint(
      camera.inverseTransform,
      camera.positionWC,
      new Cartesian3()
    );
  }

  function geographicNorth(cameraPosition) {
    const north = Cartographic.fromCartesian(cameraPosition);
    north.latitude += 0.00001;
    const cartNorth = Cartographic.toCartesian(north);
    return [cartNorth, subC3(cartNorth, cameraPosition)];
  }

  function look(which) {
    const camera = globals.camera;
    const rotation = Cesium.Math.toRadians(4.5); // degrees

    if (which === 39) {
      // right arrow
      camera.look(worldUp(camera), rotation);
    } else if (which === 37) {
      // left arrow
      camera.look(worldUp(camera), -rotation);
    } else if (which === 38) {
      // up arrow
      camera.lookUp(rotation);
    } else if (which === 40) {
      // down arrow
      camera.lookDown(rotation);
    }
  }

  function move(code) {
    const camera = globals.camera;
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
      globals.rotationOffset.heading -= defaultAmount;
    } else if (code === "KeyL") {
      globals.rotationOffset.heading += defaultAmount;
    } else if (code === "KeyI") {
      globals.rotationOffset.pitch -= defaultAmount;
    } else if (code === "KeyK") {
      globals.rotationOffset.pitch += defaultAmount;
    } else if (code === "KeyU") {
      globals.rotationOffset.roll += defaultAmount;
    } else if (code === "KeyO") {
      globals.rotationOffset.roll -= defaultAmount;
    }
  }

  function visualizeCamera(code) {
    if (code === "KeyC") {
      const camera = globals.camera;

      const camDirLine = visualizeDirection(camera.direction, Color.VIOLET);
      const camDirRight = visualizeDirection(camera.right, Color.YELLOW);
      const camDirUp = visualizeDirection(camera.up, Color.LIGHTBLUE);

      const [northPos, northDir] = geographicNorth(camera.position.clone());
      visualizePosition(northPos, Color.CORNFLOWERBLUE, "North Sphere");
      visualizeDirection(northDir, Color.CORNFLOWERBLUE, 1);
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
    visualizeCamera(event.code);
  }
  document.addEventListener("keydown", keyDownListener, false);

  function setupEntityPickHandler(
    canvas,
    handler,
    eventType = ScreenSpaceEventType.LEFT_CLICK
  ) {
    const eventHandler = new ScreenSpaceEventHandler(canvas);
    eventHandler.setInputAction(event => {
      let pickedPrimitive = globals.scene.pick(event.position);
      let pickedEntity = defined(pickedPrimitive)
        ? pickedPrimitive.id
        : undefined;

      if (defined(pickedEntity)) {
        handler(pickedEntity, event);
      }
    }, eventType);
    return eventHandler;
  }
  // --------------------------------

  // Cesium Ion
  Ion.defaultAccessToken =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIzZmEzMjQwMi00MjQ0LTRmZjgtODhlOS0zNDI5ZmU3NGRkODQiLCJpZCI6MTQ5MywiaWF0IjoxNTI4NzE4Mzg0fQ.4h4xuSeZTaiBGtv4sHA7WN6D1eIedRHw-6rFls9QMsQ";

  //////////////////////////////////////////////////////////////////////////
  // Creating the Viewer
  //////////////////////////////////////////////////////////////////////////

  const viewer = new Viewer("cesiumContainer", {
    scene3DOnly: true,
    selectionIndicator: false,
    baseLayerPicker: false,
    timeline: false
  });

  // setup scene
  const scene = viewer.scene;
  scene.globe.show = false;
  // viewer.scene.debugShowFrustumPlanes = true; // show frustums

  //////////////////////////////////////////////////////////////////////////
  // Loading Imagery
  //////////////////////////////////////////////////////////////////////////

  // Remove default base layer
  viewer.imageryLayers.remove(viewer.imageryLayers.get(0));

  // Add Sentinel-2 imagery
  // viewer.imageryLayers.addImageryProvider(new Cesium.IonImageryProvider({ assetId: 3954 }));

  // Add Bing Maps
  // viewer.imageryLayers.addImageryProvider(
  //   new Cesium.IonImageryProvider({ assetId: 4 })
  // );

  //////////////////////////////////////////////////////////////////////////
  // Loading Terrain
  //////////////////////////////////////////////////////////////////////////

  // Load Cesium World Terrain
  // viewer.terrainProvider = Cesium.createWorldTerrain({
  //   requestWaterMask: true, // required for water effects
  //   requestVertexNormals: true // required for terrain lighting
  // });
  // Enable depth testing so things behind the terrain disappear.
  // viewer.scene.globe.depthTestAgainstTerrain = true;

  //////////////////////////////////////////////////////////////////////////
  // Configuring the Scene
  //////////////////////////////////////////////////////////////////////////

  // Enable lighting based on sun/moon positions
  scene.globe.enableLighting = true;

  // Set the initial view
  const camera = viewer.camera;
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
  // camera.flyTo({ duration: 0, ...startOfStreetView });

  // Override the default home button
  viewer.homeButton.viewModel.command.beforeExecute.addEventListener(e => {
    e.cancel = true;
    camera.flyTo({ duration: 0.5, ...startOfStreetView });
  });

  // load data for different streets
  const streets = _.reduce(
    ["emscher", "langenbeck", "steinweg"],
    (streets, streetName) => {
      const streetDirPath = streetBasePath + streetName + "/";
      const panoramaDirPath = streetDirPath + "G360/";
      const radarDirPath = streetDirPath + "GPR/";
      const tilesetPath = streetDirPath + "pointcloud/tileset.json";

      const tileset = scene.primitives.add(
        new Cesium3DTileset({
          url: host + tilesetPath,
          skipLevelOfDetail: true,
          baseScreenSpaceError: 1024,
          skipScreenSpaceErrorFactor: 16,
          skipLevels: 1
        })
      );

      let metaData = null;
      let radarLocations = null;
      let filteredRadarLocations = null;
      let polyline = null;
      const street = {
        streetDirPath,
        panoramaDirPath,
        radarDirPath,
        tileset,
        metaData,
        radarLocations,
        filteredRadarLocations,
        polyline
      };

      fetch(new URL(panoramaDirPath + "meta.json", host))
        .then(res => res.json())
        .then(data => processMetaData(data, street))
        .then(processedData => {
          street.metaData = processedData;
          // place spheres representing the panorama pictures
          _.forEach(street.metaData, meta => {
            viewer.entities.add({
              name: meta.image,
              position: meta.cartesianPos,
              ellipsoid: {
                radii: { x: 1, y: 1, z: 1 },
                material: Color.DARKGREEN
              },
              properties: {
                index: meta.index,
                streetName
              }
            });
          });
        })
        .catch(err => console.error(err));

      fetch(new URL(radarDirPath + "radar_gps.json", host))
        .then(res => res.json())
        .then(processRadarData)
        .then(locations => {
          street.radarLocations = locations;
          // hacky way of deduplicating the radar locations
          street.filteredRadarLocations = _.unique(locations, false, loc =>
            loc.toString()
          );

          street.polyline = viewer.entities.add({
            name: streetName + "radar locations",
            polyline: {
              positions: street.filteredRadarLocations,
              width: 2,
              material: Color.ORANGE
            }
          });
        })
        .catch(err => console.error(err));

      streets[streetName] = street;
      return streets;
    },
    {}
  );

  const hide = entity => {
    if (defined(entity)) {
      entity.show = false;
    }
  };
  // set up handler to allow clicking spheres to see their panorama
  setupEntityPickHandler(scene.canvas, entity => {
    if (defined(globals.lastPicked)) {
      globals.lastPicked.show = true;
    }
    if (defined(entity.properties.index)) {
      const index = entity.properties.index.getValue();
      const streetName = entity.properties.streetName.getValue();
      const meta = globals.streets[streetName].metaData[index];
      console.log("picked image: ", meta.image);

      const destination = meta.cartesianPos;
      const orientation = meta.cameraOrientation;
      const duration = 0.5; // seconds

      camera.flyTo({
        destination,
        orientation,
        duration,
        complete: () => {
          const up = worldUp(camera);

          const cameraPosition = camera.position.clone();
          const [northPos, northDir] = geographicNorth(cameraPosition);
          visualizePosition(northPos, Color.CORNFLOWERBLUE, "North Sphere");
          visualizeDirection(northDir, Color.CORNFLOWERBLUE, 1);

          const visualizeVector = (
            angle,
            name = "vector visualization",
            color = Color.WHITE
          ) => {
            const rot = Matrix3.fromQuaternion(
              Quaternion.fromAxisAngle(up, -angle)
            );
            const direction = Matrix3.multiplyByVector(
              rot,
              northDir,
              new Cartesian3()
            );
            visualizeDirection(direction, color, 1);
            const position = addC3(cameraPosition, direction);
            visualizePosition(position, color, name);
          };

          visualizeVector(
            meta.cameraOrientation.heading,
            "Panorama Direction Sphere",
            Color.FUCHSIA
          );
          // visualizeVector(
          //   meta.vehicleOrientation.heading,
          //   "Vehicle Direction Sphere",
          //   Color.HONEYDEW
          // );
          // visualizeVector(
          //   (meta.vehicleOrientation.heading +
          //     meta.cameraOrientation.heading) %
          //     (2 * Math.PI),
          //   "Vehicle + Panorama Direction Sphere",
          //   Color.GOLD
          // );
        }
      });

      addOrUpdatePostProcessing(streetName, index);

      hide(entity);
      globals.lastPicked = entity;
    }
  });

  // hide panorama spheres on right click
  setupEntityPickHandler(
    scene.canvas,
    entity => hide(entity),
    ScreenSpaceEventType.RIGHT_CLICK
  );

  const startStreet = streets["steinweg"];
  startStreet.tileset.readyPromise.then(tileset => {
    camera.flyToBoundingSphere(tileset.boundingSphere);
    // tileset.style = new Cesium3DTileStyle({
    //   color: 'color("red")'
    // });
  });

  const interpolation = 0.2;
  const rotationOffset = new HeadingPitchRoll();

  globals = _.extend(
    {
      // Cesium objects
      viewer,
      scene,
      camera,

      streets,

      // offset to use when rotating the panorama
      rotationOffset,

      // for selecting panoramas
      lastPicked: undefined,
      currentPanoramaImage: undefined,

      // post-processing stage
      postProcessStage: undefined,
      // [-1, 1] how much to prioritize the pointcloud (-1) or panorama (1) when interpolating
      interpolation
    },
    globals
  );
})();
