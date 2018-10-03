// globals

let viewer = null;
let panoramaViewer = null;

const steinwegUTMzone = 32;

let positions = _.map(steinwegMetaJson, meta => {
  let utm = new UTMConv.UTMCoords(
    steinwegUTMzone,
    meta["X-Sensor"],
    meta["Y-Sensor"]
  );
  let degrees = utm.to_deg("wgs84");
  return Cesium.Cartographic.fromDegrees(degrees.lngd, degrees.latd);
});
let sampledPositions = [];

let tileset = null;

let lastPicked = undefined;

let currentPanoramaImage = null;

let fragmentShaderSource = `
  uniform sampler2D colorTexture;
  uniform sampler2D panorama;
  varying vec2 v_textureCoordinates;

  void main(void)
  {
      vec4 color = texture2D(colorTexture, v_textureCoordinates);
      vec4 pano = texture2D(panorama, v_textureCoordinates);
      if (pano.x + pano.y + pano.z > 0.0) {
        gl_FragColor = mix(vec4(1.0, 0.0, 0.0, 1.0), color, 0.5);
      } else {
        gl_FragColor = mix(vec4(0.0, 1.0, 0.0, 1.0), color, 0.5);
      }
      //gl_FragColor = mix(color, pano, 0.5);
  }
`;

let getPanellumCanvas = () =>
  document.querySelector(".pnlm-render-container > canvas:nth-child(1)");

let getThreeCanvas = () => document.querySelector("#container > canvas");

let postProcessingFromCanvas = sourceCanvas => {
  let destCtx = document.getElementById("mycanvas").getContext("2d");

  //call its drawImage() function passing it the source canvas directly
  destCtx.drawImage(
    sourceCanvas,
    0,
    0,
    sourceCanvas.width,
    sourceCanvas.height
  );

  let context = new Cesium.Context(viewer.scene.canvas, {});
  let texture = new Cesium.Texture({
    context: context,
    width: sourceCanvas.width,
    height: sourceCanvas.height
  });
  texture.copyFrom(sourceCanvas);

  let stages = viewer.scene.postProcessStages;

  if (stages.length != 0) {
    stages.removeAll();
  }
  stages.add(
    new Cesium.PostProcessStage({
      fragmentShader: fragmentShaderSource,
      uniforms: {
        panorama: texture
      }
    })
  );
};

function createImageFromTarget(renderer, target) {
  let width = target.width;
  let height = target.height;

  // Read the contents of the framebuffer
  let data = new Uint8Array(width * height * 4);
  renderer.readRenderTargetPixels(target, 0, 0, width, height, data);

  // Create a 2D canvas to store the result
  let canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  let context = canvas.getContext("2d");

  // Copy the pixels to a 2D canvas
  let imageData = context.createImageData(width, height);
  imageData.data.set(data);
  context.putImageData(imageData, 0, 0);

  let img = new Image();
  img.src = canvas.toDataURL();
  return img;
}

let copiedImage = null;

let addPostProcessing = (gl, renderer, renderTarget) => {
  let img = createImageFromTarget(renderer, renderTarget);
  copiedImage = img;

  img.onload = () => {
    // testing 2D canvas
    let destCtx = document.getElementById("mycanvas").getContext("2d");
    destCtx.drawImage(img, 0, 0, img.width, img.height);

    // Cesium Post Processing
    let context = viewer.scene.context;
    let texture = new Cesium.Texture({
      context: context,
      width: img.width,
      height: img.height
    });
    texture.copyFrom(img);

    let stages = viewer.scene.postProcessStages;

    if (stages.length != 0) {
      stages.removeAll();
    }
    stages.add(
      new Cesium.PostProcessStage({
        fragmentShader: fragmentShaderSource,
        uniforms: {
          panorama: texture
        }
      })
    );
  };
};

let imagePath = "images/" + steinwegMetaJson[0].ImageName;

let addProjection = () => {
  let image = "images/" + steinwegMetaJson[0].ImageName;
  let camera = viewer.scene.camera;
  let canvas = viewer.scene.canvas;
  let stages = viewer.scene.postProcessStages;

  let heading = Cesium.Math.toRadians(steinwegMetaJson[0]["H-Sensor"]);
  let roll    = Cesium.Math.toRadians(steinwegMetaJson[0]["R-Sensor"]);
  let pitch   = Cesium.Math.toRadians(steinwegMetaJson[0]["P-Sensor"]);
  let orientation = { heading, roll, pitch };

  fetch("data/projectionShaderFS.glsl")
    .then(res => res.text())
    .then(shader => {
      viewer.scene.camera.flyTo({ destination: sampledPositions[0], orientation });
      if (stages.length != 0) {
        stages.removeAll();
      }
      stages.add(
        new Cesium.PostProcessStage({
          fragmentShader: shader,
          uniforms: {
            panorama: image,
            u_inverseView: camera.inverseViewMatrix,
            u_width: canvas.width,
            u_height: canvas.height
          }
        })
      );
    })
    .catch(err => console.error(err));
};

// add camera rotation
document.addEventListener('keydown', function(e) {
    setKey(e);
}, false);

function setKey(event) {
    let camera = viewer.scene.camera;

    if (event.keyCode === 39) {  // right arrow
        camera.rotateRight();
    } else if (event.keyCode === 37) {  // left arrow
        camera.rotateLeft();
    } else if (event.keyCode === 38) {  // up arrow
        camera.rotateUp();
    } else if (event.keyCode === 40) {  // down arrow
        camera.rotateDown();
    }
}

