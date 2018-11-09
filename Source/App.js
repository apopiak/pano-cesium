// globals
let G = {};

(function() {
  "use strict";

  ////////////////////////////
  // Panorama Rendering
  ////////////////////////////

  const degToRad = deg => (deg * Math.PI) / 180.0;

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

    // var transform = Cesium.Transforms.eastNorthUpToFixedFrame(destination);
    // camera.constrainedAxis = Cesium.Cartesian3.UNIT_Z;
    // camera.lookAtTransform(transform, new Cesium.Cartesian3(-1.0, 0.0, 0.0));

    const addStage = (fragmentShader, imagePath) => {
      const uniforms = {
        u_panorama: imagePath,
        u_inverseCameraTranform: () => {
          let scratch = new Cesium.Matrix4();
          return Cesium.Matrix4.inverse(
            Cesium.Transforms.eastNorthUpToFixedFrame(
              camera.positionWC,
              Cesium.Ellipsoid.WGS84,
              scratch
            ),
            scratch
          );
        },
        u_cameraRotation: () => {
          // console.log("camera headingPitchRoll", meta.cameraOrientation);
          // let quat = Cesium.Quaternion.fromHeadingPitchRoll(
          //   meta.cameraOrientation,
          //   new Cesium.Quaternion()
          // );
          let quat = Cesium.Quaternion.fromAxisAngle(
            Cesium.Cartesian3.UNIT_Y,
            -meta.cameraOrientation.heading
          );
          let quatPitch = Cesium.Quaternion.fromAxisAngle(
            Cesium.Cartesian3.UNIT_Z,
            meta.cameraOrientation.pitch
          );
          let quatRoll = Cesium.Quaternion.fromAxisAngle(
            Cesium.Cartesian3.UNIT_X,
            -meta.cameraOrientation.roll
          )
          Cesium.Quaternion.multiply(quat, quatPitch, quat);
          Cesium.Quaternion.multiply(quat, quatRoll, quat);
          // console.log("quaternion", quat);
          let rot3 = Cesium.Matrix3.fromQuaternion(quat, new Cesium.Matrix3());
          // console.log("rot3", rot3);
          let rot = Cesium.Matrix4.fromRotationTranslation(
            rot3,
            Cesium.Cartesian3.ZERO,
            new Cesium.Matrix4()
          );
          // console.log("rot", rot);
          return rot;
        },
        u_direction: () => camera.directionWC,
        u_globeTransform: () => {
          const icrfToFixed = Cesium.Transforms.computeIcrfToFixedMatrix(
            scene.lastRenderTime || Cesium.JulianDate.now()
          );
          if (!Cesium.defined(icrfToFixed)) {
            return Cesium.Matrix4.clone(Cesium.Matrix4.IDENTITY);
          }
          return Cesium.Matrix4.fromRotationTranslation(icrfToFixed);
        },
        u_nearPlaneDistance: () => camera.frustum.near,
        u_nearPlaneSize: () => {
          const frustum = camera.frustum;
          const height = 2 * Math.tan(frustum.fov) * frustum.near;
          const width = height * frustum.aspectRatio;
          return new Cesium.Cartesian2(width, height);
        }
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

    // meta data for the panoramas
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
  // scene.skyBox = new Cesium.SkyBox({
  //   sources: {
  //     positiveX: "cubemap/face-l.png", //'skybox_px.png',
  //     negativeX: "cubemap/face-r.png", //'skybox_nx.png',
  //     positiveY: "cubemap/face-f.png", //'skybox_py.png',
  //     negativeY: "cubemap/face-b.png", //'skybox_ny.png',
  //     positiveZ: "cubemap/face-t.png", //'skybox_pz.png',
  //     negativeZ: "cubemap/face-d.png" //'skybox_nz.png'
  //   }
  // });
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
      // addImageRectangle(index);

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

G.fn.addOrUpdatePostProcessing(15);
// G.fn.addImageRectangle(15);
