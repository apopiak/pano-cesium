// globals
let G = {};

(function() {
  "use strict";

  ////////////////////////////
  // Panorama Rendering
  ////////////////////////////

  function updatePostProcessing(imagePath) {
    if (Cesium.defined(G.postProcessStage)) {
      G.postProcessStage.uniforms.panorama = imagePath;
    } else {
      console.console.error("no post processing stage found");
    }
  }

  // add a panorama rendering in post processing
  function addOrUpdatePostProcessing(idx) {
    const index = idx || 0;
    const meta = G.metaData[index];
    const camera = G.viewer.scene.camera;

    G.currentPanoramaImage = meta.image;

    const destination = meta.cartesianPos;
    // TODO: check for end of array
    const nextPos = G.metaData[index + 1].cartesianPos;
    // console.log("nextPos", nextPos);
    // const orientation = {
    //     direction: Cesium.Cartesian3.subtract(nextPos, destination),
    //     up: camera.up
    // };
    let orientation = meta.cameraOrientation;
    const duration = 0.5; // seconds

    if (Cesium.defined(G.postProcessStage)) {
      // we don't need to do anything if the right image is already being displayed
      if (G.postProcessStage.uniforms.panorama === meta.imagePath) {
        return;
      }
      // otherwise we fly to the right location and update the panorama texture
      camera.flyTo({ destination, orientation, duration });
      updatePostProcessing(meta.imagePath);
      return;
    }

    const canvas = G.viewer.scene.canvas;
    const stages = G.viewer.scene.postProcessStages;

    fetch("data/projectionShader.fs.glsl")
      .then(res => res.text())
      .then(shader => {
        camera.flyTo({ destination, orientation, duration });
        if (stages.length != 0) {
          stages.removeAll();
        }
        G.postProcessStage = stages.add(
          new Cesium.PostProcessStage({
            fragmentShader: shader,
            uniforms: {
              u_panorama: meta.imagePath,
              u_camPos: () => camera.positionWC,
              u_direction: () => camera.directionWC,
              u_nearPlaneDistance: () => camera.frustum.near,
              u_nearPlaneSize: () => {
                const frustum = camera.frustum;
                const height = 2 * Math.tan(frustum.fov) * frustum.near;
	              const width = height * frustum.aspectRatio;
                return new Cesium.Cartesian2(width, height);
              }
            }
          })
        );
      })
      .catch(err => console.error(err));
  }

  function addPanoramaSphere(idx) {
    const index = idx || 0;
    const meta = G.metaData[index];
    const camera = G.viewer.scene.camera;

    G.currentPanoramaImage = meta.image;

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

  ///////////////////////
  // Data Processing
  ///////////////////////
  function origToCartographic(meta, utmZone) {
    const steinwegUTMzone = 32;
    utmZone = utmZone || steinwegUTMzone;

    const utm = new UTMConv.UTMCoords(
      steinwegUTMzone,
      meta["X-Sensor"],
      meta["Y-Sensor"]
    );
    const degrees = utm.to_deg("wgs84");
    const height = meta["Z-Sensor"];
    return Cesium.Cartographic.fromDegrees(degrees.lngd, degrees.latd, height);
  }

  function headingPitchRoll(meta) {
    return Cesium.HeadingPitchRoll.fromDegrees(
      meta["H-Sensor"],
      meta["P-Sensor"],
      meta["R-Sensor"]
    );
  }

  function processData(originalJson) {
    return _.map(originalJson, (meta, index) => {
      const cartographicPos = origToCartographic(meta);

      return {
        index,
        cartographicPos,
        cartesianPos: Cesium.Cartographic.toCartesian(cartographicPos),
        cameraOrientation: headingPitchRoll(meta),

        image: meta.ImageName,
        imagePath: "images/" + meta.ImageName,

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

  function keyDownListener(event) {
    // https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/which
    // [37;40] == arrow keys
    if (event.which <= 40 && event.which >= 37) {
      look(event.which);
    }
    move(event.code);
  }

  document.addEventListener("keydown", keyDownListener, false);

  ///////////////////////
  // Globals
  ///////////////////////
  G = {
    // viewers
    viewer: undefined,

    metaData: processData(steinwegMetaJson),

    // cesium 3D tileset
    tileset: undefined,

    // for selecting panoramas
    lastPicked: undefined,
    currentPanoramaImage: undefined,

    // post-processing stage
    postProcessStage: undefined,

    fn: {
      addOrUpdatePostProcessing,
      addPanoramaSphere
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
  const birdsEye = new Cesium.Cartesian3(
    3961538.873578816,
    482335.18245185615,
    4958890.174561147
  );
  const inTheStreet = {
    x: 3961467.550069339,
    y: 482298.0868178488,
    z: 4958811.655684536
  };
  const homeCameraView = {
    destination: inTheStreet,
    orientation: {
      direction: {
        x: 0.028642267278155248,
        y: 0.9168583988712383,
        z: -0.39818374771509196
      },
      up: {
        x: 0.6449769314801278,
        y: 0.28737711124775434,
        z: 0.7081095634076512
      }
    }
  };
  G.viewer.scene.camera.flyTo({ duration: 0, ...homeCameraView });

  // Override the default home button
  G.viewer.homeButton.viewModel.command.beforeExecute.addEventListener(e => {
    e.cancel = true;
    G.viewer.scene.camera.flyTo({ duration: 0.5, ...homeCameraView });
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

  G.tileset = tileset;

  // view port squad
  // var viewportQuad = new PanoramaViewportQuad(new Cesium.BoundingRectangle(200, 200, 300, 200));
  // viewportQuad.material.uniforms.color = new Cesium.Color(1.0, 0.0, 0.0, 1.0);
  // G.viewer.scene.primitives.add(viewportQuad);
  // let instance = new Cesium.GeometryInstance({
  //   geometry: new Cesium.PlaneGeometry({
  //     vertexFormat: Cesium.VertexFormat.ALL
  //   })
  // });
  // let primitive = new Cesium.Primitive({
  //   geometryInstances: [instance],
  //   appearance: new Cesium.DebugAppearance({
  //     attributeName: "normal"
  //   })
  // });
  // G.viewer.scene.primitives.add(primitive);

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

  let handler = new Cesium.ScreenSpaceEventHandler(G.viewer.scene.canvas);
  handler.setInputAction(e => {
    let pickedPrimitive = G.viewer.scene.pick(e.position);
    let pickedEntity = Cesium.defined(pickedPrimitive)
      ? pickedPrimitive.id
      : undefined;

    if (Cesium.defined(G.lastPicked)) {
      G.lastPicked.show = true;
    }
    if (Cesium.defined(pickedEntity)) {
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

// G.fn.addOrUpdatePostProcessing(15);