(function() {
  "use strict";

  ///////////////////
  // panellum panorama viewer

  let panoramaConfig = {
    type: "equirectangular",
    autoLoad: true,
    basePath: "images/"
  };

  // Cesium Ion
  Cesium.Ion.defaultAccessToken =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIzZmEzMjQwMi00MjQ0LTRmZjgtODhlOS0zNDI5ZmU3NGRkODQiLCJpZCI6MTQ5MywiaWF0IjoxNTI4NzE4Mzg0fQ.4h4xuSeZTaiBGtv4sHA7WN6D1eIedRHw-6rFls9QMsQ";

  //////////////////////////////////////////////////////////////////////////
  // Creating the Viewer
  //////////////////////////////////////////////////////////////////////////

  viewer = new Cesium.Viewer("cesiumContainer", {
    scene3DOnly: true,
    selectionIndicator: false,
    baseLayerPicker: false
  });

  //////////////////////////////////////////////////////////////////////////
  // Loading Imagery
  //////////////////////////////////////////////////////////////////////////

  // Remove default base layer
  viewer.imageryLayers.remove(viewer.imageryLayers.get(0));

  // Add Sentinel-2 imagery
  // viewer.imageryLayers.addImageryProvider(new Cesium.IonImageryProvider({ assetId: 3954 }));

  // Add Bing Maps
  viewer.imageryLayers.addImageryProvider(
    new Cesium.IonImageryProvider({ assetId: 4 })
  );

  //////////////////////////////////////////////////////////////////////////
  // Loading Terrain
  //////////////////////////////////////////////////////////////////////////

  // Load Cesium World Terrain
  viewer.terrainProvider = Cesium.createWorldTerrain({
    requestWaterMask: true, // required for water effects
    requestVertexNormals: true // required for terrain lighting
  });
  // Enable depth testing so things behind the terrain disappear.
  viewer.scene.globe.depthTestAgainstTerrain = true;

  //////////////////////////////////////////////////////////////////////////
  // Configuring the Scene
  //////////////////////////////////////////////////////////////////////////

  // Enable lighting based on sun/moon positions
  viewer.scene.globe.enableLighting = true;

  // Create an initial camera view
  // let initialPosition = Cesium.Cartesian3.fromDegrees(
  //   6.940606327909218,
  //   51.36193491538978,
  //   300
  // );
  let initialPosition = new Cesium.Cartesian3(
    3961538.873578816,
    482335.18245185615,
    4958890.174561147
  );
  let homeCameraView = {
    destination: initialPosition
  };
  // Set the initial view
  viewer.scene.camera.setView(homeCameraView);

  // Override the default home button
  viewer.homeButton.viewModel.command.beforeExecute.addEventListener(e => {
    e.cancel = true;
    viewer.scene.camera.flyTo(homeCameraView);
  });

  tileset = viewer.scene.primitives.add(
    new Cesium.Cesium3DTileset({
      modelMatrix: Cesium.Matrix4.fromTranslation(
        new Cesium.Cartesian3(30, 1, 40)
      ),
      url: "http://localhost:8080/data/pointcloud/tileset.json",
      skipLevelOfDetail: true,
      baseScreenSpaceError: 1024,
      skipScreenSpaceErrorFactor: 16,
      skipLevels: 1
    })
  );

  Cesium.when(
    viewer.terrainProvider.readyPromise,
    () => {
      let promise = Cesium.sampleTerrainMostDetailed(
        viewer.terrainProvider,
        positions
      );
      Cesium.when(promise, updatedPositions => {
        sampledPositions = _.map(updatedPositions, p => Cesium.Cartographic.toCartesian(p));
        console.log("positions loaded");
      });
      //     _.zip(
      //       _.map(updatedPositions, p => Cesium.Cartographic.toCartesian(p)),
      //       steinwegMetaJson
      //     ).forEach(pair => {
      //       let [pos, meta] = pair;
      //       pos.z += 1.5;
      //       viewer.entities.add({
      //         name: meta.ImageName,
      //         position: pos,
      //         ellipsoid: {
      //           radii: { x: 2, y: 2, z: 2 },
      //           material: Cesium.Color.GREEN
      //         },
      //         properties: {
      //           image: meta.ImageName
      //         }
      //       });
      //     });
      //   },
      //   console.error
      // );
    },
    console.error
  );

  let handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction(e => {
    let pickedPrimitive = viewer.scene.pick(e.position);
    let pickedEntity = Cesium.defined(pickedPrimitive)
      ? pickedPrimitive.id
      : undefined;

    // un-highlight the last picked entity
    if (Cesium.defined(lastPicked)) {
      lastPicked.ellipsoid.material = Cesium.Color.GREEN;
    }
    // Highlight the currently picked entity
    if (Cesium.defined(pickedEntity)) {
      // pickedEntity.ellipsoid.material = Cesium.Color.ORANGERED;
      let image = pickedEntity.properties.image.getValue();
      console.log("picked image: ", image);
      // if (panoramaViewer) {
      //   panoramaViewer.destroy();
      // }
      // panoramaViewer = pannellum.viewer("panorama", {
      //   panorama: image,
      //   ...panoramaConfig
      // });
      currentPanoramaImage = image;

      pickedEntity.ellipsoid.material = new Cesium.ImageMaterialProperty({
        image: "images/" + image,
        color: new Cesium.Color(1, 1, 1, 0.5)
      });
      lastPicked = pickedEntity;
      viewer.scene.camera.flyTo({ destination: pickedEntity.position._value });
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
})();
