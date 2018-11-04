var PanoramaViewportQuad = (function() {
  "use strict";

  const defaultValue = Cesium.defaultValue;
  const defined = Cesium.defined;
  const destroyObject = Cesium.destroyObject;
  const DeveloperError = Cesium.DeveloperError;
  const Pass = Cesium.Pass;
  const BlendingState = Cesium.BlendingState;

  /**
   * A viewport aligned quad.
   *
   * @alias PanoramaViewportQuad
   * @constructor
   *
   * @param {BoundingRectangle} [rectangle] The {@link BoundingRectangle} defining the quad's position within the viewport.
   * @param {Material} [material] The {@link Material} defining the surface appearance of the viewport quad.
   *
   * @example
   * var viewportQuad = new Cesium.PanoramaViewportQuad(new Cesium.BoundingRectangle(0, 0, 80, 40));
   * viewportQuad.material.uniforms.color = new Cesium.Color(1.0, 0.0, 0.0, 1.0);
   */
  function PanoramaViewportQuad(rectangle, material) {
    /**
     * Determines if the viewport quad primitive will be shown.
     *
     * @type {Boolean}
     * @default true
     */
    this.show = true;

    if (!defined(rectangle)) {
      rectangle = new Cesium.BoundingRectangle();
    }

    /**
     * The BoundingRectangle defining the quad's position within the viewport.
     *
     * @type {BoundingRectangle}
     *
     * @example
     * viewportQuad.rectangle = new Cesium.BoundingRectangle(0, 0, 80, 40);
     */
    this.rectangle = Cesium.BoundingRectangle.clone(rectangle);

    if (!defined(material)) {
      material = Cesium.Material.fromType(Cesium.Material.ColorType, {
        color: new Cesium.Color(1.0, 1.0, 1.0, 1.0)
      });
    }

    /**
     * The surface appearance of the viewport quad.  This can be one of several built-in {@link Material} objects or a custom material, scripted with
     * {@link https://github.com/AnalyticalGraphicsInc/cesium/wiki/Fabric|Fabric}.
     * <p>
     * The default material is <code>Material.ColorType</code>.
     * </p>
     *
     * @type Material
     *
     * @example
     * // 1. Change the color of the default material to yellow
     * viewportQuad.material.uniforms.color = new Cesium.Color(1.0, 1.0, 0.0, 1.0);
     *
     * // 2. Change material to horizontal stripes
     * viewportQuad.material = Cesium.Material.fromType(Cesium.Material.StripeType);
     *
     * @see {@link https://github.com/AnalyticalGraphicsInc/cesium/wiki/Fabric|Fabric}
     */
    this.material = material;
    this._material = undefined;

    this._overlayCommand = undefined;
    this._rs = undefined;
  }

  PanoramaViewportQuad.prototype._fsShaderSource = `
  varying vec2 v_textureCoordinates;
  varying vec4 v_glPosition;

  void main()
  {
      czm_materialInput materialInput;

      materialInput.s = v_textureCoordinates.s;
      materialInput.st = v_textureCoordinates;
      materialInput.str = vec3(v_textureCoordinates, 0.0);
      materialInput.normalEC = vec3(0.0, 0.0, -1.0);

      czm_material material = czm_getMaterial(materialInput);

      gl_FragColor = vec4(v_glPosition.xyz, 1.0); //vec4(material.diffuse + material.emission, material.alpha);
  }
`;

  PanoramaViewportQuad.prototype._vsShaderSource = `attribute vec4 position;
attribute vec2 textureCoordinates;

varying vec2 v_textureCoordinates;
varying vec4 v_glPosition;

void main()
{
    gl_Position = position;
    v_glPosition = position;
    v_textureCoordinates = textureCoordinates;
}
`;

  PanoramaViewportQuad.prototype.createViewportQuadCommand = function(
    context,
    fragmentShaderSource,
    overrides
  ) {
    const viewportQuadAttributeLocations = {
      position: 0,
      textureCoordinates: 1
    };
    overrides = defaultValue(overrides, defaultValue.EMPTY_OBJECT);

    return new Cesium.DrawCommand({
      vertexArray: context.getViewportQuadVertexArray(),
      primitiveType: Cesium.PrimitiveType.TRIANGLES,
      renderState: overrides.renderState,
      shaderProgram: Cesium.ShaderProgram.fromCache({
        context: context,
        vertexShaderSource: this._vsShaderSource,
        fragmentShaderSource: fragmentShaderSource,
        attributeLocations: viewportQuadAttributeLocations
      }),
      uniformMap: overrides.uniformMap,
      owner: overrides.owner,
      framebuffer: overrides.framebuffer,
      pass: overrides.pass
    });
  };

  /**
   * Called when {@link Viewer} or {@link CesiumWidget} render the scene to
   * get the draw commands needed to render this primitive.
   * <p>
   * Do not call this function directly.  This is documented just to
   * list the exceptions that may be propagated when the scene is rendered:
   * </p>
   *
   * @exception {DeveloperError} this.material must be defined.
   * @exception {DeveloperError} this.rectangle must be defined.
   */
  PanoramaViewportQuad.prototype.update = function(frameState) {
    if (!this.show) {
      return;
    }

    //>>includeStart('debug', pragmas.debug);
    if (!defined(this.material)) {
      throw new DeveloperError("this.material must be defined.");
    }
    if (!defined(this.rectangle)) {
      throw new DeveloperError("this.rectangle must be defined.");
    }
    //>>includeEnd('debug');

    var rs = this._rs;
    if (
      !defined(rs) ||
      !Cesium.BoundingRectangle.equals(rs.viewport, this.rectangle)
    ) {
      this._rs = Cesium.RenderState.fromCache({
        blending: BlendingState.ALPHA_BLEND,
        viewport: this.rectangle
      });
    }

    var pass = frameState.passes;
    if (pass.render) {
      var context = frameState.context;

      if (this._material !== this.material || !defined(this._overlayCommand)) {
        // Recompile shader when material changes
        this._material = this.material;

        if (defined(this._overlayCommand)) {
          this._overlayCommand.shaderProgram.destroy();
        }

        var fs = new Cesium.ShaderSource({
          sources: [this._material.shaderSource, this._fsShaderSource]
        });
        this._overlayCommand = this.createViewportQuadCommand(context, fs, {
          renderState: this._rs,
          uniformMap: this._material._uniforms,
          owner: this
        });
        this._overlayCommand.pass = Pass.OVERLAY;
      }

      this._material.update(context);

      this._overlayCommand.uniformMap = this._material._uniforms;
      frameState.commandList.push(this._overlayCommand);
    }
  };

  /**
   * Returns true if this object was destroyed; otherwise, false.
   * <br /><br />
   * If this object was destroyed, it should not be used; calling any function other than
   * <code>isDestroyed</code> will result in a {@link DeveloperError} exception.
   *
   * @returns {Boolean} True if this object was destroyed; otherwise, false.
   *
   * @see PanoramaViewportQuad#destroy
   */
  PanoramaViewportQuad.prototype.isDestroyed = function() {
    return false;
  };

  /**
   * Destroys the WebGL resources held by this object.  Destroying an object allows for deterministic
   * release of WebGL resources, instead of relying on the garbage collector to destroy this object.
   * <br /><br />
   * Once an object is destroyed, it should not be used; calling any function other than
   * <code>isDestroyed</code> will result in a {@link DeveloperError} exception.  Therefore,
   * assign the return value (<code>undefined</code>) to the object as done in the example.
   *
   * @exception {DeveloperError} This object was destroyed, i.e., destroy() was called.
   *
   *
   * @example
   * quad = quad && quad.destroy();
   *
   * @see PanoramaViewportQuad#isDestroyed
   */
  PanoramaViewportQuad.prototype.destroy = function() {
    if (defined(this._overlayCommand)) {
      this._overlayCommand.shaderProgram =
        this._overlayCommand.shaderProgram &&
        this._overlayCommand.shaderProgram.destroy();
    }
    return destroyObject(this);
  };

  return PanoramaViewportQuad;
})();
