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

let imagePath = "images/" + steinwegMetaJson[0].ImageName

let projectionFragShader = `
  uniform sampler2D colorTexture;
  uniform sampler2D panorama;
  uniform float u_width;
  uniform float u_height;
  uniform mat4 u_inverseViewProjection;
  varying vec2 v_textureCoordinates;

  void main(void)
  {
      vec2 vertex = gl_FragCoord.xy * vec2(u_width, u_height);
      vec4 ray = u_inverseViewProjection * vec4(gl_FragCoord.xy, 1.0, 1.0);

      vec3 stu = normalize(ray.xyz) * vec3(-1.0, 1.0, -1.0);

      float z = 1.0 - stu.z;
      float m = sqrt(stu.x * stu.x + stu.y * stu.y + z * z);
      vec2 uv = 0.5 + 0.5 * vec2(+stu.x, -stu.y) / m;

      vec4 color = texture2D(colorTexture, v_textureCoordinates);
      vec4 pano = texture2D(panorama, uv);
      gl_FragColor = mix(color, pano, 0.8);
  }
`;

let addProjection = image => {
  let camera = viewer.scene.camera;
  let canvas = viewer.scene.canvas;

  let stages = viewer.scene.postProcessStages;
  if (stages.length != 0) {
    stages.removeAll();
  }
  stages.add(
    new Cesium.PostProcessStage({
      fragmentShader: projectionFragShader,
      uniforms: {
        panorama: image,
        u_inverseViewProjection: camera.inverseViewMatrix,
        u_width: canvas.width,
        u_height: canvas.height
      }
    })
  );
};

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

  // Add some camera flight animation options
  homeCameraView.duration = 2.0;
  homeCameraView.maximumHeight = 2000;
  homeCameraView.pitchAdjustHeight = 2000;
  homeCameraView.endTransform = Cesium.Matrix4.IDENTITY;
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
      Cesium.when(
        promise,
        updatedPositions => {
          _.zip(
            _.map(updatedPositions, p => Cesium.Cartographic.toCartesian(p)),
            steinwegMetaJson
          ).forEach(pair => {
            let [pos, meta] = pair;
            pos.z += 1.5;
            viewer.entities.add({
              name: meta.ImageName,
              position: pos,
              ellipsoid: {
                radii: { x: 2, y: 2, z: 2 },
                material: Cesium.Color.GREEN
              },
              properties: {
                image: meta.ImageName
              }
            });
          });
        },
        console.error
      );
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

      pickedEntity.ellipsoid.material = "images/" + image;
      // pickedEntity.ellipsoid.material =
      //   "images/" + pickedEntity.properties.image.getValue();
      // panoramaViewer.on("load", e => {
      //   pickedEntity.ellipsoid.material =
      //     panoramaViewer.getRenderer().getCanvas().toDataURL();
      // });
      lastPicked = pickedEntity;

      const size = 50;

      viewer.entities.add({
        name: image,
        position: viewer.scene.camera.position,
        ellipsoid: {
          radii: { x: size, y: size, z: size },
          material: "images/" + image
        }
      });
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
})();
