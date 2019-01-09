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

  const { UNIT_X, UNIT_Y, UNIT_Z } = Cartesian3;

  ////////////////////////////
  // Constants
  ////////////////////////////
  const EMSCHER = "Emscherstr";
  const STEINWEG = "Steinweg";
  const LANGENBECK = "Langenbeckstr";
  const WROCLAW = "Wroclaw";
  const HOST = "http://localhost:8080/";
  const STREET_BASE_PATH = "data/streets/";

  ////////////////////////////
  // Utility Functions
  ////////////////////////////

  // convert Cesium/when.js promise to ES6 Promise
  function wrapPromise(whenPromise) {
    return new Promise((resolve, reject) => {
      whenPromise.then(resolve, reject);
    });
  }

  // custom implementation to create a Quaternion from HeadingPitchRoll
  // necessary to get the right rotation matrix for the shader
  function customQuatFromHPR(hpr) {
    // positive around Y is heading RIGHT
    let result = Quaternion.fromAxisAngle(UNIT_Y, hpr.heading);
    // positive around X is pitch UP
    const pitch = Quaternion.fromAxisAngle(UNIT_X, hpr.pitch);
    Quaternion.multiply(result, pitch, result);
    // positive around Z is roll RIGHT
    const roll = Quaternion.fromAxisAngle(UNIT_Z, hpr.roll);
    Quaternion.multiply(result, roll, result);
    return result;
  }
  // convert Quaternion to Matrix4
  function mat4FromQuat(quaternion) {
    return Matrix4.fromRotationTranslation(
      Matrix3.fromQuaternion(quaternion),
      Cartesian3.ZERO,
      new Matrix4()
    );
  }
  // add 2 Cartesian3 instances; allocates
  function addC3(left, right) {
    return Cartesian3.add(left, right, new Cartesian3());
  }
  // subtract 2 Cartesian3 instances; allocates
  function subC3(left, right) {
    return Cartesian3.subtract(left, right, new Cartesian3());
  }
  // add 2 HeadingPitchRoll instances; allocates
  function addHPR(left, right) {
    let result = new HeadingPitchRoll();
    result.heading = left.heading + right.heading;
    result.pitch = left.pitch + right.pitch;
    result.roll = left.roll + right.roll;
    return result;
  }

  function geocentricToGeodeticError(p) {
    var p2 = new Cartesian3();
    Cartesian3.multiplyComponents(p, p, p2);
    Cartesian3.multiplyComponents(p2, Ellipsoid.WGS84._oneOverRadii, p2);
    Cartesian3.multiplyComponents(p2, Ellipsoid.WGS84._oneOverRadii, p2);

    // Compute the squared ellipsoid norm.
    var squaredNorm = p2.x + p2.y + p2.z;
    var ratio = Math.sqrt(1.0 / squaredNorm);

    return (
      Ellipsoid.WGS84.cartesianToCartographic(p).height -
      Cartesian3.magnitude(p) * (1 - ratio)
    );
  }

  ////////////////////////////
  // Panorama Rendering
  ////////////////////////////

  // add a panorama rendering in post processing
  function addOrUpdatePostProcessing(streetName, index) {
    const street = globals.streets[streetName];
    const meta = street.metaData[index];

    const destination = meta.cartesianPos;
    const orientation = meta.cameraOrientation;
    const duration = 0.5; // seconds

    const scene = globals.scene;
    const camera = scene.camera;
    const stages = scene.postProcessStages;

    const addStage = (fragmentShader, imagePath) => {
      const computeInverseCameraRotation = () => {
        const cameraQuaternion = customQuatFromHPR(
          addHPR(orientation, street.rotationOffset)
        );
        return Matrix4.inverse(mat4FromQuat(cameraQuaternion), new Matrix4());
      };

      const uniforms = {
        u_panorama: imagePath,
        u_frontRotation: () =>
          mat4FromQuat(
            Quaternion.fromAxisAngle(UNIT_X, Cesium.Math.toRadians(90.0))
          ),
        u_inverseCameraRotation: () => computeInverseCameraRotation(),
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
      .catch(console.error);
  }

  ///////////////////////
  // Data Processing
  ///////////////////////

  function enrichMetaData(data, street) {
    return _.map(data, meta => {
      const { heading, pitch, roll } = meta.orientation;
      const cameraOrientation = HeadingPitchRoll.fromDegrees(
        heading,
        pitch,
        roll
      );
      const { longitude, latitude, height } = meta.position;
      const cartographicPos = Cartographic.fromDegrees(
        longitude,
        latitude,
        height
      );
      const cartesianPos = Cartographic.toCartesian(cartographicPos);
      const image = meta.fileName;
      const { index, _original } = meta;

      return {
        index,

        // positioning
        cartographicPos,
        cartesianPos,
        cameraOrientation,

        image,
        imagePath: street.panoramaDirPath + image,

        _original
      };
    });
  }

  function parseRadarCSV(csv) {
    const lines = csv.match(/[^\r\n]+/g);
    // The first content line starts with a $ sign, e.g. '$GPGPA'
    if (lines[0].trim()[0] != "$") {
      lines.shift(); // remove csv header
    }
    // the `Parse` function uses `this` and expects it to be `GPS`...
    return _.map(lines, l => GPS.Parse.call(GPS, l)).map(datum =>
      Cartographic.toCartesian(
        Cartographic.fromDegrees(datum.lon, datum.lat, datum.alt)
      )
    );
  }

  ///////////////////////
  // Debugging
  ///////////////////////
  function track(entity) {
    if (defined(entity)) {
      globals._tracked.push(entity);
    } else {
      console.error("cannot track: entity is undefined");
    }
  }

  function clearTracked() {
    _.filter(globals._tracked).forEach(entity => {
      globals.viewer.entities.remove(entity);
    });
    globals._tracked = [];
  }

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
    return globals.viewer.entities.add({
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
    const defaultAmount = 0.001;

    if (code === "KeyJ") {
      globals.currentStreet.rotationOffset.heading -= defaultAmount;
    } else if (code === "KeyL") {
      globals.currentStreet.rotationOffset.heading += defaultAmount;
    } else if (code === "KeyI") {
      globals.currentStreet.rotationOffset.pitch -= defaultAmount;
    } else if (code === "KeyK") {
      globals.currentStreet.rotationOffset.pitch += defaultAmount;
    } else if (code === "KeyU") {
      globals.currentStreet.rotationOffset.roll += defaultAmount;
    } else if (code === "KeyO") {
      globals.currentStreet.rotationOffset.roll -= defaultAmount;
    }
  }

  function visualizeCamera(code) {
    if (code === "KeyC") {
      clearTracked();

      const camera = globals.camera;

      track(visualizeDirection(camera.direction, Color.VIOLET));
      track(visualizeDirection(camera.right, Color.YELLOW));
      track(visualizeDirection(camera.up, Color.LIGHTBLUE));

      const [northPos, northDir] = geographicNorth(camera.position.clone());
      track(visualizePosition(northPos, Color.CORNFLOWERBLUE, "North Sphere"));
      track(visualizeDirection(northDir, Color.CORNFLOWERBLUE, 1));
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
  // scene.globe.show = false;
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
    [EMSCHER, STEINWEG, LANGENBECK],
    (streets, streetName) => {
      const streetDirPath = STREET_BASE_PATH + streetName + "/";
      const panoramaDirPath = streetDirPath + "G360/";
      const radarDirPath = streetDirPath + "GPR/";
      const tilesetPath =
        streetName === WROCLAW
          ? streetDirPath + "points/tileset.json"
          : streetDirPath + "pointcloud/tileset.json";

      const rotationOffset = _.any(
        [EMSCHER, STEINWEG, LANGENBECK],
        name => name === streetName
      )
        ? new HeadingPitchRoll(-0.027, 0, 0)
        : new HeadingPitchRoll();

      let promises = [];
      const tileset = scene.primitives.add(
        new Cesium3DTileset({
          url: HOST + tilesetPath,
          skipLevelOfDetail: true,
          baseScreenSpaceError: 1024,
          skipScreenSpaceErrorFactor: 16,
          skipLevels: 1

          // debugShowBoundingVolume: true,
          // debugShowContentBoundingVolume: true,
          // debugShowViewerRequestVolume: true
        })
      );
      promises.push(wrapPromise(tileset.readyPromise));

      const imageTileset = scene.primitives.add(
        new Cesium3DTileset({
          url: HOST + panoramaDirPath + "tileset.json",
          // skipLevelOfDetail: true,
          // baseScreenSpaceError: 1024,
          // skipScreenSpaceErrorFactor: 16,
          // skipLevels: 1,

          debugShowBoundingVolume: true,
          debugShowContentBoundingVolume: true,
          debugShowViewerRequestVolume: true
        })
      );

      let metaData = {};
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
        polyline,
        rotationOffset,
        imageTileset,
        ready: false
      };

      const getExtrasMeta = tileset => {
        if (!defined(tileset.extras)) {
          throw Error("image tileset does not contain extras");
        }
        if (!defined(tileset.extras.metaData)) {
          throw Error("image tileset does not contain metaData");
        }
        return tileset.extras.metaData;
      };
      const process = data => enrichMetaData(data, street);
      const addData = processedData =>
        _.forEach(processedData, meta => {
          street.metaData[meta.index] = meta;
        });
      const addSpheres = data =>
        _.forEach(data, meta =>
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
          })
        );

      promises.push(
        wrapPromise(imageTileset.readyPromise)
          .then(getExtrasMeta)
          .then(process)
          .then(addData)
          .then(addSpheres)
          .catch(console.error)
      );

      imageTileset.tileLoad.addEventListener(tile => {
        try {
          Promise.resolve(tile)
            .then(getExtrasMeta)
            .then(process)
            .then(addData)
            .then(addSpheres)
            .catch(console.error);
        } catch (e) {
          console.error(e);
        }
      });

      imageTileset.allTilesLoaded.addEventListener(() => {
        // place spheres representing the panorama pictures
        console.info("all tiles loaded");
      });

      const filterAndVisualizeLocations = locations => {
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
      };

      if (streetName !== WROCLAW) {
        promises.push(
          fetch(new URL(radarDirPath + "radar_gps.csv", HOST))
            .then(res => res.text())
            .then(parseRadarCSV)
            .then(filterAndVisualizeLocations)
            .catch(console.error)
        );
      }

      street.readyPromise = Promise.all(promises).then(_ => {
        street.ready = true;
        return street;
      });
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
      console.info("picked image: ", meta.image);

      const destination = meta.cartesianPos;
      const orientation = meta.cameraOrientation;
      const duration = 0.5; // seconds

      camera.flyTo({
        destination,
        orientation,
        duration,
        complete: () => {
          clearTracked();

          const up = worldUp(camera);

          const cameraPosition = camera.position.clone();
          const [northPos, northDir] = geographicNorth(cameraPosition);
          track(
            visualizePosition(northPos, Color.CORNFLOWERBLUE, "North Sphere")
          );
          track(visualizeDirection(northDir, Color.CORNFLOWERBLUE, 1));

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
            track(visualizeDirection(direction, color, 1));
            const position = addC3(cameraPosition, direction);
            track(visualizePosition(position, color, name));
          };

          visualizeVector(
            meta.cameraOrientation.heading,
            "Panorama Direction Sphere",
            Color.FUCHSIA
          );
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

  const currentStreet = streets[EMSCHER];
  wrapPromise(currentStreet.tileset.readyPromise)
    .then(tileset => {
      camera.flyToBoundingSphere(tileset.boundingSphere);

      const intervalOffset = 0;
      const intervalRepeat = true;
      const intervalHeight = 4;
      let style = {};

      // from CesiumViewer.js
      var interval = intervalHeight;
      const northEast = tileset._root._boundingVolume.northeastCornerCartesian;
      const southWest = tileset._root._boundingVolume.southwestCornerCartesian;
      var mediumDistanceError =
        (geocentricToGeodeticError(northEast) +
          geocentricToGeodeticError(southWest)) /
        2.0;

      var radiiSquared = Ellipsoid.WGS84._oneOverRadiiSquared;

      // prettier-ignore
      var p2 =
        "${POSITION_ABSOLUTE}.x * ${POSITION_ABSOLUTE}.x * " + radiiSquared.x + " + " +
        "${POSITION_ABSOLUTE}.y * ${POSITION_ABSOLUTE}.y * " + radiiSquared.y + " + " +
        "${POSITION_ABSOLUTE}.z * ${POSITION_ABSOLUTE}.z * " + radiiSquared.z;

      // prettier-ignore
      var distanceToEllipsoid =
        "(length(${POSITION_ABSOLUTE}) * (1 - sqrt(1 / (" + p2 + "))) - " +
        (mediumDistanceError + intervalOffset) + ")";

      if (intervalRepeat) {
        // prettier-ignore
        style["color"] = "1.0 - abs(" + distanceToEllipsoid + " % " + 2 * interval +
          " - " + interval + ") / " + interval + " * vec4(1.0, 1.0, 1.0, 0)";
      } else {
        style["color"] = {
          conditions: [
            [distanceToEllipsoid + " < 0", "vec4(0.0)"],
            [distanceToEllipsoid + " >= " + interval, "vec4(1.0)"],
            [true, "(${POSITION_ABSOLUTE}.z * vec4(1.0, 1.0, 1.0, 0)"]
            //[true, '(' + distanceToEllipsoid + ' % ' + interval + ') / ' + interval + ' * vec4(1.0, 1.0, 1.0, 0)']
          ]
        };
      }

      tileset.style = new Cesium3DTileStyle(style);
    })
    .catch(console.error);

  const interpolation = 0.2;

  globals = _.extend(
    {
      // Cesium objects
      viewer,
      scene,
      camera,

      streets,
      currentStreet,

      // for selecting panoramas
      lastPicked: undefined,
      currentPanoramaImage: undefined,

      // post-processing stage
      postProcessStage: undefined,
      // [-1, 1] how much to prioritize the pointcloud (-1) or panorama (1) when interpolating
      interpolation,

      _tracked: []
    },
    globals
  );
})();
